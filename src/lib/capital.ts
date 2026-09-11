/**
 * "Total capital analysed": how much real capital has been put through the
 * engine, summed across every wallet it has ever reconstructed.
 *
 * It is the honest traction metric for a product like this. Page views measure
 * curiosity; this measures capital, which is the thing that would have to be
 * true for the product to matter.
 *
 * It used to record the wallet's CURRENT portfolio value, and on the landing
 * page that read as nineteen dollars across four wallets. Not a bug in the sum:
 * a wallet whose positions are all closed holds nothing today, however much went
 * through it. What the phrase means, and what the engine already computes, is
 * capital DEPLOYED, valued at the price of each deposit's own day. One of those
 * four wallets deployed nine thousand dollars.
 *
 * Current value is kept as the fallback for a call that has no lifetime report
 * to hand, and the larger of the two wins so a re-analysis can only raise the
 * figure, never quietly lower it.
 *
 * The address itself is not stored. This table counts wallets, sums capital and
 * must not count the same wallet twice, and a keyed hash does all three without
 * keeping a permanent list of addresses that includes every wallet a visitor
 * ever pasted in to look at somebody else's.
 */
import type { Portfolio } from '@/types/portfolio';
import { getServerSupabase } from './supabase';
import { walletKey } from './walletKey';

/** Never throws and never blocks the response: a failed metric must not fail a portfolio. */
export async function recordWalletSnapshot(
  portfolio: Portfolio,
  lifetime?: { capitalDeployedUsd?: number } | null,
): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) return;

  const deployed = Number(lifetime?.capitalDeployedUsd);
  const current = Number(portfolio.summary?.totalValueUsd);
  const value = Math.max(
    Number.isFinite(deployed) ? deployed : 0,
    Number.isFinite(current) ? current : 0,
  );
  if (!(value > 0)) return;

  const key = walletKey(portfolio.address);
  if (!key) return;

  try {
    const { data: existing } = await supabase
      .from('wallet_snapshots')
      .select('snapshots_count, total_value_usd')
      .eq('wallet_key', key)
      .maybeSingle();

    await supabase.from('wallet_snapshots').upsert({
      wallet_key: key,
      // Never below what this wallet has already been recorded at: the same
      // wallet analysed twice must not make the public total go down.
      total_value_usd: Math.max(value, Number(existing?.total_value_usd) || 0),
      positions_count: portfolio.positions?.length ?? 0,
      last_seen_at: new Date().toISOString(),
      snapshots_count: (existing?.snapshots_count ?? 0) + 1,
    }, { onConflict: 'wallet_key' });
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
