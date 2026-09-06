'use client';
/**
 * Holdings. Everything together first, split only if you ask.
 *
 * The default is All assets, because that is the wallet. Crypto and Stocks are
 * there for the moment you want to look at one side alone, and stablecoins live
 * on the crypto side: they are the dry powder of a crypto portfolio, not an
 * asset class anyone thinks about separately.
 *
 * Two questions the screen answers that a token list cannot. Where is the money
 * actually sitting — a stock parked inside a liquidity position is still a
 * position in that stock, and no wallet tracker shows it. And how much of it is
 * being paid anything at all, because idle capital is the most common and least
 * visible drag on a DeFi portfolio.
 *
 * Liquidity rows do NOT lead with token amounts. Whether a position currently
 * holds 0.0000002 of one side is a consequence of the price, not a decision
 * anyone made. What it pays, whether it is in range, and what it has earned are
 * the decisions.
 */
import { useState } from 'react';
import Link from 'next/link';
import type { Portfolio, HoldingsBucket, HoldingLine } from '@/types/portfolio';
import { usd, amount, pct } from '@/lib/format';
import { Card, Label, Tabs, ExposureBar, Skeleton, EmptyState, StatusPill } from '@/components/ui/Primitives';
import { InfoDot } from '@/components/ui/InfoDot';
import { TokenLogo, TokenPair } from '@/components/ui/TokenLogo';
import { usePortfolio } from '@/lib/usePortfolio';

type Side = 'all' | 'crypto' | 'stocks';

export function HoldingsView({ address, initialTab }: { address: string; initialTab: Side }) {
  const [tab, setTab] = useState<Side>(initialTab);
  const { data, error } = usePortfolio(address, { deep: true });

  if (error) return <EmptyState title="We could not read that wallet" body={error} />;
  if (!data) return <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-24" /><Skeleton className="h-48" /></div>;

  const { holdings } = data;
  const bucket = holdings[tab];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Holdings</h1>

      <Tabs<Side>
        value={tab}
        onChange={setTab}
        options={[
          { key: 'all', label: 'All', sub: usd(holdings.all.totalUsd) },
          { key: 'crypto', label: 'Crypto', sub: usd(holdings.crypto.totalUsd) },
          { key: 'stocks', label: 'Stocks', sub: usd(holdings.stocks.totalUsd) },
        ]}
      />

      {bucket.lines.length === 0 ? (
        <EmptyState
          title={tab === 'stocks' ? 'No tokenized stocks found' : 'Nothing found on Base'}
          body={tab === 'stocks'
            ? 'Coinbase B20 stocks appear here when you hold them, and when they turn up inside your liquidity positions.'
            : 'Tokens in your wallet, inside liquidity positions and supplied to lenders all appear here.'}
        />
      ) : (
        <>
          <BucketHeader bucket={bucket} side={tab} />
          <HoldingLines lines={bucket.lines} wallet={address} />
          {bucket.hiddenDustCount ? (
            <p className="px-1 text-[0.6875rem] text-ink-muted">
              {bucket.hiddenDustCount} {bucket.hiddenDustCount === 1 ? 'balance' : 'balances'} too small to
              show. They are still counted in the total above.
            </p>
          ) : null}
        </>
      )}

      {tab !== 'crypto' && holdings.stocks.lines.length ? (
        <p className="px-1 text-[0.6875rem] leading-relaxed text-ink-muted">
          One token is not permanently one share. Dividends and splits raise a multiplier
          instead of minting tokens, so the share figure above is what you could redeem.
          Tokenized stocks are issued by Coinbase and available only to eligible users
          outside the United States.
        </p>
      ) : null}
    </div>
  );
}

const TITLE: Record<Side, string> = {
  all: 'Everything on Base',
  crypto: 'Crypto portfolio',
  stocks: 'Stocks portfolio',
};

function BucketHeader({ bucket, side }: { bucket: HoldingsBucket; side: Side }) {
  const base = bucket.earningUsd + bucket.idleUsd;
  const earningPct = base > 0 ? (bucket.earningUsd / base) * 100 : 0;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <Label>{TITLE[side]}</Label>
          <p className="kpi mt-1">{usd(bucket.totalUsd)}</p>
        </div>
        {side !== 'all' ? (
          <span className="text-xs text-ink-muted tnum">{pct(bucket.pctOfPortfolio, 0)} of the total</span>
        ) : null}
      </div>

      {base > 0 ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-ink-secondary">
              Earning something
              <InfoDot label="Earning something">
                Money inside a liquidity position or supplied to a lender is being paid: fees,
                emissions or interest. Money sitting in your wallet is not. Neither is right or
                wrong — idle capital is a choice, but it should be a choice you can see.
              </InfoDot>
            </span>
            <span className="tnum font-medium text-gain">{pct(earningPct, 0)}</span>
          </div>
          <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
            <div className="bg-gain" style={{ width: `${Math.max(earningPct, 0)}%` }} />
            <div className="bg-ink-muted/40" style={{ width: `${Math.max(100 - earningPct, 0)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-ink-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gain" />
              Deployed <span className="tnum text-ink-muted">{usd(bucket.earningUsd)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ink-muted/40" />
              Idle <span className="tnum text-ink-muted">{usd(bucket.idleUsd)}</span>
            </span>
          </div>
        </div>
      ) : null}

      {bucket.byClass.length > 1 ? (
        <div className="mt-4 border-t border-bg-border pt-4"><ExposureBar slices={bucket.byClass} /></div>
      ) : null}
    </Card>
  );
}

const VENUE_TITLE: Record<HoldingLine['venue'], string> = {
  wallet: 'In your wallet',
  lp: 'Inside liquidity positions',
  lending: 'Lending',
};

function HoldingLines({ lines, wallet }: { lines: HoldingLine[]; wallet: string }) {
  const venues: Array<HoldingLine['venue']> = ['wallet', 'lp', 'lending'];

  return (
    <>
      {venues.map((venue) => {
        const group = lines.filter((l) => l.venue === venue);
        if (!group.length) return null;

        // Liquidity is read one position at a time, not one token side at a time.
        if (venue === 'lp') {
          const byPosition = new Map<string, HoldingLine[]>();
          for (const line of group) {
            const key = line.positionId || line.key;
            byPosition.set(key, [...(byPosition.get(key) || []), line]);
          }
          return (
            <Card key={venue}>
              <Label>{VENUE_TITLE[venue]}</Label>
              <div className="divide-hair mt-1">
                {[...byPosition.entries()].map(([id, group2]) => (
                  <PositionHolding key={id} lines={group2} wallet={wallet} />
                ))}
              </div>
            </Card>
          );
        }

        return (
          <Card key={venue}>
            <Label>{VENUE_TITLE[venue]}</Label>
            <div className="divide-hair mt-1">
              {group.map((line) => <WalletRow key={line.key} line={line} />)}
            </div>
          </Card>
        );
      })}
    </>
  );
}

/** One liquidity position, described by what it pays rather than what it contains. */
function PositionHolding({ lines, wallet }: { lines: HoldingLine[]; wallet: string }) {
  const p = lines[0]?.position;
  if (!p) return null;

  // Only the sides that belong to the tab being read, so the stocks tab shows
  // what this position holds in stocks and not the whole position.
  const shown = lines.reduce((a, l) => a + l.valueUsd, 0);
  const e = p.earned;

  return (
    <Link
      href={`/position/${encodeURIComponent(p.id)}?wallet=${wallet}`}
      className="-mx-4 block px-4 py-3 transition-colors hover:bg-bg-elevated/50"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <TokenPair
            token0={{ address: e.address0, symbol: e.symbol0 }}
            token1={{ address: e.address1, symbol: e.symbol1 }}
            size={20}
          />
          <span className="truncate font-medium">{p.symbol}</span>
        </span>
        <span className="shrink-0 font-semibold tnum">{usd(shown)}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusPill inRange={p.inRange} staked={p.staked} closed={false} />
        {p.realAprPct != null ? (
          <span className="text-xs tnum text-gain">{pct(p.realAprPct)} real APR</span>
        ) : (
          <span className="text-xs text-ink-muted">APR after a full day</span>
        )}
      </div>

      <p className="mt-1.5 text-xs text-ink-secondary">
        <span className="tnum text-gain">{usd(p.earnedUsd)}</span> earned since you opened it
        <InfoDot label="Earned since you opened it">
          <span className="block">Fees collected: {usd(e.feesClaimedUsd)}</span>
          <span className="block">
            Fees waiting: {usd(e.feesUnclaimedUsd)} ({amount(e.feesToken0)} {e.symbol0} ·{' '}
            {amount(e.feesToken1)} {e.symbol1})
          </span>
          <span className="block">Rewards claimed: {usd(e.rewardsClaimedUsd)}</span>
          <span className="block">
            Rewards pending: {usd(e.rewardsPendingUsd)}
            {e.rewardsPendingAmount ? ` (${amount(e.rewardsPendingAmount)} AERO)` : ''}
          </span>
        </InfoDot>
      </p>
    </Link>
  );
}

function WalletRow({ line }: { line: HoldingLine }) {
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <TokenLogo address={line.address} symbol={line.symbol} size={20} />
          {line.symbol}
          {line.venue === 'wallet' ? (
            <span className="ml-2 rounded-full bg-bg-elevated px-1.5 py-0.5 text-[0.5625rem] font-medium uppercase tracking-wide text-ink-muted">
              Not earning
            </span>
          ) : null}
        </span>
        <span className="font-semibold tnum">{usd(line.valueUsd)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="tnum text-ink-secondary">
          {amount(line.amount)} {line.unit}
          {line.multiplier != null && line.multiplier !== 1 ? (
            <span className="text-ink-muted"> · multiplier {line.multiplier.toFixed(4)}</span>
          ) : null}
        </span>
        <span className="text-ink-muted">
          {line.venue === 'lending' ? line.detail : line.priceSource === 'chainlink' ? 'Chainlink' : null}
        </span>
      </div>
      {line.stale ? (
        <p className="mt-1.5 text-[0.6875rem] text-warn">
          Price has not updated recently. These feeds run on market hours and pause during corporate actions.
        </p>
      ) : null}
    </div>
  );
}
