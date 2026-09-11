'use client';
/**
 * Two ways in, and neither asks for a signature.
 *
 * Pasting an address is the differentiator: you can analyse any wallet, including
 * one you do not control, without a wallet app or a connection prompt. Connecting
 * is there for people who expect it.
 *
 * There used to be a paragraph here explaining that connecting is safe, that it
 * grants no spending permission and that the app signs nothing. All true, and it
 * was the longest text on the first screen somebody sees. A product that behaves
 * like a read only tool demonstrates it in one click; a paragraph insisting on it
 * mostly plants the doubt it is answering.
 */
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ConnectButton } from '@/components/ConnectButton';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function WalletEntry({ demoWallet }: { demoWallet?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = (address: string) => {
    if (!ADDRESS_RE.test(address.trim())) {
      setError('That does not look like a Base address.');
      return;
    }
    // Stay on whichever screen sent us here: the report entry point should not
    // bounce someone to the portfolio and make them find their way back.
    const target = pathname?.startsWith('/report') ? '/report' : '/';
    router.push(`${target}?address=${address.trim().toLowerCase()}`);
  };

  return (
    <div className="space-y-3">
      <ConnectButton autoRedirect />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-bg-border" />
        <span className="text-[0.6875rem] uppercase tracking-wide text-ink-muted">or</span>
        <span className="h-px flex-1 bg-bg-border" />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); go(value); }}
        className="space-y-3"
      >
        <input
          className="input"
          placeholder="Paste any Base wallet address"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          aria-label="Base wallet address"
          // The error below was rendered but never announced: a screen reader
          // heard nothing happen when the address was rejected, and the field
          // gave no sign it was the one at fault.
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'wallet-error' : undefined}
        />
        <button type="submit" className="btn-primary w-full">Analyse this wallet</button>
      </form>

      {error ? <p id="wallet-error" role="alert" className="text-xs text-loss">{error}</p> : null}

      {demoWallet ? (
        <button type="button" className="btn-ghost w-full" onClick={() => go(demoWallet)}>
          See a live example
        </button>
      ) : null}

    </div>
  );
}
