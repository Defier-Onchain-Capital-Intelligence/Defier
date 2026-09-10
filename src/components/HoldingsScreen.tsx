'use client';
/** The client half of the Holdings screen. See AskScreen for why it exists. */
import { HoldingsView } from '@/components/HoldingsView';
import { WalletGate } from '@/components/WalletGate';

export function HoldingsScreen({ param, tab }: { param?: string; tab?: string }) {
  return (
    <WalletGate
      param={param}
      body="Connect a wallet or open one from the portfolio screen to see what it holds."
    >
      {(address) => (
        <HoldingsView
          address={address}
          initialTab={tab === 'stocks' ? 'stocks' : tab === 'crypto' ? 'crypto' : 'all'}
        />
      )}
    </WalletGate>
  );
}
