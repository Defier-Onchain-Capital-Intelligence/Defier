/**
 * The words the report and the share card both use.
 *
 * A card that phrased the same result more flatteringly than the screen it came
 * from would be marketing, not a report. So the headline, the scope and the
 * caveat are written once, here, and the two surfaces render the same strings.
 *
 * `CardFigures` is the small subset of the lifetime report a card actually
 * draws. It is what gets stored, so it is also the contract: anything not in
 * this shape cannot appear on a card.
 */
import type { LifetimeReport } from '@/types/portfolio';
import { usd, dateOf } from './format';

export interface CardFigures {
  v: 1;
  /** Last four characters of the address. Identifies nothing. */
  tail: string;
  generatedAt: number;

  divergenceGainUsd: number;
  impermanentLossUsd: number;
  earnedUsd: number;
  gasUsd: number;
  vsHoldingUsd: number;
  feesCoverIl: number | null;

  positionsOpened: number;
  beatHoldCount: number;
  beatHoldPct: number;
  capitalDeployedUsd: number;
  daysProviding: number;
  firstPositionAt: number | null;

  complete: boolean;
  concentrated: { pair: string; sharePct: number } | null;
}

/** Everything a card may show, taken from the engine's output and nowhere else. */
export function figuresFrom(l: LifetimeReport, tail: string, generatedAt: number): CardFigures {
  return {
    v: 1,
    tail,
    generatedAt,
    divergenceGainUsd: l.divergenceGainUsd,
    impermanentLossUsd: l.impermanentLossUsd,
    earnedUsd: l.earnedUsd,
    gasUsd: l.gasUsd,
    vsHoldingUsd: l.vsHoldingUsd,
    feesCoverIl: l.feesCoverIl,
    positionsOpened: l.positionsOpened,
    beatHoldCount: l.beatHoldCount,
    beatHoldPct: l.beatHoldPct,
    capitalDeployedUsd: l.capitalDeployedUsd,
    daysProviding: l.daysProviding,
    firstPositionAt: l.firstPositionAt,
    complete: l.coverage.complete,
    concentrated: l.coverage.concentrated,
  };
}

type HeadlineInput = Pick<
  CardFigures,
  'divergenceGainUsd' | 'impermanentLossUsd' | 'feesCoverIl'
  | 'positionsOpened' | 'firstPositionAt' | 'complete' | 'concentrated'
>;

export interface Headline {
  /** Divergence went the wallet's way. */
  gained: boolean;
  /** 'all time' only when the search actually covered the wallet's whole history. */
  scope: string;
  label: string;
  value: number;
  display: string;
  verdict: string;
  across: string;
  /** The uncomfortable sentence. Present whenever it is true, on every surface. */
  caveat: string | null;
}

/**
 * Divergence has two directions and only one of them has a famous name. A pool
 * that converted into the side that fell less leaves you AHEAD of holding, and
 * reporting that as "no impermanent loss" throws away the more interesting half
 * of what actually happened.
 */
export function reportHeadline(f: HeadlineInput): Headline {
  const gained = f.divergenceGainUsd > 0;

  // "All time" is a claim. We make it only when the search covered everything;
  // otherwise the label names the real scope.
  const scope = f.complete
    ? 'all time'
    : f.firstPositionAt ? `since ${dateOf(f.firstPositionAt)}` : 'so far';

  const value = gained ? f.divergenceGainUsd : f.impermanentLossUsd;
  const covered = f.feesCoverIl;

  const verdict = gained
    ? 'Providing liquidity left you ahead of simply holding, before fees. '
      + 'The pool converted towards whichever side was falling less.'
    : f.impermanentLossUsd <= 0
      ? 'Your positions never diverged from simply holding.'
      : covered != null && covered >= 1
        ? `Your fees covered it ${covered.toFixed(1)}x over.`
        : 'The fees did not cover it.';

  const noun = f.positionsOpened === 1 ? 'position' : 'positions';
  const since = f.complete && f.firstPositionAt ? `, since ${dateOf(f.firstPositionAt)}` : '';

  const caveat = f.concentrated
    ? `${f.concentrated.sharePct >= 100 ? 'All' : `${f.concentrated.sharePct.toFixed(1)}%`}`
      + ` of the capital behind this figure is one position, ${f.concentrated.pair}.`
    : !f.complete
      ? 'Part of this wallet’s history could not be reconstructed, so this is a floor.'
      : null;

  return {
    gained,
    scope,
    label: gained ? `Divergence, ${scope}` : `Impermanent loss, ${scope}`,
    value,
    display: `${gained ? '+' : ''}${usd(value)}`,
    verdict,
    across: `Across ${f.positionsOpened} ${noun} we could measure completely${since}`,
    caveat,
  };
}

/** The text posted alongside the card. Never the address, at most the last four. */
export function shareText(f: HeadlineInput & Pick<CardFigures, 'earnedUsd'>): string {
  const scope = f.complete
    ? 'every liquidity position I have ever opened on Base'
    : `${f.positionsOpened} of my liquidity positions on Base`;
  const earned = usd(f.earnedUsd);

  if (f.divergenceGainUsd > 0) {
    return `I rebuilt ${scope}.\n\n`
      + `Impermanent loss cost me nothing: divergence went my way by ${usd(f.divergenceGainUsd)} `
      + `across ${f.positionsOpened} positions, plus ${earned} in fees.\n\n`
      + `Almost no LP knows this number for their own wallet.`;
  }

  if (f.impermanentLossUsd <= 0) {
    return `I checked ${scope}.\n\n`
      + `Earned ${earned} in fees and emissions, with no divergence from holding.\n\n`
      + `Most LPs have never seen this number for their own wallet.`;
  }

  const covered = f.feesCoverIl;
  const verdict = covered != null && covered >= 1
    ? `My fees covered it ${covered.toFixed(1)}x over.`
    : 'My fees did not cover it.';

  return `Impermanent loss has cost me ${usd(f.impermanentLossUsd)} on Base.\n\n`
    + `${verdict} ${earned} earned across ${f.positionsOpened} positions.\n\n`
    + `Almost no LP knows this number for their own wallet. I found mine in about a minute.`;
}
