/** Small building blocks shared by every screen. Presentational only. */
import Link from 'next/link';
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
export function StatusPill({ inRange, staked, closed, kind }: {
  inRange: boolean; staked: boolean; closed: boolean; kind?: string;
}) {
  if (closed) return <span className="pill-muted">Closed</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {staked ? <span className="pill-stock">Staked</span> : null}
      {/* A Basic pool has no range: saying "in range" would be true and
          misleading, because it implies there is one to leave. */}
      {kind === 'amm'
        ? <span className="pill-gain">Basic pool</span>
        : <span className={inRange ? 'pill-gain' : 'pill-warn'}>{inRange ? 'In range' : 'Out of range'}</span>}
    </span>
  );
}

/** Exposure as a single bar. Proportion is the message, so it is drawn, not listed. */
const CLASS_COLOR: Record<string, string> = {
  ETH: 'bg-accent', BTC: 'bg-warn', STABLE: 'bg-gain',
  STOCK: 'bg-stock', AERO: 'bg-loss', OTHER: 'bg-ink-muted',
};

/**
 * The bar is drawn from how much of the wallet each slice is, and the legend
 * says which way. A borrowed asset is a negative share, and a negative width
 * cannot be drawn: clamping it to zero would drop it from the bar while the
 * legend still named it, leaving a picture that does not add up to its own key.
 * So width is the size of the stake and the sign is written next to it.
 */
export function ExposureBar({ slices }: {
  slices: Array<{ assetClass: string; label: string; pct: number }>;
}) {
  if (!slices?.length) return null;
  const anyBorrowed = slices.some((s) => s.pct < 0);
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
        {slices.map((s) => (
          <div
            key={s.assetClass}
            className={`${CLASS_COLOR[s.assetClass] ?? CLASS_COLOR.OTHER} ${s.pct < 0 ? 'opacity-40' : ''}`}
            style={{ width: `${Math.min(Math.abs(s.pct), 100)}%` }}
            title={`${s.label} ${Math.abs(s.pct).toFixed(1)}%${s.pct < 0 ? ' borrowed' : ''}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {slices.map((s) => (
          <span key={s.assetClass} className="inline-flex items-center gap-1.5 text-xs text-ink-secondary">
            <span className={`h-2 w-2 rounded-full ${CLASS_COLOR[s.assetClass] ?? CLASS_COLOR.OTHER} ${s.pct < 0 ? 'opacity-40' : ''}`} />
            {s.label}
            <span className="tnum text-ink-muted">
              {Math.abs(s.pct).toFixed(1)}%{s.pct < 0 ? ' borrowed' : ''}
            </span>
          </span>
        ))}
      </div>
      {anyBorrowed ? (
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-muted">
          Shares are of everything at stake, supplied and borrowed together, so
          they add up whichever way a position points.
        </p>
      ) : null}
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

/** A segmented control. One row of choices, never a dropdown: the options are
 *  part of the reading, not hidden behind a click. */
export function Tabs<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ key: T; label: string; sub?: string }>;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-bg-border bg-bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`tab ${value === o.key ? 'tab-active' : ''}`}
        >
          {o.label}
          {o.sub ? (
            // On the active tab the ground is accent coloured, so a muted grey
            // disappears into it.
            <span className={`ml-1.5 tnum ${value === o.key ? 'opacity-70' : 'text-ink-muted'}`}>{o.sub}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** A way back that does not cost a trip through the bottom bar. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink-secondary">
      <span aria-hidden>&larr;</span>
      {children}
    </Link>
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
