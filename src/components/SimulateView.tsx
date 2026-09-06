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
  source?: 'position' | 'pool';
};

const PROJECT_LABEL: Record<string, string> = {
  'aerodrome-slipstream': 'Aerodrome',
  'aerodrome-v1': 'Aerodrome v1',
  'uniswap-v3': 'Uniswap V3',
  aerodrome: 'Aerodrome',
};

const FIELDS = [
  { key: 'entryPrice',  label: 'Entry price',   step: 'any' },
  { key: 'lowerPrice',  label: 'Range low',     step: 'any' },
  { key: 'upperPrice',  label: 'Range high',    step: 'any' },
  { key: 'positionUsd', label: 'Position size', step: 'any', prefix: '$' },
  { key: 'aprPct',      label: 'Expected APR',  step: 'any', suffix: '%' },
  { key: 'days',        label: 'Horizon',       step: '1',   suffix: ' days' },
] as const;

type FormState = Record<(typeof FIELDS)[number]['key'], number>;

export function SimulateView({ preset, context }: {
  preset?: Partial<FormState>;
  context?: SimContext;
}) {
  const [form, setForm] = useState<FormState>({
    entryPrice: preset?.entryPrice ?? 2500,
    lowerPrice: preset?.lowerPrice ?? 2000,
    upperPrice: preset?.upperPrice ?? 3200,
    positionUsd: preset?.positionUsd ?? 10000,
    aprPct: preset?.aprPct ?? 25,
    days: preset?.days ?? 30,
  });
  const [points, setPoints] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setBusy(true); setError(null);
    const id = setTimeout(() => {
      fetch('/api/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
        .then((r) => r.json())
        .then((d) => { if (!live) return; if (d.error) setError(d.error); else setPoints(d.points); })
        .catch((e) => { if (live) setError(e.message); })
        .finally(() => { if (live) setBusy(false); });
    }, 250);   // debounce: the sliders move faster than the network
    return () => { live = false; clearTimeout(id); };
  }, [form]);

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

  const s0 = context?.symbol0 || 'token0';
  const s1 = context?.symbol1 || 'token1';

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Simulate</h1>

      {context?.symbol ? (
        <Card>
          <div className="flex items-center gap-2.5">
            <TokenPair
              token0={{ address: context.address0, symbol: context.symbol0 }}
              token1={{ address: context.address1, symbol: context.symbol1 }}
              size={26}
            />
            <div className="min-w-0">
              <p className="truncate font-medium">
                {context.symbol}
                {context.variant ? (
                  <span className="ml-1.5 rounded bg-bg-elevated px-1 py-0.5 text-[0.5625rem] font-medium text-ink-secondary">
                    {context.variant}
                  </span>
                ) : null}
              </p>
              <p className="text-[0.6875rem] text-ink-muted">
                {PROJECT_LABEL[context.project || ''] || context.project || 'Base'}
                {context.source === 'position' ? ' · from your position' : ' · from the pool screen'}
                {' · price of '}{s0}{' in '}{s1}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <p className="px-1 text-xs leading-relaxed text-ink-muted">
          Prices below are token0 quoted in token1. Open this from one of your positions or from a
          pool to have the pair, the range and the size filled in for you.
        </p>
      )}

      <Card>
        <Label>Position</Label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs text-ink-muted">{f.label}</span>
              <input
                type="number"
                step={f.step}
                className="input mt-1 tnum"
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
      </Card>

      {error ? <EmptyState title="That does not compute" body={error} /> : null}

      {points?.length ? (
        <>
          <Card>
            <Label>Versus holding</Label>
            <p className={`kpi mt-1 ${toneOf(atEntry)}`}>{usd(atEntry, { sign: true })}</p>
            <p className="mt-1 text-xs text-ink-muted">
              if the price stays where it is for {form.days} days
            </p>

            <div className="mt-4 -mx-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <ReferenceArea x1={form.lowerPrice} x2={form.upperPrice} fill="#3B6EF6" fillOpacity={0.07} />
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
