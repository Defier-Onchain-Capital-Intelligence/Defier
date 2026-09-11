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
  /**
   * Liquidity added or removed, raw uint128 as a string, negative for a
   * withdrawal. Token amounts cannot say what a position was worth at a price
   * it no longer sits at; L and the range can, which is what the value curve
   * needs.
   */
  liquidityDelta?: string;
  rewardAmount?: number;    // AERO, human units (claim_rewards)
  rewardUsd?: number;
  // A gauge's ClaimRewards is indexed by wallet, not by position, so the same
  // claim reaches every position in that pool. These two identify it uniquely
  // so it can be attributed to one of them and dropped from the others.
  gauge?: string;
  logIndex?: number;
  gasUsd?: number;
  notes?: string[];
}

/** One day of the value curve. Built by core/valueHistory.js */
export interface ValuePoint {
  day: number;            // UTC day number
  timestamp: number;      // unix seconds, start of that day
  lpUsd: number;          // inside the positions + everything already withdrawn
  hodlUsd: number;        // the same tokens, never deposited
  divergenceUsd: number;  // lpUsd - hodlUsd, signed
  positionsOpen: number;
}

/**
 * The curve, and what it does not cover. A curve drawn over a wallet whose
 * history is partly unreadable has to say so, or it reads as the whole story.
 */
export interface ValueHistory {
  points: ValuePoint[];
  positionsCovered: number;
  positionsTotal: number;
  firstDay: number | null;
  complete: boolean;
  notes: string[];
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

/** One of the four things you could have done with the same deposit. */
export interface StrategyOption {
  key: 'lp' | 'hold-both' | 'all-token0' | 'all-token1';
  label: string;
  valueUsd: number;
  pnlUsd: number;
  pnlPct: number;
  detail: string;
  isBest?: boolean;
}

export interface StrategyComparison {
  capitalUsd: number;
  options: StrategyOption[];
  bestKey: StrategyOption['key'];
  lpWon: boolean;
  lpVsBestUsd: number | null;
}

export interface LpPosition {
  id: string;                   // `${protocol}:${tokenId}`
  protocol: 'aerodrome' | 'aerodrome-v1' | 'uniswap-v3';
  /** 'cl' is concentrated liquidity with a range and an NFT; 'amm' is a Basic
   *  pool: no NFT, no range, always both sides. They are read differently. */
  kind?: 'cl' | 'amm';
  /** Basic pools only: whether it is a Stable or a Volatile pool. */
  stable?: boolean;
  /** Basic pools only: share of the whole pool, as a percentage. */
  poolSharePct?: number;
  tokenId: string;
  poolAddress: string;
  token0: TokenRef;
  token1: TokenRef;
  symbol: string;               // "WETH/USDC"
  /** Aerodrome Slipstream: the pool's tick spacing. Null on Uniswap. */
  tickSpacing: number | null;
  /** Uniswap V3: the fee tier in hundredths of a bip. Null on Aerodrome. */
  feeTier: number | null;
  /** How the pool is named to a reader: "CL200", or "0.05%". */
  variant: string | null;
  tickLower: number;
  tickUpper: number;
  currentTick: number;
  priceLower: number;           // token0 in token1 terms, decimals-adjusted
  priceUpper: number;
  currentPrice: number;
  inRange: boolean;
  staked: boolean;              // NFT held by Aerodrome gauge
  /** 'vfat' when the NFT belongs to the user's Sickle contract, not to their own address. */
  heldVia: 'wallet' | 'vfat';
  /** The contract that actually owns it, when that is not the wallet. */
  heldBy: string | null;
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
  /** The same deposit under four choices, all valued today. Replaces breakeven prices. */
  strategies: StrategyComparison | null;
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

export type LendingProtocol = 'aave-v3' | 'moonwell' | 'compound-v3';

export interface LendingPosition {
  protocol: LendingProtocol;
  protocolLabel: string;         // "Aave v3", "Compound v3 USDC"
  market?: string;               // Comet only: which base asset this market lends
  supplied: Array<{ token: TokenRef; amount: number; valueUsd: number; isCollateral: boolean }>;
  borrowed: Array<{ token: TokenRef; amount: number; valueUsd: number }>;
  /**
   * The protocol's own ratio, computed from its oracle and its collateral
   * factors. null when there is no debt, so the ratio is undefined, and also
   * null when our figure disagreed with what the protocol says about the
   * account: a health factor that is close is worse than none at all.
   */
  healthFactor: number | null;
  healthSource: LendingProtocol;
  liquidationThresholdPct: number | null;
  netValueUsd: number;
  totalCollateralUsd: number;
  totalDebtUsd: number;
  breakdownComplete: boolean;    // false when only the protocol's totals reconciled
}

/** Which lending protocols this portfolio actually asked. */
export interface LendingCoverage {
  checked: string[];
  notCovered: string[];
  failed: string[];
}

export interface ExposureSlice {
  assetClass: AssetClass;
  label: string;                // "ETH", "Stocks", "Stablecoins"
  valueUsd: number;
  pct: number;                  // 0..100
}

export interface Exposure {
  totalUsd: number;
  /** Sum of absolute values: what is at stake on both sides, the base for every share below. */
  grossUsd: number;
  /** True when something here is borrowed, so the bar carries negative slices. */
  leveraged: boolean;
  byClass: ExposureSlice[];
  byAsset: Array<{ symbol: string; valueUsd: number; pct: number }>;
  marketBiasPct: number;        // % not in stables
}

/** One line of "where is my money sitting". Built by core/holdings.js */
export interface HoldingLine {
  key: string;
  venue: 'wallet' | 'lp' | 'lending';
  /** The token's contract address. The only stable key for a logo: symbols are mutable. */
  address: string;
  symbol: string;
  assetClass: AssetClass;
  amount: number | null;
  unit: 'tokens' | 'shares';
  valueUsd: number;             // negative for borrowed: you owe it back
  detail: string;               // "In your wallet", "Inside your WETH/USDC position"
  positionId: string | null;    // set for lp lines, so the row can link through
  /** Whether this money is being paid anything where it sits. */
  earning: boolean;
  /** Present on lp lines: the position the money is inside, and what it pays. */
  position?: {
    id: string;
    symbol: string;
    inRange: boolean;
    staked: boolean;
    valueUsd: number | null;
    realAprPct: number | null;
    earnedUsd: number;
    earned: {
      feesClaimedUsd: number;
      feesUnclaimedUsd: number;
      rewardsClaimedUsd: number;
      rewardsPendingUsd: number;
      feesToken0: number;
      feesToken1: number;
      symbol0: string;
      symbol1: string;
      address0: string;
      address1: string;
      rewardsPendingAmount: number | null;
    };
  };
  stale: boolean;               // the price behind this line has not updated recently
  priceSource: PriceQuote['source'] | null;
  multiplier: number | null;    // B20 wallet holdings: tokens per share, moves with dividends
}

export interface HoldingsBucket {
  totalUsd: number;
  pctOfPortfolio: number;
  walletUsd: number;
  inPoolsUsd: number;
  lendingUsd: number;
  /** Sum of absolute values in this bucket: the base for every class share. */
  grossUsd: number;
  /** What is owed here. Not idle capital, and not part of the deployed share. */
  borrowedUsd: number;
  lines: HoldingLine[];
  byClass: ExposureSlice[];
  hiddenDustCount: number;      // lines under a hundredth of a cent, counted but not listed
  earningUsd: number;           // deployed somewhere that pays
  idleUsd: number;              // sitting still
}

/** The portfolio cut by what it is, not by how much risk it carries.
 *  Stablecoins count as crypto: dry powder, not a separate asset class. */
export interface Holdings {
  all: HoldingsBucket;
  crypto: HoldingsBucket;
  stocks: HoldingsBucket;
  totalUsd: number;
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
  /** What these totals are actually made of. A partial history says so. */
  coverage: {
    positionsRebuiltFromBurnedNfts: number;
    positionsNotReconstructed: number;
    complete: boolean;
    historyLoaded: boolean;
  };
}

/** A token, and both what was earned in it and what that was worth. */
export interface TokenTotal {
  address: string;
  symbol: string;
  amount: number;
  usd: number;
}

/**
 * Everything this wallet has ever done with liquidity, for the report.
 * Built by core/lifetime.js from reconstructed history.
 */
export interface LifetimeReport {
  positionsOpened: number;
  positionsClosed: number;
  positionsOpen: number;

  capitalDeployedUsd: number;
  daysProviding: number;        // days with capital inside a pool, overlaps counted once
  daysSinceFirst: number;
  firstPositionAt: number | null;
  averagePositionDays: number;

  feesClaimedUsd: number;
  feesUnclaimedUsd: number;
  rewardsClaimedUsd: number;
  rewardsPendingUsd: number;
  earnedUsd: number;
  gasUsd: number;

  feesByToken: TokenTotal[];
  rewardsByToken: TokenTotal[];

  impermanentLossUsd: number;   // positive number: what divergence cost
  divergenceGainUsd: number;    // positive number: what divergence gained, when it went the other way
  divergenceUsd: number;        // signed
  feesCoverIl: number | null;   // times over the fees covered it
  netPnlUsd: number;
  vsHoldingUsd: number;

  beatHoldCount: number;
  beatHoldPct: number;
  best: { id: string; pair: string; vsHoldUsd: number; daysOpen: number } | null;
  worst: { id: string; pair: string; vsHoldUsd: number; daysOpen: number } | null;

  pairs: Array<{ pair: string; positions: number; capitalUsd: number; vsHoldUsd: number }>;

  coverage: {
    positionsRebuiltFromBurnedNfts: number;
    positionsNotReconstructed: number;
    /** Rebuilt but with a gap we could not close. Named, never summed. */
    positionsExcluded: number;
    excluded: Array<{ id: string; pair: string; reason: string }>;
    /** The search could not cover the wallet's full range: this is a floor. */
    searchIncomplete: boolean;
    complete: boolean;
    historyLoaded: boolean;
    /** Set when one position holds 90% or more of the capital these totals rest on. */
    concentrated: { pair: string; sharePct: number } | null;
  };
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
    /** What this position is a bet on. Never "the market". */
    axis: 'crypto-vs-stocks' | 'crypto-vs-dollar' | 'asset-vs-asset';
    axisLabel: string;
    upMeans: string;
    downMeans: string;
    upAsset: string; upAmount: number; upValueUsd: number;
    downAsset: string; downAmount: number; downValueUsd: number;
    explanation: string;
  }>;
  hasPositions: boolean;
  axes: string[];
  /** True when the positions are bets on different things and cannot share one story. */
  mixedAxes: boolean;
  upLabel: string | null;
  downLabel: string | null;
  caveat: string | null;
}

/** An observation about the portfolio, paired with what exists on Base for it. */
export interface Observation {
  id: string;
  severity: 'info' | 'attention';
  title: string;
  detail: string;
  available: string | null;
}

export interface Portfolio {
  address: string;
  chain: 'base';
  generatedAt: number;
  summary: PortfolioSummary;
  positions: LpPosition[];
  tokens: TokenHolding[];       // includes tokenized stocks (isTokenizedStock)
  lending: LendingPosition[];
  lendingCoverage: LendingCoverage;
  exposure: Exposure;
  /** The same capital split into a crypto side and a stocks side. */
  holdings: Holdings;
  /** What the portfolio converts into if the market moves either way. */
  scenarios: Scenarios;
  /** Burned NFTs found, rebuilt, and missed. The honesty behind "all time". */
  historyGap: {
    burnedFound: number;
    burnedRebuilt: number;
    burnedMissed: number;
    discoveryIncomplete: boolean;
    deep: boolean;
  };
  /** Observations about composition. Never instructions: see core/advisor.js. */
  observations: Observation[];
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
  /** Share of the position's value in each token at this price, 0..100. */
  pctToken0?: number;
  pctToken1?: number;
  lpValue: number;
  holdValue: number;
  feesEarned: number;
  totalWithFees: number;
  pnlVsHold: number;
  inRange: boolean;
}
