import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';
const SIZE = { width: 1200, height: 630 };

/**
 * Social card. Leads with the question the product answers, because a link
 * preview gets about one second of attention and a logo spends it badly.
 */
export function GET() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', background: '#08090C', padding: 72,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: 16, background: '#3B6EF6',
            fontSize: 34, fontWeight: 700, color: '#fff',
          }}>D</div>
          <span style={{ fontSize: 30, fontWeight: 600, color: '#F7F8FA' }}>DeFier</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span style={{ fontSize: 68, fontWeight: 600, color: '#F7F8FA', letterSpacing: -2, lineHeight: 1.1 }}>
            Did providing liquidity
          </span>
          <span style={{ fontSize: 68, fontWeight: 600, color: '#3B6EF6', letterSpacing: -2, lineHeight: 1.1 }}>
            actually beat holding?
          </span>
        </div>

        <span style={{ fontSize: 26, color: '#A2A9B8', lineHeight: 1.4 }}>
          True P&amp;L for your Base positions, reconstructed from every onchain event
          at the price of the day it happened.
        </span>
      </div>
    ),
    { ...SIZE }
  );
}
