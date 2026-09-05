import { Suspense } from 'react';
import { HoldingsView } from '@/components/HoldingsView';
import { Skeleton, EmptyState } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

export default async function HoldingsPage({
  searchParams,
}: { searchParams: Promise<{ wallet?: string; tab?: string }> }) {
  const { wallet, tab } = await searchParams;
  const clean = wallet?.toLowerCase();

  if (!clean || !/^0x[0-9a-f]{40}$/.test(clean)) {
    return <EmptyState title="No wallet yet" body="Open a wallet from the portfolio screen to see what it holds." />;
  }
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <HoldingsView address={clean} initialTab={tab === 'stocks' ? 'stocks' : 'crypto'} />
    </Suspense>
  );
}
