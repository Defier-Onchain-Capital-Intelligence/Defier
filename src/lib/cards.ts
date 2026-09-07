/**
 * Storage for share cards.
 *
 * Three rules this module enforces, all of them Alberto's:
 *
 *   1. The address never leaves the server. A row holds the last four
 *      characters and an HMAC. The HMAC is a one-way function of the address,
 *      it exists only so re-sharing updates one row instead of littering the
 *      table, and it cannot be turned back into the wallet it came from.
 *   2. The figures are the engine's. Callers pass a CardFigures built by
 *      figuresFrom() out of a real report, never numbers from a request body.
 *   3. Degrade, do not throw. With Supabase unconfigured every function here
 *      returns null and the share falls back to a plain link.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { getServerSupabase } from './supabase';
import type { CardFigures } from './reportCopy';

/** No 0/o/1/l: these ids get read aloud and retyped. */
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';
const ID_LENGTH = 10;

export const CARD_ID_RE = /^[23456789abcdefghijkmnpqrstuvwxyz]{6,16}$/;

function shortId(): string {
  const bytes = randomBytes(ID_LENGTH);
  let out = '';
  for (let i = 0; i < ID_LENGTH; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * A stable, non-reversible handle for an address. Uses the Supabase secret,
 * which never reaches a browser, so the digest cannot be recomputed by anyone
 * holding a list of addresses.
 */
function walletKey(address: string): string | null {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createHmac('sha256', secret).update(address.toLowerCase()).digest('hex');
}

export interface StoredCard {
  id: string;
  figures: CardFigures;
  createdAt: string;
}

/**
 * Save (or refresh) the card for an address and return its short id.
 * Null when Supabase is not configured: the caller shares a plain link instead.
 */
export async function saveCard(address: string, figures: CardFigures): Promise<string | null> {
  const db = getServerSupabase();
  if (!db) return null;

  const key = walletKey(address);
  const tail = address.slice(-4);

  try {
    if (key) {
      const { data: existing } = await db
        .from('report_cards')
        .select('id')
        .eq('wallet_key', key)
        .maybeSingle();

      if (existing?.id) {
        await db
          .from('report_cards')
          .update({ figures, address_tail: tail, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        return existing.id as string;
      }
    }

    const id = shortId();
    const { error } = await db
      .from('report_cards')
      .insert({ id, wallet_key: key, address_tail: tail, figures });

    if (error) {
      console.error('[cards] insert failed', error);
      return null;
    }
    return id;
  } catch (err) {
    console.error('[cards] save failed', err);
    return null;
  }
}

/** The stored card, or null when it does not exist or Supabase is unreachable. */
export async function readCard(id: string): Promise<StoredCard | null> {
  const db = getServerSupabase();
  if (!db || !CARD_ID_RE.test(id)) return null;

  try {
    const { data, error } = await db
      .from('report_cards')
      .select('id, figures, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    const figures = data.figures as CardFigures;
    if (!figures || figures.v !== 1) return null;

    return { id: data.id as string, figures, createdAt: data.created_at as string };
  } catch (err) {
    console.error('[cards] read failed', err);
    return null;
  }
}

/** Best effort view count. A failure here must never affect the page. */
export async function bumpCardViews(id: string): Promise<void> {
  const db = getServerSupabase();
  if (!db || !CARD_ID_RE.test(id)) return;
  try {
    await db.rpc('bump_card_views', { card_id: id });
  } catch (_) { /* traction metric, not a feature */ }
}
