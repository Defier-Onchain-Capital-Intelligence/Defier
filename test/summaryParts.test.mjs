/**
 * A netted total hides the shape of a leveraged wallet.
 *
 * $265,000 posted as collateral against $191,000 borrowed nets to $74,000.
 * Read alone, that is indistinguishable from a $74,000 wallet holding cash —
 * and only one of the two can be liquidated. The summary now names the three
 * parts, and this file holds the arithmetic that ties them together, because
 * three figures that do not reconcile are worse than one that hides things.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/core/portfolio.js', import.meta.url), 'utf8');

/** The summary arithmetic, lifted exactly as portfolio.js computes it. */
function parts({ lp = 0, tokens = 0, stocks = 0, supplied = 0, debt = 0 }) {
  const assetsUsd = lp + tokens + stocks + supplied;
  const debtUsd = debt;
  const netUsd = assetsUsd - debtUsd;
  const lendingNetUsd = supplied - debt;
  const totalValueUsd = lp + tokens + stocks + lendingNetUsd;
  return { assetsUsd, debtUsd, netUsd, totalValueUsd };
}

test('net equals the old total, so nothing reported has changed', () => {
  const cases = [
    { lp: 1_077_466, tokens: 10_412, stocks: 0, supplied: 265_597, debt: 191_487 },
    { lp: 0, tokens: 0, stocks: 0, supplied: 0, debt: 0 },
    { lp: 500, tokens: 0, stocks: 0, supplied: 4_268.72, debt: 1_529.88 },
    { lp: 0, tokens: 100, stocks: 50, supplied: 0, debt: 0 },
  ];
  for (const c of cases) {
    const p = parts(c);
    assert.ok(Math.abs(p.netUsd - p.totalValueUsd) < 1e-9,
      `net ${p.netUsd} must equal total ${p.totalValueUsd}`);
  }
});

test('collateral counts as an asset, because it is still owned', () => {
  const p = parts({ supplied: 265_597, debt: 191_487 });
  assert.equal(p.assetsUsd, 265_597, 'a lien is not a sale');
  assert.equal(p.debtUsd, 191_487);
  assert.equal(p.netUsd, 74_110);
});

test('the leveraged wallet is no longer indistinguishable from the small one', () => {
  const leveraged = parts({ supplied: 265_597, debt: 191_487 });
  const cash = parts({ tokens: 74_110 });
  assert.equal(leveraged.netUsd, cash.netUsd, 'the netted figure is the same...');
  assert.notEqual(leveraged.assetsUsd, cash.assetsUsd, '...and that was the whole problem');
  assert.notEqual(leveraged.debtUsd, cash.debtUsd);
});

test('a wallet with no debt reports the same three ways', () => {
  const p = parts({ lp: 1_000, tokens: 250 });
  assert.equal(p.assetsUsd, 1_250);
  assert.equal(p.debtUsd, 0);
  assert.equal(p.netUsd, p.assetsUsd);
  assert.equal(p.netUsd, p.totalValueUsd);
});

test('the engine computes it the way this file assumes', () => {
  assert.match(src, /assetsUsd: lpValueUsd \+ tokensValueUsd \+ stocksValueUsd \+ lendingSuppliedUsd/);
  assert.match(src, /debtUsd: lendingDebtUsd/);
  assert.match(src, /netUsd: lpValueUsd \+ tokensValueUsd \+ stocksValueUsd \+ lendingSuppliedUsd - lendingDebtUsd/);
  // And the old field is untouched: this adds names, it does not restate anything.
  assert.match(src, /totalValueUsd: lpValueUsd \+ tokensValueUsd \+ stocksValueUsd \+ lendingNetUsd/);
});
