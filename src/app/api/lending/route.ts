import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getBaseLendingMarkets } from '@/lib/llamaPools';

export const dynamic = 'force-dynamic';

/**
 * GET /api/lending?project=aave-v3
 *
 * Both sides of every lending market on Base. The borrow rate is not a footnote
 * here: the strategy this product exists to explain — keep the asset, borrow
 * against it, put the debt to work — lives or dies on the gap between what the
 * collateral earns and what the debt costs, and no interface shows those two
 * numbers next to each other.
 */
export async function GET(req: Request) {
  const { limited } = rateLimit(req, { max: 30, windowMs: 60_000, prefix: 'lending' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const project = new URL(req.url).searchParams.get('project') || undefined;

  try {
    const markets = await getBaseLendingMarkets(project);
    return NextResponse.json({ markets });
  } catch (err) {
    console.error('[lending]', err);
    return NextResponse.json({ error: 'Lending data is unavailable right now.' }, { status: 502 });
  }
}
