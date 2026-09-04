/**
 * Base-only additions to constants.js. Import both; do not duplicate what is
 * already in constants.js (NFPM/Factory/Voter for Aerodrome + Uni V3 on Base).
 * Addresses from docs.base.org (tokenized stocks) and Basescan. Items marked
 * VERIFY must be checked on Basescan before first use.
 */

export const BASE_CHAIN_ID = 8453;

// ─── Core tokens on Base ───────────────────────────────────────────────────────
export const BASE_TOKENS = {
  WETH:  '0x4200000000000000000000000000000000000006',
  USDC:  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  USDbC: '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca',
  cbBTC: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
  cbETH: '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22',
  AERO:  '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
  DAI:   '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
  EURC:  '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42',
};

export const ASSET_CLASS_BY_ADDRESS = {
  [BASE_TOKENS.WETH]: 'ETH', [BASE_TOKENS.cbETH]: 'ETH',
  [BASE_TOKENS.cbBTC]: 'BTC',
  [BASE_TOKENS.USDC]: 'STABLE', [BASE_TOKENS.USDbC]: 'STABLE', [BASE_TOKENS.DAI]: 'STABLE', [BASE_TOKENS.EURC]: 'STABLE',
  [BASE_TOKENS.AERO]: 'AERO',
};

// ─── Coinbase tokenized stocks (B20) ──────────────────────────────────────────
// Source: docs.base.org/base-chain/asset-issuance/tokenized-stocks-on-base (Sep 2026)
// Identify by ADDRESS, never by symbol (symbol/name are mutable onchain).
export const B20_REGISTRY = '0x3f3e8cf41cdd3b1d118c16471ab0113dfddd5cad';

export const TOKENIZED_STOCKS = {
  AAPLc:  { address: '0xb200000000000000000000c2e324d24d7eecd1fb', feed: '0x787f13dea48db0897cbcdd985de77809d837f988', underlying: 'AAPL'  },
  AMZNc:  { address: '0xb200000000000000000000d9192b6b456483c2e8', feed: '0x06a8e4b3abb3b7543d8396fb2b763d22820cb295', underlying: 'AMZN'  },
  COINc:  { address: '0xb200000000000000000000c85a31389d71f3ecfb', feed: '0x408e44f504a7371a345f03a73ddc96a4b48e8aa7', underlying: 'COIN'  },
  CRCLc:  { address: '0xb20000000000000000000019f6e7c675b73c2e4d', feed: '0x0231cf2635d1e17bb5c2462cc7504ba1fbd61f33', underlying: 'CRCL'  },
  GOOGLc: { address: '0xb2000000000000000000002d0ba3164cc74f58b7', feed: '0x5bf49e0ffa937ce2fff033c739ad7c634c4d34f2', underlying: 'GOOGL' },
  INTCc:  { address: '0xb2000000000000000000004aff16039ba04bdfbc', feed: '0xab657c39bac0d5886250d70849e2e3e008f2eecb', underlying: 'INTC'  },
  METAc:  { address: '0xb2000000000000000000008bc8786b856e61707c', feed: '0x6526ae6797a76123638b863aee4dd27ba4e4b27d', underlying: 'META'  },
  MSFTc:  { address: '0xb200000000000000000000ab99cfa739e253872b', feed: '0xeb10a6c9aa7e537aed766c08c35dae35b321b18c', underlying: 'MSFT'  },
  MSTRc:  { address: '0xb2000000000000000000004884b426556b92883d', feed: '0xb3ce282cd188b35da0e38d8bc7d58e33173d202a', underlying: 'MSTR'  },
  NVDAc:  { address: '0xb20000000000000000000078ee7ce2fe4908108c', feed: '0x04689a41629776563e6822f76f2e57d148d28513', underlying: 'NVDA'  },
  SNDKc:  { address: '0xb200000000000000000000397293cb8cda9a10c5', feed: '0x388b0dc46c0fb05a74bee0994fa5b02c6fcca2ea', underlying: 'SNDK'  },
  SPCXc:  { address: '0xb2000000000000000000007b9fcbd005511acbd5', feed: '0x6a634b235903c4ad6376892180d6ff8612e3fa68', underlying: 'SPCX'  },
  TSLAc:  { address: '0xb2000000000000000000001e800a7f5189430cd0', feed: '0xfaf869185383a24f8cb00e27bda6b63b9905dcb4', underlying: 'TSLA'  },
};

export const STOCK_ADDRESSES = new Set(Object.values(TOKENIZED_STOCKS).map((s) => s.address));

export const B20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function scaledBalanceOf(address) view returns (uint256)',
  'function toScaledBalance(uint256) view returns (uint256)',
  'function WAD_PRECISION() view returns (uint256)',
  // VERIFY exact multiplier getter name in the B20 spec (docs.base.org/specifications/b20)
];

export const CHAINLINK_FEED_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
];
export const CHAINLINK_STALE_SECONDS = 26 * 3600; // heartbeat is 24h; freeze during corporate actions

// ─── Aerodrome CL gauge (ported from the HTML tool, lines ~1040 and ~3380) ─────
export const CL_GAUGE_ABI = [
  'function stakedValues(address) view returns (uint256[])',
  'function stakedContains(address, uint256) view returns (bool)',
  'function earned(address account, uint256 tokenId) view returns (uint256)',
  'function rewardRate() view returns (uint256)',
];
export const VOTER_GAUGES_ABI = [
  'function gauges(address) view returns (address)',
  'function isGauge(address) view returns (bool)',
];
// Aerodrome Slipstream tick spacings. The first five are the ones the HTML tool
// probed; the rest were added because a pool on a spacing we never ask about is
// a pool we will swear does not exist. Cheap to add: these are Multicall3 batched.
export const CL_TICK_SPACINGS = [1, 10, 50, 100, 200, 500, 2000];

// ─── NFPM event topics (same for Uniswap V3 and Aerodrome Slipstream; VERIFY on Aerodrome) ─
export const NFPM_EVENTS = {
  Transfer:          'Transfer(address,address,uint256)',
  IncreaseLiquidity: 'IncreaseLiquidity(uint256,uint128,uint256,uint256)',
  DecreaseLiquidity: 'DecreaseLiquidity(uint256,uint128,uint256,uint256)',
  Collect:           'Collect(uint256,address,uint256,uint256)',
};
export const GAUGE_EVENTS = {
  ClaimRewards2: 'ClaimRewards(address,uint256)',          // confirmed in HTML tool
  ClaimRewards3: 'ClaimRewards(address,address,uint256)',  // fallback
};

// ─── Aave v3 on Base (read-only) ─────────────────────────────────────────────
export const AAVE_V3_BASE = {
  pool: '0xa238dd80c259a72e81d7e4664a9801593f98d1c5',           // VERIFY
  uiPoolDataProvider: null,                                     // VERIFY (fill from aave address book)
  poolAddressesProvider: null,                                  // VERIFY
};
export const AAVE_POOL_ABI = [
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
];

// ─── Base blocks ──────────────────────────────────────────────────────────────
export const BASE_BLOCKS_PER_DAY = 43200; // 2s blocks
