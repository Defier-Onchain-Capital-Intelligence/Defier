import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
/** GET /api/position/aerodrome:12345?wallet=0x... → LpPosition with events + pnl */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ error: 'not implemented', id }, { status: 501 });
}
