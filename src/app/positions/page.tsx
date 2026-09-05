import { Suspense } from 'react';
import { PositionsView } from '@/components/PositionsView';
import { Skeleton, EmptyState } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

export default async function PositionsPage({
  searchParams,
}: { searchParams: Promise<{ wallet?: string; tab?: string }> }) {
  const { wallet, tab } = await searchParams;
  const clean = wallet?.toLowerCase();

  if (!clean || !/^0x[0-9a-f]{40}$/.test(clean)) {
    return <EmptyState title="No wallet yet" body="Open a wallet from the portfolio screen to see its positions." />;
  }

  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <PositionsView address={clean} initialTab={tab === 'closed' ? 'closed' : 'open'} />
    </Suspense>
  );
}
