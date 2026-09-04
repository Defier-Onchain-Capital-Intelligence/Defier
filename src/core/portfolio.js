/**
 * core/portfolio.js · Orchestrator. Returns the typed Portfolio object of types/portfolio.ts.
 *
 * Stage: PART 1. Live position state and full event history are real. The P&L block,
 * token balances, tokenized stock holdings and Aave are still empty and declared in
 * `warnings`, never faked.
 *
 * Order matters. Wallet held positions come first because they hand us the tokens
 * that make the staked search fruitful, then the staked pass, then a completeness
 * pass over Transfer logs for anything both missed.
 */
import { ethers } from 'ethers';
import { scanWalletPositions, _enrichPosition } from './scanner.js';
import { getStakedTokenIds, getWalletTokenIdsFromLogs, getPositionHistory, getPendingRewards } from './history.js';
import { computeExposure, classify } from './exposure.js';
import { tickToPrice } from './math.js';
import { STOCK_ADDRESSES, BASE_TOKENS, AERODROME_CL_DEPLOYMENTS } from './constants.base.js';
import { NFPM_ADDRS, FACTORY_ADDRS } from './constants.js';
import { getProvider, batchedRequests, withTimeout } from './providers.js';
import { fetchTokenPrice } from './prices.js';

const CHAIN = 'base';

const PENDING = [
  'True P&L and the HODL benchmark are not computed yet (Part 2).',
  'Token balances, tokenized stocks and Aave positions are not included yet (Part 2).',
];

function quote(usd) {
  return Number.isFinite(usd) && usd !== null ? { usd, source: 'llama' } : null;
}

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

/** Scanner output plus history -> LpPosition of types/portfolio.ts */
function toLpPosition(p, extra = {}) {
  const token0 = tokenRef(p.token0);
  const token1 = tokenRef(p.token1);
  const priceOf = (tick) => tickToPrice(tick, token0.decimals, token1.decimals);
  const closed = extra.closed ?? (!p.liquidity || p.liquidity === '0');

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
    staked: extra.staked || false,
    gaugeAddress: extra.gaugeAddress,
    nfpmAddress: extra.nfpmAddress,
    closed,
    liquidity: p.liquidity,
    currentAmounts: closed ? null : p.currentAmounts,
    prices: { token0: quote(p.prices?.token0), token1: quote(p.prices?.token1) },
    valueUsd: closed ? 0 : (p.valueUSD ?? null),
    feesUnclaimed: {
      token0: p.fees?.token0 ?? 0,
      token1: p.fees?.token1 ?? 0,
      usd: p.fees?.usd ?? 0,
    },
    incentivesPending: extra.incentivesPending ?? null,
    openedAt: extra.openedAt ?? null,
    events: extra.events ?? [],
    pnl: null,
    confidence: extra.confidence ?? 'partial',
    notes: extra.notes ?? [],
  };
}

/**
 * @param {string} address lowercase 0x address on Base
 * @returns {Promise<import('../types/portfolio').Portfolio>}
 */
export async function buildPortfolio(address, { diagnostics = false, deep = false } = {}) {
  const wallet = address.toLowerCase();
  /** Only populated when the caller asks. Counts, never secrets. */
  const diag = diagnostics ? { steps: [] } : null;
  const trace = (step, value) => { if (diag) diag.steps.push({ step, value }); };
  const warnings = [...PENDING];
  const provider = await getProvider(CHAIN);

  // 1. Positions the wallet holds directly.
  const held = await scanWalletPositions(wallet, { chains: [CHAIN] });
  const seen = new Set(held.map((p) => String(p.tokenId)));
  trace('heldTokenIds', [...seen]);

  // 2. Positions staked in an Aerodrome gauge. The tokens of the held positions
  //    widen the search: someone with WETH/NVDAc in hand likely staked a sibling.
  const extraTokens = held.flatMap((p) => [p.token0?.address, p.token1?.address]).filter(Boolean);
  let stakedRefs = [];
  try {
    stakedRefs = await getStakedTokenIds(wallet, { extraTokens, diag });
    trace('stakedRefs', stakedRefs);
  } catch (err) {
    trace('stakedSearchError', String(err?.message || err));
    warnings.push('The staked position search failed, so gauge positions may be missing.');
  }

  const defaultNfpm = NFPM_ADDRS['aerodrome']?.[CHAIN];
  const defaultFactory = FACTORY_ADDRS['aerodrome']?.[CHAIN];

  const stakedEnriched = [];
  for (const ref of stakedRefs) {
    if (seen.has(ref.tokenId)) continue;
    seen.add(ref.tokenId);
    try {
      const enriched = await withTimeout(
        _enrichPosition(
          CHAIN, 'aerodrome',
          ref.nfpmAddress || defaultNfpm,
          ref.factoryAddress || defaultFactory,
          ref.tokenId, provider, true, wallet
        ),
        25000
      );
      if (enriched) stakedEnriched.push({ enriched, ref });
      else trace('stakedEnrichNull', ref.tokenId);
    } catch (err) {
      trace('stakedEnrichThrew', { tokenId: ref.tokenId, error: String(err?.message || err).slice(0, 160) });
      warnings.push(`Staked position ${ref.tokenId} could not be read.`);
    }
  }

  // 3. Completeness pass. Anything this wallet ever owned that neither pass found.
  let recovered = [];
  try {
    const sources = [
      ...AERODROME_CL_DEPLOYMENTS.map((d) => ({ protocol: 'aerodrome', nfpm: d.nfpm, factory: d.factory })),
      { protocol: 'uniswap-v3', nfpm: NFPM_ADDRS['uniswap-v3']?.[CHAIN], factory: FACTORY_ADDRS['uniswap-v3']?.[CHAIN] },
    ].filter((sourceItem) => sourceItem.nfpm);

    const perSource = await Promise.all(sources.map(async (sourceItem) => {
      const owned = await getWalletTokenIdsFromLogs(wallet, sourceItem.protocol, sourceItem.nfpm);
      return owned.map((t) => ({ ...t, protocol: sourceItem.protocol, nfpm: sourceItem.nfpm, factory: sourceItem.factory }));
    }));
    const everOwned = perSource.flat();
    trace('everOwned', everOwned);
    const unknown = everOwned.filter((t) => !seen.has(t.tokenId));
    for (const item of unknown.slice(0, 25)) {
      seen.add(item.tokenId);
      const proto = item.protocol || 'aerodrome';
      const protoNfpm = item.nfpm || NFPM_ADDRS[proto]?.[CHAIN];
      const protoFactory = item.factory || FACTORY_ADDRS[proto]?.[CHAIN];
      try {
        const enriched = await withTimeout(
          _enrichPosition(CHAIN, proto, protoNfpm, protoFactory, item.tokenId, provider, proto === 'aerodrome', wallet),
          25000
        );
        if (enriched) recovered.push({ enriched, ref: { tokenId: item.tokenId, gaugeAddress: null, nfpmAddress: protoNfpm }, owner: item.currentOwner });
        else trace('enrichReturnedNull', item.tokenId);
      } catch (err) {
        const message = String(err?.message || err);
        // positions() reverting with "ID" means the NFT was burned: the position was
        // closed and destroyed. That is a fact about the wallet, not a failure.
        if (message.includes('"ID"')) {
          warnings.push(`Position ${item.tokenId} was closed and burned, so its final state cannot be read onchain.`);
          trace('burnedTokenId', item.tokenId);
        } else {
          trace('enrichThrew', { tokenId: item.tokenId, error: message });
        }
      }
    }
  } catch (_) {
    warnings.push('The completeness pass over transfer logs did not run, so an unusual pool could be missing.');
  }

  // 4. Event history for every position found. Bounded concurrency: each one is
  //    several chunked log scans and this is the expensive part of the request.
  const candidates = [
    ...held.map((p) => ({ p, staked: false, gaugeAddress: undefined, nfpm: defaultNfpm })),
    ...stakedEnriched.map(({ enriched, ref }) => ({
      p: enriched, staked: true, gaugeAddress: ref.gaugeAddress, nfpm: ref.nfpmAddress || defaultNfpm,
    })),
    ...recovered.map(({ enriched, ref }) => ({
      p: enriched, staked: false, gaugeAddress: ref.gaugeAddress || undefined, nfpm: ref.nfpmAddress || defaultNfpm,
    })),
  ];

  const results = await batchedRequests(candidates, async ({ p, staked, gaugeAddress, nfpm }) => {
    // Reconstructing a position's lifetime is many log scans across millions of
    // blocks. The portfolio view answers "what do I hold and what is it worth",
    // which needs none of that, so history is opt in here and always on in the
    // position detail endpoint. Doing it for every position on every page load
    // is what made this request time out.
    let history = {
      events: [], openedAt: null, closed: false, confidence: 'partial',
      notes: ['Entry data and event history are loaded on the position detail view.'],
    };
    if (deep) {
      try {
        history = await getPositionHistory({
          protocol: p.protocol, tokenId: p.tokenId, nfpmAddr: nfpm,
          gaugeAddress, wallet,
          token0: { address: p.token0.address, decimals: p.token0.decimals },
          token1: { address: p.token1.address, decimals: p.token1.decimals },
        });
      } catch (_) { /* keep the degraded default */ }
    }

    let incentivesPending = null;
    if (staked && gaugeAddress) {
      const amount = await getPendingRewards(gaugeAddress, wallet, p.tokenId, provider).catch(() => 0);
      const aeroPrice = await fetchTokenPrice(CHAIN, BASE_TOKENS.AERO).catch(() => null);
      incentivesPending = { amount, usd: aeroPrice ? amount * aeroPrice : 0 };
    }

    return toLpPosition(p, {
      staked, gaugeAddress, nfpmAddress: nfpm, incentivesPending,
      events: history.events,
      openedAt: history.openedAt,
      closed: history.closed || !p.liquidity || p.liquidity === '0',
      confidence: history.confidence,
      notes: history.notes,
    });
  }, 3, 100);

  const positions = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const open = positions.filter((p) => !p.closed);

  const lpValueUsd = open.reduce((a, p) => a + (p.valueUsd || 0), 0);
  const feesTotalUsd = open.reduce((a, p) => a + (p.feesUnclaimed.usd || 0), 0);
  const incentivesTotalUsd = positions.reduce((a, p) => a + (p.incentivesPending?.usd || 0), 0);

  const tokens = [];
  const lending = [];
  const exposure = computeExposure(positions, tokens, lending);

  const stakedCount = positions.filter((p) => p.staked).length;
  const closedCount = positions.length - open.length;

  const parts = [];
  if (open.length) parts.push(`${open.length} open ${open.length === 1 ? 'position' : 'positions'} worth $${lpValueUsd.toFixed(2)}`);
  if (stakedCount) parts.push(`${stakedCount} staked in a gauge`);
  if (closedCount) parts.push(`${closedCount} closed`);

  const summary = {
    totalValueUsd: lpValueUsd,
    lpValueUsd,
    tokensValueUsd: 0,
    stocksValueUsd: 0,
    lendingNetUsd: 0,
    lpNetPnlUsd: 0,
    lpVsHodlUsd: 0,
    feesTotalUsd,
    incentivesTotalUsd,
    headline: parts.length ? parts.join(', ') : 'No liquidity positions found on Base',
    confidence: positions.every((p) => p.confidence === 'full') && positions.length ? 'full' : 'partial',
  };

  return {
    address: wallet,
    chain: CHAIN,
    generatedAt: Math.floor(Date.now() / 1000),
    summary,
    positions,
    tokens,
    lending,
    exposure,
    warnings,
    ...(diag ? { diagnostics: diag } : {}),
  };
}
