'use client';
import { useEffect, useState } from 'react';
import type { LifetimeReport } from '@/types/portfolio';

export type ReportResponse = {
  address: string;
  generatedAt: number;
  lifetime: LifetimeReport;
  warnings: string[];
};

export function useReport(address: string) {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null); setError(null);
    fetch(`/api/report/${address}`, { cache: 'no-store' })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error || `Request failed (${r.status})`);
        return body as ReportResponse;
      })
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [address]);

  return { data, error };
}
