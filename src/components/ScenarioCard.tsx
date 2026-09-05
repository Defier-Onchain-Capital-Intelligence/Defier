'use client';
/**
 * Scenario analysis. Advanced by default because it answers a question most
 * people have not thought to ask, and burying it keeps the main screen calm.
 *
 * What it shows is not a forecast. Prices are held constant on purpose: this
 * says what you will be holding, not what it will be worth. Predicting the
 * second would require predicting the market, which this product does not do.
 */
import { useState } from 'react';
import type { Scenarios } from '@/types/portfolio';
import { usd, amount } from '@/lib/format';
import { Card, Label } from '@/components/ui/Primitives';

const CLASS_COLOR: Record<string, string> = {
  ETH: 'bg-accent', BTC: 'bg-warn', STABLE: 'bg-gain',
  STOCK: 'bg-stock', AERO: 'bg-loss', OTHER: 'bg-ink-muted',
};

export function ScenarioCard({ scenarios }: { scenarios: Scenarios }) {
  const [open, setOpen] = useState(false);
  if (!scenarios?.hasPositions) return null;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <Label>If prices move</Label>
          <p className="muted mt-1 text-[0.8125rem] leading-relaxed">
            Your liquidity positions convert as prices move. This is what you would be left holding.
          </p>
        </div>
        <span className="shrink-0 text-xs text-accent">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open ? (
        <div className="mt-4 space-y-5">
          {scenarios.caveat ? (
            <p className="rounded-xl border border-warn/25 bg-warn/[0.06] p-3 text-xs leading-relaxed text-ink-secondary">
              {scenarios.caveat}
            </p>
          ) : null}

          <Side
            title={scenarios.upLabel ? `If ${scenarios.upLabel}` : 'One way'}
            side={scenarios.up}
            tone="text-gain"
          />
          <Side
            title={scenarios.downLabel ? `If ${scenarios.downLabel}` : 'The other way'}
            side={scenarios.down}
            tone="text-loss"
          />

          {scenarios.perPosition.length ? (
            <div>
              <Label>Position by position</Label>
              <ul className="divide-hair mt-1">
                {scenarios.perPosition.map((p) => (
                  <li key={p.id} className="py-3">
                    <p className="text-sm font-medium">
                      {p.symbol}
                      {p.kind === 'crypto-vs-stock' ? <span className="ml-2 pill-stock">Crypto vs stock</span> : null}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-ink-muted">
                      A bet on {p.axisLabel}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{p.explanation}</p>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-ink-muted">Upside</span>
                        <p className="tnum text-gain">{amount(p.upAmount)} {p.upAsset}</p>
                      </div>
                      <div>
                        <span className="text-ink-muted">Downside</span>
                        <p className="tnum text-loss">{amount(p.downAmount)} {p.downAsset}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-[0.6875rem] leading-relaxed text-ink-muted">
            Prices are held at today&apos;s levels. This answers what you would be holding,
            not what it would be worth.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function Side({ title, side, tone }: {
  title: string; side: Scenarios['up']; tone: string;
}) {
  if (!side.holdings.length) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className={`text-sm font-medium ${tone}`}>{title}</p>
        <span className="text-xs text-ink-muted tnum">{usd(side.totalUsd)}</span>
      </div>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
        {side.holdings.map((h) => (
          <div
            key={h.symbol}
            className={CLASS_COLOR[h.assetClass] ?? CLASS_COLOR.OTHER}
            style={{ width: `${Math.max(h.pct, 0)}%` }}
            title={`${h.symbol} ${h.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="mt-2 space-y-1">
        {side.holdings.slice(0, 5).map((h) => (
          <div key={h.symbol} className="flex items-baseline justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-ink-secondary">
              <span className={`h-2 w-2 rounded-full ${CLASS_COLOR[h.assetClass] ?? CLASS_COLOR.OTHER}`} />
              {h.symbol}
            </span>
            <span className="tnum text-ink-muted">
              {amount(h.amount)} · {h.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
