# DeFier

**Onchain capital intelligence on Base.**

Live: https://www.getdefier.com

Dashboards show you data. DeFier tells you the answer: what your capital is actually
earning, and whether providing liquidity beat simply holding the tokens.

The wedge is one hard question that no tool answers well: **did my LP position actually
beat HODL?** Answering it honestly means reconstructing every position from its onchain
history, valuing each deposit, withdrawal, fee claim and reward at the price on the day
it happened, and comparing that against the counterfactual of never having provided
liquidity at all.

Read only. DeFier never asks for a signature, never builds a transaction, and never
asks for a seed phrase.

## What it does

- **True P&L per position** · initial capital at historical prices, withdrawals, claimed
  and unclaimed fees, AERO incentives, gas, and net result.
- **LP vs HODL** · the same tokens valued as if they had stayed in the wallet, so the
  divergence is a number instead of a feeling.
- **Concentrated liquidity, done right** · Aerodrome Slipstream and Uniswap V3 on Base,
  including positions staked in a gauge, which most scanners miss entirely.
- **Tokenized stocks** · Coinbase B20 tokens as first class assets, with multiplier
  adjusted balances, and detected inside liquidity pools.
- **Exposure** · every LP decomposed into its current token amounts, grouped by asset class.
- **Simulate** · the LP versus HODL curve across a price range, preloaded from a real position.
- **Value history** · the same headline figure day by day, rebuilt from events rather than
  accumulated from snapshots, so it is complete from a wallet's first position.
- **Trades worth a mention** · what the wallet swapped, reconstructed from transfers rather
  than from any single exchange, valued at today's price on both sides. Not a profit and
  loss, and it says so.
- **Ask** · an agent that answers with figures produced by the engine, never invented ones.
- **An API for agents** · `GET /api/v1/wallet/{address}`, with every figure carrying its
  coverage scope. OpenAPI at `/api/v1/openapi.json`, reading rules at `/llms.txt`.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Recharts · OnchainKit
(wagmi/viem) for wallet connect and Basenames · ethers v5 in the server side engine ·
Anthropic API for the agent · Vercel.

Base only, chain ID 8453.

## Architecture

```
Base RPC (Alchemy + public fallbacks) · DeFiLlama prices · Chainlink feeds
        |
   src/core/          plain JS, server side, the only source of truth for formulas
        |
   src/app/api/       typed route handlers, rate limited, cached
        |
   src/app/           UI. Renders engine output and computes nothing.
```

Two rules keep the numbers honest:

1. `src/core/` is the only place a financial formula may live. The UI never calculates.
2. Every position carries a `confidence` flag and a `notes[]` list. When a historical
   price or an event cannot be resolved, the product says so instead of guessing.

Longer form: [ARCHITECTURE.md](./ARCHITECTURE.md) for how it is built and what it has to
know about Base, [MEASUREMENT.md](./MEASUREMENT.md) for what it measures and what it
refuses to, [ROADMAP.md](./ROADMAP.md) for what is shipped and what is next.

## Running locally

```bash
cp .env.example .env.local   # then fill it in
npm install
npm run typecheck
npm run dev
```

`ALCHEMY_KEY`, `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server side only
and must never carry the `NEXT_PUBLIC_` prefix. See [SECURITY.md](./SECURITY.md).

## Disclaimer

Informational only. Not investment advice. DeFier does not execute transactions.
Tokenized stocks are available only to eligible users in jurisdictions outside the
United States.
