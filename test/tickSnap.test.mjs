/**
 * Ranges must land on the pool's grid.
 *
 * A bound in a concentrated pool lives on a tick, and ticks exist only at
 * multiples of the pool's spacing. Simulating ±0.5% on a CL200 pool, where one
 * spacing is about two percent, prices a position nobody can open — and it does
 * not look wrong on screen, it looks like an answer. This pins the arithmetic
 * that keeps that from happening.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const tickPct = (spacing) => (Math.pow(1.0001, spacing) - 1) * 100;

function snapPct(pct, spacing) {
  if (!spacing || !(1 + pct / 100 > 0)) return pct;
  const ticks = Math.log(1 + pct / 100) / Math.log(1.0001);
  return (Math.pow(1.0001, Math.round(ticks / spacing) * spacing) - 1) * 100;
}

/** Is this width a whole number of tick spacings? */
const onGrid = (pct, spacing) => {
  const ticks = Math.log(1 + pct / 100) / Math.log(1.0001);
  return Math.abs(ticks / spacing - Math.round(ticks / spacing)) < 1e-6;
};

test('one tick spacing is about two percent on CL200', () => {
  assert.ok(Math.abs(tickPct(200) - 2.02) < 0.01);
});

test('a width finer than the pool snaps onto its grid', () => {
  const snapped = snapPct(0.5, 200);
  assert.ok(onGrid(snapped, 200), 'lands on a tick multiple');
  assert.ok(Math.abs(snapped) < 0.001 || Math.abs(snapped - tickPct(200)) < 0.001,
    'snaps to zero or to one spacing, not to something in between');
});

test('a CL1 pool keeps fine widths, because it can hold them', () => {
  const snapped = snapPct(0.5, 1);
  assert.ok(Math.abs(snapped - 0.5) < 0.01, 'barely moves');
  assert.ok(onGrid(snapped, 1));
});

test('snapping is symmetric around the entry price', () => {
  const up = snapPct(5, 100);
  const down = snapPct(-5, 100);
  assert.ok(onGrid(up, 100) && onGrid(down, 100));
  assert.ok(up > 0 && down < 0, 'a bound below entry stays below');
});

test('no spacing means no snapping', () => {
  assert.equal(snapPct(7.31, undefined), 7.31);
});
