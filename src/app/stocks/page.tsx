import type { Metadata } from 'next';
import { pageMeta } from '@/lib/pageMeta';
import { redirect } from 'next/navigation';


export const metadata: Metadata = pageMeta({
  title: 'Tokenized stocks on Base',
  description: 'Coinbase B20 tokenized equities on Base, and the liquidity pools that hold them.',
  path: '/stocks',
});

/** The stocks screen became one half of Holdings. Old links keep working. */
export const dynamic = 'force-dynamic';

export default async function StocksPage({
  searchParams,
}: { searchParams: Promise<{ wallet?: string }> }) {
  const { wallet } = await searchParams;
  const clean = wallet?.toLowerCase();
  const query = clean && /^0x[0-9a-f]{40}$/.test(clean) ? `&wallet=${clean}` : '';
  redirect(`/holdings?tab=stocks${query}`);
}
