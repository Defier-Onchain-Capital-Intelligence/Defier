# Roadmap

Status is what the code does today, not what is planned. Anything marked *shipped* is
running in production at https://www.getdefier.com and can be checked by pointing it at
a wallet.

## Shipped

- **LP versus HODL, per position and lifetime.** Every position rebuilt from onchain
  events, each amount valued at the price of its own day, compared against never having
  provided liquidity. Includes positions whose NFT was burned.
- **Staked positions.** Aerodrome gauge positions, whose liquidity leaves `liquidity()`
  and which most scanners miss entirely.
- **Value history.** The headline figure day by day, reconstructed from events rather
  than accumulated from snapshots, so it is complete from a wallet's first position.
- **Fees and emissions, separately.** A total that is mostly emissions is not "fees",
  and the two are never merged into one word.
- **Coverage on every figure.** "All time" appears only when nothing was skipped.
- **Pool ranking.** Fee APR computed from the chain, weighted by the day's TVL, with
  published APYs shown beside ours rather than instead of them. Pools with nothing at
  the current price are marked as such.
- **Range calculator and simulator.** APR solved per range width, on a grid built from
  the pool's own tick spacing, so no range is quoted that the pool cannot hold.
- **Tokenized stocks.** Coinbase B20 tokens as first class assets, multiplier adjusted,
  and detected inside liquidity pools.
- **Exposure.** Every LP decomposed into the tokens actually held, by asset class.
- **Trades worth a mention.** What a wallet swapped, rebuilt from transfers rather than
  from any single exchange, valued at today's price on both sides. Not a profit and loss,
  and the copy says so.
- **Share cards.** Public, anonymous, and minted server side — a card cannot carry a
  figure a browser chose. Open Graph, X and Base App embeds from one drawing.
- **Agent API v1.** `GET /api/v1/wallet/{address}` with OpenAPI and `llms.txt`. Every
  figure carries its scope.
- **Base Mini App.** Manifest signed, native wallet flow inside Base App, modal on web.
- **Alerts.** Range and position alerts with a scheduled check.
- **Positions held through vfat.** A wallet that farms Aerodrome through vfat
  holds nothing itself: the position belongs to a contract wallet vfat deploys
  for that user, so the address a person types in reads as empty. One call
  resolves it and everything after is the pipeline we already had. Found by
  checking a real user rather than by reasoning about it, and verified against
  three more carrying over $1.5M that had all been reading as zero.
- **Lending and borrowing.** Aave v3, Moonwell and Compound v3 read directly: what is
  supplied, what is owed, and how close the position sits to liquidation. The health
  factor is the protocol's own, computed from its oracle and its collateral factors,
  and it is only printed when our figure agrees with what that protocol says about the
  account. Debt appears on the portfolio at its worst health across protocols, not its
  average, and counts as negative exposure everywhere else.

## Next

- **Monetisation, three lanes.** A free tier limited by scope rather than by call count:
  the headline figure without the per position breakdown, so it is enough to verify the
  answer is real and not enough to build on — and it declares that it is partial, because
  a silently truncated response is the exact failure this product exists to avoid.
  Monthly keys for people and integrations. [x402](https://www.coinbase.com/developer-platform/discover/launches/x402)
  per call for agents, which is Coinbase's own standard, settles in USDC on Base, and
  needs no account.
- **Public documentation site.** Architecture, measurement policy and API in one place.
- **Cost per wallet, measured.** Timed on 11 Sep 2026 against production: the
  portfolio a person actually waits for answers in about 4.4 seconds, and the
  full history reconstruction takes about 29 more, behind the screen they are
  already reading. The ninety seconds this entry used to claim was a guess.
  Compute units per wallet are still unmeasured, and no price is set until they
  are.

## Later

- **v2 style AMM positions.** Deliberately frozen: no approximation ships until there is
  a wallet whose result can be verified against the chain.
- **Performance.** Measured rather than estimated, 11 Sep 2026: 4.4 seconds to the
  portfolio someone is waiting on, and 29 seconds more for the full history, which
  loads behind the screen they are already reading. Cached, both answer in
  milliseconds. The 4.4 is the number worth attacking, because it is the only one
  anybody sits through; the history was the one this entry used to be about.
- **More venues on Base**, on the same rule: a venue is added when its positions can be
  reconstructed exactly, not when its pools can be listed.
- **Morpho.** The one lending protocol on Base we do not read. Positions there live per
  market and there are hundreds, so finding a wallet's markets means scanning events
  before anything can be valued, where the other three answer with a fixed number of
  calls. Until it lands, every screen showing lending names what was checked and names
  Morpho as not covered: a wallet borrowing somewhere we do not look would otherwise
  read as a wallet with no debt, and that is a wrong answer rather than a missing one.
- **Lending and liquidity as one strategy.** Borrowing against collateral to provide
  liquidity with what you borrowed is one position, and today we show it as two. Reading
  both sides was the prerequisite; measuring the combination against holding is the work.

## Under consideration, and what it would take

- **Managing positions from inside DeFier.** Opening, adjusting and closing across
  protocols in one place is the natural end of a product that already tells you what to
  do. It is not built and it is not next: it would be non-custodial and signed by the
  user, never custodial, and it does not ship until the read only half is trusted. Every
  figure this product shows is checkable against the chain; a transaction is not, and
  earning the right to build one is the point of doing the measurement first.

## Not planned

- **Custody.** DeFier will never hold user funds, at any stage.
- **Other chains**, while Base is not finished.
- **Predictions.** The simulator solves stated assumptions and prints them. It does not
  forecast, and no figure in this product is advice.
