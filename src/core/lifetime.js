/**
 * core/lifetime.js · Everything this wallet has ever done with liquidity. Pure.
 *
 * The report exists because of one number nobody can look up: what impermanent
 * loss has actually cost them. Every LP has heard the term, almost none know
 * their own figure, and the ones who quote a number are usually quoting a
 * calculator that assumed a single deposit at a single price.
 *
 * Ours is the sum of a per position calculation over reconstructed history:
 * every deposit valued the day it happened, every withdrawal the day it
 * happened. And it is reported next to what the fees earned, because
 * "impermanent loss cost you $3,000" is only half a sentence. The half that
 * matters is whether the fees covered it.
 *
 * Fees are broken out by the token they were actually paid in. A wallet that
 * earned in WETH and one that earned in a token now worth nothing did not have
 * the same year, and a dollar total hides that completely.
 */

const sum = (xs) => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

/** Merge overlapping [start, end] spans and total their length in days. */
function daysCovered(spans) {
  const valid = spans
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  if (!valid.length) return 0;

  let total = 0;
  let [current] = valid;
  current = { ...current };
  for (const span of valid.slice(1)) {
    if (span.start <= current.end) current.end = Math.max(current.end, span.end);
    else { total += current.end - current.start; current = { ...span }; }
  }
  total += current.end - current.start;
  return total / 86400;
}

function addToken(map, token, amount, usd) {
  if (!token?.address) return;
  if (!Number.isFinite(amount) && !Number.isFinite(usd)) return;
  const key = token.address.toLowerCase();
  const prev = map.get(key) || { address: key, symbol: token.symbol || '???', amount: 0, usd: 0 };
  prev.amount += Number.isFinite(amount) ? amount : 0;
  prev.usd += Number.isFinite(usd) ? usd : 0;
  map.set(key, prev);
}

const AERO = { address: '0x940181a94a35a4569e4529a3cdfb74e38fd98631', symbol: 'AERO' };

/**
 * @param {import('../types/portfolio').LpPosition[]} positions
 * @param {{ burnedMissed?: number, burnedRebuilt?: number, deep?: boolean }} coverage
 * @returns {import('../types/portfolio').LifetimeReport}
 */
export function computeLifetime(positions, coverage = {}) {
  const now = Math.floor(Date.now() / 1000);

  /**
   * The rule: a position only counts towards a total if we can stand behind its
   * numbers.
   *
   * A figure assembled from five good positions and two guesses is not a better
   * answer than a figure from five — it is the same answer with an unknown error
   * bar and a claim of completeness. Reporting "of your 7 positions I could
   * measure 5" is worth more than a total nobody can trust, and it is the only
   * version of this product worth shipping: the entire pitch is that we do the
   * arithmetic nobody else does, correctly.
   *
   * So: full confidence, a deposit we could value, and the invariant intact.
   * Everything else is counted, named, and kept out of the sums.
   */
  const reconstructed = (positions || []).filter((p) => p.pnl && p.events?.length);
  const measured = reconstructed.filter(
    (p) => p.pnl.confidence === 'full' && p.pnl.initialCapitalUsd > 0,
  );
  const unmeasured = reconstructed.filter((p) => !measured.includes(p));
  const withHistory = measured;

  const feesByToken = new Map();
  const rewardsByToken = new Map();
  const spans = [];
  let gasUsd = 0;

  for (const p of withHistory) {
    for (const e of p.events) {
      gasUsd += Number(e.gasUsd) || 0;
      if (e.type === 'collect') {
        // history.js already stripped returned principal out of these.
        addToken(feesByToken, p.token0, e.amount0, e.amount0Usd);
        addToken(feesByToken, p.token1, e.amount1, e.amount1Usd);
      }
      if (e.type === 'claim_rewards') {
        addToken(rewardsByToken, AERO, e.rewardAmount, e.rewardUsd);
      }
    }

    // Fees still sitting in an open position are earned, just not collected.
    if (!p.closed && p.feesUnclaimed) {
      addToken(feesByToken, p.token0, p.feesUnclaimed.token0, null);
      addToken(feesByToken, p.token1, p.feesUnclaimed.token1, null);
    }

    const opened = p.openedAt ?? p.events[0]?.timestamp ?? null;
    const lastEvent = p.events.reduce((a, e) => Math.max(a, e.timestamp || 0), 0);
    if (opened) spans.push({ start: opened, end: p.closed ? (lastEvent || opened) : now });
  }

  const openedAts = withHistory.map((p) => p.openedAt).filter(Boolean);
  const firstPositionAt = openedAts.length ? Math.min(...openedAts) : null;

  const capitalDeployedUsd = sum(withHistory.map((p) => p.pnl.initialCapitalUsd));
  const feesClaimedUsd = sum(withHistory.map((p) => p.pnl.feesClaimedUsd));
  const feesUnclaimedUsd = sum(withHistory.map((p) => p.pnl.feesUnclaimedUsd));
  const rewardsClaimedUsd = sum(withHistory.map((p) => p.pnl.incentivesClaimedUsd));
  const rewardsPendingUsd = sum(withHistory.map((p) => p.pnl.incentivesPendingUsd));
  const earnedUsd = feesClaimedUsd + feesUnclaimedUsd + rewardsClaimedUsd + rewardsPendingUsd;

  // The headline. Negative is the normal case and is what people mean by
  // impermanent loss: what concentrating liquidity cost against simply holding.
  const divergenceUsd = sum(withHistory.map((p) => p.pnl.divergenceUsd));
  const impermanentLossUsd = divergenceUsd < 0 ? -divergenceUsd : 0;
  /** Divergence can go the other way. A pool that converted into the side that
   *  fell less leaves you ahead of holding, and that is worth naming rather
   *  than reporting as "no impermanent loss" and moving on. */
  const divergenceGainUsd = divergenceUsd > 0 ? divergenceUsd : 0;

  const ranked = [...withHistory].sort(
    (a, b) => (b.pnl.lpVsHodlUsd ?? 0) - (a.pnl.lpVsHodlUsd ?? 0),
  );
  const beatHold = withHistory.filter((p) => (p.pnl.lpVsHodlUsd ?? 0) > 0).length;

  const byPair = new Map();
  for (const p of withHistory) {
    const prev = byPair.get(p.symbol) || { pair: p.symbol, positions: 0, capitalUsd: 0, vsHoldUsd: 0 };
    prev.positions += 1;
    prev.capitalUsd += p.pnl.initialCapitalUsd || 0;
    prev.vsHoldUsd += p.pnl.lpVsHodlUsd || 0;
    byPair.set(p.symbol, prev);
  }

  const tokenList = (map) => [...map.values()]
    .filter((t) => t.amount > 0 || t.usd > 0)
    .sort((a, b) => b.usd - a.usd);

  const daysProviding = daysCovered(spans);

  // A lifetime figure that rests almost entirely on one position is a fact about
  // that position, not about the wallet, and the screen should not imply otherwise.
  const capitals = withHistory.map((p) => Math.abs(p.pnl.initialCapitalUsd || 0));
  const totalCapital = capitals.reduce((a, b) => a + b, 0);
  const largestShare = totalCapital > 0 ? Math.max(...capitals, 0) / totalCapital : 0;
  const dominant = withHistory.length > 1 && largestShare >= 0.9
    ? ranked.find((p) => Math.abs(p.pnl.initialCapitalUsd || 0) === Math.max(...capitals))
    : null;

  return {
    positionsOpened: withHistory.length,
    positionsClosed: withHistory.filter((p) => p.closed).length,
    positionsOpen: withHistory.filter((p) => !p.closed).length,

    capitalDeployedUsd,
    /** Days with capital actually inside a pool, overlaps counted once. */
    daysProviding,
    daysSinceFirst: firstPositionAt ? (now - firstPositionAt) / 86400 : 0,
    firstPositionAt,
    averagePositionDays: withHistory.length
      ? sum(withHistory.map((p) => p.pnl.daysOpen)) / withHistory.length : 0,

    feesClaimedUsd,
    feesUnclaimedUsd,
    rewardsClaimedUsd,
    rewardsPendingUsd,
    earnedUsd,
    gasUsd,

    /** What the fees were actually paid in, not just what they were worth. */
    feesByToken: tokenList(feesByToken),
    rewardsByToken: tokenList(rewardsByToken),

    impermanentLossUsd,
    divergenceGainUsd,
    divergenceUsd,
    /** How many times over the fees covered the divergence. Null when there was none. */
    feesCoverIl: impermanentLossUsd > 0 ? earnedUsd / impermanentLossUsd : null,
    netPnlUsd: sum(withHistory.map((p) => p.pnl.netPnlUsd)),
    vsHoldingUsd: sum(withHistory.map((p) => p.pnl.lpVsHodlUsd)),

    beatHoldCount: beatHold,
    beatHoldPct: withHistory.length ? (beatHold / withHistory.length) * 100 : 0,
    best: ranked[0] ? {
      id: ranked[0].id, pair: ranked[0].symbol,
      vsHoldUsd: ranked[0].pnl.lpVsHodlUsd, daysOpen: ranked[0].pnl.daysOpen,
    } : null,
    worst: ranked.length > 1 ? {
      id: ranked[ranked.length - 1].id, pair: ranked[ranked.length - 1].symbol,
      vsHoldUsd: ranked[ranked.length - 1].pnl.lpVsHodlUsd,
      daysOpen: ranked[ranked.length - 1].pnl.daysOpen,
    } : null,

    pairs: [...byPair.values()].sort((a, b) => b.capitalUsd - a.capitalUsd).slice(0, 8),

    /** What this report could not see. It leads the screen, it does not hide. */
    coverage: {
      positionsRebuiltFromBurnedNfts: coverage.burnedRebuilt ?? 0,
      positionsNotReconstructed: coverage.burnedMissed ?? 0,
      /** Found and rebuilt, but with a gap we could not close. Named, never summed. */
      positionsExcluded: unmeasured.length,
      excluded: unmeasured.map((p) => ({
        id: p.id,
        pair: p.symbol,
        reason: p.pnl?.notes?.[0] || p.notes?.[0] || 'Something in this position could not be read.',
      })),
      /** True when the search itself could not cover this wallet's full range,
       *  so the set of positions below is a floor, not the answer. */
      searchIncomplete: coverage.discoveryIncomplete === true,
      complete: (coverage.burnedMissed ?? 0) === 0 && unmeasured.length === 0
        && coverage.discoveryIncomplete !== true && coverage.deep === true,
      historyLoaded: coverage.deep === true,
      /** Set when one position holds 90% or more of the capital these totals rest on. */
      concentrated: dominant
        ? { pair: dominant.symbol, sharePct: largestShare * 100 }
        : null,
    },
  };
}
