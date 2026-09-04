/**
 * core/stocks.js  (NEW · Part 2)
 * Coinbase tokenized stocks (B20) holdings + prices for a wallet on Base.
 * Docs: docs.base.org/base-chain/asset-issuance/tokenized-stocks-on-base
 */
import { ethers } from 'ethers';
import { TOKENIZED_STOCKS, B20_ABI, CHAINLINK_FEED_ABI, CHAINLINK_STALE_SECONDS, B20_REGISTRY } from './constants.base.js';
import { getProvider, withTimeout } from './providers.js';
import { fetchTokenPrice } from './prices.js';

/**
 * @returns {Promise<import('../types/portfolio').TokenHolding[]>}
 */
export async function getStockHoldings(wallet) {
  // TODO(Part 2): Multicall3 balanceOf + scaledBalanceOf for all TOKENIZED_STOCKS; drop zero balances.
  //   multiplier = scaled / raw (or read the multiplier getter once VERIFIED in the B20 spec)
  //   price: getStockPrice(symbol) ; valueUsd = raw × chainlinkPrice (feed is total-return, multiplier-adjusted)
  //   NOTE: choose ONE valuation path and document it in UI (PNL_SPEC "Tokenized stocks").
  throw new Error('not implemented');
}

/** Chainlink price with staleness check, DeFiLlama fallback (24/7 DEX price). */
export async function getStockPrice(symbol) {
  const meta = TOKENIZED_STOCKS[symbol];
  if (!meta) return null;
  const provider = await getProvider('base');
  try {
    const feed = new ethers.Contract(meta.feed, CHAINLINK_FEED_ABI, provider);
    const [round, dec] = await withTimeout(Promise.all([feed.latestRoundData(), feed.decimals()]), 6000);
    const updatedAt = Number(round.updatedAt);
    const stale = Date.now() / 1000 - updatedAt > CHAINLINK_STALE_SECONDS;
    const usd = Number(round.answer) / 10 ** Number(dec);
    if (!stale && usd > 0) return { usd, source: 'chainlink', updatedAt, stale: false };
    const fallback = await fetchTokenPrice('base', meta.address);
    return fallback ? { usd: fallback, source: 'llama', updatedAt, stale: true } : { usd, source: 'chainlink', updatedAt, stale };
  } catch (_) {
    const fallback = await fetchTokenPrice('base', meta.address);
    return fallback ? { usd: fallback, source: 'llama' } : null;
  }
}

/** Discover new B20 tokens (B20Created on the registry/factory). Optional for MVP. */
export async function discoverStocks() {
  // TODO(post-MVP): getLogs on B20_REGISTRY for B20Created; VERIFY event signature in the B20 spec.
  return Object.entries(TOKENIZED_STOCKS).map(([symbol, m]) => ({ symbol, ...m }));
}
