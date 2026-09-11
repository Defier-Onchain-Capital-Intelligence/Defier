import { APP_URL } from '@/lib/env';

export const dynamic = 'force-static';

/**
 * RFC 9116. Where to report a vulnerability, at the path researchers check
 * first. Cheap to serve and the alternative is someone finding a problem in a
 * product about money and having nowhere to send it.
 *
 * Expires is required by the spec and is deliberately short: a stale
 * security.txt is worse than none, because it promises an address that may no
 * longer be read. One year, renewed with the deploy that notices.
 */
export function GET() {
  const base = APP_URL.replace(/\/$/, '');
  const expires = new Date(Date.UTC(2027, 8, 11)).toISOString();

  const body = `Contact: mailto:security@getdefier.com
Expires: ${expires}
Preferred-Languages: en, es
Canonical: ${base}/.well-known/security.txt
Policy: ${base}/docs/security
`;

  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
