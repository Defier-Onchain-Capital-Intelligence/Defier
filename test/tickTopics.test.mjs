/**
 * Reading a tick back out of an event topic.
 *
 * Found by asking why a wallet's closed positions all failed to rebuild: every
 * one of twenty attempts threw the same ethers overflow. An int24 in a 32 byte
 * topic is sign extended, so tick -100 arrives as 0xffff…ff9c, and converting
 * that whole word to a JS number throws before the two's complement line can
 * run. Positive ticks worked, negative ticks never did.
 *
 * A tick is negative whenever the pool price is below 1 in its own token
 * ordering, which covers most WETH/cbBTC positions, so this silently removed a
 * large share of closed positions from every wallet's history.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';

const source = fs.readFileSync(path.join(process.cwd(), 'src/core/history.js'), 'utf8');

const int24Of = (() => {
  const start = source.indexOf('const int24Of = (topicHex) => {');
  const end = source.indexOf('};', start) + 2;
  assert.ok(start > -1, 'int24Of must exist');
  return eval(`(${source.slice(start + 'const int24Of = '.length, end - 1)})`);
})();

const asTopic = (tick) => ethers.utils.defaultAbiCoder.encode(['int24'], [tick]);

test('negative ticks survive the trip through a topic', () => {
  for (const tick of [-1, -60, -100, -887220, -200000]) {
    assert.equal(int24Of(asTopic(tick)), tick, `tick ${tick}`);
  }
});

test('positive ticks and zero are unchanged', () => {
  for (const tick of [0, 1, 60, 100, 887220]) {
    assert.equal(int24Of(asTopic(tick)), tick, `tick ${tick}`);
  }
});

test('the full int24 range round trips', () => {
  // Uniswap and Slipstream bound ticks at +/- 887272.
  for (const tick of [-887272, 887272]) {
    assert.equal(int24Of(asTopic(tick)), tick);
  }
});

test('it does not throw where it used to', () => {
  assert.doesNotThrow(() => int24Of(asTopic(-100)));
});
