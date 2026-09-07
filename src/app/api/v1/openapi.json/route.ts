import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/env';
import { SCHEMA_VERSION } from '@/lib/agentApi';

export const dynamic = 'force-dynamic';

/**
 * The machine-readable description of the v1 API.
 *
 * An agent that has to be told by a human what the fields mean is not an agent
 * that can use this. The descriptions here carry the honesty rules as part of
 * the contract — that "all time" is a claim requiring coverage.complete, and
 * that a figure quoted without its scope is a wrong answer — so a model reading
 * only this document still cannot misreport a wallet.
 */
export async function GET() {
  const base = APP_URL.replace(/\/$/, '');

  return NextResponse.json({
    openapi: '3.1.0',
    info: {
      title: 'DeFier',
      version: '1.0.0',
      summary: 'Onchain capital intelligence for Base, reconstructed from events.',
      description:
        'Answers one question a block explorer cannot: did providing liquidity actually beat '
        + 'holding the same tokens. Every position a wallet ever opened on Aerodrome or Uniswap '
        + 'on Base is rebuilt from onchain events — including positions whose NFT was burned — '
        + 'and every amount is valued at the price of the day it happened.\n\n'
        + 'Reading rule: never quote a figure without reading `coverage` first. When '
        + '`coverage.complete` is false the figures are a floor, not a total, and calling them '
        + '"all time" is false. When `coverage.concentratedIn` is set, the headline is mostly a '
        + 'statement about that one position rather than about how the wallet provides liquidity.',
      contact: { url: base },
    },
    servers: [{ url: base }],
    paths: {
      '/api/v1/wallet/{address}': {
        get: {
          operationId: 'getWalletAnalysis',
          summary: 'Lifetime liquidity analysis for one wallet on Base.',
          description:
            'A full reconstruction takes up to a minute on a first call and is cached for '
            + 'fifteen minutes after that. Rate limited to ten wallets a minute.',
          parameters: [{
            name: 'address',
            in: 'path',
            required: true,
            schema: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
            description: 'The wallet to analyse.',
          }],
          security: [{ bearerAuth: [] }, {}],
          responses: {
            200: {
              description: 'The analysis. Read `coverage` before quoting anything else.',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Wallet' } } },
            },
            400: { description: 'Not a Base address.' },
            401: { description: 'A key is required and was missing or wrong.' },
            429: { description: 'Rate limited.' },
            502: { description: 'Base or a price source could not be read.' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Only enforced where keys are configured.' },
      },
      schemas: {
        Wallet: {
          type: 'object',
          required: ['schema', 'address', 'chain', 'generatedAt', 'coverage', 'capital', 'result'],
          properties: {
            schema: { type: 'string', const: SCHEMA_VERSION },
            address: { type: 'string' },
            chain: { type: 'string', const: 'base' },
            generatedAt: { type: 'integer', description: 'Unix seconds.' },
            coverage: {
              type: 'object',
              description: 'What these figures do and do not cover. Read before quoting any of them.',
              properties: {
                complete: { type: 'boolean', description: 'True only when every position ever opened was measured.' },
                scope: { type: 'string', enum: ['all time', 'partial'], description: 'The words to use for the period.' },
                positionsMeasured: { type: 'integer' },
                positionsExcluded: { type: 'integer' },
                excluded: {
                  type: 'array',
                  items: { type: 'object', properties: { pair: { type: 'string' }, reason: { type: 'string' } } },
                },
                firstPositionAt: { type: ['integer', 'null'] },
                concentratedIn: {
                  type: ['object', 'null'],
                  description: 'Set when one position holds 90% or more of the capital behind these figures.',
                  properties: { pair: { type: 'string' }, sharePct: { type: 'number' } },
                },
                notes: { type: 'array', items: { type: 'string' } },
              },
            },
            capital: {
              type: 'object',
              properties: {
                deployedUsd: { type: 'number', description: 'Each deposit summed at its own historical price.' },
                daysProviding: { type: 'integer', description: 'Days with capital in a pool, overlaps counted once.' },
                positionsOpened: { type: 'integer' },
                positionsOpen: { type: 'integer' },
              },
            },
            result: {
              type: 'object',
              properties: {
                divergenceUsd: {
                  type: 'number',
                  description:
                    'Signed. What providing liquidity did to the capital before fees: what is still '
                    + 'inside plus what already came out, against the same tokens never deposited. '
                    + 'Positive means the pool converted towards whichever side fell less.',
                },
                vsHoldingUsd: { type: 'number', description: 'Divergence plus everything earned, minus gas.' },
                netPnlUsd: { type: 'number' },
                earnedUsd: { type: 'number', description: 'Fees AND emissions. Never describe this as fees alone.' },
                feesUsd: { type: 'number', description: 'Trading fees only.' },
                emissionsUsd: { type: 'number', description: 'Gauge rewards only, valued at the price of each claim.' },
                gasUsd: { type: 'number' },
                beatHoldingCount: { type: 'integer' },
                beatHoldingPct: { type: 'number' },
              },
            },
            earnedByToken: {
              type: 'object',
              description: 'A dollar total hides which token it arrived in.',
              properties: {
                fees: { $ref: '#/components/schemas/TokenTotals' },
                emissions: { $ref: '#/components/schemas/TokenTotals' },
              },
            },
            pairs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  pair: { type: 'string' },
                  positions: { type: 'integer' },
                  capitalUsd: { type: 'number' },
                  vsHoldingUsd: { type: 'number' },
                },
              },
            },
            exposure: {
              type: ['object', 'null'],
              description: 'Live portfolio composition, with liquidity positions decomposed into assets.',
              properties: {
                totalUsd: { type: 'number' },
                byClass: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { label: { type: 'string' }, valueUsd: { type: 'number' }, pct: { type: 'number' } },
                  },
                },
                marketBiasPct: { type: 'number', description: 'Share not sitting in stablecoins.' },
              },
            },
          },
        },
        TokenTotals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              symbol: { type: 'string' },
              address: { type: 'string' },
              amount: { type: 'number' },
              usd: { type: 'number' },
            },
          },
        },
      },
    },
  }, { headers: { 'cache-control': 'public, max-age=3600' } });
}
