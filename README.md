# DeFier

**Onchain capital intelligence on Base.**

Live: https://defier-alpha.vercel.app

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
- **Ask** · an agent that answers with figures produced by the engine, never invented ones.

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
