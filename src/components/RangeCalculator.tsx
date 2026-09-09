'use client';
/**
 * Pick a range on the liquidity, see what it pays.
 *
 * Two things were wrong with the version this replaces, and both mattered.
 *
 * The bars were drawn with the bucket's liquidity as a literal CSS percentage,
 * so a pool whose liquidity sits in one place — which is most of them — rendered
 * as a single stripe with a flat line beside it. Nothing was broken; the chart
 * simply had no scale. Heights are now relative to the fullest bucket, on a
 * square root scale so a bucket with a hundredth of the liquidity is still
 * visible rather than rounding to nothing.
 *
 * And the range was symmetric. A real range is not: somebody who thinks the
 * price is likelier to fall than rise puts more of it below. Both bounds now
 * move independently, each snapping to a width this pool's tick spacing can
 * actually hold, and the APR is read out of a matrix the server solved. Dragging
 * a handle reads a cell — nothing here computes money and nothing waits on the
 * network.
 */
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { PoolDetail } from '@/types/pool';
import { usd, pct, price as fmtPrice } from '@/lib/format';
import { Card, Label } from '@/components/ui/Primitives';
import { InfoDot } from '@/components/ui/InfoDot';

/** Nearest allowed width to a fraction away from the current price. */
function snap(widths: number[], target: number): number {
  let best = 0;
  for (let i = 1; i < widths.length; i += 1) {
    if (Math.abs(widths[i] - target) < Math.abs(widths[best] - target)) best = i;
  }
  return best;
}

export function RangeCalculator({ pool }: { pool: PoolDetail }) {
  const widths = pool.widths?.length ? pool.widths : pool.aprGrid.map((g) => g.pctLow);
  const matrix = pool.aprMatrix;

  // Open on the middle of what this pool's presets suggest, not on an arbitrary
  // width: a CL1 pool and a CL2000 pool are read at completely different scales.
  const start = snap(widths, pool.presets?.[1]?.pctLow ?? 0.05);
  const [lo, setLo] = useState(start);
  const [hi, setHi] = useState(start);
  /**
   * How much wider than the selected range the chart looks.
   *
   * The axis used to span whatever the histogram covered, and on a CL2000 pool a
   * bucket is twenty percent wide, so sixty of them cover a price range in which
   * a ±22% band is a sliver in the middle: everything bunched, nothing legible.
   * The view now follows the range instead, with enough margin either side to see
   * what is just outside it, and the buttons widen or tighten that.
   */
  const [view, setView] = useState(1);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'lo' | 'hi' | null>(null);

  const lowPrice = pool.currentPrice * (1 - widths[lo]);
  const highPrice = pool.currentPrice * (1 + widths[hi]);

  const point = useMemo(() => {
    const cell = matrix?.[lo]?.[hi];
    if (cell) return { feeAprPct: cell.f, rewardAprPct: cell.r, totalAprPct: cell.t };
    // Without a matrix the symmetric grid still answers, which is what an older
    // cached payload will have.
    const g = pool.aprGrid[lo] || pool.aprGrid[Math.min(lo, pool.aprGrid.length - 1)];
    return g ? { feeAprPct: g.feeAprPct, rewardAprPct: g.rewardAprPct, totalAprPct: g.totalAprPct } : null;
  }, [matrix, lo, hi, pool.aprGrid]);

  /**
   * The horizontal axis is log price, because a tick is a constant ratio, which
   * makes every bucket the same width on screen whatever the price level.
   *
   * It is centred on the current price and scaled to the selected range rather
   * than to the liquidity, so a wide range on a coarse pool and a tight range on
   * a fine one are both readable without touching anything.
   */
  const domain = useMemo(() => {
    const centre = Math.log(pool.currentPrice);
    // On a coarse pool one bucket can be wider than the whole selected range, and
    // a chart showing a single bar is a chart showing nothing. The view is never
    // tighter than a few buckets, so there is always something to compare against.
    const bucket = (pool.histogram?.[0]
      ? (pool.histogram[0].tickUpper - pool.histogram[0].tickLower) * Math.log(1.0001)
      : 0);
    const reach = Math.max(
      Math.abs(Math.log(lowPrice) - centre),
      Math.abs(Math.log(highPrice) - centre),
      bucket * 2.5,
      0.002,
    );
    const half = reach * 1.6 * view;
    return { a: centre - half, b: centre + half };
  }, [pool.currentPrice, lowPrice, highPrice, view, pool.histogram]);

  const xOf = (price: number) => {
    if (!(price > 0)) return 0;
    const f = (Math.log(price) - domain.a) / (domain.b - domain.a);
    return Math.min(100, Math.max(0, f * 100));
  };
  const priceOf = (fraction: number) =>
    Math.exp(domain.a + Math.min(1, Math.max(0, fraction)) * (domain.b - domain.a));

  const maxBucket = useMemo(
    () => Math.max(...(pool.histogram || []).map((b) => b.liquidityHuman || 0), 0),
    [pool.histogram],
  );

  function onPointerDown(which: 'lo' | 'hi') {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = which;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const price = priceOf((e.clientX - rect.left) / rect.width);
    // A bound is stored as a distance from the current price, so a handle
    // dragged across the price simply pins at the tightest width the pool holds.
    const away = Math.abs(price - pool.currentPrice) / pool.currentPrice;
    const idx = snap(widths, away);
    if (dragging.current === 'lo') setLo(idx); else setHi(idx);
  }

  const endDrag = () => { dragging.current = null; };

  const simulateHref = useMemo(() => {
    if (!point) return null;
    const params = new URLSearchParams({
      entry: String(pool.currentPrice),
      low: String(lowPrice),
      high: String(highPrice),
      size: '10000',
      apr: String(Math.round(point.totalAprPct * 10) / 10),
      days: '30',
      pair: pool.symbol || '',
      project: pool.project || '',
      from: 'pool',
      pool: pool.id,
    });
    if (pool.variant) params.set('variant', pool.variant);
    if (pool.tickSpacing) params.set('ts', String(pool.tickSpacing));
    if (pool.tokens?.token0?.symbol) params.set('s0', pool.tokens.token0.symbol);
    if (pool.tokens?.token1?.symbol) params.set('s1', pool.tokens.token1.symbol);
    if (pool.tokens?.token0?.address) params.set('a0', pool.tokens.token0.address);
    if (pool.tokens?.token1?.address) params.set('a1', pool.tokens.token1.address);
    return `/simulate?${params.toString()}`;
  }, [point, lowPrice, highPrice, pool]);

  if (!widths.length || !point) {
    // Two different silences, and they used to read as one. "We could not read
    // it" is an apology for our own limits; "there is nothing there" is a fact
    // about the pool, and it is the one the reader needs.
    const empty = pool.liquidity?.empty === true;
    return (
      <Card>
        <Label>{empty ? 'Nothing at this price' : 'Range calculator'}</Label>
        {empty ? (
          <>
            <p className="mt-2 text-[0.8125rem] leading-relaxed">
              Every position in this pool is out of range at the current price, so there is nothing
              to trade against and no range that would earn anything.
            </p>
            <p className="muted mt-2 text-[0.8125rem] leading-relaxed">
              {pool.tvlUsd && pool.tvlUsd > 0 ? (
                <>It is still listed with {usd(pool.tvlUsd)} of TVL because that comes from a data
                provider rather than from the pool. We read the pool.</>
              ) : (
                <>Nothing here can be simulated until somebody provides liquidity at this price.</>
              )}
            </p>
          </>
        ) : (
          <p className="muted mt-2 text-[0.8125rem] leading-relaxed">
            We could not read this pool&rsquo;s active liquidity, so a range specific APR would be
            a guess.
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <Label>What a range would pay</Label>
        <div className="flex items-center gap-2">
          <span className="text-xs tnum text-ink-muted">
            −{pct(widths[lo] * 100, widths[lo] < 0.01 ? 2 : 1)} / +{pct(widths[hi] * 100, widths[hi] < 0.01 ? 2 : 1)}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Zoom in"
              onClick={() => setView((v) => Math.max(0.6, v / 1.5))}
              className="h-6 w-6 rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary">−</button>
            <button type="button" aria-label="Zoom out"
              onClick={() => setView((v) => Math.min(12, v * 1.5))}
              className="h-6 w-6 rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary">+</button>
          </div>
        </div>
      </div>

      {/* The chart and its handles. Touch and mouse take the same path. */}
      <div
        ref={trackRef}
        className="relative mt-4 h-28 touch-none select-none overflow-hidden rounded-lg"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        <div className="absolute inset-0 overflow-hidden">
          {(pool.histogram || []).map((b, idx) => {
            // Both edges of the bucket, not its centre plus a width: a bucket can
            // be wider than the whole view on a coarse pool, and a centred bar of
            // that width spills out of the card. Edges are clamped to the view, so
            // a bar can be cropped but never escape.
            const halfSpan = ((b.tickUpper - b.tickLower) / 2) * Math.log(1.0001);
            const left = xOf(b.priceAdjusted * Math.exp(-halfSpan));
            const right = xOf(b.priceAdjusted * Math.exp(halfSpan));
            const w = right - left;
            if (!(w > 0)) return null;
            const inSel = b.priceAdjusted >= lowPrice && b.priceAdjusted <= highPrice;
            // Square root of the share of the fullest bucket. Linear heights make
            // every bucket but one invisible on a pool with concentrated liquidity,
            // which is most of them.
            const h = maxBucket > 0 ? Math.sqrt((b.liquidityHuman || 0) / maxBucket) * 100 : 0;
            return (
              <div
                key={`${b.tickLower}-${idx}`}
                className={`absolute bottom-0 rounded-t-[2px] ${
                  b.isActive ? 'bg-accent' : inSel ? 'bg-accent/45' : 'bg-ink-muted/25'
                }`}
                style={{
                  left: `${left}%`,
                  width: `${Math.max(w, 0.6)}%`,
                  height: `${Math.max(h, 2)}%`,
                }}
                title={fmtPrice(b.priceAdjusted)}
              />
            );
          })}
        </div>

        {/* The selected band, and the price as it stands. */}
        <div
          className="pointer-events-none absolute inset-y-0 border-x border-accent bg-accent/10"
          style={{ left: `${xOf(lowPrice)}%`, width: `${Math.max(xOf(highPrice) - xOf(lowPrice), 0.5)}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-ink-secondary/70"
          style={{ left: `${xOf(pool.currentPrice)}%` }}
        />

        {(['lo', 'hi'] as const).map((which) => (
          <div
            key={which}
            role="slider"
            tabIndex={0}
            aria-label={which === 'lo' ? 'Lower bound' : 'Upper bound'}
            aria-valuenow={Math.round((which === 'lo' ? widths[lo] : widths[hi]) * 10000) / 100}
            onPointerDown={onPointerDown(which)}
            onKeyDown={(e) => {
              const set = which === 'lo' ? setLo : setHi;
              const cur = which === 'lo' ? lo : hi;
              // One press is one tick spacing, which is the smallest move this
              // pool can actually make.
              if (e.key === 'ArrowLeft') set(Math.max(0, cur - 1));
              if (e.key === 'ArrowRight') set(Math.min(widths.length - 1, cur + 1));
            }}
            className="absolute inset-y-0 -ml-2 w-4 cursor-ew-resize"
            style={{ left: `${xOf(which === 'lo' ? lowPrice : highPrice)}%` }}
          >
            <div className="mx-auto h-full w-0.5 bg-accent" />
            <div className="absolute left-1/2 top-1/2 h-5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent bg-bg-surface" />
          </div>
        ))}
      </div>

      <div className="mt-1 flex items-baseline justify-between text-[0.6875rem] tnum text-ink-muted">
        <span>{fmtPrice(lowPrice)}</span>
        <span className="text-ink-secondary">now {fmtPrice(pool.currentPrice)}</span>
        <span>{fmtPrice(highPrice)}</span>
      </div>

      {/* The same two bounds as numbers, under the chart they belong to. */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Bound
          label="Range low"
          value={-widths[lo] * 100}
          onStep={(d) => setLo(Math.min(widths.length - 1, Math.max(0, lo + d)))}
          price={lowPrice}
        />
        <Bound
          label="Range high"
          value={widths[hi] * 100}
          onStep={(d) => setHi(Math.min(widths.length - 1, Math.max(0, hi + d)))}
          price={highPrice}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {pool.presets.map((p) => {
          const idx = snap(widths, p.pctLow);
          const active = idx === lo && idx === hi;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => { setLo(idx); setHi(idx); }}
              className={`rounded-full border px-2.5 py-1 text-[0.6875rem] transition-colors ${
                active ? 'border-accent bg-accent/10 text-accent'
                  : 'border-bg-border text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Figure label="Fee APR" value={pct(point.feeAprPct)} tone="text-ink-primary"
          info="Trading fees only. Your dollar's share of the liquidity actually earning at this price, times what the pool takes in fees over a year at today's volume." />
        <Figure
          label={pool.rewardLabel || 'Rewards'}
          value={point.rewardAprPct != null ? pct(point.rewardAprPct) : '—'}
          tone="text-stock"
          info="Emissions from the pool gauge, which require staking the position NFT. They are shared out by liquidity in range in the same proportion as fees." />
        <Figure label="Total APR" value={pct(point.totalAprPct)} tone="text-gain"
          info="Fees plus emissions for this range. It assumes the price stays inside it: out of range, both go to zero." />
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

    </Card>
  );
}

function Bound({ label, value, onStep, price }: {
  label: string; value: number; onStep: (d: number) => void; price: number;
}) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-elevated px-3 py-2">
      <p className="text-[0.6875rem] text-ink-muted">{label}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <button type="button" onClick={() => onStep(-1)} aria-label={`${label} down`}
          className="h-6 w-6 rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary">−</button>
        <span className="tnum text-[0.9375rem] font-medium">
          {value > 0 ? '+' : ''}{value.toFixed(Math.abs(value) < 1 ? 2 : 1)}%
        </span>
        <button type="button" onClick={() => onStep(1)} aria-label={`${label} up`}
          className="h-6 w-6 rounded-md border border-bg-border text-ink-secondary hover:text-ink-primary">+</button>
      </div>
      <p className="mt-0.5 text-center text-[0.625rem] tnum text-ink-muted">{fmtPrice(price)}</p>
    </div>
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
