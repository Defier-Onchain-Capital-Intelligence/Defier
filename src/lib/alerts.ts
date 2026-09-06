/**
 * Range alerts: the one thing a liquidity provider cannot afford to find out late.
 *
 * A position that leaves its range stops earning immediately and silently. There
 * is no transaction, no event, nothing in a wallet to notice — the price simply
 * moved past a number. Every LP discovers it eventually; the ones who discover
 * it a week later paid for the lesson.
 *
 * The whole job is one multicall. Subscriptions are grouped by pool, each
 * distinct pool's `slot0` is read once regardless of how many people watch it,
 * and the tick that comes back is compared against each subscription's bounds.
 *
 * The state machine matters more than the check. "Out of range" is true on every
 * run until it is fixed, so firing on the condition would send the same message
 * every five minutes. We fire on the TRANSITION, and only after a baseline run
 * has established where the position already was — subscribing to a position
 * that is already out of range should not immediately shout about it.
 */
import { ethers } from 'ethers';
import { getProvider, withTimeout } from '@/core/providers.js';
import { MULTICALL3_ADDR, MULTICALL3_ABI, POOL_ABI_AERO } from '@/core/constants.js';
import { getServerSupabase } from './supabase';
import { sendNotification, type NotificationTarget } from './notifications';

export type Subscription = {
  id: number;
  fid: number;
  wallet: string;
  position_id: string;
  pool_address: string;
  tick_lower: number;
  tick_upper: number;
  pair: string;
  last_state: 'in' | 'out' | null;
};

/** Current tick for each distinct pool, in one call. */
export async function readTicks(pools: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!pools.length) return out;

  const provider = await getProvider('base');
  const multicall = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, provider);
  const iface = new ethers.utils.Interface(POOL_ABI_AERO);
  const data = iface.encodeFunctionData('slot0', []);

  const CHUNK = 60;
  for (let i = 0; i < pools.length; i += CHUNK) {
    const batch = pools.slice(i, i + CHUNK);
    try {
      const results = await withTimeout(
        multicall.callStatic.aggregate3(
          batch.map((target) => ({ target, allowFailure: true, callData: data })),
        ),
        20000,
      );
      results.forEach((r: { success: boolean; returnData: string }, idx: number) => {
        if (!r.success) return;
        try {
          const decoded = iface.decodeFunctionResult('slot0', r.returnData);
          out.set(batch[idx].toLowerCase(), Number(decoded.tick));
        } catch (_) { /* a pool we cannot decode is simply skipped this round */ }
      });
    } catch (_) { /* the next run tries again */ }
  }

  return out;
}

const stateOf = (tick: number, lower: number, upper: number): 'in' | 'out' =>
  (tick >= lower && tick < upper ? 'in' : 'out');

/**
 * One pass. Returns what happened, so the endpoint can report it without the
 * caller having to guess from a 200.
 */
export async function runAlertPass(appUrl: string) {
  const supabase = getServerSupabase();
  if (!supabase) return { ok: false, reason: 'no database configured' };

  const { data: subs } = await supabase
    .from('alert_subscriptions')
    .select('id, fid, wallet, position_id, pool_address, tick_lower, tick_upper, pair, last_state')
    .limit(2000);

  const subscriptions = (subs ?? []) as Subscription[];
  if (!subscriptions.length) return { ok: true, watched: 0, fired: 0 };

  const pools = [...new Set(subscriptions.map((s) => s.pool_address.toLowerCase()))];
  const ticks = await readTicks(pools);

  const { data: tokenRows } = await supabase
    .from('notification_tokens')
    .select('fid, token, url')
    .in('fid', [...new Set(subscriptions.map((s) => s.fid))]);

  const tokens = new Map<number, NotificationTarget>(
    (tokenRows ?? []).map((r: NotificationTarget) => [r.fid, r]),
  );

  const today = new Date().toISOString().slice(0, 10);
  let fired = 0;
  let baselined = 0;

  for (const sub of subscriptions) {
    const tick = ticks.get(sub.pool_address.toLowerCase());
    if (tick == null) continue;

    const state = stateOf(tick, sub.tick_lower, sub.tick_upper);

    // First sight of this subscription: record where it stands, say nothing.
    if (sub.last_state == null) {
      await supabase.from('alert_subscriptions').update({ last_state: state }).eq('id', sub.id);
      baselined += 1;
      continue;
    }
    if (state === sub.last_state) continue;

    const target = tokens.get(sub.fid);
    if (target) {
      const left = state === 'out';
      await sendNotification({
        targets: [target],
        // Stable per position per direction per day: a position oscillating
        // across its edge cannot turn into a stream of messages.
        notificationId: `range-${state}-${sub.position_id}-${today}`,
        title: left ? `${sub.pair} left its range` : `${sub.pair} is earning again`,
        body: left
          ? 'It stopped earning fees and is now entirely on one side of the pair.'
          : 'The price moved back inside your range, so fees are accruing again.',
        targetUrl: `${appUrl}/position/${encodeURIComponent(sub.position_id)}?wallet=${sub.wallet}`,
      });
      fired += 1;
    }

    await supabase.from('alert_subscriptions')
      .update({ last_state: state, last_fired_at: new Date().toISOString() })
      .eq('id', sub.id);
  }

  return { ok: true, watched: subscriptions.length, pools: pools.length, fired, baselined };
}
