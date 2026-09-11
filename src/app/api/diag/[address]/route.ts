import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { buildPortfolio } from '@/core/portfolio.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

/**
 * GET /api/diag/:address — the trace, and nothing else.
 *
 * Counts and reasons only: which token ids were found, which were burned, why a
 * rebuild failed. No balances, no values, nothing that identifies anyone beyond
 * the address already in the URL. It exists because reading a trace out of a
 * two hundred kilobyte payload is how debugging stops happening.
 */
export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address: raw } = await ctx.params;
  const address = (raw || '').toLowerCase();
  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: 'That is not a Base address.' }, { status: 400 });
  }

  const { limited } = rateLimit(req, { max: 6, windowMs: 60_000, prefix: 'diag' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const deep = new URL(req.url).searchParams.get('deep') === '1';

  try {
    const portfolio = await buildPortfolio(address, { diagnostics: true, deep });
    const p = portfolio as unknown as {
      diagnostics?: { steps: Array<{ step: string; value: unknown }> };
      historyGap?: unknown;
      warnings?: string[];
      positions?: Array<{ id: string; closed: boolean; confidence: string; notes?: string[] }>;
    };

    // The steps carry rpcHealth, tokenBalancesFailed and lendingTransportErrors
    // when those happened. They are lifted out here because the one question
    // worth answering fast — "is the chain reachable from this deployment?" —
    // should not require reading a hundred trace entries to find out.
    const stepValue = (name: string) =>
      p.diagnostics?.steps.find((x) => x.step === name)?.value ?? null;

    return NextResponse.json({
      address,
      deep,
      rpcHealth: stepValue('rpcHealth'),
      // Where the sixty seconds go, phase by phase. Cumulative from the start.
      phaseMs: (p.diagnostics?.steps ?? [])
        .filter((x) => x.step === 'phaseMs')
        .map((x) => x.value),
      readFailures: {
        tokenBalances: stepValue('tokenBalancesFailed'),
        lending: stepValue('lendingTransportErrors'),
      },
      historyGap: p.historyGap ?? null,
      steps: p.diagnostics?.steps ?? [],
      positions: (p.positions ?? []).map((x) => ({
        id: x.id, closed: x.closed, confidence: x.confidence, notes: x.notes ?? [],
      })),
      warnings: p.warnings ?? [],
    });
  } catch (err) {
    console.error('[diag]', { address, err });
    return NextResponse.json({
      error: 'Diagnostic run failed.',
      reason: String((err as Error)?.message || err).slice(0, 300),
    }, { status: 502 });
  }
}
