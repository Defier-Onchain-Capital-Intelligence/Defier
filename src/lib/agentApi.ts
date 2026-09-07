/**
 * The public contract, v1.
 *
 * An agent asking about a wallet gets the engine's own figures, in a shape that
 * is allowed to outlive our internal types. That separation is the point: the
 * screens can be rebuilt and `LifetimeReport` can grow a field without breaking
 * anyone who wired an agent to this.
 *
 * The rule that makes it worth consuming: **no figure travels without its
 * scope**. Every number here sits inside an object that says how much of the
 * wallet it covers and what was left out, because a P&L quoted without knowing
 * it covers three of five positions is worse than no answer — the agent will
 * state it with confidence, and nobody downstream can tell.
 */
import type { LifetimeReport, Portfolio, TokenTotal } from '@/types/portfolio';

export const SCHEMA_VERSION = 'defier.wallet.v1';

export interface WalletV1 {
  schema: typeof SCHEMA_VERSION;
  address: string;
  chain: 'base';
  generatedAt: number;

  /** Read this before quoting anything below it. */
  coverage: {
    /** True only when every position this wallet ever opened was measured. */
    complete: boolean;
    /** The words to use for the period. Never "all time" unless complete. */
    scope: 'all time' | 'partial';
    positionsMeasured: number;
    positionsExcluded: number;
    excluded: Array<{ pair: string; reason: string }>;
    firstPositionAt: number | null;
    /** Set when one position holds 90% or more of the capital behind these figures. */
    concentratedIn: { pair: string; sharePct: number } | null;
    notes: string[];
  };

  capital: {
    deployedUsd: number;      // summed at each deposit's own price
    daysProviding: number;    // days with capital in a pool, overlaps counted once
    positionsOpened: number;
    positionsOpen: number;
  };

  /** Divergence is signed: positive means providing liquidity beat holding. */
  result: {
    divergenceUsd: number;
    vsHoldingUsd: number;     // divergence + earnings - gas
    netPnlUsd: number;
    earnedUsd: number;        // fees AND emissions
    feesUsd: number;
    emissionsUsd: number;
    gasUsd: number;
    beatHoldingCount: number;
    beatHoldingPct: number;
  };

  earnedByToken: {
    fees: Array<{ symbol: string; address: string; amount: number; usd: number }>;
    emissions: Array<{ symbol: string; address: string; amount: number; usd: number }>;
  };

  pairs: Array<{ pair: string; positions: number; capitalUsd: number; vsHoldingUsd: number }>;

  /** Present only when a live portfolio was built alongside the history. */
  exposure: {
    totalUsd: number;
    byClass: Array<{ label: string; valueUsd: number; pct: number }>;
    /** Share not sitting in stablecoins. */
    marketBiasPct: number;
  } | null;
}

const token = (t: TokenTotal) => ({
  symbol: t.symbol, address: t.address, amount: t.amount, usd: t.usd,
});

export function toWalletV1(
  address: string,
  lifetime: LifetimeReport,
  generatedAt: number,
  portfolio: Portfolio | null,
): WalletV1 {
  const c = lifetime.coverage;

  return {
    schema: SCHEMA_VERSION,
    address,
    chain: 'base',
    generatedAt,

    coverage: {
      complete: c.complete,
      scope: c.complete ? 'all time' : 'partial',
      positionsMeasured: lifetime.positionsOpened,
      positionsExcluded: c.positionsExcluded,
      excluded: (c.excluded || []).map((e) => ({ pair: e.pair, reason: e.reason })),
      firstPositionAt: lifetime.firstPositionAt,
      concentratedIn: c.concentrated,
      notes: [
        c.complete
          ? 'Every concentrated liquidity position this wallet opened on Base was measured.'
          : 'Part of this wallet’s history could not be reconstructed, so these figures are a floor.',
        'Basic (non-concentrated) Aerodrome pools are detected but their history is not reconstructed, so they are not in these totals.',
        ...(c.searchIncomplete ? ['The search could not cover the wallet’s full range.'] : []),
      ],
    },

    capital: {
      deployedUsd: lifetime.capitalDeployedUsd,
      daysProviding: lifetime.daysProviding,
      positionsOpened: lifetime.positionsOpened,
      positionsOpen: lifetime.positionsOpen,
    },

    result: {
      divergenceUsd: lifetime.divergenceUsd,
      vsHoldingUsd: lifetime.vsHoldingUsd,
      netPnlUsd: lifetime.netPnlUsd,
      earnedUsd: lifetime.earnedUsd,
      feesUsd: lifetime.feesClaimedUsd + lifetime.feesUnclaimedUsd,
      emissionsUsd: lifetime.rewardsClaimedUsd + lifetime.rewardsPendingUsd,
      gasUsd: lifetime.gasUsd,
      beatHoldingCount: lifetime.beatHoldCount,
      beatHoldingPct: lifetime.beatHoldPct,
    },

    earnedByToken: {
      fees: (lifetime.feesByToken || []).map(token),
      emissions: (lifetime.rewardsByToken || []).map(token),
    },

    pairs: (lifetime.pairs || []).map((p) => ({
      pair: p.pair,
      positions: p.positions,
      capitalUsd: p.capitalUsd,
      vsHoldingUsd: p.vsHoldUsd,
    })),

    exposure: portfolio
      ? {
          totalUsd: portfolio.exposure.totalUsd,
          byClass: portfolio.exposure.byClass.map((s) => ({
            label: s.label, valueUsd: s.valueUsd, pct: s.pct,
          })),
          marketBiasPct: portfolio.exposure.marketBiasPct,
        }
      : null,
  };
}
