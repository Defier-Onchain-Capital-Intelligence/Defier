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
  if (received === null && sent === null) return null;
  const ids = new Set([...(received || []), ...(sent || [])].map((t) => t.tokenId));
  return [...ids].map((tokenId) => ({ tokenId }));
}
