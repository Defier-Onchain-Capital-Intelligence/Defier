'use client';
/**
 * Holdings, split into a crypto side and a stocks side.
 *
 * A tokenized share of NVDA and a stablecoin move for unrelated reasons, so one
 * total across both says nothing. Stablecoins sit on the crypto side: they are
 * the dry powder of a crypto portfolio, not an asset class of their own.
 *
 * Every line says where the money actually is. The point of the screen is that
 * a stock parked inside a liquidity position is still a position in that stock,
 * and no wallet tracker will tell you so.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Portfolio, HoldingsBucket, HoldingLine } from '@/types/portfolio';
import { fetchPortfolio } from '@/lib/api';
import { usd, amount, pct } from '@/lib/format';
import { Card, Label, Tabs, ExposureBar, Skeleton, EmptyState } from '@/components/ui/Primitives';

type Side = 'crypto' | 'stocks';

export function HoldingsView({ address, initialTab }: { address: string; initialTab: Side }) {
  const [tab, setTab] = useState<Side>(initialTab);
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchPortfolio(address)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [address]);

  if (error) return <EmptyState title="We could not read that wallet" body={error} />;
  if (!data) return <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-24" /><Skeleton className="h-48" /></div>;

  const holdings = data.holdings;
  const bucket = tab === 'crypto' ? holdings.crypto : holdings.stocks;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Holdings</h1>

      <Tabs<Side>
        value={tab}
        onChange={setTab}
        options={[
          { key: 'crypto', label: 'Crypto', sub: usd(holdings.crypto.totalUsd) },
          { key: 'stocks', label: 'Stocks', sub: usd(holdings.stocks.totalUsd) },
        ]}
      />

      {bucket.lines.length === 0 ? (
        <EmptyState
          title={tab === 'crypto' ? 'No crypto found on Base' : 'No tokenized stocks found'}
          body={tab === 'crypto'
            ? 'Tokens in your wallet, inside liquidity positions and supplied to lenders all appear here.'
            : 'Coinbase B20 stocks appear here when you hold them, and when they turn up inside your liquidity positions.'}
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

      {tab === 'stocks' && bucket.lines.length ? (
        <p className="px-1 text-[0.6875rem] leading-relaxed text-ink-muted">
          One token is not permanently one share. Dividends and splits raise a multiplier
          instead of minting tokens, so the share figure above is what you could redeem.
          These are issued by Coinbase and available only to eligible users outside the
          United States.
        </p>
      ) : null}
    </div>
  );
}

function BucketHeader({ bucket, side }: { bucket: HoldingsBucket; side: Side }) {
  const venues = [
    { label: 'In your wallet', value: bucket.walletUsd },
    { label: 'Inside liquidity', value: bucket.inPoolsUsd },
    { label: 'Lending', value: bucket.lendingUsd },
  ].filter((v) => v.value !== 0);

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <Label>{side === 'crypto' ? 'Crypto portfolio' : 'Stocks portfolio'}</Label>
          <p className="kpi mt-1">{usd(bucket.totalUsd)}</p>
        </div>
        <span className="text-xs text-ink-muted tnum">{pct(bucket.pctOfPortfolio, 0)} of the total</span>
      </div>

      {venues.length > 1 ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {venues.map((v) => (
            <div key={v.label}>
              <p className="text-xs text-ink-muted">{v.label}</p>
              <p className="mt-0.5 font-semibold tnum">{usd(v.value)}</p>
            </div>
          ))}
        </div>
      ) : null}

      {bucket.byClass.length > 1 ? (
        <div className="mt-4"><ExposureBar slices={bucket.byClass} /></div>
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
        return (
          <Card key={venue}>
            <Label>{VENUE_TITLE[venue]}</Label>
            <div className="divide-hair mt-1">
              {group.map((line) => <Row key={line.key} line={line} wallet={wallet} />)}
            </div>
          </Card>
        );
      })}
    </>
  );
}

function Row({ line, wallet }: { line: HoldingLine; wallet: string }) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{line.symbol}</span>
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
          {line.venue === 'lp' ? line.detail : line.priceSource === 'chainlink' ? 'Chainlink' : null}
        </span>
      </div>
      {line.stale ? (
        <p className="mt-1.5 text-[0.6875rem] text-warn">
          Price has not updated recently. These feeds run on market hours and pause during corporate actions.
        </p>
      ) : null}
    </>
  );

  if (line.positionId) {
    return (
      <Link
        href={`/position/${encodeURIComponent(line.positionId)}?wallet=${wallet}`}
        className="-mx-4 block px-4 py-3 transition-colors hover:bg-bg-elevated/50"
      >
        {body}
      </Link>
    );
  }
  return <div className="py-3">{body}</div>;
}
