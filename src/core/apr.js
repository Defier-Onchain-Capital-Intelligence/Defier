/**
 * defier-core/apr.js
 *
 * On-chain APR calculations for concentrated liquidity pools.
 *
 * Uses on-chain data (RPC) for maximum accuracy:
 *   - Total active liquidity (liquidity() + stakedLiquidity() for Aerodrome — the stakedLiquidity bug fix)
 *   - Real volume (direct or back-calculated from DeFiLlama APY when missing)
 *   - Real emission rates from gauge contracts (AERO, VELO)
 */

import { ethers } from 'ethers';
import { AERODROME_CL_DEPLOYMENTS } from './constants.base.js';
import {
  VOTER_ADDRS, VOTER_ABI, GAUGE_ABI,
  V3_POOL_ABI_MIN, AERO_POOL_ABI_MIN,
  ERC20_DEC_ABI, FACTORY_CONFIG,
} from './constants.js';
import { getProvider, withTimeout } from './providers.js';
import { fetchTokenPrice } from './prices.js';
import { computeLPerDollar } from './math.js';
import { detectPoolType, getPoolFeeDec } from './pools.js';

// ─── Pool address resolution ────────────────────────────────────────────────────

/**
 * Resolve a pool's on-chain address.
 * DeFiLlama uses UUID identifiers for some V3 pools — we look them up via the factory.
 * If the pool.pool field is already an EVM address, return it directly.
 *
 * @param {object}   pool      - DeFiLlama pool object
 * @param {object}   provider  - ethers provider
 * @param {string}   chain     - lowercase chain name
 * @returns {Promise<{ addr?: string, error?: string }>}
 */
export async function resolvePoolAddress(pool, provider, chain) {
  // Already an EVM address
  if (/^0x[0-9a-fA-F]{40}$/.test(pool.pool)) {
    return { addr: pool.pool.toLowerCase() };
  }

  const project = pool.project || '';
  const cfgKey  = project.toLowerCase().startsWith('aerodrome') || project.toLowerCase().startsWith('velodrome')
    ? 'aerodrome-v3'
    : project.toLowerCase().includes('pancake')
      ? 'pancakeswap-v3'
      : 'uniswap-v3';

  const cfg = FACTORY_CONFIG[cfgKey];
  if (!cfg) return { error: `No factory config for: ${cfgKey}` };

  const factoryAddr = cfg.chains[chain];
  if (!factoryAddr) return { error: `No factory for ${cfgKey} on ${chain}` };

  const param = cfg.paramFn(pool);
  if (!param) return { error: `Cannot resolve fee/tickSpacing for ${pool.symbol}` };

  if (!pool.underlyingTokens || pool.underlyingTokens.length < 2) {
    return { error: 'No underlyingTokens in pool data' };
  }

  // Base runs more than one Aerodrome Slipstream deployment, and a pool that
  // lives on the second one answers the zero address on the first. Asking only
  // the first is what made every tokenized stock pool unreadable.
  const factories = cfgKey === 'aerodrome-v3' && chain === 'base'
    ? [...new Set([factoryAddr, ...AERODROME_CL_DEPLOYMENTS.map((d) => d.factory)])]
    : [factoryAddr];

  const ZERO = '0x0000000000000000000000000000000000000000';
  const [t0, t1] = pool.underlyingTokens;
  let lastError = 'Factory returned zero address';

  for (const addrOfFactory of factories) {
    try {
      const factory = new ethers.Contract(addrOfFactory, cfg.abi, provider);
      const addr = await withTimeout(factory.getPool(t0, t1, param), 6000);
      if (addr && addr !== ZERO) return { addr: addr.toLowerCase() };
    } catch (e) {
      lastError = `Factory call failed: ${(e.message || '').slice(0, 80)}`;
    }
  }
  return { error: lastError };
}

// ─── On-chain pool data ─────────────────────────────────────────────────────────

/**
 * Fetch all on-chain data needed for APR calculation:
 *   - Total active liquidity (L + stakedL for Aerodrome)
 *   - sqrt(price) from slot0
 *   - Token decimals
 *   - Token prices
 *   - Emissions data from gauge
 *
 * @param {object} pool - DeFiLlama pool object
 * @returns {Promise<{
 *   L_active: number, L_active_str: string,
 *   sqrtP_raw: number, currentTick: number,
 *   d0: number, d1: number,
 *   price0: number|null, price1: number|null,
 *   emissionsData: { emissionsPerYearUSD?: number, deFiLlamaRatio?: number, rewardLabel?: string }|null,
 *   poolAddr: string
 * } | { error: string }>}
 */
export async function fetchPoolOnchainData(pool) {
  if (!pool.pool || !pool.chain) {
    return { error: `Insufficient data: pool=${pool.pool} chain=${pool.chain}` };
  }

  const chain = pool.chain.toLowerCase();

  try {
    const provider = await withTimeout(getProvider(chain), 10000);

    const resolved = await resolvePoolAddress(pool, provider, chain);
    if (!resolved.addr) return { error: resolved.error || 'Could not resolve pool address' };
    const poolAddr = resolved.addr;

    const proj0  = (pool.project || '').toLowerCase();
    const isAero = proj0.startsWith('aerodrome') || proj0.startsWith('velodrome');
    const poolABI = isAero ? AERO_POOL_ABI_MIN : V3_POOL_ABI_MIN;
    const pc = new ethers.Contract(poolAddr, poolABI, provider);

    // CRITICAL: For Aerodrome/Velodrome, sum liquidity() + stakedLiquidity().
    // LPs who stake in the gauge move their liquidity from liquidity() to stakedLiquidity(),
    // but both compete for fees equally. Using only liquidity() causes 5–10x APR overestimate
    // in heavily-incentivized pools. This was the root cause of the 955% vs 91% APR bug.
    let liquidityFetch, slot0, addr0, addr1;
    if (isAero) {
      [liquidityFetch, slot0, addr0, addr1] = await withTimeout(
        Promise.all([
          Promise.all([pc.liquidity(), pc.stakedLiquidity()]).then(([u, s]) => u.add(s)),
          pc.slot0(),
          pc.token0(),
          pc.token1(),
        ]),
        8000
      );
    } else {
      [liquidityFetch, slot0, addr0, addr1] = await withTimeout(
        Promise.all([pc.liquidity(), pc.slot0(), pc.token0(), pc.token1()]),
        8000
      );
    }

    const [d0, d1] = await withTimeout(
      Promise.all([
        new ethers.Contract(addr0, ERC20_DEC_ABI, provider).decimals(),
        new ethers.Contract(addr1, ERC20_DEC_ABI, provider).decimals(),
      ]),
      6000
    );

    const L_active_bn  = liquidityFetch.toBigInt();
    const L_active     = Number(L_active_bn);
    const L_active_str = L_active_bn.toString();
    const sqrtP_raw    = Number(slot0.sqrtPriceX96.toBigInt()) / (2 ** 96);
    const currentTick  = Number(slot0.tick);

    // Fetch prices and emissions in parallel (non-critical, graceful on failure)
    const [r0, r1, rEmissions] = await Promise.allSettled([
      fetchTokenPrice(chain, addr0),
      fetchTokenPrice(chain, addr1),
      fetchOnchainEmissions(pool, provider, chain, poolAddr),
    ]);
    const price0        = r0.status === 'fulfilled' ? r0.value : null;
    const price1        = r1.status === 'fulfilled' ? r1.value : null;
    const emissionsData = rEmissions.status === 'fulfilled' ? rEmissions.value : null;

    // DeFiLlama's poolMeta carries "CL10" for Aerodrome, which is a tick spacing
    // and not a fee. Their fees are set per pool, so without this the whole range
    // calculator returns null on exactly the pools people care about.
    const feeTier = await withTimeout(pc.fee(), 6000).then((f) => Number(f)).catch(() => null);

    return {
      L_active, L_active_str, sqrtP_raw, currentTick,
      d0: Number(d0), d1: Number(d1),
      price0, price1, emissionsData, poolAddr, feeTier,
    };
  } catch (e) {
    return { error: (e.message || String(e)).slice(0, 120) };
  }
}

// ─── APR calculation ────────────────────────────────────────────────────────────

/**
 * Calculate APR for a custom range using on-chain data.
 *
 * @param {object} onchain   - result of fetchPoolOnchainData
 * @param {object} pool      - DeFiLlama pool object (for fee tier and volume)
 * @param {number} pctLow    - lower bound as fraction (0.05 = −5%)
 * @param {number} pctHigh   - upper bound as fraction (0.05 = +5%)
 * @returns {number|null}    APR as percentage (e.g. 42.5 for 42.5%)
 */
export function calcOnchainAPR(onchain, pool, pctLow, pctHigh) {
  const { L_active, sqrtP_raw, d0, d1, price0, price1 } = onchain;
  if (!L_active || !sqrtP_raw) return null;

  const fee_dec = getPoolFeeDec(pool);
  if (!fee_dec) return null;

  // Volume: use direct value, or back-calculate from DeFiLlama APY when missing.
  // This makes APR work for pools where DeFiLlama doesn't report volumeUsd1d (e.g. Velodrome on Optimism).
  let volume = pool.volumeUsd1d || 0;
  if (!volume) {
    const tvl           = pool.tvlUsd || 0;
    const apyDerived    = Math.max(0, (pool.apy || 0) - (pool.apyReward || 0));
    const apyForVolume  = pool.apyBase > 0 ? pool.apyBase
                        : apyDerived > 0.01 ? apyDerived
                        : (pool.apy || 0);
    if (apyForVolume > 0 && tvl > 0) {
      volume = (apyForVolume / 100) * tvl / (fee_dec * 365);
    }
  }
  if (!volume) return null;

  const L_per_dollar = computeLPerDollar(sqrtP_raw, d0, d1, pctLow, pctHigh, price0, price1);
  if (!L_per_dollar) return null;

  return (volume * fee_dec * 365 * L_per_dollar / L_active) * 100;
}

// ─── Emissions (AERO / VELO gauges) ────────────────────────────────────────────

/**
 * Fetch real-time emission rate from Aerodrome/Velodrome gauge.
 * @returns {Promise<{ emissionsPerYearUSD: number, rewardLabel: string } | null>}
 */
export async function fetchOnchainEmissions(pool, provider, chain, poolAddr) {
  const project = (pool.project || '').toLowerCase();

  // ── Aerodrome / Velodrome ──────────────────────────────────────────────────
  if (project.includes('aerodrome') || project.includes('velodrome')) {
    const voterAddr = VOTER_ADDRS.aerodrome?.[chain];
    if (!voterAddr) return null;

    try {
      const voter    = new ethers.Contract(voterAddr, VOTER_ABI, provider);
      const gaugeAddr = await withTimeout(voter.gauges(poolAddr), 6000);
      const ZERO     = '0x0000000000000000000000000000000000000000';
      if (!gaugeAddr || gaugeAddr.toLowerCase() === ZERO) return null;

      const gauge = new ethers.Contract(gaugeAddr, GAUGE_ABI, provider);
      const [rewardRateBN, rewardTokenAddr] = await withTimeout(
        Promise.all([gauge.rewardRate(), gauge.rewardToken()]),
        6000
      );

      const rewardRate = parseFloat(ethers.utils.formatUnits(rewardRateBN, 18)); // AERO/sec
      if (rewardRate <= 0) return null;

      const aeroPrice = await fetchTokenPrice(chain, rewardTokenAddr.toLowerCase());
      if (!aeroPrice || aeroPrice <= 0) return null;

      const emissionsPerYearUSD = rewardRate * 86400 * 365 * aeroPrice;
      const rewardLabel         = project.includes('velodrome') ? 'VELO' : 'AERO';
      return { emissionsPerYearUSD, rewardLabel };
    } catch (e) {
      return null;
    }
  }

  // ── PancakeSwap V3 ──────────────────────────────────────────────────────────
  // MasterChef V3 requires more complex logic (matching pool → pid).
  // Fall back to DeFiLlama apyReward/apyBase ratio for now.
  if (project.includes('pancake')) {
    return _fallbackDeFiLlamaEmissions(pool);
  }

  return null;
}

/** DeFiLlama-based emissions fallback (for PancakeSwap) */
function _fallbackDeFiLlamaEmissions(pool) {
  const apyReward = pool.apyReward || 0;
  if (apyReward < 0.05) return null;
  const apyBase = pool.apyBase > 0
    ? pool.apyBase
    : Math.max(0, (pool.apy || 0) - apyReward);
  if (apyBase <= 0) return null;
  const ratio = apyReward / apyBase;
  if (ratio <= 0 || !isFinite(ratio) || ratio > 100) return null;
  return { deFiLlamaRatio: ratio, rewardLabel: 'CAKE' };
}

/**
 * Quick check: does this pool potentially have emissions? (UI badge, pre-on-chain)
 * @returns {{ hasEmissions: boolean, rewardLabel?: string, source?: string }}
 */
export function getEmissionsData(pool) {
  const project   = (pool.project || '').toLowerCase();
  const isAero    = project.includes('aerodrome') || project.includes('velodrome');
  const isPancake = project.includes('pancake');

  if (isAero) return { hasEmissions: true, rewardLabel: project.includes('velodrome') ? 'VELO' : 'AERO', source: 'onchain' };
  if (isPancake && (pool.apyReward || 0) >= 0.05) return { hasEmissions: true, rewardLabel: 'CAKE', source: 'defillama' };
  return { hasEmissions: false };
}

/**
 * Calculate emissions APR for a given range.
 * @param {object} emissionsData  - result of fetchOnchainEmissions
 * @param {object} onchain        - result of fetchPoolOnchainData
 * @param {object} pool           - DeFiLlama pool object
 * @param {number} pctLow
 * @param {number} pctHigh
 * @param {number|null} feeAPR    - needed for the DeFiLlama-ratio fallback
 * @returns {number|null}
 */
export function calcEmissionsAPR(emissionsData, onchain, pool, pctLow, pctHigh, feeAPR) {
  if (!emissionsData) return null;

  // Direct on-chain emissions (Aerodrome/Velodrome)
  if (emissionsData.emissionsPerYearUSD) {
    const { L_active, sqrtP_raw, d0, d1, price0, price1 } = onchain;
    if (!L_active || !sqrtP_raw) return null;
    const L_per_dollar = computeLPerDollar(sqrtP_raw, d0, d1, pctLow, pctHigh, price0, price1);
    if (!L_per_dollar) return null;
    return (emissionsData.emissionsPerYearUSD * L_per_dollar / L_active) * 100;
  }

  // DeFiLlama ratio fallback (PancakeSwap)
  if (emissionsData.deFiLlamaRatio && feeAPR != null) {
    return feeAPR * emissionsData.deFiLlamaRatio;
  }

  return null;
}
