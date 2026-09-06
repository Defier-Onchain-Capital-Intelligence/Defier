import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { generateSimulationCurve, compositionAtPrice } from '@/core/math.js';
import type { SimulationInput } from '@/types/portfolio';

export const dynamic = 'force-dynamic';

/**
 * POST /api/simulate → the LP versus HODL curve.
 *
 * Pure math, no chain reads, so it answers instantly. This is the screen where a
 * user stops asking what happened and starts asking what would happen, which is
 * the whole reason for reconstructing the past accurately in the first place.
 */
export async function POST(req: Request) {
  const { limited } = rateLimit(req, { max: 60, windowMs: 60_000, prefix: 'simulate' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  let body: SimulationInput;
  try {
    body = (await req.json()) as SimulationInput;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const entryPrice = num(body.entryPrice);
  const lowerPrice = num(body.lowerPrice);
  const upperPrice = num(body.upperPrice);
  const positionUsd = num(body.positionUsd);
  const aprPct = num(body.aprPct) ?? 0;
  const days = num(body.days) ?? 30;

  if (!entryPrice || !lowerPrice || !upperPrice || !positionUsd) {
    return NextResponse.json({ error: 'entryPrice, lowerPrice, upperPrice and positionUsd are required.' }, { status: 400 });
  }
  if (entryPrice <= 0 || lowerPrice <= 0 || upperPrice <= lowerPrice) {
    return NextResponse.json({ error: 'The upper bound must be above the lower bound, and prices must be positive.' }, { status: 400 });
  }
  if (positionUsd <= 0 || positionUsd > 1_000_000_000) {
    return NextResponse.json({ error: 'Position size is out of range.' }, { status: 400 });
  }
  if (days <= 0 || days > 3650) {
    return NextResponse.json({ error: 'Horizon must be between 1 and 3650 days.' }, { status: 400 });
  }

  const raw = generateSimulationCurve(
    entryPrice, lowerPrice, upperPrice, positionUsd, aprPct / 100, days
  );

  // What the position would BE at each price, not only what it would be worth.
  // The conversion is the part nobody sees coming, so it travels with the curve.
  const points = raw.map((p: { price: number }) => ({
    ...p,
    ...compositionAtPrice(lowerPrice, upperPrice, p.price),
  }));

  return NextResponse.json({ points });
}
