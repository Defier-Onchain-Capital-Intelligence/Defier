/**
 * One place that builds the lifetime report, and one cache in front of it.
 *
 * This module exists because of a rule rather than a refactor. The share card
 * has to carry the same figures the wallet's owner saw on their own screen, and
 * the only way to guarantee that is for both to come from the same call: the
 * client never sends a number, it sends an address, and the server answers with
 * whatever the engine says. A card endpoint that trusted a posted figure would
 * let anyone publish an invented result under our name.
 *
 * A deep build takes over a minute, so a second caller for the same wallet
 * joins the build already running instead of starting another one.
 */
import { buildPortfolio } from '@/core/portfolio.js';
import { computeLifetime } from '@/core/lifetime.js';
import type { LifetimeReport, Portfolio } from '@/types/portfolio';

export interface ReportPayload {
  address: string;
  generatedAt: number;
  lifetime: LifetimeReport;
  warnings: string[];
}

export interface ReportResult {
  data: ReportPayload;
  /** Served from cache: the caller has nothing new to record. */
  cached: boolean;
  /** Only on a fresh build, for callers that record traction numbers. */
  portfolio: Portfolio | null;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 100;

const cache = new Map<string, { at: number; data: ReportPayload }>();
const inflight = new Map<string, Promise<{ data: ReportPayload; portfolio: Portfolio }>>();

/** The cached payload if it is still fresh, else null. No build is started. */
export function peekReport(address: string): ReportPayload | null {
  const hit = cache.get(address);
  if (!hit || Date.now() - hit.at >= CACHE_TTL_MS) return null;
  return hit.data;
}

async function build(address: string) {
  const portfolio: Portfolio = await buildPortfolio(address, { deep: true });
  const lifetime: LifetimeReport = computeLifetime(portfolio.positions, portfolio.historyGap);

  const data: ReportPayload = {
    address,
    generatedAt: Math.floor(Date.now() / 1000),
    lifetime,
    warnings: portfolio.warnings,
  };

  cache.set(address, { at: Date.now(), data });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);

  return { data, portfolio };
}

/**
 * The lifetime report for an address. Always a deep build on a miss: the whole
 * point is the history, and a report that quietly covered only what is open
 * today would be the exact dishonesty this product exists to correct.
 */
export async function getReport(address: string): Promise<ReportResult> {
  const fresh = peekReport(address);
  if (fresh) return { data: fresh, cached: true, portfolio: null };

  let run = inflight.get(address);
  if (!run) {
    run = build(address).finally(() => inflight.delete(address));
    inflight.set(address, run);
  }

  const { data, portfolio } = await run;
  return { data, cached: false, portfolio };
}
