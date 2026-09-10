/**
 * The wallet's borrowing, rolled up for the screens that show it.
 *
 * Health is reported at its worst, not on average. Two positions at 2.4 and at
 * 1.05 are not a wallet at 1.7: the one at 1.05 is the one that gets liquidated,
 * and averaging it away is exactly the kind of comforting summary this product
 * exists not to produce. The protocol behind that worst figure travels with it,
 * because "which one" is the first thing anyone asks next.
 */
import type { LendingPosition, LendingCoverage } from '@/types/portfolio';

export type DebtSummary = {
  hasDebt: boolean;
  totalDebtUsd: number;
  totalCollateralUsd: number;
  netUsd: number;
  /** The lowest health factor across positions that carry debt, or null if none is stateable. */
  worstHealth: number | null;
  worstHealthLabel: string | null;
  /** Positions with debt whose health we could not state. */
  unstatedHealth: string[];
  band: 'safe' | 'watch' | 'risk' | null;
};

/** Aave calls 1.0 liquidation. Below 1.5 is where a normal day's move matters. */
export function healthBand(h: number): 'safe' | 'watch' | 'risk' {
  if (h < 1.15) return 'risk';
  if (h < 1.5) return 'watch';
  return 'safe';
}

export function summariseDebt(lending: LendingPosition[] | undefined): DebtSummary {
  const list = lending || [];
  const totalDebtUsd = list.reduce((a, l) => a + (l.totalDebtUsd || 0), 0);
  const totalCollateralUsd = list.reduce((a, l) => a + (l.totalCollateralUsd || 0), 0);

  let worstHealth: number | null = null;
  let worstHealthLabel: string | null = null;
  const unstatedHealth: string[] = [];

  for (const l of list) {
    if (!(l.totalDebtUsd > 0)) continue;
    if (l.healthFactor == null || !Number.isFinite(l.healthFactor)) {
      unstatedHealth.push(l.protocolLabel);
      continue;
    }
    if (worstHealth == null || l.healthFactor < worstHealth) {
      worstHealth = l.healthFactor;
      worstHealthLabel = l.protocolLabel;
    }
  }

  return {
    hasDebt: totalDebtUsd > 0,
    totalDebtUsd,
    totalCollateralUsd,
    netUsd: totalCollateralUsd - totalDebtUsd,
    worstHealth,
    worstHealthLabel,
    unstatedHealth,
    band: worstHealth == null ? null : healthBand(worstHealth),
  };
}

/** One sentence naming what was asked, for the info dot beside any lending figure. */
export function coverageSentence(coverage: LendingCoverage | undefined): string {
  const checked = coverage?.checked || [];
  const notCovered = coverage?.notCovered || [];
  const failed = coverage?.failed || [];

  const parts: string[] = [];
  if (checked.length === 0) {
    parts.push('No lending protocol could be read on this request, so any borrowing is missing here.');
  } else {
    parts.push(`Checked ${list(checked)}.`);
  }
  if (failed.length) parts.push(`${list(failed)} could not be read this time.`);
  if (notCovered.length) parts.push(`${list(notCovered)} is not covered yet, so a position there would not appear.`);
  return parts.join(' ');
}

function list(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
