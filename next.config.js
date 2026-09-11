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
   * Response headers we were not sending at all.
   *
   * Deliberately not a Content-Security-Policy. A strict CSP on a page that
   * loads a wallet SDK, an injected browser extension and remote token images
   * is a real testing exercise, and a CSP that is wrong locks people out of
   * connecting their wallet. It is worth doing and it is worth doing with the
   * time to verify it, not shipped blind. Everything here is safe to send
   * today and costs nothing.
   *
   * Note what is absent: X-Frame-Options and frame-ancestors. This app is a
   * Base Mini App, which means it is meant to run inside another client's
   * iframe, and forbidding that would remove the surface it was built for.
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
