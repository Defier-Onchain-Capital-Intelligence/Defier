'use client';
/**
 * The lifetime report.
 *
 * One number leads: what impermanent loss has actually cost this wallet. Every
 * liquidity provider has heard the term and almost none know their own figure,
 * because working it out means valuing every deposit and withdrawal at the price
 * of the day it happened, across positions whose NFTs may no longer exist.
 *
 * It never appears alone. "Impermanent loss cost you $3,000" is half a sentence;
 * the half that decides anything is whether the fees covered it. So the headline
 * is a verdict, not a statistic, and the two figures sit side by side underneath.
 *
 * Coverage leads the screen rather than hiding at the bottom. A report that
 * quietly measured half a history would be exactly the dishonesty this product
 * exists to correct.
 */
import Link from 'next/link';
import type { LifetimeReport } from '@/types/portfolio';
import { usd, pct, amount, relativeDays, dateOf, toneOf } from '@/lib/format';
import { Card, Label, Skeleton, EmptyState, BackLink } from '@/components/ui/Primitives';
import { InfoDot } from '@/components/ui/InfoDot';
import { TokenLogo } from '@/components/ui/TokenLogo';
import { ShareButton } from '@/components/ShareButton';
import { useReport } from '@/lib/useReport';

export function ReportView({ address }: { address: string }) {
  const { data, error } = useReport(address);

  if (error) return <EmptyState title="We could not read that wallet" body={error} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-ink-muted">
          Rebuilding every position this wallet has ever opened. This one takes a moment.
        </p>
        <Skeleton className="h-32" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const l = data.lifetime;

  if (!l.positionsOpened) {
    return (
      <div className="space-y-4">
        <BackLink href={`/?address=${address}`}>Portfolio</BackLink>
        <EmptyState
          title="No liquidity history on Base"
          body="This wallet has never provided liquidity on Aerodrome or Uniswap on Base, so there is nothing to report yet."
        />
      </div>
    );
  }

  const covered = l.feesCoverIl;
  const gained = l.divergenceGainUsd > 0;

  // Divergence has two directions and only one of them has a famous name. A
  // pool that converted into the side that fell less leaves you AHEAD of
  // holding, and reporting that as "no impermanent loss" throws away the more
  // interesting half of what actually happened.
  const headlineLabel = gained ? 'Divergence, all time' : 'Impermanent loss, all time';
  const headlineValue = gained ? l.divergenceGainUsd : l.impermanentLossUsd;
  const headlineTone = gained ? 'text-gain' : 'text-loss';
  const verdict = gained
    ? 'Providing liquidity left you ahead of simply holding, before fees. The pool converted towards whichever side was falling less.'
    : l.impermanentLossUsd <= 0
      ? 'Your positions never diverged from simply holding.'
      : covered != null && covered >= 1
        ? `Your fees covered it ${covered.toFixed(1)}x over.`
        : 'The fees did not cover it.';

  return (
    <div className="space-y-4">
      <BackLink href={`/?address=${address}`}>Portfolio</BackLink>

      {!l.coverage.complete ? (
        <div className="rounded-xl border border-warn/25 bg-warn/[0.06] p-3">
          <p className="text-xs leading-relaxed text-ink-secondary">
            {l.coverage.positionsNotReconstructed > 0
              ? `${l.coverage.positionsNotReconstructed} closed ${l.coverage.positionsNotReconstructed === 1 ? 'position' : 'positions'} could not be rebuilt from the chain, so these totals cover less than this wallet has actually done.`
              : 'History is still loading, so these totals are incomplete.'}
          </p>
        </div>
      ) : null}

      <header>
        <Label>{headlineLabel}</Label>
        <p className={`hero-num mt-1 ${headlineTone}`}>
          {gained ? '+' : ''}{usd(headlineValue)}
        </p>
        <p className="mt-2 text-[0.9375rem] leading-relaxed">{verdict}</p>
        <p className="mt-1 text-xs text-ink-muted">
          Across {l.positionsOpened} {l.positionsOpened === 1 ? 'position' : 'positions'} on Base
          {l.firstPositionAt ? ` since ${dateOf(l.firstPositionAt)}` : ''}
        </p>
      </header>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-ink-muted">
              {gained ? 'What divergence gained' : 'What divergence cost'}
              <InfoDot label="Divergence">
                What is still in your positions, plus everything already withdrawn, against what
                the same tokens would be worth if you had never deposited them. Withdrawals count
                at the price of the day you took them; the comparison is at today&rsquo;s. Fees are
                not in this figure — they are the next one along.
              </InfoDot>
            </p>
            <p className={`mt-0.5 text-lg font-semibold tnum ${gained ? 'text-gain' : 'text-loss'}`}>
              {gained ? '+' : '−'}{usd(headlineValue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">
              What you earned
              <InfoDot label="What you earned">
                Trading fees and gauge emissions together, collected and still waiting.
              </InfoDot>
            </p>
            <p className="mt-0.5 text-lg font-semibold tnum text-gain">{usd(l.earnedUsd)}</p>
          </div>
        </div>

        <div className="mt-4 border-t border-bg-border pt-4">
          <div className="row">
            <span className="text-sm text-ink-secondary">Net result</span>
            <span className={`font-semibold tnum ${toneOf(l.netPnlUsd)}`}>
              {usd(l.netPnlUsd, { sign: true })}
            </span>
          </div>
          <div className="row">
            <span className="text-sm text-ink-secondary">Versus simply holding</span>
            <span className={`font-semibold tnum ${toneOf(l.vsHoldingUsd)}`}>
              {usd(l.vsHoldingUsd, { sign: true })}
            </span>
          </div>
          <div className="row">
            <span className="text-sm text-ink-secondary">Gas paid</span>
            <span className="tnum text-sm text-loss">{usd(l.gasUsd)}</span>
          </div>
        </div>
      </Card>

      <ShareButton lifetime={l} address={address} />

      <Card>
        <Label>What you actually got paid</Label>
        <p className="muted mt-1 text-[0.8125rem]">
          A dollar total hides which token it arrived in, and that is half the story.
        </p>

        {l.feesByToken.length ? (
          <div className="mt-3">
            <p className="text-xs text-ink-muted">Trading fees</p>
            <div className="divide-hair mt-1">
              {l.feesByToken.map((t) => <TokenLine key={`f-${t.address}`} token={t} />)}
            </div>
          </div>
        ) : null}

        {l.rewardsByToken.length ? (
          <div className="mt-4">
            <p className="text-xs text-ink-muted">Emissions</p>
            <div className="divide-hair mt-1">
              {l.rewardsByToken.map((t) => <TokenLine key={`r-${t.address}`} token={t} />)}
            </div>
          </div>
        ) : null}

        {!l.feesByToken.length && !l.rewardsByToken.length ? (
          <p className="muted mt-3">Nothing collected yet.</p>
        ) : null}
      </Card>

      <Card>
        <Label>This wallet as a liquidity provider</Label>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Stat
            label="Capital deployed"
            value={usd(l.capitalDeployedUsd)}
            sub="summed at each deposit's price"
            info="Every deposit this wallet ever made, valued on the day it went in. Not the same as the most it ever held at once."
          />
          <Stat
            label="Time providing"
            value={relativeDays(l.daysProviding)}
            sub={`of ${relativeDays(l.daysSinceFirst)} since the first`}
            info="Days with capital actually inside a pool. Overlapping positions count once, so this is time exposed, not the sum of position ages."
          />
          <Stat
            label="Beat holding"
            value={`${l.beatHoldCount} of ${l.positionsOpened}`}
            sub={pct(l.beatHoldPct, 0)}
          />
          <Stat
            label="Average position"
            value={relativeDays(l.averagePositionDays)}
          />
        </div>

        {l.best || l.worst ? (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-bg-border pt-4">
            {l.best ? (
              <Link href={`/position/${encodeURIComponent(l.best.id)}?wallet=${address}`}
                    className="rounded-xl bg-bg-elevated/50 p-3 transition-colors hover:bg-bg-elevated">
                <p className="text-[0.6875rem] text-ink-muted">Best</p>
                <p className="mt-0.5 truncate text-sm font-medium">{l.best.pair}</p>
                <p className={`text-xs tnum ${toneOf(l.best.vsHoldUsd)}`}>
                  {usd(l.best.vsHoldUsd, { sign: true })} vs holding
                </p>
              </Link>
            ) : null}
            {l.worst ? (
              <Link href={`/position/${encodeURIComponent(l.worst.id)}?wallet=${address}`}
                    className="rounded-xl bg-bg-elevated/50 p-3 transition-colors hover:bg-bg-elevated">
                <p className="text-[0.6875rem] text-ink-muted">Worst</p>
                <p className="mt-0.5 truncate text-sm font-medium">{l.worst.pair}</p>
                <p className={`text-xs tnum ${toneOf(l.worst.vsHoldUsd)}`}>
                  {usd(l.worst.vsHoldUsd, { sign: true })} vs holding
                </p>
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>

      {l.pairs.length > 1 ? (
        <Card>
          <Label>Where the capital went</Label>
          <div className="divide-hair mt-1">
            {l.pairs.map((p) => (
              <div key={p.pair} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="truncate text-sm">
                  {p.pair}
                  <span className="ml-1.5 text-[0.6875rem] text-ink-muted">
                    {p.positions}×
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm tnum">{usd(p.capitalUsd)}</span>
                  <span className={`block text-[0.6875rem] tnum ${toneOf(p.vsHoldUsd)}`}>
                    {usd(p.vsHoldUsd, { sign: true })} vs holding
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <p className="px-1 text-center text-[0.6875rem] leading-relaxed text-ink-muted">
        Reconstructed from onchain events on Base. Informational only, not investment advice.
      </p>
    </div>
  );
}

function TokenLine({ token }: { token: { address: string; symbol: string; amount: number; usd: number } }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2">
        <TokenLogo address={token.address} symbol={token.symbol} size={18} />
        <span className="truncate text-sm">{token.symbol}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm tnum">{amount(token.amount)}</span>
        {token.usd > 0 ? (
          <span className="block text-[0.6875rem] tnum text-ink-muted">{usd(token.usd)}</span>
        ) : null}
      </span>
    </div>
  );
}

function Stat({ label, value, sub, info }: {
  label: string; value: string; sub?: string; info?: string;
}) {
  return (
    <div>
      <p className="text-xs text-ink-muted">
        {label}
        {info ? <InfoDot label={label}>{info}</InfoDot> : null}
      </p>
      <p className="mt-0.5 font-semibold tnum">{value}</p>
      {sub ? <p className="text-[0.6875rem] text-ink-muted">{sub}</p> : null}
    </div>
  );
}
