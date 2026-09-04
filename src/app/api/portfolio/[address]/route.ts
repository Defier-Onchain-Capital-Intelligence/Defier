import { NextResponse } from 'next/server';
import type { Portfolio } from '@/types/portfolio';
import { rateLimit } from '@/lib/rateLimit';
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

  const hit = cache.get(address);
  if (!debug && !deep && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.data, { headers: { 'x-defier-cache': 'hit' } });
  }

  try {
    const portfolio: Portfolio = await buildPortfolio(address, { diagnostics: debug, deep });
    if (!deep) cache.set(address, { at: Date.now(), data: portfolio });
    return NextResponse.json(portfolio, { headers: { 'x-defier-cache': 'miss' } });
  } catch (err) {
    // Never leak a stack trace to the client. See SECURITY.md section 4.
    console.error('[portfolio] scan failed', { address, err });
    return NextResponse.json({ error: 'Could not read this wallet on Base right now.' }, { status: 502 });
  }
}
