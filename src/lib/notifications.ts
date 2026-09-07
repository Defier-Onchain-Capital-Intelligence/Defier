/**
 * Native Base App notifications.
 *
 * We do not send push notifications. We ask the Base App client to send them for
 * us: it hands us a token per user when they turn notifications on, and we POST
 * to its endpoint with that token. That means no device registration, no APNs or
 * FCM, and — the part that matters here — no personal data of our own to hold.
 *
 * The limits are the client's, not ours: one notification per 30 seconds per
 * token and 100 per day. `notificationId` deduplicates against the same user for
 * 24 hours, which is what stops a position that crosses its range five times in
 * an afternoon from turning us into spam.
 */
import { getServerSupabase } from './supabase';

const TITLE_MAX = 32;
const BODY_MAX = 128;
const TOKENS_PER_REQUEST = 100;

export type NotificationTarget = { fid: number; token: string; url: string };

/** Trim to the client's limit rather than having the whole send rejected. */
function clamp(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * Record a token. One row per (fid, token), never one per fid.
 *
 * A person legitimately holds several at once — a phone and a desktop each get
 * their own — so overwriting by fid would silently cut off one of their devices.
 * The shape also kept the damage bounded back when the webhook was unverified,
 * and it is worth keeping for both reasons.
 */
export async function saveNotificationToken(fid: number, token: string, url: string) {
  const supabase = getServerSupabase();
  if (!supabase) return;
  await supabase.from('notification_tokens').upsert({
    fid, token, url, updated_at: new Date().toISOString(),
  }, { onConflict: 'fid,token' });
}

/** Revocation, from a webhook event we have proven came from that person. */
export async function removeTokensForFid(fid: number) {
  const supabase = getServerSupabase();
  if (!supabase) return;
  await supabase.from('notification_tokens').delete().eq('fid', fid);
}

/**
 * Drop tokens the client itself rejected.
 *
 * The belt to the webhook's braces. A token can stop being honoured without us
 * ever seeing an event — the app is deleted, the client rotates it — and this is
 * what keeps the table from filling with credentials that will never work again.
 */
export async function removeInvalidTokens(tokens: string[]) {
  const supabase = getServerSupabase();
  if (!supabase || !tokens.length) return;
  await supabase.from('notification_tokens').delete().in('token', tokens);
}

/** Every token a person has. More than one is normal: a phone and a desktop. */
export async function targetsForFids(fids: number[]): Promise<NotificationTarget[]> {
  const supabase = getServerSupabase();
  if (!supabase || !fids.length) return [];
  const { data } = await supabase
    .from('notification_tokens').select('fid, token, url').in('fid', fids);
  return (data ?? []) as NotificationTarget[];
}

/**
 * Send one notification to a set of targets, grouped by the endpoint that issued
 * their tokens. Returns the tokens the client rejected, which the caller should
 * treat as revoked.
 */
export async function sendNotification({
  targets, notificationId, title, body, targetUrl,
}: {
  targets: NotificationTarget[];
  notificationId: string;
  title: string;
  body: string;
  targetUrl: string;
}): Promise<{ sent: number; invalidTokens: string[] }> {
  if (!targets.length) return { sent: 0, invalidTokens: [] };

  const byUrl = new Map<string, string[]>();
  for (const t of targets) byUrl.set(t.url, [...(byUrl.get(t.url) || []), t.token]);

  let sent = 0;
  const invalidTokens: string[] = [];

  for (const [url, tokens] of byUrl) {
    for (let i = 0; i < tokens.length; i += TOKENS_PER_REQUEST) {
      const batch = tokens.slice(i, i + TOKENS_PER_REQUEST);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            notificationId: notificationId.slice(0, 128),
            title: clamp(title, TITLE_MAX),
            body: clamp(body, BODY_MAX),
            targetUrl: targetUrl.slice(0, 1024),
            tokens: batch,
          }),
        });
        if (!res.ok) continue;
        const json = await res.json().catch(() => null);
        const result = json?.result ?? json;
        sent += (result?.successfulTokens?.length ?? batch.length);
        for (const t of result?.invalidTokens ?? []) invalidTokens.push(t);
      } catch (_) {
        // A failed notification is never allowed to fail the job that triggered it.
      }
    }
  }

  return { sent, invalidTokens };
}
