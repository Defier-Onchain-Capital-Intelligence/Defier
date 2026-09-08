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

// ─── Price series ──────────────────────────────────────────────────────────────

const _seriesCache = new Map();   // `${chain}:${addr}:${fromDay}` -> Map<day, price>
const SERIES_TTL_MS = 30 * 60 * 1000;

/**
 * Daily USD price series for one token, from `fromTs` to now.
 *
 * A value curve needs one price per token per day, and asking for them one at a
 * time is a request per day per token: a year of two tokens is 730 requests and
 * a rate limit. DeFiLlama returns the whole span in one call, so that is what
 * this uses.
 *
 * The result is keyed by UTC day number, which is the same bucket
 * fetchHistoricalPrice uses, so the two agree about what "that day's price" is.
 *
 * @param {string} chain
 * @param {string} address
 * @param {number} fromTs unix seconds
 * @returns {Promise<Map<number, number>|null>} null when the series cannot be
 *   read. Callers must say the curve is unavailable rather than draw a flat line.
 */
export async function fetchPriceSeries(chain, address, fromTs) {
  if (!address || !fromTs) return null;
  const normalised = String(address).toLowerCase();
  const fromDay = Math.floor(fromTs / 86400);
  const cacheKey = `${chain}:${normalised}:${fromDay}`;

  const hit = _seriesCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < SERIES_TTL_MS) return hit.series;

  const llamaChain = LLAMA_CHAIN[chain] || chain;
  const key = `${llamaChain}:${normalised}`;
  const spanDays = Math.max(1, Math.ceil((Date.now() / 1000 - fromTs) / 86400) + 1);

  try {
    const url = `https://coins.llama.fi/chart/${key}`
      + `?start=${Math.floor(fromTs)}&span=${Math.min(spanDays, 1000)}&period=1d&searchWidth=12h`;
    const resp = await withTimeout(fetch(url), 12000);
    const data = await resp.json();
    const points = data?.coins?.[key]?.prices;
    if (!Array.isArray(points) || points.length === 0) return null;

    const series = new Map();
    for (const point of points) {
      const ts = Number(point?.timestamp);
      const price = Number(point?.price);
      if (!Number.isFinite(ts) || !(price > 0)) continue;
      series.set(Math.floor(ts / 86400), price);
    }
    if (series.size === 0) return null;

    _seriesCache.set(cacheKey, { series, ts: Date.now() });
    return series;
  } catch (_) {
    return null;
  }
}

export function clearPriceSeriesCache() {
  _seriesCache.clear();
}

/**
 * Current prices with the provider's own confidence attached.
 *
 * The plain batch above answers "what is this worth" and is right for a token we
 * already know is real, because it arrived from a pool we read on chain. Swap
 * history is the opposite situation: a wallet on Base receives dozens of
 * airdropped tokens whose only purpose is to look valuable, and a scam token with
 * a fabricated price would produce the single most spectacular figure in the
 * whole report. So here the confidence travels with the price and the caller is
 * expected to throw away anything it does not trust.
 *
 * Confidence is DeFiLlama's, on a 0 to 1 scale, and reflects how much agreement
 * there is between the sources it saw. Absent means unknown, which is treated as
 * untrustworthy rather than as fine.
 *
 * @param {Array<{chain: string, address: string}>} tokens
 * @returns {Promise<Map<string, {price: number, confidence: number|null, symbol: string|null, decimals: number|null}>>}
 */
export async function fetchPricesWithConfidence(tokens) {
  const out = new Map();
  if (!tokens?.length) return out;

  const unique = new Map();
  for (const { chain, address } of tokens) {
    const addr = String(address || '').toLowerCase();
    if (!addr) continue;
    unique.set(`${chain}:${addr}`, { chain, address: addr });
  }

  const entries = [...unique.values()];
  for (let i = 0; i < entries.length; i += 60) {
    const slice = entries.slice(i, i + 60);
    const keys = slice.map(({ chain, address }) => `${LLAMA_CHAIN[chain] || chain}:${address}`);
    try {
      const resp = await withTimeout(fetch(`https://coins.llama.fi/prices/current/${keys.join(',')}`), 10000);
      const data = await resp.json();
      for (const { chain, address } of slice) {
        const coin = data.coins?.[`${LLAMA_CHAIN[chain] || chain}:${address}`];
        const price = coin?.price;
        if (typeof price !== 'number' || !(price > 0)) continue;
        out.set(`${chain}:${address}`, {
          price,
          confidence: typeof coin.confidence === 'number' ? coin.confidence : null,
          symbol: coin.symbol || null,
          decimals: typeof coin.decimals === 'number' ? coin.decimals : null,
        });
      }
    } catch (_) {
      // A slice that fails leaves its tokens unpriced, which the caller reports
      // as unpriced rather than as worthless.
    }
  }
  return out;
}
