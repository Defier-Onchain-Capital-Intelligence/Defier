'use client';
/**
 * Ahead or behind, day by day.
 *
 * The report's headline is one number at one moment, and that number hides its
 * own history: a position can spend months behind and finish ahead, and the
 * owner never learns which it was. This draws the same quantity — capital
 * against holding, fees excluded — for every day since the first position.
 *
 * It loads after the report rather than with it. The curve is the second
 * question someone asks, and making the first answer wait on it would trade a
 * number people came for against a chart they have not asked for yet.
 */
import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts';
import type { ValueHistory, ValuePoint } from '@/types/portfolio';
import { usd, toneOf } from '@/lib/format';
import { Card, Label, Skeleton } from '@/components/ui/Primitives';

const dayLabel = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

const fullDate = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

function CurveTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ValuePoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-bg-border bg-bg-surface p-3 text-xs shadow-lg">
      <p className="tnum text-ink-muted">{fullDate(p.timestamp)}</p>
      <p className={`mt-1 font-semibold tnum ${toneOf(p.divergenceUsd)}`}>
        {usd(p.divergenceUsd, { sign: true })} vs holding
      </p>
      <p className="mt-1 tnum text-ink-secondary">{usd(p.lpUsd)} in liquidity</p>
      <p className="tnum text-ink-muted">{usd(p.hodlUsd)} if never deposited</p>
    </div>
  );
}

export function ValueCurve({ address }: { address: string }) {
  const [history, setHistory] = useState<ValueHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setHistory(null); setError(null);
    fetch(`/api/history/${address}`, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error || `Request failed (${r.status})`);
        return body.history as ValueHistory;
      })
      .then((h) => { if (live) setHistory(h); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [address]);

  if (error) return null;                       // the report stands without it
  if (!history) return <Skeleton className="h-52" />;
  if (history.points.length < 2) return null;   // one dot is not a curve

  const points = history.points;
  const best = points.reduce((a, b) => (b.divergenceUsd > a.divergenceUsd ? b : a));
  const worst = points.reduce((a, b) => (b.divergenceUsd < a.divergenceUsd ? b : a));
  const swung = best.divergenceUsd > 0 && worst.divergenceUsd < 0;

  return (
    <Card>
      <Label>Ahead or behind, day by day</Label>

      <div className="mt-3 -mx-2 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <ReferenceLine y={0} stroke="#23262F" />
            <XAxis
              dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']}
              tick={{ fill: '#6B7280', fontSize: 10 }} tickLine={false} axisLine={false}
              tickFormatter={dayLabel} minTickGap={44}
            />
            <YAxis
              tick={{ fill: '#6B7280', fontSize: 10 }} tickLine={false} axisLine={false}
              width={52} tickFormatter={(v: number) => usd(v)}
            />
            <Tooltip content={<CurveTooltip />} />
            <Line
              type="monotone" dataKey="divergenceUsd" dot={false} strokeWidth={2}
              stroke="#3B6EF6" isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
        {swung ? (
          <>
            This did not travel in a straight line. It was {usd(Math.abs(worst.divergenceUsd))} behind
            holding on {fullDate(worst.timestamp)} and {usd(best.divergenceUsd)} ahead
            on {fullDate(best.timestamp)}.
          </>
        ) : (
          <>
            Best day {fullDate(best.timestamp)} at {usd(best.divergenceUsd, { sign: true })};
            worst {fullDate(worst.timestamp)} at {usd(worst.divergenceUsd, { sign: true })}.
          </>
        )}
      </p>

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-muted">
        Capital only: what is inside the positions plus everything already withdrawn, against the
        same tokens never deposited. Fees and emissions are earnings, not capital, and are counted
        separately above. The last point sits on the headline above, give or take the difference
        between a daily price series and a live one.
        {history.complete ? '' : ' Some positions are not in this curve — see the notes below.'}
      </p>

      {history.notes.length ? (
        <ul className="mt-2 space-y-1">
          {history.notes.map((n) => (
            <li key={n} className="text-[0.6875rem] leading-relaxed text-ink-muted">{n}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
