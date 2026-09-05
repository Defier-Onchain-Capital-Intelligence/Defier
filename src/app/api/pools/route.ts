import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { STOCK_ADDRESSES, TOKENIZED_STOCKS } from '@/core/constants.base.js';

export const dynamic = 'force-dynamic';

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; data: unknown } | null = null;

type LlamaPool = {
  pool: string; chain: string; project: string; symbol: string;
  tvlUsd: number; apy: number | null; apyBase: number | null; apyReward: number | null;
  apyBase7d: number | null; apyMean30d: number | null;
  volumeUsd1d: number | null; underlyingTokens: string[] | null; poolMeta: string | null;
};

const STOCK_SYMBOLS = Object.keys(TOKENIZED_STOCKS);

/**
 * GET /api/pools?stocks=1
 *
 * Aerodrome and Uniswap V3 pools on Base, with the comparison that matters:
 * the advertised APY next to its own thirty day average. A pool showing 400%
 * today and 12% over the month is not a 400% pool, and the single number every
 * other interface prints is the reason people chase them.
 */
export async function GET(req: Request) {
  const { limited } = rateLimit(req, { max: 30, windowMs: 60_000, prefix: 'pools' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const onlyStocks = new URL(req.url).searchParams.get('stocks') === '1';

  try {
    if (!cache || Date.now() - cache.at > TTL_MS) {
      const res = await fetch('https://yields.llama.fi/pools', { next: { revalidate: 600 } });
      if (!res.ok) throw new Error(`yields ${res.status}`);
      const json = await res.json();

      const pools = (json.data as LlamaPool[])
        .filter((p) => p.chain === 'Base')
        .filter((p) => p.project === 'aerodrome-slipstream' || p.project === 'aerodrome-v1'
                    || p.project === 'uniswap-v3')
        .filter((p) => (p.tvlUsd ?? 0) > 25_000)
        .map((p) => {
          const tokens = (p.underlyingTokens || []).map((t) => t.toLowerCase());
          const hasStock = tokens.some((t) => STOCK_ADDRESSES.has(t))
            || STOCK_SYMBOLS.some((s) => p.symbol?.toUpperCase().includes(s.toUpperCase()));
          return {
            id: p.pool,
            symbol: p.symbol,
            project: p.project,
            tvlUsd: p.tvlUsd ?? 0,
            volumeUsd1d: p.volumeUsd1d ?? null,
            apy: p.apy ?? null,
            apyBase: p.apyBase ?? null,
            apyReward: p.apyReward ?? null,
            apy7d: p.apyBase7d ?? null,
            apy30d: p.apyMean30d ?? null,
            // How far today's headline number sits from its own monthly average.
            // Positive means today is flattering the pool.
            apySpreadPct: p.apy != null && p.apyMean30d != null ? p.apy - p.apyMean30d : null,
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
