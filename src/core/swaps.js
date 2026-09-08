/**
 * core/swaps.js · What a wallet traded, and what those amounts are worth today.
 *
 * This does not read a DEX. It reads the wallet.
 *
 * From the wallet's point of view a swap is a transaction where one asset left
 * and another arrived, and that is true on Aerodrome, on Uniswap, through an
 * aggregator, and through whatever router launches next month. Reconstructing it
 * from transfers instead of from `Swap` events means no integration per venue and
 * no venue silently missing.
 *
 * The comparison is deliberately narrow. For each trade we say what was given and
 * what was received, and what each of those two amounts is worth at today's
 * price. That is a fact with no modelling in it: the quantities come from the
 * chain and the prices are today's. It is NOT a profit and loss. If somebody sold
 * AERO for USDC and bought ETH with that USDC the next day, this says nothing
 * about how that worked out, and the copy must not pretend otherwise — no "you
 * lost", no "you missed out". The honest sentence is "you swapped X for Y, and
 * those X are worth Z today", which is exactly what the reader can verify.
 *
 * Deliberately excluded, and why:
 *   · Anything that is not one asset out and one asset in. Adding liquidity sends
 *     two tokens and receives none; a reward claim receives one and sends none.
 *     The one-and-one rule drops both without needing to know a single protocol
 *     address.
 *   · Tokens without a price we trust. Base wallets collect airdropped scam
 *     tokens with fabricated prices, and one of those would produce the biggest
 *     number in the report. Both legs must be priced with confidence or the trade
 *     is counted as unpriced and left out.
 *   · Anything below a floor of real money, so the list is not dust.
 */

import { getAllTransfers } from './alchemy.js';
import { fetchPricesWithConfidence } from './prices.js';

const CHAIN = 'base';
const WETH = '0x4200000000000000000000000000000000000006';

/** DeFiLlama's own agreement score. Below this a price is a rumour. */
const MIN_CONFIDENCE = 0.8;
/** Floor for a trade to be worth a sentence, in dollars at today's price. */
const MIN_VALUE_USD = 100;
/** How far apart the two sides must be before the trade is interesting at all. */
const MIN_MULTIPLE = 2;

/**
 * Net every transfer of a transaction by asset, and keep the ones that came out
 * as exactly one asset given and one received.
 *
 * Netting first is what makes routers survivable: a swap that pays with ETH and
 * gets a refund of unspent ETH shows up as ETH out, ETH in and a token in, which
 * would fail a naive count. Netted, it is one ETH out and one token in.
 *
 * @param {Array<{txHash:string, ts:string|null, blockNumber:number, from:string,
 *   to:string, token:string, symbol:string|null, amount:number}>} transfers
 * @param {string} wallet
 * @returns {{swaps: Array<object>, skipped: {oneSided: number, complex: number}}}
 */
export function groupTransfersIntoSwaps(transfers, wallet) {
  const me = String(wallet || '').toLowerCase();
  const byTx = new Map();
  const seen = new Set();

  for (const t of transfers || []) {
    if (!t?.txHash || !t.token || !Number.isFinite(t.amount)) continue;
    // The two directions are fetched separately, so a transfer from the wallet to
    // itself arrives twice. Identical rows are the same event.
    const fingerprint = `${t.txHash}|${t.token}|${t.from}|${t.to}|${t.amount}|${t.blockNumber}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    const outgoing = t.from === me;
    const incoming = t.to === me;
    if (outgoing === incoming) continue; // neither, or a transfer to itself

    let tx = byTx.get(t.txHash);
    if (!tx) {
      tx = { txHash: t.txHash, ts: t.ts, blockNumber: t.blockNumber, net: new Map(), symbols: new Map() };
      byTx.set(t.txHash, tx);
    }
    if (!tx.ts && t.ts) tx.ts = t.ts;
    if (t.symbol && !tx.symbols.has(t.token)) tx.symbols.set(t.token, t.symbol);
    tx.net.set(t.token, (tx.net.get(t.token) || 0) + (incoming ? t.amount : -t.amount));
  }

  const swaps = [];
  const skipped = { oneSided: 0, complex: 0 };

  for (const tx of byTx.values()) {
    const gave = [];
    const got = [];
    for (const [token, net] of tx.net) {
      // Floating point leaves crumbs when a token goes in and out of the same
      // transaction. A residue this small is not a leg of anything.
      if (Math.abs(net) < 1e-12) continue;
      const leg = { token, symbol: tx.symbols.get(token) || null, amount: Math.abs(net) };
      (net < 0 ? gave : got).push(leg);
    }

    if (gave.length === 0 || got.length === 0) { skipped.oneSided += 1; continue; }
    if (gave.length > 1 || got.length > 1) { skipped.complex += 1; continue; }

    swaps.push({
      txHash: tx.txHash,
      ts: tx.ts,
      blockNumber: tx.blockNumber,
      gave: gave[0],
      got: got[0],
    });
  }

  swaps.sort((a, b) => a.blockNumber - b.blockNumber);
  return { swaps, skipped };
}

/**
 * Attach today's value to both legs, dropping every trade we cannot price.
 *
 * A missing price is reported as unpriced, never as zero. Zero would rank a
 * trade as spectacular for the exact reason we know nothing about it.
 *
 * @param {Array<object>} swaps
 * @param {Map<string, {price: number, confidence: number|null}>} prices  key `base:0x…`
 */
export function valueSwaps(swaps, prices) {
  const valued = [];
  const unpriced = new Set();

  for (const s of swaps || []) {
    const a = prices?.get(`${CHAIN}:${s.gave.token}`);
    const b = prices?.get(`${CHAIN}:${s.got.token}`);
    const trusted = (p) => p && p.price > 0 && (p.confidence ?? 0) >= MIN_CONFIDENCE;

    if (!trusted(a)) unpriced.add(s.gave.token);
    if (!trusted(b)) unpriced.add(s.got.token);
    if (!trusted(a) || !trusted(b)) continue;

    valued.push({
      ...s,
      gave: { ...s.gave, priceToday: a.price, valueTodayUsd: s.gave.amount * a.price },
      got: { ...s.got, priceToday: b.price, valueTodayUsd: s.got.amount * b.price },
    });
  }

  return { valued, unpriced: [...unpriced] };
}

/** A compact amount: enough digits to be recognisable, never more. */
function amountLabel(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return Math.round(n).toLocaleString('en-US');
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 0.0001) return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
  return n.toExponential(2);
}

function usdLabel(n) {
  if (!Number.isFinite(n)) return '—';
  const rounded = n >= 100 ? Math.round(n) : Number(n.toFixed(2));
  return `$${rounded.toLocaleString('en-US')}`;
}

function dateLabel(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * One sentence per trade, in the only framing the data supports.
 *
 * The spotlight goes on whichever side is worth more today, because that is the
 * side the reader did not end up holding the value of — and it is stated as an
 * amount, not as a verdict. "Those 5,000 AERO are $4,000 today" is checkable.
 * "You lost $3,500" is a claim about a decision we did not observe.
 */
export function headlineFor(m) {
  const when = dateLabel(m.ts);
  const lead = when ? `On ${when} you swapped` : 'You swapped';
  const gaveTxt = `${amountLabel(m.gave.amount)} ${m.gave.symbol || 'tokens'}`;
  const gotTxt = `${amountLabel(m.got.amount)} ${m.got.symbol || 'tokens'}`;
  const spotlightGave = m.gave.valueTodayUsd >= m.got.valueTodayUsd;
  const side = spotlightGave ? m.gave : m.got;
  const sideTxt = spotlightGave ? gaveTxt : gotTxt;
  return `${lead} ${gaveTxt} for ${gotTxt}. Those ${sideTxt} are ${usdLabel(side.valueTodayUsd)} today.`;
}

/**
 * The handful of trades worth showing somebody.
 *
 * Ranked by the plain dollar gap between the two sides at today's price, with a
 * floor on size so dust cannot win and a floor on the gap so an ordinary trade
 * does not get dressed up as a story. Nothing here is a recommendation and
 * nothing here is a score.
 */
export function pickMoments(valued, { limit = 3, minValueUsd = MIN_VALUE_USD, minMultiple = MIN_MULTIPLE } = {}) {
  return (valued || [])
    .map((s) => {
      const hi = Math.max(s.gave.valueTodayUsd, s.got.valueTodayUsd);
      const lo = Math.min(s.gave.valueTodayUsd, s.got.valueTodayUsd);
      return { ...s, gapUsd: hi - lo, multiple: lo > 0 ? hi / lo : Infinity, peakUsd: hi };
    })
    .filter((s) => s.peakUsd >= minValueUsd && s.multiple >= minMultiple)
    .sort((a, b) => b.gapUsd - a.gapUsd)
    .slice(0, limit)
    .map((s) => ({
      txHash: s.txHash,
      date: s.ts,
      gave: s.gave,
      got: s.got,
      gapUsd: s.gapUsd,
      multiple: s.multiple,
      /** Which side is worth more today. Not a judgement about the decision. */
      spotlight: s.gave.valueTodayUsd >= s.got.valueTodayUsd ? 'gave' : 'got',
      headline: headlineFor(s),
    }));
}

/**
 * The whole thing, from transfers already fetched.
 *
 * Kept separate from the fetching so it can be tested against fixtures without a
 * network, which is the only way the exclusion rules above stay honest.
 */
export function buildSwapMoments({ wallet, transfers, prices, limit = 3 }) {
  const { swaps, skipped } = groupTransfersIntoSwaps(transfers, wallet);
  const { valued, unpriced } = valueSwaps(swaps, prices);
  const moments = pickMoments(valued, { limit });

  return {
    moments,
    coverage: {
      /** Transactions that looked like one asset out, one asset in. */
      swapsFound: swaps.length,
      /** Of those, the ones where both sides had a price we trust. */
      swapsPriced: valued.length,
      /** Tokens we refused to value, so the reader knows what is missing. */
      tokensUnpriced: unpriced.length,
      /** Transfers that were not swaps at all: deposits, claims, LP moves. */
      notSwaps: skipped.oneSided + skipped.complex,
      /**
       * The sentence the UI and any agent must repeat. These are trades, valued
       * at today's price on both sides — not a profit and loss, and not a claim
       * about what the wallet did with the proceeds.
       */
      meaning: 'Each trade is valued at today’s price on both sides. This is not a profit and loss and does not follow what happened to the proceeds.',
    },
  };
}

export const SWAP_RULES = { MIN_CONFIDENCE, MIN_VALUE_USD, MIN_MULTIPLE };


/**
 * Fetch what this wallet traded and value it, or say why we could not.
 *
 * Without the transfers index there is no cheap way to ask "every token this
 * wallet ever moved", and a chunked log scan over Base's history is not something
 * a request can afford. So the answer in that case is that we did not look, which
 * the caller must not render as "no interesting trades".
 */
export async function getSwapMoments(wallet, { limit = 3 } = {}) {
  const address = String(wallet || '').toLowerCase();
  const transfers = await getAllTransfers({ wallet: address });
  if (transfers === null) {
    return {
      moments: [],
      coverage: { available: false, reason: 'The transfer index is not available, so trades were not read.' },
    };
  }

  const { swaps, skipped } = groupTransfersIntoSwaps(transfers, address);
  const tokens = [...new Set(swaps.flatMap((s) => [s.gave.token, s.got.token]))]
    .map((addr) => ({ chain: CHAIN, address: addr }));
  const prices = await fetchPricesWithConfidence(tokens);

  const built = buildSwapMoments({ wallet: address, transfers, prices, limit });
  return { ...built, coverage: { available: true, ...built.coverage, transfersRead: transfers.length, notSwaps: skipped.oneSided + skipped.complex } };
}
