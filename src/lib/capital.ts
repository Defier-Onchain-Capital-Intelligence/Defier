/**
 * "Total capital analyzed": the sum of portfolio value across every wallet the
 * engine has ever reconstructed.
 *
 * It is the honest traction metric for a product like this. Page views measure
 * curiosity; this measures how much real capital has been put through the
 * engine, which is the thing that would have to be true for the product to
 * matter.
 */
import type { Portfolio } from '@/types/portfolio';
import { getServerSupabase } from './supabase';

/** Never throws and never blocks the response: a failed metric must not fail a portfolio. */
export async function recordWalletSnapshot(portfolio: Portfolio): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) return;

  const value = portfolio.summary?.totalValueUsd;
  if (!Number.isFinite(value) || (value as number) <= 0) return;

  try {
    const { data: existing } = await supabase
      .from('wallet_snapshots')
      .select('snapshots_count')
      .eq('address', portfolio.address)
      .maybeSingle();

    await supabase.from('wallet_snapshots').upsert({
      address: portfolio.address,
      total_value_usd: value,
      positions_count: portfolio.positions?.length ?? 0,
      last_seen_at: new Date().toISOString(),
      snapshots_count: (existing?.snapshots_count ?? 0) + 1,
    }, { onConflict: 'address' });
  } catch (_) {
    // The metric is not load bearing.
  }
}

export type CapitalStats = {
  walletsAnalyzed: number;
  totalCapitalUsd: number;
  lastUpdated: string | null;
};

export async function getCapitalStats(): Promise<CapitalStats | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('get_capital_stats');
    if (error || !data?.[0]) return null;
    return {
      walletsAnalyzed: Number(data[0].wallets_analyzed) || 0,
      totalCapitalUsd: Number(data[0].total_capital_usd) || 0,
      lastUpdated: data[0].last_updated ?? null,
    };
  } catch (_) {
    return null;
  }
}
