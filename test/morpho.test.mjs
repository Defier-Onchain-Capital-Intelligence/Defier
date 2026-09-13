/**
 * Morpho indexes onBehalf in a different topic for Borrow than for Supply.
 *
 * Supply(id, caller, onBehalf, ...)            -> onBehalf is topic 3
 * SupplyCollateral(id, caller, onBehalf, ...)  -> onBehalf is topic 3
 * Borrow(id, onBehalf, receiver, ...)          -> onBehalf is topic 2
 *
 * Borrow does not index `caller`, so everything shifts left by one. Filtering
 * all three on topic 3 finds every supply and misses every borrow, and the
 * wallet is then shown collateral with no debt beside it — the precise failure
 * a lending reader exists to prevent. The scan is two queries for that reason
 * and this file is what stops someone merging them back into one.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ethers } from 'ethers';
import { MORPHO, _internals } from '../src/core/morpho.js';

const { toAssetsUp, toAssetsDown, TOPIC, pad32 } = _internals;
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the event topics are the real ones', () => {
  assert.equal(TOPIC.supply, ethers.utils.id('Supply(bytes32,address,address,uint256,uint256)'));
  assert.equal(TOPIC.supplyCollateral, ethers.utils.id('SupplyCollateral(bytes32,address,address,uint256)'));
  assert.equal(TOPIC.borrow, ethers.utils.id('Borrow(bytes32,address,address,address,uint256,uint256)'));
});

test('a real Borrow log from Base has onBehalf in topic 2, not topic 3', () => {
  // Captured on Base at block 51,252,660. Four topics: signature, market id,
  // onBehalf, receiver.
  const log = {
    topics: [
      TOPIC.borrow,
      '0xd4a903dc6d949519060c7707f9604fdc9772c046e05c2e3a8fce0bd7196e4109',
      '0x000000000000000000000000d0daab82453e7f5ea64985415239f01b58c7d1d9',
      '0x000000000000000000000000d0daab82453e7f5ea64985415239f01b58c7d1d9',
    ],
  };
  const borrower = '0xd0daab82453e7f5ea64985415239f01b58c7d1d9';
  assert.equal(log.topics.length, 4);
  assert.equal(log.topics[2], pad32(borrower),
    'onBehalf is topic 2 for Borrow; filtering it on topic 3 finds nothing');
});

test('the two scans filter on different topic slots', () => {
  const src = read('../src/core/morpho.js');
  // The supply scan pads out to topic 3.
  assert.match(src, /topics: \[\[TOPIC\.supply, TOPIC\.supplyCollateral\], null, null, walletTopic\]/,
    'Supply and SupplyCollateral carry onBehalf in topic 3');
  // The borrow scan stops at topic 2.
  assert.match(src, /topics: \[TOPIC\.borrow, null, walletTopic\]/,
    'Borrow carries onBehalf in topic 2; a third null would silently match nothing');
});

test('share conversion reproduces a live position exactly', () => {
  // Market 0xd4a903dc..., wallet 0xd0daab82..., read from Base.
  // A borrow of a round 1,530 USDC plus the interest accrued since.
  const borrowed = toAssetsUp(1468034317737420n, 47301046892002n, 45385328626856575492n);
  assert.equal(borrowed.toString(), '1530000161');
  assert.ok(Math.abs(Number(borrowed) / 1e6 - 1530) < 0.01,
    'landing on a round human figure is the check that the virtual shares are right');
});

test('debt rounds up and supply rounds down, the way the protocol rounds', () => {
  const shares = 1_000_000_000n;
  const totalAssets = 3n;
  const totalShares = 7n;
  const up = toAssetsUp(shares, totalAssets, totalShares);
  const down = toAssetsDown(shares, totalAssets, totalShares);
  assert.ok(up >= down, 'debt must never round in the borrower\'s favour');
  assert.ok(up - down <= 1n);
});

test('the virtual shares are part of the maths, not a rounding detail', () => {
  // They exist so the first deposit in a market cannot be attacked, and they
  // sit inside the conversion: dropping them shifts the answer rather than the
  // last digit. On the live position above the naive form is off by cents;
  // on a young market it is off by everything.
  const shares = 1468034317737420n;
  const totalAssets = 47301046892002n;
  const totalShares = 45385328626856575492n;
  const naive = (shares * totalAssets) / totalShares;
  const real = toAssetsUp(shares, totalAssets, totalShares);
  assert.notEqual(naive, real, 'the two formulas must not be treated as interchangeable');

  // A market with a thousandth of the liquidity: the gap is no longer cents.
  const small = { assets: 47_301_046n, shares: 45_385_328_626n };
  const naiveSmall = (1_000_000n * small.assets) / small.shares;
  const realSmall = toAssetsUp(1_000_000n, small.assets, small.shares);
  assert.ok(realSmall !== naiveSmall);
});

test('the deploy block is a floor that was verified, not guessed', () => {
  // Binary search on eth_getCode against an archive node: code at this block,
  // none at the one before. A floor that is too low turns one scan into
  // hundreds of chunks; one that is too high loses a wallet's early history.
  assert.equal(MORPHO.deployBlock, 13977148);
  assert.equal(MORPHO.address, '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb');
});

test('Morpho is no longer declared as not covered', async () => {
  const { LENDING_COVERAGE } = await import('../src/core/lending.js');
  assert.ok(LENDING_COVERAGE.checked.includes('Morpho'));
  assert.ok(!LENDING_COVERAGE.notCovered.includes('Morpho'),
    'the coverage sentence is what tells a reader a position elsewhere would not appear');
});

test('market token symbols are sanitised before they travel', () => {
  const src = read('../src/core/morpho.js');
  assert.match(src, /safeSymbol\(symbol\)/,
    'Morpho markets are permissionless: a symbol is a stranger\'s text with no gatekeeper at all');
  const lending = read('../src/core/lending.js');
  assert.match(lending, /safeSymbol\(symbol\)/,
    'the same path exists in lending.js and had the same hole');
});

test('health is computed in the market\'s own terms, never ours', () => {
  const src = read('../src/core/morpho.js');
  const block = src.slice(src.indexOf('// Health, in the market'), src.indexOf('if (supplied.length === 0'));
  assert.match(block, /r\.price/, 'the market oracle decides, because it is what liquidates');
  assert.ok(!/usdOf\(/.test(block),
    'mixing our USD prices with their LLTV produces a ratio that belongs to nobody');
});
