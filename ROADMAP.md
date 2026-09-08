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

## Next

- **Monetisation, three lanes.** A free tier limited by scope rather than by call count:
  the headline figure without the per position breakdown, so it is enough to verify the
  answer is real and not enough to build on — and it declares that it is partial, because
  a silently truncated response is the exact failure this product exists to avoid.
  Monthly keys for people and integrations. [x402](https://www.coinbase.com/developer-platform/discover/launches/x402)
  per call for agents, which is Coinbase's own standard, settles in USDC on Base, and
  needs no account.
- **Public documentation site.** Architecture, measurement policy and API in one place.
- **Cost per wallet, measured.** A full reconstruction is roughly ninety seconds of work
  and a real number of compute units. No price is set until that number is measured
  rather than guessed.

## Later

- **v2 style AMM positions.** Deliberately frozen: no approximation ships until there is
  a wallet whose result can be verified against the chain.
- **Performance.** The deep build is around ninety seconds on a cold wallet, dominated by
  pair lookups against the voter. Cached, the report and the curve answer in
  milliseconds.
- **More venues on Base**, on the same rule: a venue is added when its positions can be
  reconstructed exactly, not when its pools can be listed.

## Not planned

- **Writing transactions.** DeFier is read only by design. No signature, no approval, no
  transaction building. This is not a phase.
- **Other chains**, while Base is not finished.
- **Predictions.** The simulator solves stated assumptions and prints them. It does not
  forecast, and no figure in this product is advice.
