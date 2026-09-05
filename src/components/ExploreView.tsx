'use client';
/**
 * Explore. One idea: today's APY next to its own thirty day average.
 *
 * Every other interface prints a single number, and that number is why people
 * pile into a pool showing 400% that has averaged 12%. Showing both turns a
 * lottery ticket back into a decision.
 */
import { useEffect, useState } from 'react';
import { usd, pct } from '@/lib/format';
import { Card, Label, Skeleton, EmptyState } from '@/components/ui/Primitives';

type Pool = {
  id: string; symbol: string; project: string;
  tvlUsd: number; volumeUsd1d: number | null;
  apy: number | null; apy7d: number | null; apy30d: number | null;
  apySpreadPct: number | null; hasStock: boolean;
};

const PROJECT_LABEL: Record<string, string> = {
  'aerodrome-slipstream': 'Aerodrome',
  'aerodrome-v1': 'Aerodrome v1',
  'uniswap-v3': 'Uniswap V3',
};

export function ExploreView() {
  const [pools, setPools] = useState<Pool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stocksOnly, setStocksOnly] = useState(false);

  useEffect(() => {
    let live = true;
    setPools(null);
    fetch(`/api/pools${stocksOnly ? '?stocks=1' : ''}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (live) { if (d.error) setError(d.error); else setPools(d.pools); } })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [stocksOnly]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Explore pools</h1>

      <div className="flex gap-1 rounded-xl border border-bg-border bg-bg-surface p-1">
        <button type="button" onClick={() => setStocksOnly(false)}
                className={`tab ${!stocksOnly ? 'tab-active' : ''}`}>All pools</button>
        <button type="button" onClick={() => setStocksOnly(true)}
                className={`tab ${stocksOnly ? 'tab-active' : ''}`}>Tokenized stocks</button>
      </div>

      {error ? <EmptyState title="Pool data unavailable" body={error} /> : null}
      {!pools && !error ? <Skeleton className="h-64" /> : null}

      {pools && pools.length === 0 ? (
        <EmptyState title="Nothing to show" body="No pools matched this filter." />
      ) : null}

      {pools?.length ? (
        <Card>
          <div className="divide-hair">
            {pools.slice(0, 40).map((p) => {
              const misleading = p.apySpreadPct != null && p.apySpreadPct > 20;
              return (
                <div key={p.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {p.symbol}
                        {p.hasStock ? <span className="ml-2 pill-stock">Stock</span> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {PROJECT_LABEL[p.project] ?? p.project} · {usd(p.tvlUsd)} TVL
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tnum">{pct(p.apy)}</p>
                      <p className="text-xs text-ink-muted tnum">{pct(p.apy30d)} 30d avg</p>
                    </div>
                  </div>
                  {misleading ? (
                    <p className="mt-2 text-[0.6875rem] leading-relaxed text-warn">
                      Today is {pct(p.apySpreadPct)} above this pool&apos;s own monthly average.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <p className="px-1 text-center text-[0.6875rem] leading-relaxed text-ink-muted">
        Yield data from DeFiLlama. Past returns are not a forecast, and a headline APY is
        the least reliable number on this screen.
      </p>
    </div>
  );
}
