/**
 * The public contract, tested where it is most dangerous.
 *
 * An agent quotes what it is given. If this mapper ever hands out a total while
 * saying "all time" over a wallet we only partly measured, a model will state
 * that with confidence and nobody downstream can tell it is wrong. The screens
 * have a reader who might notice; an API does not.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { toWalletV1, SCHEMA_VERSION } from '../src/lib/agentApi.ts';

const lifetime = (over = {}) => ({
  positionsOpened: 4, positionsClosed: 2, positionsOpen: 2,
  capitalDeployedUsd: 9569, daysProviding: 92, daysSinceFirst: 348,
  firstPositionAt: 1758672000, averagePositionDays: 25,
  feesClaimedUsd: 0.55, feesUnclaimedUsd: 0,
  rewardsClaimedUsd: 26.07, rewardsPendingUsd: 0,
  earnedUsd: 26.62, gasUsd: 0.09,
  feesByToken: [], rewardsByToken: [],
  impermanentLossUsd: 0, divergenceGainUsd: 2839, divergenceUsd: 2839,
  feesCoverIl: null, netPnlUsd: -322, vsHoldingUsd: 2865,
  beatHoldCount: 3, beatHoldPct: 75,
  best: null, worst: null, pairs: [],
  coverage: {
    positionsRebuiltFromBurnedNfts: 1, positionsNotReconstructed: 0,
    positionsExcluded: 0, excluded: [], searchIncomplete: false,
    complete: true, historyLoaded: true, concentrated: null,
    ...(over.coverage || {}),
  },
  ...over,
});

test('a complete wallet may say all time', () => {
  const out = toWalletV1('0xabc', lifetime(), 1, null);
  assert.equal(out.schema, SCHEMA_VERSION);
  assert.equal(out.coverage.complete, true);
  assert.equal(out.coverage.scope, 'all time');
});

test('an incomplete wallet never says all time', () => {
  const out = toWalletV1('0xabc', lifetime({
    coverage: { complete: false, positionsExcluded: 1, excluded: [{ id: 'x', pair: 'WETH/AERO', reason: 'no prices' }] },
  }), 1, null);

  assert.equal(out.coverage.scope, 'partial');
  assert.equal(out.coverage.positionsExcluded, 1);
  assert.deepEqual(out.coverage.excluded, [{ pair: 'WETH/AERO', reason: 'no prices' }]);
  assert.match(out.coverage.notes.join(' '), /floor/, 'says the figures are a floor');
});

test('fees and emissions are never merged into one figure', () => {
  const out = toWalletV1('0xabc', lifetime(), 1, null);
  assert.equal(out.result.feesUsd, 0.55);
  assert.equal(out.result.emissionsUsd, 26.07);
  assert.equal(out.result.earnedUsd, 26.62);
  assert.ok(out.result.earnedUsd > out.result.feesUsd, 'earned is not the fee figure');
});

test('concentration travels with the headline', () => {
  const out = toWalletV1('0xabc', lifetime({
    coverage: { concentrated: { pair: 'WETH/cbBTC', sharePct: 97.7 } },
  }), 1, null);
  assert.deepEqual(out.coverage.concentratedIn, { pair: 'WETH/cbBTC', sharePct: 97.7 });
});

test('basic pools are always declared as excluded from the totals', () => {
  const out = toWalletV1('0xabc', lifetime(), 1, null);
  assert.match(out.coverage.notes.join(' '), /Basic .* not reconstructed|not in these totals/);
});
