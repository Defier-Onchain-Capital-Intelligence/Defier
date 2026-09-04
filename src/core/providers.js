/**
 * defier-core/providers.js
 *
 * RPC provider management with fallback cascade.
 * Builds a FallbackProvider from ALL healthy RPCs for a chain.
 * FallbackProvider automatically routes around 429s and timeouts.
 *
 * Uses ethers.js v5 (same as the HTML tool).
 */

import { ethers } from 'ethers';
import { CHAIN_RPCS_LIST, ALCHEMY_KEY, HAS_ALCHEMY } from './constants.js';

// ─── Utilities ─────────────────────────────────────────────────────────────────
export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run async tasks with max concurrency. Prevents firing 200+ RPC calls at once.
 * @param {any[]} items
 * @param {(item: any) => Promise<any>} fn
 * @param {number} concurrency
 * @param {number} delayMs  - optional delay between batches (rate-limit friendliness)
 */
export async function batchedRequests(items, fn, concurrency = 20, delayMs = 0) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
    if (delayMs > 0 && i + concurrency < items.length) await sleep(delayMs);
  }
  return results;
}

// ─── Provider cache ─────────────────────────────────────────────────────────────
const _providerCache = {};
const _logsProviderCache = {};

/**
 * Get a FallbackProvider for a chain.
 * Probes all RPCs in parallel and keeps all healthy ones.
 * First call takes ~3-6s; subsequent calls return instantly from cache.
 */
export async function getProvider(chain) {
  if (_providerCache[chain]) return _providerCache[chain];

  const rpcs = CHAIN_RPCS_LIST[chain];
  if (!rpcs || rpcs.length === 0) {
    throw new Error(`No RPC configured for chain: ${chain}`);
  }

  const settled = await Promise.allSettled(
    rpcs.map(async (url) => {
      const p = new ethers.providers.JsonRpcProvider({ url, timeout: 10000 });
      const block = await withTimeout(p.getBlockNumber(), 6000);
      if (!block || typeof block !== 'number' || block < 1) {
        throw new Error(`invalid block ${block}`);
      }
      return p;
    })
  );

  const working = settled
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);

  if (working.length === 0) {
    throw new Error(`No working RPC for chain: ${chain}`);
  }

  const provider =
    working.length === 1
      ? working[0]
      : new ethers.providers.FallbackProvider(
          working.map((p, i) => ({ provider: p, priority: i + 1, stallTimeout: 2000 })),
          1 // quorum: 1 response is enough
        );

  _providerCache[chain] = provider;
  return provider;
}

/**
 * Get a single JsonRpcProvider suitable for getLogs.
 * Alchemy free tier limits getLogs to 10 blocks; this uses Tenderly/public nodes instead.
 * A separate cached provider avoids polluting the FallbackProvider with getLogs-specific state.
 */
export async function getLogsProvider(chain) {
  if (_logsProviderCache[chain]) return _logsProviderCache[chain];

  const LOGS_URLS = {
    ethereum: [
      'https://gateway.tenderly.co/public/mainnet',
      'https://ethereum-rpc.publicnode.com',
      'https://rpc.ankr.com/eth',
      'https://1rpc.io/eth',
    ],
    base: [
      'https://gateway.tenderly.co/public/base',
      'https://base.drpc.org',
      'https://base-rpc.publicnode.com',
      'https://1rpc.io/base',
    ],
    arbitrum: [
      'https://gateway.tenderly.co/public/arbitrum',
      'https://arbitrum.drpc.org',
      'https://arbitrum-one-rpc.publicnode.com',
      'https://1rpc.io/arb',
    ],
    bsc: [
      'https://bsc-rpc.publicnode.com',
      'https://bsc.drpc.org',
      'https://rpc.ankr.com/bsc',
      'https://1rpc.io/bnb',
    ],
    optimism: [
      'https://gateway.tenderly.co/public/optimism',
      'https://optimism.drpc.org',
      'https://optimism-rpc.publicnode.com',
      'https://1rpc.io/op',
    ],
  };

  // Alchemy first when we have a key. The public nodes below cap eth_getLogs at a
  // few thousand blocks, which turns a scan across a position's lifetime into
  // hundreds of requests. This comment used to claim the opposite; it was wrong.
  const urls = [
    ...(HAS_ALCHEMY && chain === 'base' ? [`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`] : []),
    ...(LOGS_URLS[chain] || []),
  ];

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const p = new ethers.providers.JsonRpcProvider({ url, timeout: 12000 });
      const block = await withTimeout(p.getBlockNumber(), 5000);
      if (!block || block < 1) throw new Error('bad block');
      return { provider: p, url, block };
    })
  );

  for (const url of urls) {
    const match = results.find(
      (r) => r.status === 'fulfilled' && r.value.url === url
    );
    if (match) {
      _logsProviderCache[chain] = match.value.provider;
      return match.value.provider;
    }
  }

  // All dedicated getLogs URLs failed — fall back to FallbackProvider
  const fb = _providerCache[chain];
  if (!fb) return null;
  if (!fb.providerConfigs) {
    _logsProviderCache[chain] = fb;
    return fb;
  }
  // Prefer a non-Alchemy provider from the fallback set
  for (const pc of fb.providerConfigs) {
    const url = pc.provider?.connection?.url || '';
    if (!url.includes('alchemy.com')) {
      _logsProviderCache[chain] = pc.provider;
      return pc.provider;
    }
  }
  const fallback = fb.providerConfigs[0]?.provider || fb;
  _logsProviderCache[chain] = fallback;
  return fallback;
}

/**
 * Chunked getLogs — scans a block range in chunks, searching backward (newest first).
 * Returns first matching log, or all logs if collectAll=true.
 * Auto-tries smaller chunks on error (handles providers with block range limits).
 */
export async function chunkedGetLogs(
  chain,
  filter,
  {
    fromBlock,
    toBlock,
    chunkSize,
    backward = true,
    collectAll = false,
    maxResults = 50,
    timeout = 12000,
    maxChunks = 80,
  } = {}
) {
  const provider = await getLogsProvider(chain);
  if (!provider) return collectAll ? [] : null;

  if (!toBlock) toBlock = await provider.getBlockNumber();
  if (!fromBlock) fromBlock = toBlock - 5000;
  if (!chunkSize) chunkSize = Math.max(1000, Math.ceil((toBlock - fromBlock) / maxChunks));

  const allResults = collectAll ? [] : null;
  let chunksSearched = 0;

  const ranges = [];
  if (backward) {
    for (let hi = toBlock; hi > fromBlock; hi -= chunkSize) {
      const lo = Math.max(fromBlock, hi - chunkSize + 1);
      ranges.push({ lo, hi });
    }
  } else {
    for (let lo = fromBlock; lo < toBlock; lo += chunkSize) {
      const hi = Math.min(toBlock, lo + chunkSize - 1);
      ranges.push({ lo, hi });
    }
  }

  for (const { lo, hi } of ranges) {
    if (chunksSearched >= maxChunks) break;
    chunksSearched++;

    try {
      const logs = await withTimeout(
        provider.getLogs({ ...filter, fromBlock: lo, toBlock: hi }),
        timeout
      );
      if (collectAll) {
        allResults.push(...logs);
        if (allResults.length >= maxResults) break;
      } else if (logs.length > 0) {
        return backward ? logs[logs.length - 1] : logs[0];
      }
    } catch (e) {
      if (e.message?.includes('block range') || e.message?.includes('too many')) {
        // Halve chunk size and retry this range
        const mid = Math.floor((lo + hi) / 2);
        try {
          const logs1 = await withTimeout(
            provider.getLogs({ ...filter, fromBlock: mid + 1, toBlock: hi }),
            timeout
          );
          const logs2 = await withTimeout(
            provider.getLogs({ ...filter, fromBlock: lo, toBlock: mid }),
            timeout
          );
          const combined = backward ? [...logs1, ...logs2] : [...logs2, ...logs1];
          if (collectAll) {
            allResults.push(...combined);
          } else if (combined.length > 0) {
            return backward ? combined[combined.length - 1] : combined[0];
          }
        } catch (_) {
          // skip this range
        }
      }
    }
  }

  return collectAll ? allResults : null;
}

/** Clear provider caches (useful in tests or when switching networks) */
export function clearProviderCache() {
  for (const key of Object.keys(_providerCache)) delete _providerCache[key];
  for (const key of Object.keys(_logsProviderCache)) delete _logsProviderCache[key];
}
