/**
 * Contract between the calculation engine (src/core, server-side) and the UI.
 * The UI NEVER computes financial figures. Every number rendered comes from here.
 * See ../../specs/PNL_SPEC.md for the definitions behind each field.
 */

export type Confidence = 'full' | 'partial';

export interface TokenRef {
  address: string;      // lowercase
  symbol: string;
  decimals: number;
  isTokenizedStock?: boolean;   // B20 token (AAPLc, NVDAc, ...)
  assetClass: AssetClass;
}

export type AssetClass = 'ETH' | 'BTC' | 'STABLE' | 'STOCK' | 'AERO' | 'OTHER';

export interface PriceQuote {
  usd: number;
  source: 'llama' | 'coingecko' | 'chainlink' | 'pool-implied';
  updatedAt?: number;   // unix seconds (chainlink)
  stale?: boolean;
}

/** One onchain event that changed a position. Built by core/history.js */
export interface PositionEvent {
  type: 'mint' | 'increase' | 'decrease' | 'collect' | 'stake' | 'unstake' | 'claim_rewards' | 'burn';
  txHash: string;
  blockNumber: number;
  timestamp: number;
  amount0?: number;     // human units
  amount1?: number;
  amount0Usd?: number;  // valued at historical price of that timestamp
  amount1Usd?: number;
  rewardAmount?: number;    // AERO, human units (claim_rewards)
  rewardUsd?: number;
  gasUsd?: number;
  notes?: string[];
}

/** P&L breakdown for one position. Built by core/pnl.js (spec: PNL_SPEC.md) */
export interface PositionPnl {
  initialCapitalUsd: number;    // V0: sum of deposits at historical prices
  withdrawnUsd: number;         // W
  feesClaimedUsd: number;       // F_claimed
  feesUnclaimedUsd: number;     // F_unclaimed (feeGrowthInside exact)
  incentivesClaimedUsd: number; // AERO claimed
  incentivesPendingUsd: number; // AERO earned() not yet claimed
  gasUsd: number;               // G
  currentValueUsd: number;      // V_lp
  divergenceUsd: number;        // D = V_lp + W - V_hodl_of_deposited (negative = IL)
  netPnlUsd: number;            // N
  hodlValueUsd: number;         // V_hodl
  hodlPnlUsd: number;           // N_hodl
  lpVsHodlUsd: number;          // N - N_hodl
  realizedAprPct: number | null;
  breakevenPrices?: { lower?: number; upper?: number };  // token0 price where LP == HODL
  daysOpen: number;
  confidence: Confidence;
  notes: string[];              // what was missing when confidence = partial
}

export interface LpPosition {
  id: string;                   // `${protocol}:${tokenId}`
  protocol: 'aerodrome' | 'uniswap-v3';
  tokenId: string;
  poolAddress: string;
  token0: TokenRef;
  token1: TokenRef;
  symbol: string;               // "WETH/USDC"
  tickLower: number;
  tickUpper: number;
  currentTick: number;
  priceLower: number;           // token0 in token1 terms, decimals-adjusted
  priceUpper: number;
  currentPrice: number;
  inRange: boolean;
  staked: boolean;              // NFT held by Aerodrome gauge
  gaugeAddress?: string;
  /** Position manager holding this NFT. Base has more than one Slipstream deployment. */
  nfpmAddress?: string;
  closed: boolean;              // liquidity == 0
  liquidity: string;
  currentAmounts: { token0: number; token1: number } | null;
  prices: { token0: PriceQuote | null; token1: PriceQuote | null };
  valueUsd: number | null;
  feesUnclaimed: { token0: number; token1: number; usd: number };
  incentivesPending: { amount: number; usd: number } | null;
  openedAt: number | null;      // unix seconds of mint
  events: PositionEvent[];
  pnl: PositionPnl | null;
  /** Reconstruction quality of THIS position, independent of the P&L block.
   *  Rule 5 of the handoff: if something could not be resolved, the product says so. */
  confidence: Confidence;
  notes: string[];
}

export interface TokenHolding {
  token: TokenRef;
  balance: number;              // human units (raw)
  scaledBalance?: number;       // B20 only: shares equivalent (scaledBalanceOf)
  multiplier?: number;          // B20 only (WAD-scaled -> float)
  price: PriceQuote | null;
  valueUsd: number | null;
}

export interface LendingPosition {
  protocol: 'aave-v3';
  supplied: Array<{ token: TokenRef; amount: number; valueUsd: number; isCollateral: boolean }>;
  borrowed: Array<{ token: TokenRef; amount: number; valueUsd: number }>;
  healthFactor: number | null;   // null when there is no debt, so the ratio is undefined
  netValueUsd: number;
  totalCollateralUsd?: number;
  totalDebtUsd?: number;
}

export interface ExposureSlice {
  assetClass: AssetClass;
  label: string;                // "ETH", "Stocks", "Stablecoins"
  valueUsd: number;
  pct: number;                  // 0..100
}

export interface Exposure {
  totalUsd: number;
  byClass: ExposureSlice[];
  byAsset: Array<{ symbol: string; valueUsd: number; pct: number }>;
  marketBiasPct: number;        // % not in stables
}

/** Everything this wallet has ever done with liquidity, for the History view.
 *  Separate from the rollups because these are wallet level facts, not a sum of
 *  what is currently on screen. */
export interface LifetimeStats {
  positionsOpened: number;
  positionsClosed: number;
  feesClaimedUsd: number;      // already taken out of positions
  feesUnclaimedUsd: number;    // still sitting in open positions
  incentivesClaimedUsd: number;
  incentivesPendingUsd: number;
  gasUsd: number;
  netPnlUsd: number;
  lpVsHodlUsd: number;
  firstPositionAt: number | null;   // unix seconds
  daysActive: number;
}

/** One aggregation of P&L over a set of positions. */
export interface PnlRollup {
  positions: number;
  valueUsd: number;
  netPnlUsd: number;
  lpVsHodlUsd: number;
  feesUsd: number;
  incentivesUsd: number;
}

export interface PortfolioSummary {
  totalValueUsd: number;
  lpValueUsd: number;
  tokensValueUsd: number;
  stocksValueUsd: number;
  lendingNetUsd: number;
  lpNetPnlUsd: number;          // sum of netPnlUsd over open + closed positions
  lpVsHodlUsd: number;          // sum of lpVsHodlUsd
  feesTotalUsd: number;
  incentivesTotalUsd: number;
  /** Positions still deployed. This is what the home screen leads with, because
   *  it is the only part the user can still act on. */
  open: PnlRollup;
  /** Everything this wallet has ever done, closed positions included. The more
   *  interesting number, but it belongs in its own card and not in the headline:
   *  a trade from a year ago should not describe today. */
  allTime: PnlRollup;
  /** Wallet level totals for the History view. */
  lifetime: LifetimeStats;
  headline: string;             // about open positions, engine-generated
  historyHeadline: string | null; // about all time, null when nothing is closed
  confidence: Confidence;
}

/** Where each holding lands once liquidity positions leave their range. */
export interface ScenarioHolding {
  symbol: string;
  assetClass: AssetClass;
  amount: number;
  valueUsd: number;
  pct: number;
}

export interface ScenarioSide {
  totalUsd: number;
  holdings: ScenarioHolding[];
}

export interface Scenarios {
  up: ScenarioSide;
  down: ScenarioSide;
  perPosition: Array<{
    id: string; symbol: string;
    kind: 'crypto' | 'crypto-vs-stock';
    upAsset: string; upAmount: number; upValueUsd: number;
    downAsset: string; downAmount: number; downValueUsd: number;
    explanation: string;
  }>;
  hasPositions: boolean;
}

export interface Portfolio {
  address: string;
  chain: 'base';
  generatedAt: number;
  summary: PortfolioSummary;
  positions: LpPosition[];
  tokens: TokenHolding[];       // includes tokenized stocks (isTokenizedStock)
  lending: LendingPosition[];
  exposure: Exposure;
  /** What the portfolio converts into if the market moves either way. */
  scenarios: Scenarios;
  warnings: string[];
}

/** Simulator input/output (core/math.js simulateAtPrice / generateSimulationCurve) */
export interface SimulationInput {
  entryPrice: number;
  lowerPrice: number;
  upperPrice: number;
  positionUsd: number;
  aprPct: number;
  days: number;
  priceMinPct?: number;   // default -50
  priceMaxPct?: number;   // default +100
}

export interface SimulationPoint {
  price: number;
  lpValue: number;
  holdValue: number;
  feesEarned: number;
  totalWithFees: number;
  pnlVsHold: number;
  inRange: boolean;
}
