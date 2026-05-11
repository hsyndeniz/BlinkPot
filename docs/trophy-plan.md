# Soulbound Winner Trophy — Metaplex Track Integration

## Goal

Mint a permanent, soulbound MPL Core NFT trophy to every winner at the moment they claim. Tickets stay as PDAs (untouched). The trophy is the entire Metaplex integration — minimal scope, maximal narrative.

## Architecture

```
┌──────────────┐                    ┌─────────────────────┐
│ buy_tickets  │ ─── (no change) ── │ Ticket PDA created  │
└──────────────┘                    └─────────────────────┘

┌────────────────┐  CPI mpl-core   ┌────────────────────────┐
│ claim_winnings │ ──────────────► │ Core asset minted into │
│  (modified)    │  create_v1      │ trophy_collection      │
└────────────────┘                 │ → soulbound by plugin  │
                                   └────────────────────────┘
```

### Why this design

- **Scope**: zero changes to the existing protocol. `claim_winnings` gets one extra CPI block. Nothing else moves.
- **Cost**: ~0.0029 SOL per trophy, paid by the winner once on a winning claim. Negligible against any tier payout.
- **No DAS dependency**: Core assets are queryable via standard RPC. Helius is optional (for richer queries on the gallery page).
- **Permanently soulbound**: the trophy collection has `PermanentFreezeDelegate { frozen: true, authority: None }` — every asset minted into it is frozen at birth and no one can ever unfreeze.

### Sponsor pitch

Every winner gets a permanent on-chain trophy — a soulbound MPL Core NFT proving their jackpot win, viewable in any Solana wallet, displayed alongside every other winner in the protocol's hall of fame.

## On-chain

### `Config.trophy_collection: Pubkey`

New field. `Pubkey::default()` until `init_trophy_collection` runs. Persisted in the existing Config PDA.

### `init_trophy_collection` (admin one-time)

Anchor instruction. Admin signs + pays. CPI mpl-core `create_collection_v1` with:

- `update_authority`: lottery program PDA (so only this program can mint into it)
- Collection name: e.g. `"BlinkPot Winners"`
- URI: a static metadata JSON describing the collection
- Plugins:
  - `PermanentFreezeDelegate { frozen: true, authority: None }` — every minted asset is permanently soulbound
  - `Royalties` (informational, 0 bps) — for marketplace display

Stores `collection.publicKey` on `Config.trophy_collection`. Idempotent guard: errors if already set.

### `claim_winnings` (modified)

After successful payout transfer, append:

```rust
if config.trophy_collection != Pubkey::default() {
    mpl_core::cpi::create_v1(
        CpiContext::new(core_program, CreateV1 {
            asset: trophy_asset,           // fresh keypair, signs in this tx
            collection: trophy_collection,
            authority: lottery_pda,        // collection update authority
            payer: claimer,
            owner: claimer,
            update_authority: lottery_pda,
            // ...
        }).with_signer(&[&[CONFIG_SEED, &[config.bump]]]),
        CreateV1Args {
            name: format!("BlinkPot Round {} — Tier {}", round_id, tier),
            uri: format!("{}/api/trophy-metadata/{}/{}", host, round_id, claimer),
            ..
        },
    )?;
}
```

The trophy is auto-soulbound by the collection's permanent freeze plugin. No further CPI needed.

## Off-chain

### Bootstrap

Admin runs `init_trophy_collection` once after deploy. Generates a fresh keypair for the collection (signs in the tx as the new collection account). The collection address is then stored on `Config`.

### Next.js routes

**`/api/trophy-metadata/[round]/[winner]`** — JSON metadata served per trophy. Reads round draw + winner's claim state from the on-chain `Round` and `Ticket` PDAs.

**`/api/trophy-image/[round]/[winner].svg`** — gold/embossed badge SVG. Round number, tier, prize amount, winner address.

### Frontend hook

`use-claim-winnings.ts` generates a fresh keypair for the trophy asset before sending the tx, and includes it as a signer alongside the user. The new asset's address is the keypair's public key — no PDA derivation needed (Core uses a single-account model).

### Gallery page (`/trophies`)

Queries `fetchAssetsByCollection(trophy_collection)` from `@metaplex-foundation/mpl-core`. Works on standard RPC. Displays as a wall of winner badges grouped by round.

## Files

| File | Change |
|---|---|
| `anchor/programs/lottery/Cargo.toml` | Add `mpl-core` |
| `anchor/programs/lottery/src/state/config.rs` | `trophy_collection: Pubkey`, LEN bump |
| `anchor/programs/lottery/src/instructions/admin.rs` (or new file) | `init_trophy_collection` instruction |
| `anchor/programs/lottery/src/instructions/claim.rs` | Append trophy-mint CPI block |
| `anchor/programs/lottery/src/lib.rs` | Wire new instruction |
| `app/lib/lottery/actions/use-claim-winnings.ts` | Generate trophy keypair, include as signer |
| `app/api/trophy-metadata/[round]/[winner]/route.ts` | JSON metadata |
| `app/api/trophy-image/[round]/[winner]/route.ts` | SVG render |
| `app/trophies/page.tsx` | Gallery (optional polish) |

## Out of scope

- Per-ticket cNFTs (rejected as too costly and complex for the demo)
- DAS API integration (not needed for Core)
- Bubblegum / merkle trees / proofs
- Bearer-instrument transfer semantics (trophies are soulbound by design, not transferable)
- Address Lookup Tables for buy_tickets (separate concern, future work)

## Trade-offs

- **Single-event integration**: trophy mints only on winning claims. Most users won't see a Metaplex artifact directly. Mitigated by the `/trophies` gallery showing the protocol's full winner history.
- **Update authority on the program PDA**: trophies can never be modified or transferred without a future instruction adding that capability. Intentional — soulbound forever.
- **Collection plugin set at create time, no future flexibility**: `PermanentFreezeDelegate` with `authority: None` is irreversible. If the protocol ever wants to allow unfreezing, the collection must be recreated. Acceptable for a demo and consistent with "soulbound" semantics.
