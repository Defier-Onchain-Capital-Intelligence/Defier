import type { Metadata } from 'next';
import { pageMeta } from '@/lib/pageMeta';
import { redirect } from 'next/navigation';


export const metadata: Metadata = pageMeta({
  title: 'Positions',
  description: 'Every liquidity position a Base wallet has open and every one it has closed.',
  wallet: true,
});

/** Positions became My pools inside the Pools screen. Old links keep working. */
export const dynamic = 'force-dynamic';

export default async function PositionsPage({
  searchParams,
}: { searchParams: Promise<{ wallet?: string }> }) {
  const { wallet } = await searchParams;
  const clean = wallet?.toLowerCase();
  const query = clean && /^0x[0-9a-f]{40}$/.test(clean) ? `&wallet=${clean}` : '';
  redirect(`/pools?tab=mine${query}`);
}
