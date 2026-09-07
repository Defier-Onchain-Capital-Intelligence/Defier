/**
 * The value curve, tested without a chain and without a price API.
 *
 * The curve makes a promise in its own header: its last point is the same
 * quantity the report puts in its headline. A chart that ends somewhere else
 * than the number above it does not look broken — it looks like a second
 * opinion, and the reader cannot tell which of the two to believe. So the
 * arithmetic is pinned here.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildValueHistory } from '../src/core/valueHistory.js';
import { tickFromPrice, computeV3CurrentAmounts } from '../src/core/math.js';

const DAY = 86400;
const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

/** A flat series is enough: what is under test is the arithmetic, not the prices. */
const flat = (price, fromDay, days) => {
  const m = new Map();
  for (let i = 0; i <= days; i += 1) m.set(fromDay + i, price);
  return m;
};

const position = (events, { tickLower = -887220, tickUpper = 887220 } = {}) => ({
  kind: 'cl',
  tickLower,
  tickUpper,
  token0: { address: WETH, symbol: 'WETH', decimals: 18 },
  token1: { address: USDC, symbol: 'USDC', decimals: 6 },
  events,
});

// Anchored to today: the curve always runs to the present day, because that is
// what a wallet's owner is looking at. A test that started in 2024 would ask it
// to draw seven hundred days it has no prices for.
const today = Math.floor(Date.now() / 1000 / DAY);
const startDay = today - 3;
const startTs = startDay * DAY;
const seriesFor = (days) => new Map([
  [WETH, flat(2000, startDay, days)],
  [USDC, flat(1, startDay, days)],
]);

test('a position never withdrawn is worth its liquidity, and holding is what went in', async () => {
  const L = '1000000000000000';
  const pos = position([
    { type: 'mint', timestamp: startTs, amount0: 1, amount1: 2000, liquidityDelta: L },
  ]);

  const history = await buildValueHistory([pos], { series: seriesFor(3) });
  const last = history.points.at(-1);

  const tick = tickFromPrice(2000 / 1, 18, 6);
  const amounts = computeV3CurrentAmounts({
    liquidity: L, currentTick: tick, tickLower: pos.tickLower, tickUpper: pos.tickUpper,
    dec0: 18, dec1: 6,
  });
  const expectedInside = amounts.amount0 * 2000 + amounts.amount1 * 1;

  assert.equal(history.points.length, 4, 'one point per day, first day included');
  assert.ok(Math.abs(last.lpUsd - expectedInside) < 1e-6, 'LP is the liquidity at that price');
  assert.equal(last.hodlUsd, 1 * 2000 + 2000 * 1, 'holding is the tokens deposited');
  assert.ok(Math.abs(last.divergenceUsd - (last.lpUsd - last.hodlUsd)) < 1e-9);
});

test('a withdrawal keeps its own day\'s dollars and stops counting liquidity', async () => {
  const L = '1000000000000000';
  const pos = position([
    { type: 'mint', timestamp: startTs, amount0: 1, amount1: 2000, liquidityDelta: L },
    {
      type: 'decrease', timestamp: startTs + 2 * DAY,
      amount0: 1, amount1: 2000, amount0Usd: 2000, amount1Usd: 2000,
      liquidityDelta: `-${L}`,
    },
  ]);

  const history = await buildValueHistory([pos], { series: seriesFor(3) });
  const last = history.points.at(-1);

  assert.equal(last.positionsOpen, 0, 'nothing is left inside');
  assert.equal(last.lpUsd, 4000, 'what came out is carried at the price of its own day');
  assert.equal(last.hodlUsd, 4000, 'the same tokens, never deposited, at an unchanged price');
  assert.equal(last.divergenceUsd, 0, 'a flat price leaves nothing between them');
});

test('a position with no price series is named, not drawn flat', async () => {
  const pos = position([
    { type: 'mint', timestamp: startTs, amount0: 1, amount1: 2000, liquidityDelta: '1000' },
  ]);
  const series = new Map([[WETH, flat(2000, startDay, 2)], [USDC, null]]);

  const history = await buildValueHistory([pos], { series });

  assert.equal(history.points.length, 0);
  assert.equal(history.positionsCovered, 0);
  assert.equal(history.complete, false);
  assert.match(history.notes.join(' '), /WETH\/USDC/, 'says which pair it left out');
});

test('deposits made later are not in earlier days', async () => {
  const L = '1000000000000000';
  const pos = position([
    { type: 'mint', timestamp: startTs, amount0: 1, amount1: 0, liquidityDelta: L },
    { type: 'increase', timestamp: startTs + 3 * DAY, amount0: 1, amount1: 0, liquidityDelta: L },
  ]);

  const history = await buildValueHistory([pos], { series: seriesFor(4) });

  assert.equal(history.points[0].hodlUsd, 2000, 'day one holds one WETH');
  assert.equal(history.points.at(-1).hodlUsd, 4000, 'after the top up it holds two');
});
