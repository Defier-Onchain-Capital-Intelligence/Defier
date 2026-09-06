'use client';
/**
 * Providers for Base.
 *
 * MiniKit is switched on through OnchainKit rather than stacked as a second
 * provider. Inside Base App it supplies the mini app context — who is viewing,
 * whether they have added the app — and outside it that context is simply null,
 * which is what lets one build serve a web page and a mini app with no second
 * code path and no feature detection scattered through the screens.
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
      config={{ appearance: { name: 'DeFier', mode: 'dark', theme: 'default' } }}
      miniKit={{ enabled: true }}
    >
      {children}
    </OnchainKitProvider>
  );
}
