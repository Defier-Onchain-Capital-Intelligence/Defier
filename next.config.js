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
