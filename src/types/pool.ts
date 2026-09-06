/** Contract for the pool screens. Produced by core/poolDetail.js and /api/pools. */

export interface PoolRow {
  id: string;
  symbol: string;
  /** CL1, CL10, CL200 — Aerodrome runs several pools per pair and they are different pools. */
  variant: string | null;
  project: string;
  risk: 'conservador' | 'intermedio' | 'agresivo' | string;
  feePct: number | null;
  tvlUsd: number;
  volumeUsd1d: number | null;
  volumeOverTvl: number | null;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  /** TVL weighted mean daily fee APR. The stable column. */
  feeApr7d: number | null;
  feeApr30d: number | null;
  feeAprDays: number;
  publishedApyBase7d: number | null;
  hasStock: boolean;
  tokens: string[];
}

export interface AprPoint {
  pctLow: number;
  pctHigh: number;
  feeAprPct: number;
  rewardAprPct: number | null;
  totalAprPct: number;
  concentrationX: number | null;
}

export interface HistogramBucket {
  tickLower: number;
  tickUpper: number;
  price: number;
  priceAdjusted: number;
  liquidity: string;
  liquidityHuman: number;
  isActive: boolean;
}

export interface PoolDetail {
  id: string;
  symbol: string;
  variant: string | null;
  project: string;
  chain: string;
  poolAddress: string;
  risk: string;
  kind: string;
  feeDec: number | null;
  tickSpacing: number | null;
  tvlUsd: number | null;
  volumeUsd1d: number | null;
  volumeOverTvl: number | null;
  currentTick: number;
  currentPrice: number;
  decimals: { token0: number; token1: number };
  tokens: {
    token0: { address: string; symbol: string | null };
    token1: { address: string; symbol: string | null };
  };
  prices: { token0: number | null; token1: number | null };
  rewardLabel: string | null;
  emissionsPerYearUsd: number | null;
  published: {
    apyPct: number | null;
    apyBasePct: number | null;
    apyRewardPct: number | null;
    apyBase7dPct: number | null;
    apyMean30dPct: number | null;
  };
  averageDollar: { feeAprPct: number | null; rewardAprPct: number | null };
  stable: {
    feeApr7dPct: number | null;
    feeApr7dDays: number;
    feeApr30dPct: number | null;
    feeApr30dDays: number;
    method: string;
  };
  fullRange: AprPoint | null;
  aprGrid: AprPoint[];
  presets: Array<{ label: string; pctLow: number; pctHigh: number }>;
  histogram?: HistogramBucket[];
}
