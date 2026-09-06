'use client';
/**
 * Lending markets, both sides at once.
 *
 * Every lending interface shows you what you would earn. The number that
 * actually decides things is the one next to it: what the debt costs. The
 * strategy this product exists to explain — keep the asset you want to keep,
 * borrow against it, put the debt to work — is entirely a bet on the gap between
 * those two, and nobody puts them side by side.
 *
 * Utilisation is here for the same reason. A market at 99% pays a beautiful
 * supply rate and will not let you withdraw.
 */
import { useMemo, useState } from 'react';
import type { LendingMarket } from '@/lib/llamaPools';
import { usd, pct } from '@/lib/format';
import { Card, Label, Skeleton, EmptyState } from '@/components/ui/Primitives';
import { InfoDot } from '@/components/ui/InfoDot';
import { TokenLogo } from '@/components/ui/TokenLogo';
import { useLendingMarkets } from '@/lib/usePool';

const PROJECT_LABEL: Record<string, string> = {
  'aave-v3': 'Aave v3',
  moonwell: 'Moonwell',
  'morpho-blue': 'Morpho',
  'compound-v3': 'Compound v3',
};

type Sort = 'supply' | 'borrow' | 'size';

export function LendingView() {
  const [project, setProject] = useState<string>('aave-v3');
  const [sort, setSort] = useState<Sort>('supply');
  const { data, error } = useLendingMarkets(project === 'all' ? undefined : project);

  const markets = useMemo(() => {
    const rows = data?.markets || [];
    const key = (m: LendingMarket) =>
      sort === 'supply' ? ((m.supplyApyPct ?? 0) + (m.supplyRewardApyPct ?? 0))
      : sort === 'borrow' ? -(m.netBorrowApyPct ?? 999)
      : (m.totalSupplyUsd ?? 0);
    return [...rows].sort((a, b) => key(b) - key(a));
  }, [data, sort]);

  if (error) return <EmptyState title="Lending data is unavailable" body={error} />;
  if (!data) return <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-3">
      <Card>
        <FilterRow label="Protocol">
          {['aave-v3', 'moonwell', 'morpho-blue', 'all'].map((p) => (
            <Chip key={p} active={project === p} onClick={() => setProject(p)}>
              {p === 'all' ? 'All' : PROJECT_LABEL[p] || p}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Sort by">
          <Chip active={sort === 'supply'} onClick={() => setSort('supply')}>Supply APY</Chip>
          <Chip active={sort === 'borrow'} onClick={() => setSort('borrow')}>Cheapest to borrow</Chip>
          <Chip active={sort === 'size'} onClick={() => setSort('size')}>Size</Chip>
        </FilterRow>
      </Card>

      <Card>
        <div className="flex items-baseline justify-between">
          <Label>{markets.length} markets</Label>
          <span className="text-[0.6875rem] text-ink-muted">
            rates move
            <InfoDot label="Rates move">
              Supply and borrow rates on these markets are set by utilisation and change block
              by block. What you see is the rate right now, not a rate you are locked into.
            </InfoDot>
          </span>
        </div>

        {markets.length === 0 ? (
          <p className="muted mt-3">No markets found for that protocol.</p>
        ) : (
          <div className="divide-hair mt-1">
            {markets.map((m) => <MarketRow key={m.id} market={m} />)}
          </div>
        )}
      </Card>

      <p className="px-1 text-[0.6875rem] leading-relaxed text-ink-muted">
        Borrowing against an asset you want to keep is how people stay exposed while putting
        capital to work. It also adds a liquidation price to your portfolio, which a pool alone
        does not have.
      </p>
    </div>
  );
}

function MarketRow({ market: m }: { market: LendingMarket }) {
  const supply = (m.supplyApyPct ?? 0) + (m.supplyRewardApyPct ?? 0);
  const spread = m.netBorrowApyPct != null ? supply - m.netBorrowApyPct : null;
  const tight = m.utilisationPct != null && m.utilisationPct > 92;

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <TokenLogo address={m.tokenAddress} symbol={m.symbol} size={20} />
          <span className="truncate font-medium">{m.symbol}</span>
          <span className="shrink-0 text-[0.625rem] text-ink-muted">
            {PROJECT_LABEL[m.project] || m.project}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold tnum text-gain">{pct(supply)}</span>
          <span className="block text-[0.625rem] text-ink-muted">to supply</span>
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.6875rem] tnum text-ink-muted">
        {m.borrowable && m.netBorrowApyPct != null ? (
          <span>
            <span className={m.netBorrowApyPct < 0 ? 'text-gain' : 'text-loss'}>
              {pct(m.netBorrowApyPct)}
            </span>{' '}
            to borrow
          </span>
        ) : (
          <span>not borrowable</span>
        )}
        {spread != null ? (
          <span className={spread >= 0 ? 'text-gain' : 'text-ink-muted'}>
            {spread >= 0 ? '+' : ''}{pct(spread)} spread
          </span>
        ) : null}
        {m.ltv ? <span>LTV {(m.ltv * 100).toFixed(0)}%</span> : null}
        <span>{usd(m.totalSupplyUsd)} supplied</span>
        {m.utilisationPct != null ? (
          <span className={tight ? 'text-warn' : undefined}>
            {m.utilisationPct.toFixed(0)}% used
          </span>
        ) : null}
      </div>

      {tight ? (
        <p className="mt-1.5 text-[0.625rem] text-warn">
          Nearly all of this market is lent out. Rates look good and withdrawals may have to wait.
        </p>
      ) : null}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1.5">
      <span className="mr-1 w-20 shrink-0 text-[0.6875rem] text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[0.6875rem] transition-colors ${
        active ? 'border-accent bg-accent/10 text-accent'
                : 'border-bg-border text-ink-secondary hover:text-ink-primary'
      }`}
    >
      {children}
    </button>
  );
}
