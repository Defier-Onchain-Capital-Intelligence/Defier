/**
 * A round that will not finish must not be started.
 *
 * The shipped cap was 20 reconstructions. Measured on a real wallet, twenty do
 * not fit in the route's sixty seconds at any concurrency that works — so the
 * request 504'd, and a 504 returns nothing at all. Every position rebuilt in
 * the rounds before the timeout was thrown away with it. A wallet that could
 * have shown six rebuilt positions showed an error instead.
 *
 * The fix is a deadline rather than a count, and the rule that makes the
 * deadline worth having: stop BEFORE a round that cannot finish, because a
 * round started with eight seconds left does not produce a partial answer.
 *
 * This file tests that decision in isolation, without the chain: the loop is
 * replayed here against a fake clock and fake round costs.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** The scheduling decision, extracted exactly as portfolio.js makes it. */
function planRounds({ items, concurrency, deadlineMs, elapsedMs, roundCostPrior, actualRoundCost }) {
  let now = elapsedMs;
  let roundCost = roundCostPrior;
  let index = 0;
  const rounds = [];
  let stoppedForTime = false;
  while (index < items) {
    const remaining = deadlineMs - now;
    if (remaining < roundCost) { stoppedForTime = true; break; }
    const size = Math.min(concurrency, items - index);
    const cost = actualRoundCost(size);
    rounds.push({ size, cost });
    now += cost;
    roundCost = cost;
    index += size;
  }
  return { rounds, done: index, stoppedForTime, finishedAt: now };
}

// Measured in production: one round of six costs about 32 s.
const measured = () => 32_100;

test('the build never starts a round it cannot finish', () => {
  const plan = planRounds({
    items: 25, concurrency: 6, deadlineMs: 50_000,
    elapsedMs: 8_000, roundCostPrior: 33_000, actualRoundCost: measured,
  });
  assert.equal(plan.done, 6, 'one round fits, a second does not');
  assert.ok(plan.stoppedForTime, 'and it must say it stopped for time');
  assert.ok(plan.finishedAt < 60_000, `finished at ${plan.finishedAt}ms, the route has 60s`);
});

test('a cold start eats the budget and the build gives up rather than 504', () => {
  // The slowest base observed was 17.1 s on a cold instance.
  const plan = planRounds({
    items: 25, concurrency: 6, deadlineMs: 50_000,
    elapsedMs: 17_100, roundCostPrior: 33_000, actualRoundCost: measured,
  });
  assert.ok(plan.finishedAt < 60_000, `finished at ${plan.finishedAt}ms`);
  assert.ok(plan.done <= 6);
});

test('cheap reconstructions get more rounds, without changing a constant', () => {
  // The whole reason the estimate is re-measured each round: a wallet whose
  // positions are cheap to rebuild should not be held to another wallet's cost.
  const plan = planRounds({
    items: 25, concurrency: 6, deadlineMs: 50_000,
    elapsedMs: 5_000, roundCostPrior: 33_000, actualRoundCost: () => 4_000,
  });
  assert.ok(plan.done > 6, `expected more than one round on a cheap wallet, got ${plan.done}`);
  assert.ok(plan.finishedAt <= 50_000 + 4_000);
});

test('an expensive first round stops the second, even though the prior was optimistic', () => {
  const plan = planRounds({
    items: 25, concurrency: 6, deadlineMs: 50_000,
    elapsedMs: 2_000, roundCostPrior: 10_000, actualRoundCost: () => 40_000,
  });
  assert.equal(plan.done, 6, 'the real cost replaces the prior after round one');
  assert.ok(plan.stoppedForTime);
  assert.ok(plan.finishedAt < 60_000);
});

test('nothing is attempted when the deadline has already passed', () => {
  const plan = planRounds({
    items: 25, concurrency: 6, deadlineMs: 50_000,
    elapsedMs: 55_000, roundCostPrior: 33_000, actualRoundCost: measured,
  });
  assert.equal(plan.done, 0);
  assert.ok(plan.stoppedForTime);
});

test('the shipped numbers are the measured ones', () => {
  const src = read('../src/core/portfolio.js');
  assert.match(src, /const REBUILD_CONCURRENCY = 6;/,
    'throughput peaked between four and six; ten never returned');
  assert.match(src, /const REBUILD_CAP = 6;/,
    'six is one round, measured at 32.1s, against a 60s limit');
  assert.match(src, /const REBUILD_DEADLINE_MS = 50_000;/);
  assert.ok(!/burned\.slice\(0, 20\)/.test(src),
    'the cap of 20 is what made the request time out and lose everything');
});

test('running out of time is reported as that, not as a failure to rebuild', () => {
  const src = read('../src/core/portfolio.js');
  assert.match(src, /rebuildStoppedForTime/);
  assert.match(src, /there was not enough time to read them all/,
    'blaming the chain for our own budget misdescribes our coverage');
});
