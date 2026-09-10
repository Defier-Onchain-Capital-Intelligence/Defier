import { Suspense } from 'react';
import { AskScreen } from '@/components/AskScreen';
import { Skeleton } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

export default async function AskPage({
  searchParams,
}: { searchParams: Promise<{ wallet?: string }> }) {
  const { wallet } = await searchParams;
  const clean = wallet?.toLowerCase();
  const valid = clean && /^0x[0-9a-f]{40}$/.test(clean) ? clean : undefined;

  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <AskScreen param={valid} />
    </Suspense>
  );
}
