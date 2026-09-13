/**
 * Widening a round must change the timing and nothing else.
 *
 * Three discovery loops used to await one position before starting the next.
 * They are now batched, which is only safe because two things hold:
 *
 *   batchedRequests returns results in the order they were QUEUED, not the
 *   order they finish. `burned` is consumed newest first by the reconstruction
 *   budget, so a queue that came back reordered would silently change which
 *   closed positions a wallet gets to see.
 *
 *   The dedupe happens before any request goes out. `seen` is filled while
 *   building the queue, in order, so the SET of positions is identical whether
 *   the work runs one at a time or four at a time.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { batchedRequests } from '../src/core/providers.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('results come back in queue order, however long each one takes', async () => {
  const items = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  // Deliberately inverted: the first queued is the slowest to resolve.
  const results = await batchedRequests(items, async (n) => {
    await new Promise((r) => setTimeout(r, n * 6));
    return n;
  }, 4, 0);
  const got = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
  assert.deepEqual(got, items,
    'a reordered queue changes which closed positions the budget reaches');
});

test('a rejection does not shift the positions around it', async () => {
  const items = ['a', 'b', 'boom', 'd'];
  const results = await batchedRequests(items, async (x) => {
    if (x === 'boom') throw new Error('nope');
    return x;
  }, 2, 0);
  assert.equal(results.length, 4);
  assert.equal(results[0].value, 'a');
  assert.equal(results[1].value, 'b');
  assert.equal(results[2].status, 'rejected');
  assert.equal(results[3].value, 'd');
});

test('the dedupe still runs before any request goes out', () => {
  const src = read('../src/core/portfolio.js');
  // Each batched discovery loop builds its queue with `seen` first, then hands
  // the queue to batchedRequests. Filling `seen` inside the worker would let
  // two rounds claim the same token id.
  for (const queue of ['toEnrich', 'stakedToEnrich', 'unknownToEnrich', 'stakedQueue']) {
    const at = src.indexOf(`const ${queue} = [];`);
    assert.ok(at > 0, `expected the ${queue} queue`);
    const build = src.slice(at, src.indexOf('batchedRequests', at));
    assert.match(build, /seen\.add\(/,
      `${queue} must be deduped while it is built, not inside the worker`);
  }
});

test('the sequential awaits are gone from the discovery loops', () => {
  const src = read('../src/core/portfolio.js');
  // _enrichPosition inside a plain for loop is the shape being replaced.
  const loops = src.match(/for \([^)]*\) \{[^}]*await withTimeout\(\s*_enrichPosition/g) || [];
  assert.equal(loops.length, 0,
    `found ${loops.length} discovery loops still awaiting one position at a time`);
});

test('the ever-owned scan starts before it is needed', () => {
  const src = read('../src/core/portfolio.js');
  const started = src.indexOf('const vfatEverOwnedPromise');
  const awaited = src.indexOf('await vfatEverOwnedPromise');
  assert.ok(started > 0 && awaited > started,
    'the most expensive sub-phase depends only on the Sickle address, so it has no reason to wait');
  const between = src.slice(started, awaited);
  assert.match(between, /scanWalletPositions\(sickle/,
    'it should overlap the held scan, which is the point of starting it early');
  assert.match(src.slice(started, started + 900), /vfatEverOwnedPromise\.catch\(/,
    'a promise awaited later must not reject on its own timetable');
});
