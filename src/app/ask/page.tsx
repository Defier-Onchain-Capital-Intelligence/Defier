import type { Metadata } from 'next';
import { pageMeta } from '@/lib/pageMeta';
import { Suspense } from 'react';
import { AskScreen } from '@/components/AskScreen';
import { Skeleton } from '@/components/ui/Primitives';


export const metadata: Metadata = pageMeta({
  title: 'Ask',
  description: 'Ask about a wallet and get answers built only from figures the engine computed, never estimated.',
  wallet: true,
});

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
