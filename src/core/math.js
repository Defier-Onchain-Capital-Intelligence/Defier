/**
 * defier-core/math.js
 *
 * Pure Uniswap V3 math. No network calls, no side effects.
 * These functions are the foundation of all APR and IL calculations.
 *
 * Key concepts:
 *   sqrtPriceX96 — sqrt(price) in Q96 fixed-point format (from slot0)
 *   L (liquidity) — the liquidity unit for a position
 *   tick — log base 1.0001 of price. price = 1.0001^tick
 *   Q128 — 2^128, the fixed-point denominator for feeGrowth values
 */

import { ethers } from 'ethers';
import { Q128 } from './constants.js';

/**
 * Safe uint256 subtraction with wrap-around (mirrors Solidity uint256 underflow).
 * Needed because Uniswap V3 uses subtraction on feeGrowth accumulators which
 * intentionally wrap around when counters overflow 2^256.
 */
export function subU256(a, b) {
  const r = a.sub(b);
  return r.isNegative()
    ? r.add(ethers.constants.MaxUint256).add(1)
    : r;
}

/**
 * Compute exact fees accrued by a position using feeGrowthInside tracking.
 * This is the only accurate method for V3 positions (no estimation).
 *
 * @param {ethers.BigNumber} liquidity   - position.liquidity
 * @param {ethers.BigNumber} fg0         - pool.feeGrowthGlobal0X128
 * @param {ethers.BigNumber} fg1         - pool.feeGrowthGlobal1X128
 * @param {Array}            tL          - pool.ticks(tickLower) return values
 * @param {Array}            tU          - pool.ticks(tickUpper) return values
 * @param {ethers.BigNumber} fgI0Last    - position.feeGrowthInside0LastX128
 * @param {ethers.BigNumber} fgI1Last    - position.feeGrowthInside1LastX128
 * @param {ethers.BigNumber} tokensOwed0 - position.tokensOwed0
 * @param {ethers.BigNumber} tokensOwed1 - position.tokensOwed1
 * @param {number}           currentTick - pool.slot0.tick
 * @param {number}           tickLower   - position.tickLower
 * @param {number}           tickUpper   - position.tickUpper
 * @param {number}           dec0        - token0 decimals
 * @param {number}           dec1        - token1 decimals
 * @param {number}           fgIdx       - index of feeGrowthOutside0 in ticks() return:
 *                                         2 for Uniswap V3 / PancakeSwap V3
 *                                         3 for Aerodrome / Velodrome (extra stakedLiquidityNet at index 2)
 * @returns {{ fees0: number, fees1: number }}
 */
export function computeV3Fees(
  liquidity, fg0, fg1, tL, tU,
  fgI0Last, fgI1Last,
  tokensOwed0, tokensOwed1,
  currentTick, tickLower, tickUpper,
  dec0, dec1,
  fgIdx
) {
  const i0 = fgIdx || 2; // feeGrowthOutside0X128 index
  const i1 = i0 + 1;    // feeGrowthOutside1X128 index

  try {
    // feeGrowthBelow(tick) = feeGrowthOutside if currentTick >= tick, else global - feeGrowthOutside
    const fgBelow0 = currentTick >= tickLower ? tL[i0] : subU256(fg0, tL[i0]);
    const fgAbove0 = currentTick < tickUpper  ? tU[i0] : subU256(fg0, tU[i0]);
    const fgInside0 = subU256(subU256(fg0, fgBelow0), fgAbove0);
    const fgDelta0  = subU256(fgInside0, fgI0Last);
    // Sanity: delta > Q128 * 1e12 (impossibly large) → wrap-around artifact → treat as 0
    const earned0 = fgDelta0.gt(Q128.mul(1_000_000_000_000))
      ? ethers.BigNumber.from(0)
      : liquidity.mul(fgDelta0).div(Q128);

    const fgBelow1 = currentTick >= tickLower ? tL[i1] : subU256(fg1, tL[i1]);
    const fgAbove1 = currentTick < tickUpper  ? tU[i1] : subU256(fg1, tU[i1]);
    const fgInside1 = subU256(subU256(fg1, fgBelow1), fgAbove1);
    const fgDelta1  = subU256(fgInside1, fgI1Last);
    const earned1 = fgDelta1.gt(Q128.mul(1_000_000_000_000))
      ? ethers.BigNumber.from(0)
      : liquidity.mul(fgDelta1).div(Q128);

    return {
      fees0: parseFloat(ethers.utils.formatUnits(tokensOwed0.add(earned0), dec0)),
      fees1: parseFloat(ethers.utils.formatUnits(tokensOwed1.add(earned1), dec1)),
    };
  } catch (_) {
    // Fallback: use only tokensOwed (what the contract tracked before last interaction)
    return {
      fees0: parseFloat(ethers.utils.formatUnits(tokensOwed0, dec0)),
      fees1: parseFloat(ethers.utils.formatUnits(tokensOwed1, dec1)),
    };
  }
}

/**
 * Concentration multiplier for a range [−pctLow, +pctHigh] vs full-range.
 * A ±5% range around the current price has ~10× more fees/$ than full-range.
 *
 * Formula: 1 / (sqrt(1 - pctLow) - 1 + 1/sqrt(1 + pctHigh))
 * (simplified from the exact Uniswap V3 liquidity math)
 *
 * @param {number} paRatio  1 - pctLow  (e.g. 0.95 for −5%)
 * @param {number} pbRatio  1 + pctHigh (e.g. 1.05 for +5%)
 * @returns {number} multiplier (e.g. 10.2 for ±5%)
 */
export function concentrationMultiplier(paRatio, pbRatio) {
  if (paRatio <= 0 || pbRatio <= 0) return 1;
  return 1 / (1 - Math.sqrt(paRatio) + Math.sqrt(1 / pbRatio) - 1);
}

/**
 * Exact Uniswap V3 liquidity (L) per $1 invested for range [−pctLow, +pctHigh].
 * Works for ANY token pair (not just stablecoin pairs).
 *
 * V3 math:
 *   amount0 per unit L = (sqrtPb - sqrtP) / (sqrtP × sqrtPb)
 *   amount1 per unit L = sqrtP - sqrtPa
 *   usd_per_L = amount0_per_L × price0 / 10^dec0 + amount1_per_L × price1 / 10^dec1
 *   L_per_dollar = 1 / usd_per_L
 *
 * @param {number}      sqrtP_raw   - sqrt(price) as a plain float (sqrtPriceX96 / 2^96)
 * @param {number}      dec0        - token0 decimals
 * @param {number}      dec1        - token1 decimals
 * @param {number}      pctLow      - lower bound as fraction (e.g. 0.05 = −5%)
 * @param {number}      pctHigh     - upper bound as fraction (e.g. 0.05 = +5%)
 * @param {number|null} price0USD   - token0 USD price (null = unknown)
 * @param {number|null} price1USD   - token1 USD price (null = unknown)
 * @returns {number|null} L per dollar, or null if insufficient data
 */
export function computeLPerDollar(sqrtP_raw, dec0, dec1, pctLow, pctHigh, price0USD, price1USD) {
  if (!sqrtP_raw || pctLow <= 0 || pctLow >= 1 || pctHigh <= 0 || pctHigh >= 1) return null;

  const sqrtPa = sqrtP_raw * Math.sqrt(1 - pctLow);  // lower boundary
  const sqrtPb = sqrtP_raw * Math.sqrt(1 + pctHigh); // upper boundary

  // Raw token amounts per unit of L
  const a0_per_L = (sqrtPb - sqrtP_raw) / (sqrtP_raw * sqrtPb);
  const a1_per_L = sqrtP_raw - sqrtPa;

  // Fall back to $1 if token is 6-decimal (likely stablecoin)
  const p0 = (price0USD > 0) ? price0USD : (dec0 === 6 ? 1 : null);
  const p1 = (price1USD > 0) ? price1USD : (dec1 === 6 ? 1 : null);

  if (!p0 && !p1) return null;

  let usd_per_L = 0;
  if (p0) usd_per_L += (a0_per_L * p0) / Math.pow(10, dec0);
  if (p1) usd_per_L += (a1_per_L * p1) / Math.pow(10, dec1);
  if (usd_per_L <= 0) return null;

  return 1 / usd_per_L;
}

/**
 * Current token amounts in a V3 position using Uniswap V3 tick math.
 * Amount depends on whether currentTick is below, inside, or above the range.
 *
 * @param {{ liquidity, tickLower, tickUpper, currentTick, dec0, dec1 }} pos
 * @returns {{ amount0: number, amount1: number } | null}
 */
export function computeV3CurrentAmounts(pos) {
  const L = parseFloat(pos.liquidity);
  if (!L || !isFinite(L) || L === 0 || pos.currentTick == null) return null;

  const sqrtP = (tick) => Math.pow(1.0001, tick / 2);
  const sL = sqrtP(pos.tickLower);
  const sU = sqrtP(pos.tickUpper);
  const sC = sqrtP(pos.currentTick);

  let raw0, raw1;
  if (pos.currentTick < pos.tickLower) {        // price below range → 100% token0
    raw0 = L * (1 / sL - 1 / sU);
    raw1 = 0;
  } else if (pos.currentTick >= pos.tickUpper) { // price above range → 100% token1
    raw0 = 0;
    raw1 = L * (sU - sL);
  } else {                                        // in range → both tokens
    raw0 = L * (1 / sC - 1 / sU);
    raw1 = L * (sC - sL);
  }

  return {
    amount0: raw0 / Math.pow(10, pos.dec0),
    amount1: raw1 / Math.pow(10, pos.dec1),
  };
}

/**
 * Compute IL and position value vs HOLD scenarios.
 *
 * @param {{
 *   amtA: number,       entry amount of token A
 *   amtB: number,       entry amount of token B
 *   pA0: number,        token A price at entry
 *   pB0: number,        token B price at entry
 *   pA1: number,        token A price now
 *   pB1: number,        token B price now
 *   feesA?: number,     fees earned in token A
 *   feesB?: number,     fees earned in token B
 *   feesExtraUSD?: number, extra USD fees (emissions, etc.)
 *   curAmtA?: number,   current amounts from V3 tick math (preferred)
 *   curAmtB?: number
 * }} params
 * @returns {{ V0, V_lp, V_fees, V_lp_fees, V_hold, V_hold_all_a, V_hold_all_b, il_pct, il_net_pct, newAmtA, newAmtB, usedV3 }}
 */
export function computeIL({
  amtA, amtB, pA0, pB0, pA1, pB1,
  feesA = 0, feesB = 0, feesExtraUSD = 0,
  curAmtA = null, curAmtB = null,
}) {
  const V0         = amtA * pA0 + amtB * pB0;
  const V_hold     = amtA * pA1 + amtB * pB1;
  const V_hold_all_a = (V0 / pA0) * pA1;
  const V_hold_all_b = (V0 / pB0) * pB1;
  const V_fees     = feesA * pA1 + feesB * pB1 + feesExtraUSD;

  let newAmtA, newAmtB, V_lp, usedV3;
  if (curAmtA !== null && curAmtB !== null && isFinite(curAmtA) && isFinite(curAmtB)) {
    // V3 exact path: use tick math for current composition
    newAmtA = curAmtA;
    newAmtB = curAmtB;
    V_lp    = curAmtA * pA1 + curAmtB * pB1;
    usedV3  = true;
  } else {
    // V2 fallback (XY = k): only accurate for full-range equal-value positions
    const k  = amtA * amtB;
    V_lp     = 2 * Math.sqrt(k * pA1 * pB1);
    newAmtA  = Math.sqrt((k * pB1) / pA1);
    newAmtB  = Math.sqrt((k * pA1) / pB1);
    usedV3   = false;
  }

  const V_lp_fees  = V_lp + V_fees;
  const il_pct     = ((V_lp / V_hold) - 1) * 100;
  const il_net_pct = ((V_lp_fees / V_hold) - 1) * 100;

  return {
    V0, V_lp, V_fees, V_lp_fees,
    V_hold, V_hold_all_a, V_hold_all_b,
    il_pct, il_net_pct,
    newAmtA, newAmtB,
    usedV3,
  };
}

/**
 * Simulate LP position value at a given price scenario (for IL Simulator chart).
 *
 * @param {number} entryPrice    - price at entry (token A in USD)
 * @param {number} lowerPrice    - range lower bound (USD)
 * @param {number} upperPrice    - range upper bound (USD)
 * @param {number} samplePrice   - price to evaluate at
 * @param {number} positionUSD   - initial position size in USD
 * @param {number} aprFraction   - annual APR as decimal (e.g. 0.5 for 50%)
 * @param {number} days          - holding period in days
 * @returns {{ lpValue: number, holdValue: number, feesEarned: number, totalWithFees: number, pnlVsHold: number, inRange: boolean }}
 */
export function simulateAtPrice(entryPrice, lowerPrice, upperPrice, samplePrice, positionUSD, aprFraction, days) {
  // Initial token composition at entry price (assuming range straddles entry)
  const sqrtEntry = Math.sqrt(entryPrice);
  const sqrtLower = Math.sqrt(lowerPrice);
  const sqrtUpper = Math.sqrt(upperPrice);

  // L for this position size (using the concentrationMultiplier approach)
  // Simplified: assume entry price is in range and distribute 50/50 in value
  const half = positionUSD / 2;
  const initToken0 = half / entryPrice; // units of token0 (the "priced" token)
  const initToken1 = half;              // units of token1 (USD-denominated stable or other)

  // LP value at samplePrice using Uniswap V3 math
  let lpToken0, lpToken1;
  const sqrtSample = Math.sqrt(samplePrice);

  if (samplePrice <= lowerPrice) {
    // All in token0
    lpToken0 = initToken0 + initToken1 / entryPrice; // approximation
    lpToken1 = 0;
  } else if (samplePrice >= upperPrice) {
    // All in token1
    lpToken0 = 0;
    lpToken1 = (initToken0 * entryPrice + initToken1); // approximation
  } else {
    // Uniswap V3 sqrt math
    const sqrtRatio = sqrtSample / sqrtEntry;
    // Approximation for symmetric range: token0 decreases as price rises
    const fraction = (sqrtSample - sqrtLower) / (sqrtUpper - sqrtLower);
    const totalValue0 = (initToken0 * entryPrice + initToken1);
    lpToken0 = totalValue0 * (1 - fraction) / samplePrice;
    lpToken1 = totalValue0 * fraction;
  }

  const lpValue   = lpToken0 * samplePrice + lpToken1;
  const holdValue = initToken0 * samplePrice + initToken1;

  // Fee income: earned proportionally to time in range
  const inRange = samplePrice >= lowerPrice && samplePrice <= upperPrice;
  const feesEarned = inRange ? positionUSD * aprFraction * (days / 365) : 0;

  const totalWithFees = lpValue + feesEarned;
  const pnlVsHold     = totalWithFees - holdValue;

  return { lpValue, holdValue, feesEarned, totalWithFees, pnlVsHold, inRange };
}

/**
 * Generate simulation data points for the IL Simulator chart.
 * Returns an array of { price, lpValue, holdValue, feesEarned, totalWithFees, pnlVsHold, inRange }
 *
 * @param {number} entryPrice
 * @param {number} lowerPrice
 * @param {number} upperPrice
 * @param {number} positionUSD
 * @param {number} aprFraction   annual APR as decimal
 * @param {number} days          holding period
 * @param {number} numPoints     number of price points to sample (default 120)
 * @param {number} priceRangeMultiplier  how far to sample beyond the range (default 2×)
 * @returns {Array}
 */
export function generateSimulationCurve(
  entryPrice,
  lowerPrice,
  upperPrice,
  positionUSD,
  aprFraction,
  days,
  numPoints = 120,
  priceRangeMultiplier = 2.0
) {
  const minPrice = lowerPrice / priceRangeMultiplier;
  const maxPrice = upperPrice * priceRangeMultiplier;
  const step     = (maxPrice - minPrice) / (numPoints - 1);

  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const price = minPrice + step * i;
    const point = simulateAtPrice(
      entryPrice, lowerPrice, upperPrice,
      price, positionUSD, aprFraction, days
    );
    points.push({ price, ...point });
  }
  return points;
}


// ─── Tick to price ─────────────────────────────────────────────────────────────
/**
 * Canonical Uniswap V3 tick definition: price of token0 denominated in token1.
 * Not a derived financial formula, just the protocol's own definition of a tick,
 * adjusted for the decimals of each token.
 *
 * @param {number} tick
 * @param {number} dec0
 * @param {number} dec1
 * @returns {number} price of 1 token0 in token1 units
 */
export function tickToPrice(tick, dec0, dec1) {
  return Math.pow(1.0001, Number(tick)) * Math.pow(10, Number(dec0) - Number(dec1));
}
