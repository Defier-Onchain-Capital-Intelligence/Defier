import { NextResponse } from 'next/server';
import { saveNotificationToken, removeTokensForFid } from '@/lib/notifications';
import { verifyWebhookEnvelope } from '@/lib/farcasterVerify';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Mini App webhook. Base App posts here when someone adds or removes DeFier, or
 * turns notifications on or off. This is the only place notification permission
 * is granted, and the token it delivers IS that permission.
 *
 * Every event is verified before it changes anything: the Ed25519 signature must
 * check out, and the key that made it must be registered to that fid in
 * Farcaster's Key Registry on Optimism. See lib/farcasterVerify.ts for why the
 * second half is the part that matters.
 *
 * Because events are now proven, a disable event can safely delete tokens again:
 * the only party who can ask us to stop notifying someone is that someone.
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const verified = await verifyWebhookEnvelope(raw);
  if (!verified.ok) {
    // 503 asks the client to try again; 401 tells it not to bother. The
    // difference matters: a momentary RPC failure should not silently cost
    // someone their notifications.
    const status = verified.retryable ? 503 : 401;
    console.warn('[webhook] rejected', { reason: verified.reason });
    return NextResponse.json({ ok: false }, { status });
  }

  const { fid, event } = verified;
  const name = String(event.event ?? '');
  const details = event.notificationDetails as { url?: string; token?: string } | undefined;

  try {
    if ((name === 'miniapp_added' || name === 'frame_added' || name === 'notifications_enabled')
      && details?.token && details?.url) {
      await saveNotificationToken(fid, details.token, details.url);
    }

    if (name === 'miniapp_removed' || name === 'frame_removed'
      || name === 'notifications_disabled') {
      await removeTokensForFid(fid);
    }
  } catch (err) {
    console.error('[webhook] could not record verified event', { name, err });
    // Ask for a retry rather than dropping a real permission change on the floor.
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}

export function GET() {
  return NextResponse.json({ ok: true, note: 'Mini App webhook endpoint.' });
}
