/**
 * core/tokens.js · Plain ERC-20 balances of the wallet.
 *
 * Needed for exposure to mean anything: a wallet that is half stablecoins is not
 * the same wallet as one that is fully deployed, and looking only at liquidity
 * positions cannot tell them apart.
 */
import { ethers } from 'ethers';
import { BASE_TOKENS } from './constants.base.js';
import { MULTICALL3_ADDR, MULTICALL3_ABI, ERC20_ABI } from './constants.js';
import { getProvider, withTimeout } from './providers.js';
import { fetchTokenPricesBatch, fetchTokenPrice } from './prices.js';
import { classify } from './exposure.js';

const CHAIN = 'base';

/**
 * @param {string} wallet
 * @param {string[]} [extraTokens] addresses seen elsewhere, for example inside the wallet's own positions
 * @returns {Promise<import('../types/portfolio').TokenHolding[]>}
 */
export async function getTokenHoldings(wallet, extraTokens = []) {
  const provider = await getProvider(CHAIN);
  const addresses = [...new Set([
    ...Object.values(BASE_TOKENS),
    ...extraTokens.filter(Boolean).map((a) => a.toLowerCase()),
  ])];

  const iface = new ethers.utils.Interface(ERC20_ABI.concat([
    'function balanceOf(address) view returns (uint256)',
  ]));
  const mc = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, provider);

  let results;
  try {
    results = await withTimeout(mc.callStatic.aggregate3(addresses.map((address) => ({
      target: address,
      allowFailure: true,
      callData: iface.encodeFunctionData('balanceOf', [wallet]),
    }))), 20000);
  } catch (_) {
    return [];
  }

  const withBalance = [];
  results.forEach((r, i) => {
    if (!r.success) return;
    try {
      const [raw] = iface.decodeFunctionResult('balanceOf', r.returnData);
      if (!raw.isZero()) withBalance.push({ address: addresses[i], raw });
    } catch (_) { /* not a token */ }
  });

  if (withBalance.length === 0) return [];

  const [metadata, prices] = await Promise.all([
    Promise.all(withBalance.map(async ({ address }) => {
      const token = new ethers.Contract(address, ERC20_ABI, provider);
      const [symbol, decimals] = await Promise.all([
        withTimeout(token.symbol(), 6000).catch(() => '???'),
        withTimeout(token.decimals(), 6000).then(Number).catch(() => 18),
      ]);
      return { address, symbol, decimals };
    })),
    fetchTokenPricesBatch(withBalance.map(({ address }) => ({ chain: CHAIN, address })))
      .catch(() => new Map()),
  ]);

  return Promise.all(withBalance.map(async ({ address, raw }, i) => {
    const { symbol, decimals } = metadata[i];
    const balance = parseFloat(ethers.utils.formatUnits(raw, decimals));
    const usd = prices.get(`${CHAIN}:${address}`) ?? await fetchTokenPrice(CHAIN, address);
    return {
      token: { address, symbol, decimals, assetClass: classify(address) },
      balance,
      price: usd ? { usd, source: 'llama' } : null,
      valueUsd: usd ? balance * usd : null,
    };
  }));
}
