import { NextResponse } from 'next/server';
import { generateSimulationCurve } from '@/core/math.js';
import type { SimulationInput } from '@/types/portfolio';
/** POST /api/simulate → SimulationPoint[] (pure math, no RPC). */
export async function POST(req: Request) {
  const body = (await req.json()) as SimulationInput;
  // TODO(Part 2): validate body, then call generateSimulationCurve(...) with the signature in core/math.js
  return NextResponse.json({ error: 'not implemented', received: body }, { status: 501 });
}
