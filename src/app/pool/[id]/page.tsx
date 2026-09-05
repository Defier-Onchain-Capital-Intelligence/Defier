import { Suspense } from 'react';
import { PoolDetailView } from '@/components/PoolDetailView';
import { Skeleton, EmptyState } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

export default async function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]{8,64}$/i.test(id)) {
    return <EmptyState title="Unknown pool" body="That pool id does not look right." />;
  }
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <PoolDetailView id={id} />
    </Suspense>
  );
}
