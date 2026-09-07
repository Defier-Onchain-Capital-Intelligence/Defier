import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { buildPortfolio } from '@/core/portfolio.js';
import { getReport, peekPortfolio } from '@/lib/reportBuild';
import { getPositionHistory } from '@/core/history.js';
import { computePositionPnl } from '@/core/pnl.js';
import { compareStrategies } from '@/core/strategies.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { at: number; data: unknown }>();

/**
 * GET /api/position/aerodrome:5484819?wallet=0x...
 *
 * The expensive half of the engine lives here on purpose. Listing a portfolio
 * does not need a position's lifetime; opening one does. Splitting them is what
 * keeps the portfolio view inside the function time limit.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wallet = (new URL(req.url).searchParams.get('wallet') || '').toLowerCase();

  if (!ADDRESS_RE.test(wallet)) {
    return NextResponse.json({ error: 'A wallet query parameter is required.' }, { status: 400 });
  }
  if (!/^[a-z0-9-]+:\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid position id. Expected protocol:tokenId.' }, { status: 400 });
  }

  const { limited } = rateLimit(req, { max: 20, windowMs: 60_000, prefix: 'position' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const cacheKey = `${wallet}:${id}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.data, { headers: { 'x-defier-cache': 'hit' } });
  }

  try {
    // Three places a position can be, cheapest first. The shallow build sees
    // what the wallet holds; the deep build additionally rebuilds positions
    // whose NFT was burned. The report links to those by name — "your worst
    // position" is usually a closed one — so answering "not found" for them
    // meant the report pointed at a screen that could not exist.
    const find = (p: { id: string }) => p.id === id;
    let position = peekPortfolio(wallet)?.positions.find(find) ?? null;

    if (!position) {
      const shallow = await buildPortfolio(wallet);
      position = shallow.positions.find(find) ?? null;
    }
    if (!position) {
      const { portfolio } = await getReport(wallet);
      position = (portfolio ?? peekPortfolio(wallet))?.positions.find(find) ?? null;
    }
    if (!position) {
      return NextResponse.json({ error: 'Position not found for this wallet.' }, { status: 404 });
    }

    // A rebuilt position already carries its timeline from the deep build.
    // Scanning again would be minutes of log reads for the same answer.
    const history = position.events?.length
      ? {
          events: position.events,
          openedAt: position.openedAt ?? null,
          closed: position.closed,
          confidence: position.confidence,
          notes: position.notes ?? [],
        }
      : await getPositionHistory({
          protocol: position.protocol,
          tokenId: position.tokenId,
          nfpmAddr: position.nfpmAddress,
          gaugeAddress: position.gaugeAddress,
          wallet,
          token0: { address: position.token0.address, decimals: position.token0.decimals },
          token1: { address: position.token1.address, decimals: position.token1.decimals },
        });

    const data = {
      ...position,
      events: history.events,
      openedAt: history.openedAt,
      closed: position.closed || history.closed,
      confidence: history.confidence,
      notes: history.notes,
      pnl: null as ReturnType<typeof computePositionPnl> | null,
      strategies: null as ReturnType<typeof compareStrategies> | null,
    };
    data.pnl = history.events.length > 0 ? computePositionPnl(data) : null;
    data.strategies = data.pnl ? compareStrategies(data) : null;

    cache.set(cacheKey, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { 'x-defier-cache': 'miss' } });
  } catch (err) {
    console.error('[position] failed', { id, err });
    return NextResponse.json({ error: 'Could not read this position right now.' }, { status: 502 });
  }
}
