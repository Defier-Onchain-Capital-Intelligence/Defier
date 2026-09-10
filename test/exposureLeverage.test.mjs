/**
 * Exposure shares, when part of the wallet is borrowed.
 *
 * Debt is a negative entry, and dividing by the net total makes the
 * denominator smaller than the numbers going into it. A real wallet with
 * $488k of stablecoins against $307k of borrowed BTC and tokens came out of
 * the old code as 270.5% stablecoins, -129.4% BTC and "-170% at market risk".
 * Every one of those was arithmetically correct and none of them meant
 * anything, which is the failure this file is here to prevent coming back.
 *
 * The second test matters as much as the first: a wallet with no debt must
 * produce exactly what it always did, because gross and net are the same
 * number when nothing is negative.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeExposure } from '../src/core/exposure.js';

const token = (address, symbol, assetClass) => ({ address, symbol, assetClass });

const leveraged = () => computeExposure([], [], [{
  supplied: [{ token: token('0xusdc', 'USDC', 'STABLE'), valueUsd: 487715, isCollateral: true }],
  borrowed: [
    { token: token('0xcbbtc', 'cbBTC', 'BTC'), valueUsd: 233403 },
    { token: token('0xwell', 'WELL', 'OTHER'), valueUsd: 9445 },
    { token: token('0xmorpho', 'MORPHO', 'OTHER'), valueUsd: 64544 },
  ],
}]);

test('shares of a borrowing wallet add up to the whole wallet', () => {
  const e = leveraged();
  const total = e.byClass.reduce((a, c) => a + Math.abs(c.pct), 0);
  assert.ok(Math.abs(total - 100) < 0.01, `shares summed to ${total}, not 100`);
});

test('no share exceeds the wallet, and borrowed assets stay negative', () => {
  const e = leveraged();
  for (const c of e.byClass) {
    assert.ok(Math.abs(c.pct) <= 100.01, `${c.label} is ${c.pct}%, which is more than the whole wallet`);
  }
  const btc = e.byClass.find((c) => c.assetClass === 'BTC');
  assert.ok(btc.pct < 0, 'borrowed BTC should read as a negative share');
  assert.ok(e.leveraged, 'the wallet should be marked as carrying debt');
});

test('market risk is a share, not a number outside 0 to 100', () => {
  const e = leveraged();
  assert.ok(e.marketBiasPct >= 0 && e.marketBiasPct <= 100, `market bias was ${e.marketBiasPct}`);
});

test('net and gross are both reported, and they differ once there is debt', () => {
  const e = leveraged();
  assert.equal(Math.round(e.totalUsd), 180323);
  assert.equal(Math.round(e.grossUsd), 795107);
});

test('a wallet with no debt is unchanged: gross is net', () => {
  const e = computeExposure([], [
    { token: token('0xweth', 'WETH', 'ETH'), valueUsd: 750 },
    { token: token('0xusdc', 'USDC', 'STABLE'), valueUsd: 250 },
  ], []);
  assert.equal(e.grossUsd, e.totalUsd);
  assert.equal(e.leveraged, false);
  assert.equal(e.byClass.find((c) => c.assetClass === 'ETH').pct, 75);
  assert.equal(e.byClass.find((c) => c.assetClass === 'STABLE').pct, 25);
  assert.equal(e.marketBiasPct, 75);
});
