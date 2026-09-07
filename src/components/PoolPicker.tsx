'use client';
/**
 * Choose what to simulate.
 *
 * Opened from the tab bar, the simulator used to start on invented defaults with
 * no pair named anywhere: arithmetic in a vacuum, since the same numbers mean
 * different things on a CL1 and a CL200 pool. This is the missing first step.
 *
 * Picking a pool loads that pool's real current price, its suggested range and
 * the APR that range actually solves to, so the simulation starts from something
 * true rather than from a guess the user then has to correct.
 */
import { useMemo, useState } from 'react';
import type { PoolRow, PoolDetail } from '@/types/pool';
import { usd, pct } from '@/lib/format';
import { Card, Label, Skeleton } from '@/components/ui/Primitives';
import { TokenPair } from '@/components/ui/TokenLogo';
import { usePoolList } from '@/lib/usePool';

const PROJECT_LABEL: Record<string, string> = {
  'aerodrome-slipstream': 'Aerodrome',
  'aerodrome-v1': 'Aerodrome v1',
  'uniswap-v3': 'Uniswap V3',
};

export function PoolPicker({ onPick }: { onPick: (pool: PoolDetail) => void }) {
  const { data, error } = usePoolList(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const pools = useMemo(() => {
    const all = data?.pools || [];
    const q = query.trim().toLowerCase();
    const matched = q ? all.filter((p) => p.symbol.toLowerCase().includes(q)) : all;
    return matched.slice(0, 12);
  }, [data, query]);

  async function pick(row: PoolRow) {
    setLoading(row.id);
    try {
      const res = await fetch(`/api/pool/${encodeURIComponent(row.id)}`, { cache: 'no-store' });
      const body = await res.json();
      if (res.ok && body?.pool) onPick(body.pool as PoolDetail);
    } catch (_) {
      // Leaving the picker open is the honest failure: nothing was chosen.
    } finally {
      setLoading(null);
    }
  }

  if (error) return null;

  return (
    <Card>
      <Label>Which pool</Label>
      <p className="muted mt-1 text-xs leading-relaxed">
        A range means nothing without a pool: the same width pays differently on a CL1 and a CL200.
        Pick one and the price, the range and the APR come from it.
      </p>

      <input
        type="search"
        className="input mt-3"
        placeholder="Search a pair, e.g. WETH"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {!data ? (
        <Skeleton className="mt-3 h-40" />
      ) : (
        <ul className="mt-3 space-y-1.5">
          {pools.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => pick(p)}
                disabled={loading != null}
                className="flex w-full items-center gap-2.5 rounded-xl bg-bg-elevated p-2.5 text-left disabled:opacity-50"
              >
                <TokenPair
                  token0={{ symbol: p.tokens?.[0] }}
                  token1={{ symbol: p.tokens?.[1] }}
                  size={22}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {p.symbol}
                    {p.variant ? (
                      <span className="ml-1.5 rounded bg-bg-surface px-1 py-0.5 text-[0.5625rem] text-ink-secondary">
                        {p.variant}
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-[0.6875rem] text-ink-muted">
                    {PROJECT_LABEL[p.project] || p.project} · {usd(p.tvlUsd)} TVL
                  </span>
                </span>
                <span className="tnum text-sm text-ink-secondary">
                  {p.feeApr7d != null ? pct(p.feeApr7d) : '—'}
                </span>
              </button>
            </li>
          ))}
          {pools.length === 0 ? (
            <li className="py-4 text-center text-xs text-ink-muted">No pool matches that.</li>
          ) : null}
        </ul>
      )}

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-muted">
        The percentage is the seven day fee APR across the full range — the floor, before
        concentrating.
      </p>
    </Card>
  );
}
