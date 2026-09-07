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
import { figuresFrom, reportHeadline } from '@/lib/reportCopy';
import { ValueCurve } from '@/components/ValueCurve';
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

  // Headline, scope and caveat come from lib/reportCopy, which the share card
  // also uses. A card that phrased the same result more flatteringly than this
  // screen would be marketing rather than a report, so both read one source.
  const h = reportHeadline(figuresFrom(l, address.slice(-4), 0));
  const gained = h.gained;
  const headlineValue = h.value;

  return (
    <div className="space-y-4">
      <BackLink href={`/?address=${address}`}>Portfolio</BackLink>

      <Coverage coverage={l.coverage} counted={l.positionsOpened} />

      <header>
        <Label>{h.label}</Label>
        <p className={`hero-num mt-1 ${gained ? 'text-gain' : 'text-loss'}`}>{h.display}</p>
        <p className="mt-2 text-[0.9375rem] leading-relaxed">{h.verdict}</p>
        <p className="mt-1 text-xs text-ink-muted">{h.across}</p>
        {h.caveat ? (
          <p className="mt-2 rounded-xl border border-bg-border bg-bg-elevated p-3 text-xs leading-relaxed text-ink-secondary">
            {h.caveat}
            {l.coverage.concentrated
              ? ' It is mostly a statement about that trade rather than about how you provide liquidity.'
              : ''}
          </p>
        ) : null}
      </header>

      <ValueCurve address={address} />

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
            label="Time with capital in a pool"
            value={relativeDays(l.daysProviding)}
            sub={`first position ${relativeDays(l.daysSinceFirst)} ago`}
            info="Days with capital actually inside a pool. Overlapping positions count once, so this is time exposed rather than the sum of position ages — which is why it can be far shorter than the time since you started."
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
                <p className="text-[0.625rem] text-ink-muted">open {relativeDays(l.best.daysOpen)}</p>
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
                <p className="text-[0.625rem] text-ink-muted">open {relativeDays(l.worst.daysOpen)}</p>
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


/**
 * What the report could not measure, at the top, before any total.
 *
 * The alternative is to sum everything and hope: five good positions and two
 * guesses produce the same shape of number as five good ones, with an unknown
 * error and an implied claim of completeness. For a product whose entire pitch
 * is doing this arithmetic correctly, that trade is never worth making.
 */
function Coverage({ coverage, counted }: {
  coverage: LifetimeReport['coverage'];
  counted: number;
}) {
  const missing = coverage.positionsNotReconstructed;
  const excluded = coverage.positionsExcluded;

  if (coverage.complete) {
    return (
      <div className="rounded-xl border border-gain/25 bg-gain/[0.05] p-3">
        <p className="text-xs leading-relaxed text-ink-secondary">
          Every concentrated liquidity position this wallet has opened on Aerodrome or Uniswap on
          Base was rebuilt and measured, including ones whose NFT was burned. Basic pool positions
          are detected and valued, but their history is not reconstructed yet, so they are not in
          these totals.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-warn/25 bg-warn/[0.06] p-3">
      <p className="text-xs font-medium text-ink-primary">What these totals cover</p>
      <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink-secondary">
        <li>
          Measured completely: {counted} {counted === 1 ? 'position' : 'positions'}. Only these are
          in the figures below.
        </li>
        {coverage.searchIncomplete ? (
          <li>
            We could not search this wallet&rsquo;s full history on Base, so the count above is a
            floor rather than the answer, and nothing here is described as all time.
          </li>
        ) : null}
        {excluded > 0 ? (
          <li>
            Left out: {excluded} {excluded === 1 ? 'position' : 'positions'} we found but could not
            value with confidence. Counting them would put an unknown error inside a total that
            looks exact.
          </li>
        ) : null}
        {missing > 0 ? (
          <li>
            Not rebuilt: {missing} closed {missing === 1 ? 'position whose' : 'positions whose'} NFT
            was burned and whose pool we could not identify from its opening transaction.
          </li>
        ) : null}
        <li className="text-ink-muted">
          Basic pool positions are detected and valued but have no reconstructed history yet, so
          they never enter these totals.
        </li>
      </ul>
      {coverage.excluded.length ? (
        <div className="mt-2 border-t border-bg-border pt-2">
          {coverage.excluded.slice(0, 4).map((e) => (
            <p key={e.id} className="text-[0.6875rem] text-ink-muted">
              {e.pair}: {e.reason}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
