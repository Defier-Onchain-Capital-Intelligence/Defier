/**
 * defier-core/constants.js
 *
 * Central source of truth for all contract addresses, ABIs, chain configs,
 * token allowlists, and static data. Used by web and mobile equally.
 *
 * NO UI code here. NO side effects on import.
 */

import { ethers } from 'ethers';

// ─── Liquidity-related math constant ──────────────────────────────────────────
export const Q128 = ethers.BigNumber.from(2).pow(128);

// ─── Token classification ──────────────────────────────────────────────────────
export const STABLECOINS = new Set([
  'USDC','USDT','DAI','FRAX','BUSD','USDS','USDE','CRVUSD','LUSD','SUSD',
  'RLUSD','EURC','PYUSD','GHO','USDBC','USD+','USDC.E','FDUSD','TUSD',
  'DOLA','MKUSD','CUSD','AGEUR','USDB',
]);

export const MAJORS = new Set([
  'WETH','ETH','WBTC','BTC','CBETH','RETH','WSTETH','STETH','BNB','WBNB',
  'CBBTC','EZETH','WEETH','RSETH','SOLVBTC','LBTC','BTCB','SOL','OP','ARB',
]);

// ─── Chain RPC endpoints ────────────────────────────────────────────────────────
// Base only. Primary = Alchemy (fast, higher getLogs limits), fallbacks = public nodes.
//
// SECURITY: ALCHEMY_KEY is server-only and must never carry the NEXT_PUBLIC_ prefix.
// This module is imported exclusively from API routes, so the key never reaches the
// browser bundle. See SECURITY.md section 1.
export const ALCHEMY_KEY = process.env.ALCHEMY_KEY || '';
export const HAS_ALCHEMY = ALCHEMY_KEY.length > 0;

export const CHAIN_RPCS_LIST = {
  base: [
    ...(HAS_ALCHEMY ? [`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`] : []),
    'https://base-rpc.publicnode.com',
    'https://gateway.tenderly.co/public/base',
    'https://base.drpc.org',
    'https://1rpc.io/base',
  ],
};

// Approximate deployment blocks per chain (limits getLogs scan range)
export const DEPLOY_BLOCKS = {
  // TODO(Part 1): narrow to the Aerodrome Slipstream NFPM deploy block on Base
  // before running unbounded lookbacks. Verify on Basescan.
  base: 1000000,
};

// ─── Contract addresses ─────────────────────────────────────────────────────────
// NFPM = Non-Fungible Position Manager (holds LP NFTs)
export const NFPM_ADDRS = {
  'uniswap-v3': {
    ethereum: '0xc36442b4a4522e871399cd717abdd847ab11218f',
    base:     '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    arbitrum: '0xc36442b4a4522e871399cd717abdd847ab11218f',
    optimism: '0xc36442b4a4522e871399cd717abdd847ab11218f',
    unichain: '0xc36442b4a4522e871399cd717abdd847ab11218f',
  },
  'pancakeswap-v3': {
    ethereum: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    bsc:      '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
  },
  'aerodrome': {
    base:     '0x827922686190790b37229fd06084350E74485b72',
    optimism: '0xd557f2c8702b6ef571bd72a31ff3a8cd2a68bfdc', // Velodrome CL NFPM
  },
};

export const FACTORY_ADDRS = {
  'uniswap-v3': {
    ethereum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    base:     '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    arbitrum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    optimism: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    unichain: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  },
  'pancakeswap-v3': {
    ethereum: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    bsc:      '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  },
  'aerodrome': {
    base:     '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A',
    optimism: '0xCc0bDDB707055e04e497aB22a59c2aF4391cd12F', // Velodrome CL factory
  },
};

export const VOTER_ADDRS = {
  aerodrome: {
    base:     '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5',
    optimism: '0x41c914ee0c7e1a5edcd0295623e6dc557b5abf3c',
  },
};

export const PANCAKE_MASTERCHEF = {
  bsc:      '0x556B9306565093C855AEA9AE92A594704c2Cd59e',
  ethereum: '0x556B9306565093C855AEA9AE92A594704c2Cd59e',
  arbitrum: '0x556B9306565093C855AEA9AE92A594704c2Cd59e',
  base:     '0x556B9306565093C855AEA9AE92A594704c2Cd59e',
};

// Multicall3 — same address on all major EVM chains
export const MULTICALL3_ADDR = '0xcA11bde05977b3631167028862bE2a173976CA11';

// ─── Minimal ABIs ──────────────────────────────────────────────────────────────
export const NFPM_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)',
  'function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)',
  'function ownerOf(uint256) view returns (address)',
];

export const VOTER_ABI = [
  'function isGauge(address) view returns (bool)',
  'function gauges(address) view returns (address)',
];

export const GAUGE_ABI = [
  'function earned(address account, uint256 tokenId) view returns (uint256)',
  'function rewardToken() view returns (address)',
  'function rewardRate() view returns (uint256)',
  'function stakedLiquidity() view returns (uint128)',
  'function stakedValues(address) view returns (uint256[])',
];

export const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

export const ERC20_DEC_ABI = ['function decimals() external view returns (uint8)'];

// Uniswap V3 / PancakeSwap V3: getPool(tokenA, tokenB, uint24_fee)
export const FACTORY_ABI = ['function getPool(address,address,uint24) view returns (address)'];
// Aerodrome Slipstream: getPool(tokenA, tokenB, int24_tickSpacing)
export const FACTORY_ABI_AERO = ['function getPool(address,address,int24) view returns (address)'];

// Uniswap V3 slot0: 7 values (includes feeProtocol field)
// Outputs named (sqrtPriceX96, tick) so callers can use slot0.sqrtPriceX96 / slot0.tick
// instead of fragile positional indexing — matches inbest-defi-tool.html's V3_POOL_ABI_MIN.
export const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
  'function liquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function tickSpacing() view returns (int24)',
];

// Aerodrome CL slot0: 6 values (no feeProtocol) + stakedLiquidity
export const POOL_ABI_AERO = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, bool)',
  'function liquidity() view returns (uint128)',
  'function stakedLiquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function tickSpacing() view returns (int24)',
];

// feeGrowth ABIs for exact per-position fee calculation
export const POOL_ABI_FEE_GROWTH = [
  'function feeGrowthGlobal0X128() view returns (uint256)',
  'function feeGrowthGlobal1X128() view returns (uint256)',
  // Uniswap V3: 8 fields — [2]=fgOutside0, [3]=fgOutside1
  'function ticks(int24) view returns (uint128,int128,uint256,uint256,int56,uint160,uint32,bool)',
];

// Aerodrome/Velodrome: extra stakedLiquidityNet (int128) at index 2 shifts fgOutside fields to [3] and [4]
export const POOL_ABI_FEE_GROWTH_AERO = [
  'function feeGrowthGlobal0X128() view returns (uint256)',
  'function feeGrowthGlobal1X128() view returns (uint256)',
  'function ticks(int24) view returns (uint128,int128,int128,uint256,uint256,uint256,int56,uint160,uint32,bool)',
];

// Minimal pool ABIs for APR calculation (lighter than the full ABI)
export const V3_POOL_ABI_MIN = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)',
  'function liquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
];
export const AERO_POOL_ABI_MIN = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, bool)',
  'function liquidity() view returns (uint128)',
  'function stakedLiquidity() view returns (uint128)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  // Aerodrome CL fees are set per pool and are not in DeFiLlama's metadata, so
  // the chain is the only place the real number exists.
  'function fee() view returns (uint24)',
];

export const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
];

// ─── Factory config (protocol-aware) ──────────────────────────────────────────
export const FACTORY_CONFIG = {
  'uniswap-v3': {
    abi: [FACTORY_ABI[0]],
    paramFn: (pool) => {
      if (pool.feeTier && pool.feeTier > 0) return pool.feeTier;
      const m = (pool.poolMeta || '').trim().match(/^(\d+\.?\d*)%$/);
      return m ? Math.round(parseFloat(m[1]) * 10000) : null;
    },
    chains: {
      ethereum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      base:     '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
      arbitrum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      optimism: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      unichain: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    },
  },
  'aerodrome-v3': {
    abi: [FACTORY_ABI_AERO[0]],
    paramFn: (pool) => {
      const m = (pool.poolMeta || '').toLowerCase().match(/cl(\d+)/);
      return m ? parseInt(m[1]) : null;
    },
    chains: {
      base:     '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A',
      optimism: '0xCc0bDDB707055e04e497aB22a59c2aF4391cd12F',
    },
  },
  'pancakeswap-v3': {
    abi: [FACTORY_ABI[0]],
    paramFn: (pool) => {
      if (pool.feeTier && pool.feeTier > 0) return pool.feeTier;
      const m = (pool.poolMeta || '').trim().match(/^(\d+\.?\d*)%$/);
      return m ? Math.round(parseFloat(m[1]) * 10000) : null;
    },
    chains: {
      ethereum: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
      base:     '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
      bsc:      '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
      arbitrum: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    },
  },
};

// ─── Token data ────────────────────────────────────────────────────────────────
// Common token metadata cache (avoids extra RPC calls for decimals/symbol)
export const TOKEN_CACHE = {
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { sym: 'WETH',   dec: 18 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { sym: 'USDC',   dec: 6  },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { sym: 'USDT',   dec: 6  },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { sym: 'WBTC',   dec: 8  },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { sym: 'DAI',    dec: 18 },
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': { sym: 'wstETH', dec: 18 },
  '0xae78736cd615f374d3085123a210448e74fc6393': { sym: 'rETH',   dec: 18 },
  '0x4200000000000000000000000000000000000006': { sym: 'WETH',   dec: 18 },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { sym: 'USDC',   dec: 6  },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': { sym: 'DAI',    dec: 18 },
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631': { sym: 'AERO',   dec: 18 },
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { sym: 'cbBTC',  dec: 8  },
  '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca': { sym: 'USDbC',  dec: 6  },
  '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': { sym: 'cbETH',  dec: 18 },
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': { sym: 'WETH',   dec: 18 },
  '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': { sym: 'USDC.e', dec: 6  },
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { sym: 'USDC',   dec: 6  },
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { sym: 'USDT',   dec: 6  },
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': { sym: 'WBTC',   dec: 8  },
  '0x912ce59144191c1204e64559fe8253a0e49e6548': { sym: 'ARB',    dec: 18 },
  '0x5979d7b546e38e414f7e9822514be443a4800529': { sym: 'wstETH', dec: 18 },
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': { sym: 'WBNB',   dec: 18 },
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': { sym: 'USDC',   dec: 18 },
  '0x55d398326f99059ff775485246999027b3197955': { sym: 'USDT',   dec: 18 },
  '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c': { sym: 'BTCB',   dec: 18 },
  '0x2170ed0880ac9a755fd29b2688956bd959f933f8': { sym: 'ETH',    dec: 18 },
  '0x0b2c639c533813f4aa9d7837caf62653d097ff85': { sym: 'USDC',   dec: 6  },
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { sym: 'USDT',   dec: 6  },
  '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34': { sym: 'USDe',   dec: 18 },
  '0x9560e827af36c94d2ac33a39bce1fe78631088db': { sym: 'VELO',   dec: 18 },
};

// CoinGecko price IDs
export const CG_IDS = {
  ETH:      'coingecko:ethereum',
  WETH:     'coingecko:ethereum',
  BTC:      'coingecko:bitcoin',
  WBTC:     'coingecko:wrapped-bitcoin',
  BTCB:     'coingecko:bitcoin',
  USDC:     'coingecko:usd-coin',
  USDT:     'coingecko:tether',
  DAI:      'coingecko:dai',
  BNB:      'coingecko:binancecoin',
  WBNB:     'coingecko:binancecoin',
  ARB:      'coingecko:arbitrum',
  OP:       'coingecko:optimism',
  AERO:     'coingecko:aerodrome-finance',
  VELO:     'coingecko:velodrome-finance',
  LINK:     'coingecko:chainlink',
  UNI:      'coingecko:uniswap',
  CAKE:     'coingecko:pancakeswap-token',
  WSTETH:   'coingecko:wrapped-steth',
  RETH:     'coingecko:rocket-pool-eth',
  CBETH:    'coingecko:coinbase-wrapped-staked-eth',
  'USDC.E': 'coingecko:usd-coin',
  USDBC:    'coingecko:usd-coin',
};

// DeFiLlama coins API chain prefix mapping
export const LLAMA_CHAIN = {
  ethereum: 'ethereum',
  base:     'base',
  arbitrum: 'arbitrum',
  bsc:      'bsc',
  optimism: 'optimism',
  unichain: 'unichain',
};

// The Graph subgraph URLs for tick data
export const SUBGRAPH_URLS = {
  'uniswap-v3': {
    ethereum: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
    base:     'https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest',
    arbitrum: 'https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-minimal',
    bsc:      'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc',
  },
  'aerodrome-v3': {
    base:     'https://api.studio.thegraph.com/query/57080/aerodrome-cl/version/latest',
    optimism: 'https://api.studio.thegraph.com/query/57080/velodrome-cl/version/latest',
  },
  'pancakeswap-v3': {
    bsc:      'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc',
    ethereum: 'https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-eth',
  },
};

// ─── Token allowlist per chain ─────────────────────────────────────────────────
// Both tokens in a pool must be in this list for Defier to show it.
// All addresses are lowercase.
export const ALLOWED_CONTRACTS = {
  Ethereum: new Set([
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
    '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', // wstETH
    '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', // stETH
    '0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee', // weETH
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
    '0x1abaea1f7c830bd89acc67ec4af516284b1bc33c', // EURC
    '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
    '0x4c9edd5852cd905f086c759e8383e09bff1e68b3', // USDe
    '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
    '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', // cbBTC
    '0xbe9895146f7af43049ca1c1ae358b0541ea49704', // cbETH
  ]),
  Base: new Set([
    '0x4200000000000000000000000000000000000006', // WETH
    '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452', // wstETH
    '0x04c0599ae5a44757c0af6f9ec3b93da8976c150a', // weETH
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
    '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42', // EURC
    '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', // USDT
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI
    '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34', // USDe
    '0x940181a94a35a4569e4529a3cdfb74e38fd98631', // AERO
    '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', // cbBTC
    '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', // cbETH
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', // USDbC
  ]),
  Arbitrum: new Set([
    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
    '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f', // WBTC
    '0x5979d7b546e38e414f7e9822514be443a4800529', // wstETH
    '0x35751007a407ca6feffe80b3cb397736d2cf4dbe', // weETH
    '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
    '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
    '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
    '0x12275dcb9653892f6fc74ee39e8b850f3e1be959', // USDe
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
    '0x912ce59144191c1204e64559fe8253a0e49e6548', // ARB
  ]),
  BSC: new Set([
    '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WBNB
    '0x2170ed0880ac9a755fd29b2688956bd959f933f8', // ETH
    '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c', // BTCB
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
    '0x55d398326f99059ff775485246999027b3197955', // USDT
    '0xc5f0f7b66764f6ec8c8dff7ba683102295e16409', // FDUSD
    '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3', // DAI
    '0x4c9edd5852cd905f086c759e8383e09bff1e68b3', // USDe
  ]),
  Optimism: new Set([
    '0x4200000000000000000000000000000000000006', // WETH
    '0x1f32b1c2345538c0c6f582fcb022739c4a194ebb', // wstETH
    '0x68f180fcce6836688e9084f035309e29bf0a2095', // WBTC
    '0x0b2c639c533813f4aa9d7837caf62653d097ff85', // USDC
    '0x7f5c764cbc14f9669b88837ca1490cca17c31607', // USDC.e
    '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', // USDT
    '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
    '0x4200000000000000000000000000000000000042', // OP
    '0x9560e827af36c94d2ac33a39bce1fe78631088db', // VELO
  ]),
  Unichain: new Set([
    '0x4200000000000000000000000000000000000006', // WETH
    '0x078d782e2cd4563abf2a48e8f8cfd04bd2e1b30', // USDC
    '0x9151434b16b58c9f2cfb13ed7fcb73be25efe37', // USDT
    '0x8f187aa05619a017077f5308904739877ce9ea21', // UNI
  ]),
};

export const ALLOWED_CHAINS = new Set(['Ethereum', 'Base', 'Arbitrum', 'BSC', 'Optimism', 'Unichain']);
