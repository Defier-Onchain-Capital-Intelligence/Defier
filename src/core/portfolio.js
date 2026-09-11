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
import { getStakedTokenIds, getWalletTokenIdsFromLogs, getPositionHistory, getPendingRewards, reconstructBurnedPosition, resolveGauges } from './history.js';
import { computeExposure, classify } from './exposure.js';
import { computeScenarios } from './scenarios.js';
import { computeHoldings } from './holdings.js';
import { observe } from './advisor.js';
import { computePositionPnl, headlineFor } from './pnl.js';
import { compareStrategies } from './strategies.js';
import { tickToPrice } from './math.js';
import { STOCK_ADDRESSES, BASE_TOKENS, AERODROME_CL_DEPLOYMENTS } from './constants.base.js';
import { NFPM_ADDRS, FACTORY_ADDRS } from './constants.js';
import { getProvider, batchedRequests, withTimeout, getProviderHealth } from './providers.js';
import { fetchTokenPrice } from './prices.js';
import { getStockHoldings } from './stocks.js';
import { getTokenHoldings } from './tokens.js';
import { getLendingPositions, LENDING_COVERAGE } from './lending.js';
import { resolveSickle } from './sickle.js';
import { getAmmPositions } from './amm.js';

const CHAIN = 'base';



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
/**
 * How a pool is named to a reader. "CL200" on Aerodrome, "0.05%" on Uniswap.
 *
 * Two pools on the same pair are not the same pool, and without this the screens
 * showed WETH/USDC four times with no way to tell which was which.
 */
function variantLabel(protocol, fee) {
  const n = Number(fee);
  if (!Number.isFinite(n) || n <= 0) return null;
  return protocol === 'aerodrome' ? `CL${n}` : `${(n / 10000).toFixed(2).replace(/0$/, '')}%`;
}

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
    // For Aerodrome Slipstream the fifth field of positions() is the tick
    // spacing, not a fee: it is what names the pool. CL1 and CL200 on the same
    // pair are different pools with different granularity, and a range that
    // exists in one cannot exist in the other, so this has to travel with the
    // position rather than be inferred from the pair.
    tickSpacing: p.protocol === 'aerodrome' && Number.isFinite(p.fee) ? Number(p.fee) : null,
    feeTier: p.protocol !== 'aerodrome' && Number.isFinite(p.fee) ? Number(p.fee) : null,
    variant: variantLabel(p.protocol, p.fee),
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
    // Where the position actually sits. "vfat" means the NFT belongs to that
    // user's Sickle contract rather than to the address they typed in, which
    // changes nothing about the money and everything about where to look for
    // it — so it travels with the position instead of being inferred.
    heldVia: extra.heldVia || 'wallet',
    heldBy: extra.heldBy || null,
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
    strategies: null,
    confidence: extra.confidence ?? 'partial',
    notes: extra.notes ?? [],
  };
}

/**
 * Remove claims a position saw but did not earn.
 *
 * Aerodrome's CL gauge emits ClaimRewards(from, amount): indexed by the wallet,
 * not by the token id. A wallet with two positions in the same pool therefore
 * finds the same claim in both event histories, and valuing both would report
 * money that was paid once as though it had been paid twice.
 *
 * Each claim is kept on the earliest position still open when it happened and
 * dropped everywhere else. A position burned before the claim never sees it in
 * the first place, which getPositionHistory enforces. Which of two concurrent
 * positions gets the claim does not change a lifetime total; counting it twice
 * would.
 */
export function dedupeClaimEvents(positions) {
  const seen = new Set();
  const ordered = [...positions].sort((a, b) => (a.openedAt || 0) - (b.openedAt || 0));

  for (const position of ordered) {
    if (!position.events?.length) continue;
    position.events = position.events.filter((event) => {
      if (event.type !== 'claim_rewards') return true;
      const key = `${event.gauge || ''}|${event.txHash}|${event.logIndex ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

/**
 * How many positions the completeness pass will rebuild in one request.
 *
 * Not a number of positions someone owns — a budget. Each one costs an
 * enrichment and, on a deep build, a full event reconstruction: several chunked
 * log scans across millions of blocks. The route has sixty seconds. Twenty five
 * is what fits.
 *
 * When it binds, the report says so: positionsNotReconstructed carries the
 * count and coverage.complete goes false, so the wallet never claims an all
 * time figure it did not measure.
 */
const RECONSTRUCTION_BUDGET = 25;

/**
 * Newest first, per venue, before the budget is applied.
 *
 * Discovery returns oldest first — Alchemy's transfer history is ascending and
 * the log fallback scans forward from the deploy block — so slicing it took a
 * heavy wallet's twenty five OLDEST positions and dropped everything recent.
 * That is the wrong twenty five: the recent ones are the ones somebody opened
 * this month and came here to look at.
 *
 * tokenIds are minted in sequence, so a higher id is a later position, but only
 * within one position manager. Sorting them all together would let whichever
 * contract issues the largest numbers crowd the others out, so each venue is
 * sorted on its own and they are taken in turn.
 */
function newestFirst(items) {
  const byVenue = new Map();
  for (const item of items) {
    const key = String(item.nfpm || item.protocol || '').toLowerCase();
    if (!byVenue.has(key)) byVenue.set(key, []);
    byVenue.get(key).push(item);
  }
  for (const list of byVenue.values()) {
    list.sort((a, b) => {
      try {
        const d = BigInt(b.tokenId) - BigInt(a.tokenId);
        return d > 0n ? 1 : d < 0n ? -1 : 0;
      } catch (_) { return 0; }
    });
  }

  const queues = [...byVenue.values()];
  const out = [];
  for (let i = 0; out.length < items.length; i += 1) {
    let moved = false;
    for (const q of queues) {
      if (i < q.length) { out.push(q[i]); moved = true; }
    }
    if (!moved) break;
  }
  return out;
}

/**
 * @param {string} address lowercase 0x address on Base
 * @param {{diagnostics?: boolean, deep?: boolean, maxRebuild?: number|null}} [options]
 * @returns {Promise<import('../types/portfolio').Portfolio>}
 */
export async function buildPortfolio(address, { diagnostics = false, deep = false, maxRebuild = null } = {}) {
  const wallet = address.toLowerCase();
  /** Only populated when the caller asks. Counts, never secrets. */
  const diag = diagnostics ? { steps: [] } : null;
  const trace = (step, value) => { if (diag) diag.steps.push({ step, value }); };
  /**
   * Wall clock at each phase boundary, in milliseconds from the start.
   *
   * The deep build stopped fitting in the route's sixty seconds and there was
   * no way to say which phase ate them — the budget, the discovery loop and
   * the reconstructions were all plausible and all unmeasured. Guessing which
   * number to lower is how you lower the wrong one.
   */
  const t0 = Date.now();
  const mark = (phase) => { if (diag) diag.steps.push({ step: 'phaseMs', value: { phase, ms: Date.now() - t0 } }); };
  const warnings = [];
  const provider = await getProvider(CHAIN);
  // Which endpoints answered the probe, and which did not. When a wallet comes
  // back empty this is the first thing worth reading: an empty wallet and an
  // unreachable chain look identical everywhere else.
  trace('rpcHealth', getProviderHealth(CHAIN));

  // 1. Positions the wallet holds directly.
  const held = await scanWalletPositions(wallet, { chains: [CHAIN] });
  const seen = new Set(held.map((p) => String(p.tokenId)));
  trace('heldTokenIds', [...seen]);

  mark('held');

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

  mark('staked');

  // 3. Completeness pass. Anything this wallet ever owned that neither pass found.
  let recovered = [];
  /** NFTs this wallet owned whose state no longer exists. Their events do. */
  const burned = [];
  /** Set when the search for this wallet's positions could not cover its full range. */
  let discoveryIncomplete = false;
  try {
    const sources = [
      ...AERODROME_CL_DEPLOYMENTS.map((d) => ({ protocol: 'aerodrome', nfpm: d.nfpm, factory: d.factory })),
      { protocol: 'uniswap-v3', nfpm: NFPM_ADDRS['uniswap-v3']?.[CHAIN], factory: FACTORY_ADDRS['uniswap-v3']?.[CHAIN] },
    ].filter((sourceItem) => sourceItem.nfpm);

    const perSource = await Promise.all(sources.map(async (sourceItem) => {
      const owned = await getWalletTokenIdsFromLogs(wallet, sourceItem.protocol, sourceItem.nfpm);
      // The discovery pass reports when it could not cover a wallet's whole
      // range. Without that, a short list reads as a complete one.
      const list = Array.isArray(owned) ? owned : (owned?.items ?? []);
      if (!Array.isArray(owned) && owned?.incomplete) discoveryIncomplete = true;
      return list.map((t) => ({ ...t, protocol: sourceItem.protocol, nfpm: sourceItem.nfpm, factory: sourceItem.factory }));
    }));
    const everOwned = perSource.flat();
    trace('everOwned', everOwned);
    const unknown = everOwned.filter((t) => !seen.has(t.tokenId));
    for (const item of newestFirst(unknown).slice(0, RECONSTRUCTION_BUDGET)) {
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
          // The NFT was destroyed after the position was fully closed. There is
          // no capital and no history to show, so it is a diagnostic fact, not
          // something to put in front of someone looking at their money.
          trace('burnedTokenId', item.tokenId);
          burned.push({ tokenId: item.tokenId, protocol: proto, nfpm: protoNfpm });
        } else {
          trace('enrichThrew', { tokenId: item.tokenId, error: message });
        }
      }
    }
  } catch (_) {
    warnings.push('The completeness pass over transfer logs did not run, so an unusual pool could be missing.');
  }

  mark('discovery');

  // 3b. Positions held through vfat.
  //
  //     vfat gives each user a contract wallet, the Sickle, and the position
  //     belongs to that rather than to the address the person types in. Without
  //     this pass such a wallet reports "no liquidity positions found" while its
  //     money is working, which is a wrong answer rather than a missing one.
  //
  //     Strictly additive, and wrapped whole. A wallet's own report must not get
  //     worse because a second protocol could not be read, so every failure here
  //     costs the vfat positions and nothing else.
  const vfatCandidates = [];
  let sickle = null;
  try {
    sickle = await resolveSickle(wallet);
    if (sickle) {
      trace('sickle', sickle);
      const sickleHeld = await scanWalletPositions(sickle, { chains: [CHAIN] });
      mark('vfat.held');
      for (const p of sickleHeld) {
        if (seen.has(String(p.tokenId))) continue;
        seen.add(String(p.tokenId));
        vfatCandidates.push({ p, staked: false, gaugeAddress: undefined, nfpm: defaultNfpm, owner: sickle, via: 'vfat' });
      }

      // The NFT is staked into the gauge by the Sickle, so it is not in the
      // Sickle's balance either. Same search as for a wallet, one level in.
      const sickleTokens = sickleHeld.flatMap((p) => [p.token0?.address, p.token1?.address]).filter(Boolean);
      const sickleStaked = await getStakedTokenIds(sickle, { extraTokens: [...extraTokens, ...sickleTokens], diag })
        .catch(() => []);
      mark('vfat.stakedIds');
      for (const ref of sickleStaked) {
        if (seen.has(ref.tokenId)) continue;
        seen.add(ref.tokenId);
        const enriched = await withTimeout(
          _enrichPosition(
            CHAIN, 'aerodrome',
            ref.nfpmAddress || defaultNfpm,
            ref.factoryAddress || defaultFactory,
            ref.tokenId, provider, true, sickle,
          ),
          25000,
        ).catch(() => null);
        if (enriched) {
          vfatCandidates.push({
            p: enriched, staked: true, gaugeAddress: ref.gaugeAddress,
            nfpm: ref.nfpmAddress || defaultNfpm, owner: sickle, via: 'vfat',
          });
        }
      }
      mark('vfat.stakedEnrich');
      // Closed vfat positions. The completeness pass above walks the NFTs this
      // wallet ever owned, and a vfat position was never owned by the wallet —
      // it was minted straight to the Sickle. Without this the same pass over
      // the Sickle, a vfat user's lifetime report would quietly contain only
      // the positions still open, while calling itself all time.
      const vfatSources = [
        ...AERODROME_CL_DEPLOYMENTS.map((d) => ({ protocol: 'aerodrome', nfpm: d.nfpm, factory: d.factory })),
        { protocol: 'uniswap-v3', nfpm: NFPM_ADDRS['uniswap-v3']?.[CHAIN], factory: FACTORY_ADDRS['uniswap-v3']?.[CHAIN] },
      ].filter((sourceItem) => sourceItem.nfpm);

      const vfatEverOwned = (await Promise.all(vfatSources.map(async (sourceItem) => {
        const owned = await getWalletTokenIdsFromLogs(sickle, sourceItem.protocol, sourceItem.nfpm).catch(() => []);
        const list = Array.isArray(owned) ? owned : (owned?.items ?? []);
        if (!Array.isArray(owned) && owned?.incomplete) discoveryIncomplete = true;
        return list.map((t) => ({ ...t, protocol: sourceItem.protocol, nfpm: sourceItem.nfpm, factory: sourceItem.factory }));
      }))).flat();

      mark('vfat.everOwned');
      const vfatUnknown = vfatEverOwned.filter((t) => !seen.has(t.tokenId));
      for (const item of newestFirst(vfatUnknown).slice(0, RECONSTRUCTION_BUDGET)) {
        seen.add(item.tokenId);
        const proto = item.protocol || 'aerodrome';
        const protoNfpm = item.nfpm || NFPM_ADDRS[proto]?.[CHAIN];
        const protoFactory = item.factory || FACTORY_ADDRS[proto]?.[CHAIN];
        try {
          const enriched = await withTimeout(
            _enrichPosition(CHAIN, proto, protoNfpm, protoFactory, item.tokenId, provider, proto === 'aerodrome', sickle),
            25000,
          );
          if (enriched) {
            vfatCandidates.push({
              p: enriched, staked: false, gaugeAddress: undefined,
              nfpm: protoNfpm, owner: sickle, via: 'vfat',
            });
          }
        } catch (err) {
          // Burned means the position was closed and destroyed. A fact about
          // the wallet, recorded the same way as for a directly held one.
          if (String(err?.message || err).includes('"ID"')) {
            burned.push({ tokenId: item.tokenId, protocol: proto, nfpm: protoNfpm, owner: sickle });
          }
        }
      }

      mark('vfat.unknownEnrich');
      trace('vfatPositions', vfatCandidates.length);
      trace('vfatEverOwned', vfatEverOwned.length);
      if (vfatCandidates.length === 0 && vfatEverOwned.length === 0) trace('sickleEmpty', true);
    }
  } catch (err) {
    trace('vfatPassFailed', String(err?.message || err).slice(0, 160));
    warnings.push('Positions held through vfat could not be read, so any of those are missing from this portfolio.');
  }

  mark('vfat');

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
    ...vfatCandidates,
  ];

  // A position that was staked, paid emissions and later unstaked used to report
  // none of them: the gauge address was only known as a by-product of asking
  // which positions are staked TODAY, so nothing ever scanned that gauge for the
  // claims. The voter still maps pool to gauge long after the position closed,
  // so the address is resolved here for every Aerodrome position regardless of
  // its current state, and one multicall covers the lot.
  if (deep) {
    const needGauge = candidates.filter(
      (c) => !c.gaugeAddress && c.p?.protocol === 'aerodrome' && c.p?.poolAddress,
    );
    if (needGauge.length) {
      try {
        const gaugeOf = await resolveGauges(needGauge.map((c) => c.p.poolAddress));
        for (const c of needGauge) {
          const g = gaugeOf.get(String(c.p.poolAddress).toLowerCase());
          if (g) c.gaugeAddress = g;
        }
        trace('gaugesResolvedForHistory', needGauge.filter((c) => c.gaugeAddress).length);
      } catch (err) {
        // Emissions history is worth less than the rest of the report, so a
        // failure here degrades one number instead of losing the position.
        trace('gaugeResolveFailed', String(err?.message || err).slice(0, 120));
        warnings.push('Gauge addresses could not be resolved, so historical emissions may be understated.');
      }
    }
  }

  const results = await batchedRequests(candidates, async ({ p, staked, gaugeAddress, nfpm, owner, via }) => {
    // Whose address the chain has against this position. For anything held
    // through vfat that is the Sickle, and asking under the wallet's own
    // address would find no fees, no claims and no history.
    const holder = owner || wallet;
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
          gaugeAddress, wallet: holder,
          token0: { address: p.token0.address, decimals: p.token0.decimals },
          token1: { address: p.token1.address, decimals: p.token1.decimals },
        });
      } catch (_) { /* keep the degraded default */ }
    }

    let incentivesPending = null;
    if (staked && gaugeAddress) {
      const amount = await getPendingRewards(gaugeAddress, holder, p.tokenId, provider).catch(() => 0);
      const aeroPrice = await fetchTokenPrice(CHAIN, BASE_TOKENS.AERO).catch(() => null);
      incentivesPending = { amount, usd: aeroPrice ? amount * aeroPrice : 0 };
    }

    const position = toLpPosition(p, {
      staked, gaugeAddress, nfpmAddress: nfpm, incentivesPending,
      heldVia: via || 'wallet',
      heldBy: owner || null,
      events: history.events,
      openedAt: history.openedAt,
      closed: history.closed || !p.liquidity || p.liquidity === '0',
      confidence: history.confidence,
      notes: history.notes,
    });

    // P&L is computed later, in one pass over every position. It has to wait
    // because a gauge's claims are visible to more than one position and the
    // duplicates have to be removed before any of them is valued.
    return position;
  }, 3, 100);

  const positions = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);

  mark('enrichAndHistory');

  // 5. Positions whose NFT was burned. Their state is gone, their events are not.
  //    Skipping them is what makes a wallet with years of history report zero fees
  //    claimed, so they are rebuilt from the chain rather than quietly dropped.
  let burnedRebuilt = 0;
  if (deep && burned.length) {
    // 20 is the shipped cap. maxRebuild lowers it for measurement only: the
    // deep build overruns the route's sixty seconds on a heavy wallet, and a
    // request that times out returns no timings at all, so the cost per
    // reconstruction can only be read from runs that finish.
    const rebuildCap = maxRebuild == null ? 20 : Math.max(0, Math.min(20, maxRebuild));
    const rebuilt = await batchedRequests(burned.slice(0, rebuildCap), async (item) => {
      // Everything in here is wrapped, because batchedRequests reports a thrown
      // error as a rejected promise and the loop below only reads fulfilled
      // ones. A throw therefore vanished completely: no position, no reason, no
      // trace entry. The rebuild failed silently for exactly that reason and it
      // took a diagnostic endpoint to notice the absence of an error.
      try {
        return await rebuildOne(item);
      } catch (err) {
        trace('burnedRebuildFailed', {
          tokenId: item.tokenId,
          reason: `threw: ${String(err?.message || err).slice(0, 160)}`,
        });
        return null;
      }
    }, 2, 150);

    for (const r of rebuilt) {
      if (r.status === 'fulfilled' && r.value) { positions.push(r.value); burnedRebuilt += 1; }
      else if (r.status === 'rejected') {
        trace('burnedRebuildFailed', { reason: `rejected: ${String(r.reason).slice(0, 160)}` });
      }
    }

    async function rebuildOne(item) {
      // A burned position found through the Sickle belongs to the Sickle, and
      // every event that proves it existed is indexed there rather than to the
      // address the person typed in.
      const holder = item.owner || wallet;
      const shape = await reconstructBurnedPosition({
        protocol: item.protocol, tokenId: item.tokenId, nfpmAddr: item.nfpm, wallet: holder,
      });
      // Why a rebuild failed is the only thing that makes the next one fixable.
      if (!shape?.ok) {
        trace('burnedRebuildFailed', { tokenId: item.tokenId, reason: shape?.reason || 'unknown' });
        return null;
      }

      const history = await getPositionHistory({
        protocol: item.protocol, tokenId: item.tokenId, nfpmAddr: item.nfpm,
        gaugeAddress: shape.gaugeAddress || undefined, wallet: holder,
        token0: { address: shape.token0.address, decimals: shape.token0.decimals },
        token1: { address: shape.token1.address, decimals: shape.token1.decimals },
      });
      if (!history.events.length) {
        trace('burnedRebuildFailed', { tokenId: item.tokenId, reason: 'no events found for the rebuilt position' });
        return null;
      }

      // Today's prices for both sides. Without them the HODL benchmark has
      // nothing to value the deposit against, so the position rebuilds
      // perfectly and is then thrown out of every total for being unvaluable —
      // which is what happened to a real WETH/AERO position: found, replayed,
      // and excluded because nobody had asked what AERO is worth.
      const [priceNow0, priceNow1] = await Promise.all([
        fetchTokenPrice(CHAIN, shape.token0.address).catch(() => null),
        fetchTokenPrice(CHAIN, shape.token1.address).catch(() => null),
      ]);

      const position = toLpPosition({
        protocol: item.protocol,
        tokenId: item.tokenId,
        poolAddress: shape.poolAddress,
        token0: shape.token0,
        token1: shape.token1,
        prices: { token0: priceNow0, token1: priceNow1 },
        symbol: `${shape.token0.symbol}/${shape.token1.symbol}`,
        inRange: false,
        tickLower: shape.tickLower ?? 0,
        tickUpper: shape.tickUpper ?? 0,
        currentTick: shape.tickLower ?? 0,
        liquidity: '0',
        currentAmounts: null,
        feesUnclaimed: { token0: 0, token1: 0, usd: 0 },
      }, {
        staked: false,
        gaugeAddress: shape.gaugeAddress || undefined,
        nfpmAddress: item.nfpm,
        heldVia: item.owner ? 'vfat' : 'wallet',
        heldBy: item.owner || null,
        events: history.events,
        openedAt: history.openedAt,
        closed: true,
        confidence: history.confidence,
        notes: [
          ...history.notes,
          'This position was closed and its NFT burned. Rebuilt from its onchain events.',
        ],
      });
      return position;   // P&L waits for the claim dedupe pass below.
    }
  }

  // A gauge emits ClaimRewards indexed by the wallet, not by the position, so
  // every position in that pool sees every claim the wallet made there. Valuing
  // each of them would invent money that was only ever paid once. Each claim is
  // attributed to the earliest position that was still open when it happened,
  // and removed from the rest. Which one gets it does not change a lifetime
  // total; counting it twice would.
  dedupeClaimEvents(positions);

  for (const position of positions) {
    if (position.events?.length > 0 && !position.pnl) {
      position.pnl = computePositionPnl(position);
      position.strategies = compareStrategies(position);
    }
  }

  mark('burnedRebuild');

  // 6. Aerodrome's Basic pools. No NFT, so none of the passes above can see them:
  //    being in one means holding the pool's own ERC-20. Half of Aerodrome lives
  //    here and skipping it made "every position you have ever opened" false.
  let ammUnavailable = false;
  try {
    const amm = await getAmmPositions(wallet);
    ammUnavailable = amm.unavailable;
    trace('ammChecked', { candidates: amm.checked, found: amm.positions.length });

    const aeroPrice = amm.positions.some((x) => x.staked)
      ? await fetchTokenPrice(CHAIN, BASE_TOKENS.AERO).catch(() => null)
      : null;

    for (const raw of amm.positions) {
      const pendingAero = raw.pendingRewardsRaw && raw.pendingRewardsRaw !== '0'
        ? Number(ethers.utils.formatUnits(raw.pendingRewardsRaw, 18))
        : 0;
      positions.push({
        ...raw,
        tokenId: raw.poolAddress,
        tickLower: 0, tickUpper: 0, currentTick: 0,
        priceLower: 0, priceUpper: 0, currentPrice: 0,
        liquidity: raw.shares,
        incentivesPending: pendingAero > 0
          ? { amount: pendingAero, usd: aeroPrice ? pendingAero * aeroPrice : 0 }
          : null,
        openedAt: null,
        events: [],
        pnl: null,
        strategies: null,
        // Live state is exact; the history that would give this position a P&L
        // is not reconstructed yet, and the position says so rather than
        // appearing beside NFT positions as though it were equally measured.
        confidence: 'partial',
        notes: ['Basic pool. Its current value is exact; its history is not reconstructed yet, so it has no P&L.'],
      });
    }
  } catch (err) {
    ammUnavailable = true;
    trace('ammFailed', String(err?.message || err).slice(0, 160));
  }
  if (ammUnavailable) {
    warnings.push('We could not check this wallet for Aerodrome Basic pool positions, so some liquidity may be missing.');
  }

  /** What the all time figures could not see. Stated, never rounded away. */
  const historyGap = {
    burnedFound: burned.length,
    burnedRebuilt,
    burnedMissed: Math.max(burned.length - burnedRebuilt, 0),
    /** True when we could not search this wallet's whole history, so the set of
     *  positions found is a floor rather than the answer. */
    discoveryIncomplete,
    deep,
  };
  if (discoveryIncomplete) {
    warnings.push(
      'We could not search this wallet\'s full history on Base, so there may be positions we never saw.',
    );
  }
  if (historyGap.burnedMissed > 0) {
    // "Could not be rebuilt" claims an attempt. On a shallow build there was
    // none: the rebuild only runs when the caller asks for the deep one, which
    // is most page loads. Saying we tried and failed, when we never tried,
    // misdescribes our own coverage in the one sentence meant to describe it.
    const noun = historyGap.burnedMissed === 1 ? 'position' : 'positions';
    warnings.push(
      historyGap.deep
        ? `${historyGap.burnedMissed} closed ${noun} could not be rebuilt, `
          + 'so the all time figures below cover less than this wallet has actually done.'
        : `${historyGap.burnedMissed} closed ${noun} are not loaded on this view, `
          + 'so the all time figures below cover less than this wallet has actually done.',
    );
  }
  const open = positions.filter((p) => !p.closed);

  const lpValueUsd = open.reduce((a, p) => a + (p.valueUsd || 0), 0);
  const feesTotalUsd = open.reduce((a, p) => a + (p.feesUnclaimed.usd || 0), 0);
  const incentivesTotalUsd = positions.reduce((a, p) => a + (p.incentivesPending?.usd || 0), 0);

  // Two aggregations, kept apart on purpose. A position closed a year ago is
  // real history and belongs in the total, but it must not describe what the
  // wallet is doing today.
  const rollup = (subset) => ({
    positions: subset.length,
    valueUsd: subset.reduce((a, p) => a + (p.valueUsd || 0), 0),
    netPnlUsd: subset.reduce((a, p) => a + (p.pnl?.netPnlUsd || 0), 0),
    lpVsHodlUsd: subset.reduce((a, p) => a + (p.pnl?.lpVsHodlUsd || 0), 0),
    feesUsd: subset.reduce((a, p) => a + (p.feesUnclaimed?.usd || 0)
      + (p.pnl?.feesClaimedUsd || 0), 0),
    incentivesUsd: subset.reduce((a, p) => a + (p.incentivesPending?.usd || 0)
      + (p.pnl?.incentivesClaimedUsd || 0), 0),
  });

  const withPnl = positions.filter((p) => p.pnl);
  const openRollup = rollup(open);

  // Wallet level facts for the History view. "Open" here means capital is still
  // deposited, in range or not; a position out of range is still your money.
  const openedAts = positions.map((p) => p.openedAt).filter(Boolean);
  const firstPositionAt = openedAts.length ? Math.min(...openedAts) : null;
  const lifetime = {
    positionsOpened: positions.length,
    positionsClosed: positions.filter((p) => p.closed).length,
    feesClaimedUsd: positions.reduce((a, p) => a + (p.pnl?.feesClaimedUsd || 0), 0),
    feesUnclaimedUsd: positions.reduce((a, p) => a + (p.feesUnclaimed?.usd || 0), 0),
    incentivesClaimedUsd: positions.reduce((a, p) => a + (p.pnl?.incentivesClaimedUsd || 0), 0),
    incentivesPendingUsd: positions.reduce((a, p) => a + (p.incentivesPending?.usd || 0), 0),
    gasUsd: positions.reduce((a, p) => a + (p.pnl?.gasUsd || 0), 0),
    netPnlUsd: 0,
    lpVsHodlUsd: 0,
    firstPositionAt,
    daysActive: firstPositionAt ? (Math.floor(Date.now() / 1000) - firstPositionAt) / 86400 : 0,
    // What these totals are made of. Without it "all time" is a claim we cannot
    // keep: the oldest position we could rebuild is not necessarily the wallet's
    // first, and a figure that quietly omits half a history is worse than none.
    coverage: {
      positionsRebuiltFromBurnedNfts: historyGap.burnedRebuilt,
      positionsNotReconstructed: historyGap.burnedMissed,
      complete: historyGap.burnedMissed === 0 && historyGap.deep,
      historyLoaded: historyGap.deep,
    },
  };
  const allTimeRollup = rollup(positions);
  const lpNetPnlUsd = allTimeRollup.netPnlUsd;
  const lpVsHodlUsd = allTimeRollup.lpVsHodlUsd;
  lifetime.netPnlUsd = lpNetPnlUsd;
  lifetime.lpVsHodlUsd = lpVsHodlUsd;

  // Wallet balances, tokenized stocks and lending. Without these, exposure
  // describes only the deployed half of the wallet and reads as if the rest
  // did not exist.
  const positionTokens = positions.flatMap((p) => [p.token0.address, p.token1.address]);
  const [tokenResult, stockResult, lendingResult] = await Promise.allSettled([
    getTokenHoldings(wallet, positionTokens),
    getStockHoldings(wallet),
    getLendingPositions(wallet),
  ]);

  const plainTokens = tokenResult.status === 'fulfilled' ? tokenResult.value : [];
  if (tokenResult.status !== 'fulfilled') {
    warnings.push('Wallet token balances could not be read, so this total is missing whatever is sitting in the wallet.');
    trace('tokenBalancesFailed', String(tokenResult.reason?.message || tokenResult.reason).slice(0, 200));
  }

  const stocks = stockResult.status === 'fulfilled' ? stockResult.value.holdings : [];
  if (stockResult.status === 'fulfilled') warnings.push(...stockResult.value.notes);
  else warnings.push('Tokenized stock balances could not be read.');

  const lending = lendingResult.status === 'fulfilled' ? lendingResult.value.positions : [];
  // Which protocols were actually asked. A wallet borrowing somewhere we do not
  // look would otherwise read as a wallet with no debt, so this travels with the
  // figures rather than being implied by their absence.
  const lendingCoverage = lendingResult.status === 'fulfilled'
    ? lendingResult.value.coverage
    : { checked: [], notCovered: LENDING_COVERAGE.notCovered, failed: LENDING_COVERAGE.checked };
  if (lendingResult.status === 'fulfilled') {
    warnings.push(...lendingResult.value.notes);
    if (lendingResult.value.transportErrors?.length) {
      trace('lendingTransportErrors', lendingResult.value.transportErrors);
    }
  }
  else warnings.push('Lending positions could not be read, so any borrowing is missing from this portfolio.');

  // A tokenized stock held directly must not also appear as a plain token.
  const stockAddresses = new Set(stocks.map((h) => h.token.address));
  const tokens = [...plainTokens.filter((h) => !stockAddresses.has(h.token.address)), ...stocks];

  const exposure = computeExposure(positions, tokens, lending);
  const scenarios = computeScenarios(positions, tokens);
  const holdings = computeHoldings(positions, tokens, lending);

  const stakedCount = positions.filter((p) => p.staked).length;
  const closedCount = positions.length - open.length;

  const stocksValueUsd = stocks.reduce((a, h) => a + (h.valueUsd || 0), 0);
  const tokensValueUsd = plainTokens.reduce((a, h) => a + (h.valueUsd || 0), 0);
  const lendingNetUsd = lending.reduce((a, l) => a + (l.netValueUsd || 0), 0);

  const summary = {
    totalValueUsd: lpValueUsd + tokensValueUsd + stocksValueUsd + lendingNetUsd,
    lpValueUsd,
    tokensValueUsd,
    stocksValueUsd,
    lendingNetUsd,
    lpNetPnlUsd,
    lpVsHodlUsd,
    feesTotalUsd,
    incentivesTotalUsd,
    open: openRollup,
    allTime: allTimeRollup,
    lifetime,
    headline: '',
    historyHeadline: null,
    confidence: positions.length && positions.every((p) => p.confidence === 'full') ? 'full' : 'partial',
  };

  // The engine writes the sentences, not the UI. The headline is about what is
  // still deployed; the history line only appears when there is history.
  const openHasPnl = open.some((p) => p.pnl);
  if (openHasPnl) {
    summary.headline = headlineFor({
      lpVsHodlUsd: openRollup.lpVsHodlUsd,
      lpNetPnlUsd: openRollup.netPnlUsd,
      lpValueUsd: openRollup.valueUsd,
    });
  } else {
    const parts = [];
    if (open.length) parts.push(`${open.length} open ${open.length === 1 ? 'position' : 'positions'} worth $${lpValueUsd.toFixed(2)}`);
    if (stakedCount) parts.push(`${stakedCount} staked in a gauge`);
    if (closedCount) parts.push(`${closedCount} closed`);
    summary.headline = parts.length ? parts.join(', ') : 'No liquidity positions found on Base';
  }

  if (closedCount > 0 && withPnl.length > 0) {
    const opener = historyGap.burnedMissed > 0
      ? 'Across the positions we could rebuild:'
      : 'Since you started:';
    summary.historyHeadline = `${opener} ${headlineFor({
      lpVsHodlUsd: allTimeRollup.lpVsHodlUsd,
      lpNetPnlUsd: allTimeRollup.netPnlUsd,
      lpValueUsd: allTimeRollup.valueUsd,
    }).replace(/^You /, 'you ')}`;
  }

  const draft = {
    address: wallet,
    chain: CHAIN,
    generatedAt: Math.floor(Date.now() / 1000),
    summary,
    positions,
    tokens,
    lending,
    lendingCoverage,
    exposure,
    holdings,
    scenarios,
    historyGap,
    warnings,
    ...(diag ? { diagnostics: diag } : {}),
  };

  // Observations depend on the finished object, so they come last.
  draft.observations = observe(draft);
  mark('total');
  return draft;
}
