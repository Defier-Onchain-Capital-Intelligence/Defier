'use client';
/**
 * Where the price sits inside the range, as one small picture.
 *
 * Two ends and a marker. Reading two decimal prices and comparing them to a
 * third takes a second of arithmetic; seeing the marker near the right edge
 * takes none, and near-the-edge is the thing that costs LPs money. Green while
 * the position is earning, amber the moment it stops.
 *
 * Out of range, the marker is pinned to the side it left through, so the
 * direction of the drift stays visible instead of clamping to a meaningless end.
 */
export function RangeBar({ lower, upper, current, inRange, compact = false }: {
  lower: number; upper: number; current: number; inRange: boolean; compact?: boolean;
}) {
  if (!(upper > lower) || !Number.isFinite(current)) return null;

  const span = upper - lower;
  const raw = ((current - lower) / span) * 100;
  const marker = Math.min(Math.max(raw, 0), 100);
  const outside = raw < 0 || raw > 100;

  const tone = inRange ? 'bg-gain' : 'bg-warn';
  const track = inRange ? 'bg-gain/20' : 'bg-warn/15';

  return (
    <div className={compact ? 'w-24' : 'w-full'} aria-hidden>
      <div className={`relative ${compact ? 'h-1.5' : 'h-2'} rounded-full ${track}`}>
        {/* The ends of the range, drawn so the bar reads as an interval. */}
        <span className={`absolute left-0 top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-full ${tone} opacity-50`} />
        <span className={`absolute right-0 top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-full ${tone} opacity-50`} />
        <span
          className={`absolute top-1/2 h-3.5 w-[3px] -translate-y-1/2 rounded-full ${tone} ${outside ? 'opacity-70' : ''}`}
          style={{ left: `calc(${marker}% - 1.5px)` }}
        />
      </div>
    </div>
  );
}
