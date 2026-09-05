import { Suspense } from 'react';
import { PositionDetail } from '@/components/PositionDetail';
import { Skeleton, EmptyState } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

export default async function PositionPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wallet?: string }>;
}) {
  const { id } = await params;
  const { wallet } = await searchParams;
  const clean = wallet?.toLowerCase();

  if (!clean || !/^0x[0-9a-f]{40}$/.test(clean)) {
    return <EmptyState title="No wallet" body="Open this position from the positions list." />;
  }

  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <PositionDetail id={decodeURIComponent(id)} wallet={clean} />
    </Suspense>
  );
}
