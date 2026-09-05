import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getBasePools } from '@/lib/llamaPools';
import { STOCK_ADDRESSES, TOKENIZED_STOCKS } from '@/core/constants.base.js';
import { classifyRisk, getPoolFeeDec } from '@/core/pools.js';
import { poolVariantLabel } from '@/core/poolDetail.js';

export const dynamic = 'force-dynamic';

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; data: unknown } | null = null;

const STOCK_SYMBOLS = Object.keys(TOKENIZED_STOCKS);

/**
 * GET /api/pools?stocks=1
 *
 * The ranking. Two decisions worth stating.
 *
 * The stable column is DeFiLlama's `apyBase7d`: seven days of fees annualised
 * over the pool's TVL. It is NOT `apyMean30d`, which is the arithmetic mean of
 * the daily APY and which a single day of thin TVL blows to four digits — we
 * measured 1461% on a pool trading at 109% today. An average that a bad day can
 * hijack is worse than no average, so it does not appear here. The pool screen
 * computes a TVL weighted mean instead, which is the honest version.
 *
 * Every APR here is the FULL RANGE APR: all the fees over all the liquidity. It
 * is the floor, and the only number that compares two pools fairly. What a
 * concentrated range multiplies it by is decided on the pool screen.
 */
export async function GET(req: Request) {
  const { limited } = rateLimit(req, { max: 30, windowMs: 60_000, prefix: 'pools' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const onlyStocks = new URL(req.url).searchParams.get('stocks') === '1';

  try {
    if (!cache || Date.now() - cache.at > TTL_MS) {
      const raw = await getBasePools();

      const pools = raw
        .map((p) => {
          const tokens = (p.underlyingTokens || []).map((t) => t.toLowerCase());
          const hasStock = tokens.some((t) => STOCK_ADDRESSES.has(t))
            || STOCK_SYMBOLS.some((s) => p.symbol?.toUpperCase().includes(s.toUpperCase()));
          const feeDec = getPoolFeeDec(p);
          return {
            id: p.pool,
            symbol: p.symbol,
            // Aerodrome runs several pools per pair, one per tick spacing. Without
            // this they are four identical rows and the ranking is unreadable.
            variant: poolVariantLabel(p),
            project: p.project,
            risk: classifyRisk(p),
            feePct: feeDec != null ? feeDec * 100 : null,
            tvlUsd: p.tvlUsd ?? 0,
            volumeUsd1d: p.volumeUsd1d ?? null,
            volumeOverTvl: p.tvlUsd > 0 && p.volumeUsd1d ? p.volumeUsd1d / p.tvlUsd : null,
            apy: p.apy ?? null,
            apyBase: p.apyBase ?? null,
            apyReward: p.apyReward ?? null,
            /** Seven days of fees, annualised. The stable figure of the ranking. */
            feeApr7d: p.apyBase7d ?? null,
            hasStock,
            tokens,
          };
        })
        .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
        .slice(0, 200);

      cache = { at: Date.now(), data: pools };
    }

    const pools = cache.data as Array<{ hasStock: boolean }>;
    return NextResponse.json({ pools: onlyStocks ? pools.filter((p) => p.hasStock) : pools });
  } catch (err) {
    console.error('[pools]', err);
    return NextResponse.json({ error: 'Pool data is unavailable right now.' }, { status: 502 });
  }
}
