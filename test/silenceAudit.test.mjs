/**
 * The audit of every place in core/ that turns a failure into a value.
 *
 * Three separate instances of one bug surfaced in a single day — a wallet at
 * $0.00, a Compound market reported as absent, $596,244 of liquidity gone —
 * and each had the same shape: a call failed, the failure became a value, and
 * the value looked exactly like an answer. That is not three bugs. It is one
 * habit, and thirty-odd places in core/ still have it.
 *
 * Not all of them are wrong. A price that cannot be fetched SHOULD become
 * null, as long as null then means "unpriced" somewhere a reader can see. The
 * distinction is not whether a failure is caught, it is whether the caught
 * failure can still be told apart from a real answer by the time it reaches a
 * number on a screen.
 *
 * This file records the verdict on the dangerous ones so the audit does not
 * have to be repeated from scratch, and fails if any of them regresses.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../src/core/${f}`, import.meta.url), 'utf8');
const history = read('history.js');
const portfolio = read('portfolio.js');
const pnl = read('pnl.js');
const stocks = read('stocks.js');

test('unclaimed rewards: unread is not zero', () => {
  // gauge.earned() failing used to return 0. That 0 is money the wallet is
  // owed and a term in net P&L, so it made the headline number quietly low.
  const fn = history.slice(history.indexOf('export async function getPendingRewards'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.ok(!/return raw \? parseFloat/.test(body),
    'the old form collapsed "could not ask" and "nothing owed" into the same 0');
  assert.match(body, /return null/, 'unread must be representable');
  assert.match(history, /null means unread, not zero/,
    'the contract has to be stated where the next reader will look');
});

test('an unread gauge degrades the position and its P&L', () => {
  assert.match(portfolio, /incentivesUnread = true/);
  assert.match(portfolio, /confidence: incentivesUnread \? 'partial' : history\.confidence/,
    'a position missing a term of its own P&L is not a full reading of it');
  assert.match(pnl, /incentivesPending\.usd == null/);
  assert.match(pnl, /degrade\('The gauge did not answer/,
    'the arithmetic has to use zero, so the number must stop claiming to be complete');
});

test('a failed or truncated event scan degrades instead of reading as "never happened"', () => {
  const at = history.indexOf('const scan = async (label');
  assert.ok(at > 0, 'scan must carry a label to be able to say which history failed');
  const body = history.slice(at, at + 1400);
  assert.match(body, /degrade\(`The \$\{label\} history could not be read/);
  assert.match(body, /report\.truncated/,
    'stopping at maxResults drops events from a total that still looks complete');
  // And every call site names itself, so the message is specific.
  for (const label of ['deposit', 'withdrawal', 'fee collection', 'transfer', 'reward claim']) {
    assert.ok(history.includes(`scan('${label}'`), `expected a scan labelled ${label}`);
  }
});

test('the gauge search still reports how much of itself ran', () => {
  // From the previous round; kept here so the whole audit lives in one file.
  assert.match(history, /report\.gaugesFailed = gaugesFailed \+ rejected/);
  assert.match(portfolio, /gauges could not be read/);
});

test('stocks is the pattern the rest were measured against', () => {
  // scaledBalanceOf returning null is caught, and a note explains what the
  // reader is looking at instead. Catching a failure is fine; hiding it is not.
  assert.match(stocks, /scaledBalance == null/);
  assert.match(stocks, /share equivalent unavailable, showing the raw token balance/,
    'the null has to become words before it becomes a number');
});

test('no money figure in the portfolio build falls back to a bare zero', () => {
  // `catch(() => 0)` on anything that reaches a total is the exact shape of
  // every bug this file exists to remember. Comparators and formatters may
  // return 0; reads of the chain may not.
  const suspicious = portfolio.match(/\.catch\(\(\) => 0\)/g) || [];
  assert.equal(suspicious.length, 0,
    `found ${suspicious.length} chain reads defaulting to zero in the build`);
});
