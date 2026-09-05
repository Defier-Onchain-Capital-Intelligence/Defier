import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getBasePools } from '@/lib/llamaPools';
import { STOCK_ADDRESSES, TOKENIZED_STOCKS } from '@/core/constants.base.js';
import { classifyRisk, getPoolFeeDec } from '@/core/pools.js';
import { poolVariantLabel, fetchPoolSeries, weightedFeeApr } from '@/core/poolDetail.js';

export const dynamic = 'force-dynamic';

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; data: unknown } | null = null;

const STOCK_SYMBOLS = Object.keys(TOKENIZED_STOCKS);

/**
 * GET /api/pools?stocks=1
 *
 * The ranking. Two decisions worth stating.
 *
 * The stable column is computed here, from DeFiLlama's daily series, as the mean
 * daily fee APR weighted by that day's TVL. Neither of the numbers DeFiLlama
 * publishes would do. `apyMean30d` is the arithmetic mean of the daily APY, and
 * a single day of thin TVL blows it to four digits: we measured 1461% on a pool
 * trading at 109% today. `apyBase7d` divides seven days of fees by TODAY'S TVL,
 * so a pool whose TVL has just moved reports a week it never had.
 *
 * Weighting by each day's own TVL is the same question as "what did a dollar
 * left in this pool actually earn", and it is the identical calculation the pool
 * screen runs, so the two screens can never disagree.
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

      // Only the pools that can plausibly reach the ranking get a series fetch.
      const ranked = [...raw].sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0)).slice(0, 200);
      const stable = new Map<string, { apr7d: number | null; apr30d: number | null; days: number }>();
      const BATCH = 12;
      for (let i = 0; i < ranked.length; i += BATCH) {
        const slice = ranked.slice(i, i + BATCH);
        const settled = await Promise.allSettled(slice.map(async (p) => {
          const series = await fetchPoolSeries(p.pool);
          const w7 = weightedFeeApr(series, 7);
          const w30 = weightedFeeApr(series, 30);
          return { id: p.pool, apr7d: w7?.aprPct ?? null, apr30d: w30?.aprPct ?? null, days: w30?.daysCovered ?? 0 };
        }));
        for (const r of settled) {
          if (r.status === 'fulfilled') {
            stable.set(r.value.id, { apr7d: r.value.apr7d, apr30d: r.value.apr30d, days: r.value.days });
          }
        }
      }

      const pools = ranked
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
            /** Ours: the TVL weighted mean daily fee APR. The stable figure of the ranking. */
            feeApr7d: stable.get(p.pool)?.apr7d ?? null,
            feeApr30d: stable.get(p.pool)?.apr30d ?? null,
            feeAprDays: stable.get(p.pool)?.days ?? 0,
            /** What DeFiLlama publishes, kept so the two can be compared. */
            publishedApyBase7d: p.apyBase7d ?? null,
            hasStock,
            tokens,
          };
        })
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
