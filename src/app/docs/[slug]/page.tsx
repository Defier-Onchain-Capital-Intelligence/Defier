import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DOCS, docBySlug, renderDoc } from '@/lib/docs';
import { API_DOC } from '@/lib/apiDoc';

export function generateStaticParams() {
  return [...DOCS.map((d) => ({ slug: d.slug })), { slug: 'api' }];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (slug === 'api') return { title: 'API for agents · DeFier', description: API_DOC.blurb };
  const doc = docBySlug(slug);
  if (!doc) return { title: 'Documentation · DeFier' };
  return { title: `${doc.title} · DeFier`, description: doc.blurb };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // The API page is written here rather than in a repository file, because it
  // describes a contract that has to match the route it documents.
  const doc = slug === 'api' ? null : docBySlug(slug);
  if (slug !== 'api' && !doc) notFound();

  const html = doc ? renderDoc(doc) : API_DOC.html;
  const title = doc ? doc.title : 'API for agents';

  return (
    <div className="pt-4">
      <Link href="/docs" className="text-[0.8125rem] text-ink-muted hover:text-ink-secondary">
        ← Documentation
      </Link>
      <article className="docs-prose mt-5" dangerouslySetInnerHTML={{ __html: html }} />
      <p className="mt-10 border-t border-bg-border pt-5 text-[0.6875rem] text-ink-muted">
        {title} · Informational only, not investment advice.
      </p>
    </div>
  );
}
