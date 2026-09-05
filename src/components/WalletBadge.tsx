'use client';
/**
 * Whose wallet you are looking at. Shows a Basename when the address has one,
 * because a name is easier to check at a glance than forty hex characters, and
 * checking is exactly what someone should do before trusting a number.
 *
 * If you are connected and looking at someone else's wallet, it says so and
 * offers the way back. Analysing another address is a feature here, so the
 * product should never leave you unsure which one is on screen.
 */
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { Avatar, Name } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';
import { shortAddress } from '@/lib/format';

export function WalletBadge({ address }: { address: string }) {
  const { address: connected } = useAccount();
  const isOwn = connected?.toLowerCase() === address.toLowerCase();

  return (
    <div className="text-right">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-elevated px-2 py-1">
        <Avatar address={address as `0x${string}`} chain={base} className="h-4 w-4" />
        <Name address={address as `0x${string}`} chain={base} className="!text-[0.6875rem] !text-ink-secondary" />
      </span>
      {connected && !isOwn ? (
        <Link href={`/?address=${connected.toLowerCase()}`} className="mt-1 block text-[0.6875rem] text-accent">
          Back to your wallet
        </Link>
      ) : null}
      {!connected ? (
        <span className="mt-1 block font-mono text-[0.6875rem] text-ink-muted">{shortAddress(address)}</span>
      ) : null}
    </div>
  );
}
