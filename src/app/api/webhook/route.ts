import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Mini App webhook. Base App posts here when someone adds or removes the app,
 * which is how notification permission is granted and revoked.
 *
 * It accepts and acknowledges today without acting: notifications arrive with
 * the alerts work, and an endpoint that silently drops events is better than a
 * manifest pointing at a 404. Events are not trusted or stored until the
 * signature verification that belongs with that feature exists.
 */
export async function POST(req: Request) {
  try {
    await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export function GET() {
  return NextResponse.json({ ok: true, note: 'Mini App webhook endpoint.' });
}
