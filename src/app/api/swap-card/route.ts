import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getSwapMoments } from '@/core/swaps.js';
import { saveSwapCard, swapFiguresFrom } from '@/lib/swapCard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

/**
 * POST /api/swap-card — mint the shareable version of a wallet's trades.
 *
 * The body carries an address and nothing else. Every sentence on the card is
 * written here from what the engine read on chain, which is the whole point: a
 * card nobody can forge is worth sharing, and a card a browser could fill in is
 * just a picture with a number on it.
 */
export async function POST(req: Request) {
  const { limited } = rateLimit(req, { max: 10, windowMs: 60_000, prefix: 'swap-card' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch (_) {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const address = String((body as { address?: string })?.address || '').toLowerCase();
  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: 'That is not a Base address.' }, { status: 400 });
  }

  try {
    const result = await getSwapMoments(address, { limit: 3 });
    if (result.coverage?.available === false) {
      return NextResponse.json({ id: null, reason: 'trades were not read' }, { status: 200 });
    }
    if (!result.moments?.length) {
      return NextResponse.json({ id: null, reason: 'no trade moved far enough' }, { status: 200 });
    }

    const figures = swapFiguresFrom(result, address.slice(-4));
    const id = await saveSwapCard(address, figures);
    if (!id) return NextResponse.json({ id: null, reason: 'storage unavailable' }, { status: 200 });

    return NextResponse.json({ id, path: `/s/${id}` });
  } catch (err) {
    console.error('[swap-card] failed', { address, err });
    return NextResponse.json({ error: 'Could not read that wallet on Base right now.' }, { status: 502 });
  }
}
