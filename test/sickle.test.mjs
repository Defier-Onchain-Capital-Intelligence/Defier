/**
 * The vfat resolver, on the distinction that decides whether it is useful.
 *
 * sickles() and predict() return the same address for a user who has one, and
 * that similarity is the trap: predict() returns an address for everybody,
 * because the clone is deterministic and its address is a fact before the
 * contract exists. A resolver built on predict() would report that every wallet
 * on Base farms through vfat.
 *
 * Verified on chain 11 Sep 2026: sickles() answered zero for three wallets that
 * have never used vfat and a real address for one that has, while predict()
 * answered a non-zero address for all four.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/core/sickle.js'), 'utf8');

test('the resolver asks sickles(), never predict()', () => {
  assert.match(source, /function sickles\(address owner\)/, 'sickles must be in the ABI');
  assert.ok(
    !/factory\.predict\(|'predict'|"predict"/.test(source),
    'predict() must never be called: it answers for wallets that have no Sickle',
  );
});

test('a predecessor factory is still asked, in case one ever exists', () => {
  assert.match(source, /previousFactory/, 'the older factory has to be asked too');
});

test('the verified factory and its implementation are pinned together', () => {
  // The address alone proves nothing. What made it the right factory is that it
  // answers implementation() with the contract the vfat docs name, so both
  // travel together and a wrong address can be caught by asking.
  assert.match(source, /0x71D234A3e1dfC161cc1d081E6496e76627baAc31/);
  assert.match(source, /0xfff75d099baee29f447866bc5299cd67c04761c8/i);
});

test('resolution never throws, because vfat coverage is additive', () => {
  assert.match(source, /catch\s*\(_\)/, 'a failed lookup must not break the portfolio');
});
