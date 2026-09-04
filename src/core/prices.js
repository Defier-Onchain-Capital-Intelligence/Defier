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

// ─── Historical prices ─────────────────────────────────────────────────────────
// PNL_SPEC.md: every deposit, withdrawal, fee claim and reward is valued at the
// price on the day it happened, not at today's price. Without this the whole
// P&L is a guess.

const _histCache = new Map();   // `${chain}:${addr}:${dayBucket}` -> number|null

/**
 * USD price of a token at a point in time.
 *
 * DeFiLlama buckets historical prices, so we cache per UTC day: asking for two
 * events four hours apart on the same day is one request, not two.
 *
 * @param {string} chain
 * @param {string} address
 * @param {number} timestamp unix seconds
 * @returns {Promise<number|null>} null when the price cannot be resolved. Callers
 *   must degrade to confidence 'partial' and say so, never substitute today's price.
 */
export async function fetchHistoricalPrice(chain, address, timestamp) {
  if (!address || !timestamp) return null;
  const normalised = address.toLowerCase();
  const day = Math.floor(timestamp / 86400);
  const cacheKey = `${chain}:${normalised}:${day}`;
  if (_histCache.has(cacheKey)) return _histCache.get(cacheKey);

  const llamaChain = LLAMA_CHAIN[chain] || chain;
  const key = `${llamaChain}:${normalised}`;

  try {
    const resp = await withTimeout(
      fetch(`https://coins.llama.fi/prices/historical/${Math.floor(timestamp)}/${key}`),
      8000
    );
    const data = await resp.json();
    const price = data.coins?.[key]?.price ?? null;
    _histCache.set(cacheKey, price);
    return price;
  } catch (_) {
    return null;
  }
}

/**
 * Same, for several tokens at one timestamp. One request instead of N.
 * @returns {Promise<Record<string, number|null>>} keyed by lowercase address
 */
export async function fetchHistoricalPricesBatch(chain, addresses, timestamp) {
  const unique = [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))];
  const out = {};
  if (unique.length === 0 || !timestamp) return out;

  const llamaChain = LLAMA_CHAIN[chain] || chain;
  const day = Math.floor(timestamp / 86400);
  const missing = [];

  for (const addr of unique) {
    const cacheKey = `${chain}:${addr}:${day}`;
    if (_histCache.has(cacheKey)) out[addr] = _histCache.get(cacheKey);
    else missing.push(addr);
  }
  if (missing.length === 0) return out;

  try {
    const keys = missing.map((a) => `${llamaChain}:${a}`).join(',');
    const resp = await withTimeout(
      fetch(`https://coins.llama.fi/prices/historical/${Math.floor(timestamp)}/${keys}`),
      10000
    );
    const data = await resp.json();
    for (const addr of missing) {
      const price = data.coins?.[`${llamaChain}:${addr}`]?.price ?? null;
      out[addr] = price;
      _histCache.set(`${chain}:${addr}:${day}`, price);
    }
  } catch (_) {
    for (const addr of missing) out[addr] = null;
  }
  return out;
}

export function clearHistoricalPriceCache() {
  _histCache.clear();
}
