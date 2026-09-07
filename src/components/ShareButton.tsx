'use client';
/**
 * Share the report.
 *
 * The privacy rule is absolute and it is why this component exists rather than a
 * plain link: the shared text and the card image carry the figure and the period,
 * never the address. At most the last four characters, which identify nothing.
 * Somebody posting that they lost money should not also be publishing which
 * wallet lost it.
 *
 * Inside Base App it composes a cast; on the web it opens X. Same text, same
 * restraint.
 */
import { useState } from 'react';
import { useComposeCast } from '@coinbase/onchainkit/minikit';
import type { LifetimeReport } from '@/types/portfolio';
import { usd } from '@/lib/format';

const SITE = 'https://defier-alpha.vercel.app';

function shareText(l: LifetimeReport): string {
  const il = usd(l.impermanentLossUsd);
  const earned = usd(l.earnedUsd);
  // Never claim a scope the report did not prove. "Every position I have ever
  // opened" is a strong sentence and it has to be true when it is posted.
  const scope = l.coverage.complete
    ? 'every liquidity position I have ever opened on Base'
    : `${l.positionsOpened} of my liquidity positions on Base`;

  if (l.divergenceGainUsd > 0) {
    return `I rebuilt ${scope}.\n\n`
      + `Impermanent loss cost me nothing: divergence went my way by ${usd(l.divergenceGainUsd)} `
      + `across ${l.positionsOpened} positions, plus ${earned} in fees.\n\n`
      + `Almost no LP knows this number for their own wallet.`;
  }

  if (l.impermanentLossUsd <= 0) {
    return `I checked ${scope}.\n\n`
      + `Earned ${earned} in fees and emissions, with no divergence from holding.\n\n`
      + `Most LPs have never seen this number for their own wallet.`;
  }

  const covered = l.feesCoverIl;
  const verdict = covered != null && covered >= 1
    ? `My fees covered it ${covered.toFixed(1)}x over.`
    : `My fees did not cover it.`;

  return `Impermanent loss has cost me ${il} on Base.\n\n`
    + `${verdict} ${earned} earned across ${l.positionsOpened} positions.\n\n`
    + `Almost no LP knows this number for their own wallet. I found mine in about a minute.`;
}

export function ShareButton({ lifetime, address }: { lifetime: LifetimeReport; address: string }) {
  const { composeCast } = useComposeCast();
  const [copied, setCopied] = useState(false);

  // Never the address. The last four identify nothing and keep it personal.
  const tail = address.slice(-4);
  const url = `${SITE}/report?tag=${tail}`;
  const text = shareText(lifetime);

  const onShare = () => {
    try {
      composeCast({ text, embeds: [url] });
      return;
    } catch (_) {
      // Not inside Base App: fall through to X.
    }
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(`${text}\n\n`)}&url=${encodeURIComponent(url)}`;
    window.open(intent, '_blank', 'noopener,noreferrer');
  };

  const onCopy = async () => {
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
        <button type="button" onClick={onShare} className="btn-primary flex-1">
          Share
        </button>
        <button type="button" onClick={onCopy} className="btn-ghost px-4">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="mt-3 whitespace-pre-line rounded-xl bg-bg-elevated p-3 text-[0.6875rem] leading-relaxed text-ink-secondary">
        {text}
      </p>
    </div>
  );
}
