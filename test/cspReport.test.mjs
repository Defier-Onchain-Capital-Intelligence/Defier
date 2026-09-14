/**
 * The CSP report endpoint must not leak the thing the site exists to protect.
 *
 * `document-uri` in a violation report is the URL of the page, and this app
 * puts a wallet address in the query string. A report endpoint that logs the
 * URL as sent would write "0x065c…" into the logs of every violation, which is
 * a worse privacy failure than the one the policy is there to prevent.
 *
 * The policy itself is split deliberately: the directives that cannot break a
 * wallet connection are enforced today, the rest is report-only until the
 * browser tells us which origins the wallet SDK actually needs. Enforcing a
 * guessed list is the mistake this shape avoids.
 *
 * Run with: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../src/app/api/csp-report/route.ts', import.meta.url), 'utf8');
const config = readFileSync(new URL('../next.config.js', import.meta.url), 'utf8');

/** The scrubber, lifted exactly as the route defines it. */
function scrub(value) {
  if (typeof value !== 'string' || !value) return null;
  if (!value.includes('://')) return value.slice(0, 60);
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 120);
  } catch (_) {
    return 'unparseable';
  }
}

test('a wallet address never survives into a log line', () => {
  const withAddress = 'https://www.getdefier.com/?address=0x065c8c2cabf489b80634a16269df7a4935c788ce';
  const out = scrub(withAddress);
  assert.ok(!out.includes('0x065c'), `address leaked: ${out}`);
  assert.ok(!out.includes('?'), 'the query string is where the address lives');
  assert.equal(out, 'https://www.getdefier.com');
});

test('a path is kept, because it says which screen broke', () => {
  assert.equal(scrub('https://www.getdefier.com/holdings?address=0xabc'), 'https://www.getdefier.com/holdings');
});

test('the useful non-URL values survive', () => {
  // "inline" and "eval" are the half of blocked-uri that says what to fix.
  for (const v of ['inline', 'eval', 'data', 'wasm-eval']) {
    assert.equal(scrub(v), v);
  }
});

test('garbage in does not throw', () => {
  assert.equal(scrub(null), null);
  assert.equal(scrub(''), null);
  assert.equal(scrub(42), null);
  assert.equal(scrub('http://['), 'unparseable');
});

test('the endpoint cannot be used as a spam vector', () => {
  assert.match(route, /rateLimit\(req/);
  assert.match(route, /MAX_BODY_BYTES/);
  assert.ok(!/supabase|insert|from\(/i.test(route), 'nothing is stored; the log is the whole destination');
  assert.match(route, /reports\.slice\(0, 10\)/, 'one POST must not produce unbounded log lines');
});

test('a failing report endpoint is invisible to someone using the site', () => {
  const returns = route.match(/status: \d+/g) || [];
  assert.ok(returns.includes('status: 204'), 'the browser has nothing useful to do with an error here');
});

test('only the directives that cannot break a wallet are enforced', () => {
  const enforced = config.match(/key: 'Content-Security-Policy',\s*value: \[([^\]]*)\]/);
  assert.ok(enforced, 'an enforced policy must exist');
  for (const safe of ['object-src', 'base-uri', 'form-action']) {
    assert.ok(enforced[1].includes(safe), `${safe} is safe to enforce and closes a real hole`);
  }
  for (const risky of ['script-src', 'connect-src', 'img-src', 'style-src']) {
    assert.ok(!enforced[1].includes(risky),
      `${risky} enforced on a guess is how a wallet connection breaks`);
  }
});

test('the report-only policy is strict enough to be worth reading', () => {
  assert.match(config, /connect-src 'self'/);
  assert.match(config, /report-uri \/api\/csp-report/);
  // If it already allowed everything, the reports would say nothing.
  assert.ok(!/connect-src [^;]*https:/.test(config),
    'a permissive report-only policy teaches nothing');
});

test('frame-ancestors stays absent, because this is a Mini App', () => {
  // Comments are allowed to mention it — they explain why it is missing. What
  // must not exist is the directive itself, or the header that does the same job.
  const code = config
    .replace(/\/\*[^]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/frame-ancestors/.test(code),
    'forbidding the iframe removes the surface the app was built for');
  assert.ok(!/X-Frame-Options/.test(code));
});
