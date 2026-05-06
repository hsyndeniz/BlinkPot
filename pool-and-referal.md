What is the Backer pool?
The Backer pool is the collection of USDC deposits that make up the prize pool. For backing the prize pool, backers earn a portion of ticket sales.

Where do Backer returns come from?
Backer returns come from ticket sales. Backers receive 90% of ticket revenue and pay out an average of 70% in prizes, resulting in a 20% net margin over time.

How is my share value calculated daily?
Your share value tracks the net result of ticket revenue minus payouts. While low-probability jackpot wins cause rare fluctuations, the 20% house edge drives consistent, long-term appreciation.

How is Megapot provably fair?
Every drawing uses verifiable randomness from Pyth Network. The winning numbers are generated independently and recorded permanently on-chain. No one—including the Megapot team—can predict or manipulate the outcome.

Is there a deposit limit for backers?
No, there is no minimum or maximum deposit limit for backers. The only max limit is based on the pool's total liquidity cap.

When does my deposit become active?
Your deposit becomes active after the current drawing has completed.

When can I withdraw?
You can submit a withdrawal at any time. Your funds will be released at the end of the current drawing to ensure that the prize pool remains fully backed. After the drawing, your funds are set aside from the prize pool and you can complete the withdrawal.

What is the expected APY?
Expected APY reflects a 20% house margin fueled by recent player volume. While realized returns (7d/30d) fluctuate with jackpot variance, the mathematical edge is designed to outperform typical AMM yields over the long term.

How is this different from Uniswap?
Unlike AMMs, Megapot eliminates impermanent loss by pairing your liquidity against negative-EV player flow. This single-asset USDC vault captures a 20% fee margin, where long-term mathematical edge outweighs short-term variance. Supply USDC, earn USDC.

Why does the pool have a cap?
The cap keeps the prize pool sized to expected payouts and ticket demand, so backer returns stay predictable and the economics remain sustainable. It also limits concentration risk and helps ensure the protocol can meet withdrawal requests reliably.

# FAQ

## General

### How do I contact support?

Message us at [megapot.io/support](https://megapot.io/support) or email us at <support@megapot.io>.

### What regions are geoblocked?

The Megapot protocol operates autonomously, enabling anyone to build on it, or use it, without permission. The Megapot app is a user-facing interface to the protocol and abides by relevant gaming regulations.

**Megapot.io and mini apps in the Base app:**

Afghanistan, Australia, Austria, Belarus, Burkina Faso, Burundi, Cambodia, Canada, Comoros, Cuba, Democratic Republic of Congo, France, Germany, Guinea-Bissau, Haiti, Iran, Iraq, Jamaica, Libya, Mali, Myanmar, Netherlands, North Korea, Russia, Senegal, Somalia, South Sudan, Spain, Syria, Ukraine, United Kingdom, United States, Venezuela

### How do I earn Points?

There are three ways to earn points:

1. **Playing** — Every ticket you buy earns points
2. **Referring** — Earn a share of your referrals' ticket points
3. **Backing** — Earn points based on your deposit size

Learn more about point values and VIP tiers in [Points](/getting-started/points-program.md).

---

## Players

### How much does a ticket cost?

Tickets cost $1 USDC each. You can purchase as many tickets as you like for each drawing.

### What is an auto-subscription and how does it work?

An auto-subscription automatically purchases tickets on your behalf for every drawing over a pre-set period of time. You deposit USDC upfront, choose how many tickets you want per drawing, for how many days and the system handles the rest. Your subscription continues until you cancel or your balance runs out.

You can choose between static tickets (same numbers every drawing) or dynamic tickets (fresh random numbers each drawing).

For more details, see [Auto-Subscriptions](/learn/advanced/autosubscribe.md).

### Can I cancel my auto-subscription?

Yes, you can cancel at any time with no penalties. When you cancel, your remaining balance is refunded to your wallet immediately. Any tickets already purchased for the current drawing remain active.

Learn more in [Auto-Subscriptions](/learn/advanced/autosubscribe.md).

### Why is my order using batch purchase?

Large ticket orders are automatically split into smaller batches for reliability. Blockchain transactions have size limits, and batching ensures your entire order completes successfully.

You pay once upfront, and tickets are delivered progressively as each batch completes. This may take a few extra minutes for very large orders, but all your tickets will be minted.

For more details, see [Batch Purchases](/learn/advanced/batch-purchases.md).

### When do drawings happen?

Drawings happen once daily at 17:00 UTC. You can purchase tickets anytime before the drawing closes.

### How can I verify the drawing was fair?

Every drawing uses verifiable randomness from Pyth Network. The winning numbers are generated independently and recorded permanently on-chain. You can inspect the blockchain transaction to verify:

1. The random number came from Pyth Network's entropy contract
2. The winning numbers were derived from that randomness
3. Winners were calculated correctly for each prize tier

No one—including the Megapot team—can predict or manipulate the outcome. For a step-by-step verification guide, see [Provably Fair](/getting-started/provably-fair.md).

### Has Megapot been audited?

Yes. Megapot's smart contracts were audited by two leading security firms:

- [Zellic](https://www.zellic.io/), trusted by Polymarket, Morpho, and Hyperliquid
- [Code4rena](https://code4rena.com/), trusted by AAVE, Coinbase, and Chainlink

Learn more in [Provably Fair](/getting-started/provably-fair.md).

---

## Backers

### What is the Backer pool and how does it work?

The Backer pool is the collection of USDC deposited by liquidity providers (Backers) that funds the prize pool. When you deposit USDC as a Backer, your funds become available as prize money for players to win.

In exchange, you earn a share of ticket sales revenue. Think of it like being the house at a casino, you fund the prizes and earn likely returns from every ticket sold. Over time, the math favors Backers.

For a deeper understanding, see [Earn As A Prize Pool Backer](/getting-started/backer-economics.md).

### Where do Backer returns come from?

Backer returns come from ticket sales. Approximately 90% of every ticket purchase goes to the Backer pool as revenue. After prizes are paid out (roughly 70% of ticket sales), the remaining \~20% becomes Backer profit.

This edge compounds over time. The more tickets sold, the more Backers earn. Learn more in [Earn As A Prize Pool Backer](/getting-started/backer-economics.md).

### What does it mean if my share value decreases?

Your share value can decrease after a drawing with large payouts. When many winners win prizes—especially higher-tier prizes—those payouts come from the Backer pool.

This is expected and temporary. Over many drawings, the mathematical edge means Backer share values trend upward. A single drawing with big winners is part of the normal variance of backing the pool.

### When does my deposit become active?

Your deposit becomes active at the start of the next drawing. If you deposit during an ongoing drawing, your funds will begin earning returns from the following drawing onward.

### Why is there a waiting period to withdraw?

Withdrawals require one drawing cycle to complete. This ensures share values are calculated accurately after the current drawing settles.

To withdraw:

1. Initiate your withdrawal request
2. Wait for the current drawing to complete
3. Finalize your withdrawal to receive USDC

The entire process takes one drawing cycle (approximately 24 hours). Learn more about the mechanics in [How To Back the Prize Pool](/getting-started/how-to-back-the-pool.md).

---

## Referrers

### What are the two ways referrers earn income?

Referrers earn from two sources:

1. **Purchase fees** — A percentage of every ticket your referrals buy
2. **Win share** — A percentage of any prizes your referrals win

Both apply to first-order referrals (people you referred directly) and second-order referrals (people they referred). Your earning potential grows as your network grows.

For the full breakdown, see [Earn by Referring Your Friends](/getting-started/referral-economics-v2.md).

### How much do I earn when someone I referred buys a ticket?

You earn a percentage of every ticket purchase:

- **First-order referrals**: 8% of ticket price
- **Second-order referrals**: 2% of ticket price

Purchase fees are credited to your account instantly when tickets are bought. You can claim them anytime—no minimum threshold, no waiting period.

Learn more in [Earn by Referring Your Friends](/getting-started/referral-economics-v2.md).

### What percentage do I earn when my referrals win?

You earn a percentage of your referrals' winnings:

- **First-order referrals**: 8% of prize
- **Second-order referrals**: 2% of prize

Win share fees are credited to your account when your referral claims their prize. Once credited, you can claim them anytime.

For examples and more details, see [Earn by Referring Your Friends](/getting-started/referral-economics-v2.md).

---
