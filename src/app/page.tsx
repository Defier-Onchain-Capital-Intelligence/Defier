import { Suspense } from 'react';
import type { Metadata } from 'next';
import { NO_INDEX } from '@/lib/pageMeta';
import { Disclaimer } from '@/components/Disclaimer';
import { PortfolioHome } from '@/components/PortfolioHome';
import { WalletEntry } from '@/components/WalletEntry';
import { Card, Label, Skeleton } from '@/components/ui/Primitives';
import { DEMO_WALLET } from '@/lib/env';
import { getCapitalStats } from '@/lib/capital';
import { usd } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The landing page is a public page; the same URL carrying ?address= is a
 * report about somebody's wallet. Same route, two different things, so the
 * indexing decision has to be made per request rather than declared once.
 */
export async function generateMetadata({
  searchParams,
}: { searchParams: Promise<{ address?: string }> }): Promise<Metadata> {
  const { address } = await searchParams;
  if (address) return { robots: NO_INDEX };
  return { alternates: { canonical: '/' } };
}

/**
 * Home. With an address, the portfolio. Without one, the shortest possible
 * explanation of what this is and a way to try it on a real wallet in one tap.
 */
export default async function HomePage({
  searchParams,
}: { searchParams: Promise<{ address?: string }> }) {
  const { address } = await searchParams;
  const clean = address?.toLowerCase();

  if (clean && /^0x[0-9a-f]{40}$/.test(clean)) {
    return (
      <Suspense fallback={<Skeleton className="h-64" />}>
        <PortfolioHome address={clean} />
      </Suspense>
    );
  }

  const stats = await getCapitalStats();

  return (
    <div className="space-y-6 pt-8">
      <div>
        <p className="label text-accent-text">Onchain capital intelligence</p>
        <h1 className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-tight">
          Know what your capital
          <br />is actually earning.
        </h1>
        <p className="muted mt-3 leading-relaxed">
          Did your DeFi actually beat holding? Paste a wallet and find out.
        </p>
      </div>

      <WalletEntry demoWallet={DEMO_WALLET} />

      {stats && stats.walletsAnalyzed > 0 ? (
        <Card>
          <Label>Total capital analysed</Label>
          <p className="kpi mt-1">{usd(stats.totalCapitalUsd)}</p>
          <p className="text-xs text-ink-muted mt-1">
            across {stats.walletsAnalyzed} {stats.walletsAnalyzed === 1 ? 'wallet' : 'wallets'}
          </p>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {[
          ['True P&L, not a balance', 'Every deposit, withdrawal, fee and reward valued at the price of the day it happened.'],
          ['LP vs HODL', 'The counterfactual nobody computes: the same tokens, left alone.'],
          ['Tokenized stocks', 'Coinbase B20 assets as first class holdings, and detected inside your pools.'],
        ].map(([title, body]) => (
          <div key={title} className="card-p">
            <p className="text-sm font-medium">{title}</p>
            <p className="muted mt-1 text-[0.8125rem] leading-relaxed">{body}</p>
          </div>
        ))}
      </div>

      <Disclaimer />
    </div>
  );
}
