'use client';
/**
 * The client half of the Ask screen.
 *
 * WalletGate decides which wallet a screen is about, and it can only do that in
 * the browser, so it takes its child as a function it calls with the address it
 * resolved. A function cannot cross from a server component into a client one:
 * React has to serialise everything it sends over that boundary, and a closure
 * has nothing to serialise. Rendering it anyway does not fail at build time, it
 * fails on the request, which is how this reached production looking fine.
 *
 * So the whole gate lives on this side of the line, and the server page hands
 * down a string.
 */
import { AskView } from '@/components/AskView';
import { WalletGate } from '@/components/WalletGate';

export function AskScreen({ param }: { param?: string }) {
  return (
    <WalletGate
      param={param}
      body="Connect a wallet or open one from the portfolio screen, then come back to ask about it."
    >
      {(address) => <AskView address={address} />}
    </WalletGate>
  );
}
