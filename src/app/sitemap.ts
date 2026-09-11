import type { MetadataRoute } from 'next';
import { APP_URL } from '@/lib/env';
import { DOCS, LEGAL } from '@/lib/docs';

/**
 * Only pages that mean the same thing to everyone.
 *
 * A sitemap of wallet pages would be a directory of other people's money, and
 * every one of those URLs is excluded in robots anyway. What is left is the
 * part of the site that is genuinely a public resource: the market lists, the
 * calculator, the documentation and the policies.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = APP_URL.replace(/\/$/, '');
  const now = new Date();

  const page = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority,
  });

  return [
    page('/', 1),
    page('/pools', 0.8),
    page('/explore', 0.6),
    page('/stocks', 0.6),
    page('/simulate', 0.7),
    page('/docs', 0.6),
    ...DOCS.map((d) => page(`/docs/${d.slug}`, 0.5)),
    ...LEGAL.map((d) => page(`/${d.slug}`, 0.3)),
  ];
}
