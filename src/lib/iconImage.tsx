/**
 * The square icon, at whatever size the surface needs.
 *
 * Three surfaces want this drawing and each wants it a different size: the Mini
 * App manifest requires 1024, a browser tab renders it at 16, and iOS wants 180
 * for a home screen tile. Generating them from one function keeps them from
 * drifting, and keeps the palette in brand.ts rather than inside three binaries.
 *
 * Always the compact drawing. Every one of these ends up small somewhere, and
 * below roughly 32 pixels the wide mark's branches dissolve into grey.
 */
import { ImageResponse } from 'next/og';
import { markDataUri, BRAND } from '@/lib/brand';

/**
 * How much of the square the mark fills.
 *
 * An app tile keeps room around the drawing because every platform rounds the
 * corners itself and crops as it pleases. A browser tab does neither: it paints
 * 16 pixels, and the same margin that reads as composure at 180 reads as a
 * speck at 16. So the tab gets a tighter crop, which is a difference in the
 * rendering, not in the mark.
 *
 * Tighter, not edge to edge. At 0.94 the ink touched the sides and the icon
 * read as cropped rather than as bold; a tenth of the square on either side is
 * enough to look deliberate, and still well above the 56% the mark covered
 * before any of this.
 */
export const TILE_BLEED = 0.645;
export const TAB_BLEED = 0.8;

/**
 * How round the dark square is, as a fraction of its side.
 *
 * Only the tab icon gets this. Every app platform masks the icon into its own
 * shape, so a tile that arrives already rounded is rounded twice and ends up
 * with a visible dark corner inside the platform's curve. A browser tab masks
 * nothing and paints the square exactly as given, which is why the favicon has
 * to carry its own corners and the 1024 tile must not.
 *
 * 0.22 is roughly what iOS and the app stores use, and what the icons sitting
 * next to ours in a tab strip already look like.
 */
export const TAB_RADIUS = 0.22;

export function iconImage(size: number, bleed: number = TILE_BLEED, radius: number = 0) {
  // The tab crop also drops the mark's own composition margin, which is where
  // most of the empty space actually was: scaling alone could not reach the
  // edge because the drawing does not fill the box it is composed in.
  const tight = bleed > TILE_BLEED;
  const mark = Math.round(size * bleed);
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: BRAND.ground,
        // Spread, not `borderRadius: undefined`. The renderer reads every style
        // value as a string and calls trim() on it, so a key present and unset
        // crashes the build where an absent key is simply not rounded.
        //
        // Rounded means transparent outside the curve, which is why this is a
        // PNG rather than a square with lighter corners painted on: a favicon
        // sits on whatever colour the browser's tab strip happens to be, and a
        // guessed background is wrong in one of light or dark mode.
        ...(radius > 0 ? { borderRadius: Math.round(size * radius) } : {}),
      }}>
        <img src={markDataUri({ size: mark, compact: true, tight })} width={mark} height={mark} />
      </div>
    ),
    { width: size, height: size },
  );
}
