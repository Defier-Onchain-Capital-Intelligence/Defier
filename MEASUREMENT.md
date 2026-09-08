# What DeFier measures, and what it refuses to

This document exists because the product's main risk is not a crash. It is a number
that looks right and is not.

The rule the whole codebase is built on: **a figure that cannot be measured is excluded
and said on screen, never estimated.** A bad number is worse than no number, because
somebody acts on it.

## Measured, from the chain

- Every concentrated liquidity position a wallet has opened on Aerodrome Slipstream or
  Uniswap V3 on Base, including positions whose NFT was burned.
- Deposits, increases, decreases and withdrawals, each valued at the price of the day it
  happened.
- Fees collected, and gauge emissions claimed, kept as separate figures.
- Gas paid, per position.
- The counterfactual: the same tokens valued as if they had never left the wallet.
- Trades: transactions where one asset left the wallet and another arrived, valued at
  today's price on both sides.

## Declared, not estimated

**Unresolved historical prices.** If the price of a token on the day of a deposit cannot
be resolved, that position is excluded from the total and the scope stops saying "all
time". It is not filled in with today's price or an adjacent day.

**Positions that could not be read.** A position the chain would not answer for is
counted as unread, not as empty.

**Trades in tokens with no trusted price.** Both sides must be priced with a confidence
of at least 0.8 or the trade is left out and counted. Base wallets collect airdropped
tokens with fabricated prices, and one of those would produce the largest figure in the
report.

**A truncated history.** When the transfer index pages out before the wallet's full
history is read, the answer says "partial" rather than "all time".

**Empty pools.** A pool with no liquidity at the current price cannot pay a fee, whatever
TVL is published for it. The screen says there is nothing at this price — a fact about
the pool — rather than "we could not read the liquidity", which is an apology for our own
limits. Those are different statements and the reader needs to know which one they are
getting.

## Not measured, and not claimed

- **Anything outside Base.** No other chain is read, so no total is a portfolio total.
- **v2-style AMM positions.** Frozen for lack of a verifiable test case rather than
  shipped as an approximation.
- **What the wallet did next.** The trades section compares the two sides of one
  transaction. It is not a profit and loss: someone who sold AERO for USDC and bought ETH
  the next day is not described by that line at all, which is why the copy states amounts
  and never a verdict.
- **Anything about the future.** The simulator solves a range's economics under stated
  assumptions. It is not a prediction and the assumptions are printed beside the result.

## Concentration travels with the headline

A result driven overwhelmingly by one position is a different fact from the same number
spread across ten. Where the headline goes, the concentration goes with it — including
onto the share image, which is where the number travels furthest from anyone who could
explain it.

## Why this is written down

Because the tempting failure is silent. Nothing crashes when a total quietly covers three
of five positions; it simply reads as a lifetime. Writing the rule down makes the silence
a bug rather than a style.
