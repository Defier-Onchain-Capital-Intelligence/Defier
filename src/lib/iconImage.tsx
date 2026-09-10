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
 */
export const TILE_BLEED = 0.645;
export const TAB_BLEED = 0.86;

export function iconImage(size: number, bleed: number = TILE_BLEED) {
  const mark = Math.round(size * bleed);
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: BRAND.ground,
      }}>
        <img src={markDataUri({ size: mark, compact: true })} width={mark} height={mark} />
      </div>
    ),
    { width: size, height: size },
  );
}
