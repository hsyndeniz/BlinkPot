//! LiteSVM integration tests for the lottery program.
//!
//! These tests load the compiled `lottery.so` binary into a LiteSVM instance and
//! exercise the post-reveal claim path. The Switchboard reveal path is bypassed by
//! writing the Round account directly into Claimable state with synthesized winning
//! numbers and pre-computed `per_combo_payout` — slot/randomness validation is covered
//! by unit tests in `instructions/draw.rs`, and the per-combo math is covered in
//! `math.rs`. These tests focus on the on-chain wiring: PickCounter creation/increment
//! at buy time and the divide-by-counter behavior at claim time.
//!
//! ## Running
//! 1. `cd anchor && anchor build` (or `cargo build-sbf -p lottery`) to refresh
//!    `target/deploy/lottery.so` against the current source.
//! 2. `cargo test -p lottery --test integration -- --nocapture`
//!
//! ## What's covered
//! - **happy_path_claim**: full lifecycle for one winner — claim works immediately
//!   after settle without any registration / finalize step.
//! - **duplicate_jackpot_winners_split_evenly**: C1 adversarial — two players pick
//!   the same winning combo. Each receives `per_combo_payout / 2`, total never
//!   exceeds the per-combo allocation.
//! - **claim_long_after_settle_works**: claims work an arbitrarily long time after
//!   the round settles. No window. No deadline. No keeper.

use anchor_lang::{AccountDeserialize, AccountSerialize, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use litesvm_token::{CreateAssociatedTokenAccount, CreateMint, MintTo};
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
    transaction::Transaction,
};

use lottery::{
    constants::*,
    math::{compute_per_combo_payouts, tier_combos_table},
    state::{
        buyer_entry::BuyerEntry,
        config::{ConfigParams, RoundCounter, UntakenTierDestination},
        round::{Round, RoundState},
        ticket::{Ticket, TicketPick},
    },
    ID as LOTTERY_ID,
};

const PAYMENT_DECIMALS: u8 = 6;

fn fresh_svm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    let so_path = format!(
        "{}/../../target/deploy/lottery.so",
        env!("CARGO_MANIFEST_DIR")
    );
    let bytes = std::fs::read(&so_path).unwrap_or_else(|_| {
        panic!(
            "lottery.so not found at {so_path}. Run `anchor build` (or `cargo build-sbf -p lottery`) first."
        )
    });
    let _ = svm.add_program(LOTTERY_ID, &bytes);
    svm
}

fn airdrop(svm: &mut LiteSVM, who: &Pubkey, lamports: u64) {
    svm.airdrop(who, lamports).unwrap();
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ixs: &[Instruction], extra_signers: &[&Keypair]) {
    let blockhash = svm.latest_blockhash();
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra_signers);
    let tx = Transaction::new_signed_with_payer(ixs, Some(&payer.pubkey()), &signers, blockhash);
    svm.send_transaction(tx).unwrap_or_else(|e| {
        panic!("transaction failed: {e:?}");
    });
}

fn pda(seeds: &[&[u8]]) -> (Pubkey, u8) {
    Pubkey::find_program_address(seeds, &LOTTERY_ID)
}

fn fetch<T: AccountDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let acct = svm.get_account(key).expect("account exists");
    T::try_deserialize(&mut acct.data.as_slice()).expect("deserialize")
}

fn default_params() -> ConfigParams {
    ConfigParams {
        default_ticket_price: 1_000_000,
        default_round_duration_secs: MIN_ROUND_DURATION_SECS,
        guaranteed_prize_pool: 0,
        max_guarantee_per_round_bps: 3_000,
        draw_timeout_slots: 10,
        normal_ball_max: 30,
        bonusball_max: 15,
        lp_edge_bps: 2_000,
        referral_fee_first_bps: 800,
        referral_fee_second_bps: 200,
        referral_win_share_first_bps: 800,
        referral_win_share_second_bps: 200,
        lp_pool_cap: 0,
        tier_premium_weight_bps: DEFAULT_TIER_PREMIUM_WEIGHT_BPS,
        tier_min_payout_per_winner: [0u64; TIER_COUNT],
        tier_is_winning: DEFAULT_TIER_IS_WINNING,
        premium_min_allocation_bps: 2_000,
        untaken_tier_destination: UntakenTierDestination::NextRound,
        dynamic_bonusball_enabled: false,
        bonusball_base: 5,
        bonusball_pool_step_units: 10_000_000_000,
    }
}

struct Ctx {
    svm: LiteSVM,
    admin: Keypair,
    payment_mint: Pubkey,
    config: Pubkey,
    round_counter: Pubkey,
    lp_vault: Pubkey,
    prize_vault: Pubkey,
    prize_vault_authority: Pubkey,
    lp_principal: Pubkey,
    lp_authority: Pubkey,
}

fn setup() -> Ctx {
    let mut svm = fresh_svm();
    let admin = Keypair::new();
    airdrop(&mut svm, &admin.pubkey(), 100_000_000_000);

    let payment_mint = CreateMint::new(&mut svm, &admin)
        .decimals(PAYMENT_DECIMALS)
        .send()
        .unwrap();

    let (config, _) = pda(&[CONFIG_SEED]);
    let (round_counter, _) = pda(&[ROUND_COUNTER_SEED]);
    let (lp_vault, _) = pda(&[LP_VAULT_SEED]);
    let (prize_vault_authority, _) = pda(&[PRIZE_VAULT_AUTHORITY_SEED]);
    let (lp_authority, _) = pda(&[LP_AUTHORITY_SEED]);
    let (prize_vault, _) = pda(&[PRIZE_VAULT_TOKEN_SEED, payment_mint.as_ref()]);
    let (lp_principal, _) = pda(&[LP_PRINCIPAL_TOKEN_SEED, payment_mint.as_ref()]);

    let ix_data = lottery::instruction::InitializeConfig {
        params: default_params(),
    }
    .data();
    let metas = lottery::accounts::InitializeConfig {
        admin: admin.pubkey(),
        payment_mint,
        config,
        round_counter,
        lp_vault,
        prize_vault_authority,
        prize_vault,
        lp_authority,
        lp_principal,
        token_program: anchor_spl::token::ID,
        system_program: system_program::ID,
        rent: solana_sdk::sysvar::rent::ID,
    }
    .to_account_metas(None);
    let ix = Instruction {
        program_id: LOTTERY_ID,
        accounts: metas,
        data: ix_data,
    };
    send(&mut svm, &admin, &[ix], &[]);

    Ctx {
        svm,
        admin,
        payment_mint,
        config,
        round_counter,
        lp_vault,
        prize_vault,
        prize_vault_authority,
        lp_principal,
        lp_authority,
    }
}

fn fund_buyer(ctx: &mut Ctx, buyer: &Keypair, usdc_amount: u64) -> Pubkey {
    airdrop(&mut ctx.svm, &buyer.pubkey(), 100_000_000_000);
    let ata = CreateAssociatedTokenAccount::new(&mut ctx.svm, buyer, &ctx.payment_mint)
        .send()
        .unwrap();
    MintTo::new(
        &mut ctx.svm,
        &ctx.admin,
        &ctx.payment_mint,
        &ata,
        usdc_amount,
    )
    .send()
    .unwrap();
    ata
}

fn start_round(ctx: &mut Ctx) -> (Pubkey, u64) {
    let counter: RoundCounter = fetch(&ctx.svm, &ctx.round_counter);
    let next_id = counter.current_round_id + 1;
    let (round_pda, _) = pda(&[ROUND_SEED, &next_id.to_le_bytes()]);

    let previous_round = if counter.current_round_id == 0 {
        system_program::ID
    } else {
        pda(&[ROUND_SEED, &counter.current_round_id.to_le_bytes()]).0
    };

    let ix_data = lottery::instruction::StartRound {
        ticket_price: 1_000_000,
        duration_seconds: 60,
        bonusball_max: 15,
        guaranteed_prize_pool_override: 0,
    }
    .data();
    let metas = lottery::accounts::StartRound {
        starter: ctx.admin.pubkey(),
        config: ctx.config,
        round_counter: ctx.round_counter,
        previous_round,
        round: round_pda,
        lp_vault: ctx.lp_vault,
        payment_mint: ctx.payment_mint,
        prize_vault_authority: ctx.prize_vault_authority,
        prize_vault: ctx.prize_vault,
        lp_authority: ctx.lp_authority,
        lp_principal: ctx.lp_principal,
        token_program: anchor_spl::token::ID,
        system_program: system_program::ID,
    }
    .to_account_metas(None);
    let ix = Instruction {
        program_id: LOTTERY_ID,
        accounts: metas,
        data: ix_data,
    };
    let admin_clone = ctx.admin.insecure_clone();
    send(&mut ctx.svm, &admin_clone, &[ix], &[]);
    (round_pda, next_id)
}

fn pick_counter_pda(round_id: u64, pick: &TicketPick) -> Pubkey {
    let bonus = [pick.bonusball];
    pda(&[
        PICK_COUNTER_SEED,
        &round_id.to_le_bytes(),
        &pick.normals,
        &bonus,
    ])
    .0
}

/// `picks` may include duplicates — only unique picks need to be passed as PickCounter
/// PDAs in remaining_accounts (one per ticket position; same PDA can appear twice).
fn buy_tickets(
    ctx: &mut Ctx,
    buyer: &Keypair,
    buyer_ata: Pubkey,
    round: Pubkey,
    round_id: u64,
    picks: Vec<TicketPick>,
) -> Vec<Pubkey> {
    let (buyer_entry, _) = pda(&[
        BUYER_ENTRY_SEED,
        &round_id.to_le_bytes(),
        buyer.pubkey().as_ref(),
    ]);

    let first_index = if ctx.svm.get_account(&buyer_entry).is_some() {
        let be: BuyerEntry = fetch(&ctx.svm, &buyer_entry);
        be.ticket_count
    } else {
        0
    };

    let mut ticket_pdas = Vec::with_capacity(picks.len());
    for i in 0..picks.len() {
        let idx = first_index + i as u64;
        let (t, _) = pda(&[
            TICKET_SEED,
            &round_id.to_le_bytes(),
            buyer.pubkey().as_ref(),
            &idx.to_le_bytes(),
        ]);
        ticket_pdas.push(t);
    }

    let pick_counter_pdas: Vec<Pubkey> = picks
        .iter()
        .map(|p| pick_counter_pda(round_id, p))
        .collect();

    let ix_data = lottery::instruction::BuyTickets {
        picks: picks.clone(),
        referrer: None,
    }
    .data();
    let mut metas = lottery::accounts::BuyTickets {
        buyer: buyer.pubkey(),
        config: ctx.config,
        round,
        payment_mint: ctx.payment_mint,
        buyer_token_account: buyer_ata,
        prize_vault: ctx.prize_vault,
        prize_vault_authority: ctx.prize_vault_authority,
        lp_vault: ctx.lp_vault,
        lp_authority: ctx.lp_authority,
        lp_principal: ctx.lp_principal,
        buyer_entry,
        referrer_account: None,
        parent_referrer_account: None,
        token_program: anchor_spl::token::ID,
        system_program: system_program::ID,
        rent: solana_sdk::sysvar::rent::ID,
    }
    .to_account_metas(None);
    for t in &ticket_pdas {
        metas.push(solana_sdk::instruction::AccountMeta::new(*t, false));
    }
    for pc in &pick_counter_pdas {
        metas.push(solana_sdk::instruction::AccountMeta::new(*pc, false));
    }

    let ix = Instruction {
        program_id: LOTTERY_ID,
        accounts: metas,
        data: ix_data,
    };
    send(&mut ctx.svm, buyer, &[ix], &[]);
    ticket_pdas
}

/// Force `round` into Claimable state with the given winning numbers and pre-computed
/// per-combo payouts, bypassing the Switchboard reveal path.
fn force_claimable(ctx: &mut Ctx, round_pda: Pubkey, winning_normals: [u8; 5], winning_bonus: u8) {
    let mut round: Round = fetch(&ctx.svm, &round_pda);
    let plan = compute_per_combo_payouts(
        round.prize_pool,
        round.normal_ball_max,
        round.bonusball_max,
        &round.tier_is_winning,
        &DEFAULT_TIER_PREMIUM_WEIGHT_BPS,
        &[0u64; TIER_COUNT],
        2_000,
    )
    .unwrap();
    round.state = RoundState::Claimable;
    round.winning_normals = winning_normals;
    round.winning_bonusball = winning_bonus;
    let now = ctx
        .svm
        .get_sysvar::<solana_sdk::clock::Clock>()
        .unix_timestamp;
    round.settled_at = now;
    round.per_combo_payout = plan.per_combo_payout;
    round.used_minimum_payouts = plan.used_minimum_payouts;
    write_round(ctx, round_pda, &round);
}

fn write_round(ctx: &mut Ctx, round_pda: Pubkey, round: &Round) {
    let mut acct = ctx.svm.get_account(&round_pda).expect("round exists");
    let original_len = acct.data.len();
    let mut data: Vec<u8> = Vec::with_capacity(original_len);
    round.try_serialize(&mut data).expect("serialize round");
    if data.len() < original_len {
        data.resize(original_len, 0);
    }
    acct.data = data;
    ctx.svm.set_account(round_pda, acct).unwrap();
}

fn claim(ctx: &mut Ctx, owner: &Keypair, owner_ata: Pubkey, round: Pubkey, ticket: Pubkey) {
    let t: Ticket = fetch(&ctx.svm, &ticket);
    let pick = TicketPick {
        normals: t.normals,
        bonusball: t.bonusball,
    };
    let pick_counter = pick_counter_pda(t.round_id, &pick);

    let ix_data = lottery::instruction::ClaimWinnings {}.data();
    let metas = lottery::accounts::ClaimWinnings {
        owner: owner.pubkey(),
        config: ctx.config,
        round,
        ticket,
        pick_counter,
        payment_mint: ctx.payment_mint,
        prize_vault: ctx.prize_vault,
        prize_vault_authority: ctx.prize_vault_authority,
        winner_token_account: owner_ata,
        referrer_account: None,
        parent_referrer_account: None,
        // Trophy mint is gated by `config.trophy_collection != Pubkey::default()`,
        // so this test path (which never runs `init_trophy_collection`) leaves
        // them all None and skips the CPI.
        trophy_asset: None,
        trophy_collection_account: None,
        mpl_core_program: None,
        token_program: anchor_spl::token::ID,
        system_program: anchor_lang::system_program::ID,
    }
    .to_account_metas(None);
    let ix = Instruction {
        program_id: LOTTERY_ID,
        accounts: metas,
        data: ix_data,
    };
    send(&mut ctx.svm, owner, &[ix], &[]);
}

fn ata_balance(ctx: &Ctx, ata: &Pubkey) -> u64 {
    let acct = ctx.svm.get_account(ata).expect("ata");
    let parsed = spl_token::state::Account::unpack(&acct.data).unwrap();
    parsed.amount
}

// ---------- TESTS ----------

#[test]
fn happy_path_claim() {
    let mut ctx = setup();
    let buyer = Keypair::new();
    let buyer_ata = fund_buyer(&mut ctx, &buyer, 10_000_000);

    let (round_pda, round_id) = start_round(&mut ctx);

    let pick = TicketPick {
        normals: [1, 2, 3, 4, 5],
        bonusball: 7,
    };
    let tickets = buy_tickets(&mut ctx, &buyer, buyer_ata, round_pda, round_id, vec![pick]);

    // PickCounter should exist with count = 1.
    let pc_pda = pick_counter_pda(round_id, &pick);
    let pc: lottery::state::pick_counter::PickCounter = fetch(&ctx.svm, &pc_pda);
    assert_eq!(pc.count, 1);
    assert!(pc.initialized);
    assert_eq!(pc.normals, pick.normals);
    assert_eq!(pc.bonusball, pick.bonusball);

    force_claimable(&mut ctx, round_pda, [1, 2, 3, 4, 5], 7);

    let r: Round = fetch(&ctx.svm, &round_pda);
    let combos = tier_combos_table(r.normal_ball_max, r.bonusball_max);
    // Prize pool: 1 USDC ticket - 20% LP edge = 0.8 USDC. Jackpot weight 4000 bps,
    // combos=1, so per_combo_payout = (0.8 USDC * 0.40) / 1 = 0.32 USDC.
    let expected_per_combo = (800_000u64 * 4_000 / 10_000) / combos[11];
    assert_eq!(r.per_combo_payout[11], expected_per_combo);

    let before = ata_balance(&ctx, &buyer_ata);
    claim(&mut ctx, &buyer, buyer_ata, round_pda, tickets[0]);
    let after = ata_balance(&ctx, &buyer_ata);

    // counter = 1 → buyer receives the full per-combo payout.
    assert_eq!(after - before, expected_per_combo);

    let t: Ticket = fetch(&ctx.svm, &tickets[0]);
    assert!(t.claimed);
}

#[test]
fn duplicate_jackpot_winners_split_evenly() {
    // C1 adversarial: two players pick the same winning combo. Each must receive
    // per_combo_payout / 2, never the full per-combo amount.
    let mut ctx = setup();
    let alice = Keypair::new();
    let bob = Keypair::new();
    let alice_ata = fund_buyer(&mut ctx, &alice, 10_000_000);
    let bob_ata = fund_buyer(&mut ctx, &bob, 10_000_000);

    let (round_pda, round_id) = start_round(&mut ctx);

    let pick = TicketPick {
        normals: [1, 2, 3, 4, 5],
        bonusball: 7,
    };
    let alice_tickets = buy_tickets(&mut ctx, &alice, alice_ata, round_pda, round_id, vec![pick]);
    let bob_tickets = buy_tickets(&mut ctx, &bob, bob_ata, round_pda, round_id, vec![pick]);

    // After both buys, the shared PickCounter should read count = 2.
    let pc_pda = pick_counter_pda(round_id, &pick);
    let pc: lottery::state::pick_counter::PickCounter = fetch(&ctx.svm, &pc_pda);
    assert_eq!(pc.count, 2);

    force_claimable(&mut ctx, round_pda, [1, 2, 3, 4, 5], 7);

    let r: Round = fetch(&ctx.svm, &round_pda);
    // Prize pool = 2 * 0.8 USDC = 1.6 USDC. Jackpot premium = 40% = 0.64 USDC.
    // combos[11] = 1, so per_combo_payout = 0.64 USDC. Two duplicate winners → each
    // receives 0.64 / 2 = 0.32 USDC.
    let expected_per_combo = 1_600_000u64 * 4_000 / 10_000;
    assert_eq!(r.per_combo_payout[11], expected_per_combo);
    let expected_per_winner = expected_per_combo / 2;

    let alice_before = ata_balance(&ctx, &alice_ata);
    let bob_before = ata_balance(&ctx, &bob_ata);
    claim(&mut ctx, &alice, alice_ata, round_pda, alice_tickets[0]);
    claim(&mut ctx, &bob, bob_ata, round_pda, bob_tickets[0]);
    let alice_after = ata_balance(&ctx, &alice_ata);
    let bob_after = ata_balance(&ctx, &bob_ata);

    assert_eq!(alice_after - alice_before, expected_per_winner);
    assert_eq!(bob_after - bob_before, expected_per_winner);

    // Total paid never exceeds the per-combo allocation. Without the C1 fix, each
    // would have received the full per-combo amount and total would be 2x.
    let total_paid = (alice_after - alice_before) + (bob_after - bob_before);
    assert_eq!(total_paid, expected_per_combo);
    assert!(
        total_paid <= r.prize_pool,
        "must never overdraw the prize pool"
    );
}

#[test]
fn claim_long_after_settle_works() {
    // The whole point of the pick-counter design: there is no claim deadline. Even
    // arbitrarily long after settle, a winner can still claim.
    let mut ctx = setup();
    let buyer = Keypair::new();
    let buyer_ata = fund_buyer(&mut ctx, &buyer, 10_000_000);

    let (round_pda, round_id) = start_round(&mut ctx);

    let pick = TicketPick {
        normals: [1, 2, 3, 4, 5],
        bonusball: 7,
    };
    let tickets = buy_tickets(&mut ctx, &buyer, buyer_ata, round_pda, round_id, vec![pick]);

    force_claimable(&mut ctx, round_pda, [1, 2, 3, 4, 5], 7);

    // Advance the clock by 90 days. In the previous design this would have closed
    // the registration window and locked out the user. With per-combo + PickCounter,
    // claim is always callable as long as the round is Claimable.
    let mut clock = ctx.svm.get_sysvar::<solana_sdk::clock::Clock>();
    clock.unix_timestamp = clock.unix_timestamp + 90 * 24 * 60 * 60;
    clock.slot += 90 * 24 * 60 * 60 / 2; // ~2 slots/sec
    ctx.svm.set_sysvar(&clock);

    let before = ata_balance(&ctx, &buyer_ata);
    claim(&mut ctx, &buyer, buyer_ata, round_pda, tickets[0]);
    let after = ata_balance(&ctx, &buyer_ata);
    assert!(after > before, "winner can claim 90 days after settle");

    let t: Ticket = fetch(&ctx.svm, &tickets[0]);
    assert!(t.claimed);
}

// ---------- M3 helpers ----------

fn lp_deposit(ctx: &mut Ctx, lp: &Keypair, lp_ata: Pubkey, amount: u64) {
    let (position, _) = pda(&[LP_POSITION_SEED, lp.pubkey().as_ref()]);
    let ix_data = lottery::instruction::LpDeposit { amount }.data();
    let metas = lottery::accounts::LpDeposit {
        owner: lp.pubkey(),
        config: ctx.config,
        lp_vault: ctx.lp_vault,
        position,
        payment_mint: ctx.payment_mint,
        owner_token_account: lp_ata,
        lp_principal: ctx.lp_principal,
        lp_authority: ctx.lp_authority,
        token_program: anchor_spl::token::ID,
        system_program: system_program::ID,
        rent: solana_sdk::sysvar::rent::ID,
    }
    .to_account_metas(None);
    let ix = Instruction {
        program_id: LOTTERY_ID,
        accounts: metas,
        data: ix_data,
    };
    send(&mut ctx.svm, lp, &[ix], &[]);
}

fn start_round_with_guarantee(ctx: &mut Ctx, guarantee: u64) -> (Pubkey, u64) {
    let counter: RoundCounter = fetch(&ctx.svm, &ctx.round_counter);
    let next_id = counter.current_round_id + 1;
    let (round_pda, _) = pda(&[ROUND_SEED, &next_id.to_le_bytes()]);

    let previous_round = if counter.current_round_id == 0 {
        system_program::ID
    } else {
        pda(&[ROUND_SEED, &counter.current_round_id.to_le_bytes()]).0
    };

    let ix_data = lottery::instruction::StartRound {
        ticket_price: 1_000_000,
        duration_seconds: 60,
        bonusball_max: 15,
        guaranteed_prize_pool_override: guarantee,
    }
    .data();
    let metas = lottery::accounts::StartRound {
        starter: ctx.admin.pubkey(),
        config: ctx.config,
        round_counter: ctx.round_counter,
        previous_round,
        round: round_pda,
        lp_vault: ctx.lp_vault,
        payment_mint: ctx.payment_mint,
        prize_vault_authority: ctx.prize_vault_authority,
        prize_vault: ctx.prize_vault,
        lp_authority: ctx.lp_authority,
        lp_principal: ctx.lp_principal,
        token_program: anchor_spl::token::ID,
        system_program: system_program::ID,
    }
    .to_account_metas(None);
    let ix = Instruction {
        program_id: LOTTERY_ID,
        accounts: metas,
        data: ix_data,
    };
    let admin_clone = ctx.admin.insecure_clone();
    send(&mut ctx.svm, &admin_clone, &[ix], &[]);
    (round_pda, next_id)
}

fn enter_round_emergency(ctx: &mut Ctx, round: Pubkey) {
    let ix_data = lottery::instruction::EnterRoundEmergency {}.data();
    let metas = lottery::accounts::EnterRoundEmergency {
        admin: ctx.admin.pubkey(),
        config: ctx.config,
        round,
        payment_mint: ctx.payment_mint,
        prize_vault: ctx.prize_vault,
        prize_vault_authority: ctx.prize_vault_authority,
        lp_principal: ctx.lp_principal,
        lp_authority: ctx.lp_authority,
        token_program: anchor_spl::token::ID,
    }
    .to_account_metas(None);
    let ix = Instruction {
        program_id: LOTTERY_ID,
        accounts: metas,
        data: ix_data,
    };
    let admin_clone = ctx.admin.insecure_clone();
    send(&mut ctx.svm, &admin_clone, &[ix], &[]);
}

#[test]
fn emergency_returns_lp_guarantee_to_lp_principal() {
    // M3 regression: when a round goes into Emergency before settle, the LP guarantee
    // that was committed to prize_vault at start_round must flow back to lp_principal.
    // Otherwise the funds are stranded in prize_vault while lp_vault.total_assets still
    // claims them, and emergency_lp_withdraw pays LPs against an inflated NAV.
    let mut ctx = setup();

    // LP funds the pool.
    let lp = Keypair::new();
    let lp_ata = fund_buyer(&mut ctx, &lp, 100_000_000);
    lp_deposit(&mut ctx, &lp, lp_ata, 100_000_000); // 100 USDC

    let principal_before = ata_balance(&ctx, &ctx.lp_principal);
    let prize_vault_before = ata_balance(&ctx, &ctx.prize_vault);
    assert_eq!(principal_before, 100_000_000);
    assert_eq!(prize_vault_before, 0);

    // Start a round with a 10 USDC guarantee — moves 10 USDC from lp_principal → prize_vault.
    let guarantee = 10_000_000u64;
    let (round_pda, _) = start_round_with_guarantee(&mut ctx, guarantee);

    let principal_after_start = ata_balance(&ctx, &ctx.lp_principal);
    let prize_vault_after_start = ata_balance(&ctx, &ctx.prize_vault);
    assert_eq!(principal_after_start, 100_000_000 - guarantee);
    assert_eq!(prize_vault_after_start, guarantee);

    let r: Round = fetch(&ctx.svm, &round_pda);
    assert_eq!(r.lp_guarantee_reserved, guarantee);

    // Declare emergency. Before this fix the guarantee stayed in prize_vault forever;
    // now it must flow back to lp_principal and `lp_guarantee_reserved` should be zeroed.
    enter_round_emergency(&mut ctx, round_pda);

    let principal_after_emergency = ata_balance(&ctx, &ctx.lp_principal);
    let prize_vault_after_emergency = ata_balance(&ctx, &ctx.prize_vault);
    assert_eq!(
        principal_after_emergency, 100_000_000,
        "LP guarantee must be fully restored to lp_principal"
    );
    assert_eq!(
        prize_vault_after_emergency, 0,
        "prize_vault must not retain the guarantee after emergency"
    );

    let r: Round = fetch(&ctx.svm, &round_pda);
    assert_eq!(r.lp_guarantee_reserved, 0);
    assert!(matches!(r.state, RoundState::Emergency));

    // LpVault.total_assets is unchanged across the round (it never decremented when the
    // guarantee was reserved). LP NAV is now correctly backed by lp_principal again.
    let v: LpVault = fetch(&ctx.svm, &ctx.lp_vault);
    assert_eq!(v.total_assets, 100_000_000);
}

// solana_sdk re-exports for the spl_token Account::unpack call in ata_balance.
use anchor_spl::token::spl_token;
use lottery::state::lp::LpVault;
use solana_sdk::program_pack::Pack;
