# Architecture

DeFier answers one question — did providing liquidity beat holding the same tokens —
and everything below exists to make that answer checkable rather than plausible.

Read only today. The app never builds a transaction and never requests a signature:
there is no code path from a user action to a wallet write. Position management is on
the roadmap and would be non-custodial and user-signed, and it does not ship until the
measurement half is trusted.

## The shape

```
Base RPC (Alchemy + public fallbacks) · Alchemy Transfers · DeFiLlama prices and pools
        │
   src/core/          plain JS, server only. The only place a formula may live.
        │
   src/app/api/       typed route handlers. Validation, rate limits, caches.
        │
   src/app/           UI. Renders engine output and computes nothing.
```

Two rules hold the whole thing up:

1. **`src/core/` is the only place a financial formula may live.** The UI never
   calculates. A number on screen was produced by the engine or it does not appear.
2. **What cannot be measured is declared, never estimated.** Every position carries a
   confidence flag and a `notes[]` list; every total carries a coverage scope. "All
   time" is a claim the code has to earn, and it only says it when nothing was skipped.

## The engine

| Module | What it owns |
|---|---|
| `history.js` | Every event a position ever had, rebuilt from onchain logs — mints, increases, decreases, collects, gauge claims. Finds positions whose NFT was burned and which no dashboard can still see. |
| `pnl.js` | The result of one position: capital in at the price of its day, withdrawals, fees, emissions, gas, and the divergence against holding. |
| `lifetime.js` | Every position a wallet ever had, aggregated, with the coverage scope attached. |
| `valueHistory.js` | The same headline figure day by day, rebuilt from events rather than snapshots, so a new user's curve starts at their first position instead of today. |
| `swaps.js` | What the wallet traded, reconstructed from transfers rather than from any exchange, and what those amounts are worth today. |
| `portfolio.js` | What the wallet holds now: positions, tokens, lending, staked and unstaked. |
| `apr.js` · `poolDetail.js` | Pool economics from the chain: active liquidity, fee tier, emissions, and an APR grid solved per range width. |
| `exposure.js` | Every LP decomposed into the tokens actually held, grouped by asset class. |
| `scenarios.js` · `strategies.js` | The LP versus HODL curve across a price range. |
| `prices.js` | DeFiLlama current, historical and series prices, with confidence where it matters. |
| `providers.js` | RPC with timeouts, chunked log scans and failover. |

## Things about Base that the code has to know

**Aerodrome runs two Slipstream deployments.** Factories `0x5e7bb104…` and
`0xf8f2eb49…`. The same pair with the same tick spacing exists on both: an abandoned
pool on the first, the live one on the second. Resolving a pool address means asking
every deployment and keeping the one that holds liquidity — taking the first non-zero
answer reads WETH/cbBTC, an eleven million dollar pool, as forty five dollars.

**Staked liquidity leaves `liquidity()`.** Aerodrome moves it to `stakedLiquidity()`,
and both compete for fees equally. Reading only the first overstates APR several times
over in exactly the pools people care about.

**On Slipstream the fifth field of `positions()` is the tick spacing, not a fee.** The
fee is per pool and lives on the chain, not in any metadata.

**`ClaimRewards` is indexed by wallet, not by token id.** Resolving gauges per position
and summing the events double counts unless the claims are deduplicated.

**Range grids must respect tick spacing.** A CL200 pool cannot hold a ±0.05% range, so
offering one with an APR beside it quotes a return for a position that cannot be opened.

## Data sources, and what happens when one is wrong

| Source | Used for | If it fails |
|---|---|---|
| Base RPC | Every balance, position, tick and event | Falls back across providers; a position that cannot be read is excluded and counted, never assumed empty |
| Alchemy Transfers | Finding mints and trades across full history | Falls back to chunked `eth_getLogs` for recent history; trades report that they were not read |
| DeFiLlama prices | Valuation, current and historical | The figure is excluded from the total and the scope stops saying "all time" |
| DeFiLlama pools | The ranking and its published APYs | The onchain read is authoritative; published figures are shown as theirs, beside ours |

A provider being wrong is a normal condition, not an exception. The rule is that the
product would rather show less than show something it cannot stand behind.

## API

`GET /api/v1/wallet/{address}` is the stable contract for agents, versioned separately
from the internal types so screens can be rebuilt without breaking anyone. Every figure
travels with its coverage scope, and fees and emissions are always separate fields —
an agent quoting a P&L that silently covered three of five positions is a confident
wrong answer nobody downstream can catch.

`/api/v1/openapi.json` is the full contract. `/llms.txt` carries the reading rules for
a model that arrives without one.

## Tests

`npm test` runs the engine's unit tests over injected fixtures — no network, so the
rules stay honest and fast. The invariants that matter are asserted rather than
reviewed: the trades headline is tested for the absence of a verdict, coverage is
tested for refusing to claim a lifetime it did not read.
