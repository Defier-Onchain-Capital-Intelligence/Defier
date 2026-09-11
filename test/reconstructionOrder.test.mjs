/**
 * Which twenty five get rebuilt, when a wallet has more than twenty five.
 *
 * The budget exists because each reconstruction is several chunked log scans
 * and the route has sixty seconds. The bug was not the budget, it was the
 * order: discovery returns oldest first, so slicing it kept a heavy wallet's
 * twenty five OLDEST positions and dropped everything from this year.
 *
 * Found on a real vfat wallet reporting positionsNotReconstructed: 25.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/core/portfolio.js'), 'utf8');

/** The helper, lifted out of the module so it can be exercised directly. */
const newestFirst = (() => {
  const start = source.indexOf('function newestFirst(items) {');
  const end = source.indexOf('\n}', start) + 2;
  assert.ok(start > -1, 'newestFirst must exist');
  return eval(`(${source.slice(start, end)})`);
})();

const item = (tokenId, nfpm = '0xaero') => ({ tokenId: String(tokenId), nfpm });

test('the newest positions come first', () => {
  const discovered = [item(10), item(11), item(500), item(12)]; // oldest first
  const out = newestFirst(discovered).map((i) => i.tokenId);
  assert.deepEqual(out, ['500', '12', '11', '10']);
});

test('a budget now keeps recent positions instead of ancient ones', () => {
  const discovered = Array.from({ length: 60 }, (_, i) => item(1000 + i));
  const kept = newestFirst(discovered).slice(0, 25).map((i) => Number(i.tokenId));
  assert.equal(Math.max(...kept), 1059, 'the most recent must be kept');
  assert.ok(Math.min(...kept) >= 1035, `kept down to ${Math.min(...kept)}, expected the top 25`);
});

test('one venue cannot crowd out another', () => {
  // Uniswap ids are far larger than a fresh Aerodrome deployment's. Sorting
  // them together would return only Uniswap.
  const discovered = [
    ...Array.from({ length: 30 }, (_, i) => item(900000 + i, '0xuni')),
    ...Array.from({ length: 30 }, (_, i) => item(10 + i, '0xaero')),
  ];
  const kept = newestFirst(discovered).slice(0, 25);
  const venues = new Set(kept.map((i) => i.nfpm));
  assert.equal(venues.size, 2, 'both venues must be represented');
});

test('nothing is lost, only reordered', () => {
  const discovered = [item(3), item(1, '0xuni'), item(2)];
  assert.equal(newestFirst(discovered).length, 3);
});

test('an unparseable id does not throw', () => {
  const out = newestFirst([item('abc'), item(5)]);
  assert.equal(out.length, 2);
});

test('the budget is a named constant with its reason written down', () => {
  assert.match(source, /RECONSTRUCTION_BUDGET = 25/);
  assert.match(source, /sixty seconds/, 'the reason for the number belongs next to it');
});
