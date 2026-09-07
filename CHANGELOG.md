# Changelog

One line per day of what shipped.

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
