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
import { AERODROME_CL_DEPLOYMENTS } from './constants.base.js';
import { getProvider, withTimeout } from './providers.js';

const CHAIN = 'base';
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

const POOL_ABI = [
  'function liquidity() view returns (uint128)',
  'function stakedLiquidity() view returns (uint128)',
];

const FACTORY_ABI = ['function getPool(address,address,int24) view returns (address)'];
const ZERO = '0x0000000000000000000000000000000000000000';

/** aggregate3 in slices, tolerating per call failure. */
async function aggregate(provider, calls) {
  const mc = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, provider);
  const out = [];
  for (let i = 0; i < calls.length; i += 400) {
    try {
      const res = await withTimeout(mc.callStatic.aggregate3(calls.slice(i, i + 400)), 20000);
      out.push(...res);
    } catch (_) {
      out.push(...calls.slice(i, i + 400).map(() => ({ success: false, returnData: '0x' })));
    }
  }
  return out;
}

/**
 * Which of these pools hold anything at the price they are trading at.
 *
 * The data provider identifies pools by a UUID, not by an address, which is why
 * the first version of this shipped as a no operation: it filtered for addresses
 * and found none, so every pool came back "unknown" and the check silently did
 * nothing. Worse than not shipping it, because the field existed and looked
 * answered.
 *
 * So the address is resolved first, from the pair and the tick spacing that the
 * variant label carries, against both Slipstream factories. Two multicalls for
 * the whole ranking.
 *
 * Only Aerodrome concentrated pools are resolved. Everything else stays absent
 * from the map, which callers must read as "not asked" rather than as a no —
 * the same rule the emptiness answer itself follows.
 *
 * @param {Array<{id: string, tokens: string[], variant: string|null}>} rows
 * @returns {Promise<Map<string, boolean>>} pool id -> true when nothing is active
 */
export async function findEmptyPools(rows) {
  const out = new Map();

  const candidates = (rows || []).filter((r) => {
    const spacing = Number(String(r?.variant || '').match(/^CL(\d+)$/)?.[1]);
    return Number.isFinite(spacing) && spacing > 0
      && Array.isArray(r.tokens) && r.tokens.length >= 2
      && ADDRESS_RE.test(r.tokens[0]) && ADDRESS_RE.test(r.tokens[1]);
  });
  if (candidates.length === 0) return out;

  let provider;
  try {
    provider = await getProvider(CHAIN);
  } catch (_) {
    return out;
  }

  const factoryIface = new ethers.utils.Interface(FACTORY_ABI);
  const factories = AERODROME_CL_DEPLOYMENTS.map((d) => d.factory);

  // A pair can live on either Slipstream deployment, so both are asked and the
  // first that answers with a real address wins.
  const resolveCalls = candidates.flatMap((r) => {
    const spacing = Number(String(r.variant).slice(2));
    return factories.map((target) => ({
      target,
      allowFailure: true,
      callData: factoryIface.encodeFunctionData('getPool', [r.tokens[0], r.tokens[1], spacing]),
    }));
  });

  const resolved = await aggregate(provider, resolveCalls);

  /** @type {Array<{id: string, address: string}>} */
  const located = [];
  candidates.forEach((r, i) => {
    for (let f = 0; f < factories.length; f += 1) {
      const res = resolved[i * factories.length + f];
      if (!res?.success) continue;
      try {
        const [addr] = factoryIface.decodeFunctionResult('getPool', res.returnData);
        if (addr && addr !== ZERO) { located.push({ id: r.id, address: String(addr).toLowerCase() }); return; }
      } catch (_) { /* not this factory */ }
    }
  });
  if (located.length === 0) return out;

  const iface = new ethers.utils.Interface(POOL_ABI);
  // Aerodrome moves staked liquidity out of liquidity(), so both are asked and
  // summed. A pool without the staked half simply fails that call.
  const liquidityCalls = located.flatMap(({ address }) => ([
    { target: address, allowFailure: true, callData: iface.encodeFunctionData('liquidity') },
    { target: address, allowFailure: true, callData: iface.encodeFunctionData('stakedLiquidity') },
  ]));

  const results = await aggregate(provider, liquidityCalls);

  located.forEach(({ id }, i) => {
    const unstaked = results[i * 2];
    const staked = results[i * 2 + 1];
    // Only a pool whose liquidity() answered can be judged. Silence is not
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
    out.set(id, total === 0n);
  });

  return out;
}
