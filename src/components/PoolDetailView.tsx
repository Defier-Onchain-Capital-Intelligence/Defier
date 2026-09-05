'use client';
/**
 * One pool, deep enough to decide with.
 *
 * The order is the argument. What it pays on a stable measure, then what it is
 * made of, then the range you would actually take and what that changes. The
 * headline APR every other interface prints sits last, where it belongs, next to
 * a note saying it is one day of trading annualised.
 */
import type { PoolDetail } from '@/types/pool';
import { usd, pct } from '@/lib/format';
import { Card, Label, Skeleton, EmptyState, BackLink } from '@/components/ui/Primitives';
import { InfoDot } from '@/components/ui/InfoDot';
import { RangeCalculator } from '@/components/RangeCalculator';
import { usePoolDetail } from '@/lib/usePool';

const PROJECT_LABEL: Record<string, string> = {
  'aerodrome-slipstream': 'Aerodrome',
  'aerodrome-v1': 'Aerodrome v1',
  'uniswap-v3': 'Uniswap V3',
};

export function PoolDetailView({ id }: { id: string }) {
  const { data: pool, error } = usePoolDetail(id);

  if (error) return <EmptyState title="We could not read this pool" body={error} />;
  if (!pool) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const stable = pool.stable;

  return (
    <div className="space-y-4">
      <BackLink href="/pools?tab=find">All pools</BackLink>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{pool.symbol}</h1>
          {pool.variant ? (
            <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 text-[0.625rem] font-medium text-ink-secondary">
              {pool.variant}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          {PROJECT_LABEL[pool.project] || pool.project} · Base
          {pool.feeDec != null ? ` · ${(pool.feeDec * 100).toFixed(pool.feeDec < 0.001 ? 3 : 2)}% fee` : ''}
        </p>
      </header>

      <Card>
        <Label>What it has actually paid</Label>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Stat
            label="Fee APR, 7 day average"
            value={stable.feeApr7dPct != null ? pct(stable.feeApr7dPct) : '—'}
            sub={stable.feeApr7dDays ? `${stable.feeApr7dDays} days of data` : 'not enough history'}
            info={stable.method}
          />
          <Stat
            label="Fee APR, 30 day average"
            value={stable.feeApr30dPct != null ? pct(stable.feeApr30dPct) : '—'}
            sub={stable.feeApr30dDays ? `${stable.feeApr30dDays} days of data` : 'not enough history'}
            info={stable.method}
          />
        </div>
        <p className="mt-3 rounded-xl bg-bg-elevated p-3 text-[0.6875rem] leading-relaxed text-ink-secondary">
          These are full range figures: all the fees over all the liquidity. That is the floor,
          and it is the only number that compares two pools fairly. A concentrated range earns a
          multiple of it, which the calculator below works out for this pool.
        </p>
      </Card>

      <Card>
        <Label>Today</Label>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Stat label="TVL" value={usd(pool.tvlUsd)} />
          <Stat label="Volume, 24h" value={usd(pool.volumeUsd1d)} />
          <Stat
            label="Turnover"
            value={pool.volumeOverTvl != null ? `${pool.volumeOverTvl.toFixed(2)}x` : '—'}
            sub="volume over TVL, daily"
            info="How many times the pool's own liquidity traded in a day. This is what the fee APR is made of, before anyone annualises it."
          />
          <Stat
            label="Published APY"
            value={pool.published.apyPct != null ? pct(pool.published.apyPct) : '—'}
            sub="what other interfaces show"
            info="One day of trading, annualised, plus emissions. It moves every day and it is the number that sends people into pools that have averaged a fraction of it."
          />
        </div>
      </Card>

      <RangeCalculator pool={pool} />

      <p className="px-1 text-center text-[0.6875rem] leading-relaxed text-ink-muted">
        Informational only, not investment advice. DeFier is read only and never executes transactions.
      </p>
    </div>
  );
}

function Stat({ label, value, sub, info }: {
  label: string; value: string; sub?: string; info?: string;
}) {
  return (
    <div>
      <p className="text-xs text-ink-muted">
        {label}
        {info ? <InfoDot label={label}>{info}</InfoDot> : null}
      </p>
      <p className="mt-0.5 font-semibold tnum">{value}</p>
      {sub ? <p className="text-[0.6875rem] text-ink-muted">{sub}</p> : null}
    </div>
  );
}
