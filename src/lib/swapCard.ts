/**
 * The shareable version of a wallet's trades.
 *
 * Same three rules as the report card, for the same reasons: the address never
 * enters the table, the figures are read server side from the engine so a browser
 * cannot choose what a DeFier card says, and everything degrades to null when
 * storage is unconfigured.
 *
 * It reuses the `report_cards` table rather than asking for a new one, so the
 * wallet key is namespaced — a wallet has a report card and a trades card and
 * neither may overwrite the other.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { getServerSupabase } from './supabase';

const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';
export const SWAP_CARD_ID_RE = /^[23456789abcdefghijkmnpqrstuvwxyz]{6,16}$/;

export interface SwapMomentFigure {
  headline: string;
  date: string | null;
  gaveSymbol: string;
  gotSymbol: string;
  /** Which side is worth more today. Never a verdict about the decision. */
  spotlight: 'gave' | 'got';
  spotlightUsd: number;
  otherUsd: number;
  multiple: number;
}

export interface SwapCardFigures {
  v: 2;
  kind: 'swaps';
  tail: string;
  moments: SwapMomentFigure[];
  /** Trades read and trades we could price. A card without these is a boast. */
  swapsFound: number;
  swapsPriced: number;
  /** False when the transfer history was cut short, so "every trade" is unearned. */
  complete: boolean;
  builtAt: number;
}

function shortId(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function walletKey(address: string): string | null {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createHmac('sha256', secret).update(`swaps:${address.toLowerCase()}`).digest('hex');
}

export async function saveSwapCard(address: string, figures: SwapCardFigures): Promise<string | null> {
  const db = getServerSupabase();
  if (!db) return null;

  const key = walletKey(address);
  const tail = address.slice(-4);

  try {
    if (key) {
      const { data: existing } = await db
        .from('report_cards').select('id').eq('wallet_key', key).maybeSingle();
      if (existing?.id) {
        await db.from('report_cards')
          .update({ figures, address_tail: tail, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        return existing.id as string;
      }
    }

    const id = shortId();
    const { error } = await db.from('report_cards').insert({ id, wallet_key: key, address_tail: tail, figures });
    if (error) {
      console.error('[swapCard] insert failed', error);
      return null;
    }
    return id;
  } catch (err) {
    console.error('[swapCard] save failed', err);
    return null;
  }
}

export async function readSwapCard(id: string): Promise<{ id: string; figures: SwapCardFigures } | null> {
  const db = getServerSupabase();
  if (!db || !SWAP_CARD_ID_RE.test(id)) return null;
  try {
    const { data, error } = await db
      .from('report_cards').select('id, figures').eq('id', id).maybeSingle();
    if (error || !data) return null;
    const figures = data.figures as SwapCardFigures;
    // A report card id must not render as a trades card. Same table, different
    // shape, and reading one as the other would print zeroes with confidence.
    if (!figures || figures.v !== 2 || figures.kind !== 'swaps') return null;
    return { id: data.id as string, figures };
  } catch (err) {
    console.error('[swapCard] read failed', err);
    return null;
  }
}

/** Build the stored shape out of what the engine returned. No numbers from a browser. */
export function swapFiguresFrom(
  result: { moments: Array<Record<string, unknown>>; coverage: Record<string, unknown> },
  tail: string,
): SwapCardFigures {
  const moments = (result.moments || []).map((m) => {
    const gave = m.gave as { symbol?: string; valueTodayUsd?: number };
    const got = m.got as { symbol?: string; valueTodayUsd?: number };
    const spotlight = (m.spotlight === 'got' ? 'got' : 'gave') as 'gave' | 'got';
    return {
      headline: String(m.headline || ''),
      date: (m.date as string) ?? null,
      gaveSymbol: gave?.symbol || '—',
      gotSymbol: got?.symbol || '—',
      spotlight,
      spotlightUsd: Number(spotlight === 'gave' ? gave?.valueTodayUsd : got?.valueTodayUsd) || 0,
      otherUsd: Number(spotlight === 'gave' ? got?.valueTodayUsd : gave?.valueTodayUsd) || 0,
      multiple: Number(m.multiple) || 0,
    };
  });

  return {
    v: 2,
    kind: 'swaps',
    tail,
    moments,
    swapsFound: Number(result.coverage?.swapsFound) || 0,
    swapsPriced: Number(result.coverage?.swapsPriced) || 0,
    complete: result.coverage?.complete !== false,
    builtAt: Math.floor(Date.now() / 1000),
  };
}

/** The text that travels with the card. States the trade, never a verdict. */
export function swapShareText(f: SwapCardFigures): string {
  const first = f.moments[0];
  if (!first) return 'I checked what my Base wallet traded, valued at today’s prices. Nothing dramatic.';
  return `${first.headline} Checked on DeFier — every trade this wallet made on Base, valued at today’s price.`;
}
