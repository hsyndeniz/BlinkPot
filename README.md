# BlinkPot

**Verifiable jackpots. On-chain forever.**

BlinkPot is a fully on-chain daily lottery on Solana. Every ticket sale, draw, payout, and fee split runs inside an Anchor program; randomness is sourced from Switchboard On-Demand VRF; settlement is in stablecoins (mint-agnostic SPL Token); and every winning claim mints a **permanently soulbound Metaplex Core trophy NFT** directly into the winner's wallet.

- Domain: **[blinkpot.io](https://blinkpot.io)**
- Program ID: `3adopav8gXebmZ7SgUaTYXE77MzdctQiMAkU5xF1zenk`
- Anchor `0.32.1` · Solana `mainnet` / `devnet` (compile-time gated) · Next.js 16 · React 19

---

## Why BlinkPot

Online lotteries are run almost entirely by opaque operators. Players cannot verify draws, prize-pool solvency, or fee splits; affiliates depend on the house to pay them; jackpots are walled inside individual brands.

BlinkPot inverts that model:

- **Trust-minimised draws** — Switchboard On-Demand commit/reveal with strict seed-slot validation. The randomness account is verified at the program-ID level (devnet vs. mainnet) so a binary built for one network cannot be tricked by an account from the other.
- **Solvent by construction** — every cent of every prize pool sits in a program-owned PDA token account. Winners are paid by the program; no operator signature, no off-chain settlement.
- **Programmatic, two-tier referrals** — first- and second-order referrers earn instant accruals on every ticket purchase and on every win share, claimable any time.
- **LP-backed guaranteed minimums** — liquidity providers underwrite a configurable per-round guarantee in exchange for a share of the house edge.
- **Soulbound proof-of-win** — every winning claim CPIs into MPL Core to mint a frozen-forever trophy into the `Megapot Winners` collection. Winners carry their history in their wallet; the protocol gets a permanent on-chain hall of fame.

---

## How a round works

```
                    ┌──────────────┐
                    │ start_round  │  admin/keeper picks ticket_price + duration
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │     OPEN     │  players: buy_tickets() / subscribe_daily()
                    └──────┬───────┘
                           │  draw_time reached
                           ▼
                    ┌──────────────┐  Switchboard randomness account locked
                    │ commit_draw  │  seed_slot = clock.slot − 1 (strict equality)
                    └──────┬───────┘
                           │  reveal_slot becomes available
                           ▼
                    ┌──────────────┐  per-tier per-combo payouts computed
                    │ reveal_draw  │  guaranteed minimums applied if affordable
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐  winners claim → payout + soulbound trophy
                    │  CLAIMABLE   │  losing tickets rent-rebated via PDA close
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐  unclaimed pool rolls to next round or LP
                    │ archive_round│
                    └──────────────┘
```

### Anti-over-draw: the `PickCounter` mechanism

If two tickets share the same winning pick, the prize for that pick must split between them — not pay both in full. BlinkPot enforces this on-chain via a `PickCounter` PDA seeded by `(round_id, normals, bonusball)`:

- Created on first buy of a pick, incremented on each subsequent buy of the same pick.
- At claim time, the per-combo payout is divided by `pick_counter.count`. Duplicate winners split that pick's allocation exactly.
- No off-chain accounting, no operator trust.

### 12-tier prize structure

The prize pool is split across 12 tiers (`tier_index = matches × 2 + has_bonus`). Defaults concentrate 40% at the jackpot tier (5 normals + bonus) and pay down through 1+bonus. All weights, "is winning" flags, and per-tier guaranteed minimums are configurable through `update_config`.

```
tier 11 (5+B)  40%   ← jackpot
tier 10 (5)    6%
tier  9 (4+B)  6%
tier  8 (4)    6%
tier  7 (3+B)  6%
tier  6 (3)   12%
tier  5 (2+B) 12%
tier  3 (1+B) 12%
tier  1 (B)    0% premium, guaranteed-minimum only
```

---

## Features

### Players

- **Pick-your-numbers tickets** (5 normals + 1 bonusball), with on-chain pick validation.
- **Daily subscriptions** — pre-fund N days × M tickets per day into a per-user escrow PDA; a keeper drives `process_subscription` each round.
- **Cancel anytime** — unused subscription days are refunded from escrow.
- **Soulbound winner trophies** minted directly into the winner's wallet on `claim_winnings`. Queryable via standard RPC (no DAS dependency).

### Liquidity providers

- **Share-accounted vault** (`u128` shares, fixed `SHARE_SCALE` precision) — compounding LP edge across rounds.
- **Per-round guarantee reservation** — admin can set `guaranteed_prize_pool_override` at `start_round`, capped by `MAX_GUARANTEE_PER_ROUND_BPS_CAP` (50% of NAV).
- **Two-step withdrawal** — `initiate_withdraw` snapshots shares against current round; `finalize_withdraw` settles after the round ends so an LP can't pull liquidity mid-draw.

### Affiliates

- **Two-tier referral graph** — `Referral` PDAs link a referrer to a parent. Self-parenting is rejected; the parent's PDA must exist.
- **Dual revenue** — first/second-order BPS of every ticket sale + first/second-order BPS of every win share, accrued atomically.

### Operators

- **Pausable** + **emergency mode** — admin can freeze the program; emergency mode unlocks per-ticket refunds and emergency LP withdrawals (after a `EMERGENCY_TIMEOUT_SECS` cooling window).
- **Round-level emergency** — a stuck draw (Switchboard timeout) can be moved to per-ticket refund mode without touching unrelated rounds.

---

## Stack

| Layer | Tech |
|---|---|
| Program | Anchor 0.32.1 (Rust), `anchor-spl`, `mpl-core` 0.11.2, `switchboard-on-demand` 0.12.1 |
| Randomness | Switchboard On-Demand VRF, program-ID gated at compile time |
| NFTs | Metaplex Core soulbound collection (`PermanentFreezeDelegate { authority: None }`) |
| Settlement | SPL Token, mint-agnostic (`transfer_checked`); decimals pinned at init |
| Client codegen | Codama (`@codama/nodes-from-anchor`, `@codama/renderers-js`) |
| Solana client | `@solana/kit` 6.3, `@solana/signers`, `@solana/wallet-standard-features` |
| Wallet | `@wallet-standard/*` auto-discovery, dropdown UI |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind v4, HeroUI v3, SWR, Sonner |
| Hosting | OpenNext on Cloudflare Workers (Wrangler) |
| Tests | LiteSVM (`litesvm`, `litesvm-token`), Anchor test |

---

## Repo layout

```
.
├── anchor/
│   └── programs/lottery/
│       ├── src/
│       │   ├── lib.rs                 # program entrypoints
│       │   ├── constants.rs           # tier weights, seeds, BPS denom, etc.
│       │   ├── math.rs                # tier math, share math, dynamic bonusball
│       │   ├── state/                 # Config, Round, Ticket, LpVault, Subscription, …
│       │   └── instructions/
│       │       ├── admin.rs           # initialize/update config, pause, emergency
│       │       ├── round.rs           # start_round, archive_round
│       │       ├── ticket.rs          # buy_tickets + PickCounter upsert
│       │       ├── draw.rs            # commit_draw / reveal_draw (Switchboard)
│       │       ├── claim.rs           # claim_winnings + trophy CPI
│       │       ├── trophy.rs          # init_trophy_collection (MPL Core)
│       │       ├── lp.rs              # deposit / initiate / finalize withdraw
│       │       ├── referral.rs        # init referral, claim referral fees
│       │       ├── subscription.rs    # subscribe_daily / process / cancel
│       │       └── emergency.rs       # per-ticket refunds, emergency LP withdraw
│       └── tests.rs                   # LiteSVM in-process Rust tests
│
├── app/
│   ├── page.tsx                       # Play (pick numbers + buy)
│   ├── play/                          # Buy flow components, number editor, checkout modal
│   ├── tickets/                       # User ticket history + claim
│   ├── trophies/                      # Soulbound winner gallery
│   ├── liquidity/                     # LP deposit / withdraw UI + math helpers
│   ├── referrals/                     # Referral link card + earnings
│   ├── console/                       # Admin/operator console
│   ├── api/
│   │   ├── trophy-metadata/[round]/[winner]/route.ts   # JSON metadata for trophies
│   │   └── trophy-image/[round]/[winner]/route.ts      # SVG badge per trophy
│   ├── generated/                     # Codama-generated TS client
│   └── lib/
│       ├── lottery/
│       │   ├── accounts.ts            # SWR hooks for on-chain state
│       │   ├── actions/               # one hook per program instruction
│       │   ├── builders.ts            # tx builders
│       │   ├── randomness.ts          # Switchboard helpers
│       │   └── …
│       ├── wallet/                    # wallet-standard adapter → kit signer
│       └── solana-client.ts           # RPC factory + cluster context
│
├── docs/
│   └── trophy-plan.md                 # Metaplex Core integration design doc
├── codama.json                        # Anchor IDL → TS client config
├── open-next.config.ts                # Cloudflare Workers deployment
├── wrangler.jsonc
└── package.json
```

---

## Getting started

### Prerequisites

- Node 20+, npm
- Rust 1.79+, Anchor CLI 0.32.1
- Solana CLI 2.x
- A Solana wallet (Phantom, Backpack, Solflare…)

### One-time setup

```bash
npm install
npm run setup            # builds Anchor program + generates TS client (Codama)
```

### Dev loop

```bash
npm run dev              # Next.js 16 dev server on http://localhost:3000
npm run anchor-build     # cargo build the program
npm run anchor-test      # LiteSVM integration tests (fast, in-process)
npm run codama:js        # regenerate TS client from the Anchor IDL
```

### Local validator

```bash
solana-test-validator
solana config set --url localhost
cd anchor && anchor build && anchor deploy && cd ..
npm run codama:js        # picks up the local program ID
# switch to "localnet" via the cluster selector in the app header
```

### Devnet vs mainnet

The program **must be built with the right Cargo feature** so it accepts the matching Switchboard On-Demand program ID:

```bash
# devnet/localnet binary
anchor build -- --features devnet

# mainnet binary (default)
anchor build
```

The `EXPECTED_SB_PID` constant is selected at compile time — a devnet binary will reject a mainnet randomness account, and vice versa.

### Deploy frontend

```bash
npm run preview          # local OpenNext preview (Cloudflare runtime)
npm run deploy           # deploy to Cloudflare Workers
```

---

## Instruction surface

| Instruction | Signer | Purpose |
|---|---|---|
| `initialize_config` | admin | Pin payment mint, set fees, tier weights |
| `update_config` | admin | Tune fees / tier weights / dynamic bonusball |
| `set_paused` / `set_emergency_mode` | admin | Circuit breakers |
| `init_trophy_collection` | admin | One-time MPL Core soulbound collection bootstrap |
| `start_round` | anyone | Open the next round (price + duration + bonusball + optional LP guarantee) |
| `buy_tickets` | player | Purchase up to 7 tickets/tx with on-chain pick validation |
| `commit_draw` | anyone | Lock a Switchboard randomness account at `draw_time` |
| `reveal_draw` | anyone | Settle round: derive winning numbers, compute per-tier per-combo payouts |
| `claim_winnings` | ticket owner | Pay out, accrue referral win-share, mint soulbound trophy if winning |
| `archive_round` | anyone | Move unclaimed pool to next round or LP per config |
| `lp_deposit` | LP | Add liquidity (share-accounted) |
| `lp_initiate_withdraw` / `lp_finalize_withdraw` | LP | Two-step withdrawal |
| `initialize_referral` | referrer | Open a 2-tier referral PDA |
| `claim_referral_fees` | referrer | Pull accrued earnings |
| `subscribe_daily` / `process_subscription` / `cancel_subscription` | player / keeper | Recurring ticket buys |
| `enter_round_emergency` | admin | Move a stuck round into refund mode |
| `emergency_refund_ticket` / `emergency_lp_withdraw` | user | Pull capital out in emergency mode |

---

## Soulbound trophy NFTs

When a winning ticket is claimed, `claim_winnings` CPIs into `mpl-core::create_v2` to mint an asset into the `Megapot Winners` collection. The collection was created with `PermanentFreezeDelegate { frozen: true, authority: None }` — every asset minted into it is frozen at birth and **no one, ever, can unfreeze it**.

- **Metadata**: served from `/api/trophy-metadata/[round]/[winner]` — Next.js route that reads the on-chain `Round` and `Ticket` state and returns standard JSON metadata.
- **Image**: served from `/api/trophy-image/[round]/[winner].svg` — gold/embossed badge SVG with round number, tier, and prize.
- **Gallery**: `/trophies` queries `fetchAssetsByCollection(trophy_collection)` and displays the full winner history across all rounds.

The trophy address is a fresh keypair signed in the claim tx (MPL Core uses a single-account model — no PDA derivation). The lottery Config PDA is the collection's update authority, so no actor outside the program can mint into the collection.

See [`docs/trophy-plan.md`](docs/trophy-plan.md) for the full integration design.

---

## Security & invariants

- **Mint pinning** — `Config.payment_mint` is set at init and is immutable. Every instruction validates inbound mint accounts via `address = config.payment_mint`.
- **Compile-time Switchboard PID** — devnet/mainnet binaries cannot be confused. The `EXPECTED_SB_PID` constant is baked in at build time.
- **Strict seed-slot binding** — `commit_draw` requires `seed_slot == clock.slot − 1` and that the randomness account has never been revealed (`reveal_slot == 0`). Prevents reuse of a known-value randomness account.
- **Prize-pool floor** — `MIN_PRIZE_POOL_BPS = 5000` guarantees ≥50% of every ticket goes to the prize pool, regardless of edge/referral configuration.
- **LP guarantee cap** — `MAX_GUARANTEE_PER_ROUND_BPS_CAP = 5000` prevents a single round from over-committing LP capital.
- **Two-step LP withdraw** — initiated shares are snapshotted against the active round; settlement waits for round close.
- **Idempotent `init_if_needed` PDAs** — `Subscription` and `LpPosition` carry an `initialized: bool` flag to defend against re-init attacks beyond the owner-pubkey check.
- **PickCounter** — duplicate winners split per-combo payouts; over-draws of the prize pool are impossible.
- **Permanent collection-level freeze** — trophy collection's `PermanentFreezeDelegate { authority: None }` is irreversible. Trophies are soulbound forever.

---

## Roadmap

- **Solana Blinks integration** — single-click ticket purchases embedded in any client.
- **Address Lookup Tables for `buy_tickets`** — raise per-tx ticket cap above 7.
- **Trophy gallery on-chain index** — secondary indexer for round/tier filters.
- **Multi-mint rounds** — per-round payment mint override (currently pinned at init).
- **Mobile-first wallet flow** — deep-link checkout for embedded wallets.

---

## License

TBD.

---

Built for the [Colosseum](https://arena.colosseum.org) Frontier hackathon.
