/**
 * defier-core/ticks.js
 *
 * Tick data fetching for liquidity distribution histograms.
 *
 * Strategy:
 *   1. Try The Graph subgraph (fast, aggregated, always preferred)
 *   2. Fall back to on-chain tickBitmap + Multicall3 (slower but no subgraph dependency)
 *
 * Used by: ILSimulator chart (tick density), Pool Detail page histogram.
 */

import { ethers } from 'ethers';
import { SUBGRAPH_URLS, FACTORY_CONFIG } from './constants.js';
import { getProvider, withTimeout } from './providers.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const SUBGRAPH_TICK_LIMIT  = 1000;   // GraphQL page size
const HISTOGRAM_BUCKET_COUNT = 60;   // bars in the chart

// Multicall3 — deployed at same address on all major EVM chains
const MULTICALL3_ADDR = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MULTICALL3_ABI  = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])',
];

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fetch all initialized tick data for a pool.
 * Returns raw tick array — use buildHistogramBuckets() to convert to chart data.
 *
 * @param {string} poolAddress  - Lowercase pool address (0x...)
 * @param {string} chain        - 'base' | 'ethereum' | etc.
 * @param {string} [project]    - DeFiLlama project key (used to select subgraph)
 * @param {number} [tickSpacing] - Pool tick spacing (optional, for RPC fallback)
 * @param {number} [currentTick] - Current pool tick (optional, for RPC fallback — avoids
 *   a redundant slot0() call, which also needs an Aerodrome-vs-Uniswap ABI variant since
 *   Aerodrome's slot0() has one fewer field; the caller already has this value)
 * @returns {Promise<Array<{ tickIdx: number, liquidityGross: string, liquidityNet: string }>>}
 */
export async function fetchPoolTicks(poolAddress, chain, project, tickSpacing, currentTick) {
  const subgraphUrl = getSubgraphUrl(chain, project);

  if (subgraphUrl) {
    try {
      const ticks = await withTimeout(
        fetchPoolTicksViaSubgraph(subgraphUrl, poolAddress),
        12000
      );
      if (ticks && ticks.length > 0) return ticks;
    } catch (_) {
      // Subgraph unavailable or empty — fall through to RPC
    }
  }

  // RPC fallback (requires tickSpacing + currentTick).
  // 30s budget — this scans up to 201 tickBitmap words then batch-reads every
  // initialized tick via Multicall3, which is slow on the free public RPC
  // fallbacks this project runs on today (no paid Alchemy plan yet).
  if (tickSpacing && currentTick != null) {
    try {
      return await withTimeout(
        fetchPoolTicksViaRPC(poolAddress, chain, tickSpacing, currentTick),
        30000
      );
    } catch (_) {
      return [];
    }
  }

  return [];
}

/**
 * Convert raw tick array into histogram buckets for charting.
 *
 * Each bucket covers a price range and holds cumulative liquidity.
 * The current price bucket is marked with isActive = true.
 *
 * @param {Array}  ticks           - raw ticks from fetchPoolTicks
 * @param {number} currentTick     - current pool tick (from slot0)
 * @param {number} tickSpacing     - pool tick spacing
 * @param {number} [buckets]       - number of histogram bars (default 60)
 * @param {number} [windowTicks]   - total tick range to show (default ±200 × tickSpacing)
 * @returns {Array<{
 *   tickLower: number, tickUpper: number,
 *   price: number,        ← approximate price at bucket center (token1/token0)
 *   liquidity: string,    ← liquidityGross as string for safe BigInt handling
 *   liquidityHuman: number,
 *   isActive: boolean
 * }>}
 */
export function buildHistogramBuckets(
  ticks,
  currentTick,
  tickSpacing,
  buckets    = HISTOGRAM_BUCKET_COUNT,
  windowTicks = 200
) {
  if (!ticks || ticks.length === 0) return [];

  const halfWindow = Math.floor(windowTicks / 2) * tickSpacing;
  const minTick    = currentTick - halfWindow;
  const maxTick    = currentTick + halfWindow;
  const step       = (maxTick - minTick) / buckets;

  // Build tick → liquidityGross lookup (bigint)
  const tickMap = new Map();
  for (const t of ticks) {
    tickMap.set(Number(t.tickIdx), BigInt(t.liquidityGross || '0'));
  }

  // Max liquidity for normalisation
  let maxLiq = 1n;
  for (const v of tickMap.values()) {
    if (v > maxLiq) maxLiq = v;
  }

  const result = [];
  for (let i = 0; i < buckets; i++) {
    const tickLower = Math.round(minTick + i * step);
    const tickUpper = Math.round(minTick + (i + 1) * step);

    // Sum liquidityGross for all initialized ticks within this bucket
    let bucketLiq = 0n;
    for (const [tick, liq] of tickMap.entries()) {
      if (tick >= tickLower && tick < tickUpper) {
        bucketLiq += liq;
      }
    }

    // Price at bucket center: 1.0001^tick (gives token1/token0 at 18/18 — adjust for decimals in UI)
    const centerTick = (tickLower + tickUpper) / 2;
    const price      = Math.pow(1.0001, centerTick);

    result.push({
      tickLower,
      tickUpper,
      price,
      liquidity: bucketLiq.toString(),
      liquidityHuman: maxLiq > 0n ? Number((bucketLiq * 10000n) / maxLiq) / 100 : 0,
      isActive: currentTick >= tickLower && currentTick < tickUpper,
    });
  }

  return result;
}

// ─── Subgraph fetching ─────────────────────────────────────────────────────────

/**
 * Fetch ticks from The Graph subgraph (paginated).
 * @returns {Promise<Array>}
 */
export async function fetchPoolTicksViaSubgraph(subgraphUrl, poolAddress) {
  const allTicks = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const query = `{
      ticks(
        where: { poolAddress: "${poolAddress.toLowerCase()}" }
        first: ${SUBGRAPH_TICK_LIMIT}
        skip: ${skip}
        orderBy: tickIdx
        orderDirection: asc
      ) {
        tickIdx
        liquidityGross
        liquidityNet
      }
    }`;

    const resp = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!resp.ok) throw new Error(`Subgraph HTTP ${resp.status}`);
    const data = await resp.json();

    if (data.errors) throw new Error(data.errors[0]?.message || 'GraphQL error');

    const page = data.data?.ticks || [];
    allTicks.push(...page);

    hasMore = page.length === SUBGRAPH_TICK_LIMIT;
    skip   += SUBGRAPH_TICK_LIMIT;

    // Safety: cap at 10,000 ticks
    if (allTicks.length >= 10000) break;
  }

  return allTicks;
}

// ─── RPC fallback (tickBitmap + Multicall3) ────────────────────────────────────

/**
 * Fetch initialized ticks directly from the pool contract.
 * Uses tickBitmap to find initialized words, then Multicall3 to batch-read tick data.
 *
 * NOTE: This is slower and more RPC-intensive than subgraph — only used as fallback.
 *
 * @param {string} poolAddress
 * @param {string} chain
 * @param {number} tickSpacing
 * @param {number} currentTick - Current pool tick, supplied by the caller.
 *   Deliberately NOT re-fetched via slot0() here: Aerodrome/Velodrome's slot0()
 *   has one fewer return value than Uniswap V3's (no feeProtocol field), and this
 *   fallback has no protocol-aware ABI — decoding with the wrong shape throws a
 *   CALL_EXCEPTION and silently kills the whole RPC fallback for every Aerodrome
 *   pool. Accepting currentTick as a param sidesteps the whole ABI-mismatch class
 *   of bug (the caller already resolved it via core/apr.js#fetchPoolOnchainData,
 *   which IS protocol-aware).
 * @returns {Promise<Array>}
 */
export async function fetchPoolTicksViaRPC(poolAddress, chain, tickSpacing, currentTick) {
  const provider = await getProvider(chain);

  const POOL_TICK_ABI = [
    'function tickBitmap(int16 wordPos) view returns (uint256)',
    'function ticks(int24 tick) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)',
  ];

  const pool        = new ethers.Contract(poolAddress, POOL_TICK_ABI, provider);
  const multicall   = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, provider);

  // Scan ±100 words around the current tick word
  // Each word covers 256 tick spacings, so ±100 words = ±25,600 tick spacings
  const compressedCurrent = Math.floor(currentTick / tickSpacing);
  const wordPosCenter     = compressedCurrent >> 8; // integer division by 256
  const WORD_RANGE        = 100;

  const wordPositions = [];
  for (let w = wordPosCenter - WORD_RANGE; w <= wordPosCenter + WORD_RANGE; w++) {
    wordPositions.push(w);
  }

  // Batch-read tickBitmap words
  const bitmapInterface = new ethers.utils.Interface([
    'function tickBitmap(int16 wordPos) view returns (uint256)',
  ]);
  const bitmapCalls = wordPositions.map((wordPos) => ({
    target: poolAddress,
    allowFailure: true,
    callData: bitmapInterface.encodeFunctionData('tickBitmap', [wordPos]),
  }));

  const bitmapResults = await withTimeout(
    multicall.aggregate3(bitmapCalls),
    15000
  );

  // Decode and collect all initialized tick indices
  const initializedTicks = [];
  for (let i = 0; i < bitmapResults.length; i++) {
    const { success, returnData } = bitmapResults[i];
    if (!success || returnData === '0x') continue;

    const [bitmap] = bitmapInterface.decodeFunctionResult('tickBitmap', returnData);
    const word      = wordPositions[i];

    // Find set bits in the bitmap word
    let bits = bitmap.toBigInt();
    let bit  = 0;
    while (bits > 0n) {
      if (bits & 1n) {
        const compressedTick = (word << 8) + bit;
        const tick = compressedTick * tickSpacing;
        initializedTicks.push(tick);
      }
      bits >>= 1n;
      bit++;
    }
  }

  if (initializedTicks.length === 0) return [];

  // Batch-read tick data for all initialized ticks via Multicall3
  const tickInterface = new ethers.utils.Interface([
    'function ticks(int24 tick) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)',
  ]);

  // Process in batches of 200 to avoid hitting gas limits
  const BATCH_SIZE  = 200;
  const tickResults = [];

  for (let start = 0; start < initializedTicks.length; start += BATCH_SIZE) {
    const batch = initializedTicks.slice(start, start + BATCH_SIZE);
    const calls = batch.map((tick) => ({
      target: poolAddress,
      allowFailure: true,
      callData: tickInterface.encodeFunctionData('ticks', [tick]),
    }));

    const results = await withTimeout(multicall.aggregate3(calls), 12000);
    tickResults.push(...results.map((r, i) => ({ tick: batch[i], result: r })));
  }

  // Decode tick data
  const parsed = [];
  for (const { tick, result } of tickResults) {
    const { success, returnData } = result;
    if (!success || returnData === '0x') continue;
    try {
      const [liquidityGross, liquidityNet] = tickInterface.decodeFunctionResult('ticks', returnData);
      parsed.push({
        tickIdx: tick,
        liquidityGross: liquidityGross.toString(),
        liquidityNet: liquidityNet.toString(),
      });
    } catch (_) {
      // Skip malformed ticks
    }
  }

  return parsed;
}

// ─── Subgraph URL resolution ───────────────────────────────────────────────────

/**
 * Get The Graph subgraph URL for a chain/project combination.
 * Returns null if no subgraph is configured (triggers RPC fallback).
 */
export function getSubgraphUrl(chain, project) {
  const proj = (project || '').toLowerCase();

  // Aerodrome/Velodrome have their own subgraphs
  if (proj.includes('aerodrome') || proj.includes('velodrome')) {
    return SUBGRAPH_URLS?.['aerodrome-v3']?.[chain] ?? null;
  }
  if (proj.includes('pancake')) {
    return SUBGRAPH_URLS?.['pancakeswap-v3']?.[chain] ?? null;
  }
  // Default: Uniswap V3
  return SUBGRAPH_URLS?.['uniswap-v3']?.[chain] ?? null;
}
