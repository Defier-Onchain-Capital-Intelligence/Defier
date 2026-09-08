/**
 * The public documentation, read from the repository's own markdown.
 *
 * Deliberately not a second copy in a separate tool. Documentation that lives
 * beside the code is documentation that goes out with the code: a page cannot
 * describe an engine that changed three deploys ago, because the same commit
 * moves both. The cost is that we render markdown ourselves, which is a small
 * price for never having to remember to update a second place.
 *
 * The pages are built statically, so the markdown is read at build time and the
 * files never need to exist on the server.
 */
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

export interface DocPage {
  slug: string;
  file: string;
  title: string;
  blurb: string;
}

/** The map is explicit: a slug can only reach a file named here. */
export const DOCS: DocPage[] = [
  {
    slug: 'architecture',
    file: 'ARCHITECTURE.md',
    title: 'Architecture',
    blurb: 'How it is built, and the things about Base the code has to know. Each of those was a bug before it was a paragraph.',
  },
  {
    slug: 'measurement',
    file: 'MEASUREMENT.md',
    title: 'What we measure',
    blurb: 'What is measured, what is declared instead of estimated, and what is not claimed at all.',
  },
  {
    slug: 'roadmap',
    file: 'ROADMAP.md',
    title: 'Roadmap',
    blurb: 'Status by what the code does today, not by what is planned.',
  },
  {
    slug: 'security',
    file: 'SECURITY.md',
    title: 'Security',
    blurb: 'Read only by design: no signature, no transaction, no seed phrase. Where the keys live and where they must never go.',
  },
];

export function docBySlug(slug: string): DocPage | undefined {
  return DOCS.find((d) => d.slug === slug);
}

/** Markdown to HTML at build time. The source is our own repository, not user input. */
export function renderDoc(doc: DocPage): string {
  const raw = fs.readFileSync(path.join(process.cwd(), doc.file), 'utf8');
  return marked.parse(raw, { async: false }) as string;
}
