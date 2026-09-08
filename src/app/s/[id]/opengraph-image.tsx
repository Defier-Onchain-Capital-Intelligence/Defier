import { ImageResponse } from 'next/og';
import { readSwapCard, SWAP_CARD_ID_RE } from '@/lib/swapCard';
import { swapCardArt, cardArtEmpty } from '@/lib/cardArt';

export const runtime = 'nodejs';
export const alt = 'A DeFier trades card: what one Base wallet swapped, valued at today’s prices.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = SWAP_CARD_ID_RE.test(id) ? await readSwapCard(id) : null;
  return new ImageResponse(card ? swapCardArt(card.figures) : cardArtEmpty(), size);
}
