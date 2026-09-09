import { Suspense } from 'react';
import { HoldingsView } from '@/components/HoldingsView';
import { Skeleton } from '@/components/ui/Primitives';
import { WalletGate } from '@/components/WalletGate';

export const dynamic = 'force-dynamic';

export default async function HoldingsPage({
  searchParams,
}: { searchParams: Promise<{ wallet?: string; tab?: string }> }) {
  const { wallet, tab } = await searchParams;
  const clean = wallet?.toLowerCase();
  const valid = clean && /^0x[0-9a-f]{40}$/.test(clean) ? clean : undefined;

  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <WalletGate
        param={valid}
        body="Connect a wallet or open one from the portfolio screen to see what it holds."
      >
        {(address) => (
          <HoldingsView
            address={address}
            initialTab={tab === 'stocks' ? 'stocks' : tab === 'crypto' ? 'crypto' : 'all'}
          />
        )}
      </WalletGate>
    </Suspense>
  );
}
