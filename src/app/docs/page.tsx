import type { Metadata } from 'next';
import Link from 'next/link';
import { DOCS } from '@/lib/docs';

export const metadata: Metadata = {
  title: 'Documentation · DeFier',
  description: 'How DeFier is built, what it measures, what it refuses to estimate, and how to read it from an agent.',
};

/**
 * The documentation index.
 *
 * The order is the order somebody evaluating this project actually needs: what
 * it measures before how it is built, because the second only matters if the
 * first is honest.
 */
export default function DocsIndex() {
  return (
    <div className="space-y-8 pt-4">
      <header>
        <p className="label">Documentation</p>
        <h1 className="mt-2 text-[1.75rem] font-semibold leading-tight tracking-tight">
          Onchain capital intelligence on Base
        </h1>
        <p className="muted mt-3 leading-relaxed">
          DeFier answers one question — did providing liquidity beat holding the same tokens —
          by rebuilding every position from onchain events and valuing each amount at the price
          of the day it happened. It is read only: it never builds a transaction and never asks
          for a signature.
        </p>
      </header>

      <div className="space-y-3">
        {DOCS.map((d) => (
          <Link
            key={d.slug}
            href={`/docs/${d.slug}`}
            className="block rounded-xl2 border border-bg-border bg-bg-surface p-4 transition-colors hover:bg-bg-elevated"
          >
            <p className="font-medium text-ink-primary">{d.title}</p>
            <p className="muted mt-1 text-[0.8125rem] leading-relaxed">{d.blurb}</p>
          </Link>
        ))}
        <Link
          href="/docs/api"
          className="block rounded-xl2 border border-bg-border bg-bg-surface p-4 transition-colors hover:bg-bg-elevated"
        >
          <p className="font-medium text-ink-primary">API for agents</p>
          <p className="muted mt-1 text-[0.8125rem] leading-relaxed">
            One endpoint, every figure carrying its own coverage scope. OpenAPI and reading rules
            for a model that arrives without one.
          </p>
        </Link>
      </div>

      <div className="rounded-xl2 border border-bg-border bg-bg-surface p-4">
        <p className="label">The rule everything follows</p>
        <p className="muted mt-2 text-[0.8125rem] leading-relaxed">
          A figure that cannot be measured is excluded and said on screen, never estimated. A bad
          number is worse than no number, because somebody acts on it.
        </p>
      </div>

      <p className="text-[0.6875rem] text-ink-muted">
        Source: <a className="text-accent-text underline underline-offset-2" href="https://github.com/Defier-Onchain-Capital-Intelligence/Defier">github.com/Defier-Onchain-Capital-Intelligence/Defier</a>
      </p>
    </div>
  );
}
