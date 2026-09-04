/**
 * defier-core/prices.js
 *
 * Token price fetching via DeFiLlama Coins API (primary) + CoinGecko (fallback).
 * All prices returned in USD.
 */

import { LLAMA_CHAIN, TOKEN_CACHE } from './constants.js';
import { withTimeout } from './providers.js';

/** In-memory price cache to avoid redundant API calls within a session */
const _priceCache = new Map();
const CACHE_TTL_MS = 60_000; // 1 minute

function cached(key) {
  const entry = _priceCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _priceCache.delete(key);
    return null;
  }
  return entry.price;
}

function setCached(key, price) {
  if (price != null && price > 0) {
    _priceCache.set(key, { price, ts: Date.now() });
  }
}

/**
 * Fetch USD price of a single token.
 * @param {string} chain   - 'base' | 'ethereum' | etc. (lowercase)
 * @param {string} address - token contract address
 * @returns {Promise<number|null>}
 */
export async function fetchTokenPrice(chain, address) {
  const normalised = address.toLowerCase();
  const cacheKey = `${chain}:${normalised}`;
  const hit = cached(cacheKey);
  if (hit !== null) return hit;

  const llamaChain = LLAMA_CHAIN[chain] || chain;
  const key = `${llamaChain}:${normalised}`;

  try {
    const resp = await withTimeout(
      fetch(`https://coins.llama.fi/prices/current/${key}`),
      5000
    );
    const data = await resp.json();
    const price = data.coins?.[key]?.price ?? null;
    setCached(cacheKey, price);
    return price;
  } catch (_) {
    return null;
  }
}

/**
 * Fetch prices for multiple tokens in a single batch call.
 * @param {Array<{ chain: string, address: string }>} tokens
 * @returns {Promise<Map<string, number>>}  key = "chain:address"
 */
export async function fetchTokenPricesBatch(tokens) {
  const result = new Map();
  if (!tokens.length) return result;

  const uncached = [];
  for (const { chain, address } of tokens) {
    const key = `${chain}:${address.toLowerCase()}`;
    const hit = cached(key);
    if (hit !== null) {
      result.set(key, hit);
    } else {
      uncached.push({ chain, address: address.toLowerCase(), key });
    }
  }

  if (uncached.length === 0) return result;

  // DeFiLlama batch endpoint: /prices/current/chain:addr,chain:addr,...
  const llamaKeys = uncached.map(({ chain, address }) => {
    const llamaChain = LLAMA_CHAIN[chain] || chain;
    return `${llamaChain}:${address}`;
  });

  try {
    const resp = await withTimeout(
      fetch(`https://coins.llama.fi/prices/current/${llamaKeys.join(',')}`),
      8000
    );
    const data = await resp.json();
    for (const item of uncached) {
      const llamaChain = LLAMA_CHAIN[item.chain] || item.chain;
      const llamaKey   = `${llamaChain}:${item.address}`;
      const price      = data.coins?.[llamaKey]?.price ?? null;
      setCached(item.key, price);
      if (price !== null) result.set(item.key, price);
    }
  } catch (_) {
    // Batch failed — return whatever we have from cache
  }

  return result;
}

/**
 * Get a token price, with fallback through TOKEN_CACHE known addresses.
 * Useful when you have a symbol but not a guaranteed price feed.
 */
export async function getTokenPriceWithFallback(chain, address, symbolHint) {
  // Try on-chain address first
  let price = await fetchTokenPrice(chain, address);
  if (price) return price;

  // If it's a stablecoin by symbol, return $1
  const sym = (symbolHint || '').toUpperCase();
  if (['USDC', 'USDT', 'DAI', 'FRAX', 'USDS', 'USDE', 'FDUSD', 'USDBC', 'USDB'].includes(sym)) {
    return 1.0;
  }

  return null;
}

/** Clear price cache (useful for testing or forced refresh) */
export function clearPriceCache() {
  _priceCache.clear();
}
