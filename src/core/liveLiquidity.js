/**
 * Which pools actually hold something at the price they are trading at.
 *
 * The ranking is built from a data provider, and a provider can be wrong in a
 * way that matters: the WETH/cbBTC CL10 pool is listed with eleven million of
 * TVL and thirty eight million of daily volume while the contract holds about
 * forty five dollars of tokens and has no liquidity at the current tick at all.
 * Ranking that above real pools, with an APR beside it, is the ranking telling
 * somebody to put money somewhere nothing can be earned.
 *
 * One multicall answers it for every pool in the list, so the check costs a
 * single round trip per cache window rather than a request per pool.
 *
 * A zero here means "nothing at the current price", which is not the same as
 * "no money in the pool": every position may simply be out of range. Either way
 * no fee can be earned until the price comes back, which is what the reader is
 * deciding about.
 */
import { ethers } from 'ethers';
import { MULTICALL3_ADDR, MULTICALL3_ABI } from './constants.js';
import { getProvider, withTimeout } from './providers.js';

const CHAIN = 'base';
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const POOL_ABI = [
  'function liquidity() view returns (uint128)',
  'function stakedLiquidity() view returns (uint128)',
];

/**
 * @param {string[]} addresses pool addresses; anything that is not an address is skipped
 * @returns {Promise<Map<string, boolean>>} address -> true when nothing is active.
 *   Absent from the map means the question could not be answered, which callers
 *   must not read as a no.
 */
export async function findEmptyPools(addresses) {
  const out = new Map();
  const pools = [...new Set((addresses || [])
    .filter((a) => typeof a === 'string' && ADDRESS_RE.test(a))
    .map((a) => a.toLowerCase()))];
  if (pools.length === 0) return out;

  let provider;
  try {
    provider = await getProvider(CHAIN);
  } catch (_) {
    return out;
  }

  const iface = new ethers.utils.Interface(POOL_ABI);
  // Aerodrome moves staked liquidity out of liquidity(), so both are asked and
  // summed. A pool that does not have the staked half simply fails that call.
  const calls = pools.flatMap((target) => ([
    { target, allowFailure: true, callData: iface.encodeFunctionData('liquidity') },
    { target, allowFailure: true, callData: iface.encodeFunctionData('stakedLiquidity') },
  ]));

  const mc = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, provider);
  const results = [];
  for (let i = 0; i < calls.length; i += 400) {
    try {
      const res = await withTimeout(mc.callStatic.aggregate3(calls.slice(i, i + 400)), 20000);
      results.push(...res);
    } catch (_) {
      results.push(...calls.slice(i, i + 400).map(() => ({ success: false, returnData: '0x' })));
    }
  }

  pools.forEach((address, i) => {
    const unstaked = results[i * 2];
    const staked = results[i * 2 + 1];
    // Only a pool whose main liquidity() answered can be judged. Silence is not
    // evidence of emptiness, and reporting it as such would be the same error in
    // the other direction.
    if (!unstaked?.success) return;
    let total = 0n;
    try {
      total += ethers.BigNumber.from(unstaked.returnData).toBigInt();
      if (staked?.success) total += ethers.BigNumber.from(staked.returnData).toBigInt();
    } catch (_) {
      return;
    }
    out.set(address, total === 0n);
  });

  return out;
}
