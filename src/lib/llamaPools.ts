/**
 * One cached copy of DeFiLlama's Base data, shared by every screen that reads a
 * yield. Fetching the same ten megabyte list twice for two screens that describe
 * the same chain is how a product ends up disagreeing with itself.
 */
export type LlamaPool = {
  pool: string; chain: string; project: string; symbol: string;
  tvlUsd: number; apy: number | null; apyBase: number | null; apyReward: number | null;
  apyBase7d: number | null; apyMean30d: number | null;
  volumeUsd1d: number | null; volumeUsd7d?: number | null;
  underlyingTokens: string[] | null; poolMeta: string | null;
};

/** One asset in a lending market: what it pays to supply, what it costs to borrow. */
export type LendingMarket = {
  id: string;
  project: string;
  symbol: string;
  tokenAddress: string | null;
  supplyApyPct: number | null;
  supplyRewardApyPct: number | null;
  borrowApyPct: number | null;
  borrowRewardApyPct: number | null;
  /** Net cost of borrowing once incentives are counted. Negative means paid to borrow. */
  netBorrowApyPct: number | null;
  totalSupplyUsd: number | null;
  totalBorrowUsd: number | null;
  /** Share of the market's liquidity already lent out. Above ~95% withdrawals queue. */
  utilisationPct: number | null;
  ltv: number | null;
  borrowable: boolean;
};

const TTL_MS = 10 * 60 * 1000;
let cache: { at: number; all: LlamaPool[] } | null = null;
let inflight: Promise<LlamaPool[]> | null = null;

const DEX = new Set(['aerodrome-slipstream', 'aerodrome-v1', 'uniswap-v3']);
const LENDERS = new Set(['aave-v3', 'moonwell', 'morpho-blue', 'compound-v3']);

async function load(): Promise<LlamaPool[]> {
  const res = await fetch('https://yields.llama.fi/pools', { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`yields ${res.status}`);
  const json = await res.json();
  return (json.data as LlamaPool[]).filter((p) => p.chain === 'Base');
}

async function all(): Promise<LlamaPool[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.all;
  if (!inflight) {
    inflight = load()
      .then((pools) => { cache = { at: Date.now(), all: pools }; return pools; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export async function getBasePools(): Promise<LlamaPool[]> {
  const pools = await all();
  return pools.filter((p) => DEX.has(p.project) && (p.tvlUsd ?? 0) > 25_000);
}

export async function findBasePool(id: string): Promise<LlamaPool | null> {
  const pools = await getBasePools();
  return pools.find((p) => p.pool === id) ?? null;
}

type BorrowRow = {
  pool: string;
  apyBaseBorrow: number | null; apyRewardBorrow: number | null;
  totalSupplyUsd: number | null; totalBorrowUsd: number | null;
  ltv: number | null; borrowable: boolean | null;
};

let borrowCache: { at: number; rows: Map<string, BorrowRow> } | null = null;

/** Borrow side. It lives on its own endpoint, keyed by the same pool id. */
async function borrowRows(): Promise<Map<string, BorrowRow>> {
  if (borrowCache && Date.now() - borrowCache.at < TTL_MS) return borrowCache.rows;
  try {
    const res = await fetch('https://yields.llama.fi/lendBorrow', { next: { revalidate: 600 } });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const list: BorrowRow[] = Array.isArray(json) ? json : (json?.data ?? []);
    const rows = new Map(list.map((r) => [r.pool, r]));
    borrowCache = { at: Date.now(), rows };
    return rows;
  } catch (_) {
    return borrowCache?.rows ?? new Map();
  }
}

/**
 * Lending markets on Base.
 *
 * Both sides of every asset, because the interesting number is rarely one of
 * them alone: what matters when you borrow against something you want to keep is
 * the gap between what the collateral earns and what the debt costs.
 */
export async function getBaseLendingMarkets(project?: string): Promise<LendingMarket[]> {
  const [pools, borrow] = await Promise.all([all(), borrowRows()]);

  return pools
    .filter((p) => LENDERS.has(p.project))
    .filter((p) => !project || p.project === project)
    .filter((p) => (p.tvlUsd ?? 0) > 100_000)
    .map((p) => {
      const b = borrow.get(p.pool);
      const borrowApy = b?.apyBaseBorrow ?? null;
      const borrowReward = b?.apyRewardBorrow ?? null;
      const supplied = b?.totalSupplyUsd ?? p.tvlUsd ?? null;
      const borrowed = b?.totalBorrowUsd ?? null;
      return {
        id: p.pool,
        project: p.project,
        symbol: p.symbol,
        tokenAddress: p.underlyingTokens?.[0]?.toLowerCase() ?? null,
        supplyApyPct: p.apyBase ?? null,
        supplyRewardApyPct: p.apyReward ?? null,
        borrowApyPct: borrowApy,
        borrowRewardApyPct: borrowReward,
        netBorrowApyPct: borrowApy != null ? borrowApy - (borrowReward ?? 0) : null,
        totalSupplyUsd: supplied,
        totalBorrowUsd: borrowed,
        utilisationPct: supplied && supplied > 0 && borrowed != null
          ? (borrowed / supplied) * 100 : null,
        ltv: b?.ltv ?? null,
        borrowable: b?.borrowable ?? false,
      };
    })
    .sort((a, b) => (b.totalSupplyUsd ?? 0) - (a.totalSupplyUsd ?? 0));
}
