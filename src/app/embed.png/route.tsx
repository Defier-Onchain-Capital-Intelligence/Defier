import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';

/**
 * The Mini App embed image, at 3:2.
 *
 * og.png is 1.91:1, which is what Open Graph wants and what X shows. A Mini App
 * embed is 3:2, and handing it the wider image gets the sides cropped — the
 * preview in the manifest tool was cutting the first letters off every line.
 * Same words, correct shape, rather than one picture bent to fit two holes.
 */
const SIZE = { width: 1200, height: 800 };

export function GET() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', background: '#08090C', padding: 80,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 18, background: '#3B6EF6',
            fontSize: 38, fontWeight: 700, color: '#fff',
          }}>D</div>
          <span style={{ fontSize: 34, fontWeight: 600, color: '#F7F8FA' }}>DeFier</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <span style={{ fontSize: 74, fontWeight: 600, color: '#F7F8FA', letterSpacing: -2, lineHeight: 1.1 }}>
            Did providing liquidity
          </span>
          <span style={{ fontSize: 74, fontWeight: 600, color: '#3B6EF6', letterSpacing: -2, lineHeight: 1.1 }}>
            actually beat holding?
          </span>
        </div>

        <span style={{ fontSize: 28, color: '#A2A9B8', lineHeight: 1.4, maxWidth: 1000 }}>
          True P&amp;L for your Base positions, reconstructed from every onchain event
          at the price of the day it happened.
        </span>
      </div>
    ),
    { ...SIZE }
  );
}
