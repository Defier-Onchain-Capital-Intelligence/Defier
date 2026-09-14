/**
 * A dead endpoint must not be something a person waits for.
 *
 * getProvider probed all five RPCs with Promise.allSettled, so one unreachable
 * endpoint cost the full timeout on every probe. That was survivable while the
 * verdict was cached for the life of the instance. It stopped being survivable
 * the moment that cache got a five minute expiry — my own change — because the
 * penalty went from once per instance to once every five minutes, on a request
 * somebody was waiting for. Measured in production with 1rpc.io down.
 *
 * The probe now stops waiting as soon as it has something usable, and the
 * stragglers correct the health record afterwards for free. Two things must
 * hold: the preferred endpoint gets a chance to answer before an early finish
 * (it is the only one that serves a wide eth_getLogs range, and losing it
 * demotes every scan to 10,000-block chunks), and a preferred endpoint that is
 * itself the slow one does not get to hold the request either.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/core/providers.js', import.meta.url), 'utf8');

/** The resolve rule, lifted exactly, replayed against a fake clock. */
function decide({ urls, settledOrder, now, minHealthy = 2, graceMs = 1500, timeoutMs = 3000 }) {
  const done = settledOrder.filter((s) => s.at <= now);
  const healthy = done.filter((r) => r.provider).length;
  const preferredSettled = done.some((r) => r.url === urls[0]);
  if (preferredSettled && healthy >= 1 && now >= graceMs) return 'enough';
  if (healthy >= minHealthy && now >= timeoutMs) return 'enough-without-preferred';
  if (done.length === urls.length) return 'all';
  return 'wait';
}

const URLS = ['alchemy', 'publicnode', 'tenderly', 'drpc', 'dead'];

test('the probe does not wait for the dead endpoint once the rest have answered', () => {
  const settled = [
    { url: 'alchemy', provider: {}, at: 400 },
    { url: 'publicnode', provider: {}, at: 500 },
    { url: 'tenderly', provider: {}, at: 550 },
    { url: 'drpc', provider: {}, at: 600 },
    { url: 'dead', provider: null, at: 3000 },
  ];
  assert.equal(decide({ urls: URLS, settledOrder: settled, now: 600 }), 'wait',
    'before the grace, keep collecting');
  assert.equal(decide({ urls: URLS, settledOrder: settled, now: 1500 }), 'enough',
    'at the grace, four healthy endpoints is plenty');
});

test('the preferred endpoint gets to answer before an early finish', () => {
  // Alchemy slow, public nodes fast. Resolving without it would demote every
  // log scan to 10,000-block chunks without anyone noticing.
  const settled = [
    { url: 'publicnode', provider: {}, at: 300 },
    { url: 'tenderly', provider: {}, at: 350 },
    { url: 'drpc', provider: {}, at: 400 },
    { url: 'alchemy', provider: {}, at: 2000 },
    { url: 'dead', provider: null, at: 3000 },
  ];
  assert.equal(decide({ urls: URLS, settledOrder: settled, now: 1500 }), 'wait',
    'three healthy endpoints is not a reason to drop the one that matters');
  assert.equal(decide({ urls: URLS, settledOrder: settled, now: 2000 }), 'enough');
});

test('but a preferred endpoint that never answers does not hold the request', () => {
  const settled = [
    { url: 'publicnode', provider: {}, at: 300 },
    { url: 'tenderly', provider: {}, at: 350 },
    { url: 'drpc', provider: {}, at: 400 },
    { url: 'dead', provider: null, at: 3000 },
    { url: 'alchemy', provider: null, at: 9000 },
  ];
  assert.equal(decide({ urls: URLS, settledOrder: settled, now: 2999 }), 'wait');
  assert.equal(decide({ urls: URLS, settledOrder: settled, now: 3000 }), 'enough-without-preferred',
    'waiting forever for the preferred one is the bug in the other direction');
});

test('everything down still waits for everything, so the caller can say so', () => {
  const settled = URLS.map((url, i) => ({ url, provider: null, at: 500 + i * 100 }));
  // Four of five down and the last still trying: nothing to resolve early with.
  assert.equal(decide({ urls: URLS, settledOrder: settled, now: 800 }), 'wait');
  // All five down: resolve, and let getProvider throw with the reason.
  assert.equal(decide({ urls: URLS, settledOrder: settled, now: 900 }), 'all');
  assert.match(src, /throw new Error\(`No working RPC for chain/);
});

test('the health record is corrected by the stragglers, for free', () => {
  assert.match(src, /partial: results\.length < rpcs\.length/,
    'a record written from a partial probe has to admit it is partial');
  assert.match(src, /if \(_providerHealth\[chain\]\?\.partial\) record\(final\)/,
    'and a later probe must not be overwritten by an earlier one\'s leftovers');
});

test('the timeouts are the measured ones', () => {
  // eth_blockNumber against the four public Base RPCs came back in 337-584 ms.
  assert.match(src, /const PROBE_TIMEOUT_MS = 3000;/, 'five times the slowest honest answer');
  assert.match(src, /const PROBE_GRACE_MS = 1500;/);
  assert.ok(!/withTimeout\(p\.getBlockNumber\(\), 6000\)/.test(src),
    'six seconds per endpoint was the cost paid every five minutes');
});

test('both probes share one implementation', () => {
  const uses = src.match(/await probeUrls\(/g) || [];
  assert.equal(uses.length, 2, 'getProvider and getLogsProvider');
  assert.ok(!/Promise\.allSettled\(\s*urls\.map/.test(src),
    'the logs provider had the same bug and the same fix');
});
