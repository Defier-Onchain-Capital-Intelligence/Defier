/**
 * core/poolDetail.js · Everything one pool needs to be judged before you enter it.
 *
 * Three things the interfaces that list pools never put together:
 *
 *  1. A fee APR that is not today's lottery ticket. DeFiLlama's `apyMean30d` is
 *     the arithmetic mean of the daily APY, and a pool that spent one day with
 *     $40k of TVL and a burst of volume prints 5000% for that day, which then
 *     owns the whole month. We weight each day by the TVL it actually had, which
 *     is the same as asking what a dollar left in the pool would have earned.
 *
 *  2. That the published APR is the FULL RANGE APR: fees divided by all the
 *     liquidity, concentrated or not. It is a floor, and it is the only figure
 *     that compares two pools honestly. Concentration is a multiplier the LP
 *     chooses on top of it, not a property of the pool.
 *
 *  3. What that multiplier is actually worth here, computed against the pool's
 *     real active liquidity rather than a formula in the abstract.
 *
 * The APR grid is computed server side and handed to the UI as a table to read
 * from. The UI picks a row; it never does the arithmetic. Same rule as the rest
 * of the product.
 */
import { fetchPoolOnchainData, calcOnchainAPR } from './apr.js';
import { fetchPoolTicks, buildHistogramBuckets } from './ticks.js';
import { getTickSpacing, getPoolFeeDec, getRangePresets, classifyRisk, detectPoolType } from './pools.js';
import { tickToPrice } from './math.js';

/** Widths the slider can land on, as a fraction either side of the current price. */
const GRID = [
  0.0025, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.075,
  0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.75, 0.999,
];

/**
 * TVL weighted mean of the daily fee APR.
 *
 * Not an average of percentages. Each day contributes its own fees, and the
 * fees of a day are apyBase/365 of that day's TVL, so the honest mean over N
 * days is Σ(apy_i · tvl_i) / Σ(tvl_i). A day the pool was tiny counts as little
 * as it deserves.
 *
 * @param {Array<{timestamp: string, tvlUsd: number, apyBase: number|null, apy: number|null}>} series
 * @param {number} days
 */
export function weightedFeeApr(series, days) {
  if (!Array.isArray(series) || !series.length) return null;
  const recent = series.slice(-days);
  let num = 0;
  let den = 0;
  let counted = 0;
  for (const point of recent) {
    const tvl = Number(point?.tvlUsd);
    // apyBase is the fee side. Where it is missing, apy minus rewards is the
    // best available stand-in; where neither exists the day is simply skipped.
    const base = Number.isFinite(point?.apyBase)
      ? point.apyBase
      : (Number.isFinite(point?.apy) && Number.isFinite(point?.apyReward)
          ? point.apy - point.apyReward : null);
    if (!Number.isFinite(tvl) || tvl <= 0 || !Number.isFinite(base)) continue;
    num += base * tvl;
    den += tvl;
    counted += 1;
  }
  if (!den || counted < Math.min(3, days)) return null;
  return { aprPct: num / den, daysCovered: counted };
}

/** Daily history from DeFiLlama for one pool id. Null when unavailable. */
export async function fetchPoolSeries(poolId) {
  try {
    const res = await fetch(`https://yields.llama.fi/chart/${poolId}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : null;
  } catch (_) {
    return null;
  }
}

/** A label that tells two pools of the same pair apart. Aerodrome runs several. */
export function poolVariantLabel(pool) {
  const meta = String(pool?.poolMeta || '').trim();
  if (!meta) return null;
  const cl = meta.match(/cl(\d+)/i);
  if (cl) return `CL${cl[1]}`;
  return meta.length <= 8 ? meta : null;
}

/**
 * @param {object} pool  DeFiLlama pool object, enriched with chain/project/poolMeta
 * @returns full detail, or { error } when the chain could not be read
 */
export async function buildPoolDetail(pool) {
  const tickSpacing = getTickSpacing(pool);
  const feeDec = getPoolFeeDec(pool);

  const [onchain, series] = await Promise.all([
    fetchPoolOnchainData(pool),
    fetchPoolSeries(pool.pool),
  ]);

  if (onchain?.error) {
    return { error: onchain.error, tickSpacing, feeDec };
  }

  const emissionsPerYearUsd = Number(onchain.emissionsData?.emissionsPerYearUSD) || 0;
  const rewardLabel = onchain.emissionsData?.rewardLabel || null;

  // Emissions are shared out by liquidity in range exactly as fees are, so the
  // same per-dollar liquidity figure applies to both sides.
  const aprAt = (pctLow, pctHigh) => {
    const feeApr = calcOnchainAPR(onchain, pool, pctLow, pctHigh);
    if (feeApr == null) return null;
    const fullFee = calcOnchainAPR(onchain, pool, 0.999, 0.999);
    const concentration = fullFee && fullFee > 0 ? feeApr / fullFee : null;
    const rewardApr = emissionsPerYearUsd > 0 && concentration != null && pool.tvlUsd > 0
      ? (emissionsPerYearUsd / pool.tvlUsd) * 100 * concentration
      : null;
    return {
      pctLow, pctHigh,
      feeAprPct: feeApr,
      rewardAprPct: rewardApr,
      totalAprPct: feeApr + (rewardApr || 0),
      concentrationX: concentration,
    };
  };

  const grid = GRID.map((w) => aprAt(w, w)).filter(Boolean);
  const fullRange = aprAt(0.999, 0.999);

  // Liquidity shape. Best effort: the subgraph may be down and the RPC walk is
  // slow, so a missing histogram degrades the screen rather than failing it.
  let histogram = [];
  try {
    if (tickSpacing && onchain.poolAddr) {
      const ticks = await fetchPoolTicks(
        onchain.poolAddr, String(pool.chain || 'base').toLowerCase(),
        pool.project, tickSpacing, onchain.currentTick,
      );
      histogram = buildHistogramBuckets(ticks, onchain.currentTick, tickSpacing)
        .map((b) => ({
          ...b,
          priceAdjusted: tickToPrice((b.tickLower + b.tickUpper) / 2, onchain.d0, onchain.d1),
        }));
    }
  } catch (_) { /* the screen still works without it */ }

  const w7 = weightedFeeApr(series, 7);
  const w30 = weightedFeeApr(series, 30);

  return {
    id: pool.pool,
    symbol: pool.symbol,
    variant: poolVariantLabel(pool),
    project: pool.project,
    chain: String(pool.chain || 'base').toLowerCase(),
    poolAddress: onchain.poolAddr,
    risk: classifyRisk(pool),
    kind: detectPoolType(pool),
    feeDec,
    tickSpacing,
    tvlUsd: pool.tvlUsd ?? null,
    volumeUsd1d: pool.volumeUsd1d ?? null,
    /** Turnover. The number the fee APR is made of, before anyone annualises it. */
    volumeOverTvl: pool.tvlUsd > 0 && pool.volumeUsd1d ? pool.volumeUsd1d / pool.tvlUsd : null,
    currentTick: onchain.currentTick,
    currentPrice: tickToPrice(onchain.currentTick, onchain.d0, onchain.d1),
    decimals: { token0: onchain.d0, token1: onchain.d1 },
    prices: { token0: onchain.price0, token1: onchain.price1 },
    rewardLabel,
    emissionsPerYearUsd: emissionsPerYearUsd || null,
    /** Published figures, kept so the screen can show what everyone else shows. */
    published: {
      apyPct: pool.apy ?? null,
      apyBasePct: pool.apyBase ?? null,
      apyRewardPct: pool.apyReward ?? null,
      apyBase7dPct: pool.apyBase7d ?? null,
      apyMean30dPct: pool.apyMean30d ?? null,
    },
    /** Ours, and the only averages the UI is allowed to call an average. */
    stable: {
      feeApr7dPct: w7?.aprPct ?? null,
      feeApr7dDays: w7?.daysCovered ?? 0,
      feeApr30dPct: w30?.aprPct ?? null,
      feeApr30dDays: w30?.daysCovered ?? 0,
      method: 'Daily fee APR weighted by that day\'s TVL, so a day the pool was small cannot dominate the month.',
    },
    fullRange,
    aprGrid: grid,
    presets: getRangePresets(pool),
    histogram,
  };
}
