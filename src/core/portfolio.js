/**
 * core/portfolio.js · Orchestrator. Returns the typed Portfolio object of types/portfolio.ts.
 *
 * Current stage: PART 0. Only the live state of NFT positions held by the wallet is
 * real. Everything the later parts add is returned empty and declared in `warnings`,
 * never faked. Rule 5 of the handoff: if something is missing, say so.
 *
 * Roadmap of this file:
 *   Part 1 · staked tokenIds (history.getStakedTokenIds) + per position event history
 *   Part 2 · pnl.computePositionPnl, stocks.getStockHoldings, lending.getLendingPositions
 */
import { scanWalletPositions } from './scanner.js';
import { computeExposure, classify } from './exposure.js';
import { tickToPrice } from './math.js';
import { STOCK_ADDRESSES } from './constants.base.js';

const PENDING = [
  'Staked Aerodrome positions are not listed yet (Part 1).',
  'Entry data, collected fees, claimed AERO and gas are not reconstructed yet (Part 1).',
  'True P&L and the HODL benchmark are not computed yet (Part 2).',
  'Token balances, tokenized stocks and Aave positions are not included yet (Part 2).',
];

/** Wrap a raw USD price into the PriceQuote shape the UI expects. */
function quote(usd) {
  return Number.isFinite(usd) && usd !== null ? { usd, source: 'llama' } : null;
}

/** Map a scanner token into the typed TokenRef. */
function tokenRef(raw) {
  const address = String(raw.address).toLowerCase();
  const ref = {
    address,
    symbol: raw.symbol || '???',
    decimals: Number(raw.decimals),
    assetClass: classify(address),
  };
  if (STOCK_ADDRESSES.has(address)) ref.isTokenizedStock = true;
  return ref;
}

/** Scanner output -> LpPosition of types/portfolio.ts */
function toLpPosition(p) {
  const token0 = tokenRef(p.token0);
  const token1 = tokenRef(p.token1);
  const priceOf = (tick) => tickToPrice(tick, token0.decimals, token1.decimals);

  return {
    id: `${p.protocol}:${p.tokenId}`,
    protocol: p.protocol,
    tokenId: String(p.tokenId),
    poolAddress: String(p.poolAddress).toLowerCase(),
    token0,
    token1,
    symbol: p.symbol,
    tickLower: p.tickLower,
    tickUpper: p.tickUpper,
    currentTick: p.currentTick,
    priceLower: priceOf(p.tickLower),
    priceUpper: priceOf(p.tickUpper),
    currentPrice: priceOf(p.currentTick),
    inRange: p.inRange,
    staked: false,          // Part 1 fills this in
    closed: false,          // the scanner already filters out liquidity == 0
    liquidity: p.liquidity,
    currentAmounts: p.currentAmounts,
    prices: { token0: quote(p.prices?.token0), token1: quote(p.prices?.token1) },
    valueUsd: p.valueUSD ?? null,
    feesUnclaimed: {
      token0: p.fees?.token0 ?? 0,
      token1: p.fees?.token1 ?? 0,
      usd: p.fees?.usd ?? 0,
    },
    incentivesPending: null,
    openedAt: null,
    events: [],
    pnl: null,
  };
}

/**
 * @param {string} address lowercase 0x address on Base
 * @returns {Promise<import('../types/portfolio').Portfolio>}
 */
export async function buildPortfolio(address) {
  const raw = await scanWalletPositions(address, { chains: ['base'] });
  const positions = raw.map(toLpPosition);

  const lpValueUsd  = positions.reduce((a, p) => a + (p.valueUsd || 0), 0);
  const feesTotalUsd = positions.reduce((a, p) => a + (p.feesUnclaimed.usd || 0), 0);

  const tokens = [];
  const lending = [];
  const exposure = computeExposure(positions, tokens, lending);

  const summary = {
    totalValueUsd: lpValueUsd,
    lpValueUsd,
    tokensValueUsd: 0,
    stocksValueUsd: 0,
    lendingNetUsd: 0,
    lpNetPnlUsd: 0,
    lpVsHodlUsd: 0,
    feesTotalUsd,
    incentivesTotalUsd: 0,
    headline: positions.length
      ? `${positions.length} open ${positions.length === 1 ? 'position' : 'positions'} worth $${lpValueUsd.toFixed(2)}`
      : 'No open liquidity positions found on Base',
    confidence: 'partial',
  };

  return {
    address,
    chain: 'base',
    generatedAt: Math.floor(Date.now() / 1000),
    summary,
    positions,
    tokens,
    lending,
    exposure,
    warnings: [...PENDING],
  };
}
