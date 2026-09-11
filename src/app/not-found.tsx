import Link from 'next/link';

/**
 * The 404. Without this file an unknown path renders Next's default page,
 * which is unstyled, outside the app shell, and reached most often by someone
 * following a share link that expired.
 */
export const metadata = {
  title: 'Not found · DeFier',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-bg-border bg-bg-elevated p-6 text-center">
      <h1 className="text-base font-semibold">This page does not exist</h1>
      <p className="muted mx-auto mt-2 max-w-sm text-[0.8125rem] leading-relaxed">
        The link may be old, or a shared card may have been removed. Nothing is
        wrong with your wallet: DeFier only reads public data and holds nothing.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link href="/" className="rounded-xl border border-bg-border bg-bg-base px-4 py-2 text-sm font-medium">
          Analyse a wallet
        </Link>
        <Link href="/pools" className="rounded-xl border border-bg-border bg-bg-base px-4 py-2 text-sm font-medium">
          Browse pools
        </Link>
      </div>
    </div>
  );
}
