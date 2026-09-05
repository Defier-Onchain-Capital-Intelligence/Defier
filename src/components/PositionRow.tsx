'use client';
import Link from 'next/link';
import type { LpPosition } from '@/types/portfolio';
import { usd, toneOf } from '@/lib/format';
import { StatusPill } from '@/components/ui/Primitives';

/** One line in a list. Scannable without reading: pair, state, value, verdict. */
export function PositionRow({ position, wallet }: { position: LpPosition; wallet: string }) {
  const vsHodl = position.pnl?.lpVsHodlUsd ?? null;
  const hasStock = position.token0.isTokenizedStock || position.token1.isTokenizedStock;

  return (
    <Link
      href={`/position/${encodeURIComponent(position.id)}?wallet=${wallet}`}
      className="block py-3 transition-colors hover:bg-bg-elevated/50 -mx-4 px-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate">
            {position.symbol}
            {hasStock ? <span className="ml-2 pill-stock">Stock</span> : null}
          </p>
          <p className="mt-1"><StatusPill inRange={position.inRange} staked={position.staked} closed={position.closed} /></p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold tnum">{usd(position.valueUsd)}</p>
          {vsHodl != null ? (
            <p className={`text-xs tnum ${toneOf(vsHodl)}`}>{usd(vsHodl, { sign: true })} vs HODL</p>
          ) : (
            <p className="text-xs text-ink-muted">tap for P&amp;L</p>
          )}
        </div>
      </div>
    </Link>
  );
}
