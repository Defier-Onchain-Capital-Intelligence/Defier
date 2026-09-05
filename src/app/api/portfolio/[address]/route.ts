import { NextResponse } from 'next/server';
import type { Portfolio } from '@/types/portfolio';
import { after } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { recordWalletSnapshot } from '@/lib/capital';
// core/ is plain JS and server side only. TypeScript reads it through allowJs.
import { buildPortfolio } from '@/core/portfolio.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // historical scans are slow; results are cached below

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Per instance memory cache. On Vercel each serverless instance keeps its own copy,
 * which is enough to stop a page reload from paying for a second full scan.
 */
const cache = new Map<string, { at: number; data: Portfolio }>();

/** Compact view: the answer and the shape of the wallet, without every position's detail. */
function bucketSummary(b: Portfolio['holdings']['crypto'] | undefined) {
  if (!b) return null;
  return {
    totalUsd: b.totalUsd,
    pctOfPortfolio: b.pctOfPortfolio,
    inWalletUsd: b.walletUsd,
    insideLiquidityUsd: b.inPoolsUsd,
    inLendingUsd: b.lendingUsd,
  };
}

function shape(portfolio: Portfolio, compact: boolean) {
  if (!compact) return portfolio;
  return {
    address: portfolio.address,
    chain: portfolio.chain,
    generatedAt: portfolio.generatedAt,
    summary: portfolio.summary,
    exposure: portfolio.exposure,
    // Totals only. The agent needs to know the shape of the split, not every line.
    holdings: {
      crypto: bucketSummary(portfolio.holdings?.crypto),
      stocks: bucketSummary(portfolio.holdings?.stocks),
    },
    scenarios: portfolio.scenarios,
    tokens: portfolio.tokens.map((h) => ({
      symbol: h.token.symbol,
      isTokenizedStock: h.token.isTokenizedStock ?? false,
      balance: h.balance,
      scaledBalance: h.scaledBalance,
      multiplier: h.multiplier,
      priceSource: h.price?.source ?? null,
      stalePrice: h.price?.stale ?? false,
      valueUsd: h.valueUsd,
    })),
    lending: portfolio.lending,
    positions: portfolio.positions.map((p) => ({
      id: p.id, symbol: p.symbol, staked: p.staked, closed: p.closed,
      inRange: p.inRange, valueUsd: p.valueUsd,
      lpVsHodlUsd: p.pnl?.lpVsHodlUsd ?? null,
      confidence: p.confidence,
    })),
    warnings: portfolio.warnings,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address: rawAddress } = await params;
  const address = rawAddress?.toLowerCase();

  if (!ADDRESS_RE.test(address || '')) {
    return NextResponse.json({ error: 'Invalid Base address' }, { status: 400 });
  }

  const { limited } = rateLimit(req, { max: 10, windowMs: 60_000, prefix: 'portfolio' });
  if (limited) {
    return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });
  }

  const search = new URL(req.url).searchParams;
  const debug = search.get('debug') === '1';
  // Full event history for every position at once. Slow by nature, so it is never
  // the default: the UI loads a position's history when that position is opened.
  const deep = search.get('deep') === '1';
  // Summary, exposure and warnings without the per position detail. The home
  // screen shows the answer before the breakdown, and this is that payload.
  const compact = search.get('view') === 'compact';

  const hit = cache.get(address);
  if (!debug && !deep && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(shape(hit.data, compact), { headers: { 'x-defier-cache': 'hit' } });
  }

  try {
    const portfolio: Portfolio = await buildPortfolio(address, { diagnostics: debug, deep });
    if (!deep) cache.set(address, { at: Date.now(), data: portfolio });

    // Recorded after the response is sent, so the traction metric never costs
    // the user a millisecond of wait.
    after(() => recordWalletSnapshot(portfolio));

    return NextResponse.json(shape(portfolio, compact), { headers: { 'x-defier-cache': 'miss' } });
  } catch (err) {
    // Never leak a stack trace to the client. See SECURITY.md section 4.
    console.error('[portfolio] scan failed', { address, err });
    return NextResponse.json({ error: 'Could not read this wallet on Base right now.' }, { status: 502 });
  }
}
