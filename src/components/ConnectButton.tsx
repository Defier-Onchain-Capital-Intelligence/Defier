'use client';
/**
 * Connect wallet, on the standard path: wagmi under OnchainKit, which is what
 * Base's own apps use.
 *
 * The security story here is unusually simple, and worth stating plainly rather
 * than hiding behind a badge. Connecting a wallet runs `eth_requestAccounts`,
 * which reveals an address and grants nothing: no spending power, no allowance,
 * no session. Everything dangerous in web3 happens at a signature or an
 * approval, and this app requests neither, because it has nothing to sign for.
 *
 * Which leads to the design: connecting and pasting converge on the same thing.
 * Both end at `/?address=0x…`. Connecting is a convenience for typing your own
 * address, not a door to extra features, and someone who prefers not to connect
 * loses nothing at all.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ConnectWallet, Wallet, WalletDropdown, WalletDropdownDisconnect } from '@coinbase/onchainkit/wallet';
import { Avatar, Name, Address, Identity } from '@coinbase/onchainkit/identity';

/** Connect, then go straight to that wallet's portfolio. */
export function ConnectButton({ autoRedirect = false }: { autoRedirect?: boolean }) {
  const { address, isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (autoRedirect && isConnected && address) {
      router.push(`/?address=${address.toLowerCase()}`);
    }
  }, [autoRedirect, isConnected, address, router]);

  return (
    <Wallet>
      <ConnectWallet className="!w-full !justify-center !rounded-xl !bg-accent !py-3 !text-sm !font-medium hover:!bg-accent-dim">
        <Avatar className="h-5 w-5" />
        <Name />
      </ConnectWallet>
      <WalletDropdown>
        <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
          <Avatar />
          <Name />
          <Address />
        </Identity>
        <WalletDropdownDisconnect />
      </WalletDropdown>
    </Wallet>
  );
}
