/**
 * Morpho is the one protocol here that cannot be discovered on chain.
 *
 * That is Morpho's own position, not a shortcut: "The total collateral on a
 * given market is not easily retrievable onchain. One has to index all
 * positions." There are 4,298 markets on Base, nothing enumerates a wallet's,
 * and the first version of this file proved what happens if you try anyway —
 * 900 sequential eth_getLogs per filter per wallet, and an 8 second portfolio
 * became a 52 second one for everybody.
 *
 * So: the indexer says WHERE to look, the chain says WHAT is there, and the
 * two are compared. These tests hold that split in place — particularly the
 * part where a missing answer must never be read as an empty one.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MORPHO, _internals, discoverMarkets } from '../src/core/morpho.js';

const { toAssetsUp, toAssetsDown, API_AGREEMENT_TOLERANCE } = _internals;
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** Swap global fetch for one call, and always put it back. */
async function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = original; }
}
const jsonResponse = (body, ok = true, status = 200) => ({
  ok, status, json: async () => body,
});

test('a live position is parsed exactly as the indexer returned it', async () => {
  // Captured from api.morpho.org for 0xd0daab82..., wallet with one position.
  const body = {
    data: { marketPositions: { items: [{
      healthFactor: 1.7446085592827305,
      market: { marketId: '0xd4a903dc6d949519060c7707f9604fdc9772c046e05c2e3a8fce0bd7196e4109' },
      state: { collateral: 3189012787, borrowAssets: 1530132778, supplyAssets: 0 },
    }] } },
  };
  const out = await withFetch(async () => jsonResponse(body),
    () => discoverMarkets('0xd0daab82453e7f5ea64985415239f01b58c7d1d9'));
  assert.equal(out.ok, true);
  assert.equal(out.markets.length, 1);
  assert.equal(out.markets[0].id, '0xd4a903dc6d949519060c7707f9604fdc9772c046e05c2e3a8fce0bd7196e4109');
  assert.equal(out.markets[0].claimed.borrowAssets, 1530132778);
});

test('an unreachable indexer is not an empty wallet', async () => {
  for (const [label, impl] of [
    ['network error', async () => { throw new Error('ECONNREFUSED'); }],
    ['http 500', async () => jsonResponse({}, false, 500)],
    ['graphql error', async () => jsonResponse({ errors: [{ message: 'rate limited' }] })],
    ['missing list', async () => jsonResponse({ data: {} })],
    ['garbage', async () => jsonResponse({ data: { marketPositions: { items: 'nope' } } })],
  ]) {
    const out = await withFetch(impl, () => discoverMarkets('0x' + '1'.repeat(40)));
    assert.equal(out.ok, false, `${label} must not report ok`);
    assert.equal(out.markets.length, 0);
    assert.ok(out.reason, `${label} must carry a reason`);
  }
});

test('an empty list IS an empty wallet, and says so', async () => {
  const out = await withFetch(async () => jsonResponse({ data: { marketPositions: { items: [] } } }),
    () => discoverMarkets('0x' + '2'.repeat(40)));
  assert.equal(out.ok, true, 'being told "none" is an answer');
  assert.equal(out.markets.length, 0);
});

test('a malformed market id is dropped rather than sent to the chain', async () => {
  const body = { data: { marketPositions: { items: [
    { market: { marketId: 'not-an-id' }, state: {} },
    { market: {}, state: {} },
    { market: { marketId: '0x' + 'a'.repeat(64) }, state: { collateral: 1 } },
  ] } } };
  const out = await withFetch(async () => jsonResponse(body), () => discoverMarkets('0x' + '3'.repeat(40)));
  assert.equal(out.ok, true);
  assert.equal(out.markets.length, 1, 'the indexer is a stranger too');
});

test('a failed search leaves coverage, so no screen claims we looked', () => {
  const src = read('../src/core/morpho.js');
  const body = src.slice(src.indexOf('export async function readMorpho'));
  const guard = body.slice(0, body.indexOf('const ids = markets'));
  assert.match(guard, /readFailed: true/);
  assert.match(guard, /could not be searched on this request/);
  assert.ok(!/markets\.length === 0[^]*readFailed: true/.test(guard),
    'being told there are none is not a failure');
});

test('the indexer supplies no figure, only a disagreement', () => {
  const src = read('../src/core/morpho.js');
  // Every amount put on a screen comes from the chain read. `claimed` may only
  // be compared against, never assigned from.
  const assignedFromClaim = /(?:amount|valueUsd|collateral|borrowedAssets|suppliedAssets)\s*[:=]\s*claimed\./;
  assert.ok(!assignedFromClaim.test(src),
    'a number from the indexer must never become a number on a screen');
  assert.match(src, /const agrees = /);
  assert.match(src, /disagreements\.push/);
});

test('a disagreement removes the health factor rather than picking a side', () => {
  const src = read('../src/core/morpho.js');
  assert.match(src, /healthFactor: disagreements\.length \? null : worstHealth/,
    'a health factor that is close is worse than none at all');
  assert.match(src, /breakdownComplete: unpriced === 0 && disagreements\.length === 0/);
});

test('the tolerance absorbs accrued interest and nothing larger', () => {
  assert.equal(API_AGREEMENT_TOLERANCE, 0.02);
  // The gap measured on the live position: 1,530.000161 read from the chain
  // against 1,530.132778 from the indexer, seconds apart.
  const drift = Math.abs(1530132778 - 1530000161) / 1530132778;
  assert.ok(drift < API_AGREEMENT_TOLERANCE, 'real accrual must not trip the check');
  assert.ok(drift < 0.0001, `measured drift was ${(drift * 100).toFixed(4)}%`);
  // A decimals mistake is a factor of 1e12 and could never hide inside it.
  assert.ok(1e12 * drift > API_AGREEMENT_TOLERANCE);
});

test('discovery can never become the request again', () => {
  const src = read('../src/core/morpho.js');
  assert.match(src, /API_BUDGET_MS/);
  assert.match(src, /withTimeout\(fetch\(/, 'an unbounded call is how the last version broke the site');
  assert.ok(!/chunkedGetLogs/.test(src),
    '900 sequential getLogs per wallet is the design this replaced');
});

test('share conversion still reproduces the live position exactly', () => {
  const borrowed = toAssetsUp(1468034317737420n, 47301046892002n, 45385328626856575492n);
  assert.equal(borrowed.toString(), '1530000161');
  const up = toAssetsUp(1_000_000_000n, 3n, 7n);
  const down = toAssetsDown(1_000_000_000n, 3n, 7n);
  assert.ok(up >= down, 'debt must never round in the borrower\'s favour');
});

test('the topic trap stays written down even though nothing reads events', () => {
  const src = read('../src/core/morpho.js');
  assert.match(src, /onBehalf is topic 2/,
    'the next person to reach for events must not pay for this twice');
  assert.equal(MORPHO.address, '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb');
});

test('market token symbols are still sanitised', () => {
  assert.match(read('../src/core/morpho.js'), /safeSymbol\(symbol\)/,
    'Morpho markets are permissionless: a symbol has no gatekeeper at all');
});
