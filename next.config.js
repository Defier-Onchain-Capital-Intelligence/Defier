/**
 * Where we would like the policy to end up, sent in report-only mode until the
 * reports say which parts are impossible.
 *
 * `connect-src 'self'` is deliberately too strict: a wallet SDK plainly needs
 * more than that, and the violation reports are how we find out exactly what,
 * with hostnames, instead of pasting a list from somebody else's blog post.
 * The same goes for img-src and token logos.
 *
 * 'unsafe-inline' for styles is not a concession — Next.js ships inline style
 * attributes and there is no version of this app without them. Scripts are a
 * different matter and this asks for none, which the reports will contradict;
 * the fix then is a nonce, not a shrug.
 */
const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'report-uri /api/csp-report',
].join('; ');

/**
 * Enforced today, because every line of it was measured first.
 *
 * Walking six screens with the report-only policy on — home, Holdings, Earn,
 * Pools, Ask, Simulate, Explore — produced violations in exactly two
 * directives: img-src, for token logos, and connect-src. Everything listed
 * here reported NOTHING on any screen, which is the only reason it is safe to
 * close. See SECURITY.md section 10 for the evidence.
 *
 * connect-src is now closed too, on a list that was earned rather than
 * assumed. Six screens gave three origins; actually CONNECTING a wallet gave a
 * fourth, api.coinbase.com, which no amount of browsing would have revealed —
 * which is exactly why it was held back until somebody connected one. Two more
 * come from reading the wallet SDK's own constants rather than waiting to be
 * surprised by them: keys.coinbase.com and rpc.wallet.coinbase.com, reachable
 * in flows nobody exercised here.
 *
 * What is NOT in that list is the point of it. cca-lite.coinbase.com, the
 * Amplitude endpoint the wallet SDK reports to, is left out deliberately: the
 * browser blocks it, which is the one lever we have, since the SDK flag that
 * would switch it off is unreachable behind OnchainKit's connector. That this
 * is safe is not a hope — Alberto's own ad blocker was already blocking it
 * during testing and the SDK swallowed the failure ("Analytics SDK: Failed to
 * fetch") with the app working normally throughout.
 *
 * Deliberately absent:
 *
 *   script-src — needs a per-request nonce, because the browser's own hashes
 *   differ from page to page. That is middleware, and middleware that fails to
 *   put the nonce on one inline script produces a blank page. It is insurance
 *   against an XSS this app has no route to today: the only three places that
 *   write raw HTML all render our own markdown, and attacker-controlled text
 *   (token symbols, which Morpho makes permissionless) is escaped by React and
 *   clamped by safeSymbol before that.
 *
 * `upgrade-insecure-requests` sits here after the browser said outright that it
 * is ignored in a report-only policy.
 */
const ENFORCED_CSP = [
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Token logos come from DeFiLlama's icon host. 196 of the violations on that
  // six-screen walk were this one host and nothing else.
  "img-src 'self' data: https://token-icons.llamao.fi",
  "font-src 'self' data:",
  "frame-src 'self'",
  "worker-src 'self' blob:",
  // Next.js ships inline style attributes and there is no version of this app
  // without them. Saying so is better than a directive that pretends otherwise.
  "style-src 'self' 'unsafe-inline'",
  // The directive that actually matters for a product that reads other
  // people's money. The realistic bad day here is not an injected script, it
  // is a compromised dependency — and this is what stops one sending what it
  // read to somewhere we never named, even while its code runs.
  [
    "connect-src 'self'",
    'https://api.developer.coinbase.com',  // OnchainKit's Base RPC
    'https://api.coinbase.com',            // seen only when a wallet connects
    'https://keys.coinbase.com',           // Coinbase Keys, from the SDK's constants
    'https://rpc.wallet.coinbase.com',     // ditto
    'https://ethereum.reth.rs',            // wagmi on mainnet, for ENS names
  ].join(' '),
  // Safe to state now that connect-src is explicit: default-src is its
  // fallback, so this would have closed connect-src by the back door.
  "default-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ethers v5 is CommonJS and must not be bundled into the server build.
  serverExternalPackages: ['ethers'],

  /**
   * docs.getdefier.com serves the documentation and nothing else.
   *
   * A subdomain pointed at the same project would otherwise serve the whole app
   * from a second address — the report, the pools, every card — which is two
   * canonical URLs for every page and a worse thing to hand a search engine than
   * no subdomain at all. So on that host the documentation is lifted to the root
   * and the rest of the app is simply not reachable there.
   *
   * `beforeFiles` because this has to run before the router matches a real page:
   * the point is that /roadmap on the docs host is /docs/roadmap, not a 404.
   * API routes, build assets and anything with a file extension are left alone,
   * since Open Graph images and the manifest are fetched by absolute URL.
   */
  /**
   * Response headers, and a Content-Security-Policy in two halves.
   *
   * The reason this was deferred for days is real: a strict CSP on a page that
   * loads a wallet SDK, an injected browser extension and remote token images
   * is a testing exercise, and a wrong one locks people out of connecting
   * their wallet. What was wrong was treating that as a reason to ship
   * nothing.
   *
   * The origins a wallet SDK reaches cannot be found by reading our source —
   * they are inside the SDK, and grepping our files turns up only the hosts we
   * call ourselves. Guessing the rest and enforcing the guess is exactly the
   * mistake being avoided. So the policy is split by what is actually known:
   *
   *   ENFORCED — the directives that cannot break a wallet connection, because
   *   nothing legitimate here uses them at all. object-src 'none' kills Flash
   *   and applet embeds; base-uri 'self' stops an injected <base> tag from
   *   re-pointing every relative URL on the page at somebody else's server;
   *   form-action 'self' stops a form from posting a wallet address off-site.
   *   None of these can cost a user anything, and all three close real holes.
   *
   *   REPORT ONLY — the rest, written as strictly as we would like to end up,
   *   so the browser tells us precisely which origins the wallet SDK needs
   *   instead of us inventing a list. Violations go to /api/csp-report. When
   *   the reports from real traffic have been read, the report-only policy
   *   becomes the enforced one, minus whatever they prove is required.
   *
   * Note what is absent from both: X-Frame-Options and frame-ancestors. This
   * app is a Base Mini App, meant to run inside another client's iframe, and
   * forbidding that would remove the surface it was built for.
   */
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        // Stops a browser from second-guessing a declared content type, which
        // is how a file that claims to be JSON ends up executed as script.
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        // A wallet address should not travel to a third party in a Referer
        // header. Same-origin navigations keep the full path; anything leaving
        // the site sends the origin alone.
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // We ask for none of these, so no embedded frame should be able to.
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
        // Two years, subdomains included. The host already redirects to HTTPS;
        // this stops the first request of a session being made in the clear.
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        // Safe to enforce today: nothing here legitimately uses any of them.
        { key: 'Content-Security-Policy', value: ENFORCED_CSP },
        // Strict on purpose, and reporting rather than blocking, so the
        // browser names the origins the wallet SDK needs.
        { key: 'Content-Security-Policy-Report-Only', value: REPORT_ONLY_CSP },
      ],
    }];
  },

  async rewrites() {
    const onDocsHost = [{ type: 'host', value: 'docs.getdefier.com' }];
    return {
      beforeFiles: [
        { source: '/', has: onDocsHost, destination: '/docs' },
        {
          source: '/:path((?!api|_next|docs|\\.well-known)(?!.*\\.).*)',
          has: onDocsHost,
          destination: '/docs/:path',
        },
      ],
    };
  },

  webpack: (config, { webpack }) => {
    // OnchainKit pulls in wagmi's baseAccount connector, which pulls in
    // @coinbase/cdp-sdk, which optionally imports @x402/* for onchain payments.
    // Those are optional peer dependencies we deliberately do not install:
    // this app is read only and never builds a transaction, so the x402 code
    // path is unreachable. Installing four packages to satisfy dead code would
    // widen the dependency surface for nothing (SECURITY.md section 6).
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }));
    return config;
  },
};

module.exports = nextConfig;
