/**
 * core/history.js  (NEW · Part 1 of the plan)
 *
 * Historical reconstruction of a wallet's concentrated-liquidity positions on Base
 * (Aerodrome Slipstream + Uniswap V3): staked detection, entry data, deposits,
 * withdrawals, collected fees, claimed AERO, gas.
 *
 * PORT FROM the proven HTML tool first, then extend. Source extract:
 *   ../../../fuentes/html_wallet_module_extract_lines3100-3900.js
 *     getStakedPositions()    lines ~3316-3400  factory.getPool → voter.gauges → gauge.stakedValues(wallet)
 *     gauge earned()          lines ~3484-3500  pending AERO per tokenId
 *     fetchEntryData()        lines ~3678-3742  mint Transfer (backward chunked) + IncreaseLiquidity in same receipt + historical prices
 *     fetchCollectedFees()    lines ~3746-3780  Collect events since entry block (forward)
 *     fetchClaimedEmissions() lines ~3785-3822  ClaimRewards events on the gauge
 *
 * Known limitations of the HTML version that THIS module must fix:
 *   1. getStakedPositions only probes pools built from a fixed token list (WETH, AERO, USDC, cbBTC, ...).
 *      Pools with other tokens (e.g. tokenized stocks NVDAc/USDC) are missed. Fix: add TOKENIZED_STOCKS
 *      addresses + tokens seen in the wallet's ERC-20 balances + tokens from wallet positions, AND add a
 *      Transfer(from=wallet → gauge) log scan on the NFPM as a completeness pass.
 *   2. fetchEntryData looks back max 60 days. Fix: scan from the NFPM deploy block (DEPLOY_BLOCKS) when
 *      Alchemy is configured; keep the 60-day fast path first, then widen if not found.
 *   3. Only the FIRST IncreaseLiquidity is used as entry. Fix: collect ALL IncreaseLiquidity events for the
 *      tokenId (each valued at its own timestamp) per specs/PNL_SPEC.md item 1.
 *   4. No DecreaseLiquidity handling, no closed positions, no gas. Add all three.
 *   5. Collect after DecreaseLiquidity includes principal. Fix: match by txHash and subtract (PNL_SPEC item 3).
 *
 * Prices: use prices.js → add fetchHistoricalPrice(chain, address, timestamp) (DeFiLlama
 * /prices/historical/{ts}/base:{addr}). Cache by (address, day).
 *
 * @typedef {import('../types/portfolio').PositionEvent} PositionEvent
 */

import { ethers } from 'ethers';
import { chunkedGetLogs, getProvider, getLogsProvider, withTimeout } from './providers.js';
import { NFPM_EVENTS, GAUGE_EVENTS, CL_GAUGE_ABI, VOTER_GAUGES_ABI, CL_TICK_SPACINGS, BASE_TOKENS, TOKENIZED_STOCKS } from './constants.base.js';

/**
 * Find tokenIds the wallet has staked in Aerodrome CL gauges.
 * @returns {Promise<Array<{tokenId: string, poolAddress: string, gaugeAddress: string}>>}
 */
export async function getStakedTokenIds(wallet, { extraTokens = [] } = {}) {
  // TODO(Part 1): port getStakedPositions() step 1 from the HTML extract.
  //   tokens = BASE_TOKENS ∪ TOKENIZED_STOCKS ∪ extraTokens (wallet balances + known positions)
  //   for each pair × CL_TICK_SPACINGS → factory.getPool → voter.gauges(pool) → gauge.stakedValues(wallet)
  //   Batch with Multicall3 (MULTICALL3_ADDR in constants.js) to keep it under ~10s.
  throw new Error('not implemented');
}

/**
 * All tokenIds the wallet ever owned (held or staked), via NFPM Transfer logs.
 * Completeness pass for getStakedTokenIds. Uses topics [Transfer, from=wallet] and [Transfer, null, to=wallet].
 * @returns {Promise<Array<{tokenId: string, currentOwner: string}>>}
 */
export async function getWalletTokenIdsFromLogs(wallet, protocol) {
  // TODO(Part 1)
  throw new Error('not implemented');
}

/**
 * Full event timeline of one position, valued at historical prices.
 * @returns {Promise<{ events: PositionEvent[], openedAt: number|null, mintBlock: number|null, confidence: 'full'|'partial', notes: string[] }>}
 */
export async function getPositionHistory({ protocol, tokenId, nfpmAddr, gaugeAddress, wallet, token0, token1 }) {
  // TODO(Part 1):
  //  a) mint Transfer (backward chunked, 60d fast path → widen to DEPLOY_BLOCKS)
  //  b) IncreaseLiquidity / DecreaseLiquidity / Collect by tokenId topic, from mintBlock forward (chunkedGetLogs collectAll)
  //  c) Transfer wallet→gauge (stake) / gauge→wallet (unstake) / →0x0 (burn)
  //  d) ClaimRewards on gauge (2-topic form first, 3-topic fallback)
  //  e) receipts → gasUsed × effectiveGasPrice → ETH historical price
  //  f) value every amount at its timestamp with fetchHistoricalPrice
  throw new Error('not implemented');
}

/** Pending AERO for a staked position: gauge.earned(wallet, tokenId). Human units. */
export async function getPendingRewards(gaugeAddress, wallet, tokenId, provider) {
  const gauge = new ethers.Contract(gaugeAddress, CL_GAUGE_ABI, provider);
  const raw = await withTimeout(gauge['earned(address,uint256)'](wallet, tokenId), 5000).catch(() => null);
  return raw ? parseFloat(ethers.utils.formatUnits(raw, 18)) : 0;
}
