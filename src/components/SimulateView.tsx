'use client';
/**
 * Simulate. The same comparison as the rest of the product, pointed forwards.
 *
 * The curve answers one question at a glance: across what price range does this
 * position beat holding the same tokens. Where the line crosses zero is the
 * decision; everything else is context.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceArea,
} from 'recharts';
import { usd, price as fmtPrice, toneOf } from '@/lib/format';
import { Card, Label, EmptyState } from '@/components/ui/Primitives';
import { TokenPair } from '@/components/ui/TokenLogo';
import { PoolPicker } from '@/components/PoolPicker';
import type { PoolDetail } from '@/types/pool';

type Point = {
  price: number; lpValue: number; holdValue: number;
  feesEarned: number; totalWithFees: number; pnlVsHold: number; inRange: boolean;
  pctToken0?: number; pctToken1?: number;
};

/** Which pool this simulation is about. Without it the screen is arithmetic in a
 *  vacuum: the same numbers mean different things on a CL1 and a CL200 pool. */
export type SimContext = {
  symbol?: string; variant?: string; project?: string;
  symbol0?: string; symbol1?: string;
  address0?: string; address1?: string;
  /** The pool's tick spacing. Ranges only exist at multiples of it. */
  tickSpacing?: number;
  source?: 'position' | 'pool' | 'picker';
};

const PROJECT_LABEL: Record<string, string> = {
  'aerodrome-slipstream': 'Aerodrome',
  'aerodrome-v1': 'Aerodrome v1',
  'uniswap-v3': 'Uniswap V3',
  aerodrome: 'Aerodrome',
};

/**
 * The range is entered as a distance from the entry price, not as two absolute
 * numbers.
 *
 * Two reasons, and the second one is a bug this replaces. A range is a decision
 * about width — "give me five percent either side" — and reading it as two
 * prices with fourteen decimals makes the reader do arithmetic to find out what
 * they chose. And a number input on a price like 0.0286 steps by 1: one press
 * of the down arrow produced -0.97, a negative price, which no amount of
 * validation makes into a sensible control. Percentages step by halves and
 * cannot walk off the end.
 */
type FormState = {
  entryPrice: number;
  lowPct: number;      // negative: below entry
  highPct: number;     // positive: above entry
  positionUsd: number;
  aprPct: number;
  days: number;
};

/** How wide a price sweep the curve covers, narrowest first. Index 3 is the default. */
const ZOOM_LEVELS = [1.15, 1.4, 1.7, 2, 3, 5, 8];
const DEFAULT_ZOOM = 3;

/**
 * What callers pass in: a real position or a pool's suggested range, in prices.
 * The form converts those to percentages once, on open, because a preset arrives
 * as two absolute prices and a person thinks in width.
 */
export type SimPreset = {
  entryPrice?: number;
  lowerPrice?: number;
  upperPrice?: number;
  positionUsd?: number;
  aprPct?: number;
  days?: number;
};

/**
 * The nearest range width this pool can actually hold.
 *
 * A bound in a concentrated pool lives on a tick, and ticks exist only at
 * multiples of the pool's spacing. On a CL200 pool one spacing is about two
 * percent, so a simulation of ±0.5% there is a simulation of a position nobody
 * can open. Snapping is not a nicety: an unsnapped answer is a made up one.
 */
const tickPct = (tickSpacing?: number) =>
  tickSpacing ? (Math.pow(1.0001, tickSpacing) - 1) * 100 : null;

function snapPct(pct: number, tickSpacing?: number) {
  if (!tickSpacing || !(1 + pct / 100 > 0)) return pct;
  const ticks = Math.log(1 + pct / 100) / Math.log(1.0001);
  const snapped = Math.round(ticks / tickSpacing) * tickSpacing;
  return (Math.pow(1.0001, snapped) - 1) * 100;
}

const priceFrom = (entry: number, pct: number) => entry * (1 + pct / 100);
const pctFrom = (entry: number, price: number) => (price / entry - 1) * 100;

export function SimulateView({ preset, context, poolId }: {
  preset?: SimPreset;
  context?: SimContext;
  poolId?: string;
}) {
  const [form, setForm] = useState<FormState>(() => {
    const entryPrice = preset?.entryPrice ?? 2500;
    return {
      entryPrice,
      lowPct: preset?.lowerPrice ? pctFrom(entryPrice, preset.lowerPrice) : -20,
      highPct: preset?.upperPrice ? pctFrom(entryPrice, preset.upperPrice) : 28,
      positionUsd: preset?.positionUsd ?? 10000,
      aprPct: preset?.aprPct ?? 25,
      days: preset?.days ?? 30,
    };
  });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [ctx, setCtx] = useState<SimContext | undefined>(context);
  /**
   * The pool's own APR table, when this simulation is about a real pool.
   *
   * The form used to ask the reader for an expected APR, which is the one number
   * they came here to find out. Nobody knows what their range will pay — that is
   * the question. So when a pool is in play the APR is read from the matrix the
   * server solved for it, and it moves as the range moves.
   */
  const [aprSource, setAprSource] = useState<{
    widths: number[];
    matrix: PoolDetail['aprMatrix'];
    rewardLabel: string | null;
  } | null>(null);

  // A simulation opened from a pool screen carries that pool's id. Fetching its
  // table is what turns the APR from a number frozen into the link into one that
  // answers the range being dragged. It fails quietly: the caller's figure stands.
  useEffect(() => {
    if (!poolId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/pool/${poolId}`);
        const pool: PoolDetail = await res.json();
        if (!alive || !res.ok || !pool?.widths?.length || !pool.aprMatrix) return;
        setAprSource({ widths: pool.widths, matrix: pool.aprMatrix, rewardLabel: pool.rewardLabel ?? null });
      } catch (_) { /* the simulation still works without it */ }
    })();
    return () => { alive = false; };
  }, [poolId]);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Snapped, always. The form may hold what was typed; everything downstream —
  // the curve, the band, the prices shown — uses what the pool can hold.
  const spacing = ctx?.tickSpacing;
  const lowPct = snapPct(form.lowPct, spacing);
  const highPct = snapPct(form.highPct, spacing);
  const lowerPrice = priceFrom(form.entryPrice, lowPct);
  const upperPrice = priceFrom(form.entryPrice, highPct);
  const step = tickPct(spacing);

  /**
   * Caught here rather than at the server, because the screen must not keep
   * drawing the previous answer while the inputs say something else. A stale
   * curve beside an error message reads as a chart that broke, and the reader
   * has no way to tell which of the two to believe.
   */
  const invalid = useMemo(() => {
    if (!(form.entryPrice > 0)) return 'The entry price has to be above zero.';
    if (lowPct <= -100) return 'The lower bound cannot reach zero: that is not a price.';
    if (highPct <= lowPct) return 'The upper bound has to be above the lower one.';
    if (!(form.positionUsd > 0)) return 'A position has to have a size.';
    if (!(form.days > 0)) return 'The horizon has to be at least a day.';
    return null;
  }, [form, lowPct, highPct]);

  useEffect(() => {
    if (invalid) { setPoints(null); setError(null); setBusy(false); return; }

    let live = true;
    setBusy(true); setError(null);
    const id = setTimeout(() => {
      fetch('/api/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entryPrice: form.entryPrice,
          lowerPrice,
          upperPrice,
          positionUsd: form.positionUsd,
          aprPct: form.aprPct,
          days: form.days,
          rangeMultiplier: ZOOM_LEVELS[zoom],
        }),
      })
        .then((r) => r.json())
        .then((d) => { if (!live) return; if (d.error) { setError(d.error); setPoints(null); } else setPoints(d.points); })
        .catch((e) => { if (live) setError(e.message); })
        .finally(() => { if (live) setBusy(false); });
    }, 250);   // debounce: the inputs move faster than the network
    return () => { live = false; clearTimeout(id); };
  }, [form, zoom, invalid, lowerPrice, upperPrice]);

  // Where the position stops beating holding. This is the answer; the chart is the evidence.
  const crossings = useMemo(() => {
    if (!points?.length) return [];
    const found: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if ((a.pnlVsHold < 0) !== (b.pnlVsHold < 0)) {
        const t = Math.abs(a.pnlVsHold) / (Math.abs(a.pnlVsHold) + Math.abs(b.pnlVsHold));
        found.push(a.price + (b.price - a.price) * t);
      }
    }
    return found;
  }, [points]);

  const atEntry = points?.find((p) => p.price >= form.entryPrice)?.pnlVsHold ?? null;

  /**
   * What this exact range pays, read from the pool rather than typed in.
   *
   * Both bounds are distances from the current price, which is how the matrix is
   * indexed, so a move on either side lands on a different cell. Without a pool
   * behind the simulation there is nothing to read and the figure the caller
   * arrived with stands.
   */
  const rangeApr = useMemo(() => {
    if (!aprSource?.widths?.length || !aprSource.matrix) return null;
    const near = (target: number) => {
      let best = 0;
      for (let i = 1; i < aprSource.widths.length; i += 1) {
        if (Math.abs(aprSource.widths[i] - target) < Math.abs(aprSource.widths[best] - target)) best = i;
      }
      return best;
    };
    const cell = aprSource.matrix[near(Math.abs(lowPct) / 100)]?.[near(Math.abs(highPct) / 100)];
    return cell ?? null;
  }, [aprSource, lowPct, highPct]);

  // The curve is solved from one APR, so the one the pool reports is the one it
  // gets. Written into the form rather than passed around it, because everything
  // downstream already reads the form.
  useEffect(() => {
    if (rangeApr && Math.abs(rangeApr.t - form.aprPct) > 0.005) {
      setForm((f) => ({ ...f, aprPct: rangeApr.t }));
    }
  }, [rangeApr, form.aprPct]);

  /** A pool chosen here fills the form from that pool, not from defaults. */
  function applyPool(pool: PoolDetail) {
    const preferred = pool.presets?.[1];
    const lowPct = preferred ? -preferred.pctLow * 100 : -5;
    const highPct = preferred ? preferred.pctHigh * 100 : 5;
    setAprSource(pool.widths?.length && pool.aprMatrix
      ? { widths: pool.widths, matrix: pool.aprMatrix, rewardLabel: pool.rewardLabel ?? null }
      : null);

    setForm((f) => ({
      ...f,
      entryPrice: pool.currentPrice,
      lowPct: round2(lowPct),
      highPct: round2(highPct),
    }));
    setZoom(DEFAULT_ZOOM);
    setCtx({
      symbol: pool.symbol,
      variant: pool.variant || undefined,
      project: pool.project,
      symbol0: pool.tokens?.token0?.symbol || undefined,
      symbol1: pool.tokens?.token1?.symbol || undefined,
      address0: pool.tokens?.token0?.address,
      address1: pool.tokens?.token1?.address,
      tickSpacing: pool.tickSpacing ?? undefined,
      source: 'picker',
    });
  }

  const s0 = ctx?.symbol0 || 'token0';
  const s1 = ctx?.symbol1 || 'token1';

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Simulate</h1>

      {ctx?.symbol ? (
        <Card>
          <div className="flex items-center gap-2.5">
            <TokenPair
              token0={{ address: ctx.address0, symbol: ctx.symbol0 }}
              token1={{ address: ctx.address1, symbol: ctx.symbol1 }}
              size={26}
            />
            <div className="min-w-0">
              <p className="truncate font-medium">
                {ctx.symbol}
                {ctx.variant ? (
                  <span className="ml-1.5 rounded bg-bg-elevated px-1 py-0.5 text-[0.5625rem] font-medium text-ink-secondary">
                    {ctx.variant}
                  </span>
                ) : null}
              </p>
              <p className="text-[0.6875rem] text-ink-muted">
                {PROJECT_LABEL[ctx.project || ''] || ctx.project || 'Base'}
                {ctx.source === 'position' ? ' · from your position'
                  : ctx.source === 'picker' ? ' · chosen here'
                  : ' · from the pool screen'}
                {' · price of '}{s0}{' in '}{s1}
              </p>
            </div>
            {ctx.source === 'picker' ? (
              <button
                type="button"
                onClick={() => setCtx(undefined)}
                className="ml-auto shrink-0 text-[0.6875rem] text-accent"
              >
                Change
              </button>
            ) : null}
          </div>
        </Card>
      ) : (
        <PoolPicker onPick={applyPool} />
      )}

      <Card>
        <Label>Position</Label>

        <div className="mt-3 space-y-3">
          <Field label="Entry price" suffix={s1}>
            <input
              type="number" step="any" className="input tnum pr-16"
              value={form.entryPrice}
              onChange={(e) => setForm((f) => ({ ...f, entryPrice: Number(e.target.value) }))}
            />
          </Field>

          {/* Low on the left, high on the right: a range reads as a range only
              when its two ends sit where a reader expects to find them. */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Range low" suffix="%" hint={fmtPrice(lowerPrice)}>
              <input
                type="number" step={step ? round2(step) : 0.5} className="input tnum pr-10"
                value={round2(form.lowPct)}
                onChange={(e) => setForm((f) => ({ ...f, lowPct: Number(e.target.value) }))}
                onBlur={() => setForm((f) => ({ ...f, lowPct: round2(snapPct(f.lowPct, spacing)) }))}
              />
            </Field>
            <Field label="Range high" suffix="%" hint={fmtPrice(upperPrice)}>
              <input
                type="number" step={step ? round2(step) : 0.5} className="input tnum pr-10"
                value={round2(form.highPct)}
                onChange={(e) => setForm((f) => ({ ...f, highPct: Number(e.target.value) }))}
                onBlur={() => setForm((f) => ({ ...f, highPct: round2(snapPct(f.highPct, spacing)) }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Position size" prefix="$">
              <input
                type="number" step="any" className="input tnum pl-7"
                value={form.positionUsd}
                onChange={(e) => setForm((f) => ({ ...f, positionUsd: Number(e.target.value) }))}
              />
            </Field>
            {rangeApr ? (
              <div>
                <p className="text-[0.6875rem] text-ink-muted">APR for this range</p>
                <div className="mt-1 rounded-xl border border-bg-border bg-bg-elevated px-3 py-[0.6875rem]">
                  <p className="tnum text-[0.9375rem] font-semibold text-gain">{round2(rangeApr.t)}%</p>
                  <p className="mt-0.5 text-[0.625rem] tnum text-ink-muted">
                    {round2(rangeApr.f)}% fees
                    {rangeApr.r != null ? ` · ${round2(rangeApr.r)}% ${aprSource?.rewardLabel || 'rewards'}` : ''}
                  </p>
                </div>
              </div>
            ) : (
              <Field label="Expected APR" suffix="%">
                <input
                  type="number" step="0.1" className="input tnum pr-10"
                  value={form.aprPct}
                  onChange={(e) => setForm((f) => ({ ...f, aprPct: Number(e.target.value) }))}
                />
              </Field>
            )}
          </div>

          {step ? (
            <p className="text-[0.6875rem] leading-relaxed text-ink-muted">
              This pool moves in steps of {step < 0.01 ? step.toFixed(4) : step.toFixed(2)}% —
              one tick spacing{ctx?.variant ? ` on ${ctx.variant}` : ''}. Anything between two steps
              is a range it cannot hold, so the numbers above land on the nearest one it can.
            </p>
          ) : null}

          <Field label="Horizon" suffix="days">
            <input
              type="number" step="1" className="input tnum pr-16"
              value={form.days}
              onChange={(e) => setForm((f) => ({ ...f, days: Number(e.target.value) }))}
            />
          </Field>
        </div>
      </Card>

      {invalid ? <EmptyState title="That range cannot exist" body={invalid} /> : null}
      {error && !invalid ? <EmptyState title="That does not compute" body={error} /> : null}

      {points?.length ? (
        <>
          <Card>
            <Label>Versus holding</Label>
            <p className={`kpi mt-1 ${toneOf(atEntry)}`}>{usd(atEntry, { sign: true })}</p>
            <p className="mt-1 text-xs text-ink-muted">
              if the price stays where it is for {form.days} days
            </p>

            {/* Zoom exists because a range can be narrower than the chart can
                show. Widening the sweep asks the server for more curve rather
                than stretching the same points, so the shape stays true. */}
            <div className="mt-4 flex items-center justify-end gap-1.5">
              <span className="mr-auto text-[0.6875rem] text-ink-muted">
                Showing {Math.round((ZOOM_LEVELS[zoom] - 1) * 100)}% beyond each edge
              </span>
              <button
                type="button" aria-label="Zoom in"
                disabled={zoom === 0}
                onClick={() => setZoom((z) => Math.max(0, z - 1))}
                className="h-7 w-7 rounded-lg border border-bg-border text-ink-secondary disabled:opacity-40"
              >
                −
              </button>
              <button
                type="button" aria-label="Zoom out"
                disabled={zoom === ZOOM_LEVELS.length - 1}
                onClick={() => setZoom((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))}
                className="h-7 w-7 rounded-lg border border-bg-border text-ink-secondary disabled:opacity-40"
              >
                +
              </button>
            </div>

            <div className="mt-2 -mx-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <ReferenceArea x1={lowerPrice} x2={upperPrice} fill="#3B6EF6" fillOpacity={0.07} />
                  <ReferenceLine y={0} stroke="#23262F" />
                  {/* Where you are standing. Every reading on this curve is
                      relative to it, and without it the chart is unanchored. */}
                  <ReferenceLine
                    x={form.entryPrice}
                    stroke="#F7F8FA"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    label={{ value: 'entry', position: 'top', fill: '#9CA3AF', fontSize: 10 }}
                  />
                  <XAxis
                    dataKey="price" type="number" domain={['dataMin', 'dataMax']}
                    tick={{ fill: '#6B7280', fontSize: 10 }} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => fmtPrice(v)}
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fill: '#6B7280', fontSize: 10 }} tickLine={false} axisLine={false}
                    width={52} tickFormatter={(v: number) => usd(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#101218', border: '1px solid #23262F',
                      borderRadius: 12, fontSize: 12, color: '#F7F8FA',
                    }}
                    content={<CurveTooltip symbol0={s0} symbol1={s1} />}
                  />
                  <Line
                    type="monotone" dataKey="pnlVsHold" dot={false} strokeWidth={2}
                    stroke="#3B6EF6" isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {busy ? <p className="text-xs text-ink-muted">Recalculating…</p> : null}
          </Card>

          <Card>
            <Label>What the curve says</Label>
            {crossings.length ? (
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                This position beats holding while the price stays between{' '}
                <span className="tnum text-ink-primary">{fmtPrice(crossings[0])}</span>
                {crossings.length > 1 ? (
                  <> and <span className="tnum text-ink-primary">{fmtPrice(crossings[crossings.length - 1])}</span></>
                ) : ' and above'}
                . Outside that band, the fees stop covering what concentrating the liquidity costs you.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                Over this price range the position never crosses holding. At {form.aprPct}% APR for{' '}
                {form.days} days, fees {atEntry != null && atEntry > 0 ? 'always cover' : 'never cover'} the divergence.
              </p>
            )}
            <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-muted">
              The shaded band is your range. Fees only accrue inside it, which is why the
              curve bends at both edges.
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}


const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A labelled input that says what its number is measured in.
 *
 * Every field on this form is a different unit — a price, a percentage, dollars,
 * days — and a column of bare numbers makes the reader guess which is which. The
 * unit sits inside the field, and a percentage also shows the price it lands on,
 * because the percentage is the decision and the price is the consequence.
 */
function Field({ label, children, prefix, suffix, hint }: {
  label: string;
  children: React.ReactNode;
  prefix?: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="relative mt-1 block">
        {prefix ? (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-muted">
            {prefix}
          </span>
        ) : null}
        {children}
        {suffix ? (
          <span className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 text-sm text-ink-muted">
            {suffix}
          </span>
        ) : null}
      </span>
      {hint ? <span className="mt-1 block text-[0.6875rem] tnum text-ink-muted">{hint}</span> : null}
    </label>
  );
}

/**
 * The tooltip answers both questions at once.
 *
 * How much you would be up or down against holding, and — the part every other
 * simulator leaves out — what you would actually be holding at that price. A
 * position that is "only" 2% behind while having converted entirely into the
 * asset you were trying to reduce is not a small difference.
 */
function CurveTooltip({ active, payload, label, symbol0, symbol1 }: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
  label?: string | number;
  symbol0: string;
  symbol1: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const pct0 = p.pctToken0;
  const pct1 = p.pctToken1;

  return (
    <div className="rounded-xl border border-bg-border bg-bg-surface p-3 text-xs shadow-lg">
      <p className="tnum text-ink-muted">Price {fmtPrice(Number(label))}</p>
      <p className={`mt-1 font-semibold tnum ${toneOf(p.pnlVsHold)}`}>
        {usd(p.pnlVsHold, { sign: true })} vs holding
      </p>
      <p className="mt-0.5 tnum text-ink-secondary">{usd(p.totalWithFees)} total</p>

      {pct0 != null && pct1 != null ? (
        <div className="mt-2 border-t border-bg-border pt-2">
          <p className="text-[0.625rem] uppercase tracking-wide text-ink-muted">You would be holding</p>
          <div className="mt-1.5 flex h-1.5 w-32 overflow-hidden rounded-full bg-bg-elevated">
            <div className="bg-accent" style={{ width: `${pct0}%` }} />
            <div className="bg-stock" style={{ width: `${pct1}%` }} />
          </div>
          <p className="mt-1.5 tnum text-ink-secondary">
            <span className="text-accent">{pct0.toFixed(0)}%</span> {symbol0}
            {' · '}
            <span className="text-stock">{pct1.toFixed(0)}%</span> {symbol1}
          </p>
        </div>
      ) : null}

      {!p.inRange ? (
        <p className="mt-2 text-[0.625rem] text-warn">Out of range here: no fees accrue.</p>
      ) : null}
    </div>
  );
}
