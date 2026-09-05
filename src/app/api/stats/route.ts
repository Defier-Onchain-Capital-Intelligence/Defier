import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getCapitalStats } from '@/lib/capital';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stats
 * Public aggregate only. Individual wallet rows are never exposed.
 */
export async function GET(req: Request) {
  const { limited } = rateLimit(req, { max: 60, windowMs: 60_000, prefix: 'stats' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const stats = await getCapitalStats();
  if (!stats) {
    return NextResponse.json(
      { walletsAnalyzed: 0, totalCapitalUsd: 0, lastUpdated: null, available: false },
      { headers: { 'cache-control': 'public, max-age=60' } }
    );
  }
  return NextResponse.json({ ...stats, available: true }, {
    headers: { 'cache-control': 'public, max-age=60' },
  });
}
