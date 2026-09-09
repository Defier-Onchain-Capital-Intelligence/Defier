'use client';
/**
 * Whose wallet you are looking at, and the way out of it.
 *
 * It shows a Basename when the address has one, because a name is easier to
 * check at a glance than forty hex characters, and checking is exactly what
 * somebody should do before trusting a number on this screen.
 *
 * The badge used to be text and nothing else, which left a real dead end: once
 * connected, every visit redirected to that wallet and there was no way back
 * out of the product. Disconnecting meant going into the wallet extension and
 * revoking the site by hand. Every serious DeFi app puts disconnect behind the
 * address in the corner, and it belongs there because that is where somebody
 * looks when they want to stop being this person.
 *
 * Disconnecting also drops the address from the URL. Staying on `/?address=…`
 * after disconnecting would leave the previous wallet on screen, which is the
 * one thing this badge exists to prevent.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount, useDisconnect } from 'wagmi';
import { Avatar, Name } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';
import { shortAddress } from '@/lib/format';

export function WalletBadge({ address }: { address: string }) {
  const { address: connected } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const isOwn = connected?.toLowerCase() === address.toLowerCase();

  // A menu that only closes on its own button is a menu people get stuck in.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) { /* clipboard denied: the address is on screen anyway */ }
  };

  const onDisconnect = () => {
    disconnect();
    setOpen(false);
    // Back to the entry screen rather than to this wallet with no session.
    router.push('/');
  };

  return (
    <div ref={boxRef} className="relative text-right">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-full bg-bg-elevated px-2 py-1 transition-colors hover:bg-bg-border"
      >
        <Avatar address={address as `0x${string}`} chain={base} className="h-4 w-4" />
        <Name address={address as `0x${string}`} chain={base} className="!text-[0.6875rem] !text-ink-secondary" />
        <span aria-hidden className={`text-[0.5rem] text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {connected && !isOwn ? (
        <Link href={`/?address=${connected.toLowerCase()}`} className="mt-1 block text-[0.6875rem] text-accent">
          Back to your wallet
        </Link>
      ) : null}
      {!connected ? (
        <span className="mt-1 block font-mono text-[0.6875rem] text-ink-muted">{shortAddress(address)}</span>
      ) : null}

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-bg-border bg-bg-surface text-left shadow-card"
        >
          <p className="border-b border-bg-border px-3 py-2 font-mono text-[0.6875rem] text-ink-muted">
            {shortAddress(address)}
          </p>

          <MenuItem onClick={onCopy}>{copied ? 'Copied' : 'Copy address'}</MenuItem>

          <a
            href={`https://basescan.org/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            className="block px-3 py-2.5 text-[0.8125rem] text-ink-primary transition-colors hover:bg-bg-elevated"
          >
            View on Basescan
          </a>

          <Link
            href="/"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-[0.8125rem] text-ink-primary transition-colors hover:bg-bg-elevated"
          >
            Analyse another wallet
          </Link>

          {connected ? (
            <MenuItem onClick={onDisconnect} tone="text-loss">Disconnect</MenuItem>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ onClick, children, tone = 'text-ink-primary' }: {
  onClick: () => void; children: React.ReactNode; tone?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-3 py-2.5 text-left text-[0.8125rem] transition-colors hover:bg-bg-elevated ${tone}`}
    >
      {children}
    </button>
  );
}
