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

test('nothing is enforced that was not measured first', () => {
  const enforced = config.match(/const ENFORCED_CSP = \[([^\]]*)\]/);
  assert.ok(enforced, 'an enforced policy must exist');
  // These reported zero violations across six screens, so closing them costs
  // nothing. img-src carries the one host that did report: token logos.
  for (const measured of ['object-src', 'base-uri', 'form-action',
    'img-src', 'font-src', 'frame-src', 'worker-src', 'style-src']) {
    assert.ok(enforced[1].includes(measured), `${measured} was measured clean and should be closed`);
  }
  assert.match(enforced[1], /img-src 'self' data: https:\/\/token-icons\.llamao\.fi/,
    'the one origin that actually reported has to be allowed, or every token logo breaks');
});

test('connect-src and script-src stay out until they can be tested', () => {
  const enforced = config.match(/const ENFORCED_CSP = \[([^\]]*)\]/)[1];
  // default-src is the fallback for connect-src, so enforcing it enforces that
  // too. Neither goes in on a list that is only probably complete.
  for (const untested of ['script-src', 'connect-src', 'default-src']) {
    assert.ok(!enforced.includes(untested),
      `${untested} enforced before the wallet flow is exercised is how connecting breaks`);
  }
  // And they are still being measured rather than forgotten.
  const reportOnly = config.match(/const REPORT_ONLY_CSP = \[([^\]]*)\]/)[1];
  for (const watched of ['script-src', 'connect-src', 'default-src']) {
    assert.ok(reportOnly.includes(watched), `${watched} must stay under report-only`);
  }
});

test('upgrade-insecure-requests is enforced, not reported', () => {
  // The browser said it outright: the directive is ignored in a report-only
  // policy. Leaving it there is a line that does nothing and reads as if it does.
  const enforced = config.match(/const ENFORCED_CSP = \[([^\]]*)\]/)[1];
  const reportOnly = config.match(/const REPORT_ONLY_CSP = \[([^\]]*)\]/)[1];
  assert.ok(enforced.includes('upgrade-insecure-requests'));
  assert.ok(!reportOnly.includes('upgrade-insecure-requests'));
});

test('third-party analytics is off where we can switch it off', () => {
  const providers = readFileSync(new URL('../src/components/Providers.tsx', import.meta.url), 'utf8');
  assert.match(providers, /analytics=\{false\}/,
    'OnchainKit reports usage to Coinbase unless told not to');
  // And the part we cannot switch off from here is written down rather than
  // forgotten: the wallet SDK's own telemetry needs our own wagmi config.
  assert.match(providers, /cca-lite\.coinbase\.com/);
});

test('the report-only policy is strict enough to be worth reading', () => {
  // Read the array itself, not the file: the comments around it legitimately
  // name origins and directives while explaining why they are NOT in the
  // policy, and a regex over the whole file cannot tell those apart.
  const reportOnly = config.match(/const REPORT_ONLY_CSP = \[([^\]]*)\]/)[1];
  assert.match(reportOnly, /"connect-src 'self'"/,
    'a permissive report-only policy teaches nothing');
  assert.match(reportOnly, /"script-src 'self'"/);
  assert.match(reportOnly, /report-uri \/api\/csp-report/);
  assert.ok(!/https:\/\//.test(reportOnly),
    'the moment it allows an origin it stops reporting that origin');
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
