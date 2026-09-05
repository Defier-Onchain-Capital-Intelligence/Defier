'use client';
/**
 * Mobile first shell: a single column with a fixed bottom bar, as in the mockups.
 * It stays a column on desktop rather than spreading into panels, because the
 * product is meant to be read top to bottom: the answer, then the detail.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const NAV = [
  { href: '/',          label: 'Portfolio' },
  { href: '/holdings',  label: 'Holdings' },
  { href: '/pools',     label: 'Pools' },
  { href: '/simulate',  label: 'Simulate' },
  { href: '/ask',       label: 'Ask' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-base">
      <div className="mx-auto w-full max-w-app px-4 pb-28 pt-5">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-bg-border bg-bg-surface/95 backdrop-blur">
        {/* Reading the query string opts a component out of static rendering, so
            the bar is isolated behind a boundary and the pages around it are not. */}
        <Suspense fallback={<div className="h-[52px]" />}>
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
  // The wallet under inspection follows you across tabs. Losing it on every
  // navigation is the fastest way to make a tool feel broken.
  const wallet = params.get('wallet') || params.get('address') || '';

  return (
    <div className="mx-auto flex w-full max-w-app items-stretch px-2 py-2">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const key = item.href === '/' ? 'address' : 'wallet';
            const href = wallet ? `${item.href}?${key}=${wallet}` : item.href;
            return (
              <Link
                key={item.href}
                href={href}
                className={`flex-1 rounded-lg py-2 text-center text-[0.6875rem] font-medium transition-colors ${
                  active ? 'bg-bg-elevated text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
    </div>
  );
}
