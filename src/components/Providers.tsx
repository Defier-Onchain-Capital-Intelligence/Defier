'use client';
/**
 * OnchainKit provider for Base.
 *
 * OnchainKit ships its own wagmi + react-query defaults (DefaultOnchainKitProviders),
 * so we do not wrap our own WagmiProvider here. If we ever need custom connectors,
 * add a WagmiProvider above this one and OnchainKit will pick it up.
 *
 * The API key is public by design (NEXT_PUBLIC_). What protects it is the allowed
 * domain list in the CDP portal, not secrecy. See SECURITY.md section 1.
 *
 * This app is read only: it never requests a signature and never builds a transaction.
 */
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'wagmi/chains';
// OnchainKit's stylesheet is NOT imported here on purpose: it ships compiled with
// Tailwind v4 and our project is on Tailwind v3, so routing it through PostCSS
// breaks the build. scripts/copy-onchainkit-styles.mjs copies it to /public and
// app/layout.tsx links it directly. See README.

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={base}
      config={{ appearance: { name: 'DeFier', mode: 'light', theme: 'default' } }}
    >
      {children}
    </OnchainKitProvider>
  );
}
