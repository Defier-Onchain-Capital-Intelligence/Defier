import { redirect } from 'next/navigation';

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
