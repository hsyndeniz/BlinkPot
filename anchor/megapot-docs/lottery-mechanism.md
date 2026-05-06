# Lottery Mechanism

Understanding how Megapot's lottery works helps you make informed decisions about playing.

---

## How the Lottery Works

Each Megapot ticket has 6 numbers:

- **5 normal numbers** - chosen from 1 to 30
- **1 bonusball** - chosen from a dynamic range that changes each drawing

When the drawing runs, 6 winning numbers are selected using verifiable randomness from Pyth Network. Your prize depends on how many of your numbers match (see our article on [Prize Structure](/learn/prize-structure.md) to learn more).

---

## Dynamic Bonusball Range

You may notice the bonusball range changes from drawing to drawing. This is intentional and serves an important purpose.

### Why the Range Changes

The bonusball range adjusts based on the size of the prize pool:

- **Larger pool** - Wider bonusball range, harder to hit the jackpot
- **Smaller pool** - Narrower bonusball range, easier to hit the jackpot

This keeps the lottery economically sustainable by ensuring the backers can keep their edge on ticket sales. If the bonusball range was set too low for the size of the pool then they would be incentivized to withdraw from the pool thus making the prize pool smaller for players!

## Understanding Your Odds

Your odds depend on two factors:

1. **Normal balls** - Fixed range of 1-30, picking 5 unique numbers
2. **Bonusball** - Dynamic range that changes each drawing

### Calculating Odds

For the normal balls, you are matching 5 numbers out of 30. The odds of matching all 5 are approximately 1 in 142,506.

For the bonusball, if the range is 1-15, your odds of matching it are 1 in 15.

Combined jackpot odds would be roughly 1 in 2.1 million (142,506 x 15). When the bonusball range widens to 1-25, jackpot odds become approximately 1 in 3.6 million.

Lower prize tiers have much better odds since they require fewer matches.

---

---

# Agent Instructions: Querying This Documentation

If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter:

```
GET https://docs.megapot.io/learn/lottery-mechanism.md?ask=<question>
```

The question should be specific, self-contained, and written in natural language.
The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
