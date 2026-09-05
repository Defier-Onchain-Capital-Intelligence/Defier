/**
 * core/scenarios.js · What your portfolio becomes. Pure: no RPC, no fetch.
 *
 * A wallet of loose tokens has a stable exposure: hold one ETH and you hold one
 * ETH. A concentrated liquidity position does not. Its composition depends on
 * price, and at the edges of its range it converts entirely to one side.
 *
 * An ETH/USDC position is not "half ETH, half USDC". It is a conditional promise:
 * if the price rises you end up holding USDC, because the pool sold your ETH on
 * the way up; if it falls you end up holding ETH, because it bought more on the
 * way down. Showing only today's composition hides the one thing the holder
 * needs in order to decide anything.
 *
 * None of this is estimated. Tick math determines it exactly, and the formulas
 * already live in math.js: this is the same calculation evaluated at the range
 * boundary instead of at the current tick.
 */
import { STOCK_ADDRESSES } from './constants.base.js';

const sqrtOf = (tick) => Math.pow(1.0001, tick / 2);

/**
 * The token amounts a position holds once price leaves its range, on each side.
 *
 * @returns {{ up: {token0: number, token1: number}, down: {token0: number, token1: number} }}
 *   `up`   composition if price rises above the range: all of token1
 *   `down` composition if price falls below the range: all of token0
 */
export function terminalAmounts(position) {
  const liquidity = parseFloat(position.liquidity);
  if (!liquidity || !Number.isFinite(liquidity) || position.closed) {
    return { up: { token0: 0, token1: 0 }, down: { token0: 0, token1: 0 } };
  }

  const sqrtLower = sqrtOf(position.tickLower);
  const sqrtUpper = sqrtOf(position.tickUpper);
  const dec0 = position.token0.decimals;
  const dec1 = position.token1.decimals;

  // Above the range the position is entirely token1; below it, entirely token0.
  const rawToken1 = liquidity * (sqrtUpper - sqrtLower);
  const rawToken0 = liquidity * (1 / sqrtLower - 1 / sqrtUpper);

  return {
    up:   { token0: 0, token1: rawToken1 / Math.pow(10, dec1) },
    down: { token0: rawToken0 / Math.pow(10, dec0), token1: 0 },
  };
}

/** Is this pair a crypto asset against a tokenized stock? The narrative differs. */
function isCryptoVsStock(position) {
  const a = position.token0.isTokenizedStock || STOCK_ADDRESSES.has(position.token0.address);
  const b = position.token1.isTokenizedStock || STOCK_ADDRESSES.has(position.token1.address);
  return a !== b;
}

function addTo(map, token, amount, priceUsd) {
  if (!amount || amount <= 0) return;
  const key = token.address;
  const prev = map.get(key) || { symbol: token.symbol, assetClass: token.assetClass, amount: 0, valueUsd: 0 };
  prev.amount += amount;
  prev.valueUsd += amount * (priceUsd || 0);
  map.set(key, prev);
}

function toSlices(map) {
  const entries = [...map.values()];
  const total = entries.reduce((a, e) => a + e.valueUsd, 0);
  return {
    totalUsd: total,
    holdings: entries
      .map((e) => ({ ...e, pct: total > 0 ? (e.valueUsd / total) * 100 : 0 }))
      .sort((a, b) => b.valueUsd - a.valueUsd),
  };
}

/**
 * Where the whole portfolio lands in each direction.
 *
 * Loose tokens do not convert, so they appear unchanged in both scenarios. Only
 * liquidity positions move, which is precisely the point: the conversion is
 * invisible until it has already happened to you.
 *
 * Prices are held constant on purpose. This answers "what will I be holding",
 * not "what will it be worth". Mixing the two would require forecasting prices,
 * which this product does not do.
 *
 * @param {import('../types/portfolio').LpPosition[]} positions
 * @param {import('../types/portfolio').TokenHolding[]} tokens
 */
export function computeScenarios(positions, tokens) {
  const open = (positions || []).filter((p) => !p.closed && p.currentAmounts);
  const upMap = new Map();
  const downMap = new Map();

  for (const holding of tokens || []) {
    addTo(upMap, holding.token, holding.balance, holding.price?.usd);
    addTo(downMap, holding.token, holding.balance, holding.price?.usd);
  }

  const perPosition = [];

  for (const p of open) {
    const { up, down } = terminalAmounts(p);
    const price0 = p.prices?.token0?.usd || 0;
    const price1 = p.prices?.token1?.usd || 0;

    addTo(upMap, p.token1, up.token1, price1);
    addTo(downMap, p.token0, down.token0, price0);

    const stockPair = isCryptoVsStock(p);
    perPosition.push({
      id: p.id,
      symbol: p.symbol,
      kind: stockPair ? 'crypto-vs-stock' : 'crypto',
      // token1 is the upside asset because price is token0 denominated in token1:
      // price rising means token0 is being sold for token1.
      upAsset: p.token1.symbol,
      upAmount: up.token1,
      upValueUsd: up.token1 * price1,
      downAsset: p.token0.symbol,
      downAmount: down.token0,
      downValueUsd: down.token0 * price0,
      explanation: stockPair
        ? `If crypto outperforms ${p.token1.isTokenizedStock ? p.token1.symbol : p.token0.symbol}, this position ends up in ${p.token1.symbol}. If it underperforms, it ends up in ${p.token0.symbol}.`
        : `If ${p.token0.symbol} rises out of range, this position ends up entirely in ${p.token1.symbol}. If it falls out of range, entirely in ${p.token0.symbol}.`,
    });
  }

  return {
    up: toSlices(upMap),
    down: toSlices(downMap),
    perPosition,
    hasPositions: open.length > 0,
  };
}
