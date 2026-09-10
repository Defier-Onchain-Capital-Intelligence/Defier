'use client';
/**
 * What the wallet has lent and what it owes.
 *
 * Debt is shown as a negative number and never netted into a friendlier one. A
 * wallet with $10,000 supplied and $6,000 borrowed is not a $4,000 wallet: it is
 * a wallet with $10,000 of exposure and an obligation that gets called in when
 * prices move. Both figures stay on screen.
 *
 * The health factor is the protocol's own. Where we could not reproduce it and
 * agree with the protocol about the account, the row says so rather than
 * printing something close. Close is worse than absent here, because it is the
 * number people decide by.
 */
import type { LendingPosition, LendingCoverage } from '@/types/portfolio';
import { usd } from '@/lib/format';
import { Card, Label } from '@/components/ui/Primitives';
import { InfoDot } from '@/components/ui/InfoDot';
import { coverageSentence, healthBand } from '@/lib/debt';

const BAND_TONE = { safe: 'text-gain', watch: 'text-warn', risk: 'text-loss' } as const;

export function HealthPill({ health, className = '' }: { health: number; className?: string }) {
  const band = healthBand(health);
  return (
    <span className={`tnum font-semibold ${BAND_TONE[band]} ${className}`}>
      {health >= 100 ? '99+' : health.toFixed(2)}
    </span>
  );
}

export function CoverageDot({ coverage }: { coverage?: LendingCoverage }) {
  return (
    <InfoDot label="lending coverage">
      <p>{coverageSentence(coverage)}</p>
    </InfoDot>
  );
}

export function LendingPositions({ lending, coverage, emptyBody }: {
  lending: LendingPosition[];
  coverage?: LendingCoverage;
  emptyBody?: string;
}) {
  if (!lending || lending.length === 0) {
    return (
      <Card>
        <div className="flex items-center">
          <Label>Lending and borrowing</Label>
          <CoverageDot coverage={coverage} />
        </div>
        <p className="muted mt-2 text-[0.8125rem] leading-relaxed">
          {emptyBody || 'Nothing supplied or borrowed in the protocols we read.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {lending.map((l) => (
        <Card key={l.protocolLabel}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center">
              <Label>{l.protocolLabel}</Label>
              <CoverageDot coverage={coverage} />
            </div>
            {l.totalDebtUsd > 0 ? (
              l.healthFactor != null ? (
                <div className="text-right">
                  <p className="text-[0.6875rem] uppercase tracking-wide text-ink-muted">Health</p>
                  <HealthPill health={l.healthFactor} />
                </div>
              ) : (
                <p className="max-w-[10rem] text-right text-[0.6875rem] leading-tight text-ink-muted">
                  Health not stated: our figure did not match the protocol&apos;s own check
                </p>
              )
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-ink-muted">Supplied</p>
              <p className="mt-0.5 font-semibold tnum">{usd(l.totalCollateralUsd)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Borrowed</p>
              <p className={`mt-0.5 font-semibold tnum ${l.totalDebtUsd > 0 ? 'text-loss' : ''}`}>
                {l.totalDebtUsd > 0 ? `-${usd(l.totalDebtUsd)}` : usd(0)}
              </p>
            </div>
          </div>

          {l.breakdownComplete && (rows(l).shown.length > 0) ? (
            <div className="mt-3 space-y-1.5 border-t border-bg-border pt-3">
              {rows(l).shown.map((r) => (
                <Row key={r.key} symbol={r.symbol} note={r.note} amount={r.amount} valueUsd={r.valueUsd} />
              ))}
              {rows(l).hidden > 0 ? (
                <p className="pt-1 text-[0.6875rem] text-ink-muted">
                  {rows(l).hidden} {rows(l).hidden === 1 ? 'balance' : 'balances'} too small to show.
                  {' '}They are still counted in the totals above.
                </p>
              ) : null}
            </div>
          ) : !l.breakdownComplete ? (
            <p className="muted mt-3 text-[0.75rem] leading-relaxed">
              Per asset rows did not add up to the totals {l.protocolLabel} reports, so only the totals are shown.
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

/**
 * Rows worth printing.
 *
 * A repaid loan often leaves a wei behind, and a row reading "0.0000 AERO =
 * $0.00" three times over says nothing except that we are willing to print
 * nothing. They stay inside the totals, which is where a dust balance belongs,
 * and the count of what was left out is stated so the list is never quietly
 * shorter than the position.
 */
const DUST_USD = 0.01;

function rows(l: LendingPosition) {
  const all = [
    ...l.supplied.map((s) => ({
      key: `s-${s.token.address}`,
      symbol: s.token.symbol,
      note: s.isCollateral ? 'Collateral' : 'Supplied',
      amount: s.amount,
      valueUsd: s.valueUsd,
    })),
    ...l.borrowed.map((b) => ({
      key: `b-${b.token.address}`,
      symbol: b.token.symbol,
      note: 'Borrowed',
      amount: -b.amount,
      valueUsd: -b.valueUsd,
    })),
  ];
  const shown = all.filter((r) => Math.abs(r.valueUsd) >= DUST_USD);
  return { shown, hidden: all.length - shown.length };
}

function Row({ symbol, note, amount, valueUsd }: {
  symbol: string; note: string; amount: number; valueUsd: number;
}) {
  const negative = valueUsd < 0;
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <div className="min-w-0">
        <span className="font-medium">{symbol}</span>
        <span className="ml-2 text-[0.6875rem] uppercase tracking-wide text-ink-muted">{note}</span>
      </div>
      <div className="text-right">
        <p className={`tnum font-medium ${negative ? 'text-loss' : ''}`}>
          {negative ? `-${usd(Math.abs(valueUsd))}` : usd(valueUsd)}
        </p>
        <p className="tnum text-[0.6875rem] text-ink-muted">
          {formatAmount(amount)} {symbol}
        </p>
      </div>
    </div>
  );
}

function formatAmount(n: number): string {
  const a = Math.abs(n);
  const digits = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
  return `${n < 0 ? '-' : ''}${a.toLocaleString('en-US', { maximumFractionDigits: digits })}`;
}
