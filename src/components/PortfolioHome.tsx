'use client';
/**
 * Home. The answer first, the detail after.
 *
 * The hero is the value of what is deployed now. Directly under it, in words,
 * what that capital did against simply holding the same tokens, because that
 * sentence is the entire product. Everything below is evidence for it.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Portfolio } from '@/types/portfolio';
import { fetchPortfolio } from '@/lib/api';
import { usd, toneOf } from '@/lib/format';
import { Card, Label, ExposureBar, Skeleton, ConfidenceNote, EmptyState } from '@/components/ui/Primitives';
import { PositionRow } from '@/components/PositionRow';
import { ScenarioCard } from '@/components/ScenarioCard';
import { ObservationsCard } from '@/components/ObservationsCard';
import { WalletBadge } from '@/components/WalletBadge';

export function PortfolioHome({ address }: { address: string }) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPnl, setLoadingPnl] = useState(true);

  useEffect(() => {
    let live = true;
    setData(null); setError(null); setLoadingPnl(true);

    // Live state first so the screen is useful in a second, then the historical
    // pass fills in P&L. Waiting for the slow half before showing anything is
    // how a fast product feels slow.
    fetchPortfolio(address)
      .then((quick) => { if (live) setData(quick); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => {
        fetchPortfolio(address, { deep: true })
          .then((full) => { if (live) setData(full); })
          .catch(() => { /* keep the quick view */ })
          .finally(() => { if (live) setLoadingPnl(false); });
      });

    return () => { live = false; };
  }, [address]);

  if (error) {
    return <EmptyState title="We could not read that wallet" body={error} />;
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-32" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const { summary, exposure, positions } = data;
  const open = positions.filter((p) => !p.closed);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <Label>Your capital on Base</Label>
          <p className="hero-num mt-1">{usd(summary.totalValueUsd)}</p>
        </div>
        <WalletBadge address={address} />
      </header>

      <Card>
        <p className="text-[0.9375rem] leading-relaxed">{summary.headline}</p>
        {loadingPnl && !summary.open.netPnlUsd ? (
          <p className="mt-2 text-xs text-ink-muted">Reconstructing history…</p>
        ) : null}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <Label>Deployed</Label>
            <p className="mt-1 font-semibold tnum">{usd(summary.lpValueUsd)}</p>
          </div>
          <div>
            <Label>Fees earned</Label>
            <p className="mt-1 font-semibold tnum text-gain">{usd(summary.feesTotalUsd)}</p>
          </div>
          <div>
            <Label>Rewards</Label>
            <p className="mt-1 font-semibold tnum text-gain">{usd(summary.incentivesTotalUsd)}</p>
          </div>
        </div>
      </Card>

      {summary.historyHeadline ? (
        <Link href={`/positions?wallet=${address}&tab=closed`} className="block">
          <Card className="hover:bg-bg-elevated/40 transition-colors">
            <Label>History</Label>
            <p className="mt-1.5 text-sm text-ink-secondary leading-relaxed">{summary.historyHeadline}</p>
            <p className={`mt-2 text-sm font-semibold tnum ${toneOf(summary.allTime.lpVsHodlUsd)}`}>
              {usd(summary.allTime.lpVsHodlUsd, { sign: true })} vs holding, all time
            </p>
          </Card>
        </Link>
      ) : null}

      {exposure.byClass.length ? (
        <Card>
          <div className="flex items-baseline justify-between">
            <Label>Exposure</Label>
            <span className="text-xs text-ink-muted tnum">{exposure.marketBiasPct.toFixed(0)}% at market risk</span>
          </div>
          <div className="mt-3"><ExposureBar slices={exposure.byClass} /></div>
        </Card>
      ) : null}

      {data.holdings?.stocks?.totalUsd ? (
        // Only worth the space once both sides exist. With no stocks, "crypto"
        // is just another word for the total and the card says nothing.
        <div className="grid grid-cols-2 gap-3">
          {([['crypto', 'Crypto', data.holdings.crypto], ['stocks', 'Stocks', data.holdings.stocks]] as const).map(
            ([key, label, bucket]) => (
              <Link key={key} href={`/holdings?wallet=${address}&tab=${key}`}>
                <Card className="h-full transition-colors hover:bg-bg-elevated/40">
                  <Label>{label}</Label>
                  <p className="mt-1 font-semibold tnum">{usd(bucket.totalUsd)}</p>
                  <p className="mt-0.5 text-xs text-ink-muted tnum">{bucket.pctOfPortfolio.toFixed(0)}% of the total</p>
                </Card>
              </Link>
            ),
          )}
        </div>
      ) : null}

      {data.scenarios ? <ScenarioCard scenarios={data.scenarios} /> : null}

      <ObservationsCard observations={data.observations} address={address} />

      <Card>
        <div className="flex items-baseline justify-between">
          <Label>Open positions</Label>
          <Link href={`/positions?wallet=${address}`} className="text-xs text-accent">See all</Link>
        </div>
        {open.length === 0 ? (
          <p className="muted mt-3">No open liquidity positions on Base.</p>
        ) : (
          <div className="divide-hair mt-1">
            {open.slice(0, 4).map((p) => <PositionRow key={p.id} position={p} wallet={address} />)}
          </div>
        )}
      </Card>

      {data.warnings.length ? (
        <ConfidenceNote confidence="partial" notes={data.warnings} />
      ) : null}

      <p className="px-1 text-center text-[0.6875rem] leading-relaxed text-ink-muted">
        Informational only, not investment advice. DeFier is read only and never executes transactions.
        Tokenized stocks are available only to eligible users outside the United States.
      </p>
    </div>
  );
}
