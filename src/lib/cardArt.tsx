/**
 * The drawing of a share card, once.
 *
 * Two surfaces render it at different shapes — 1200x630 for X and Open Graph,
 * 1200x800 for a Base App embed, which wants 3:2 — and neither may say anything
 * the other does not. So the art lives here and the routes only choose a size.
 *
 * Satori resolves no Tailwind and no class names, so the palette is repeated as
 * literals. It is the same palette as tailwind.config.ts.
 */
import type { CardFigures } from './reportCopy';
import type { SwapCardFigures } from './swapCard';
import { reportHeadline } from './reportCopy';
import { usd, relativeDays } from './format';

const BG = '#08090C';
const SURFACE = '#101218';
const BORDER = '#23262F';
const INK = '#F7F8FA';
const INK_2 = '#A2A9B8';
const MUTED = '#6B7280';
const GAIN = '#34D399';
const LOSS = '#F87171';
const ACCENT = '#3B6EF6';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ fontSize: 20, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 34, color: INK, fontWeight: 600, marginTop: 6 }}>{value}</div>
    </div>
  );
}

/** The fallback: an id that does not exist, or storage that is down. */
export function cardArtEmpty() {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', backgroundColor: BG, color: INK,
      fontFamily: 'sans-serif',
    }}>
      <div style={{ fontSize: 56, fontWeight: 600, letterSpacing: 2 }}>DEFIER</div>
      <div style={{ fontSize: 28, color: INK_2, marginTop: 16 }}>
        What has impermanent loss actually cost you?
      </div>
    </div>
  );
}

/**
 * The card carries the caveat, not just the number. A share graphic that
 * printed "+$2,837" and dropped "97.7% of that is one position" would be the
 * product lying on its own behalf in the one place it travels furthest.
 */
export function cardArt(f: CardFigures, opts: { tall?: boolean } = {}) {
  const h = reportHeadline(f);
  const tone = h.gained ? GAIN : LOSS;

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: BG, color: INK, padding: 56, fontFamily: 'sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: ACCENT, marginRight: 12 }} />
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 2 }}>DEFIER</div>
        </div>
          {/* One text node, not two: Satori wants an explicit display on
              any element with more than one child. */}
          <div style={{ fontSize: 20, color: MUTED }}>{`0x\u2026${f.tail}`}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, flexShrink: 0 }}>
        <div style={{ fontSize: 22, color: MUTED, letterSpacing: 3, textTransform: 'uppercase' }}>
          {h.label}
        </div>
        <div style={{ fontSize: 108, fontWeight: 700, color: tone, letterSpacing: -3, marginTop: 4, lineHeight: 1.1 }}>
          {h.display}
        </div>
        <div style={{ fontSize: 25, color: INK_2, marginTop: 12, maxWidth: 980, lineHeight: 1.35 }}>
          {h.across}
        </div>
        {/* The 3:2 embed has room for the sentence that says what the number
            means. The 1.91:1 card does not, and a cramped card is worse than a
            quiet one. Neither shape says anything the other contradicts. */}
        {opts.tall ? (
          <div style={{ fontSize: 27, color: INK, marginTop: 22, maxWidth: 1010, lineHeight: 1.4 }}>
            {h.verdict}
          </div>
        ) : null}
      </div>

      {h.caveat ? (
        <div style={{
          display: 'flex', flexShrink: 0, marginTop: 18, padding: '14px 18px', borderRadius: 14,
          backgroundColor: SURFACE, border: `1px solid ${BORDER}`,
          fontSize: 20, color: INK_2, maxWidth: 1010, lineHeight: 1.3,
        }}>
          {h.caveat}
        </div>
      ) : null}

      <div style={{ display: 'flex', flex: 1 }} />

      <div style={{ display: 'flex', flexShrink: 0, paddingTop: 26, borderTop: `1px solid ${BORDER}` }}>
        <Stat label="Fees and emissions" value={usd(f.earnedUsd)} />
        <Stat label="Capital deployed" value={usd(f.capitalDeployedUsd)} />
        <Stat label="Beat holding" value={`${f.beatHoldCount} of ${f.positionsOpened}`} />
        <Stat label="Providing for" value={relativeDays(f.daysProviding)} />
      </div>

      <div style={{ display: 'flex', flexShrink: 0, marginTop: 22, fontSize: 19, color: MUTED }}>
        Rebuilt from onchain events on Base, including positions whose NFT was burned.
      </div>
    </div>
  );
}

/**
 * The trades card.
 *
 * A different claim from the report card and it must not be mistaken for it.
 * Nothing here is a profit and loss: each line is a trade the wallet made and
 * what those two amounts are worth today, which is why the footer says so in
 * words rather than leaving the reader to assume. The largest figure on the card
 * is an amount, never a gain or a loss, and it carries no colour that would read
 * as a verdict.
 */
export function swapCardArt(f: SwapCardFigures, opts: { tall?: boolean } = {}) {
  const first = f.moments[0];
  const rest = f.moments.slice(1, opts.tall ? 3 : 2);

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: BG, color: INK, padding: 56, fontFamily: 'sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: ACCENT, marginRight: 12 }} />
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 2 }}>DEFIER</div>
        </div>
        <div style={{ fontSize: 20, color: MUTED }}>{`0x…${f.tail}`}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 30, flexShrink: 0 }}>
        <div style={{ fontSize: 22, color: MUTED, letterSpacing: 3, textTransform: 'uppercase' }}>
          Trades worth a mention
        </div>
        <div style={{ fontSize: first && first.headline.length > 120 ? 36 : 42, color: INK, fontWeight: 600, marginTop: 12, maxWidth: 1030, lineHeight: 1.28 }}>
          {first ? first.headline : 'No trade on this wallet moved far enough to be worth a sentence.'}
        </div>
      </div>

      {rest.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22, flexShrink: 0 }}>
          {rest.map((m, i) => (
            <div key={i} style={{
              display: 'flex', marginTop: i === 0 ? 0 : 10, padding: '13px 18px', borderRadius: 14,
              backgroundColor: SURFACE, border: `1px solid ${BORDER}`,
              fontSize: 21, color: INK_2, maxWidth: 1030, lineHeight: 1.3,
            }}>
              {m.headline}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', flex: 1 }} />

      <div style={{ display: 'flex', flexShrink: 0, paddingTop: 24, borderTop: `1px solid ${BORDER}` }}>
        <Stat label="Trades read" value={String(f.swapsFound)} />
        <Stat label="Trades priced" value={String(f.swapsPriced)} />
        <Stat label="History" value={f.complete ? 'All time' : 'Partial'} />
      </div>

      <div style={{ display: 'flex', flexShrink: 0, marginTop: 20, fontSize: 19, color: MUTED, maxWidth: 1030, lineHeight: 1.35 }}>
        Both sides valued at today’s price. Not a profit and loss: it does not follow what the wallet did next.
      </div>
    </div>
  );
}
