import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
const SIZE = { width: 512, height: 512 };

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
          width: 300, height: 300, borderRadius: 72,
          background: 'linear-gradient(140deg, #3B6EF6 0%, #2E58D0 100%)',
          fontSize: 190, fontWeight: 700, color: '#F7F8FA',
          letterSpacing: -8,
        }}>
          D
        </div>
      </div>
    ),
    { ...SIZE }
  );
}
