import { ImageResponse } from 'next/og';
import { readSwapCard, SWAP_CARD_ID_RE } from '@/lib/swapCard';
import { swapCardArt, cardArtEmpty } from '@/lib/cardArt';

export const runtime = 'nodejs';

/** The same card at 3:2, which is the shape a Base App embed expects. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const card = SWAP_CARD_ID_RE.test(id) ? await readSwapCard(id) : null;
  return new ImageResponse(card ? swapCardArt(card.figures, { tall: true }) : cardArtEmpty(), {
    width: 1200,
    height: 800,
  });
}
