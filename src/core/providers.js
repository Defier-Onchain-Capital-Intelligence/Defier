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
 * What the last probe found, per chain. Read by /api/diag.
 *
 * A provider that was healthy at cold start and died an hour later used to be
 * indistinguishable, from the outside, from a wallet that owns nothing: every
 * call failed, every failure was swallowed, and the report said zero. This is
 * the record that makes the difference visible.
 */
const _providerHealth = {};

/** @returns {{at: number, healthy: string[], failed: Array<{url: string, error: string}>}|null} */
export function getProviderHealth(chain) {
  return _providerHealth[chain] || null;
}

/**
 * Forget the cached provider so the next call re-probes.
 *
 * The cache used to live for the whole life of a serverless instance. When the
 * probe happened to keep only one endpoint and that endpoint later started
 * refusing requests, every subsequent call on that instance failed instantly
 * and there was no way back short of a redeploy. Callers invalidate on a
 * failure that looks like the transport rather than the contract.
 */
export function invalidateProvider(chain) {
  delete _providerCache[chain];
  delete _logsProviderCache[chain];
}

/** Endpoint identity without the API key. Safe to put in a diagnostic. */
export function redactRpcUrl(url) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.includes('/v2/') ? '/v2/***' : ''}`;
  } catch (_) {
    return 'unknown';
  }
}

/**
 * Get a FallbackProvider for a chain.
 * Probes all RPCs in parallel and keeps all healthy ones.
 * First call takes ~3-6s; subsequent calls return instantly from cache.
 */
/**
 * How long a probe result is trusted before the endpoints are re-checked.
 *
 * The cache used to have no expiry at all. A serverless instance that probed
 * once at cold start kept that verdict for its whole life, so an endpoint that
 * died an hour into the instance stayed in the set and an endpoint that came
 * back never returned to it. Five minutes is short enough that an outage heals
 * on its own and long enough that the probe is not part of the cost of a
 * request.
 */
const PROVIDER_TTL_MS = 5 * 60 * 1000;

/**
 * How long one endpoint gets to answer a probe.
 *
 * Measured against the four public Base RPCs: eth_blockNumber came back in 337
 * to 584 ms. Three seconds is five times the slowest honest answer, and the
 * point of a probe is to find out quickly, not to wait politely.
 */
const PROBE_TIMEOUT_MS = 3000;

/**
 * How long the whole probe may hold up a request.
 *
 * `Promise.allSettled` waits for every endpoint, including the dead one, so a
 * single unreachable RPC cost the full timeout on every probe. That was
 * tolerable when the verdict was cached forever and it stopped being tolerable
 * the moment the cache got a five minute expiry: the penalty went from once
 * per instance to once every five minutes, on a request somebody was waiting
 * for. Measured in production with 1rpc.io down.
 *
 * So the probe stops waiting as soon as it has something usable. The
 * stragglers are not abandoned — they finish in the background and correct the
 * health record, which is where the answer to "which endpoint is down" lives.
 */
const PROBE_GRACE_MS = 1500;
const PROBE_MIN_HEALTHY = 2;

/**
 * Probe a list of endpoints without waiting for the slowest to give up.
 *
 * Resolves early once PROBE_MIN_HEALTHY have answered and the grace has
 * passed, or when everything has settled, whichever comes first. `onFinal` is
 * called later with the complete result, always.
 *
 * @returns {Promise<Array<{url: string, provider: object|null, error: string|null}>>}
 */
async function probeUrls(urls, onFinal) {
  const done = [];
  const probes = urls.map(async (url) => {
    const provider = new ethers.providers.JsonRpcProvider({ url, timeout: PROBE_TIMEOUT_MS + 2000 });
    let result;
    try {
      const block = await withTimeout(provider.getBlockNumber(), PROBE_TIMEOUT_MS);
      if (!block || typeof block !== 'number' || block < 1) throw new Error(`invalid block ${block}`);
      result = { url, provider, error: null };
    } catch (err) {
      result = { url, provider: null, error: String(err?.message || err).slice(0, 120) };
    }
    done.push(result);
    return result;
  });

  const everything = Promise.all(probes);
  // Never let the background completion reject on its own timetable.
  everything.then((final) => { if (onFinal) onFinal(final); }, () => {});

  const enough = new Promise((resolve) => {
    const started = Date.now();
    const preferred = urls[0];
    const tick = () => {
      const healthy = done.filter((r) => r.provider).length;
      // The list is in preference order and the first entry is there for a
      // reason — it is Alchemy, and it is the only endpoint that will serve a
      // wide eth_getLogs range. Resolving before it has answered would quietly
      // demote every log scan to 10,000-block chunks. So it gets to settle,
      // one way or the other, before an early finish is allowed.
      const preferredSettled = done.some((r) => r.url === preferred);
      if (preferredSettled && healthy >= 1 && Date.now() - started >= PROBE_GRACE_MS) {
        return resolve('enough');
      }
      if (healthy >= PROBE_MIN_HEALTHY && Date.now() - started >= PROBE_TIMEOUT_MS) {
        // The preferred endpoint is the slow one. Do not hold a request for it.
        return resolve('enough-without-preferred');
      }
      if (done.length === urls.length) return resolve('all');
      setTimeout(tick, 50);
      return undefined;
    };
    tick();
  });

  await Promise.race([everything, enough]);

  // Back into the ORDER THE LIST WAS WRITTEN IN, which is preference order and
  // not the order they happened to answer.
  //
  // `done` fills in completion order, and returning it that way was a real bug
  // with a measured cost: getProvider builds its FallbackProvider with
  // `priority: i + 1`, so a public node that merely PROBED fast outranked
  // Alchemy for every eth_call afterwards, and getLogsProvider's preference
  // walk found whichever endpoint happened to be first in the array. The build
  // went from 5.6 seconds to 53.8, with the Sickle's log scan alone going from
  // 1 second to 25 — public nodes cap eth_getLogs at 1,000 to 10,000 blocks
  // and Alchemy does not, so demoting it turns one scan into hundreds.
  //
  // A probe measures whether an endpoint answers. It does not get a vote on
  // which one we would rather use.
  const byPreference = (a, b) => urls.indexOf(a.url) - urls.indexOf(b.url);
  const answered = done.length ? [...done] : await everything;
  return answered.sort(byPreference);
}

export async function getProvider(chain) {
  const fresh = _providerHealth[chain] && Date.now() - _providerHealth[chain].at < PROVIDER_TTL_MS;
  if (_providerCache[chain] && fresh) return _providerCache[chain];
  if (_providerCache[chain] && !fresh) invalidateProvider(chain);

  const rpcs = CHAIN_RPCS_LIST[chain];
  if (!rpcs || rpcs.length === 0) {
    throw new Error(`No RPC configured for chain: ${chain}`);
  }

  // The health record is written twice on purpose: once from whatever answered
  // in time, and again when the stragglers finish. The second write is what
  // names a dead endpoint, and it costs nobody a millisecond of waiting.
  const record = (results) => {
    _providerHealth[chain] = {
      at: Date.now(),
      healthy: results.filter((r) => r.provider).map((r) => redactRpcUrl(r.url)),
      failed: results.filter((r) => !r.provider).map((r) => ({ url: redactRpcUrl(r.url), error: r.error })),
      partial: results.length < rpcs.length,
    };
  };

  const settled = await probeUrls(rpcs, (final) => {
    // Only correct the record if it still belongs to this probe: a later probe
    // must not be overwritten by an earlier one's leftovers.
    if (_providerHealth[chain]?.partial) record(final);
  });
  record(settled);

  const working = settled.filter((r) => r.provider).map((r) => r.provider);

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

  // Same early resolve as getProvider: this runs on every build, and waiting
  // for a dead endpoint to time out is time somebody spends looking at a
  // spinner. Preference order is still honoured among whatever answered.
  const results = await probeUrls(urls);

  for (const url of urls) {
    const match = results.find((r) => r.url === url && r.provider);
    if (match) {
      _logsProviderCache[chain] = match.provider;
      return match.provider;
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
    /** Optional. Filled in with { truncated, chunksSearched, blocksCovered } so
     *  the caller can tell "nothing there" apart from "we stopped looking". */
    report = null,
  } = {}
) {
  const provider = await getLogsProvider(chain);
  if (!provider) {
    if (report) { report.truncated = true; report.reason = 'no logs provider'; }
    return collectAll ? [] : null;
  }

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

  let covered = 0;
  for (const { lo, hi } of ranges) {
    if (chunksSearched >= maxChunks) {
      // Out of budget before the range was exhausted. Whatever we return now is
      // a partial answer and the caller has to know that.
      if (report) { report.truncated = true; report.reason = 'chunk budget exhausted'; }
      break;
    }
    chunksSearched++;
    covered += (hi - lo + 1);

    try {
      const logs = await withTimeout(
        provider.getLogs({ ...filter, fromBlock: lo, toBlock: hi }),
        timeout
      );
      if (collectAll) {
        allResults.push(...logs);
        if (allResults.length >= maxResults) break;
      } else if (logs.length > 0) {
        if (report) { report.truncated = false; report.chunksSearched = chunksSearched; }
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

  if (report) {
    report.chunksSearched = chunksSearched;
    report.blocksCovered = covered;
    report.blocksRequested = Math.max(toBlock - fromBlock, 0);
    if (report.truncated === undefined) report.truncated = covered < (toBlock - fromBlock);
  }
  return collectAll ? allResults : null;
}

/** Clear provider caches (useful in tests or when switching networks) */
export function clearProviderCache() {
  for (const key of Object.keys(_providerCache)) delete _providerCache[key];
  for (const key of Object.keys(_logsProviderCache)) delete _logsProviderCache[key];
}
