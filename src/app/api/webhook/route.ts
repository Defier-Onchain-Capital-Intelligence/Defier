import { NextResponse } from 'next/server';
import { saveNotificationToken, removeNotificationToken } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

/**
 * Mini App webhook. Base App posts here when someone adds or removes DeFier, or
 * turns notifications on or off. This is the only place notification permission
 * is granted, and the token it delivers IS that permission.
 *
 * The payload is signed as a Farcaster JSON Farcaster Signature: three base64url
 * segments, header.payload.signature, where the header names the signing fid. We
 * read the fid from the header and the event from the payload.
 *
 * Verification note: the signature is not cryptographically checked here yet, so
 * this endpoint is treated as untrusted input. What that limits is real and
 * bounded — the worst a forged event can do is register a notification token
 * against a wrong fid, or delete one, and no notification can be delivered
 * without a token the client itself issued. It is written down rather than
 * papered over, and it is the first thing to close before launch.
 */

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = raw as { header?: string; payload?: string; event?: string };

  // Signed envelope, or a bare event in local testing.
  const header = typeof body.header === 'string' ? decodeSegment(body.header) : null;
  const payload = typeof body.payload === 'string' ? decodeSegment(body.payload) : (raw as Record<string, unknown>);

  const fid = Number(header?.fid ?? (raw as { fid?: number }).fid);
  const event = String(payload?.event ?? '');
  const details = payload?.notificationDetails as { url?: string; token?: string } | undefined;

  try {
    if ((event === 'miniapp_added' || event === 'frame_added'
      || event === 'notifications_enabled') && details?.token && details?.url) {
      if (Number.isFinite(fid) && fid > 0) {
        await saveNotificationToken(fid, details.token, details.url);
      }
    }

    if (event === 'miniapp_removed' || event === 'frame_removed'
      || event === 'notifications_disabled') {
      if (Number.isFinite(fid) && fid > 0) await removeNotificationToken(fid);
    }
  } catch (err) {
    console.error('[webhook] could not record event', { event, err });
    // Still acknowledge: a client that gets an error retries, and a retry storm
    // over a database blip helps nobody.
  }

  return NextResponse.json({ ok: true });
}

export function GET() {
  return NextResponse.json({ ok: true, note: 'Mini App webhook endpoint.' });
}
