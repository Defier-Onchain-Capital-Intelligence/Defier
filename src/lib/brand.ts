/**
 * The mark, in one place.
 *
 * One capital, two futures: a common trunk forks, the upper branch is what the
 * strategy did and the lower one is having held the same tokens. The opening
 * between them is the only number this product exists to report — the logo is
 * the product.
 *
 * It lives here as a function rather than as a committed PNG because three
 * surfaces draw it at three sizes (the app icon, the Open Graph card, the embed)
 * and a binary asset would go out of sync with the palette the first time a
 * token changes.
 *
 * Below roughly 32 pixels the branches need more weight and a shorter reach or
 * they dissolve into grey, which is what `compact` is for.
 */
export const BRAND = {
  accent: '#3B6EF6',
  ink: '#F7F8FA',
  muted: '#565E70',
  ground: '#08090C',
} as const;

/**
 * The drawing's actual ink, inside the 100x100 box it is composed in.
 *
 * The mark sits in a square but does not fill one: it is a fork, so it spans
 * most of the width and only about 60% of the height, and the box carries the
 * empty margin that composition needs. A favicon does not want that margin —
 * 16 pixels is not enough to spend any of them on air — so `tight` crops the
 * viewBox to these bounds and lets the renderer scale the ink itself to fit.
 *
 * Derived from the paths below plus half the stroke width for the round caps,
 * so they move together: change a path and change these.
 */
const INK_BOUNDS = {
  compact: { x: 6, y: 20, w: 86, h: 60 },
  full:    { x: 4, y: 18, w: 92, h: 64 },
};

export function markSvg({ size = 512, compact = false, tight = false }: {
  size?: number; compact?: boolean; tight?: boolean;
} = {}): string {
  const w = compact ? 16 : 12;
  const paths = compact
    ? [
        `<path d="M14 50 H40" stroke="${BRAND.ink}"/>`,
        `<path d="M40 50 C 56 50, 62 36, 84 28" stroke="${BRAND.accent}"/>`,
        `<path d="M40 50 C 56 50, 62 64, 84 72" stroke="${BRAND.muted}"/>`,
      ]
    : [
        `<path d="M10 50 H40" stroke="${BRAND.ink}"/>`,
        `<path d="M40 50 C 58 50, 66 34, 90 24" stroke="${BRAND.accent}"/>`,
        `<path d="M40 50 C 58 50, 66 66, 90 76" stroke="${BRAND.muted}"/>`,
      ];

  const b = INK_BOUNDS[compact ? 'compact' : 'full'];
  const viewBox = tight ? `${b.x} ${b.y} ${b.w} ${b.h}` : '0 0 100 100';

  // A square output around a wider-than-tall viewBox: the default meet keeps
  // the proportions and centres what is left over, so the mark grows to the
  // full width instead of being stretched to fill the height.
  return `<svg viewBox="${viewBox}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`
    + `<g fill="none" stroke-width="${w}" stroke-linecap="round">${paths.join('')}</g></svg>`;
}

/** Satori draws an <img>, not an inline <svg>, so the mark travels as a data URI. */
export function markDataUri(opts?: { size?: number; compact?: boolean; tight?: boolean }): string {
  return `data:image/svg+xml;base64,${Buffer.from(markSvg(opts)).toString('base64')}`;
}
