import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { findBasePool } from '@/lib/llamaPools';
import { buildPoolDetail } from '@/core/poolDetail.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: unknown }>();

/**
 * GET /api/pool/:id  — one pool, deep enough to decide with.
 *
 * The id is DeFiLlama's pool uuid, which is what the ranking hands over. The
 * response carries a grid of range widths with their APR already solved, so the
 * range selector reads from a table instead of computing money in the browser.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { limited } = rateLimit(req, { max: 20, windowMs: 60_000, prefix: 'pool' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const { id } = await ctx.params;
  if (!/^[a-z0-9-]{8,64}$/i.test(id)) {
    return NextResponse.json({ error: 'Unknown pool.' }, { status: 400 });
  }

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.data, { headers: { 'x-defier-cache': 'hit' } });
  }

  try {
    const pool = await findBasePool(id);
    if (!pool) return NextResponse.json({ error: 'Unknown pool.' }, { status: 404 });

    const detail = await buildPoolDetail(pool);
    if (detail?.error) {
      return NextResponse.json({ error: 'Could not read this pool on Base right now.' }, { status: 502 });
    }

    cache.set(id, { at: Date.now(), data: detail });
    if (cache.size > 60) cache.delete(cache.keys().next().value as string);
    return NextResponse.json(detail, { headers: { 'x-defier-cache': 'miss' } });
  } catch (err) {
    console.error('[pool]', { id, err });
    return NextResponse.json({ error: 'Could not read this pool on Base right now.' }, { status: 502 });
  }
}
