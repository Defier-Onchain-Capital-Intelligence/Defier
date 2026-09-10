import { iconImage, TAB_BLEED, TAB_RADIUS } from '@/lib/iconImage';

export const dynamic = 'force-static';

/**
 * The tab icon.
 *
 * A browser asks for /favicon.ico on its own, before it has read any markup,
 * and ours answered 404 while a perfectly good mark sat at /icon.png that
 * nothing ever pointed at. The bytes here are a PNG despite the extension,
 * which every current browser accepts, and it keeps the rule the rest of the
 * brand follows: the drawing is generated from the tokens, never committed as
 * a binary that can drift from them.
 *
 * 64, not 1024. A tab renders this at 16 and a bookmark at 32, and shipping a
 * megapixel image to be scaled down to a thumbnail is a page weight nobody sees
 * a benefit from.
 */
export function GET() {
  return iconImage(64, TAB_BLEED, TAB_RADIUS);
}
