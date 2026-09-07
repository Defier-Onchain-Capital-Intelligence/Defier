import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { buildPortfolio } from '@/core/portfolio.js';
import { computeLifetime } from '@/core/lifetime.js';
import { recordWalletSnapshot } from '@/lib/capital';
import type { Portfolio } from '@/types/portfolio';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; data: unknown }>();

/**
 * GET /api/report/:address — the lifetime report.
 *
 * Always a deep build. The whole point is the history, and a report that
 * quietly covered only what is open today would be the exact dishonesty this
 * product exists to correct.
 */
export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address: raw } = await ctx.params;
  const address = (raw || '').toLowerCase();

  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: 'That is not a Base address.' }, { status: 400 });
  }

  const { limited } = rateLimit(req, { max: 10, windowMs: 60_000, prefix: 'report' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const hit = cache.get(address);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.data, { headers: { 'x-defier-cache': 'hit' } });
  }

  try {
    const portfolio: Portfolio = await buildPortfolio(address, { deep: true });
    const lifetime = computeLifetime(portfolio.positions, portfolio.historyGap);

    const data = {
      address,
      generatedAt: Math.floor(Date.now() / 1000),
      lifetime,
      warnings: portfolio.warnings,
    };

    cache.set(address, { at: Date.now(), data });
    if (cache.size > 100) cache.delete(cache.keys().next().value as string);

    after(() => recordWalletSnapshot(portfolio));
    return NextResponse.json(data, { headers: { 'x-defier-cache': 'miss' } });
  } catch (err) {
    console.error('[report] failed', { address, err });
    return NextResponse.json({ error: 'Could not read that wallet on Base right now.' }, { status: 502 });
  }
}
