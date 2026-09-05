/**
 * core/pnl.js · Implements specs/PNL_SPEC.md. Pure: no RPC, no fetch.
 *
 * This is the file the product is about. Everything else exists to feed it.
 *
 * The question is "did providing liquidity beat simply holding those tokens",
 * and answering it honestly means three commitments:
 *
 *   1. Every deposit is valued at the price on the day it was made, and each
 *      deposit separately. Averaging them, or using today's price, produces a
 *      number that looks precise and is wrong.
 *   2. The HODL benchmark is the tokens actually deposited, valued today. Not
 *      100% of token A, not 100% of token B; those are shown as secondary
 *      curiosities because they answer a question nobody asked.
 *   3. When an input is missing, the result says so. A P&L that silently fills
 *      a gap with an assumption is worse than one that admits the gap.
 *
 * @typedef {import('../types/portfolio').LpPosition} LpPosition
 * @typedef {import('../types/portfolio').PositionPnl} PositionPnl
 */
import { simulateAtPrice } from './math.js';

const sum = (values) => values.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
const DAY = 86400;

/**
 * P&L of one position from its live state and its event history.
 *
 * @param {LpPosition} pos
 * @returns {PositionPnl}
 */
export function computePositionPnl(pos) {
  const notes = [];
  let confidence = 'full';
  const degrade = (note) => { confidence = 'partial'; if (!notes.includes(note)) notes.push(note); };

  const events = pos.events || [];
  if (events.length === 0) {
    return emptyPnl(pos, ['No event history, so entry capital and the HODL comparison cannot be computed.']);
  }

  const priceNow0 = pos.prices?.token0?.usd ?? null;
  const priceNow1 = pos.prices?.token1?.usd ?? null;
  if (priceNow0 == null || priceNow1 == null) {
    return emptyPnl(pos, ['Current prices are unavailable for this pair.']);
  }

  const deposits  = events.filter((e) => e.type === 'mint' || e.type === 'increase');
  const withdraws = events.filter((e) => e.type === 'decrease');
  const collects  = events.filter((e) => e.type === 'collect');
  const claims    = events.filter((e) => e.type === 'claim_rewards');

  if (deposits.length === 0) degrade('No deposit event was found, so initial capital is incomplete.');

  // ── V0: initial capital, each deposit at its own price (spec item 1) ────────
  const missingDepositPrice = deposits.some((e) => e.amount0Usd == null || e.amount1Usd == null);
  if (missingDepositPrice) degrade('A historical price was missing for a deposit, so initial capital is understated.');
  const initialCapitalUsd = sum(deposits.flatMap((e) => [e.amount0Usd, e.amount1Usd]));

  // ── W: withdrawals, at the price of the day they were taken (item 2) ───────
  if (withdraws.some((e) => e.amount0Usd == null || e.amount1Usd == null)) {
    degrade('A historical price was missing for a withdrawal.');
  }
  const withdrawnUsd = sum(withdraws.flatMap((e) => [e.amount0Usd, e.amount1Usd]));

  // ── F: fees. history.js already removed principal from Collect (item 3) ────
  const feesClaimedUsd   = sum(collects.flatMap((e) => [e.amount0Usd, e.amount1Usd]));
  const feesUnclaimedUsd = pos.feesUnclaimed?.usd ?? 0;

  // ── I: incentives, claimed at the price of the claim, pending at today's ──
  const incentivesClaimedUsd = sum(claims.map((e) => e.rewardUsd));
  const incentivesPendingUsd = pos.incentivesPending?.usd ?? 0;
  if (claims.some((e) => e.rewardUsd == null)) degrade('A rewards claim could not be valued.');
  if (pos.staked && claims.length === 0 && !pos.gaugeAddress) {
    degrade('Rewards already claimed from the gauge could not be attributed to this position.');
  }

  // ── G: gas, charged once per transaction ──────────────────────────────────
  const gasUsd = sum(events.map((e) => e.gasUsd));
  if (events.every((e) => e.gasUsd == null)) degrade('Gas costs could not be read.');

  const currentValueUsd = pos.closed ? 0 : (pos.valueUsd ?? 0);

  // ── HODL benchmark (item 8) ───────────────────────────────────────────────
  // The exact token amounts deposited minus those withdrawn, valued today. This
  // is the counterfactual that matters: the same tokens, left in the wallet.
  const depositedToken0 = sum(deposits.map((e) => e.amount0));
  const depositedToken1 = sum(deposits.map((e) => e.amount1));
  const withdrawnToken0 = sum(withdraws.map((e) => e.amount0));
  const withdrawnToken1 = sum(withdraws.map((e) => e.amount1));

  // Deposited valued today: what holding everything would be worth now.
  const hodlValueUsd = depositedToken0 * priceNow0 + depositedToken1 * priceNow1;

  // Divergence compares like with like: what the LP is worth plus what it already
  // returned, against holding the same tokens over the same period.
  const netToken0 = depositedToken0 - withdrawnToken0;
  const netToken1 = depositedToken1 - withdrawnToken1;
  const hodlOfRemainingUsd = netToken0 * priceNow0 + netToken1 * priceNow1;
  const divergenceUsd = currentValueUsd - hodlOfRemainingUsd;

  // ── N and the comparison (items 10 to 12) ─────────────────────────────────
  const netPnlUsd = (currentValueUsd + withdrawnUsd + feesClaimedUsd + feesUnclaimedUsd
                     + incentivesClaimedUsd + incentivesPendingUsd - gasUsd) - initialCapitalUsd;
  const hodlPnlUsd = hodlValueUsd - initialCapitalUsd;
  const lpVsHodlUsd = netPnlUsd - hodlPnlUsd;

  // ── Realised APR (spec: APR section) ──────────────────────────────────────
  const openedAt = pos.openedAt || deposits[0]?.timestamp || null;
  const lastAt = pos.closed
    ? Math.max(...events.map((e) => e.timestamp || 0))
    : Math.floor(Date.now() / 1000);
  const daysOpen = openedAt ? Math.max((lastAt - openedAt) / DAY, 0) : 0;

  const earned = feesClaimedUsd + feesUnclaimedUsd + incentivesClaimedUsd + incentivesPendingUsd;
  const realizedAprPct = (initialCapitalUsd > 0 && daysOpen >= 1)
    ? (earned / initialCapitalUsd) / daysOpen * 365 * 100
    : null;
  if (realizedAprPct === null && initialCapitalUsd > 0 && daysOpen < 1) {
    notes.push('The position is less than a day old, so an annualised return would be meaningless.');
  }

  const breakevenPrices = pos.closed
    ? undefined
    : findBreakevenPrices({ pos, initialCapitalUsd, earned, daysOpen });

  return {
    initialCapitalUsd,
    withdrawnUsd,
    feesClaimedUsd,
    feesUnclaimedUsd,
    incentivesClaimedUsd,
    incentivesPendingUsd,
    gasUsd,
    currentValueUsd,
    divergenceUsd,
    netPnlUsd,
    hodlValueUsd,
    hodlPnlUsd,
    lpVsHodlUsd,
    realizedAprPct,
    breakevenPrices,
    daysOpen,
    confidence,
    notes,
  };
}

/**
 * Prices of token0 (in token1 terms) where the position stops beating holding.
 *
 * Spec item 13. Solved numerically because the LP value curve has no closed form
 * once fees are involved: walk the price range, find where the sign of
 * pnlVsHold flips, and bisect that interval.
 */
function findBreakevenPrices({ pos, initialCapitalUsd, earned, daysOpen }) {
  if (!initialCapitalUsd || initialCapitalUsd <= 0) return undefined;
  if (!pos.currentPrice || !pos.priceLower || !pos.priceUpper) return undefined;

  const aprFraction = daysOpen > 0 ? (earned / initialCapitalUsd) / daysOpen * 365 : 0;
  const days = Math.max(daysOpen, 1);
  const entry = pos.currentPrice;

  const pnlAt = (price) => {
    try {
      const r = simulateAtPrice(entry, pos.priceLower, pos.priceUpper, price, initialCapitalUsd, aprFraction, days);
      return Number.isFinite(r?.pnlVsHold) ? r.pnlVsHold : null;
    } catch (_) { return null; }
  };

  const STEPS = 120;
  const low = entry * 0.3;
  const high = entry * 3;
  const step = (high - low) / STEPS;

  const crossings = [];
  let prevPrice = low;
  let prevValue = pnlAt(low);
  for (let i = 1; i <= STEPS; i++) {
    const price = low + step * i;
    const value = pnlAt(price);
    if (prevValue != null && value != null && (prevValue < 0) !== (value < 0)) {
      crossings.push(bisect(pnlAt, prevPrice, price));
    }
    prevPrice = price;
    prevValue = value;
  }
  if (crossings.length === 0) return undefined;

  const sorted = crossings.filter((c) => c != null).sort((a, b) => a - b);
  return { lower: sorted[0], upper: sorted.length > 1 ? sorted[sorted.length - 1] : undefined };
}

function bisect(fn, a, b, iterations = 40) {
  let lo = a;
  let hi = b;
  const loValue = fn(lo);
  if (loValue == null) return null;
  const loNegative = loValue < 0;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const value = fn(mid);
    if (value == null) return null;
    if ((value < 0) === loNegative) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function emptyPnl(pos, notes) {
  return {
    initialCapitalUsd: 0, withdrawnUsd: 0,
    feesClaimedUsd: 0, feesUnclaimedUsd: pos.feesUnclaimed?.usd ?? 0,
    incentivesClaimedUsd: 0, incentivesPendingUsd: pos.incentivesPending?.usd ?? 0,
    gasUsd: 0,
    currentValueUsd: pos.closed ? 0 : (pos.valueUsd ?? 0),
    divergenceUsd: 0, netPnlUsd: 0,
    hodlValueUsd: 0, hodlPnlUsd: 0, lpVsHodlUsd: 0,
    realizedAprPct: null, daysOpen: 0,
    confidence: 'partial', notes,
  };
}

/**
 * The sentence the home screen leads with, generated by the engine so the UI
 * never has to interpret a number. First the answer, then the detail.
 */
export function headlineFor(summary) {
  const money = (value) => Math.abs(value).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
  });

  const diff = summary.lpVsHodlUsd;
  const net = summary.lpNetPnlUsd;

  if (!Number.isFinite(diff) || !Number.isFinite(net)) {
    return 'We cannot compare your liquidity against holding yet.';
  }
  if (summary.lpValueUsd === 0 && net === 0) {
    return 'No liquidity positions found on Base.';
  }
  if (Math.abs(diff) < 0.01) {
    return 'Providing liquidity has come out even with simply holding.';
  }
  if (diff > 0) {
    return net >= 0
      ? `You are up ${money(net)}, and ${money(diff)} ahead of simply holding.`
      : `You are down ${money(net)}, but holding would have lost ${money(diff)} more.`;
  }
  return net >= 0
    ? `You made ${money(net)}, but holding would have made ${money(diff)} more.`
    : `You are down ${money(net)}, and holding would have lost ${money(diff)} less.`;
}
