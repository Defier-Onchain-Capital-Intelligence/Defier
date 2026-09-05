'use client';
/**
 * One way to load a wallet, shared by every screen that reads one.
 *
 * Live state first so the screen is useful in a second, then the historical pass
 * fills in P&L. Waiting for the slow half before showing anything is how a fast
 * product feels slow. Screens that need history to render at all can skip
 * straight to the deep pass.
 */
import { useEffect, useState } from 'react';
import type { Portfolio } from '@/types/portfolio';
import { fetchPortfolio } from '@/lib/api';

export function usePortfolio(address: string, { deep = false } = {}) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    let live = true;
    setData(null); setError(null); setLoadingHistory(true);

    fetchPortfolio(address)
      .then((quick) => { if (live) setData(quick); })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => {
        fetchPortfolio(address, { deep: true })
          .then((full) => { if (live) setData(full); })
          .catch(() => { /* keep the quick view */ })
          .finally(() => { if (live) setLoadingHistory(false); });
      });

    return () => { live = false; };
  }, [address, deep]);

  return { data, error, loadingHistory };
}
