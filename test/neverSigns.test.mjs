/**
 * This app never signs anything, and that is load-bearing.
 *
 * It is the product promise — read-only, no signatures, no seed phrases, no
 * transactions — and it is also what makes CVE-2025-14505 in `elliptic` not
 * apply to us. That advisory is in ECDSA signature GENERATION: a mis-computed
 * byte length for k when it has leading zeros, which under specific conditions
 * can leak a private key to someone holding both a flawed and a correct
 * signature of the same input. Verification and key generation are unaffected,
 * and there is no patched version — the advisory says "Patched versions: None".
 *
 * So the reason it is not a risk here is not that it was fixed. It is that we
 * never call the affected code path. That reasoning stops being true the
 * moment this app signs anything, and nobody will remember this file then, so
 * the test is what remembers.
 *
 * If this test fails because signing was added deliberately, the right move is
 * not to delete it. It is to re-read the advisory and decide again.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);

/** Anything that would produce a signature or a transaction. */
const SIGNING = [
  [/new\s+ethers\.Wallet\s*\(/, 'ethers.Wallet holds a private key and signs with it'],
  [/\bnew\s+Wallet\s*\(/, 'ethers.Wallet holds a private key and signs with it'],
  [/\.signMessage\s*\(/, 'message signing'],
  [/\.signTransaction\s*\(/, 'transaction signing'],
  [/_signTypedData\s*\(/, 'typed-data signing'],
  [/\bprivateKey\b/, 'a private key has no business in this codebase'],
  [/useSendTransaction\b/, 'sending a transaction'],
  [/useSignMessage\b/, 'message signing'],
  [/\bwriteContract\b/, 'a state-changing contract call'],
];

test('nothing in src/ signs, sends, or holds a key', () => {
  const found = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    // Comments are allowed to say "we never sign" — that is the promise itself.
    const code = src
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
      .join('\n');
    for (const [pattern, why] of SIGNING) {
      if (pattern.test(code)) found.push(`${file.replace(ROOT, 'src/')}: ${why}`);
    }
  }
  assert.deepEqual(found, [],
    `signing appeared in a read-only app:\n${found.join('\n')}\n\n`
    + 'If this is deliberate, CVE-2025-14505 in elliptic needs re-reading: it is '
    + 'unpatched, it affects signature generation, and "we never sign" was the '
    + 'whole reason it did not apply.');
});

test('the product promise is still written where a reader sees it', () => {
  const security = readFileSync(new URL('../SECURITY.md', import.meta.url), 'utf8');
  assert.match(security, /solo lectura|read-only|read only/i);
});
