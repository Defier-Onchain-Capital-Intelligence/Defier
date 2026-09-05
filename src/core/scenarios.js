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

/**
 * What a position is actually a bet on.
 *
 * This matters more than it looks. "If the market rises" is meaningless for a
 * WETH/NVDAc pool: that position does not care whether crypto rises, it cares
 * whether ETH rises AGAINST NVDA. A WETH/cbBTC pool is a bet on ETH against BTC,
 * and both can be true while crypto as a whole does anything at all. Rolling
 * them into one "up" and one "down" is how an answer ends up saying "the market"
 * and meaning nothing.
 */
function axisOf(position) {
  const stock0 = position.token0.isTokenizedStock || STOCK_ADDRESSES.has(position.token0.address);
  const stock1 = position.token1.isTokenizedStock || STOCK_ADDRESSES.has(position.token1.address);
  const stable0 = position.token0.assetClass === 'STABLE';
  const stable1 = position.token1.assetClass === 'STABLE';
  const s0 = position.token0.symbol;
  const s1 = position.token1.symbol;

  if (stock0 !== stock1) {
    return {
      axis: 'crypto-vs-stocks',
      label: 'crypto against stocks',
      upMeans: `${s0} gains on ${s1}`,
      downMeans: `${s1} gains on ${s0}`,
    };
  }
  if (stable0 !== stable1) {
    const risky = stable0 ? s1 : s0;
    return {
      axis: 'crypto-vs-dollar',
      label: `${risky} against the dollar`,
      upMeans: stable1 ? `${risky} rises in dollars` : `${risky} falls in dollars`,
      downMeans: stable1 ? `${risky} falls in dollars` : `${risky} rises in dollars`,
    };
  }
  return {
    axis: 'asset-vs-asset',
    label: `${s0} against ${s1}`,
    upMeans: `${s0} gains on ${s1}`,
    downMeans: `${s1} gains on ${s0}`,
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
    const axis = axisOf(p);
    perPosition.push({
      id: p.id,
      symbol: p.symbol,
      kind: stockPair ? 'crypto-vs-stock' : 'crypto',
      // Never "the market". This position's own axis, named.
      axis: axis.axis,
      axisLabel: axis.label,
      upMeans: axis.upMeans,
      downMeans: axis.downMeans,
      // token1 is the upside asset because price is token0 denominated in token1:
      // price rising means token0 is being sold for token1.
      upAsset: p.token1.symbol,
      upAmount: up.token1,
      upValueUsd: up.token1 * price1,
      downAsset: p.token0.symbol,
      downAmount: down.token0,
      downValueUsd: down.token0 * price0,
      // Say the mechanic, not just the outcome. "You end up in NVDAc" sounds like
      // a reward until you know the pool got there by selling your WETH.
      explanation: stockPair
        ? `As ${p.token0.symbol} gains on ${p.token1.symbol}, the pool sells your ${p.token0.symbol} into ${p.token1.symbol}, so you end up holding ${p.token1.symbol}. If ${p.token1.symbol} gains instead, it buys ${p.token0.symbol} the whole way and you end up holding ${p.token0.symbol}.`
        : `As ${p.token0.symbol} rises, the pool sells it into ${p.token1.symbol}; above your range you hold only ${p.token1.symbol}. As it falls, the pool buys more ${p.token0.symbol}; below your range you hold only ${p.token0.symbol}.`,
    });
  }

  // The combined view is only one story when every position tells the same one.
  const axes = [...new Set(perPosition.map((x) => x.axis))];
  const mixedAxes = axes.length > 1;

  return {
    up: toSlices(upMap),
    down: toSlices(downMap),
    perPosition,
    hasPositions: open.length > 0,
    axes,
    mixedAxes,
    /** What "up" means across the portfolio, in words, or why it cannot be said. */
    upLabel: mixedAxes
      ? 'every position moving in favour of its first asset at once'
      : (perPosition[0]?.upMeans ?? null),
    downLabel: mixedAxes
      ? 'every position moving the other way at once'
      : (perPosition[0]?.downMeans ?? null),
    caveat: mixedAxes
      ? 'These positions are not bets on the same thing, so the combined view assumes all of them move the same way at once. Read each position on its own axis below.'
      : null,
  };
}
