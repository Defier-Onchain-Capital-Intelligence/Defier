import type { Metadata } from 'next';
import { pageMeta } from '@/lib/pageMeta';
import { Suspense } from 'react';
import { HoldingsScreen } from '@/components/HoldingsScreen';
import { Skeleton } from '@/components/ui/Primitives';


export const metadata: Metadata = pageMeta({
  title: 'Holdings',
  description: 'Everything a Base wallet holds: in the wallet, inside liquidity positions, and supplied to or borrowed from lenders.',
  wallet: true,
});

export const dynamic = 'force-dynamic';

export default async function HoldingsPage({
  searchParams,
}: { searchParams: Promise<{ wallet?: string; tab?: string }> }) {
  const { wallet, tab } = await searchParams;
  const clean = wallet?.toLowerCase();
  const valid = clean && /^0x[0-9a-f]{40}$/.test(clean) ? clean : undefined;

  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <HoldingsScreen param={valid} tab={tab} />
    </Suspense>
  );
}
