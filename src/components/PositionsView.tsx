'use client';
/**
 * Positions, split by whether capital is still inside.
 *
 * Open and Closed, not In range and Out of range. A position that has drifted out
 * of its range still holds your money and still needs attention; one that has been
 * withdrawn is history. Sorting by range would put those two in the same bucket.
 *
 * Lending sits under Open with the liquidity positions rather than on a screen of
 * its own. Supplying and borrowing is the same act as providing liquidity, which
 * is putting capital somewhere it is working and can be called back, and the two
 * are already combined in practice: people borrow against collateral to provide
 * liquidity with what they borrowed. Splitting them across two screens would hide
 * that the second position is built on the first.
 */
import { useState } from 'react';
import type { Portfolio } from '@/types/portfolio';
import { usePortfolio } from '@/lib/usePortfolio';
import { usd, toneOf, relativeDays } from '@/lib/format';
import { Card, Label, Skeleton, EmptyState } from '@/components/ui/Primitives';
import { PositionRow } from '@/components/PositionRow';
import { LendingPositions } from '@/components/LendingPositions';

type Tab = 'open' | 'closed';

/** The list of a wallet's positions, hosted by the Pools screen. */
export function PositionsList({ address, initialTab }: { address: string; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { data, error, loadingHistory } = usePortfolio(address, { deep: true });

  if (error) return <EmptyState title="We could not read that wallet" body={error} />;
  if (!data) return <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-48" /></div>;

  const open = data.positions.filter((p) => !p.closed);
  const closed = data.positions.filter((p) => p.closed);
  const shown = tab === 'open' ? open : closed;
  const { lifetime } = data.summary;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-bg-surface border border-bg-border p-1">
        {/* A count of zero while the history is still being rebuilt reads as
            "this wallet has nothing", which is a different statement from "we
            have not finished looking". Until it lands, the tab says so. */}
        {([
          ['open', `Open (${open.length})`],
          ['closed', loadingHistory ? 'History…' : `History (${closed.length})`],
        ] as const).map(([key, label]) => (
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

      {tab === 'closed' && !(loadingHistory && closed.length === 0) ? (
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

      {tab === 'closed' && loadingHistory && closed.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-secondary">Rebuilding every position this wallet has closed.</p>
          <p className="muted mt-1 text-xs">
            Reading onchain events, including positions whose NFT was burned. This takes a moment.
          </p>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </Card>
      ) : shown.length === 0 ? (
        <EmptyState
          title={tab === 'open' ? 'No liquidity positions' : 'No history yet'}
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

      {tab === 'open' ? (
        <LendingPositions lending={data.lending} coverage={data.lendingCoverage} />
      ) : null}
    </div>
  );
}
