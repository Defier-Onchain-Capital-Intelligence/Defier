import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTransfersIntoSwaps, valueSwaps, pickMoments, buildSwapMoments, attachThen, headlineFor } from '../src/core/swaps.js';

const ME = '0xme';
const AERO = '0xaero';
const USDC = '0xusdc';
const WETH = '0x4200000000000000000000000000000000000006';
const SCAM = '0xscam';
const ROUTER = '0xrouter';

const tx = (hash, rows, ts = '2026-01-15T00:00:00Z', block = 100) =>
  rows.map((r) => ({ txHash: hash, ts, blockNumber: block, ...r }));

test('a plain swap is one asset out and one in', () => {
  const { swaps } = groupTransfersIntoSwaps(tx('0x1', [
    { from: ME, to: ROUTER, token: AERO, symbol: 'AERO', amount: 5000 },
    { from: ROUTER, to: ME, token: USDC, symbol: 'USDC', amount: 500 },
  ]), ME);
  assert.equal(swaps.length, 1);
  assert.equal(swaps[0].gave.symbol, 'AERO');
  assert.equal(swaps[0].got.amount, 500);
});

test('adding liquidity sends two tokens and is not a swap', () => {
  const { swaps, skipped } = groupTransfersIntoSwaps(tx('0x2', [
    { from: ME, to: ROUTER, token: WETH, symbol: 'ETH', amount: 1 },
    { from: ME, to: ROUTER, token: USDC, symbol: 'USDC', amount: 2500 },
  ]), ME);
  assert.equal(swaps.length, 0);
  assert.equal(skipped.oneSided, 1);
});

test('a reward claim only receives and is not a swap', () => {
  const { swaps, skipped } = groupTransfersIntoSwaps(tx('0x3', [
    { from: ROUTER, to: ME, token: AERO, symbol: 'AERO', amount: 16.15 },
  ]), ME);
  assert.equal(swaps.length, 0);
  assert.equal(skipped.oneSided, 1);
});

test('a refund of unspent ETH nets out instead of breaking the swap', () => {
  const { swaps } = groupTransfersIntoSwaps(tx('0x4', [
    { from: ME, to: ROUTER, token: WETH, symbol: 'ETH', amount: 1 },
    { from: ROUTER, to: ME, token: WETH, symbol: 'ETH', amount: 0.01 },
    { from: ROUTER, to: ME, token: AERO, symbol: 'AERO', amount: 4000 },
  ]), ME);
  assert.equal(swaps.length, 1);
  assert.equal(swaps[0].gave.token, WETH);
  assert.ok(Math.abs(swaps[0].gave.amount - 0.99) < 1e-9);
});

test('a multi hop through a token the wallet never holds is still one swap', () => {
  const { swaps } = groupTransfersIntoSwaps(tx('0x5', [
    { from: ME, to: ROUTER, token: USDC, symbol: 'USDC', amount: 1000 },
    { from: ROUTER, to: ME, token: AERO, symbol: 'AERO', amount: 900 },
  ]), ME);
  assert.equal(swaps.length, 1);
});

test('the same transfer seen from both directions is counted once', () => {
  const rows = tx('0x6', [
    { from: ME, to: ROUTER, token: AERO, symbol: 'AERO', amount: 100 },
    { from: ROUTER, to: ME, token: USDC, symbol: 'USDC', amount: 50 },
  ]);
  const { swaps } = groupTransfersIntoSwaps([...rows, ...rows], ME);
  assert.equal(swaps.length, 1);
  assert.equal(swaps[0].gave.amount, 100);
});

test('a token without a trusted price takes its trade out, and is reported', () => {
  const swaps = [
    { txHash: '0x7', ts: null, blockNumber: 1, gave: { token: SCAM, symbol: 'FREE', amount: 1e9 }, got: { token: USDC, symbol: 'USDC', amount: 1 } },
  ];
  const prices = new Map([
    ['base:' + USDC, { price: 1, confidence: 0.99 }],
    ['base:' + SCAM, { price: 12, confidence: 0.2 }],
  ]);
  const { valued, unpriced } = valueSwaps(swaps, prices);
  assert.equal(valued.length, 0);
  assert.deepEqual(unpriced, [SCAM]);
});

test('dust and ordinary trades do not become stories', () => {
  const valued = [
    { txHash: '0xa', ts: null, gave: { symbol: 'A', amount: 1, valueTodayUsd: 3 }, got: { symbol: 'B', amount: 1, valueTodayUsd: 60 } },
    { txHash: '0xb', ts: null, gave: { symbol: 'A', amount: 1, valueTodayUsd: 1000 }, got: { symbol: 'B', amount: 1, valueTodayUsd: 1100 } },
  ];
  assert.equal(pickMoments(valued).length, 0);
});

test('the headline states amounts, never a verdict', () => {
  const out = buildSwapMoments({
    wallet: ME,
    limit: 3,
    transfers: tx('0x8', [
      { from: ME, to: ROUTER, token: AERO, symbol: 'AERO', amount: 5000 },
      { from: ROUTER, to: ME, token: USDC, symbol: 'USDC', amount: 500 },
    ], '2025-12-15T12:00:00Z'),
    prices: new Map([
      ['base:' + AERO, { price: 0.8, confidence: 0.99 }],
      ['base:' + USDC, { price: 1, confidence: 0.99 }],
    ]),
  });
  assert.equal(out.moments.length, 1);
  const h = out.moments[0].headline;
  assert.equal(
    h,
    'On Dec 15, 2025 you swapped 5,000 AERO for 500 USDC. '
    + 'Today those USDC are $500 and that AERO would be $4,000.',
  );
  for (const banned of ['lost', 'missed', 'should have', 'mistake']) {
    assert.ok(!h.toLowerCase().includes(banned), `headline must not say "${banned}"`);
  }
  assert.equal(out.coverage.swapsFound, 1);
  assert.equal(out.coverage.swapsPriced, 1);
});

test('the trade that aged well keeps a slot, so the card is not three funerals', () => {
  const valued = [
    { txHash: '0x1', ts: null, gave: { symbol: 'ETH', amount: 1, valueTodayUsd: 2500 }, got: { symbol: 'DEAD1', amount: 1, valueTodayUsd: 3 } },
    { txHash: '0x2', ts: null, gave: { symbol: 'ETH', amount: 1, valueTodayUsd: 2400 }, got: { symbol: 'DEAD2', amount: 1, valueTodayUsd: 4 } },
    { txHash: '0x3', ts: null, gave: { symbol: 'ETH', amount: 1, valueTodayUsd: 2300 }, got: { symbol: 'DEAD3', amount: 1, valueTodayUsd: 5 } },
    { txHash: '0x4', ts: null, gave: { symbol: 'USDC', amount: 500, valueTodayUsd: 500 }, got: { symbol: 'WIN', amount: 10, valueTodayUsd: 1800 } },
  ];
  const picked = pickMoments(valued, { limit: 3 });
  assert.equal(picked.length, 3);
  assert.ok(picked.some((m) => m.got.symbol === 'WIN'), 'the winner must be shown');
});

test('with no trade that aged well the ranking is untouched', () => {
  const valued = [
    { txHash: '0x1', ts: null, gave: { symbol: 'ETH', amount: 1, valueTodayUsd: 2500 }, got: { symbol: 'DEAD1', amount: 1, valueTodayUsd: 3 } },
    { txHash: '0x2', ts: null, gave: { symbol: 'ETH', amount: 1, valueTodayUsd: 2400 }, got: { symbol: 'DEAD2', amount: 1, valueTodayUsd: 4 } },
  ];
  const picked = pickMoments(valued, { limit: 3 });
  assert.deepEqual(picked.map((m) => m.got.symbol), ['DEAD1', 'DEAD2']);
});

test('the value at the time is shown only when both legs agree on it', () => {
  const base = { txHash: '0xc', ts: '2025-06-01T00:00:00Z', gave: { token: AERO, symbol: 'AERO', amount: 1000, valueTodayUsd: 800 }, got: { token: USDC, symbol: 'USDC', amount: 100, valueTodayUsd: 100 } };
  const day = Math.floor(new Date(base.ts).getTime() / 86400000);

  // Both legs priced at about $1,000: a real trade, and they agree.
  const agree = new Map([[`${AERO}@${day}`, 1], [`${USDC}@${day}`, 10]]);
  const [ok] = attachThen([base], agree);
  assert.ok(Math.abs(ok.tradeValueThenUsd - 1000) < 1);

  // The AERO price for that day is nonsense: the legs disagree by 10x, so no
  // past is invented and the two present day figures stand alone.
  const disagree = new Map([[`${AERO}@${day}`, 10], [`${USDC}@${day}`, 1]]);
  const [bad] = attachThen([base], disagree);
  assert.equal(bad.tradeValueThenUsd, undefined);
});

test('the headline carries both sides today and the cost at the time', () => {
  const m = {
    ts: '2024-11-16T00:00:00Z',
    gave: { symbol: 'ETH', amount: 0.339, valueTodayUsd: 843 },
    got: { symbol: 'TALENT', amount: 13111, valueTodayUsd: 2.7 },
    tradeValueThenUsd: 1120,
  };
  assert.equal(
    headlineFor(m),
    'On Nov 16, 2024 you swapped 0.339 ETH for 13,111 TALENT — about $1,120 at the time. '
    + 'Today those TALENT are $2.7 and that ETH would be $843.',
  );
});
