import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';
import { getServerSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const POSITION_RE = /^[a-z0-9-]+:\d+$/;

/**
 * Subscribe or unsubscribe one position to range alerts.
 *
 * The fid comes from the Mini App context, which the client reads from Base App.
 * It is not cryptographically proven here yet: what that allows is bounded — a
 * forged fid could subscribe someone else to a notification about a wallet they
 * do not own, and nothing more, since no message can be delivered without a
 * token Base App issued to that person. Written down rather than glossed over,
 * and closed with Quick Auth before launch.
 */
export async function POST(req: Request) {
  const { limited } = rateLimit(req, { max: 30, windowMs: 60_000, prefix: 'alerts' });
  if (limited) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Alerts are not available yet.' }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const fid = Number(body.fid);
  const wallet = String(body.wallet || '').toLowerCase();
  const positionId = String(body.positionId || '');
  const enable = body.enable !== false;

  if (!Number.isInteger(fid) || fid <= 0) {
    return NextResponse.json({ error: 'Alerts need Base App. Open DeFier there to turn them on.' }, { status: 400 });
  }
  if (!ADDRESS_RE.test(wallet) || !POSITION_RE.test(positionId)) {
    return NextResponse.json({ error: 'Invalid wallet or position.' }, { status: 400 });
  }

  try {
    if (!enable) {
      await supabase.from('alert_subscriptions').delete().eq('fid', fid).eq('position_id', positionId);
      return NextResponse.json({ ok: true, enabled: false });
    }

    // Notifications must already be on: the token is the permission, and without
    // one there is nobody to deliver to.
    const { data: token } = await supabase
      .from('notification_tokens').select('fid').eq('fid', fid).maybeSingle();
    if (!token) {
      return NextResponse.json({
        error: 'Turn on notifications for DeFier in Base App first, then try again.',
      }, { status: 409 });
    }

    const poolAddress = String(body.poolAddress || '').toLowerCase();
    const tickLower = Number(body.tickLower);
    const tickUpper = Number(body.tickUpper);
    const pair = String(body.pair || '').slice(0, 32);

    if (!ADDRESS_RE.test(poolAddress) || !Number.isInteger(tickLower) || !Number.isInteger(tickUpper)
      || tickUpper <= tickLower) {
      return NextResponse.json({ error: 'Invalid position range.' }, { status: 400 });
    }

    await supabase.from('alert_subscriptions').upsert({
      fid, wallet, position_id: positionId, pool_address: poolAddress,
      tick_lower: tickLower, tick_upper: tickUpper, pair,
      last_state: null,   // baseline on the next pass, so it does not fire at once
    }, { onConflict: 'fid,position_id' });

    return NextResponse.json({ ok: true, enabled: true });
  } catch (err) {
    console.error('[alerts]', err);
    return NextResponse.json({ error: 'Could not save that alert.' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const supabase = getServerSupabase();
  if (!supabase) return NextResponse.json({ positionIds: [] });

  const fid = Number(new URL(req.url).searchParams.get('fid'));
  if (!Number.isInteger(fid) || fid <= 0) return NextResponse.json({ positionIds: [] });

  const { data } = await supabase
    .from('alert_subscriptions').select('position_id').eq('fid', fid);
  return NextResponse.json({ positionIds: (data ?? []).map((r: { position_id: string }) => r.position_id) });
}
