/**
 * core/holdings.js  (Part 3). Pure: no RPC, no fetch.
 *
 * The same capital, cut a second way. Exposure answers "how much ETH risk am I
 * carrying"; holdings answers "where is my money actually sitting". Those are
 * different questions and they deserve different screens.
 *
 * Two buckets, crypto and stocks, because a tokenized share of NVDA and a
 * stablecoin move for unrelated reasons and averaging them tells you nothing.
 * Stablecoins count as crypto: they are the dry powder of a crypto portfolio,
 * not a separate asset class the user thinks about.
 *
 * Every line says where the value is — in the wallet, inside a pool, supplied to
 * a lender — because a stock sitting in a liquidity position is still a position
 * in that stock and no wallet tracker will show it to you.
 */
import { classify } from './exposure.js';

const LABELS = { ETH: 'ETH', BTC: 'BTC', STABLE: 'Stablecoins', STOCK: 'Stocks', AERO: 'AERO', OTHER: 'Other' };
const ORDER  = ['ETH', 'BTC', 'STABLE', 'STOCK', 'AERO', 'OTHER'];

/** Where a line of value lives. Ordered: wallet first, it is the part you can move today. */
const VENUE_ORDER = { wallet: 0, lp: 1, lending: 2 };

function emptyBucket() {
  return { totalUsd: 0, pctOfPortfolio: 0, walletUsd: 0, inPoolsUsd: 0, lendingUsd: 0, lines: [], byClass: [] };
}

/**
 * @param {import('../types/portfolio').LpPosition[]} positions
 * @param {import('../types/portfolio').TokenHolding[]} tokens
 * @param {import('../types/portfolio').LendingPosition[]} lending
 * @returns {import('../types/portfolio').Holdings}
 */
export function computeHoldings(positions, tokens, lending) {
  /** @type {import('../types/portfolio').HoldingLine[]} */
  const lines = [];

  for (const t of tokens || []) {
    const valueUsd = Number(t.valueUsd);
    if (!Number.isFinite(valueUsd) || valueUsd === 0) continue;
    const assetClass = t.token?.assetClass || classify(t.token?.address);
    lines.push({
      key: `wallet:${String(t.token?.address || '').toLowerCase()}`,
      venue: 'wallet',
      symbol: t.token?.symbol || '???',
      assetClass,
      amount: Number.isFinite(t.scaledBalance) ? t.scaledBalance : (Number.isFinite(t.balance) ? t.balance : null),
      unit: Number.isFinite(t.scaledBalance) ? 'shares' : 'tokens',
      valueUsd,
      detail: 'In your wallet',
      positionId: null,
      stale: t.price?.stale === true,
      priceSource: t.price?.source ?? null,
      multiplier: Number.isFinite(t.multiplier) ? t.multiplier : null,
    });
  }

  for (const p of positions || []) {
    if (p.closed || !p.currentAmounts) continue;
    for (const side of ['token0', 'token1']) {
      const token = p[side];
      const amt = Number(p.currentAmounts[side]);
      const px = Number(p.prices?.[side]?.usd);
      const valueUsd = Number.isFinite(amt) && Number.isFinite(px) ? amt * px : 0;
      if (!valueUsd) continue;
      lines.push({
        key: `lp:${p.id}:${side}`,
        venue: 'lp',
        symbol: token?.symbol || '???',
        assetClass: token?.assetClass || classify(token?.address),
        amount: amt,
        unit: 'tokens',
        valueUsd,
        detail: `Inside your ${p.symbol} position`,
        positionId: p.id,
        stale: p.prices?.[side]?.stale === true,
        priceSource: p.prices?.[side]?.source ?? null,
        multiplier: null,
      });
    }
  }

  for (const l of lending || []) {
    for (const s of l.supplied || []) {
      if (!Number.isFinite(s.valueUsd) || !s.valueUsd) continue;
      lines.push({
        key: `lend:${l.protocol}:s:${String(s.token?.address || '').toLowerCase()}`,
        venue: 'lending',
        symbol: s.token?.symbol || '???',
        assetClass: s.token?.assetClass || classify(s.token?.address),
        amount: s.amount ?? null,
        unit: 'tokens',
        valueUsd: s.valueUsd,
        detail: `Supplied to ${l.protocol === 'aave-v3' ? 'Aave' : l.protocol}`,
        positionId: null,
        stale: false,
        priceSource: null,
        multiplier: null,
      });
    }
    for (const b of l.borrowed || []) {
      if (!Number.isFinite(b.valueUsd) || !b.valueUsd) continue;
      lines.push({
        key: `lend:${l.protocol}:b:${String(b.token?.address || '').toLowerCase()}`,
        venue: 'lending',
        symbol: b.token?.symbol || '???',
        assetClass: b.token?.assetClass || classify(b.token?.address),
        amount: b.amount != null ? -b.amount : null,
        unit: 'tokens',
        valueUsd: -b.valueUsd,          // debt is negative: you owe it back
        detail: `Borrowed from ${l.protocol === 'aave-v3' ? 'Aave' : l.protocol}`,
        positionId: null,
        stale: false,
        priceSource: null,
        multiplier: null,
      });
    }
  }

  const crypto = emptyBucket();
  const stocks = emptyBucket();
  for (const line of lines) {
    const bucket = line.assetClass === 'STOCK' ? stocks : crypto;
    bucket.lines.push(line);
    bucket.totalUsd += line.valueUsd;
    if (line.venue === 'wallet') bucket.walletUsd += line.valueUsd;
    else if (line.venue === 'lp') bucket.inPoolsUsd += line.valueUsd;
    else bucket.lendingUsd += line.valueUsd;
  }

  const grand = crypto.totalUsd + stocks.totalUsd;
  for (const bucket of [crypto, stocks]) {
    bucket.pctOfPortfolio = grand > 0 ? (bucket.totalUsd / grand) * 100 : 0;
    bucket.lines.sort((a, b) =>
      (VENUE_ORDER[a.venue] - VENUE_ORDER[b.venue]) || (b.valueUsd - a.valueUsd));

    const classTotals = new Map();
    for (const line of bucket.lines) {
      classTotals.set(line.assetClass, (classTotals.get(line.assetClass) || 0) + line.valueUsd);
    }
    bucket.byClass = ORDER
      .filter((c) => classTotals.has(c))
      .map((c) => ({
        assetClass: c,
        label: LABELS[c],
        valueUsd: classTotals.get(c),
        pct: bucket.totalUsd > 0 ? (classTotals.get(c) / bucket.totalUsd) * 100 : 0,
      }));
  }

  return { crypto, stocks, totalUsd: grand };
}
