/**
 * Shared TypeScript types for Defier.
 */

export type Chain = 'base' | 'ethereum' | 'arbitrum' | 'optimism' | 'bsc';

export type Protocol =
  | 'uniswap-v3'
  | 'aerodrome-v3'
  | 'aerodrome'
  | 'velodrome-v2'
  | 'pancakeswap-v3';

export type RiskProfile = 'conservador' | 'intermedio' | 'agresivo';

export type UserPlan = 'free' | 'pro' | 'pro_plus';

// ─── Pool (from DeFiLlama, normalized) ───────────────────────────────────────

export type Pool = {
  pool: string;
  project: string;
  chain: Chain;
  symbol: string;
  tvlUsd: number;
  apy: number;
  apyBase: number;
  apyReward: number;
  volumeUsd1d: number;
  feeTier: number;
  poolMeta: string | null;
  underlyingTokens: string[];
};

// ─── On-chain position ────────────────────────────────────────────────────────

export type TokenInfo = {
  address: string;
  symbol: string;
  decimals: number;
};

export type PositionFees = {
  token0: number;
  token1: number;
  usd: number;
};

export type PositionAmounts = {
  token0: number;
  token1: number;
};

export type EnrichedPosition = {
  tokenId: string;
  protocol: Protocol;
  chain: Chain;
  poolAddress: string;
  owner: string;
  token0: TokenInfo;
  token1: TokenInfo;
  symbol: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  currentTick: number;
  sqrtP_raw: number;
  liquidity: string;
  inRange: boolean;
  fees: PositionFees;
  currentAmounts: PositionAmounts | null;
  prices: { token0: number | null; token1: number | null };
  valueUSD: number | null;
  isAero: boolean;
};

// ─── APR result ───────────────────────────────────────────────────────────────

export type AprResult = {
  feeAPR: number | null;
  emissionsAPR: number | null;
  totalAPR: number | null;
  rewardLabel: string | null;
  onchain: {
    poolAddr: string;
    L_active_str: string;
    sqrtP_raw: number;
    currentTick: number;
    price0: number | null;
    price1: number | null;
  };
};

export type PoolOnchainResult = {
  poolAddr: string;
  currentTick: number;
  sqrtP_raw: number;
  price0: number | null;
  price1: number | null;
  d0: number;
  d1: number;
};

// ─── IL Simulator ─────────────────────────────────────────────────────────────

export type SimulationPoint = {
  samplePrice: number;
  lpValueUSD: number;
  holdValueUSD: number;
  il: number;
  feeIncome: number;
  netPnl: number;
  inRange: boolean;
};

// ─── Histogram tick ──────────────────────────────────────────────────────────

export type HistogramBucket = {
  tickLower: number;
  tickUpper: number;
  price: number;
  liquidity: string;
  liquidityHuman: number;
  isActive: boolean;
};

// ─── Alert ───────────────────────────────────────────────────────────────────
// camelCase view of lib/supabase.ts's AlertRow (which mirrors the
// position_alerts table exactly — one row per position, three boolean
// alert-type flags, not a per-type enum row).

export type Alert = {
  id: string;
  userId: string;
  walletAddress: string;
  tokenId: string;
  poolAddress: string;
  chain: Chain;
  tickLower: number;
  tickUpper: number;
  alertOutOfRange: boolean;
  alertNearRange: boolean;
  alertBackInRange: boolean;
  nearRangeThreshold: number | null;
  lastTick: number | null;
  lastInRange: boolean | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
