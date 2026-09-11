'use client';
/**
 * Home. The answer first, the detail after.
 *
 * The hero is the value of what is deployed now. Directly under it, in words,
 * what that capital did against simply holding the same tokens, because that
 * sentence is the entire product. Everything below is evidence for it.
 */
import Link from 'next/link';
import type { Portfolio } from '@/types/portfolio';
import { usePortfolio } from '@/lib/usePortfolio';
import { usd, toneOf } from '@/lib/format';
import { Card, Label, ExposureBar, Skeleton, ConfidenceNote, EmptyState } from '@/components/ui/Primitives';
import { PositionRow } from '@/components/PositionRow';
import { ScenarioCard } from '@/components/ScenarioCard';
import { CoverageDot, HealthPill } from '@/components/LendingPositions';
import { summariseDebt } from '@/lib/debt';
import { ObservationsCard } from '@/components/ObservationsCard';
import { Disclaimer } from '@/components/Disclaimer';
import { WalletBadge } from '@/components/WalletBadge';

export function PortfolioHome({ address }: { address: string }) {
  const { data, error, loadingHistory: loadingPnl } = usePortfolio(address);

  if (error) {
    return <EmptyState title="We could not read that wallet" body={error} />;
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-32" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const { summary, exposure, positions } = data;
  const open = positions.filter((p) => !p.closed);
  const debt = summariseDebt(data.lending);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <Label>Your capital on Base</Label>
          <p className="hero-num mt-1">{usd(summary.totalValueUsd)}</p>
        </div>
        <WalletBadge address={address} />
      </header>

      <Card>
        <p className="text-[0.9375rem] leading-relaxed">{summary.headline}</p>
        {loadingPnl && !summary.open.netPnlUsd ? (
          <p className="mt-2 text-xs text-ink-muted">Reconstructing history…</p>
        ) : null}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <Label>Deployed</Label>
            <p className="mt-1 font-semibold tnum">{usd(summary.lpValueUsd)}</p>
          </div>
          <div>
            <Label>Fees earned</Label>
            <p className="mt-1 font-semibold tnum text-gain">{usd(summary.feesTotalUsd)}</p>
          </div>
          <div>
            <Label>Rewards</Label>
            <p className="mt-1 font-semibold tnum text-gain">{usd(summary.incentivesTotalUsd)}</p>
          </div>
        </div>
      </Card>

      {summary.historyHeadline ? (
        <Link href={`/pools?wallet=${address}&tab=mine`} className="block">
          <Card className="hover:bg-bg-elevated/40 transition-colors">
            <Label>History</Label>
            <p className="mt-1.5 text-sm text-ink-secondary leading-relaxed">{summary.historyHeadline}</p>
            <p className={`mt-2 text-sm font-semibold tnum ${toneOf(summary.allTime.lpVsHodlUsd)}`}>
              {usd(summary.allTime.lpVsHodlUsd, { sign: true })} vs holding, all time
            </p>
          </Card>
        </Link>
      ) : null}

      {/* Debt goes above exposure, because an exposure bar that ignores an
          obligation describes a wallet that is not this one. It only appears
          when there is something owed: a card saying "no debt" on every
          unleveraged wallet is noise, and the coverage dot on the lending
          screens is where the scope of that silence is stated. */}
      {debt.hasDebt ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center">
              <Label>Borrowed against your collateral</Label>
              <CoverageDot coverage={data.lendingCoverage} />
            </div>
            {debt.worstHealth != null ? (
              <div className="text-right">
                <p className="text-[0.6875rem] uppercase tracking-wide text-ink-muted">Health</p>
                <HealthPill health={debt.worstHealth} />
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-ink-muted">You owe</p>
              <p className="mt-0.5 font-semibold tnum text-loss">-{usd(debt.totalDebtUsd)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Backed by</p>
              <p className="mt-0.5 font-semibold tnum">{usd(debt.totalCollateralUsd)}</p>
            </div>
          </div>

          <p className="muted mt-3 text-[0.75rem] leading-relaxed">
            {debt.worstHealth != null && debt.worstHealthLabel
              ? `${debt.worstHealthLabel} is the closest to liquidation, at ${debt.worstHealth.toFixed(2)}. Liquidation starts at 1.00.`
              : 'No health figure is stated here because our figure did not match what the protocol says about this account.'}
            {debt.unstatedHealth.length && debt.worstHealth != null
              ? ` ${debt.unstatedHealth.join(' and ')} could not be checked the same way, so ${debt.unstatedHealth.length === 1 ? 'it is' : 'they are'} not in this figure.`
              : ''}
          </p>
        </Card>
      ) : null}

      {exposure.byClass.length ? (
        <Card>
          <div className="flex items-baseline justify-between">
            <Label>Exposure</Label>
            <span className="text-xs text-ink-muted tnum">{exposure.marketBiasPct.toFixed(0)}% at market risk</span>
          </div>
          <div className="mt-3"><ExposureBar slices={exposure.byClass} /></div>
        </Card>
      ) : null}

      {data.holdings?.stocks?.totalUsd ? (
        // Only worth the space once both sides exist. With no stocks, "crypto"
        // is just another word for the total and the card says nothing.
        <div className="grid grid-cols-2 gap-3">
          {([['crypto', 'Crypto', data.holdings.crypto], ['stocks', 'Stocks', data.holdings.stocks]] as const).map(
            ([key, label, bucket]) => (
              <Link key={key} href={`/holdings?wallet=${address}&tab=${key}`}>
                <Card className="h-full transition-colors hover:bg-bg-elevated/40">
                  <Label>{label}</Label>
                  <p className="mt-1 font-semibold tnum">{usd(bucket.totalUsd)}</p>
                  <p className="mt-0.5 text-xs text-ink-muted tnum">{bucket.pctOfPortfolio.toFixed(0)}% of the total</p>
                </Card>
              </Link>
            ),
          )}
        </div>
      ) : null}

      {data.scenarios ? <ScenarioCard scenarios={data.scenarios} /> : null}

      <Link href={`/report?address=${address}`} className="block">
        <Card className="transition-colors hover:bg-bg-elevated/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Lifetime report</Label>
              <p className="mt-1 text-sm leading-relaxed">
                What impermanent loss has actually cost this wallet, and whether the fees covered it.
              </p>
            </div>
            <span aria-hidden className="shrink-0 text-accent">&rarr;</span>
          </div>
        </Card>
      </Link>

      <ObservationsCard observations={data.observations} address={address} />

      <Card>
        <div className="flex items-baseline justify-between">
          <Label>Your pools</Label>
          <Link href={`/pools?wallet=${address}&tab=mine`} className="text-xs text-accent">See all</Link>
        </div>
        {open.length === 0 ? (
          <p className="muted mt-3">No open liquidity positions on Base.</p>
        ) : (
          <div className="divide-hair mt-1">
            {open.slice(0, 4).map((p) => <PositionRow key={p.id} position={p} wallet={address} />)}
          </div>
        )}
      </Card>

      {data.warnings.length ? (
        <ConfidenceNote confidence="partial" notes={data.warnings} />
      ) : null}

      <Disclaimer />
    </div>
  );
}
