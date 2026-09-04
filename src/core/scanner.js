/**
 * defier-core/scanner.js
 *
 * Multi-chain wallet position scanner.
 * Reads NFT positions from all supported chains/protocols without requiring wallet connection.
 * Returns enriched position objects with fees, IL, and current value.
 */

import { ethers } from 'ethers';
import {
  NFPM_ADDRS, FACTORY_ADDRS, VOTER_ADDRS,
  NFPM_ABI, VOTER_ABI, GAUGE_ABI, FACTORY_ABI, FACTORY_ABI_AERO,
  POOL_ABI, POOL_ABI_AERO, POOL_ABI_FEE_GROWTH, POOL_ABI_FEE_GROWTH_AERO,
  ERC20_ABI, TOKEN_CACHE,
} from './constants.js';
import { getProvider, withTimeout, batchedRequests } from './providers.js';
import { computeV3Fees, computeV3CurrentAmounts } from './math.js';
import { fetchTokenPrice } from './prices.js';

// ─── Supported scan targets ────────────────────────────────────────────────────

// Base only. Multi-chain was dropped on purpose: see 01_ANALISIS_Y_HALLAZGOS.md 3.3.
const SCAN_TARGETS = [
  { protocol: 'uniswap-v3', chain: 'base' },
  { protocol: 'aerodrome',  chain: 'base' },
];

// ─── Main scanner ──────────────────────────────────────────────────────────────

/**
 * Scan all supported chains for V3 LP positions held by a wallet address.
 *
 * @param {string} walletAddress - EVM wallet address (0x...)
 * @param {object} [options]
 * @param {string[]} [options.chains]   - limit to specific chains (default: all)
 * @param {Function} [options.onProgress] - callback({ chain, found, total })
 * @returns {Promise<Array>} array of enriched position objects
 */
export async function scanWalletPositions(walletAddress, { chains, onProgress } = {}) {
  if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new Error('Invalid wallet address');
  }
  const address = walletAddress.toLowerCase();

  const targets = chains
    ? SCAN_TARGETS.filter((t) => chains.includes(t.chain))
    : SCAN_TARGETS.filter((t) => NFPM_ADDRS[t.protocol]?.[t.chain]);

  const allPositions = [];

  await Promise.allSettled(
    targets.map(async ({ protocol, chain }) => {
      try {
        const nfpmAddr   = NFPM_ADDRS[protocol]?.[chain];
        const factoryAddr = FACTORY_ADDRS[protocol]?.[chain];
        if (!nfpmAddr) return;

        const positions = await withTimeout(
          getV3Positions(chain, protocol, nfpmAddr, factoryAddr, address),
          30000
        );
        if (positions && positions.length > 0) {
          allPositions.push(...positions);
          onProgress?.({ chain, protocol, found: positions.length });
        }

        // Aerodrome: also check staked positions (NFT held by gauge, not the wallet)
        if (protocol === 'aerodrome') {
          const stakedPos = await withTimeout(
            getStakedPositions(
              chain, protocol, nfpmAddr, factoryAddr,
              VOTER_ADDRS.aerodrome?.[chain], address,
              new Set(positions?.map((p) => `${p.tokenId}-${p.chain}`) || [])
            ),
            30000
          );
          if (stakedPos && stakedPos.length > 0) {
            allPositions.push(...stakedPos);
            onProgress?.({ chain, protocol: `${protocol}-staked`, found: stakedPos.length });
          }
        }
      } catch (_) {
        // Silently skip failed chains — user may not have positions there
      }
    })
  );

  return allPositions;
}

// ─── Standard V3 positions ─────────────────────────────────────────────────────

/**
 * Get all V3 positions for a wallet on a specific chain/protocol.
 * @returns {Promise<Array>}
 */
export async function getV3Positions(chain, protocolKey, nfpmAddr, factoryAddr, wallet) {
  const provider = await getProvider(chain);
  const nfpm     = new ethers.Contract(nfpmAddr, NFPM_ABI, provider);

  const balance  = await withTimeout(nfpm.balanceOf(wallet), 10000);
  const count    = balance.toNumber();
  if (count === 0) return [];

  // Batch tokenId lookups
  const tokenIds = await batchedRequests(
    Array.from({ length: count }, (_, i) => i),
    (i) => nfpm.tokenOfOwnerByIndex(wallet, i).then((id) => id.toString()),
    20
  );

  const validIds = tokenIds
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);

  // Batch position data lookups
  const isAero = protocolKey === 'aerodrome';
  const positions = await batchedRequests(
    validIds,
    async (tokenId) => {
      try {
        return await _enrichPosition(chain, protocolKey, nfpmAddr, factoryAddr, tokenId, provider, isAero, wallet);
      } catch (_) {
        return null;
      }
    },
    5 // lower concurrency for enrichment (heavier RPC load)
  );

  return positions
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value)
    .filter((p) => p.liquidity && p.liquidity !== '0');
}

// ─── Aerodrome staked positions ────────────────────────────────────────────────

/**
 * Find positions where the NFT is staked in an Aerodrome gauge (not held in wallet directly).
 */
export async function getStakedPositions(chain, protocol, nfpmAddr, factoryAddr, voterAddr, wallet, alreadyFoundIds) {
  if (!voterAddr) return [];
  // TODO(Part 1): replaced by history.getStakedTokenIds(), ported from the HTML tool:
  //   factory.getPool(pairs x CL_TICK_SPACINGS) -> Voter.gauges(pool) -> gauge.stakedValues(wallet)
  //   then _enrichPosition() on each tokenId. Do NOT rewrite from scratch:
  //   port from ../../../fuentes/html_wallet_module_extract_lines3100-3900.js
  return [];
}

// ─── Position enrichment ────────────────────────────────────────────────────────

/**
 * Enrich a single position with current values, fees, and IL data.
 *
 * Exported because Part 1 enriches staked tokenIds the same way: the NFT is owned
 * by the gauge, but the position math is identical.
 */
export async function _enrichPosition(chain, protocol, nfpmAddr, factoryAddr, tokenId, provider, isAero, ownerWallet) {
  const nfpm = new ethers.Contract(nfpmAddr, NFPM_ABI, provider);
  const raw  = await withTimeout(nfpm.positions(tokenId), 8000);

  // positions() returns: [nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, fgInside0Last, fgInside1Last, tokensOwed0, tokensOwed1]
  const [, , addr0, addr1, fee, tickLower, tickUpper, liquidityBN, fgI0Last, fgI1Last, tokensOwed0, tokensOwed1] = raw;

  const liquidity = liquidityBN.toString();

  // Resolve token metadata
  const [tok0, tok1] = await Promise.all([
    getTokenInfo(provider, addr0),
    getTokenInfo(provider, addr1),
  ]);

  // Resolve pool address
  const poolAddr = await _resolvePool(provider, addr0, addr1, fee, isAero, factoryAddr);
  if (!poolAddr) return null;

  // Get pool state
  const poolABI = isAero
    ? [...POOL_ABI_AERO, ...POOL_ABI_FEE_GROWTH_AERO]
    : [...POOL_ABI, ...POOL_ABI_FEE_GROWTH];
  const pool        = new ethers.Contract(poolAddr, poolABI, provider);
  const [slot0, fg0, fg1, tL, tU] = await withTimeout(
    Promise.all([
      pool.slot0(),
      pool.feeGrowthGlobal0X128(),
      pool.feeGrowthGlobal1X128(),
      pool.ticks(tickLower),
      pool.ticks(tickUpper),
    ]),
    8000
  );

  const currentTick = Number(slot0.tick);
  const sqrtPriceX96 = slot0.sqrtPriceX96;
  const sqrtP_raw    = Number(sqrtPriceX96.toBigInt()) / (2 ** 96);
  const inRange      = currentTick >= tickLower && currentTick < tickUpper;

  // feeGrowthOutside index: 2 for Uni V3, 3 for Aerodrome (extra stakedLiquidityNet field)
  const fgIdx = isAero ? 3 : 2;

  // Exact fee calculation using feeGrowthInside
  const fees = computeV3Fees(
    liquidityBN, fg0, fg1, tL, tU,
    fgI0Last, fgI1Last,
    tokensOwed0, tokensOwed1,
    currentTick, tickLower, tickUpper,
    tok0.dec, tok1.dec,
    fgIdx
  );

  // Current token amounts using V3 tick math
  const currentAmounts = computeV3CurrentAmounts({
    liquidity, tickLower, tickUpper, currentTick,
    dec0: tok0.dec, dec1: tok1.dec,
  });

  // Current USD value
  const [price0, price1] = await Promise.all([
    fetchTokenPrice(chain, addr0),
    fetchTokenPrice(chain, addr1),
  ]);

  let valueUSD = null;
  if (currentAmounts && price0 && price1) {
    valueUSD = currentAmounts.amount0 * price0 + currentAmounts.amount1 * price1;
  }

  return {
    tokenId,
    protocol,
    chain,
    poolAddress: poolAddr,
    owner: ownerWallet,
    token0: { address: addr0, symbol: tok0.sym, decimals: tok0.dec },
    token1: { address: addr1, symbol: tok1.sym, decimals: tok1.dec },
    symbol: `${tok0.sym}/${tok1.sym}`,
    fee: Number(fee),
    tickLower: Number(tickLower),
    tickUpper: Number(tickUpper),
    currentTick,
    sqrtP_raw,
    liquidity,
    inRange,
    fees: {
      token0: fees.fees0,
      token1: fees.fees1,
      usd: (fees.fees0 * (price0 || 0)) + (fees.fees1 * (price1 || 0)),
    },
    currentAmounts: currentAmounts ? {
      token0: currentAmounts.amount0,
      token1: currentAmounts.amount1,
    } : null,
    prices: { token0: price0, token1: price1 },
    valueUSD,
    isAero,
  };
}

/** Resolve pool address from factory */
async function _resolvePool(provider, token0, token1, fee, isAero, factoryAddr) {
  if (!factoryAddr) return null;
  try {
    const abi     = isAero ? FACTORY_ABI_AERO : FACTORY_ABI;
    const factory = new ethers.Contract(factoryAddr, abi, provider);
    const addr    = await withTimeout(factory.getPool(token0, token1, fee), 6000);
    const ZERO    = '0x0000000000000000000000000000000000000000';
    return addr && addr !== ZERO ? addr.toLowerCase() : null;
  } catch (_) {
    return null;
  }
}

/** Get token symbol and decimals, using cache when possible */
export async function getTokenInfo(provider, address) {
  const key = address.toLowerCase();
  if (TOKEN_CACHE[key]) return TOKEN_CACHE[key];
  try {
    const contract = new ethers.Contract(address, ERC20_ABI, provider);
    const [sym, dec] = await withTimeout(
      Promise.all([contract.symbol(), contract.decimals()]),
      6000
    );
    const info = { sym: sym || '???', dec: Number(dec) };
    TOKEN_CACHE[key] = info; // populate cache for next time
    return info;
  } catch (_) {
    return { sym: '???', dec: 18 };
  }
}
