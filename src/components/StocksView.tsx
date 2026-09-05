'use client';
/**
 * Tokenized stocks. Two questions, in order.
 *
 * What do you hold, adjusted for the multiplier, because one token is not one
 * share and the ratio moves. And where else are you exposed to these assets
 * without realising it, because a stock sitting inside a liquidity pool is still
 * a position in that stock, and no wallet tracker shows it.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Portfolio } from '@/types/portfolio';
import { fetchPortfolio } from '@/lib/api';
import { usd, amount, price } from '@/lib/format';
import { Card, Label, Skeleton, EmptyState } from '@/components/ui/Primitives';

export function StocksView({ address }: { address: string }) {
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
  if (!data) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;

  const held = data.tokens.filter((h) => h.token.isTokenizedStock);
  const inPools = data.positions.filter(
    (p) => !p.closed && (p.token0.isTokenizedStock || p.token1.isTokenizedStock)
  );

  if (held.length === 0 && inPools.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Tokenized stocks</h1>
        <EmptyState
          title="None found in this wallet"
          body="Coinbase B20 stocks appear here when you hold them, and when they turn up inside your liquidity positions."
        />
      </div>
    );
  }

  const totalUsd = held.reduce((a, h) => a + (h.valueUsd || 0), 0);

  return (
    <div className="space-y-4">
      <header>
        <Label>Tokenized stocks</Label>
        <p className="kpi mt-1">{usd(totalUsd)}</p>
        <p className="text-xs text-ink-muted mt-0.5">held directly, excluding what sits inside pools</p>
      </header>

      {held.length ? (
        <Card>
          <Label>Holdings</Label>
          <div className="divide-hair mt-1">
            {held.map((h) => (
              <div key={h.token.address} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{h.token.symbol}</span>
                  <span className="font-semibold tnum">{usd(h.valueUsd)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-ink-secondary tnum">
                    {amount(h.scaledBalance ?? h.balance)} {h.scaledBalance != null ? 'shares' : 'tokens'}
                    {h.multiplier != null && h.multiplier !== 1 ? (
                      <span className="text-ink-muted"> · multiplier {h.multiplier.toFixed(4)}</span>
                    ) : null}
                  </span>
                  <span className="text-ink-muted tnum">
                    {price(h.price?.usd)} {h.price?.source === 'chainlink' ? 'Chainlink' : 'DEX'}
                  </span>
                </div>
                {h.price?.stale ? (
                  <p className="mt-1.5 text-[0.6875rem] text-warn">
                    Price has not updated recently. These feeds run on market hours and pause during corporate actions.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[0.6875rem] leading-relaxed text-ink-muted">
            One token is not permanently one share. Dividends and splits raise a multiplier
            instead of minting tokens, so the share figure above is what you could redeem.
          </p>
        </Card>
      ) : null}

      {inPools.length ? (
        <Card>
          <Label>Inside your liquidity</Label>
          <p className="muted mt-1 text-[0.8125rem]">
            Exposure to these stocks that a wallet tracker will not show you.
          </p>
          <div className="divide-hair mt-2">
            {inPools.map((p) => {
              const stockSide = p.token0.isTokenizedStock ? p.token0 : p.token1;
              const stockAmount = p.token0.isTokenizedStock
                ? p.currentAmounts?.token0 : p.currentAmounts?.token1;
              const stockPrice = p.token0.isTokenizedStock ? p.prices.token0?.usd : p.prices.token1?.usd;
              return (
                <Link
                  key={p.id}
                  href={`/position/${encodeURIComponent(p.id)}?wallet=${address}`}
                  className="block py-3 -mx-4 px-4 transition-colors hover:bg-bg-elevated/50"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{p.symbol}</span>
                    <span className="font-semibold tnum">
                      {usd(stockAmount != null && stockPrice ? stockAmount * stockPrice : null)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-secondary tnum">
                    {amount(stockAmount)} {stockSide.symbol} currently in the pool
                  </p>
                </Link>
              );
            })}
          </div>
        </Card>
      ) : null}

      <p className="px-1 text-center text-[0.6875rem] leading-relaxed text-ink-muted">
        Tokenized stocks are issued by Coinbase and available only to eligible users in
        jurisdictions outside the United States.
      </p>
    </div>
  );
}
