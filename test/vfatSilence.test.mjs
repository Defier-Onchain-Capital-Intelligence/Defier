/**
 * A vfat user's money is staked BY the Sickle, not held by it.
 *
 * That makes one call — getStakedTokenIds(sickle) — the place where nearly all
 * of their capital is found, and it used to be written `.catch(() => [])`.
 * When it failed, the wallet was shown its lending and its loose tokens and
 * nothing else, with no warning beside the total.
 *
 * Observed in production on a cold instance, on a real wallet: $655,303 on one
 * request and $59,064 on the next, because $596,244 of liquidity quietly was
 * not there. Nothing on the screen said anything had failed. It is the same
 * failure as the morning's $0.00 — a number produced by silence — in the one
 * pass that carries the most money.
 *
 * The wallet's OWN staked scan had always warned on failure. Only the Sickle's
 * did not, which is the half that matters more.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/core/portfolio.js', import.meta.url), 'utf8');

/** The body of the vfat pass, where the Sickle is read. */
const vfatPass = src.slice(src.indexOf('// 3b. Positions held through vfat'), src.indexOf("mark('vfat')"));

test('the Sickle staked scan warns instead of returning an empty list', () => {
  assert.ok(!/getStakedTokenIds\(sickle[^]*?\.catch\(\(\) => \[\]\)/.test(vfatPass),
    'a swallowed failure here reads as "this wallet has no staked positions"');
  const at = vfatPass.indexOf('getStakedTokenIds(sickle');
  const around = vfatPass.slice(Math.max(0, at - 400), at + 600);
  assert.match(around, /catch \(err\)/, 'the failure has to be caught by name to be reported');
  assert.match(around, /warnings\.push\(/, 'and it has to reach the screen');
  assert.match(around, /staked through vfat could not be read/);
});

test('both staked scans are now symmetric', () => {
  // The wallet's own scan and the Sickle's are the same operation one level in.
  // One of them warning and the other not is how this went unnoticed.
  for (const subject of ['getStakedTokenIds(wallet', 'getStakedTokenIds(sickle']) {
    const at = src.indexOf(subject);
    assert.ok(at > 0, `expected ${subject}`);
    const around = src.slice(Math.max(0, at - 500), at + 700);
    assert.match(around, /warnings\.push\(/,
      `${subject} must report its own failure`);
  }
});

test('an unsearchable venue marks discovery incomplete rather than empty', () => {
  const at = vfatPass.indexOf('getWalletTokenIdsFromLogs(sickle');
  assert.ok(at > 0);
  const around = vfatPass.slice(at, at + 700);
  assert.match(around, /discoveryIncomplete = true/,
    'not being able to search is not the same as finding nothing');
  assert.ok(!/getWalletTokenIdsFromLogs\(sickle[^)]*\)\.catch\(\(\) => \[\]\)/.test(vfatPass));
});

test('the only bare catch left is the unhandled-rejection guard', () => {
  // One `.catch(() => [])` is legitimate and must stay: the ever-owned scan is
  // started early and awaited much later, and a promise that rejects in
  // between takes the process down. That guard discards nothing — each source
  // inside it already reports its own failure — so it is the one exception,
  // and it is named here so a future one cannot hide behind it.
  const code = vfatPass.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const swallows = code.match(/\.catch\(\(\) => \[\]\)/g) || [];
  assert.equal(swallows.length, 1,
    `expected only the rejection guard, found ${swallows.length} bare catches`);
  assert.match(code, /vfatEverOwnedPromise\.catch\(\(\) => \[\]\)/);
});

test('the numbers that exposed it are written down', () => {
  assert.match(src, /596,244/, 'the amount that vanished is the reason this comment exists');
});
