import { Suspense } from 'react';
import { AskView } from '@/components/AskView';
import { Skeleton, EmptyState } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

export default async function AskPage({
  searchParams,
}: { searchParams: Promise<{ wallet?: string }> }) {
  const { wallet } = await searchParams;
  const clean = wallet?.toLowerCase();

  if (!clean || !/^0x[0-9a-f]{40}$/.test(clean)) {
    return <EmptyState title="No wallet yet" body="Open a wallet from the portfolio screen, then come back to ask about it." />;
  }
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <AskView address={clean} />
    </Suspense>
  );
}
