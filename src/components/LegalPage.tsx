/**
 * Privacy and Terms, rendered from the repository's own markdown.
 *
 * Same reasoning as the product docs: a policy that lives in a separate tool
 * describes whatever the product was doing when someone last remembered to
 * update it. Here the page and the behaviour it describes move in the same
 * commit, and the file's history is public.
 *
 * Static, unlike almost every other page in the app. A policy does not depend
 * on a wallet, and a legal page that cannot be served when the database is
 * down is a legal page that is missing exactly when someone came looking.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { legalBySlug, renderDoc } from '@/lib/docs';

export function legalMetadata(slug: string): Metadata {
  const doc = legalBySlug(slug);
  if (!doc) return { title: 'DeFier' };
  return {
    title: `${doc.title} · DeFier`,
    description: doc.blurb,
    alternates: { canonical: `/${doc.slug}` },
  };
}

export function LegalPage({ slug }: { slug: string }) {
  const doc = legalBySlug(slug);
  if (!doc) return null;
  const html = renderDoc(doc);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10">
      <Link href="/" className="text-[0.8125rem] text-ink-muted hover:text-ink-secondary">
        ← DeFier
      </Link>
      <article className="docs-prose mt-6" dangerouslySetInnerHTML={{ __html: html }} />
      <p className="mt-10 flex gap-4 border-t border-bg-border pt-6 text-[0.8125rem] text-ink-muted">
        <Link href="/privacy" className="hover:text-ink-secondary">Privacy</Link>
        <Link href="/terms" className="hover:text-ink-secondary">Terms</Link>
        <Link href="/docs/measurement" className="hover:text-ink-secondary">What we measure</Link>
      </p>
    </div>
  );
}
