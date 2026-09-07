import { ImageResponse } from 'next/og';
import { readCard, CARD_ID_RE } from '@/lib/cards';
import { cardArt, cardArtEmpty } from '@/lib/cardArt';

export const runtime = 'nodejs';
export const alt = 'A DeFier report card: what impermanent loss actually cost one wallet on Base.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = CARD_ID_RE.test(id) ? await readCard(id) : null;
  return new ImageResponse(card ? cardArt(card.figures) : cardArtEmpty(), size);
}
