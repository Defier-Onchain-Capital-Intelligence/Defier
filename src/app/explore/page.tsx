import { redirect } from 'next/navigation';

/** Explore became Find pools inside the Pools screen. Old links keep working. */
export const dynamic = 'force-dynamic';

export default function ExplorePage() {
  redirect('/pools?tab=find');
}
