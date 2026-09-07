import type { Metadata } from 'next';
import Link from 'next/link';
import { after } from 'next/server';
import { readCard, bumpCardViews, CARD_ID_RE } from '@/lib/cards';
import { reportHeadline } from '@/lib/reportCopy';
import { usd, relativeDays, dateOf } from '@/lib/format';
import { Card, Label } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://defier-alpha.vercel.app';

/**
 * A shared report card.
 *
 * Public by design and anonymous by design: the row behind this page holds four
 * characters of an address and a set of figures the engine wrote. Someone
 * posting that they lost money should not also be publishing which wallet lost
 * it, and nobody should be able to publish a figure we did not compute.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const card = CARD_ID_RE.test(id) ? await readCard(id) : null;

  if (!card) {
    return { title: 'DeFier · What has impermanent loss actually cost you?' };
  }

  const h = reportHeadline(card.figures);
  const title = `${h.label}: ${h.display} · DeFier`;
  const description = [h.across, h.caveat].filter(Boolean).join(' ');
  const url = `${APP_URL}/c/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'DeFier', type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
    other: {
      // Base App renders this as an embed with a button rather than a plain
      // link, which is the whole distribution loop: someone sees a real figure
      // and is one tap from their own.
      'fc:miniapp': JSON.stringify({
        version: '1',
        imageUrl: `${APP_URL}/api/card/${id}/embed`,
        button: {
          title: 'Check your wallet',
          action: {
            type: 'launch_miniapp',
            name: 'DeFier',
            url: `${APP_URL}/report`,
            splashBackgroundColor: '#08090C',
          },
        },
      }),
    },
  };
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-kpi">{value}</p>
    </div>
  );
}

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = CARD_ID_RE.test(id) ? await readCard(id) : null;

  if (!card) {
    return (
      <div className="space-y-6 pt-6">
        <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight">
          This card is not available
        </h1>
        <p className="muted leading-relaxed">
          The link may be old, or the report behind it was never saved. You can still run the
          same analysis on any wallet.
        </p>
        <Link href="/report" className="btn-primary inline-flex">Analyse a wallet</Link>
      </div>
    );
  }

  after(() => bumpCardViews(id));

  const f = card.figures;
  const h = reportHeadline(f);

  return (
    <div className="space-y-4 pt-6">
      <header>
        <Label>{h.label}</Label>
        <p className={`hero-num mt-1 ${h.gained ? 'text-gain' : 'text-loss'}`}>{h.display}</p>
        <p className="mt-2 text-[0.9375rem] leading-relaxed">{h.verdict}</p>
        <p className="mt-1 text-xs text-ink-muted">{h.across}</p>
        {h.caveat ? (
          <p className="mt-2 rounded-xl border border-bg-border bg-bg-elevated p-3 text-xs leading-relaxed text-ink-secondary">
            {h.caveat}
          </p>
        ) : null}
      </header>

      <Card>
        <div className="grid grid-cols-2 gap-4">
          <Tile label="Fees and emissions" value={usd(f.earnedUsd)} />
          <Tile label="Capital deployed" value={usd(f.capitalDeployedUsd)} />
          <Tile label="Beat holding" value={`${f.beatHoldCount} of ${f.positionsOpened}`} />
          <Tile label="Providing for" value={relativeDays(f.daysProviding)} />
        </div>
      </Card>

      <Card>
        <Label>What this is</Label>
        <p className="muted mt-2 text-[0.8125rem] leading-relaxed">
          Every concentrated liquidity position this wallet opened on Base, rebuilt from onchain
          events and valued at the price of the day each one happened — including positions whose
          NFT was burned. The card carries no address, only the last four characters, and the
          figures were written by the engine rather than typed into a link.
        </p>
      </Card>

      <Link href="/report" className="btn-primary flex justify-center">
        Find out what yours is
      </Link>

      <p className="text-center text-[0.6875rem] text-ink-muted">
        Generated {dateOf(f.generatedAt)} · Informational only, not investment advice.
      </p>
    </div>
  );
}
