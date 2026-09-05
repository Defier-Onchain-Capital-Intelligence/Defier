'use client';
/**
 * Pick a range, see what it pays.
 *
 * The whole argument for concentrated liquidity is compressed into one number
 * nobody is shown: the concentration multiple. A pool advertising 21% pays 21%
 * to somebody spread across every price; the same pool pays multiples of that
 * inside a tight range, and takes the position out of range that much sooner.
 * Both halves of that trade are on this control at once.
 *
 * The APRs are solved on the server against the pool's real active liquidity and
 * handed over as a table. Moving the slider reads a row. Nothing here computes
 * money, and nothing here waits on the network.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { PoolDetail, AprPoint } from '@/types/pool';
import { usd, pct, price as fmtPrice } from '@/lib/format';
import { Card, Label } from '@/components/ui/Primitives';
import { InfoDot } from '@/components/ui/InfoDot';

export function RangeCalculator({ pool }: { pool: PoolDetail }) {
  const grid = pool.aprGrid || [];
  // Open on the middle of what this pool's presets suggest, not on an arbitrary
  // width: a CL1 pool and a CL2000 pool are read at completely different scales.
  const suggested = pool.presets?.[1]?.pctLow ?? 0.05;
  const initial = Math.max(grid.findIndex((g) => g.pctLow >= suggested), 0);
  const [i, setI] = useState(initial >= 0 ? initial : Math.floor(grid.length / 2));

  const point: AprPoint | undefined = grid[i];
  const lowPrice = point ? pool.currentPrice * (1 - point.pctLow) : null;
  const highPrice = point ? pool.currentPrice * (1 + point.pctHigh) : null;

  const simulateHref = useMemo(() => {
    if (!point || !lowPrice || !highPrice) return null;
    const params = new URLSearchParams({
      entry: String(pool.currentPrice),
      low: String(lowPrice),
      high: String(highPrice),
      size: '10000',
      apr: String(Math.round(point.totalAprPct * 10) / 10),
      days: '30',
    });
    return `/simulate?${params.toString()}`;
  }, [point, lowPrice, highPrice, pool.currentPrice]);

  if (!grid.length || !point) {
    return (
      <Card>
        <Label>Range calculator</Label>
        <p className="muted mt-2 text-[0.8125rem]">
          We could not read this pool&rsquo;s active liquidity, so a range specific APR would be a guess.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <Label>What a range would pay</Label>
        <span className="text-xs text-ink-muted tnum">
          ±{pct(point.pctLow * 100, point.pctLow < 0.01 ? 2 : 1)}
        </span>
      </div>

      {pool.histogram?.length ? (
        <Histogram
          buckets={pool.histogram}
          currentPrice={pool.currentPrice}
          low={lowPrice}
          high={highPrice}
        />
      ) : null}

      <input
        type="range"
        min={0}
        max={grid.length - 1}
        step={1}
        value={i}
        onChange={(e) => setI(Number(e.target.value))}
        aria-label="Range width"
        className="mt-4 w-full accent-accent"
      />

      <div className="mt-1 flex items-baseline justify-between text-[0.6875rem] tnum text-ink-muted">
        <span>{fmtPrice(lowPrice)}</span>
        <span className="text-ink-secondary">now {fmtPrice(pool.currentPrice)}</span>
        <span>{fmtPrice(highPrice)}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {pool.presets.map((p) => {
          const target = grid.reduce((best, g, idx) =>
            Math.abs(g.pctLow - p.pctLow) < Math.abs(grid[best].pctLow - p.pctLow) ? idx : best, 0);
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => setI(target)}
              className={`rounded-full border px-2.5 py-1 text-[0.6875rem] transition-colors ${
                target === i
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-bg-border text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Fee APR" value={pct(point.feeAprPct)} tone="text-ink-primary"
          info="Trading fees only. Your dollar's share of the liquidity that is actually earning at this price, times what the pool takes in fees over a year at today's volume." />
        <Figure
          label={pool.rewardLabel || 'Rewards'}
          value={point.rewardAprPct != null ? pct(point.rewardAprPct) : '—'}
          tone="text-stock"
          info="Emissions from the pool gauge, which require staking the position NFT. They are shared out by liquidity in range in exactly the same proportion as fees, so this is the same share applied to the gauge's annual emissions." />
        <Figure label="Total APR" value={pct(point.totalAprPct)} tone="text-gain"
          info="Fees plus emissions for this range. It assumes the price stays inside it: out of range, both go to zero." />
        <Figure
          label="Concentration"
          value={point.concentrationX != null ? `${point.concentrationX.toFixed(1)}x` : '—'}
          tone="text-ink-primary"
          info="How much more this range earns than the same dollar spread across every price. The multiple that buys you the extra yield is the same one that takes you out of range sooner." />
      </div>

      {simulateHref ? (
        <Link
          href={simulateHref}
          className="mt-4 flex items-center justify-between rounded-xl border border-bg-border bg-bg-elevated px-3 py-2.5 transition-colors hover:bg-bg-elevated/60"
        >
          <span className="text-sm font-medium">Simulate this range</span>
          <span aria-hidden className="text-accent">&rarr;</span>
        </Link>
      ) : null}

      {pool.averageDollar.feeAprPct != null ? (
        <p className="mt-4 rounded-xl bg-bg-elevated p-3 text-[0.6875rem] leading-relaxed text-ink-secondary">
          For reference, the average dollar already in this pool earns{' '}
          <span className="tnum text-ink-primary">{pct(pool.averageDollar.feeAprPct)}</span> in fees.
          That average is mostly made of tightly concentrated positions, which is why a wide range
          here pays so much less than it: your dollar would be sharing the same fees with all the
          liquidity sitting right at the price.
        </p>
      ) : null}

      <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-muted">
        Computed against the liquidity actually in the pool right now and its last 24h of volume.
        Both move, so this is what the range would pay at today&rsquo;s trading, not a promise about
        tomorrow.
      </p>
    </Card>
  );
}

function Figure({ label, value, tone, info }: {
  label: string; value: string; tone: string; info: string;
}) {
  return (
    <div className="rounded-xl bg-bg-elevated/50 p-2.5">
      <p className="text-[0.6875rem] text-ink-muted">
        {label}
        <InfoDot label={label}>{info}</InfoDot>
      </p>
      <p className={`mt-0.5 font-semibold tnum ${tone}`}>{value}</p>
    </div>
  );
}

/** Where the liquidity already sits. Your range competes with these bars for the same fees. */
function Histogram({ buckets, currentPrice, low, high }: {
  buckets: PoolDetail['histogram'];
  currentPrice: number;
  low: number | null;
  high: number | null;
}) {
  if (!buckets?.length) return null;
  return (
    <div className="mt-4">
      <div className="flex h-20 items-end gap-px">
        {buckets.map((b, idx) => {
          const inSelection = low != null && high != null
            && b.priceAdjusted >= low && b.priceAdjusted <= high;
          return (
            <div
              key={`${b.tickLower}-${idx}`}
              className={`flex-1 rounded-sm transition-colors ${
                b.isActive ? 'bg-accent'
                  : inSelection ? 'bg-accent/45'
                  : 'bg-ink-muted/20'
              }`}
              style={{ height: `${Math.max(b.liquidityHuman, 1.5)}%` }}
              title={`${fmtPrice(b.priceAdjusted)}`}
            />
          );
        })}
      </div>
      <p className="mt-1.5 text-[0.625rem] text-ink-muted">
        Liquidity already in the pool. The lit bars are the range you have selected;
        the bright one is where the price is now.
      </p>
    </div>
  );
}
