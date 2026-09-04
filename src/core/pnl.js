/**
 * core/pnl.js  (NEW · Part 2)
 * Implements specs/PNL_SPEC.md exactly. Pure functions: no RPC calls here.
 * Inputs come from scanner.js (current state) + history.js (events).
 *
 * @typedef {import('../types/portfolio').LpPosition} LpPosition
 * @typedef {import('../types/portfolio').PositionPnl} PositionPnl
 */
import { computeIL, simulateAtPrice } from './math.js';

/**
 * @param {LpPosition} pos  position with events[], currentAmounts, prices, feesUnclaimed, incentivesPending
 * @returns {PositionPnl}
 */
export function computePositionPnl(pos) {
  // TODO(Part 2). Outline:
  //  V0  = Σ (mint|increase).amountUsd
  //  W   = Σ decrease.amountUsd
  //  Fc  = Σ collect.amountUsd − principal collected in same tx as a decrease (match txHash)
  //  Fu  = pos.feesUnclaimed.usd
  //  Ic  = Σ claim_rewards.rewardUsd ;  Ip = pos.incentivesPending?.usd || 0
  //  G   = Σ gasUsd
  //  Vlp = pos.valueUsd || 0
  //  deposited tokens net of withdrawn (token units) → V_hodl at current prices
  //  D   = Vlp + W − V_hodl ; N = (Vlp + W + Fc + Fu + Ic + Ip − G) − V0 ; N_hodl = V_hodl − V0 ; lpVsHodl = N − N_hodl
  //  realizedApr = (Fc + Fu + Ic + Ip) / V0 / daysOpen × 365
  //  breakeven: numeric search on simulateAtPrice(...) where pnlVsHold crosses 0 (use fees to date as apr input)
  //  confidence: 'partial' if any event lacks amountUsd, or gas missing, or rewards not attributable
  throw new Error('not implemented');
}

/** Engine-generated headline. UI shows it verbatim. */
export function headlineFor(summary) {
  const d = summary.lpVsHodlUsd;
  if (!isFinite(d)) return 'We could not compare your LPs against holding yet.';
  const abs = Math.abs(d).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  if (d >= 0) return `Your liquidity positions are ${abs} ahead of simply holding.`;
  return `You made ${summary.lpNetPnlUsd >= 0 ? 'money' : 'a loss'}, but holding would have done ${abs} better.`;
}
