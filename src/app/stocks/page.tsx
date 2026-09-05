import { Suspense } from 'react';
import { StocksView } from '@/components/StocksView';
import { Skeleton, EmptyState } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

export default async function StocksPage({
  searchParams,
}: { searchParams: Promise<{ wallet?: string }> }) {
  const { wallet } = await searchParams;
  const clean = wallet?.toLowerCase();

  if (!clean || !/^0x[0-9a-f]{40}$/.test(clean)) {
    return <EmptyState title="No wallet yet" body="Open a wallet from the portfolio screen to see its tokenized stocks." />;
  }
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <StocksView address={clean} />
    </Suspense>
  );
}
