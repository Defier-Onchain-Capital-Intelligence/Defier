'use client';
/**
 * Share the report.
 *
 * The privacy rule is absolute and it is why this component exists rather than
 * a plain link: the shared text and the card image carry the figure and the
 * period, never the address. At most the last four characters, which identify
 * nothing. Somebody posting that they lost money should not also be publishing
 * which wallet lost it.
 *
 * Pressing share mints a card first. The card's figures are read by the server
 * from the engine, not sent from here, so a shared DeFier card is evidence
 * rather than a claim — there is no way for a browser to choose the number that
 * ends up on it. If minting fails the share still happens, pointing at the
 * report instead of a card.
 *
 * Inside Base App it composes a cast; on the web it opens X. Same text, same
 * restraint.
 */
import { useState } from 'react';
import { useComposeCast } from '@coinbase/onchainkit/minikit';
import type { LifetimeReport } from '@/types/portfolio';
import { figuresFrom, shareText } from '@/lib/reportCopy';

const SITE = process.env.NEXT_PUBLIC_APP_URL || 'https://defier-alpha.vercel.app';

export function ShareButton({ lifetime, address }: { lifetime: LifetimeReport; address: string }) {
  const { composeCast } = useComposeCast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);

  // Never the address. The last four identify nothing and keep it personal.
  const tail = address.slice(-4);
  const figures = figuresFrom(lifetime, tail, Math.floor(Date.now() / 1000));
  const text = shareText(figures);

  const fallbackUrl = `${SITE}/report?tag=${tail}`;

  /** The card link if we can mint one, else the report link. Never blocks the share. */
  async function urlToShare(): Promise<string> {
    if (cardId) return `${SITE}/c/${cardId}`;
    try {
      const res = await fetch('/api/card', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const json = await res.json();
      if (res.ok && json?.id) {
        setCardId(json.id);
        return `${SITE}/c/${json.id}`;
      }
    } catch (_) { /* storage down: share the report instead */ }
    return fallbackUrl;
  }

  const onShare = async () => {
    setBusy(true);
    const url = await urlToShare();
    setBusy(false);

    try {
      composeCast({ text, embeds: [url] });
      return;
    } catch (_) {
      // Not inside Base App: fall through to X.
    }
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(`${text}\n\n`)}`
      + `&url=${encodeURIComponent(url)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
  };

  const onCopy = async () => {
    setBusy(true);
    const url = await urlToShare();
    setBusy(false);
    try {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) { /* clipboard refused; the share button still works */ }
  };

  return (
    <div className="rounded-2xl border border-bg-border bg-bg-surface p-4">
      <p className="text-sm font-medium">Share it</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Your figure and the period, never your address.
      </p>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onShare} disabled={busy} className="btn-primary flex-1 disabled:opacity-60">
          {busy ? 'Preparing…' : 'Share'}
        </button>
        <button type="button" onClick={onCopy} disabled={busy} className="btn-ghost px-4 disabled:opacity-60">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="mt-3 whitespace-pre-line rounded-xl bg-bg-elevated p-3 text-[0.6875rem] leading-relaxed text-ink-secondary">
        {text}
      </p>

      {cardId ? (
        <a
          href={`/c/${cardId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-center text-[0.6875rem] text-accent"
        >
          See the card
        </a>
      ) : null}
    </div>
  );
}
