/**
 * The fix one level up was not enough, and that is the lesson worth keeping.
 *
 * Yesterday getStakedTokenIds(sickle) was wrapped in try/catch because a vfat
 * wallet had silently lost $596,244 of liquidity. The wrap was correct and it
 * would never have fired: getStakedTokenIds does not throw. Inside it, each
 * gauge was asked with `.catch(() => [])`, so a gauge that could not be
 * reached contributed nothing and the function returned normally, with a
 * shorter list and no sign that anything had gone wrong.
 *
 * A caller cannot tell "this wallet has nothing staked" from "we could not
 * ask" when both produce the same empty array. So the count of gauges that
 * failed now travels out with the result, and both callers warn on it.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const history = readFileSync(new URL('../src/core/history.js', import.meta.url), 'utf8');
const portfolio = readFileSync(new URL('../src/core/portfolio.js', import.meta.url), 'utf8');

test('a gauge that cannot be asked is counted, not skipped', () => {
  const at = history.indexOf('gc.stakedValues(wallet)');
  assert.ok(at > 0, 'expected the stakedValues call');
  const around = history.slice(Math.max(0, at - 700), at + 500);
  assert.ok(!/stakedValues\(wallet\), 6000\)\.catch\(\(\) => \[\]\)/.test(history),
    'a swallowed gauge is a position that quietly is not in the total');
  assert.match(around, /gaugesFailed \+= 1/);
  assert.match(around, /trace\('stakedValuesFailed'/);
});

test('the search reports how much of itself actually happened', () => {
  assert.match(history, /report\.gaugesChecked = gauges\.length/);
  assert.match(history, /report\.gaugesFailed = gaugesFailed \+ rejected/,
    'a rejected batch entry is an unread gauge too');
  assert.match(history, /getStakedTokenIds\(wallet, \{ extraTokens = \[\], diag = null, report = null \} = \{\}\)/,
    'the report has to be requestable, or callers cannot ask');
});

test('both callers warn when part of the search did not happen', () => {
  const calls = portfolio.match(/getStakedTokenIds\((wallet|sickle)/g) || [];
  assert.equal(calls.length, 2, 'the wallet and its Sickle');
  for (const subject of ['getStakedTokenIds(wallet', 'getStakedTokenIds(sickle']) {
    const at = portfolio.indexOf(subject);
    const around = portfolio.slice(at, at + 1200);
    assert.match(around, /gaugesFailed > 0/, `${subject} must check the report`);
    assert.match(around, /gauges could not be read/, `${subject} must say so on screen`);
  }
});

test('the warning names how many of how many, not just that something failed', () => {
  // "Some gauges could not be read" is not information. One of forty is a
  // rounding error; thirty of forty means the total on screen is fiction.
  assert.match(portfolio, /\$\{stakedReport\.gaugesFailed\} of \$\{stakedReport\.gaugesChecked\}/);
  assert.match(portfolio, /\$\{sickleReport\.gaugesFailed\} of \$\{sickleReport\.gaugesChecked\}/);
});

test('the try/catch from yesterday stays, because both can happen', () => {
  // The wrap catches a total failure of the search; the report catches a
  // partial one. Neither replaces the other.
  const at = portfolio.indexOf('getStakedTokenIds(sickle');
  const around = portfolio.slice(Math.max(0, at - 300), at + 900);
  assert.match(around, /catch \(err\)/);
  assert.match(around, /sickleReport\.gaugesFailed/);
});
