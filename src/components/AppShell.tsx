'use client';
/**
 * Mobile first shell: a single column with a fixed bottom bar, as in the mockups.
 * It stays a column on desktop rather than spreading into panels, because the
 * product is meant to be read top to bottom: the answer, then the detail.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAccount } from 'wagmi';

/**
 * Portfolio was the wrong name for the first tab. Holdings is also a portfolio,
 * and Earn is where the positions are, so three tabs claimed the same word and
 * none of them said what you would find. Overview says what that screen is:
 * everything at once, before you go looking at any one part of it.
 */
const NAV = [
  { href: '/',          label: 'Overview' },
  { href: '/holdings',  label: 'Holdings' },
  { href: '/pools',     label: 'Earn' },
  { href: '/simulate',  label: 'Simulate' },
  { href: '/ask',       label: 'Ask' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Documentation is read, not operated. It gets a wider measure and no app
  // navigation: a bottom bar with five tabs under a page about tick spacing is
  // furniture from a different room.
  if (pathname?.startsWith('/docs')) {
    return (
      <div className="min-h-screen bg-bg-base">
        <header className="border-b border-bg-border">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
            <Link href="/docs" className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
              <span className="text-sm font-semibold tracking-[0.12em]">DEFIER</span>
              <span className="text-sm text-ink-muted">docs</span>
            </Link>
            <Link href="/" className="text-[0.8125rem] text-ink-muted hover:text-ink-secondary">
              Open the app →
            </Link>
          </div>
        </header>
        <div className="mx-auto w-full max-w-3xl px-5 pb-24">{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="mx-auto w-full max-w-app px-4 pb-36 pt-5">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-bg-border bg-bg-surface/95 backdrop-blur">
        {/* Reading the query string opts a component out of static rendering, so
            the bar is isolated behind a boundary and the pages around it are not. */}
        <Suspense fallback={<div className="h-[64px]" />}>
          <NavBar />
        </Suspense>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}

function NavBar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { address: connected } = useAccount();
  // The wallet under inspection follows you across tabs. Losing it on every
  // navigation is the fastest way to make a tool feel broken — and it did:
  // landing on a tab with no address in the URL produced "no wallet yet" beside
  // a connected wallet badge. The connected account is the fallback, so a link
  // is never built without one when one exists.
  const wallet = params.get('wallet') || params.get('address') || connected?.toLowerCase() || '';

  // Bigger, and not pressed against the edge of the screen. Labels at eleven
  // pixels with no space between them read as a caption rather than as the way
  // around the product, and on a phone the bottom few millimetres are where the
  // thumb rests and where the system's own home indicator sits.
  return (
    <div className="mx-auto flex w-full max-w-app items-stretch gap-1 px-3 pb-3 pt-2.5">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const key = item.href === '/' ? 'address' : 'wallet';
            const href = wallet ? `${item.href}?${key}=${wallet}` : item.href;
            return (
              <Link
                key={item.href}
                href={href}
                className={`flex-1 rounded-xl px-1 py-2.5 text-center text-[0.8125rem] leading-none tracking-tight transition-colors ${
                  active
                    ? 'bg-bg-elevated font-semibold text-ink-primary'
                    : 'font-medium text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
    </div>
  );
}
