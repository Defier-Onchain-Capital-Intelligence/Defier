import type { Metadata } from 'next';
import { pageMeta } from '@/lib/pageMeta';
import { redirect } from 'next/navigation';


export const metadata: Metadata = pageMeta({
  title: 'Explore Base',
  description: 'What is happening across liquidity on Base right now.',
  path: '/explore',
});

/** Explore became Find pools inside the Pools screen. Old links keep working. */
export const dynamic = 'force-dynamic';

export default function ExplorePage() {
  redirect('/pools?tab=find');
}
