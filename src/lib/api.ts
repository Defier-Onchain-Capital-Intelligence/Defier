/** Client side fetch helpers. Types come from the engine's contract. */
import type { Portfolio, LpPosition } from '@/types/portfolio';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export function fetchPortfolio(address: string, opts: { deep?: boolean } = {}) {
  const query = opts.deep ? '?deep=1' : '';
  return getJson<Portfolio>(`/api/portfolio/${address}${query}`);
}

export function fetchPosition(id: string, wallet: string) {
  return getJson<LpPosition>(`/api/position/${encodeURIComponent(id)}?wallet=${wallet}`);
}

export function fetchStats() {
  return getJson<{ walletsAnalyzed: number; totalCapitalUsd: number; available: boolean }>('/api/stats');
}
