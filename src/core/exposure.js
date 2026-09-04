/**
 * core/exposure.js  (Part 2). Pure: no RPC, no fetch.
 * LPs are decomposed by their CURRENT token amounts, not by what was deposited,
 * because an out of range position is already 100% one side. See PNL_SPEC.md.
 */
import { ASSET_CLASS_BY_ADDRESS, STOCK_ADDRESSES } from './constants.base.js';

export function classify(address) {
  const a = String(address || '').toLowerCase();
  if (STOCK_ADDRESSES.has(a)) return 'STOCK';
  return ASSET_CLASS_BY_ADDRESS[a] || 'OTHER';
}

const LABELS = { ETH: 'ETH', BTC: 'BTC', STABLE: 'Stablecoins', STOCK: 'Stocks', AERO: 'AERO', OTHER: 'Other' };
const ORDER  = ['ETH', 'BTC', 'STABLE', 'STOCK', 'AERO', 'OTHER'];

/**
 * @param {import('../types/portfolio').LpPosition[]} positions
 * @param {import('../types/portfolio').TokenHolding[]} tokens
 * @param {import('../types/portfolio').LendingPosition[]} lending
 * @returns {import('../types/portfolio').Exposure}
 */
export function computeExposure(positions, tokens, lending) {
  /** @type {Map<string, { symbol: string, assetClass: string, usd: number }>} */
  const byAddress = new Map();

  const add = (token, usd) => {
    if (!token?.address || !Number.isFinite(usd) || usd === 0) return;
    const key = token.address.toLowerCase();
    const prev = byAddress.get(key);
    if (prev) prev.usd += usd;
    else byAddress.set(key, {
      symbol: token.symbol || '???',
      assetClass: token.assetClass || classify(key),
      usd,
    });
  };

  for (const p of positions || []) {
    if (p.closed || !p.currentAmounts) continue;
    add(p.token0, p.currentAmounts.token0 * (p.prices?.token0?.usd || 0));
    add(p.token1, p.currentAmounts.token1 * (p.prices?.token1?.usd || 0));
  }
  for (const t of tokens || []) add(t.token, t.valueUsd || 0);
  for (const l of lending || []) {
    for (const s of l.supplied || []) add(s.token, s.valueUsd);
    for (const b of l.borrowed || []) add(b.token, -b.valueUsd);   // debt is negative exposure
  }

  const entries = [...byAddress.values()];
  const totalUsd = entries.reduce((acc, e) => acc + e.usd, 0);
  const pctOf = (usd) => (totalUsd > 0 ? (usd / totalUsd) * 100 : 0);

  const classTotals = new Map();
  for (const e of entries) classTotals.set(e.assetClass, (classTotals.get(e.assetClass) || 0) + e.usd);

  const byClass = ORDER
    .filter((c) => classTotals.has(c))
    .map((c) => ({
      assetClass: c,
      label: LABELS[c],
      valueUsd: classTotals.get(c),
      pct: pctOf(classTotals.get(c)),
    }));

  const byAsset = entries
    .map((e) => ({ symbol: e.symbol, valueUsd: e.usd, pct: pctOf(e.usd) }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const stablePct = pctOf(classTotals.get('STABLE') || 0);

  return { totalUsd, byClass, byAsset, marketBiasPct: 100 - stablePct };
}
