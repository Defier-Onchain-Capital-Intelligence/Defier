import { Suspense } from 'react';
import { SimulateView } from '@/components/SimulateView';
import { Skeleton } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

/** Values can be preloaded from a real position, so the simulator starts from
 *  something the user already has rather than from invented defaults. */
export default async function SimulatePage({
  searchParams,
}: {
  searchParams: Promise<{
    entry?: string; low?: string; high?: string; size?: string; apr?: string; days?: string;
    pair?: string; variant?: string; project?: string;
    s0?: string; s1?: string; a0?: string; a1?: string; from?: string;
  }>;
}) {
  const q = await searchParams;
  const num = (value?: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  // Anything that reaches the browser as a label is bounded and stripped: these
  // values arrive in a URL anyone can edit.
  const text = (value?: string, max = 24) =>
    value ? value.replace(/[<>"'`]/g, '').slice(0, max) : undefined;
  const addr = (value?: string) =>
    value && /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : undefined;

  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <SimulateView
        preset={{
          entryPrice: num(q.entry), lowerPrice: num(q.low), upperPrice: num(q.high),
          positionUsd: num(q.size), aprPct: num(q.apr), days: num(q.days),
        }}
        context={{
          symbol: text(q.pair, 32),
          variant: text(q.variant, 8),
          project: text(q.project, 32),
          symbol0: text(q.s0, 12),
          symbol1: text(q.s1, 12),
          address0: addr(q.a0),
          address1: addr(q.a1),
          source: q.from === 'position' ? 'position' : q.from === 'pool' ? 'pool' : undefined,
        }}
      />
    </Suspense>
  );
}
