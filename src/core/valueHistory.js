/**
 * What this wallet's liquidity was worth, day by day, against holding.
 *
 * The report answers "did providing liquidity beat holding" with one number at
 * one moment. That number hides its own history: a position can spend months
 * behind and end ahead, and the owner never sees which it was. This rebuilds
 * both sides for every day since the first position.
 *
 * The arithmetic is deliberately the same as core/pnl.js with "today" replaced
 * by "that day", so the last point lands on the report's headline rather than
 * near it. Not identically: pnl.js reads the pool's live state and a spot price,
 * this reads a daily price series, so the two disagree by whatever those two
 * sources disagree by. Same quantity, same formula, two clocks. What must never
 * happen is a curve that ends somewhere else for a reason — that would be a
 * second opinion the reader has no way to adjudicate.
 *
 *   LP(d)   = what is still inside the position at that day's price
 *             + everything already withdrawn, at the price of its own day
 *   HODL(d) = the tokens deposited up to that day, valued at that day's price
 *
 * What is NOT in the curve: fees and emissions. They are earnings, not capital,
 * and the report shows them separately. Folding them in would draw a line that
 * rises even when the capital is losing, which is the flattering-but-false shape
 * this product exists to avoid.
 */
import { fetchPriceSeries } from './prices.js';
import { computeV3CurrentAmounts, tickFromPrice } from './math.js';

const CHAIN = 'base';
const DAY = 86400;

const dayOf = (ts) => Math.floor(Number(ts) / DAY);

/** Nearest known price at or before this day, so one missing point is not a hole. */
function priceOn(series, day, maxLookback = 7) {
  for (let i = 0; i <= maxLookback; i += 1) {
    const hit = series.get(day - i);
    if (hit > 0) return hit;
  }
  return null;
}

/**
 * The daily curve for a set of positions.
 *
 * @param {import('../types/portfolio').LpPosition[]} positions
 * @returns {Promise<import('../types/portfolio').ValueHistory>}
 */
export async function buildValueHistory(positions, { series: injected = null } = {}) {
  const notes = [];
  const usable = (positions || []).filter(
    (p) => p.kind !== 'amm' && p.events?.length && p.tickLower != null && p.tickUpper != null,
  );

  if (usable.length === 0) {
    return { points: [], positionsCovered: 0, positionsTotal: (positions || []).length,
             firstDay: null, complete: false, notes: ['No position has a reconstructed history to draw.'] };
  }

  const firstTs = Math.min(...usable.map((p) => Math.min(...p.events.map((e) => e.timestamp || Infinity))));
  if (!Number.isFinite(firstTs)) {
    return { points: [], positionsCovered: 0, positionsTotal: positions.length,
             firstDay: null, complete: false, notes: ['Event timestamps are missing, so no day can be placed.'] };
  }

  // One request per token for the whole span, rather than one per token per day.
  const tokens = new Map();
  for (const p of usable) {
    tokens.set(p.token0.address.toLowerCase(), p.token0.decimals);
    tokens.set(p.token1.address.toLowerCase(), p.token1.decimals);
  }
  // Injected series is how this is tested: the arithmetic below decides whether
  // the curve agrees with the report, and that question should not depend on a
  // network call to a price API.
  const series = injected || new Map(await Promise.all(
    [...tokens.keys()].map(async (addr) => [addr, await fetchPriceSeries(CHAIN, addr, firstTs)]),
  ));

  // A position whose token has no price series cannot be valued on any day.
  // It is named and left out rather than drawn as a flat line.
  const covered = usable.filter((p) => {
    const has0 = series.get(p.token0.address.toLowerCase());
    const has1 = series.get(p.token1.address.toLowerCase());
    if (has0 && has1) return true;
    notes.push(`${p.token0.symbol}/${p.token1.symbol}: no historical price series, so it is not in the curve.`);
    return false;
  });

  if (covered.length === 0) {
    return { points: [], positionsCovered: 0, positionsTotal: positions.length,
             firstDay: dayOf(firstTs), complete: false, notes };
  }

  // Per position, the running state the curve needs, replayed in event order.
  const timelines = covered.map((p) => {
    const events = [...p.events].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return { p, events, index: 0, liquidity: 0, dep0: 0, dep1: 0, withdrawnUsd: 0 };
  });

  const today = dayOf(Date.now() / 1000);
  const points = [];

  for (let day = dayOf(firstTs); day <= today; day += 1) {
    const endOfDay = (day + 1) * DAY;
    let lpUsd = 0;
    let hodlUsd = 0;
    let open = 0;

    for (const t of timelines) {
      // Advance this position's state through every event up to the end of the day.
      while (t.index < t.events.length && (t.events[t.index].timestamp || 0) < endOfDay) {
        const e = t.events[t.index];
        if (e.liquidityDelta) {
          const delta = parseFloat(e.liquidityDelta);
          if (Number.isFinite(delta)) t.liquidity += delta;
        }
        if (e.type === 'mint' || e.type === 'increase') {
          t.dep0 += e.amount0 || 0;
          t.dep1 += e.amount1 || 0;
        }
        if (e.type === 'decrease') {
          // Valued at the price of the day it was taken, exactly as pnl.js does.
          t.withdrawnUsd += (e.amount0Usd || 0) + (e.amount1Usd || 0);
        }
        t.index += 1;
      }

      if (t.dep0 === 0 && t.dep1 === 0) continue;

      const price0 = priceOn(series.get(t.p.token0.address.toLowerCase()), day);
      const price1 = priceOn(series.get(t.p.token1.address.toLowerCase()), day);
      if (!(price0 > 0) || !(price1 > 0)) continue;

      // HODL: the tokens put in so far, at this day's price.
      hodlUsd += t.dep0 * price0 + t.dep1 * price1;

      // LP: what is still inside, plus what already came out.
      let insideUsd = 0;
      if (t.liquidity > 0) {
        const tick = tickFromPrice(price0 / price1, t.p.token0.decimals, t.p.token1.decimals);
        if (tick != null) {
          const amounts = computeV3CurrentAmounts({
            liquidity: String(t.liquidity),
            currentTick: tick,
            tickLower: t.p.tickLower,
            tickUpper: t.p.tickUpper,
            dec0: t.p.token0.decimals,
            dec1: t.p.token1.decimals,
          });
          if (amounts) insideUsd = amounts.amount0 * price0 + amounts.amount1 * price1;
        }
        open += 1;
      }
      lpUsd += insideUsd + t.withdrawnUsd;
    }

    points.push({
      day,
      timestamp: day * DAY,
      lpUsd,
      hodlUsd,
      divergenceUsd: lpUsd - hodlUsd,
      positionsOpen: open,
    });
  }

  return {
    points,
    positionsCovered: covered.length,
    positionsTotal: (positions || []).length,
    firstDay: dayOf(firstTs),
    complete: covered.length === usable.length && usable.length === (positions || []).length,
    notes,
  };
}
