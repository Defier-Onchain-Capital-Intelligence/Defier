/**
 * One cached copy of DeFiLlama's pool list, shared by the ranking and the pool
 * detail. Fetching the whole list twice for two screens that describe the same
 * pools is how a product ends up disagreeing with itself.
 */
export type LlamaPool = {
  pool: string; chain: string; project: string; symbol: string;
  tvlUsd: number; apy: number | null; apyBase: number | null; apyReward: number | null;
  apyBase7d: number | null; apyMean30d: number | null;
  volumeUsd1d: number | null; volumeUsd7d?: number | null;
  underlyingTokens: string[] | null; poolMeta: string | null;
};

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; pools: LlamaPool[] } | null = null;
let inflight: Promise<LlamaPool[]> | null = null;

const ALLOWED = new Set(['aerodrome-slipstream', 'aerodrome-v1', 'uniswap-v3']);

async function load(): Promise<LlamaPool[]> {
  const res = await fetch('https://yields.llama.fi/pools', { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`yields ${res.status}`);
  const json = await res.json();
  return (json.data as LlamaPool[])
    .filter((p) => p.chain === 'Base' && ALLOWED.has(p.project) && (p.tvlUsd ?? 0) > 25_000);
}

export async function getBasePools(): Promise<LlamaPool[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.pools;
  // Collapse concurrent misses into one upstream request.
  if (!inflight) {
    inflight = load()
      .then((pools) => { cache = { at: Date.now(), pools }; return pools; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export async function findBasePool(id: string): Promise<LlamaPool | null> {
  const pools = await getBasePools();
  return pools.find((p) => p.pool === id) ?? null;
}
