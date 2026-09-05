'use client';
/**
 * Positions, split by whether capital is still inside.
 *
 * Open and Closed, not In range and Out of range. A position that has drifted out
 * of its range still holds your money and still needs attention; one that has been
 * withdrawn is history. Sorting by range would put those two in the same bucket.
 */
import { useState } from 'react';
import type { Portfolio } from '@/types/portfolio';
import { usePortfolio } from '@/lib/usePortfolio';
import { usd, toneOf, relativeDays } from '@/lib/format';
import { Card, Label, Skeleton, EmptyState } from '@/components/ui/Primitives';
import { PositionRow } from '@/components/PositionRow';

type Tab = 'open' | 'closed';

export function PositionsView({ address, initialTab }: { address: string; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { data, error } = usePortfolio(address, { deep: true });

  if (error) return <EmptyState title="We could not read that wallet" body={error} />;
  if (!data) return <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-48" /></div>;

  const open = data.positions.filter((p) => !p.closed);
  const closed = data.positions.filter((p) => p.closed);
  const shown = tab === 'open' ? open : closed;
  const { lifetime } = data.summary;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Positions</h1>

      <div className="flex gap-1 rounded-xl bg-bg-surface border border-bg-border p-1">
        {([['open', `Open (${open.length})`], ['closed', `History (${closed.length})`]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`tab ${tab === key ? 'tab-active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'closed' ? (
        <Card>
          <Label>This wallet, all time</Label>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-ink-muted">Net P&amp;L</p>
              <p className={`mt-0.5 font-semibold tnum ${toneOf(lifetime.netPnlUsd)}`}>
                {usd(lifetime.netPnlUsd, { sign: true })}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">vs holding</p>
              <p className={`mt-0.5 font-semibold tnum ${toneOf(lifetime.lpVsHodlUsd)}`}>
                {usd(lifetime.lpVsHodlUsd, { sign: true })}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Fees claimed</p>
              <p className="mt-0.5 font-semibold tnum">{usd(lifetime.feesClaimedUsd)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Rewards claimed</p>
              <p className="mt-0.5 font-semibold tnum">{usd(lifetime.incentivesClaimedUsd)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Gas paid</p>
              <p className="mt-0.5 font-semibold tnum">{usd(lifetime.gasUsd)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Providing liquidity for</p>
              <p className="mt-0.5 font-semibold">{relativeDays(lifetime.daysActive)}</p>
            </div>
          </div>
        </Card>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          title={tab === 'open' ? 'Nothing deployed' : 'No history yet'}
          body={tab === 'open'
            ? 'This wallet has no liquidity positions with capital in them right now.'
            : 'Positions appear here once they have been fully withdrawn.'}
        />
      ) : (
        <Card>
          <div className="divide-hair">
            {shown.map((p) => <PositionRow key={p.id} position={p} wallet={address} />)}
          </div>
        </Card>
      )}
    </div>
  );
}
