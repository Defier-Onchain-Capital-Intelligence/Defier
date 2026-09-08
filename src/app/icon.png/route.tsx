import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
// 1024x1024 because that is what the Mini App manifest requires of iconUrl.
// At 512 the manifest is invalid, and the way you find that out is a listing
// that never appears.
const SIZE = { width: 1024, height: 1024 };

/**
 * App icon, generated rather than committed as a binary. One less asset to keep
 * in sync with the design tokens, and it changes when they do.
 */
export function GET() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#08090C',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 600, height: 600, borderRadius: 144,
          background: 'linear-gradient(140deg, #3B6EF6 0%, #2E58D0 100%)',
          fontSize: 380, fontWeight: 700, color: '#F7F8FA',
          letterSpacing: -16,
        }}>
          D
        </div>
      </div>
    ),
    { ...SIZE }
  );
}
