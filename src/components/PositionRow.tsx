'use client';
import Link from 'next/link';
import type { LpPosition } from '@/types/portfolio';
import { usd, pct, toneOf, price as fmtPrice } from '@/lib/format';
import { StatusPill } from '@/components/ui/Primitives';
import { RangeBar } from '@/components/ui/RangeBar';

/**
 * One line in a list. Scannable without reading: pair, state, value, verdict,
 * and where the price actually sits inside the range — which is the fact that
 * decides whether this position is still working.
 */
export function PositionRow({ position, wallet }: { position: LpPosition; wallet: string }) {
  const vsHodl = position.pnl?.lpVsHodlUsd ?? null;
  const apr = position.pnl?.realizedAprPct ?? null;
  const hasStock = position.token0.isTokenizedStock || position.token1.isTokenizedStock;

  return (
    <Link
      href={`/position/${encodeURIComponent(position.id)}?wallet=${wallet}`}
      className="block py-3 transition-colors hover:bg-bg-elevated/50 -mx-4 px-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {position.symbol}
            {hasStock ? <span className="ml-2 pill-stock">Stock</span> : null}
          </p>
          <p className="mt-1">
            <StatusPill inRange={position.inRange} staked={position.staked} closed={position.closed} />
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold tnum">{usd(position.valueUsd)}</p>
          {vsHodl != null ? (
            <p className={`text-xs tnum ${toneOf(vsHodl)}`}>{usd(vsHodl, { sign: true })} vs HODL</p>
          ) : (
            <p className="text-xs text-ink-muted">tap for P&amp;L</p>
          )}
        </div>
      </div>

      {!position.closed && position.priceUpper > position.priceLower ? (
        <div className="mt-2.5 flex items-center gap-3">
          <RangeBar
            lower={position.priceLower}
            upper={position.priceUpper}
            current={position.currentPrice}
            inRange={position.inRange}
          />
          <div className="flex shrink-0 items-baseline gap-3 text-[0.6875rem] tnum text-ink-muted">
            <span>{fmtPrice(position.priceLower)}</span>
            <span className={position.inRange ? 'text-ink-secondary' : 'text-warn'}>
              {fmtPrice(position.currentPrice)}
            </span>
            <span>{fmtPrice(position.priceUpper)}</span>
          </div>
        </div>
      ) : null}

      {apr != null ? (
        <p className="mt-1.5 text-[0.6875rem] text-ink-muted">
          <span className="text-gain tnum">{pct(apr)}</span> real APR so far
        </p>
      ) : null}
    </Link>
  );
}
