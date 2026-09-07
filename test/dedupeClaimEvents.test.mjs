/**
 * The claim dedupe pass, tested without a chain.
 *
 * This is the riskiest few lines in the engine. A CL gauge emits
 * ClaimRewards(from, amount) indexed by the wallet rather than by the token id,
 * so once every position scans its pool's gauge, two positions in the same pool
 * both find the same claim. Getting this wrong does not produce a crash or a
 * blank: it produces a number, and the number is money that was paid once and
 * reported twice. That is exactly the failure this product exists to not have,
 * and it cannot be caught by looking at a screen.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeClaimEvents } from '../src/core/portfolio.js';

const claim = ({ gauge = '0xg1', txHash = '0xtx1', logIndex = 0, rewardAmount = 10 }) => ({
  type: 'claim_rewards', gauge, txHash, logIndex, rewardAmount,
});

const claimsIn = (position) => position.events.filter((e) => e.type === 'claim_rewards');
const totalRewards = (positions) =>
  positions.flatMap(claimsIn).reduce((a, e) => a + e.rewardAmount, 0);

test('the same claim seen by two positions is counted once', () => {
  const shared = { gauge: '0xg1', txHash: '0xtx1', logIndex: 3, rewardAmount: 16.15 };
  const positions = [
    { openedAt: 200, events: [claim(shared)] },
    { openedAt: 100, events: [claim(shared)] },
  ];

  dedupeClaimEvents(positions);

  assert.equal(totalRewards(positions), 16.15, 'the wallet was paid once');
  assert.equal(claimsIn(positions[1]).length, 1, 'kept on the earlier position');
  assert.equal(claimsIn(positions[0]).length, 0, 'dropped from the later one');
});

test('two claims in one transaction are two claims', () => {
  // One getReward call can settle two positions: same tx, different log.
  const positions = [
    { openedAt: 100, events: [claim({ logIndex: 3, rewardAmount: 5 }), claim({ logIndex: 4, rewardAmount: 7 })] },
  ];

  dedupeClaimEvents(positions);

  assert.equal(totalRewards(positions), 12);
});

test('the same transaction in two gauges is two claims', () => {
  const positions = [
    { openedAt: 100, events: [claim({ gauge: '0xg1', rewardAmount: 5 })] },
    { openedAt: 150, events: [claim({ gauge: '0xg2', rewardAmount: 7 })] },
  ];

  dedupeClaimEvents(positions);

  assert.equal(totalRewards(positions), 12);
});

test('nothing but claims is touched', () => {
  const positions = [
    { openedAt: 100, events: [{ type: 'mint', txHash: '0xtx1' }, claim({})] },
    { openedAt: 200, events: [{ type: 'collect', txHash: '0xtx1' }, claim({})] },
  ];

  dedupeClaimEvents(positions);

  assert.equal(positions[0].events.length, 2);
  assert.equal(positions[1].events.length, 1, 'the duplicate claim went, the collect stayed');
  assert.equal(positions[1].events[0].type, 'collect');
});

test('a position with no events does not break the pass', () => {
  const positions = [
    { openedAt: 100, events: [] },
    { openedAt: null },
    { openedAt: 200, events: [claim({ rewardAmount: 3 })] },
  ];

  assert.doesNotThrow(() => dedupeClaimEvents(positions));
  assert.equal(totalRewards(positions.filter((p) => p.events)), 3);
});

test('every unique claim survives and no claim is invented', () => {
  const unique = [
    { gauge: '0xg1', txHash: '0xa', logIndex: 0, rewardAmount: 1 },
    { gauge: '0xg1', txHash: '0xa', logIndex: 1, rewardAmount: 2 },
    { gauge: '0xg2', txHash: '0xa', logIndex: 0, rewardAmount: 4 },
    { gauge: '0xg1', txHash: '0xb', logIndex: 0, rewardAmount: 8 },
  ];
  // Three positions that all saw all four claims.
  const positions = [300, 100, 200].map((openedAt) => ({
    openedAt, events: unique.map(claim),
  }));

  dedupeClaimEvents(positions);

  assert.equal(totalRewards(positions), 15, 'the sum of the distinct claims, once each');
  assert.equal(positions.flatMap(claimsIn).length, 4);
});
