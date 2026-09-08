import { ImageResponse } from 'next/og';
import { markDataUri } from '@/lib/brand';

export const dynamic = 'force-static';
// 1024x1024 because that is what the Mini App manifest requires of iconUrl.
// At 512 the manifest is invalid, and the way you find that out is a listing
// that never appears.
const SIZE = { width: 1024, height: 1024 };

/**
 * App icon, generated rather than committed as a binary. One less asset to keep
 * in sync with the design tokens, and it changes when they do.
 *
 * The compact drawing, not the full one: this square ends up as a 40 pixel tile
 * in a Base App listing and as a favicon, and the wide mark loses its branches
 * at that size.
 */
export function GET() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#08090C',
      }}>
        {/* Full bleed: every platform rounds the corners itself, and a mark that
            arrives inside its own rounded card ends up double framed. */}
        <img src={markDataUri({ size: 660, compact: true })} width={660} height={660} />
      </div>
    ),
    { ...SIZE }
  );
}
