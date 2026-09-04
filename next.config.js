/** @type {import('next').NextConfig} */
const nextConfig = {
  // ethers v5 is CommonJS and must not be bundled into the server build.
  serverExternalPackages: ['ethers'],

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
