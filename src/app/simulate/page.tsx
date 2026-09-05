import { Suspense } from 'react';
import { SimulateView } from '@/components/SimulateView';
import { Skeleton } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

/** Values can be preloaded from a real position, so the simulator starts from
 *  something the user already has rather than from invented defaults. */
export default async function SimulatePage({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string; low?: string; high?: string; size?: string; apr?: string; days?: string }>;
}) {
  const q = await searchParams;
  const num = (value?: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <SimulateView preset={{
        entryPrice: num(q.entry), lowerPrice: num(q.low), upperPrice: num(q.high),
        positionUsd: num(q.size), aprPct: num(q.apr), days: num(q.days),
      }} />
    </Suspense>
  );
}
