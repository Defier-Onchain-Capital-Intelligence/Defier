/**
 * Every contract call the lending reader makes must be encodable.
 *
 * This test exists because it was not. `getPrice` was missing from the
 * interface, so every Compound v3 market threw on the first encode, the
 * Promise.allSettled around it turned that into "could not be read", and the
 * screens honestly reported that Compound had not been checked. Nothing looked
 * broken. The safety net held, which is exactly why the bug was invisible: a
 * degraded read and an unreadable protocol produce the same sentence.
 *
 * A missing ABI entry is a typo, and a typo should fail here rather than in
 * production. Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';

const source = fs.readFileSync(path.join(process.cwd(), 'src/core/lending.js'), 'utf8');

/** The human readable ABI as the module declares it. */
function declaredInterface() {
  const start = source.indexOf('new ethers.utils.Interface([');
  assert.ok(start > -1, 'lending.js should declare one Interface');
  const end = source.indexOf(']);', start);
  const body = source.slice(start + 'new ethers.utils.Interface(['.length, end);
  const fragments = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(fragments.length > 10, 'expected the ABI fragments to parse');
  return new ethers.utils.Interface(fragments);
}

/** Every name passed to the module's call() helper or decode(). */
function calledNames() {
  const names = new Set();
  for (const m of source.matchAll(/call\([^,]+,\s*'([a-zA-Z0-9_]+)'/g)) names.add(m[1]);
  for (const m of source.matchAll(/decode\([^,]+,\s*'([a-zA-Z0-9_]+)'\)/g)) names.add(m[1]);
  return [...names];
}

test('every function the lending reader calls is in its ABI', () => {
  const iface = declaredInterface();
  const missing = [];
  for (const name of calledNames()) {
    try { iface.getFunction(name); } catch (_) { missing.push(name); }
  }
  assert.deepEqual(missing, [], `not declared in the lending ABI: ${missing.join(', ')}`);
});

test('the reader calls something on every protocol it claims to check', () => {
  const names = calledNames();
  // Aave, Moonwell and Comet each have a call only they make.
  for (const marker of ['getUserAccountData', 'getAccountSnapshot', 'borrowBalanceOf']) {
    assert.ok(names.includes(marker), `expected the reader to call ${marker}`);
  }
});

test('coverage names Morpho as not covered', async () => {
  assert.match(source, /notCovered:\s*\['Morpho'\]/, 'Morpho must stay named as uncovered');
});
