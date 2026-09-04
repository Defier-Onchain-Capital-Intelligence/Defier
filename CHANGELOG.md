# Changelog

One line per day of what shipped.

## 2026-09-04

- Project scaffolded: Next.js 15, React 19, TypeScript, Tailwind, OnchainKit 1.1.2, wagmi, viem, ethers v5.
- Financial engine ported from a proven codebase and trimmed to Base only.
- Removed a client side fallback that would have exposed the Alchemy key in the browser bundle.
- Portfolio orchestrator returning the typed contract, with everything not yet implemented declared rather than faked.
- Exposure engine: per asset and per asset class decomposition of LPs, tokens and lending.
- `GET /api/portfolio/[address]`: address validation, rate limiting, five minute cache, no stack traces on error.
