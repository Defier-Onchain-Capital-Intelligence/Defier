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

export function markSvg({ size = 512, compact = false }: { size?: number; compact?: boolean } = {}): string {
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

  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`
    + `<g fill="none" stroke-width="${w}" stroke-linecap="round">${paths.join('')}</g></svg>`;
}

/** Satori draws an <img>, not an inline <svg>, so the mark travels as a data URI. */
export function markDataUri(opts?: { size?: number; compact?: boolean }): string {
  return `data:image/svg+xml;base64,${Buffer.from(markSvg(opts)).toString('base64')}`;
}
