'use client';
/**
 * Pools. Yours first, everyone else's second.
 *
 * The ranking leads with a seven day fee APR rather than today's headline,
 * because today's headline is one day of trading annualised and it is the reason
 * people pile into a pool showing 400% that has paid a fraction of it. Both
 * numbers are here, in that order of prominence.
 *
 * Every APR in this list is the full range figure. It is the floor, and the only
 * one that compares two pools honestly. What a concentrated range multiplies it
 * by is a question about your range, and it belongs on the pool screen where you
 * can move the range and watch it change.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PoolRow } from '@/types/pool';
import { usd, pct } from '@/lib/format';
import { Card, Label, Tabs, Skeleton, EmptyState } from '@/components/ui/Primitives';
import { InfoDot } from '@/components/ui/InfoDot';
import { PositionsList } from '@/components/PositionsView';
import { usePoolList } from '@/lib/usePool';

type Tab = 'mine' | 'find';
type Sort = 'fee7d' | 'apy' | 'tvl' | 'volume';

const PROJECT_LABEL: Record<string, string> = {
  'aerodrome-slipstream': 'Aerodrome',
  'aerodrome-v1': 'Aerodrome v1',
  'uniswap-v3': 'Uniswap V3',
};

const RISK_TONE: Record<string, string> = {
  conservador: 'text-gain',
  intermedio: 'text-warn',
  agresivo: 'text-loss',
};

const RISK_LABEL: Record<string, string> = {
  conservador: 'Conservative',
  intermedio: 'Balanced',
  agresivo: 'Aggressive',
};

export function PoolsView({ address, initialTab }: { address?: string; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(address ? initialTab : 'find');

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Pools</h1>

      {address ? (
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          options={[{ key: 'mine', label: 'My pools' }, { key: 'find', label: 'Find pools' }]}
        />
      ) : null}

      {tab === 'mine' && address ? <PositionsList address={address} initialTab="open" /> : <FindPools />}
    </div>
  );
}

function FindPools() {
  const [stocksOnly, setStocksOnly] = useState(false);
  const [minTvl, setMinTvl] = useState(500_000);
  const [project, setProject] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('fee7d');
  const { data, error } = usePoolList(stocksOnly);

  const pools = useMemo(() => {
    const rows = (data?.pools || [])
      .filter((p) => p.tvlUsd >= minTvl)
      .filter((p) => project === 'all' || p.project === project);
    const key = (p: PoolRow) =>
      sort === 'fee7d' ? (p.feeApr7d ?? -1)
      : sort === 'apy' ? (p.apy ?? -1)
      : sort === 'volume' ? (p.volumeUsd1d ?? -1)
      : p.tvlUsd;
    return [...rows].sort((a, b) => key(b) - key(a)).slice(0, 60);
  }, [data, minTvl, project, sort]);

  if (error) return <EmptyState title="Pool data is unavailable" body={error} />;
  if (!data) return <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-3">
      <Card>
        <FilterRow label="Protocol">
          <Chip active={project === 'all'} onClick={() => setProject('all')}>All</Chip>
          <Chip active={project === 'aerodrome-slipstream'} onClick={() => setProject('aerodrome-slipstream')}>Aerodrome</Chip>
          <Chip active={project === 'uniswap-v3'} onClick={() => setProject('uniswap-v3')}>Uniswap V3</Chip>
        </FilterRow>
        <FilterRow label="Minimum TVL">
          {[100_000, 500_000, 1_000_000, 5_000_000].map((v) => (
            <Chip key={v} active={minTvl === v} onClick={() => setMinTvl(v)}>
              ${v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1000}k`}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Sort by">
          <Chip active={sort === 'fee7d'} onClick={() => setSort('fee7d')}>Fee APR 7d</Chip>
          <Chip active={sort === 'apy'} onClick={() => setSort('apy')}>APY today</Chip>
          <Chip active={sort === 'volume'} onClick={() => setSort('volume')}>Volume</Chip>
          <Chip active={sort === 'tvl'} onClick={() => setSort('tvl')}>TVL</Chip>
        </FilterRow>
        <FilterRow label="Assets">
          <Chip active={!stocksOnly} onClick={() => setStocksOnly(false)}>All</Chip>
          <Chip active={stocksOnly} onClick={() => setStocksOnly(true)}>Tokenized stocks</Chip>
        </FilterRow>
      </Card>

      <Card>
        <div className="flex items-baseline justify-between">
          <Label>{pools.length} pools</Label>
          <span className="text-[0.6875rem] text-ink-muted">
            full range APR
            <InfoDot label="Full range APR">
              Every figure here is all the fees over all the liquidity, concentrated or not.
              That is the floor and the only fair comparison between two pools. Open a pool
              to see what a concentrated range would multiply it by.
            </InfoDot>
          </span>
        </div>
        {pools.length === 0 ? (
          <p className="muted mt-3">Nothing matches those filters.</p>
        ) : (
          <div className="divide-hair mt-1">
            {pools.map((p) => <PoolRowItem key={p.id} pool={p} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function PoolRowItem({ pool }: { pool: PoolRow }) {
  return (
    <Link
      href={`/pool/${encodeURIComponent(pool.id)}`}
      className="-mx-4 block px-4 py-3 transition-colors hover:bg-bg-elevated/50"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {pool.symbol}
            {pool.variant ? (
              <span className="ml-1.5 rounded bg-bg-elevated px-1 py-0.5 text-[0.5625rem] font-medium text-ink-secondary">
                {pool.variant}
              </span>
            ) : null}
            {pool.hasStock ? <span className="ml-1.5 pill-stock">Stock</span> : null}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-ink-muted">
            {PROJECT_LABEL[pool.project] || pool.project}
            {pool.feePct != null ? ` · ${pool.feePct.toFixed(pool.feePct < 0.1 ? 3 : 2)}%` : ''}
            {' · '}
            <span className={RISK_TONE[pool.risk] || 'text-ink-muted'}>
              {RISK_LABEL[pool.risk] || pool.risk}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tnum text-gain">
            {pool.feeApr7d != null ? pct(pool.feeApr7d) : '—'}
          </p>
          <p className="text-[0.6875rem] text-ink-muted">fees, 7d avg</p>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.6875rem] tnum text-ink-muted">
        <span>TVL {usd(pool.tvlUsd)}</span>
        <span>Vol 24h {usd(pool.volumeUsd1d)}</span>
        {pool.apy != null ? <span>APY today {pct(pool.apy)}</span> : null}
        {pool.apyReward != null && pool.apyReward > 0 ? (
          <span className="text-stock">incl. rewards</span>
        ) : null}
      </div>
    </Link>
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
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-bg-border text-ink-secondary hover:text-ink-primary'
      }`}
    >
      {children}
    </button>
  );
}
