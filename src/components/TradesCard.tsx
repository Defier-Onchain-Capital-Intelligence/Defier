'use client';
/**
 * The trades worth a mention, loaded after the report is already on screen.
 *
 * Deliberately its own request. Reading every transfer a wallet ever made is
 * slower than the report and completely unrelated to it, so blocking the P&L on
 * it would make the main answer arrive late for a section that is, by its own
 * admission, an aside.
 *
 * The section stays absent rather than empty when there is nothing to say. A
 * wallet with no dramatic trade is not a wallet with a boring headline — it is a
 * wallet this section has no business talking about.
 */
import { useEffect, useState } from 'react';
import { useComposeCast } from '@coinbase/onchainkit/minikit';
import { Card, Label } from '@/components/ui/Primitives';

const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://www.getdefier.com';

interface Moment { headline: string; txHash: string }
interface Coverage { available?: boolean; swapsFound?: number; swapsPriced?: number; complete?: boolean }

export function TradesCard({ address }: { address: string }) {
  const { composeCast } = useComposeCast();
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/swaps/${address}`);
        const json = await res.json();
        if (!alive || !res.ok) return;
        setMoments(json.moments || []);
        setCoverage(json.coverage || null);
      } catch (_) { /* an aside that fails stays absent */ }
    })();
    return () => { alive = false; };
  }, [address]);

  if (!moments?.length) return null;

  /** Mint first: the card's sentences are written by the server, never here. */
  async function urlToShare(): Promise<string> {
    try {
      const res = await fetch('/api/swap-card', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const json = await res.json();
      if (res.ok && json?.id) return `${SITE}/s/${json.id}`;
    } catch (_) { /* storage down: share the app instead */ }
    return `${SITE}/report`;
  }

  const text = `${moments[0].headline} Checked on DeFier.`;

  const onShare = async () => {
    setBusy(true);
    const url = await urlToShare();
    setBusy(false);
    try {
      composeCast({ text, embeds: [url] });
      return;
    } catch (_) { /* not inside Base App */ }
    window.open(
      `https://x.com/intent/post?text=${encodeURIComponent(`${text}\n\n`)}&url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const onCopy = async () => {
    setBusy(true);
    const url = await urlToShare();
    setBusy(false);
    try {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) { /* clipboard denied */ }
  };

  return (
    <Card>
      <Label>Trades worth a mention</Label>
      <div className="mt-3 space-y-3">
        {moments.map((m) => (
          <p key={m.txHash} className="text-[0.875rem] leading-relaxed">{m.headline}</p>
        ))}
      </div>

      <p className="muted mt-3 text-[0.75rem] leading-relaxed">
        Both sides at today’s price. Not a profit and loss — it does not follow what happened to
        the proceeds.
        {coverage?.swapsFound != null && coverage?.swapsPriced != null
          ? ` ${coverage.swapsPriced} of ${coverage.swapsFound} trades had a price on both sides.`
          : ''}
        {coverage?.complete === false ? ' The oldest trades are missing.' : ''}
      </p>

      <div className="mt-4 flex gap-2">
        <button onClick={onShare} disabled={busy} className="btn-primary flex-1 justify-center">
          {busy ? 'Preparing…' : 'Share this'}
        </button>
        <button onClick={onCopy} disabled={busy} className="btn-secondary justify-center px-4">
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </Card>
  );
}
