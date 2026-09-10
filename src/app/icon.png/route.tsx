import { iconImage } from '@/lib/iconImage';

export const dynamic = 'force-static';

/**
 * App icon, generated rather than committed as a binary. One less asset to keep
 * in sync with the design tokens, and it changes when they do.
 *
 * 1024x1024 because that is what the Mini App manifest requires of iconUrl. At
 * 512 the manifest is invalid, and the way you find that out is a listing that
 * never appears.
 *
 * The tab icon is a separate, much smaller route: see app/favicon.ico.
 */
export function GET() {
  return iconImage(1024);
}
