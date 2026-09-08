import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Mini App manifest, served from /.well-known/farcaster.json.
 *
 * This is what lets DeFier open inside Base App as a native mini app rather than
 * as a link out to a browser. It is served from a route rather than a static file
 * so the URL follows the deployment instead of being hardcoded in three places.
 *
 * accountAssociation is signed by the domain owner in Base's manifest tool and
 * pasted in as environment variables. Without it the app still runs; it just is
 * not verified as belonging to us, which is the correct default for a domain we
 * have not claimed yet.
 */
export async function GET() {
  const base = APP_URL.replace(/\/$/, '');

  const accountAssociation = process.env.FARCASTER_HEADER
    && process.env.FARCASTER_PAYLOAD
    && process.env.FARCASTER_SIGNATURE
    ? {
        header: process.env.FARCASTER_HEADER,
        payload: process.env.FARCASTER_PAYLOAD,
        signature: process.env.FARCASTER_SIGNATURE,
      }
    : undefined;

  // The spec renamed this key to `miniapp` and kept `frame` for backward
  // compatibility. Different hosts read different ones, and the cost of getting
  // it wrong is a listing that silently never appears, so both are emitted with
  // the same content.
  const miniapp = {
      version: '1',
      name: 'DeFier',
      subtitle: 'Onchain capital intelligence',
      description: 'Find out whether providing liquidity actually beat holding the same tokens, reconstructed from every onchain event at the price of the day it happened.',
      iconUrl: `${base}/icon.png`,
      // The embed wants 3:2 and Open Graph wants 1.91:1. Two images rather than
      // one bent to fit both: the tool's preview was cropping the words.
      imageUrl: `${base}/embed.png`,
      buttonTitle: 'Analyse a wallet',
      heroImageUrl: `${base}/og.png`,
      ogImageUrl: `${base}/og.png`,
      splashImageUrl: `${base}/icon.png`,
      splashBackgroundColor: '#08090C',
      homeUrl: base,
      webhookUrl: `${base}/api/webhook`,
      primaryCategory: 'finance',
      tags: ['defi', 'liquidity', 'analytics', 'base', 'stocks'],
      // The brand line is broader than the wedge on purpose: lending and
      // combined strategies are the same question asked of a different position.
      // The report's own wording stays narrow, because that is where the numbers
      // are and a headline may not claim more than the engine measured.
      tagline: 'Did DeFi actually beat holding?',
      ogTitle: 'DeFier',
      ogDescription: 'Know what your capital is actually earning on Base.',
  };

  return NextResponse.json({
    ...(accountAssociation ? { accountAssociation } : {}),
    miniapp,
    frame: miniapp,
  }, {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}
