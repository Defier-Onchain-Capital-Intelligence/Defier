import { Suspense } from 'react';
import { PoolsView } from '@/components/PoolsView';
import { Skeleton } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

export default async function PoolsPage({
  searchParams,
}: { searchParams: Promise<{ wallet?: string; tab?: string }> }) {
  const { wallet, tab } = await searchParams;
  const clean = wallet?.toLowerCase();
  const valid = clean && /^0x[0-9a-f]{40}$/.test(clean) ? clean : undefined;

  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <PoolsView address={valid} initialTab={tab === 'find' ? 'find' : 'mine'} />
    </Suspense>
  );
}
