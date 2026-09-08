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
import type { SwapCardFigures, SwapMomentFigure } from './swapCard';
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
 * Nothing here is a profit and loss.
 *
 * The first version printed one sentence per trade and the sentence was missing
 * the numbers that make a trade legible: what it cost at the time, and what the
 * other side is worth now. A row shows all three at once — the trade, then, now —
 * which a sentence at this size cannot do without becoming a paragraph. The
 * amounts carry no colour: green and red would be a verdict on a decision this
 * card did not observe.
 */
function TradeRow({ m, first }: { m: SwapMomentFigure; first?: boolean }) {
  const date = m.date
    ? new Date(m.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '';
  const money = (n: number) => (n >= 100 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(2)}`);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', marginTop: first ? 0 : 12,
      padding: first ? '20px 24px' : '15px 24px', borderRadius: 16,
      backgroundColor: SURFACE, border: `1px solid ${BORDER}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontSize: first ? 32 : 25, color: INK, fontWeight: 600 }}>
          {`${m.gaveAmount} ${m.gaveSymbol} → ${m.gotAmount} ${m.gotSymbol}`}
        </div>
        <div style={{ fontSize: first ? 20 : 18, color: MUTED }}>{date}</div>
      </div>
      <div style={{ display: 'flex', marginTop: 10 }}>
        <div style={{ fontSize: first ? 22 : 19, color: INK_2 }}>
          {m.tradeThenUsd != null ? `Worth ${money(m.tradeThenUsd)} then` : 'Value then not priceable'}
        </div>
        <div style={{ fontSize: first ? 22 : 19, color: MUTED, marginLeft: 14, marginRight: 14 }}>·</div>
        <div style={{ fontSize: first ? 22 : 19, color: INK_2 }}>
          {`Today ${m.gotSymbol} ${money(m.gotUsdToday)}, ${m.gaveSymbol} ${money(m.gaveUsdToday)}`}
        </div>
      </div>
    </div>
  );
}

export function swapCardArt(f: SwapCardFigures, opts: { tall?: boolean } = {}) {
  const shown = f.moments.slice(0, opts.tall ? 3 : 2);

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: BG, color: INK, padding: 52, fontFamily: 'sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: ACCENT, marginRight: 12 }} />
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 2 }}>DEFIER</div>
        </div>
        <div style={{ fontSize: 20, color: MUTED }}>{`0x…${f.tail}`}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26, flexShrink: 0 }}>
        <div style={{ fontSize: 22, color: MUTED, letterSpacing: 3, textTransform: 'uppercase' }}>
          Trades worth a mention
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18, flexShrink: 0 }}>
        {shown.length > 0
          ? shown.map((m, i) => <TradeRow key={i} m={m} first={i === 0} />)
          : (
            <div style={{ fontSize: 34, color: INK, maxWidth: 1030, lineHeight: 1.3 }}>
              No trade on this wallet moved far enough to be worth a sentence.
            </div>
          )}
      </div>

      <div style={{ display: 'flex', flex: 1 }} />

      <div style={{ display: 'flex', flexShrink: 0, paddingTop: 22, borderTop: `1px solid ${BORDER}` }}>
        <Stat label="Trades read" value={String(f.swapsFound)} />
        <Stat label="Trades priced" value={String(f.swapsPriced)} />
        <Stat label="History" value={f.complete ? 'All time' : 'Partial'} />
      </div>

      <div style={{ display: 'flex', flexShrink: 0, marginTop: 18, fontSize: 19, color: MUTED, maxWidth: 1030, lineHeight: 1.35 }}>
        Both sides at today’s price. Not a profit and loss: it does not follow what the wallet did next.
      </div>
    </div>
  );
}
