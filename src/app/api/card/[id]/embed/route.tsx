import { ImageResponse } from 'next/og';
import { readCard, CARD_ID_RE } from '@/lib/cards';
import { cardArt, cardArtEmpty } from '@/lib/cardArt';

export const runtime = 'nodejs';

/**
 * The same card at 3:2, which is the shape a Base App embed expects. Open Graph
 * wants 1.91:1 and Farcaster wants 3:2, so rather than let one of them crop the
 * number off the card, each gets its own render of identical content.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const card = CARD_ID_RE.test(id) ? await readCard(id) : null;
  return new ImageResponse(card ? cardArt(card.figures, { tall: true }) : cardArtEmpty(), {
    width: 1200,
    height: 800,
  });
}
