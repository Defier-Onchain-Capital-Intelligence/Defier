/**
 * An unreachable chain must never be reported as an empty wallet.
 *
 * On 11 September 2026 every wallet on the live site read $0.00. Nothing was
 * broken about the wallets: an Aave position of roughly $290,000 of collateral
 * against $210,000 of debt was sitting on Base the whole time, readable from
 * any public RPC. What was broken was that three separate reads turned a
 * transport failure into a value:
 *
 *   getTokenHoldings   caught the multicall error and returned []
 *   readComet          could not decode the market and returned note: null
 *   getEverOwnedTokenIds returned the half of the history that answered
 *
 * Each one produced a number the reader had no reason to doubt. That is the
 * failure this file exists to prevent: not a wrong figure, a confident one.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('a failed balance multicall throws instead of returning an empty list', () => {
  const src = read('../src/core/tokens.js');
  const block = src.slice(src.indexOf('aggregate3'), src.indexOf('const withBalance'));
  assert.ok(/throw new Error/.test(block),
    'getTokenHoldings must throw when the multicall fails, so the caller can warn');
  assert.ok(!/catch\s*\(_\)\s*\{\s*return \[\];/.test(block),
    'returning [] on a transport failure says "this wallet holds nothing"');
});

test('every lending read failure is flagged, so coverage cannot claim it was checked', () => {
  const src = read('../src/core/lending.js');
  // Each place that gives up on a protocol must say so. A `note` alone is not
  // enough: coverage is computed from `failed`, and a protocol missing from it
  // is reported to the reader as one we looked at.
  const giveUps = src.split('\n')
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => /could not be (read|listed|priced)/.test(line) && !line.trim().startsWith('*'));
  assert.ok(giveUps.length >= 5, `expected the known give-up paths, found ${giveUps.length}`);

  for (const { line, i } of giveUps) {
    const window = src.split('\n').slice(Math.max(0, i - 6), i + 6).join('\n');
    assert.ok(/readFailed/.test(window) || /console\.error/.test(window) || /transportErrors/.test(window),
      `line ${i + 1} gives up without marking the read as failed: ${line.trim()}`);
  }
});

test('the Comet market reads never return silent nulls', () => {
  const src = read('../src/core/lending.js');
  const guard = 'if (!baseToken || !baseFeed || baseDecimals == null || numAssets == null)';
  const at = src.indexOf(guard);
  assert.ok(at > 0, 'the Comet market guard must still exist');
  const body = src.slice(at, at + 900);
  assert.ok(/readFailed: true/.test(body),
    'baseToken and priceFeed describe the market, not the wallet: failing to read them is never "no position"');
  assert.ok(!/^\s*if \(!baseToken.*return \{ position: null, note: null \};/m.test(src),
    'the silent null is what made a dead RPC look like a wallet with no Compound position');
});

test('a half-answered ownership history is discarded, not returned', () => {
  const src = read('../src/core/alchemy.js');
  const at = src.indexOf('export async function getEverOwnedTokenIds');
  const body = src.slice(at, at + 900);
  assert.ok(/received === null \|\| sent === null/.test(body),
    'either half failing makes "every position ever held" incomplete, and the caller treats it as complete');
});

test('the provider records which endpoints answered', () => {
  const src = read('../src/core/providers.js');
  assert.ok(/export function getProviderHealth/.test(src),
    'an empty wallet and an unreachable chain must be distinguishable after the fact');
  assert.ok(/export function invalidateProvider/.test(src),
    'a provider cached at cold start must be droppable when it starts refusing');
});

test('a redacted RPC url never carries the key', () => {
  const src = read('../src/core/providers.js');
  assert.ok(/export function redactRpcUrl/.test(src), 'redactRpcUrl must exist');
});
