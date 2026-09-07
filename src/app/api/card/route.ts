import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getReport } from '@/lib/reportBuild';
import { recordWalletSnapshot } from '@/lib/capital';
import { figuresFrom } from '@/lib/reportCopy';
import { saveCard } from '@/lib/cards';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

/**
 * POST /api/card — mint the shareable snapshot for a wallet's report.
 *
 * The body carries an address and nothing else. Every figure on the card is
 * read from the engine here, on the server, which is what makes a DeFier card
 * evidence rather than a claim: there is no request shape that lets a caller
 * choose the number their card will show.
 *
 * Normally this is instant, because the wallet's report was built moments ago
 * and is still cached. On a miss it builds, which is slow but correct.
 */
export async function POST(req: Request) {
  const { limited } = rateLimit(req, { max: 10, windowMs: 60_000, prefix: 'card' });
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
    const { data, portfolio } = await getReport(address);
    if (portfolio) after(() => recordWalletSnapshot(portfolio));

    const figures = figuresFrom(data.lifetime, address.slice(-4), data.generatedAt);
    const id = await saveCard(address, figures);

    // Supabase unconfigured or unreachable. The share still works, it just
    // links to the report instead of a card, so say so plainly.
    if (!id) return NextResponse.json({ id: null, reason: 'storage unavailable' }, { status: 200 });

    return NextResponse.json({ id, path: `/c/${id}` });
  } catch (err) {
    console.error('[card] failed', { address, err });
    return NextResponse.json({ error: 'Could not read that wallet on Base right now.' }, { status: 502 });
  }
}
