import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getReport } from '@/lib/reportBuild';
import { recordWalletSnapshot } from '@/lib/capital';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

/**
 * GET /api/report/:address — the lifetime report.
 *
 * The build and its cache live in lib/reportBuild so the share card can answer
 * from the same numbers this route returns, without a second deep build.
 */
export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address: raw } = await ctx.params;
  const address = (raw || '').toLowerCase();

  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: 'That is not a Base address.' }, { status: 400 });
  }

  const { limited } = rateLimit(req, { max: 10, windowMs: 60_000, prefix: 'report' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  try {
    const { data, cached, portfolio } = await getReport(address);
    if (portfolio) after(() => recordWalletSnapshot(portfolio));
    return NextResponse.json(data, { headers: { 'x-defier-cache': cached ? 'hit' : 'miss' } });
  } catch (err) {
    console.error('[report] failed', { address, err });
    return NextResponse.json({ error: 'Could not read that wallet on Base right now.' }, { status: 502 });
  }
}
