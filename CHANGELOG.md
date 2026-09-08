# Changelog

One line per day of what shipped.

## 2026-09-08

- Fixed pool address resolution: Aerodrome runs two Slipstream deployments and the same pair lives on both, with the abandoned pool answering first. Six of the largest pairs on Base were being read at the wrong address — WETH/cbBTC measured forty five dollars of an eleven million dollar pool. Every deployment is now asked and the one holding liquidity wins.
- Corrected the record that blamed the data provider for that: the provider was right.
- Trades: `src/core/swaps.js` reconstructs what a wallet swapped from transfers rather than from any exchange, so every venue is covered and none can be missing. Netting each transaction by asset first survives routers and refunds; the one-asset-out, one-asset-in rule excludes liquidity moves and claims without knowing a protocol address.
- Both sides valued at today's price, which needs no historical series. Not a profit and loss, and a test asserts the headline contains no verdict.
- Trades in tokens without a price of at least 0.8 confidence are excluded and counted, so an airdropped scam token cannot produce the report's largest figure.
- `GET /api/swaps/:address`, `POST /api/swap-card`, and `/s/[id]` with Open Graph, X and Base App renders.
- Ranking trades purely by dollar gap produced three identical sentences on a real wallet; a slot is now reserved for the trade whose purchase is worth more today.
- A truncated transfer history reports "partial" instead of "all time".
- ARCHITECTURE.md, MEASUREMENT.md and ROADMAP.md.

## 2026-09-07

- Verified in production that rebuilt positions now carry today's prices: the report measures 4 of 4 positions for the reference wallet and the heading reads "all time" rather than a partial window.
- Share cards: `POST /api/card` mints a short id whose figures the server reads from the engine, so a card cannot carry a number a browser chose.
- `/c/[id]` public card page, with an Open Graph image at 1.91:1, an X card, and a Base App embed at 3:2 carrying the same content.
- Stored cards hold four characters of an address and an HMAC, never the address itself.
- Headline, scope, caveat and share text moved to `lib/reportCopy` so the card and the report cannot word the same result differently.

## 2026-09-04

- Project scaffolded: Next.js 15, React 19, TypeScript, Tailwind, OnchainKit 1.1.2, wagmi, viem, ethers v5.
- Financial engine ported from a proven codebase and trimmed to Base only.
- Removed a client side fallback that would have exposed the Alchemy key in the browser bundle.
- Portfolio orchestrator returning the typed contract, with everything not yet implemented declared rather than faked.
- Exposure engine: per asset and per asset class decomposition of LPs, tokens and lending.
- `GET /api/portfolio/[address]`: address validation, rate limiting, five minute cache, no stack traces on error.
- Agent model set to Haiku 4.5 and Supabase variables renamed to the current publishable/secret key format.
- First deploy on Vercel.
- Part 1: staked gauge positions, full event history, historical prices, gas, closed positions.
