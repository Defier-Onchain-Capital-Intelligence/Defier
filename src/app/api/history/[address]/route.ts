import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getReport, peekPortfolio } from '@/lib/reportBuild';
import { recordWalletSnapshot } from '@/lib/capital';
import { buildValueHistory } from '@/core/valueHistory.js';
import type { ValueHistory } from '@/types/portfolio';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

/**
 * GET /api/history/:address — the daily LP-versus-holding curve.
 *
 * It reads the deep build the report already paid for when there is one, so
 * opening the report and then the curve is one reconstruction, not two.
 */
export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address: raw } = await ctx.params;
  const address = (raw || '').toLowerCase();

  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: 'That is not a Base address.' }, { status: 400 });
  }

  const { limited } = rateLimit(req, { max: 10, windowMs: 60_000, prefix: 'history' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  try {
    let portfolio = peekPortfolio(address);
    if (!portfolio) {
      const built = await getReport(address);
      portfolio = built.portfolio;
      if (built.portfolio) after(() => recordWalletSnapshot(built.portfolio!));
    }
    if (!portfolio) {
      return NextResponse.json({ error: 'Could not read that wallet on Base right now.' }, { status: 502 });
    }

    const history: ValueHistory = await buildValueHistory(portfolio.positions);
    return NextResponse.json({ address, history });
  } catch (err) {
    console.error('[history] failed', { address, err });
    return NextResponse.json({ error: 'Could not build the curve for that wallet.' }, { status: 502 });
  }
}
