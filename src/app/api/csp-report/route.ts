import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/csp-report — where the browser says what our policy would break.
 *
 * The Content-Security-Policy on this site is in two halves: the directives
 * that cannot break a wallet connection are enforced, and the rest is sent
 * report-only, written as strictly as we would like to end up. This endpoint
 * is the other half of that plan. The origins a wallet SDK reaches live inside
 * the SDK, not in our source, so the only honest way to learn them is to ask
 * the browser and read the answer.
 *
 * Three things this must not become:
 *
 *   A spam vector. Anyone can POST here. It is rate limited, the body is
 *   capped, and nothing is stored — the report goes to the log and no further.
 *
 *   A way to leak a wallet address. `blocked-uri` and `document-uri` are URLs
 *   from the page, and this app puts an address in the query string. Both are
 *   reduced to an origin and a path before anything is written down.
 *
 *   Noise that nobody reads. Only the fields that identify what to change are
 *   kept: which directive, which origin. The rest is discarded.
 */

const MAX_BODY_BYTES = 8_000;

/** An origin and path, never a query string: ?address= lives in these URLs. */
function scrub(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  // Not a URL at all — "inline", "eval", "data" and friends are the useful
  // half of blocked-uri and must survive.
  if (!value.includes('://')) return value.slice(0, 60);
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 120);
  } catch (_) {
    return 'unparseable';
  }
}

export async function POST(req: Request) {
  const { limited } = rateLimit(req, { max: 20, windowMs: 60_000, prefix: 'csp' });
  if (limited) return new NextResponse(null, { status: 429 });

  let raw: string;
  try {
    raw = await req.text();
  } catch (_) {
    return new NextResponse(null, { status: 204 });
  }
  if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch (_) {
    return new NextResponse(null, { status: 204 });
  }

  // Two wire formats: the old `report-uri` shape and the newer Reporting API
  // array. Both are accepted because browsers disagree about which to send.
  const asRecord = body as Record<string, unknown>;
  const reports: Array<Record<string, unknown>> = Array.isArray(body)
    ? (body as Array<Record<string, unknown>>).map((r) => (r?.body as Record<string, unknown>) ?? r)
    : [(asRecord['csp-report'] as Record<string, unknown>) ?? asRecord];

  for (const r of reports.slice(0, 10)) {
    if (!r || typeof r !== 'object') continue;
    console.warn('[csp]', {
      directive: scrub(r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive']),
      blocked: scrub(r['blocked-uri'] ?? r.blockedURL),
      document: scrub(r['document-uri'] ?? r.documentURL),
    });
  }

  // 204 always: a browser has nothing useful to do with an error here, and a
  // failing report endpoint must never be visible to someone using the site.
  return new NextResponse(null, { status: 204 });
}
