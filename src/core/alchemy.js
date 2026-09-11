/**
 * core/alchemy.js · Thin wrapper over the Alchemy enhanced APIs we deliberately enabled.
 *
 * Why this exists: finding when a position was opened means finding one ERC721
 * mint that could be anywhere in Base's history. Doing that with eth_getLogs is
 * a scan over tens of millions of blocks, which is slow, burns compute units and
 * still times out. The Transfers API answers the same question in one request
 * because Alchemy already indexed it.
 *
 * Everything here degrades to null rather than throwing. Without ALCHEMY_KEY the
 * callers fall back to chunked eth_getLogs, which still works for recent positions.
 *
 * Server only. ALCHEMY_KEY must never reach the browser (SECURITY.md section 1).
 */
import { ALCHEMY_KEY, HAS_ALCHEMY } from './constants.js';
import { withTimeout } from './providers.js';

const BASE_URL = () => `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

let requestId = 0;

async function rpc(method, params, timeout = 15000) {
  if (!HAS_ALCHEMY) return null;
  try {
    const resp = await withTimeout(fetch(BASE_URL(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    }), timeout);
    const json = await resp.json();
    if (json.error) return null;
    return json.result ?? null;
  } catch (_) {
    return null;
  }
}

/**
 * ERC721 transfers of one contract, filtered by sender or recipient.
 * Pages until exhausted or `max` is reached.
 *
 * @returns {Promise<Array<{tokenId: string, blockNumber: number, txHash: string, from: string, to: string}>|null>}
 *   null means the API was unavailable, which is different from "there were none".
 */
export async function getErc721Transfers({ contractAddress, fromAddress, toAddress, max = 500 }) {
  if (!HAS_ALCHEMY) return null;

  const params = {
    fromBlock: '0x0',
    toBlock: 'latest',
    contractAddresses: [contractAddress],
    category: ['erc721'],
    withMetadata: false,
    excludeZeroValue: false,
    maxCount: '0x3e8',
    order: 'asc',
  };
  if (fromAddress) params.fromAddress = fromAddress;
  if (toAddress) params.toAddress = toAddress;

  const out = [];
  let pageKey;
  let unavailable = true;

  for (let page = 0; page < 5; page++) {
    const result = await rpc('alchemy_getAssetTransfers', [pageKey ? { ...params, pageKey } : params]);
    if (result === null) break;
    unavailable = false;
    for (const t of result.transfers || []) {
      const tokenId = t.erc721TokenId ?? t.tokenId;
      if (!tokenId) continue;
      out.push({
        tokenId: BigInt(tokenId).toString(),
        blockNumber: parseInt(t.blockNum, 16),
        txHash: t.hash,
        from: (t.from || '').toLowerCase(),
        to: (t.to || '').toLowerCase(),
      });
      if (out.length >= max) return out;
    }
    pageKey = result.pageKey;
    if (!pageKey) break;
  }

  return unavailable ? null : out;
}

/**
 * Block where a given position NFT first reached this wallet.
 *
 * Asks only for transfers INTO the wallet and picks the earliest one for this
 * token. It used to also filter on `fromAddress` being the zero address, which
 * reads as "only mints" and is the obvious way to write it — and it returned
 * nothing, because Alchemy does not treat a mint as a transfer from the zero
 * address in that filter. The caller then fell through to scanning eth_getLogs
 * backwards, which reaches roughly 150 days and quietly gave up on anything
 * older. A position minted 164 days ago missed by twelve days and was reported
 * as "could not be rebuilt".
 *
 * Transfers come back in ascending order, so the first hit is the mint whenever
 * the wallet is the original owner, and the acquisition otherwise — which is the
 * right answer either way, since that is when this wallet's history starts.
 *
 * @returns {Promise<{blockNumber: number, txHash: string, isMint: boolean}|null>}
 */
export async function findMintViaTransfers({ contractAddress, wallet, tokenId }) {
  const transfers = await getErc721Transfers({ contractAddress, toAddress: wallet });
  if (!transfers) return null;
  const target = String(tokenId);
  const hits = transfers.filter((t) => t.tokenId === target);
  if (!hits.length) return null;
  const first = hits.reduce((a, b) => (b.blockNumber < a.blockNumber ? b : a));
  return {
    blockNumber: first.blockNumber,
    txHash: first.txHash,
    isMint: first.from === ZERO_ADDR,
  };
}

/**
 * Every position NFT this wallet has ever held, minted or moved.
 * @returns {Promise<Array<{tokenId: string}>|null>}
 */
export async function getEverOwnedTokenIds({ contractAddress, wallet }) {
  const [received, sent] = await Promise.all([
    getErc721Transfers({ contractAddress, toAddress: wallet }),
    getErc721Transfers({ contractAddress, fromAddress: wallet }),
  ]);
  // Either half failing makes the union incomplete, and an incomplete list of
  // "every position this wallet ever held" is worse than no list: the caller
  // treats what it gets as the whole history. It used to return the half that
  // worked. Now a partial answer sends the caller to the log scan instead.
  if (received === null || sent === null) return null;
  const ids = new Set([...received, ...sent].map((t) => t.tokenId));
  return [...ids].map((tokenId) => ({ tokenId }));
}


/**
 * Every ERC-20 this wallet currently holds a non-zero balance of.
 *
 * The entry point for finding AMM positions. Aerodrome's Basic pools issue no
 * NFT — being in one means holding that pool's own ERC-20 — so there is no
 * registry to consult and no token list that would contain them. What the wallet
 * holds IS the position, and this is the only way to enumerate that without
 * knowing every pool address in advance.
 *
 * @returns {Promise<Array<{address: string, balance: string}>|null>}
 */
export async function getErc20Balances({ wallet, max = 400 }) {
  if (!HAS_ALCHEMY) return null;

  const out = [];
  let pageKey;

  for (let page = 0; page < 6; page++) {
    const params = pageKey ? [wallet, 'erc20', { pageKey }] : [wallet, 'erc20'];
    const result = await rpc('alchemy_getTokenBalances', params, 20000);
    if (result === null) return out.length ? out : null;

    for (const b of result.tokenBalances || []) {
      const raw = b.tokenBalance;
      if (!raw || /^0x0*$/.test(raw)) continue;
      out.push({ address: String(b.contractAddress).toLowerCase(), balance: raw });
      if (out.length >= max) return out;
    }

    pageKey = result.pageKey;
    if (!pageKey) break;
  }

  return out;
}

/**
 * ERC-20 transfers of one contract in or out of a wallet.
 * Used to reconstruct an AMM position that has already been fully withdrawn:
 * the LP token is gone, its Transfer history is not.
 */
export async function getErc20Transfers({ contractAddress, wallet, max = 300 }) {
  if (!HAS_ALCHEMY) return null;

  const base = {
    fromBlock: '0x0',
    toBlock: 'latest',
    contractAddresses: [contractAddress],
    category: ['erc20'],
    withMetadata: false,
    excludeZeroValue: true,
    maxCount: '0x3e8',
    order: 'asc',
  };

  const collect = async (direction) => {
    const params = { ...base, ...direction };
    const out = [];
    let pageKey;
    for (let page = 0; page < 4; page++) {
      const result = await rpc('alchemy_getAssetTransfers', [pageKey ? { ...params, pageKey } : params]);
      if (result === null) return null;
      for (const t of result.transfers || []) {
        out.push({
          blockNumber: parseInt(t.blockNum, 16),
          txHash: t.hash,
          from: (t.from || '').toLowerCase(),
          to: (t.to || '').toLowerCase(),
          value: t.value,
        });
        if (out.length >= max) return out;
      }
      pageKey = result.pageKey;
      if (!pageKey) break;
    }
    return out;
  };

  const [received, sent] = await Promise.all([
    collect({ toAddress: wallet }),
    collect({ fromAddress: wallet }),
  ]);
  if (received === null && sent === null) return null;
  return [...(received || []), ...(sent || [])].sort((a, b) => a.blockNumber - b.blockNumber);
}

/**
 * Every ERC-20, native and internal transfer in or out of one wallet.
 *
 * This is the raw material for reconstructing swaps without integrating a single
 * DEX. A swap, from the wallet's point of view, is just a transaction where one
 * asset left and another arrived — which is true on Aerodrome, on Uniswap, on an
 * aggregator, and on whatever launches next month.
 *
 * The three categories matter for different reasons. `erc20` is the common case.
 * `external` catches paying with native ETH, which would otherwise look like a
 * token appearing out of nowhere. `internal` catches ETH coming back — both the
 * proceeds of selling a token for ETH and the refund of an overpaid route, and
 * missing the refund is what would turn a clean swap into an unreadable one.
 *
 * Native ETH is reported under the WETH address, because that is where its price
 * lives, with the symbol kept as ETH so the copy does not claim the user held a
 * wrapper they never touched.
 *
 * A wallet busy enough to exhaust the page budget gets a truncated answer, and
 * `truncated` says so. Reading a partial history and calling it a lifetime is the
 * one failure mode this feature has, so the flag travels to the screen.
 *
 * @returns {Promise<{transfers: Array<{blockNumber:number, txHash:string, ts:string|null,
 *   from:string, to:string, token:string, symbol:string|null, amount:number}>,
 *   truncated: boolean}|null>}
 *   null means the API was unavailable, which is not the same as "there were none".
 */
export async function getAllTransfers({ wallet, max = 3000 }) {
  if (!HAS_ALCHEMY) return null;

  const WETH = '0x4200000000000000000000000000000000000006';
  const base = {
    fromBlock: '0x0',
    toBlock: 'latest',
    category: ['external', 'internal', 'erc20'],
    withMetadata: true,
    excludeZeroValue: true,
    maxCount: '0x3e8',
    order: 'asc',
  };

  const collect = async (direction) => {
    const out = [];
    out.truncated = false;
    let pageKey;
    for (let page = 0; page < 8; page += 1) {
      const params = pageKey ? { ...base, ...direction, pageKey } : { ...base, ...direction };
      const result = await rpc('alchemy_getAssetTransfers', [params], 20000);
      if (result === null) return null;
      for (const t of result.transfers || []) {
        const native = t.category === 'external' || t.category === 'internal';
        const token = native ? WETH : (t.rawContract?.address || '').toLowerCase();
        const amount = Number(t.value);
        // A transfer we cannot size is not a transfer we can reason about. A
        // token with no decimals in the index, or a value too large for a double,
        // is dropped rather than guessed at.
        if (!token || !Number.isFinite(amount) || amount <= 0) continue;
        out.push({
          blockNumber: parseInt(t.blockNum, 16),
          txHash: t.hash,
          ts: t.metadata?.blockTimestamp || null,
          from: (t.from || '').toLowerCase(),
          to: (t.to || '').toLowerCase(),
          token,
          symbol: native ? 'ETH' : (t.asset || null),
          amount,
        });
        if (out.length >= max) { out.truncated = true; return out; }
      }
      pageKey = result.pageKey;
      if (!pageKey) break;
      if (page === 7) out.truncated = true;
    }
    return out;
  };

  const [received, sent] = await Promise.all([
    collect({ toAddress: wallet }),
    collect({ fromAddress: wallet }),
  ]);
  if (received === null && sent === null) return null;
  return {
    transfers: [...(received || []), ...(sent || [])],
    truncated: Boolean(received?.truncated || sent?.truncated),
  };
}
