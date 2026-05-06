# Prize Structure

Megapot offers 10 winning prize tiers, giving you many ways to win beyond just the jackpot. With 1 in 4 tickets winning something, your chances of walking away with a prize are better than you might expect.

---

## How Tickets Work

Each ticket costs $1 USDC and contains:

- **5 normal numbers** (selected from 1-30)
- **1 bonusball** (selected from a separate, dynamic range)

You can pick your own numbers or use Quick Pick for random selections. Either way, your ticket is minted as an NFT that you own.

---

## Prize Tiers

There are 10 winning combinations, ranging from matching just the bonusball to hitting the full jackpot:

| Normal Matches | Bonusball | Premium Allocation | Description                    |
| -------------- | --------- | ------------------ | ------------------------------ |
| 5              | Yes       | 40%                | The big one - match everything |
| 5              | No        | 6%                 | All 5 normal numbers           |
| 4              | Yes       | 6%                 | 4 normals + bonusball          |
| 4              | No        | 6%                 | 4 normal numbers               |
| 3              | Yes       | 6%                 | 3 normals + bonusball          |
| 3              | No        | 12%                | 3 normal numbers               |
| 2              | Yes       | 12%                | 2 normals + bonusball          |
| 2              | No        | 0%                 | 2 normal numbers               |
| 1              | Yes       | 12%                | 1 normal + bonusball           |
| 1              | No        | None               | 1 normal                       |
| 0              | Yes       | 0%                 | Bonusball only                 |
| 0              | No        | None               | None                           |

**What does NOT win:**

- No matches at all (0 normal numbers, no bonusball)
- 1 normal number only (no bonusball)

---

## How Payouts Are Calculated

Megapot uses a two-part payout system that combines guaranteed minimums with premium payouts. Here is how it works:

### Step 1: Guaranteed Minimums

Each winning tier (except no-win combinations) has a guaranteed minimum payout per ticket. This means if you win, you are assured at least a baseline prize.

### Step 2: Calculate Total Guarantees

Before distributing premiums, the system calculates all potential winners across the ticket pool. This includes any unpurchased ticket combinations.

### Step 3: Create the Premium Pool

After all guaranteed payouts are set aside, what remains becomes the "premium pool." This is the extra prize money available on top of the guaranteed minimums.

### Step 4: Distribute Premium Payouts

Each tier is assigned a percentage of the premium pool based on how many numbers you matched. Higher tiers receive a larger share of the premium.

### Step 5: Final Payout

Your total payout = Guaranteed minimum + Your ticket's share of the premium for your tier

---

## What About Duplicate Numbers?

Since players can choose their own numbers, multiple tickets might share the same winning combination. Here is how that affects payouts:

**Guaranteed portion**: Every winning ticket receives the full guaranteed minimum, regardless of duplicates. If 10 tickets share the same winning numbers, all 10 get the guaranteed payout.

**Premium portion**: The premium for that tier is split among all winning combinations (including unpurchased tickets) for that tier _plus_ duplicate tickets. More duplicates mean a smaller premium share for each.

**What this means for you**: Picking unique number combinations can result in larger payouts if you hit a premium tier, since you would not be splitting the premium with others who chose the same numbers.

---

## Understanding Your Odds

### Why Odds Vary

Your odds of winning depend on two factors:

1. **Normal numbers**: Always selected from 1-30
2. **Bonusball range**: This is dynamic and adjusts based on prize pool size

### Dynamic Bonusball Range

The bonusball range changes to keep the system sustainable:

- **Larger prize pool** = Wider bonusball range = Harder jackpot odds
- **Smaller prize pool** = Narrower bonusball range = Better jackpot odds

This adjustment ensures the prize pool can cover expected payouts while still offering meaningful prizes.

### The Numbers

- **1 in 4 tickets** wins something across all tiers
- **Lower tiers** (matching just the bonusball or 1-2 numbers) have reasonable odds
- **Jackpot odds** are long, as with any major lottery

### Compared to Traditional Prize Games

Megapot returns approximately 70% of ticket sales as prizes, compared to 50% or less for many traditional operators. This means more of each dollar goes back to winners.

However, like any lottery, the jackpot remains a long shot. The difference is that Megapot is transparent about the odds, and you can verify exactly how every drawing works on-chain.

---

## Expected Value

We believe in being upfront: like all lotteries, Megapot has a house edge. For every $1 ticket:

- **\~70%** is returned as prizes to winners
- **\~20%** goes to Backers (who fund the prize pool)
- **\~10%** goes to Referrers (who help grow the community)

This means the expected return per ticket is approximately $0.70. You are paying for the chance to win, not for a guaranteed return.

The difference from traditional games: instead of ticket revenue leaving the ecosystem, that 30% goes directly to community members (Backers and Referrers) who make Megapot possible.

---

## Prize Pool Size and Payouts

The size of the prize pool directly affects your potential winnings:

- **Larger pool** = Bigger prizes across all tiers
- **More tickets sold** = More revenue = Larger pool

The jackpot grows as more players participate. The current jackpot is always displayed before you buy, so you know exactly what is at stake.

---

## Key Takeaways

1. **10 winning tiers** - Many ways to win beyond the jackpot
2. **1 in 4 tickets wins** - Better odds of winning something
3. **Guaranteed minimums** - Every winner gets at least the baseline
4. **Premium payouts** - Extra winnings on top of guarantees
5. **Unique numbers matter** - Avoid duplicates for potentially larger premiums
6. **\~70% back to winners** - More than traditional operators return
7. **Transparent odds** - Everything is verifiable on-chain

---

## Next Steps

- [How to Play](/getting-started/how-to-play.md) - Buy your first ticket
- [Provably Fair](/getting-started/provably-fair.md) - How randomness is generated
- [The Ecosystem](/learn/the-ecosystem.md) - How Players, Backers, and Referrers work together

---

# Agent Instructions: Querying This Documentation

If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter:

```
GET https://docs.megapot.io/learn/prize-structure.md?ask=<question>
```

The question should be specific, self-contained, and written in natural language.
The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
