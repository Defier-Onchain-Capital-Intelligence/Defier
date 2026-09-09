'use client';
/**
 * Which wallet a screen is about, when the URL does not say.
 *
 * Every tab carries the wallet in the query string, which works until somebody
 * lands on one directly: the server sees no address and renders "no wallet yet"
 * while a wallet is plainly connected in the corner. Going back to the portfolio
 * and returning fixed it, which is the shape of a bug that makes a product feel
 * unreliable rather than broken.
 *
 * The connected account only exists in the browser, so the fallback has to
 * happen here. Note the third state: wagmi reconnects asynchronously, so for a
 * moment after load it is neither connected nor finished trying, and rendering
 * "no wallet" during that moment is the same wrong answer arriving faster.
 *
 * This is not authentication and it does not need to be. Signing in with
 * Ethereum proves to a server that you control an address; this product reads
 * public state and has nothing to prove. Adding a signature prompt to an app
 * whose entire claim is that it never asks you to sign would cost more than the
 * bug it fixed.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { EmptyState, Skeleton } from '@/components/ui/Primitives';

export function WalletGate({ param, children, body }: {
  /** The address the URL carried, if any. */
  param?: string;
  children: (address: string) => React.ReactNode;
  body: string;
}) {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const router = useRouter();
  const settling = isConnecting || isReconnecting;
  const resolved = param || (isConnected && address ? address.toLowerCase() : null);

  // Put it in the URL once it is known, so a refresh or a shared link keeps
  // working and the tabs carry it from here on.
  useEffect(() => {
    if (!param && resolved) {
      router.replace(`${window.location.pathname}?wallet=${resolved}`);
    }
  }, [param, resolved, router]);

  if (resolved) return <>{children(resolved)}</>;
  if (settling) return <Skeleton className="h-64" />;
  return <EmptyState title="No wallet yet" body={body} />;
}
