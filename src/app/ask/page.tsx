import { Suspense } from 'react';
import { AskView } from '@/components/AskView';
import { Skeleton } from '@/components/ui/Primitives';
import { WalletGate } from '@/components/WalletGate';

export const dynamic = 'force-dynamic';

export default async function AskPage({
  searchParams,
}: { searchParams: Promise<{ wallet?: string }> }) {
  const { wallet } = await searchParams;
  const clean = wallet?.toLowerCase();

  const valid = clean && /^0x[0-9a-f]{40}$/.test(clean) ? clean : undefined;

  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <WalletGate
        param={valid}
        body="Connect a wallet or open one from the portfolio screen, then come back to ask about it."
      >
        {(address) => <AskView address={address} />}
      </WalletGate>
    </Suspense>
  );
}
