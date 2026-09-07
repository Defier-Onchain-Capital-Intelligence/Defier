import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getReport, peekPortfolio } from '@/lib/reportBuild';
import { recordWalletSnapshot } from '@/lib/capital';
import { toWalletV1 } from '@/lib/agentApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

/**
 * GET /api/v1/wallet/:address — the engine, for agents.
 *
 * Same figures as the report, in a contract that is allowed to outlive our
 * internal types, and with the scope attached to every one of them.
 *
 * Auth is opt in: with DEFIER_API_KEYS set, a bearer token from that list is
 * required; without it the endpoint is open and rate limited. That order is
 * deliberate — shipping it closed and unusable would make the API a claim in a
 * pitch rather than something anyone can try.
 */
function authorised(req: Request): boolean {
  const configured = (process.env.DEFIER_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean);
  if (configured.length === 0) return true;
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return token.length > 0 && configured.includes(token);
}

export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address: raw } = await ctx.params;
  const address = (raw || '').toLowerCase();

  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json(
      { error: 'invalid_address', message: 'Expected a 0x-prefixed 40 character address on Base.' },
      { status: 400 },
    );
  }
  if (!authorised(req)) {
    return NextResponse.json(
      { error: 'unauthorised', message: 'Send Authorization: Bearer <key>.' },
      { status: 401 },
    );
  }

  const { limited } = rateLimit(req, { max: 10, windowMs: 60_000, prefix: 'v1' });
  if (limited) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Ten wallets a minute. A full reconstruction is expensive.' },
      { status: 429 },
    );
  }

  try {
    const { data, portfolio } = await getReport(address);
    if (portfolio) after(() => recordWalletSnapshot(portfolio));

    const body = toWalletV1(address, data.lifetime, data.generatedAt, portfolio ?? peekPortfolio(address));
    return NextResponse.json(body, {
      headers: {
        'cache-control': 'public, max-age=300',
        'x-defier-schema': body.schema,
      },
    });
  } catch (err) {
    console.error('[v1/wallet] failed', { address, err });
    return NextResponse.json(
      { error: 'upstream', message: 'Could not read that wallet on Base right now.' },
      { status: 502 },
    );
  }
}
