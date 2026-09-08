import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getSwapMoments } from '@/core/swaps.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

/**
 * GET /api/swaps/:address — the trades worth a sentence.
 *
 * Separate from the report on purpose. The report answers whether providing
 * liquidity beat holding; this answers what the wallet traded and what those
 * amounts are worth now. They share a wallet and nothing else, and mixing them
 * would let a striking trade colour a P&L it has no bearing on.
 */
export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address: raw } = await ctx.params;
  const address = (raw || '').toLowerCase();

  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: 'Expected a 0x address on Base.' }, { status: 400 });
  }

  const { limited } = rateLimit(req, { max: 15, windowMs: 60_000, prefix: 'swaps' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  try {
    const data = await getSwapMoments(address, { limit: 3 });
    return NextResponse.json({ address, ...data });
  } catch (err) {
    console.error('[swaps]', { address, err });
    return NextResponse.json({ error: 'Could not read this wallet right now.' }, { status: 502 });
  }
}
