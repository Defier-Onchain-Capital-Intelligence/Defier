'use client';
/**
 * The same deposit under four choices, all valued today.
 *
 * This is the screen's argument in one block. Breakeven prices asked the reader
 * to hold "WETH between 9.08 and 10.69 NVDAc" in their head; nobody thinks in
 * those units. Four dollar figures on the same starting capital need no
 * translation, and the winner is marked so the answer survives a two second
 * glance.
 */
import type { StrategyComparison } from '@/types/portfolio';
import { usd, pct, toneOf } from '@/lib/format';
import { Card, Label } from '@/components/ui/Primitives';
import { InfoDot } from '@/components/ui/InfoDot';

export function StrategyTable({ strategies }: { strategies: StrategyComparison }) {
  const { options, capitalUsd, lpWon } = strategies;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <Label>What else you could have done</Label>
        <span className="text-xs text-ink-muted tnum">from {usd(capitalUsd)}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {options.map((o) => (
          <div
            key={o.key}
            className={`rounded-xl border p-3 ${
              o.isBest ? 'border-gain/40 bg-gain/[0.06]' : 'border-bg-border bg-bg-elevated/40'
            }`}
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-[0.6875rem] leading-tight text-ink-secondary">
                {o.label}
                <InfoDot label={o.label}>{o.detail}</InfoDot>
              </p>
              {o.isBest ? (
                <span className="shrink-0 rounded-full bg-gain/15 px-1.5 py-0.5 text-[0.5625rem] font-medium uppercase tracking-wide text-gain">
                  Best
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 font-semibold tnum">{usd(o.valueUsd)}</p>
            <p className={`text-xs tnum ${toneOf(o.pnlUsd)}`}>
              {o.pnlUsd >= 0 ? '+' : ''}{pct(o.pnlPct, 2)}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-muted">
        {lpWon
          ? 'Providing liquidity was the best of the four, on the money you actually put in.'
          : 'Every column starts from the same deposit, valued at the price of the day it went in, and ends at today’s price.'}
      </p>
    </Card>
  );
}
