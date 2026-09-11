import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ReportView } from '@/components/ReportView';
import { WalletEntry } from '@/components/WalletEntry';
import { Skeleton, Card, Label } from '@/components/ui/Primitives';
import { DEMO_WALLET } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'What has impermanent loss actually cost you? · DeFier',
  description:
    'Every liquidity position a wallet has ever opened on Base, rebuilt from onchain events '
    + 'and valued at the price of the day each one happened. Including the ones whose NFT was burned.',
};

export default async function ReportPage({
  searchParams,
}: { searchParams: Promise<{ address?: string; wallet?: string }> }) {
  const q = await searchParams;
  const clean = (q.address || q.wallet || '').toLowerCase();

  if (!/^0x[0-9a-f]{40}$/.test(clean)) {
    return (
      <div className="space-y-6 pt-6">
        <div>
          <p className="label text-accent-text">The number nobody can look up</p>
          <h1 className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-tight">
            What has impermanent
            <br />loss actually cost you?
          </h1>
          <p className="muted mt-3 leading-relaxed">
            Every liquidity position this wallet has ever opened on Base, rebuilt from onchain
            events and valued at the price of the day each one happened — including the ones
            whose NFT was burned and which no dashboard can still see.
          </p>
        </div>

        <WalletEntry demoWallet={DEMO_WALLET} />

        <Card>
          <Label>Why almost nobody knows their figure</Label>
          <p className="muted mt-2 text-[0.8125rem] leading-relaxed">
            Working it out means valuing every deposit and every withdrawal at its own historical
            price, across positions that may no longer exist onchain. Calculators ask you to type
            in one entry price and one exit price, which answers a question nobody actually had.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <ReportView address={clean} />
    </Suspense>
  );
}
