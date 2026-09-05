'use client';
import { useEffect, useState } from 'react';
import type { PoolDetail, PoolRow } from '@/types/pool';

function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let live = true;
    setData(null); setError(null);
    fetch(url, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error || `Request failed (${r.status})`);
        return body as T;
      })
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [url]);

  return { data, error };
}

export function usePoolDetail(id: string) {
  return useJson<PoolDetail>(`/api/pool/${encodeURIComponent(id)}`);
}

export function usePoolList(stocksOnly: boolean) {
  return useJson<{ pools: PoolRow[] }>(`/api/pools${stocksOnly ? '?stocks=1' : ''}`);
}
