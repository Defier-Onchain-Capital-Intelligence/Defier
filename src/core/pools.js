/**
 * defier-core/pools.js
 *
 * Pool classification, filtering, and metadata resolution.
 * No network calls — operates on DeFiLlama pool objects.
 */

import { STABLECOINS, MAJORS, ALLOWED_CONTRACTS, ALLOWED_CHAINS } from './constants.js';

// ─── Protocol detection ─────────────────────────────────────────────────────────

/** Returns the canonical protocol key for a DeFiLlama pool */
export function detectPoolType(pool) {
  const p = (pool.project || '').toLowerCase();
  if (p.startsWith('aerodrome')) return 'aerodrome';
  if (p.startsWith('velodrome')) return 'velodrome';
  if (p.includes('pancakeswap') && (p.includes('v3') || p.includes('cl') || p.includes('amm-v'))) return 'pancakeswap-v3';
  if (p.includes('uniswap') && (p.includes('v3') || p.includes('-3'))) return 'uniswap-v3';
  return null;
}

/** Human-readable protocol label */
export const PROTOCOL_LABEL = (project) => {
  if (!project) return project;
  const p = project.toLowerCase();
  if (p.includes('uniswap'))     return 'Uniswap V3';
  if (p.includes('aerodrome'))   return 'Aerodrome';
  if (p.includes('velodrome'))   return 'Velodrome';
  if (p.includes('pancakeswap')) return 'PancakeSwap V3';
  return project;
};

/** True if this project is one of the protocols Defier supports */
export function isAllowedProject(project) {
  if (!project) return false;
  const p = project.toLowerCase();
  const isUniV3    = p.includes('uniswap') && (p.includes('v3') || p.includes('-3'));
  const isAero     = p.includes('aerodrome') || p.includes('velodrome');
  const isPancakeV3 = p.includes('pancakeswap') &&
    (p.includes('v3') || p.includes('amm-v') || p.includes('-cl') || p.includes('concentrated'));
  return isUniV3 || isAero || isPancakeV3;
}

/** True if both tokens are in the verified allowlist for this chain */
export function isAllowedPool(pool) {
  const chainContracts = ALLOWED_CONTRACTS[pool.chain];
  if (!chainContracts) return false;

  // Primary: contract address check
  if (pool.underlyingTokens && pool.underlyingTokens.length >= 2) {
    return pool.underlyingTokens.every((addr) =>
      chainContracts.has((addr || '').toLowerCase())
    );
  }

  // Fallback: symbol parsing (when underlyingTokens is absent)
  if (pool.symbol) {
    const parts = pool.symbol
      .toUpperCase()
      .split(/[-\/·+%\s]+/)
      .map((s) => s.replace(/[^A-Z]/g, '').trim())
      .filter((s) => s.length >= 2 && isNaN(Number(s)));
    if (parts.length >= 2) {
      return parts.every((t) => STABLECOINS.has(t) || MAJORS.has(t));
    }
  }
  return false;
}

// ─── Risk classification ────────────────────────────────────────────────────────

/** Classify pool risk based on token types and TVL/APY */
export function classifyRisk(pool) {
  const sym    = (pool.symbol || '').toUpperCase();
  const tokens = sym.split('-').map((t) => t.replace(/[0-9.×✕]/g, '').trim()).filter(Boolean);
  const allStable = tokens.length > 0 && tokens.every((t) => STABLECOINS.has(t));
  const anyMajor  = tokens.some((t) => MAJORS.has(t));
  const anyStable = tokens.some((t) => STABLECOINS.has(t));

  if (allStable) return 'conservador';
  if (anyMajor && anyStable) return 'intermedio';
  if (tokens.every((t) => MAJORS.has(t))) return 'intermedio';
  if ((pool.apy || 0) > 400 || (pool.tvlUsd || 0) < 100_000) return 'agresivo';
  return 'agresivo';
}

// ─── Pool fee and tick spacing ─────────────────────────────────────────────────

/**
 * Parse the fee tier decimal from a DeFiLlama pool.
 * poolMeta examples: "0.01%", "0.05%", "0.3%", "1%"
 */
export function getPoolFeeDec(pool) {
  if (pool.feeTier && pool.feeTier > 0) return pool.feeTier / 1_000_000;
  const m = (pool.poolMeta || '').trim().match(/^(\d+\.?\d*)%$/);
  if (m) return parseFloat(m[1]) / 100;

  // Aerodrome: meta is "cl1", "cl50", "cl100", "cl200" (tick spacing)
  const ts = getTickSpacing(pool);
  if (ts) {
    // Common Aerodrome fee tiers by tick spacing
    const TS_TO_FEE = { 1: 0.0001, 50: 0.0005, 100: 0.0030, 200: 0.0030, 2000: 0.0100 };
    return TS_TO_FEE[ts] || null;
  }
  return null;
}

/** Resolve tick spacing from pool metadata */
export function getTickSpacing(pool) {
  const type = detectPoolType(pool);
  const meta = (pool.poolMeta || '').toLowerCase();

  if (type === 'aerodrome' || type === 'velodrome') {
    const m = meta.match(/cl(\d+)/);
    if (m) return parseInt(m[1]);
  }

  // Uniswap V3 standard tick spacings by fee tier
  if (pool.feeTier) {
    const FEE_TO_TS = { 100: 1, 500: 10, 3000: 60, 10000: 200 };
    return FEE_TO_TS[pool.feeTier] || null;
  }
  const m2 = meta.match(/^(\d+\.?\d*)%$/);
  if (m2) {
    const feeBps = Math.round(parseFloat(m2[1]) * 10000);
    const FEE_TO_TS = { 1: 1, 5: 10, 30: 60, 100: 200 };
    return FEE_TO_TS[feeBps] || null;
  }
  return null;
}

/** Minimum recommended range percent for a pool (to avoid unhittable ranges) */
export function getMinRangePct(pool) {
  const ts = getTickSpacing(pool) || 1;
  return (Math.pow(1.0001, ts) - 1); // one tick spacing as a fraction
}

/**
 * Returns { lower, upper } minimum range percentages.
 * Some asymmetric situations need different minimums for each side.
 */
export function getMinRangePcts(pool) {
  const min = getMinRangePct(pool);
  return { lower: min, upper: min };
}

/**
 * Snap a percentage to the nearest valid tick for this pool's tickSpacing.
 * @param {number} pctPositive  - positive fraction (0.05 = 5%)
 * @param {number} tickSpacing
 * @param {boolean} isLower    - if true, snap DOWN; if false, snap UP
 */
export function snapPctToTick(pctPositive, tickSpacing, isLower) {
  if (!tickSpacing || tickSpacing <= 0) return pctPositive;
  const rawTick = Math.log(1 - pctPositive) / Math.log(1.0001);
  const snapped = isLower
    ? Math.ceil(rawTick / tickSpacing) * tickSpacing
    : Math.floor(rawTick / tickSpacing) * tickSpacing;
  return 1 - Math.pow(1.0001, snapped);
}

// ─── Full-range APR estimate ────────────────────────────────────────────────────

/**
 * Estimate full-range APR from DeFiLlama pool data (no on-chain call needed).
 * Uses volume × fee × 365 / TVL + emissions ratio from DeFiLlama.
 * This is a quick estimate — use calcOnchainAPR for precise range-specific APR.
 */
export function calcFullRangeAPR(pool, getEmissionsDataFn) {
  const vol = pool.volumeUsd1d || 0;
  const tvl = pool.tvlUsd || 0;
  const fee = getPoolFeeDec(pool);
  if (!vol || !tvl || !fee) return null;

  const feeAPR = (vol * fee * 365 / tvl) * 100;

  if (getEmissionsDataFn) {
    const emData = getEmissionsDataFn(pool);
    if (emData.hasEmissions && pool.apyReward > 0 && (pool.apyBase || 0) > 0) {
      const emRatio = Math.min(pool.apyReward / pool.apyBase, 8);
      return { feeAPR, totalAPR: feeAPR * (1 + emRatio) };
    }
  }
  return { feeAPR, totalAPR: feeAPR };
}

// ─── DEX link builders ──────────────────────────────────────────────────────────

/** Build a DexScreener link for a pool address */
export function buildDexScreenerUrl(chain, poolAddr) {
  if (!poolAddr || !chain) return null;
  const chainSlug = chain.toLowerCase();
  return `https://dexscreener.com/${chainSlug}/${poolAddr}`;
}

/** Build a direct link to the pool on its native DEX UI */
export function buildDexUrl(pool, poolAddr) {
  const type = detectPoolType(pool);
  const chain = (pool.chain || '').toLowerCase();

  if (type === 'aerodrome') {
    return `https://aerodrome.finance/liquidity?query=${poolAddr}`;
  }
  if (type === 'velodrome') {
    return `https://velodrome.finance/liquidity?query=${poolAddr}`;
  }
  if (type === 'uniswap-v3') {
    const chainPath = chain === 'ethereum' ? '' : `/${chain}`;
    return `https://app.uniswap.org/explore/pools/${chain}/${poolAddr}`;
  }
  if (type === 'pancakeswap-v3') {
    return `https://pancakeswap.finance/liquidity/pool/${poolAddr}`;
  }
  return null;
}

// ─── Range presets ──────────────────────────────────────────────────────────────

/**
 * Get suggested range presets for a pool, based on its risk profile and tick spacing.
 * Returns [{ label, pctLow, pctHigh }, ...]
 */
export function getRangePresets(pool) {
  const risk = classifyRisk(pool);
  if (risk === 'conservador') {
    return [
      { label: '±0.5%',  pctLow: 0.005, pctHigh: 0.005 },
      { label: '±1%',    pctLow: 0.01,  pctHigh: 0.01  },
      { label: '±2%',    pctLow: 0.02,  pctHigh: 0.02  },
      { label: '±5%',    pctLow: 0.05,  pctHigh: 0.05  },
    ];
  }
  if (risk === 'intermedio') {
    return [
      { label: '±5%',    pctLow: 0.05,  pctHigh: 0.05  },
      { label: '±10%',   pctLow: 0.10,  pctHigh: 0.10  },
      { label: '±20%',   pctLow: 0.20,  pctHigh: 0.20  },
      { label: '−10%/+20%', pctLow: 0.10, pctHigh: 0.20 },
    ];
  }
  // Agresivo
  return [
    { label: '±10%',   pctLow: 0.10,  pctHigh: 0.10  },
    { label: '±20%',   pctLow: 0.20,  pctHigh: 0.20  },
    { label: '±40%',   pctLow: 0.40,  pctHigh: 0.40  },
    { label: 'Full',   pctLow: 0.999, pctHigh: 0.999 },
  ];
}
