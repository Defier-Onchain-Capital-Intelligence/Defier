import { APP_URL } from '@/lib/env';

export const dynamic = 'force-static';

/**
 * Written by hand rather than through Next's robots helper, because the two
 * lines that matter most here are ones that helper cannot emit: a pointer to
 * llms.txt, and a comment telling a reader where the machine-readable contract
 * lives. A crawler ignores both; an agent reading the file does not, and
 * robots.txt is the one path every agent already knows to try.
 *
 * Everything disallowed below is disallowed for a single reason: it carries
 * somebody's wallet. The chain is public, but there is a difference between
 * data anyone can look up and a page that surfaces when you search a person's
 * address. The market pages, the calculator and the docs stay open, because
 * those mean the same thing to everyone.
 *
 * AI crawlers are not blocked. This product wants to be quoted by models; what
 * it cannot afford is being quoted wrongly, which is what llms.txt and the
 * measurement policy are for.
 */
export function GET() {
  const base = APP_URL.replace(/\/$/, '');

  const body = `# ${base}
#
# DeFier reads public onchain data on Base and reports what a wallet's capital
# actually earned. Read only: it never builds a transaction and never asks for
# a signature.
#
# For agents:
#   ${base}/llms.txt                  how to read this site, and what each figure claims
#   ${base}/api/v1/openapi.json       the machine-readable API contract
#   ${base}/docs/measurement          what is measured, and what is deliberately not claimed
#
# Anything below that is disallowed is disallowed because it names a wallet.

User-agent: *
Allow: /
Disallow: /api/
Disallow: /ask
Disallow: /holdings
Disallow: /positions
Disallow: /position/
Disallow: /report
Disallow: /c/
Disallow: /s/

Sitemap: ${base}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
