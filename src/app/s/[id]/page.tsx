import type { Metadata } from 'next';
import Link from 'next/link';
import { readSwapCard, SWAP_CARD_ID_RE } from '@/lib/swapCard';
import { Card, Label } from '@/components/ui/Primitives';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.getdefier.com';

/**
 * A shared trades card.
 *
 * Anonymous by construction — the row holds four characters of an address — and
 * narrow by construction: it says what the wallet traded and what those amounts
 * are worth today. It is not a profit and loss and the page says so in its own
 * words rather than leaving the reader to assume, because this is the page that
 * travels furthest from anyone who could explain it.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const card = SWAP_CARD_ID_RE.test(id) ? await readSwapCard(id) : null;

  if (!card) return { title: 'DeFier · What did your wallet actually trade?' };

  const first = card.figures.moments[0];
  const title = 'Trades worth a mention · DeFier';
  const description = first?.headline || 'Every trade this wallet made on Base, valued at today’s price.';
  const url = `${APP_URL}/s/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'DeFier', type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
    other: {
      'fc:miniapp': JSON.stringify({
        version: '1',
        imageUrl: `${APP_URL}/api/swap-card/${id}/embed`,
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

export default async function SwapCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = SWAP_CARD_ID_RE.test(id) ? await readSwapCard(id) : null;

  if (!card) {
    return (
      <div className="space-y-6 pt-6">
        <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight">
          This card is not available
        </h1>
        <p className="muted leading-relaxed">
          The link may be old, or it was never saved. You can still run the same read on any wallet.
        </p>
        <Link href="/report" className="btn-primary inline-flex">Analyse a wallet</Link>
      </div>
    );
  }

  const f = card.figures;

  return (
    <div className="space-y-4 pt-6">
      <header>
        <Label>Trades worth a mention</Label>
        <p className="mt-2 text-[1.0625rem] font-medium leading-relaxed">
          {f.moments[0]?.headline}
        </p>
        <p className="mt-1 text-xs text-ink-muted">0x…{f.tail}</p>
      </header>

      {f.moments.slice(1).length > 0 ? (
        <Card>
          <div className="space-y-3">
            {f.moments.slice(1).map((m, i) => (
              <p key={i} className="text-[0.875rem] leading-relaxed text-ink-secondary">{m.headline}</p>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-ink-muted">Trades read</p>
            <p className="mt-1 text-kpi">{f.swapsFound}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Trades priced</p>
            <p className="mt-1 text-kpi">{f.swapsPriced}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">History</p>
            <p className="mt-1 text-kpi">{f.complete ? 'All time' : 'Partial'}</p>
          </div>
        </div>
      </Card>

      <Card>
        <Label>What this is, and what it is not</Label>
        <p className="muted mt-2 text-[0.8125rem] leading-relaxed">
          Each line is one transaction where this wallet gave one asset and received another,
          rebuilt from onchain transfers rather than from any single exchange. Both sides are
          valued at today’s price, so the amounts are checkable.
        </p>
        <p className="muted mt-2 text-[0.8125rem] leading-relaxed">
          It is <span className="text-ink-primary">not a profit and loss</span>. It does not follow
          what the wallet did with the proceeds, so a trade shown here says nothing about whether
          the decision was good. Trades whose tokens have no trusted price are left out and counted
          rather than guessed at.
        </p>
      </Card>

      <Link href="/report" className="btn-primary flex justify-center">
        Check your own wallet
      </Link>
    </div>
  );
}
