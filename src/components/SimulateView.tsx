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

type Point = {
  price: number; lpValue: number; holdValue: number;
  feesEarned: number; totalWithFees: number; pnlVsHold: number; inRange: boolean;
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

export function SimulateView({ preset }: { preset?: Partial<FormState> }) {
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

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Simulate</h1>

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
                    labelFormatter={(v) => `Price ${fmtPrice(Number(v))}`}
                    formatter={(v) => [usd(Number(v)), 'vs holding'] as [string, string]}
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
