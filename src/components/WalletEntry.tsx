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
import { ConnectButton } from '@/components/ConnectButton';

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
        />
        <button type="submit" className="btn-primary w-full">Analyse this wallet</button>
      </form>

      {error ? <p className="text-xs text-loss">{error}</p> : null}

      {demoWallet ? (
        <button type="button" className="btn-ghost w-full" onClick={() => go(demoWallet)}>
          See a live example
        </button>
      ) : null}

      <div className="rounded-xl border border-bg-border bg-bg-elevated p-3">
        <p className="text-[0.6875rem] leading-relaxed text-ink-secondary">
          <span className="text-ink-primary">Connecting is safe here, and you can skip it.</span>{' '}
          A connection reveals your address and nothing else: no spending permission,
          no approvals, no session. This app never asks you to sign anything, because
          it has nothing to sign for. Pasting an address gives you exactly the same
          result, including for wallets you do not control.
        </p>
      </div>
    </div>
  );
}
