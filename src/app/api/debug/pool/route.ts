import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { inspectPool } from '@/core/diagnose.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Read only inspection of a pool and its gauge. Temporary: it exists to answer why
 * a known staked position is not being found, and comes out once that is settled.
 * Everything it returns is public onchain data.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const pool = url.searchParams.get('pool') || '';
  const wallet = url.searchParams.get('wallet') || '';
  const gauge = url.searchParams.get('gauge') || '';

  if (!ADDRESS_RE.test(pool)) {
    return NextResponse.json({ error: 'pool must be a 0x address' }, { status: 400 });
  }
  if (wallet && !ADDRESS_RE.test(wallet)) {
    return NextResponse.json({ error: 'wallet must be a 0x address' }, { status: 400 });
  }

  const { limited } = rateLimit(req, { max: 10, windowMs: 60_000, prefix: 'debug-pool' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  try {
    const report = await inspectPool({ pool, wallet, gauge });
    return NextResponse.json(report);
  } catch (err) {
    console.error('[debug/pool]', err);
    return NextResponse.json({ error: 'inspection failed' }, { status: 502 });
  }
}
