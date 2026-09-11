import type { Metadata } from 'next';

/**
 * Titles and descriptions, and the decision about indexing.
 *
 * Ten routes had neither, so they all inherited the site title and read as the
 * same page to a crawler and in a shared link. More importantly, none of them
 * said whether they should be indexed, and the default is yes: a wallet's
 * report was eligible to appear in a search for that address.
 *
 * So the rule is one call. A page about a wallet is never indexed, however
 * public the underlying chain data is. A page about the market is.
 */
export const NO_INDEX = { index: false, follow: false } as const;

export function pageMeta({ title, description, path, wallet = false }: {
  title: string;
  description: string;
  path?: string;
  /** True when the page is about somebody's wallet. */
  wallet?: boolean;
}): Metadata {
  return {
    title: `${title} · DeFier`,
    description,
    ...(wallet
      ? { robots: NO_INDEX }
      : path
        ? { alternates: { canonical: path } }
        : {}),
  };
}
