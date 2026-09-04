import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
/**
 * GET /api/pools?stocks=1 → Aerodrome (and Uni V3) pools on Base from DeFiLlama, filtered with
 * ALLOWED_CHAINS/isAllowedProject/isAllowedPool (core/pools.js) + FACTORY_CONFIG, plus apyBase7d / apyMean30d.
 * Port from defier-web/src/app/api/pools/route.ts, restrict chain to Base, add `hasStock` flag using STOCK_ADDRESSES.
 */
export async function GET() {
  return NextResponse.json({ error: 'not implemented' }, { status: 501 });
}
