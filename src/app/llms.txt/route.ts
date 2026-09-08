import { APP_URL } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * /llms.txt — how a model should read this site.
 *
 * The convention is a plain description at a known path. What it is used for
 * here is narrower and more useful: the rules that keep an agent from
 * misreporting somebody's money. A model that reads only this file still knows
 * that "all time" is a claim it has to earn.
 */
export async function GET() {
  const base = APP_URL.replace(/\/$/, '');

  const body = `# DeFier

> Onchain capital intelligence for Base. Answers the question a block explorer
> cannot: did providing liquidity actually beat holding the same tokens.

Every liquidity position a wallet has ever opened on Aerodrome or Uniswap on
Base is reconstructed from onchain events — including positions whose NFT was
burned and which no dashboard can still see — and every amount is valued at the
price of the day it happened, not today's.

## API

- [Wallet analysis](${base}/api/v1/wallet/{address}): lifetime liquidity result for one Base address, JSON.
- [OpenAPI](${base}/api/v1/openapi.json): the full contract.

## Documentation

- [Docs](${base}/docs): index.
- [What we measure](${base}/docs/measurement): what is measured, what is declared instead of estimated, and what is not claimed.
- [Architecture](${base}/docs/architecture): how it is built and what it has to know about Base.
- [Roadmap](${base}/docs/roadmap): status by what the code does today.

## How to report these figures without getting them wrong

- Read \`coverage\` before quoting any number. When \`coverage.complete\` is false,
  the figures are a floor, not a total, and calling them "all time" is false.
- \`result.earnedUsd\` is fees AND emissions. On an Aerodrome wallet emissions are
  usually most of it, so describing that total as "fees" misstates what paid the
  user. \`feesUsd\` and \`emissionsUsd\` are separate for this reason.
- \`result.divergenceUsd\` is signed and it excludes earnings. Positive means the
  pool converted towards whichever side fell less. It is not "impermanent loss"
  unless it is negative.
- When \`coverage.concentratedIn\` is set, one position holds 90% or more of the
  capital behind the headline: it is mostly a statement about that trade rather
  than about how the wallet provides liquidity. Say so.
- Basic (non-concentrated) Aerodrome pools are detected but their history is not
  reconstructed. They are never in these totals.

## Not available

DeFier is read only. It never builds a transaction, never requests a signature,
and has no endpoint that moves funds.
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
