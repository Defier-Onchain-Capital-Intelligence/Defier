/**
 * core/amm.js · Aerodrome's Basic pools — the half of Aerodrome that has no NFT.
 *
 * Aerodrome runs two products. Slipstream is concentrated liquidity and issues a
 * position NFT, which is what the rest of this engine tracks. Basic pools are
 * the classic constant-product AMM (Volatile and Stable), and being in one means
 * holding that pool's own ERC-20 token. There is no NFT, no position manager and
 * no registry to consult.
 *
 * That is why they were invisible to us, and it is not a small gap: a report
 * that says "every position you have ever opened" while silently skipping half
 * of Aerodrome is exactly the kind of confident wrong answer this product exists
 * to replace.
 *
 * Discovery therefore runs the other way round. We ask what ERC-20s the wallet
 * holds, then ask each one whether it is a pool — a Basic pool answers token0(),
 * token1(), stable() and getReserves(), and a plain token does not. Cheap,
 * exact, and it needs no list of pool addresses that would go stale.
 *
 * Two things Basic pools do differently from Uniswap V2, both of which change
 * the arithmetic:
 *
 *  1. Fees do NOT accrue into the reserves. They are held separately and claimed,
 *     so the value of an LP token does not grow with fees the way a V2 share does.
 *     Anyone treating this as V2 overstates the position and understates the fees.
 *  2. A staked position moves the LP token into the gauge, so the wallet's own
 *     balance reads zero while the capital is very much still deposited.
 */
import { ethers } from 'ethers';
import { MULTICALL3_ADDR, MULTICALL3_ABI, VOTER_ADDRS, VOTER_ABI } from './constants.js';
import { getProvider, withTimeout, batchedRequests } from './providers.js';
import { getErc20Balances } from './alchemy.js';
import { getTokenInfo } from './scanner.js';
import { fetchTokenPrice } from './prices.js';
import { classify } from './exposure.js';

const CHAIN = 'base';

/** What a Basic pool answers and a plain ERC-20 does not. */
const POOL_V1_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function stable() view returns (bool)',
  'function getReserves() view returns (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function claimable0(address) view returns (uint256)',
  'function claimable1(address) view returns (uint256)',
];

const GAUGE_V1_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function earned(address) view returns (uint256)',
];

const human = (bn, dec) => {
  const d = Number(dec);
  if (!Number.isInteger(d) || d < 0 || d > 36) return null;
  try { return parseFloat(ethers.utils.formatUnits(bn, d)); } catch (_) { return null; }
};

/**
 * Is this address a Basic pool? One multicall over every candidate rather than a
 * round trip each, because a wallet can easily hold a hundred ERC-20s and most
 * of them are airdropped noise.
 */
async function identifyPools(provider, addresses) {
  if (!addresses.length) return [];

  const iface = new ethers.utils.Interface(POOL_V1_ABI);
  const mc = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, provider);
  const calls = [];
  for (const address of addresses) {
    calls.push(
      { target: address, allowFailure: true, callData: iface.encodeFunctionData('token0', []) },
      { target: address, allowFailure: true, callData: iface.encodeFunctionData('token1', []) },
      { target: address, allowFailure: true, callData: iface.encodeFunctionData('stable', []) },
    );
  }

  let results;
  try {
    results = await withTimeout(mc.callStatic.aggregate3(calls), 25000);
  } catch (_) {
    return [];
  }

  const pools = [];
  addresses.forEach((address, i) => {
    const [t0, t1, st] = [results[i * 3], results[i * 3 + 1], results[i * 3 + 2]];
    // stable() is the discriminator: a Uniswap V3 pool also answers token0 and
    // token1, and must not be picked up here as a Basic pool.
    if (!t0?.success || !t1?.success || !st?.success) return;
    try {
      pools.push({
        address,
        token0: String(iface.decodeFunctionResult('token0', t0.returnData)[0]).toLowerCase(),
        token1: String(iface.decodeFunctionResult('token1', t1.returnData)[0]).toLowerCase(),
        stable: Boolean(iface.decodeFunctionResult('stable', st.returnData)[0]),
      });
    } catch (_) { /* not a pool after all */ }
  });

  return pools;
}

/**
 * Basic pool positions this wallet currently holds, staked or not.
 *
 * @param {string} wallet
 * @returns {Promise<{ positions: Array<object>, checked: number, unavailable: boolean }>}
 */
export async function getAmmPositions(wallet) {
  const provider = await getProvider(CHAIN);

  const balances = await getErc20Balances({ wallet });
  if (balances === null) {
    // No indexed balances means we cannot enumerate candidates at all, which is
    // a gap in coverage rather than an absence of positions. Say so.
    return { positions: [], checked: 0, unavailable: true };
  }

  const candidates = balances.map((b) => b.address);
  const pools = await identifyPools(provider, candidates);
  if (!pools.length) return { positions: [], checked: candidates.length, unavailable: false };

  const voterAddr = VOTER_ADDRS['aerodrome']?.[CHAIN];
  const voter = voterAddr ? new ethers.Contract(voterAddr, VOTER_ABI, provider) : null;

  const built = await batchedRequests(pools, async (pool) => {
    const contract = new ethers.Contract(pool.address, POOL_V1_ABI, provider);

    const [reserves, totalSupply, walletBalance] = await withTimeout(Promise.all([
      contract.getReserves(),
      contract.totalSupply(),
      contract.balanceOf(wallet),
    ]), 12000);

    // Staked liquidity lives in the gauge, so the wallet balance alone would
    // report a fully deposited position as empty.
    let gaugeAddress = null;
    let stakedBalance = ethers.BigNumber.from(0);
    let pendingRewards = ethers.BigNumber.from(0);
    if (voter) {
      try {
        const g = await withTimeout(voter.gauges(pool.address), 6000);
        if (g && g !== ethers.constants.AddressZero) {
          gaugeAddress = String(g).toLowerCase();
          const gauge = new ethers.Contract(gaugeAddress, GAUGE_V1_ABI, provider);
          const [bal, earned] = await withTimeout(Promise.all([
            gauge.balanceOf(wallet).catch(() => ethers.BigNumber.from(0)),
            gauge.earned(wallet).catch(() => ethers.BigNumber.from(0)),
          ]), 8000);
          stakedBalance = bal;
          pendingRewards = earned;
        }
      } catch (_) { /* no gauge for this pool */ }
    }

    const shares = walletBalance.add(stakedBalance);
    if (shares.isZero() || totalSupply.isZero()) return null;

    const [info0, info1] = await Promise.all([
      getTokenInfo(provider, pool.token0).catch(() => null),
      getTokenInfo(provider, pool.token1).catch(() => null),
    ]);
    if (!info0 || !info1) return null;

    // Share of the pool, in raw units, then converted once decimals are known.
    const amount0Raw = reserves._reserve0.mul(shares).div(totalSupply);
    const amount1Raw = reserves._reserve1.mul(shares).div(totalSupply);
    const amount0 = human(amount0Raw, info0.dec);
    const amount1 = human(amount1Raw, info1.dec);
    if (amount0 === null || amount1 === null) return null;

    // Fees sit outside the reserves in this design, so they are read separately
    // rather than being implicit in the share value.
    let fees0 = 0;
    let fees1 = 0;
    try {
      const [c0, c1] = await withTimeout(Promise.all([
        contract.claimable0(wallet).catch(() => ethers.BigNumber.from(0)),
        contract.claimable1(wallet).catch(() => ethers.BigNumber.from(0)),
      ]), 8000);
      fees0 = human(c0, info0.dec) ?? 0;
      fees1 = human(c1, info1.dec) ?? 0;
    } catch (_) { /* claimable is optional on some deployments */ }

    const [price0, price1] = await Promise.all([
      fetchTokenPrice(CHAIN, pool.token0).catch(() => null),
      fetchTokenPrice(CHAIN, pool.token1).catch(() => null),
    ]);

    const valueUsd = (amount0 * (price0 || 0)) + (amount1 * (price1 || 0));
    const feesUsd = (fees0 * (price0 || 0)) + (fees1 * (price1 || 0));

    return {
      id: `aerodrome-v1:${pool.address}`,
      protocol: 'aerodrome-v1',
      kind: 'amm',
      poolAddress: pool.address,
      stable: pool.stable,
      symbol: `${info0.sym}/${info1.sym}`,
      token0: { address: pool.token0, symbol: info0.sym, decimals: info0.dec, assetClass: classify(pool.token0) },
      token1: { address: pool.token1, symbol: info1.sym, decimals: info1.dec, assetClass: classify(pool.token1) },
      staked: !stakedBalance.isZero(),
      gaugeAddress,
      shares: shares.toString(),
      poolSharePct: totalSupply.isZero() ? 0
        : Number(shares.mul(1_000_000).div(totalSupply).toString()) / 10_000,
      currentAmounts: { token0: amount0, token1: amount1 },
      prices: {
        token0: price0 ? { usd: price0, source: 'llama' } : null,
        token1: price1 ? { usd: price1, source: 'llama' } : null,
      },
      valueUsd,
      feesUnclaimed: { token0: fees0, token1: fees1, usd: feesUsd },
      pendingRewardsRaw: pendingRewards.toString(),
      /** A Basic pool has no range: it is always in range and always both sides. */
      inRange: true,
      closed: false,
    };
  }, 4, 100);

  const positions = built
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);

  return { positions, checked: candidates.length, unavailable: false };
}
