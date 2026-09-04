/**
 * core/diagnose.js · Read only inspection helpers.
 *
 * Temporary, and honest about it: this exists because a wallet has a staked
 * position our scanner cannot see, and guessing at the reason from the outside
 * costs more than reading the contracts. Remove once the discovery path is fixed.
 */
import { ethers } from 'ethers';
import { getProvider, withTimeout } from './providers.js';
import { VOTER_ADDRS, NFPM_ADDRS, FACTORY_ADDRS, ERC20_ABI, NFPM_ABI, VOTER_ABI, FACTORY_ABI_AERO } from './constants.js';
import { CL_GAUGE_ABI, TOKENIZED_STOCKS } from './constants.base.js';

const CHAIN = 'base';
const ZERO = '0x0000000000000000000000000000000000000000';

const POOL_PROBE_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function tickSpacing() view returns (int24)',
  'function fee() view returns (uint24)',
  'function factory() view returns (address)',
  'function gauge() view returns (address)',
  'function nft() view returns (address)',
  'function stakedLiquidity() view returns (uint128)',
  'function liquidity() view returns (uint128)',
  'function stable() view returns (bool)',            // Aerodrome v2 marker
  'function getReserves() view returns (uint256,uint256,uint256)', // v2 marker
];

const GAUGE_PROBE_ABI = [
  ...CL_GAUGE_ABI,
  'function pool() view returns (address)',
  'function nft() view returns (address)',
  'function balanceOf(address) view returns (uint256)',
];

const call = async (contract, method, args = []) => {
  try {
    const value = await withTimeout(contract[method](...args), 8000);
    if (value && value._isBigNumber) return value.toString();
    if (Array.isArray(value)) return value.map((v) => (v && v._isBigNumber ? v.toString() : String(v)));
    return typeof value === 'string' ? value.toLowerCase() : value;
  } catch (err) {
    return { error: String(err?.reason || err?.message || err).slice(0, 120) };
  }
};

export async function inspectPool({ pool, wallet, gauge }) {
  const provider = await getProvider(CHAIN);
  const poolC = new ethers.Contract(pool, POOL_PROBE_ABI, provider);

  const [token0, token1, tickSpacing, fee, factory, poolGauge, poolNft, stable, reserves] = await Promise.all([
    call(poolC, 'token0'), call(poolC, 'token1'), call(poolC, 'tickSpacing'),
    call(poolC, 'fee'), call(poolC, 'factory'), call(poolC, 'gauge'),
    call(poolC, 'nft'), call(poolC, 'stable'), call(poolC, 'getReserves'),
  ]);

  const symbolOf = async (addr) => {
    if (typeof addr !== 'string') return null;
    const erc = new ethers.Contract(addr, ERC20_ABI, provider);
    return { address: addr, symbol: await call(erc, 'symbol'), decimals: await call(erc, 'decimals') };
  };

  const tokens = {
    token0: await symbolOf(token0),
    token1: await symbolOf(token1),
  };

  // Does OUR configured factory agree that this pool exists at this tick spacing?
  const ourFactoryAddr = FACTORY_ADDRS['aerodrome']?.[CHAIN];
  let factoryAgrees = null;
  if (ourFactoryAddr && typeof token0 === 'string' && typeof token1 === 'string' && typeof tickSpacing === 'string') {
    const f = new ethers.Contract(ourFactoryAddr, FACTORY_ABI_AERO, provider);
    factoryAgrees = await call(f, 'getPool', [token0, token1, parseInt(tickSpacing, 10)]);
  }

  // Does OUR configured voter know this pool's gauge?
  const voterAddr = VOTER_ADDRS['aerodrome']?.[CHAIN];
  const voter = voterAddr ? new ethers.Contract(voterAddr, VOTER_ABI, provider) : null;
  const voterGauge = voter ? await call(voter, 'gauges', [pool]) : null;

  const gaugeAddr = gauge || (typeof voterGauge === 'string' && voterGauge !== ZERO ? voterGauge : null)
    || (typeof poolGauge === 'string' && poolGauge !== ZERO ? poolGauge : null);

  let gaugeReport = null;
  if (gaugeAddr) {
    const g = new ethers.Contract(gaugeAddr, GAUGE_PROBE_ABI, provider);
    gaugeReport = {
      address: gaugeAddr.toLowerCase(),
      pool: await call(g, 'pool'),
      nft: await call(g, 'nft'),
      rewardToken: await call(g, 'rewardToken'),
      isGaugeAccordingToVoter: voter ? await call(voter, 'isGauge', [gaugeAddr]) : null,
      stakedValues: wallet ? await call(g, 'stakedValues', [wallet]) : null,
      erc20BalanceOf: wallet ? await call(g, 'balanceOf', [wallet]) : null,
    };
  }

  // If the gauge names a position manager, is it the one we configured?
  const ourNfpm = NFPM_ADDRS['aerodrome']?.[CHAIN]?.toLowerCase();
  const gaugeNft = typeof gaugeReport?.nft === 'string' ? gaugeReport.nft : null;
  const poolNftAddr = typeof poolNft === 'string' ? poolNft : null;

  let stakedPositions = null;
  const ids = Array.isArray(gaugeReport?.stakedValues) ? gaugeReport.stakedValues : [];
  if (ids.length && (gaugeNft || ourNfpm)) {
    const nfpmAddr = gaugeNft || ourNfpm;
    const nfpm = new ethers.Contract(nfpmAddr, NFPM_ABI, provider);
    stakedPositions = [];
    for (const id of ids.slice(0, 10)) {
      stakedPositions.push({ tokenId: id, nfpmUsed: nfpmAddr, positions: await call(nfpm, 'positions', [id]) });
    }
  }

  const stockMatch = Object.entries(TOKENIZED_STOCKS).find(
    ([, s]) => s.address === token0 || s.address === token1
  );

  return {
    pool: pool.toLowerCase(),
    looksLike: typeof reserves === 'object' && reserves?.error ? 'concentrated-liquidity' : 'v2-style (has getReserves)',
    tokens,
    tickSpacing, fee, factory, stable,
    poolNft: poolNftAddr,
    ourConfig: {
      factory: ourFactoryAddr?.toLowerCase() ?? null,
      voter: voterAddr?.toLowerCase() ?? null,
      nfpm: ourNfpm ?? null,
      factoryReturnsThisPool: factoryAgrees,
      factoryAgrees: typeof factoryAgrees === 'string' && factoryAgrees === pool.toLowerCase(),
    },
    voterGauge,
    gauge: gaugeReport,
    stakedPositions,
    tokenizedStockInPool: stockMatch ? { symbol: stockMatch[0], ...stockMatch[1] } : null,
  };
}
