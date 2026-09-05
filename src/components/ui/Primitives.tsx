/** Small building blocks shared by every screen. Presentational only. */
import { toneOf, usd } from '@/lib/format';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`card-p ${className}`}>{children}</section>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="label">{children}</p>;
}

/** A labelled figure. The label is quiet, the figure is not. */
export function Stat({
  label, value, tone, sub,
}: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className={`mt-1 text-[0.9375rem] font-semibold tnum ${tone ?? 'text-ink-primary'}`}>{value}</p>
      {sub ? <p className="text-xs text-ink-muted mt-0.5">{sub}</p> : null}
    </div>
  );
}

export function MoneyStat({ label, value, signed = false, sub }: {
  label: string; value: number | null; signed?: boolean; sub?: string;
}) {
  return <Stat label={label} value={usd(value, { sign: signed })} tone={signed ? toneOf(value) : undefined} sub={sub} />;
}

/** In range, out of range, staked, closed. Read at a glance, not read word by word. */
export function StatusPill({ inRange, staked, closed }: {
  inRange: boolean; staked: boolean; closed: boolean;
}) {
  if (closed) return <span className="pill-muted">Closed</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {staked ? <span className="pill-stock">Staked</span> : null}
      <span className={inRange ? 'pill-gain' : 'pill-warn'}>{inRange ? 'In range' : 'Out of range'}</span>
    </span>
  );
}

/** Exposure as a single bar. Proportion is the message, so it is drawn, not listed. */
const CLASS_COLOR: Record<string, string> = {
  ETH: 'bg-accent', BTC: 'bg-warn', STABLE: 'bg-gain',
  STOCK: 'bg-stock', AERO: 'bg-loss', OTHER: 'bg-ink-muted',
};

export function ExposureBar({ slices }: {
  slices: Array<{ assetClass: string; label: string; pct: number }>;
}) {
  if (!slices?.length) return null;
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
        {slices.map((s) => (
          <div
            key={s.assetClass}
            className={CLASS_COLOR[s.assetClass] ?? CLASS_COLOR.OTHER}
            style={{ width: `${Math.max(s.pct, 0)}%` }}
            title={`${s.label} ${s.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {slices.map((s) => (
          <span key={s.assetClass} className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
            <span className={`h-2 w-2 rounded-full ${CLASS_COLOR[s.assetClass] ?? CLASS_COLOR.OTHER}`} />
            {s.label}
            <span className="tnum text-ink-muted">{s.pct.toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Confidence is a product feature, not an apology: it says what we could not read. */
export function ConfidenceNote({ confidence, notes }: {
  confidence: 'full' | 'partial'; notes: string[];
}) {
  if (confidence === 'full' || !notes?.length) return null;
  return (
    <div className="rounded-xl border border-bg-border bg-bg-elevated p-3">
      <p className="label text-warn">Partial data</p>
      <ul className="mt-1.5 space-y-1">
        {notes.map((note) => <li key={note} className="text-xs text-ink-secondary">{note}</li>)}
      </ul>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-bg-elevated ${className}`} />;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="text-center">
      <p className="font-medium">{title}</p>
      <p className="muted mt-1">{body}</p>
    </Card>
  );
}
