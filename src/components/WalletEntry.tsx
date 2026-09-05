'use client';
/**
 * Two ways in, and neither asks for a signature.
 *
 * Pasting an address is the differentiator: you can analyse any wallet, including
 * one you do not control, without a wallet app or a connection prompt. Connecting
 * is there for people who expect it. The app never signs anything either way,
 * and says so, because a read only tool that behaves like one earns trust faster
 * than a banner claiming it is safe.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function WalletEntry({ demoWallet }: { demoWallet?: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const go = (address: string) => {
    if (!ADDRESS_RE.test(address.trim())) {
      setError('That does not look like a Base address.');
      return;
    }
    router.push(`/?address=${address.trim().toLowerCase()}`);
  };

  return (
    <div className="space-y-3">
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
        />
        <button type="submit" className="btn-primary w-full">Analyse this wallet</button>
      </form>

      {error ? <p className="text-xs text-loss">{error}</p> : null}

      {demoWallet ? (
        <button type="button" className="btn-ghost w-full" onClick={() => go(demoWallet)}>
          See a live example
        </button>
      ) : null}

      <p className="text-xs text-ink-muted text-center">
        Read only. No signature, no connection, no seed phrase, ever.
      </p>
    </div>
  );
}
