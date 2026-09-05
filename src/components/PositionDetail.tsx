'use client';
/**
 * Position detail. This is the screen the product is judged on.
 *
 * Order is the argument: the verdict against holding, then the range, then the
 * nine line ledger that proves the verdict, then the events it was built from.
 * A reader who stops after the first card still leaves with the right answer;
 * one who reads to the bottom can check our arithmetic against the chain.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { LpPosition } from '@/types/portfolio';
import { fetchPosition } from '@/lib/api';
import { usd, amount, price, pct, toneOf, dateOf, relativeDays } from '@/lib/format';
import { Card, Label, Skeleton, EmptyState, StatusPill, ConfidenceNote, BackLink } from '@/components/ui/Primitives';
import { InfoDot } from '@/components/ui/InfoDot';
import { StrategyTable } from '@/components/StrategyTable';

export function PositionDetail({ id, wallet }: { id: string; wallet: string }) {
  const [pos, setPos] = useState<LpPosition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchPosition(id, wallet)
      .then((d) => { if (live) setPos(d); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [id, wallet]);

  if (error) return <EmptyState title="We could not read this position" body={error} />;
  if (!pos) return <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;

  const pnl = pos.pnl;
  const symbol0 = pos.token0.symbol;
  const symbol1 = pos.token1.symbol;

  return (
    <div className="space-y-4">
      <BackLink href={`/pools?wallet=${wallet}&tab=mine`}>All positions</BackLink>

      <header>
        <h1 className="text-lg font-semibold">{pos.symbol}</h1>
        <div className="mt-1.5 flex items-center gap-2">
          <StatusPill inRange={pos.inRange} staked={pos.staked} closed={pos.closed} />
          {pos.token0.isTokenizedStock || pos.token1.isTokenizedStock
            ? <span className="pill-stock">Tokenized stock</span> : null}
        </div>
      </header>

      {/* The verdict, before any breakdown. */}
      <Card>
        <Label>{pos.closed ? 'Value withdrawn' : 'Current value'}</Label>
        <p className="hero-num mt-1">{usd(pos.closed ? pnl?.withdrawnUsd ?? 0 : pos.valueUsd)}</p>
        {pnl ? (
          <p className={`mt-2 text-sm font-medium tnum ${toneOf(pnl.lpVsHodlUsd)}`}>
            {usd(pnl.lpVsHodlUsd, { sign: true })} versus simply holding
          </p>
        ) : null}
        {pnl?.daysOpen ? (
          <p className="mt-1 text-xs text-ink-muted">
            Opened {dateOf(pos.openedAt)} · open {relativeDays(pnl.daysOpen)}
          </p>
        ) : null}

        {pnl?.realizedAprPct != null ? (
          // Not a projection and not the pool's advertised rate: what this
          // position has actually paid, annualised. It deserves the room.
          <div className="mt-4 flex items-baseline justify-between gap-3 rounded-xl bg-bg-elevated px-3 py-2.5">
            <span className="text-xs text-ink-secondary">
              Real APR
              <InfoDot label="Real APR">
                Fees and rewards this position has actually earned, over the capital you put in,
                annualised across the {relativeDays(pnl.daysOpen)} it has been open. Not the pool&rsquo;s
                advertised rate and not a forecast.
              </InfoDot>
            </span>
            <span className="text-lg font-semibold tnum text-gain">{pct(pnl.realizedAprPct)}</span>
          </div>
        ) : null}
      </Card>

      {!pos.closed ? <RangeCard pos={pos} /> : null}

      {pos.strategies ? <StrategyTable strategies={pos.strategies} /> : null}

      <SimulateLink pos={pos} />

      {pnl ? (
        <Card>
          <Label>Where the money went</Label>
          <dl className="mt-3 divide-hair">
            <Line label="Capital deposited" value={usd(pnl.initialCapitalUsd)} note="at the price of each deposit" />
            <Line label="Withdrawn" value={usd(pnl.withdrawnUsd)} />
            <Line label="Value in the position" value={usd(pnl.currentValueUsd)} />
            <Line label="Fees collected" value={usd(pnl.feesClaimedUsd)} tone="text-gain"
                  info={`Trading fees you have already taken out, in ${symbol0} and ${symbol1}, valued at the price of the day you collected them.`} />
            <Line label="Fees not yet collected" value={usd(pnl.feesUnclaimedUsd)} tone="text-gain"
                  info={`Still sitting in the position: ${amount(pos.feesUnclaimed.token0)} ${symbol0} and ${amount(pos.feesUnclaimed.token1)} ${symbol1}. Read exactly from the pool, not estimated.`} />
            <Line label="Rewards claimed" value={usd(pnl.incentivesClaimedUsd)} tone="text-gain"
                  info="AERO emissions you have already claimed from the gauge, valued at the price of the day you claimed." />
            <Line label="Rewards pending" value={usd(pnl.incentivesPendingUsd)} tone="text-gain"
                  info={pos.incentivesPending
                    ? `${amount(pos.incentivesPending.amount)} AERO earned and not yet claimed.`
                    : 'Emissions earned and not yet claimed. Only staked positions accrue these.'} />
            <Line label="Gas paid" value={usd(pnl.gasUsd)} tone="text-loss" />
            <Line label="Divergence from holding" value={usd(pnl.divergenceUsd, { sign: true })} tone={toneOf(pnl.divergenceUsd)}
                  note="what concentrated liquidity cost or gained you" />
            <div className="row border-t border-bg-border pt-3">
              <dt className="text-sm font-medium">Net result</dt>
              <dd className={`font-semibold tnum ${toneOf(pnl.netPnlUsd)}`}>{usd(pnl.netPnlUsd, { sign: true })}</dd>
            </div>
            <div className="row">
              <dt className="text-sm text-ink-secondary">If you had just held</dt>
              <dd className={`font-semibold tnum ${toneOf(pnl.hodlPnlUsd)}`}>{usd(pnl.hodlPnlUsd, { sign: true })}</dd>
            </div>
          </dl>

        </Card>
      ) : null}

      {pnl ? <ConfidenceNote confidence={pnl.confidence} notes={pnl.notes} /> : null}

      {pos.events.length ? (
        <Card>
          <Label>Onchain history</Label>
          <ul className="mt-2 divide-hair">
            {[...pos.events].sort((a, b) => b.timestamp - a.timestamp).map((e, i) => (
              <li key={`${e.txHash}-${e.type}-${i}`} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm capitalize">{e.type.replace('_', ' ')}</span>
                  <span className="text-xs text-ink-muted">{dateOf(e.timestamp)}</span>
                </div>
                {e.amount0 != null || e.rewardAmount != null ? (
                  <p className="mt-1 text-xs text-ink-secondary tnum">
                    {e.rewardAmount != null
                      ? `${amount(e.rewardAmount)} AERO`
                      : `${amount(e.amount0)} ${symbol0} · ${amount(e.amount1)} ${symbol1}`}
                    {e.amount0Usd != null || e.rewardUsd != null ? (
                      <span className="text-ink-muted">
                        {' '}· {usd(e.rewardUsd ?? (e.amount0Usd ?? 0) + (e.amount1Usd ?? 0))} at the time
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {e.notes?.length ? (
                  <p className="mt-1 text-[0.6875rem] text-ink-muted">{e.notes.join(' ')}</p>
                ) : null}
                <a
                  href={`https://basescan.org/tx/${e.txHash}`}
                  target="_blank" rel="noreferrer"
                  className="mt-1 inline-block text-[0.6875rem] text-accent"
                >
                  View on Basescan
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/** Carry this position into the simulator instead of asking the user to retype
 *  a range they can already see. The APR is the one number we cannot know for
 *  the future, so it is seeded from what this position has actually realised and
 *  left for them to change. */
function SimulateLink({ pos }: { pos: LpPosition }) {
  const size = pos.closed ? pos.pnl?.initialCapitalUsd : pos.valueUsd;
  if (!pos.priceLower || !pos.priceUpper || !size) return null;

  const params = new URLSearchParams({
    entry: String(pos.currentPrice),
    low: String(pos.priceLower),
    high: String(pos.priceUpper),
    size: String(Math.round(size * 100) / 100),
  });
  const apr = pos.pnl?.realizedAprPct;
  if (apr != null && apr > 0) params.set('apr', String(Math.round(apr * 10) / 10));

  return (
    <Link
      href={`/simulate?${params.toString()}`}
      className="block rounded-2xl border border-bg-border bg-bg-surface px-4 py-3.5 transition-colors hover:bg-bg-elevated/50"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Test this range against holding</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Opens the simulator with this position&rsquo;s range and size already filled in
          </p>
        </div>
        <span aria-hidden className="text-accent">&rarr;</span>
      </div>
    </Link>
  );
}

function Line({ label, value, tone, note, info }: {
  label: string; value: string; tone?: string; note?: string; info?: string;
}) {
  return (
    <div className="row">
      <dt className="text-sm text-ink-secondary">
        {label}
        {info ? <InfoDot label={label}>{info}</InfoDot> : null}
        {note ? <span className="block text-[0.6875rem] text-ink-muted">{note}</span> : null}
      </dt>
      <dd className={`tnum text-sm ${tone ?? 'text-ink-primary'}`}>{value}</dd>
    </div>
  );
}

/** The range as a picture. Three numbers and a marker beat a paragraph. */
function RangeCard({ pos }: { pos: LpPosition }) {
  const span = pos.priceUpper - pos.priceLower;
  const raw = span > 0 ? ((pos.currentPrice - pos.priceLower) / span) * 100 : 50;
  const marker = Math.min(Math.max(raw, 0), 100);

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <Label>Price range</Label>
        <span className="text-xs text-ink-muted">{pos.token0.symbol} in {pos.token1.symbol}</span>
      </div>
      <div className="relative mt-4 h-2 rounded-full bg-bg-elevated">
        <div className={`absolute inset-y-0 rounded-full ${pos.inRange ? 'bg-accent/30' : 'bg-warn/20'}`}
             style={{ left: '0%', right: '0%' }} />
        <div
          className={`absolute -top-1 h-4 w-1 rounded-full ${pos.inRange ? 'bg-accent' : 'bg-warn'}`}
          style={{ left: `calc(${marker}% - 2px)` }}
          aria-label="current price"
        />
      </div>
      <div className="mt-3 flex items-baseline justify-between text-xs">
        <span className="tnum text-ink-secondary">{price(pos.priceLower)}</span>
        <span className={`tnum font-medium ${pos.inRange ? 'text-ink-primary' : 'text-warn'}`}>
          {price(pos.currentPrice)}
        </span>
        <span className="tnum text-ink-secondary">{price(pos.priceUpper)}</span>
      </div>
      {!pos.inRange ? (
        <p className="mt-3 text-xs leading-relaxed text-warn">
          Out of range: this position is entirely on one side of the pair and is not earning fees.
        </p>
      ) : null}
    </Card>
  );
}
