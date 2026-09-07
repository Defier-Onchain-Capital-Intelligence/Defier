/**
 * core/history.js · Historical reconstruction of concentrated liquidity positions on Base.
 *
 * Ported from the proven HTML tool (see ../../../fuentes/html_wallet_module_extract_lines3100-3900.js),
 * then extended. The port is deliberate: the formulas and the Aerodrome quirks in that
 * file were debugged against real wallets. Rewriting them from scratch is how a 91%
 * APR turned into 955% once before.
 *
 * What was ported unchanged in spirit:
 *   getStakedPositions step 1  factory.getPool -> voter.gauges -> gauge.stakedValues(wallet)
 *   fetchEntryData             mint Transfer found by backward chunked scan, amounts from the same receipt
 *   fetchCollectedFees         Collect events by tokenId, forward from the mint block
 *   fetchClaimedEmissions      ClaimRewards on the gauge, 2 topic form with a 3 topic fallback
 *
 * What is new here, and why:
 *   1. Token universe widened to tokenized stocks and to tokens the caller has seen.
 *      The HTML probed a fixed list, which is exactly why it never found a WETH/NVDAc position.
 *   2. Multicall3 for the pool lookups. The widened universe is hundreds of calls;
 *      one by one it would take minutes and trip rate limits.
 *   3. A completeness pass over NFPM Transfer logs, so a position in a pool nobody
 *      guessed still shows up.
 *   4. Lookback is no longer capped at 60 days.
 *   5. Every IncreaseLiquidity is collected, not only the first (PNL_SPEC item 1).
 *   6. DecreaseLiquidity, closed positions and gas, none of which existed before.
 *   7. Collect is split into fees and returned principal by matching txHash (PNL_SPEC item 3).
 *
 * @typedef {import('../types/portfolio').PositionEvent} PositionEvent
 */

import { ethers } from 'ethers';
import {
  NFPM_ADDRS, FACTORY_ADDRS, VOTER_ADDRS, DEPLOY_BLOCKS, DEPLOY_BLOCKS_BY_PROTOCOL,
  NFPM_ABI, FACTORY_ABI_AERO, VOTER_ABI,
  MULTICALL3_ADDR, MULTICALL3_ABI, POOL_ABI, POOL_ABI_AERO,
} from './constants.js';
import {
  BASE_TOKENS, TOKENIZED_STOCKS, CL_GAUGE_ABI, CL_TICK_SPACINGS,
  NFPM_EVENTS, GAUGE_EVENTS, BASE_BLOCKS_PER_DAY, AERODROME_CL_DEPLOYMENTS,
} from './constants.base.js';
import { getProvider, getLogsProvider, chunkedGetLogs, withTimeout, batchedRequests } from './providers.js';
import { fetchHistoricalPricesBatch } from './prices.js';
import { findMintViaTransfers, getEverOwnedTokenIds } from './alchemy.js';
import { getTokenInfo } from './scanner.js';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const CHAIN = 'base';

// Tokens that a tokenized stock is realistically quoted against. Pairing all 13
// stocks with all base tokens would quadruple the lookup cost for pools that do
// not exist; anything this heuristic misses is caught by the completeness pass.
const STOCK_QUOTE_TOKENS = [BASE_TOKENS.WETH, BASE_TOKENS.USDC, BASE_TOKENS.cbBTC];

const topic = {
  transfer: ethers.utils.id(NFPM_EVENTS.Transfer),
  increase: ethers.utils.id(NFPM_EVENTS.IncreaseLiquidity),
  decrease: ethers.utils.id(NFPM_EVENTS.DecreaseLiquidity),
  collect:  ethers.utils.id(NFPM_EVENTS.Collect),
  claim2:   ethers.utils.id(GAUGE_EVENTS.ClaimRewards2),
  claim3:   ethers.utils.id(GAUGE_EVENTS.ClaimRewards3),
};

const pad32   = (addrOrHex) => ethers.utils.hexZeroPad(String(addrOrHex).toLowerCase(), 32);
const idTopic = (tokenId)   => ethers.utils.hexZeroPad(ethers.BigNumber.from(tokenId).toHexString(), 32);
const human   = (bn, dec)   => parseFloat(ethers.utils.formatUnits(bn, dec));

// ─── Staked position discovery ────────────────────────────────────────────────

/** Every unordered pair worth probing, given the token universe. */
function buildPairs(coreTokens, stockTokens) {
  const pairs = new Set();
  const add = (a, b) => {
    if (!a || !b || a === b) return;
    pairs.add([a, b].sort().join('|'));
  };
  for (let i = 0; i < coreTokens.length; i++) {
    for (let j = i + 1; j < coreTokens.length; j++) add(coreTokens[i], coreTokens[j]);
  }
  for (const stock of stockTokens) {
    for (const quote of STOCK_QUOTE_TOKENS) add(stock, quote);
  }
  return [...pairs].map((k) => k.split('|'));
}

/** aggregate3 in slices, tolerating per call failure. */
async function multicall(provider, calls, { chunk = 250, timeout = 20000 } = {}) {
  const mc = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, provider);
  const out = [];
  for (let i = 0; i < calls.length; i += chunk) {
    const slice = calls.slice(i, i + chunk);
    try {
      const res = await withTimeout(mc.callStatic.aggregate3(slice), timeout);
      out.push(...res);
    } catch (_) {
      out.push(...slice.map(() => ({ success: false, returnData: '0x' })));
    }
  }
  return out;
}

/**
 * tokenIds this wallet has staked in Aerodrome CL gauges.
 *
 * The NFT is owned by the gauge, not by the wallet, so no amount of looking at
 * the wallet's balance will find these. We go the other way: find the pools,
 * ask the voter for their gauges, ask each gauge what this wallet staked.
 *
 * @param {string} wallet
 * @param {object} [opts]
 * @param {string[]} [opts.extraTokens] tokens seen elsewhere (wallet balances, known positions)
 * @returns {Promise<Array<{tokenId: string, poolAddress: string, gaugeAddress: string}>>}
 */
export async function getStakedTokenIds(wallet, { extraTokens = [], diag = null } = {}) {
  const trace = (step, value) => { if (diag) diag.steps.push({ step, value }); };
  const voterAddr = VOTER_ADDRS['aerodrome']?.[CHAIN];
  if (!voterAddr) return [];

  const provider = await getProvider(CHAIN);

  const core = [...new Set([
    ...Object.values(BASE_TOKENS),
    ...extraTokens.filter(Boolean).map((a) => a.toLowerCase()),
  ])];
  const stocks = Object.values(TOKENIZED_STOCKS).map((s) => s.address);
  const pairs = buildPairs(core, stocks);

  // 1. Pool addresses, across EVERY known Slipstream deployment. Asking only the
  //    original factory is what hid the tokenized stock pools.
  const factoryIface = new ethers.utils.Interface(FACTORY_ABI_AERO);
  const poolCalls = [];
  for (const deployment of AERODROME_CL_DEPLOYMENTS) {
    for (const [a, b] of pairs) {
      for (const spacing of CL_TICK_SPACINGS) {
        poolCalls.push({
          target: deployment.factory,
          allowFailure: true,
          callData: factoryIface.encodeFunctionData('getPool', [a, b, spacing]),
          _deployment: deployment,
        });
      }
    }
  }
  trace('poolLookups', poolCalls.length);
  const poolResults = await multicall(
    provider,
    poolCalls.map(({ target, allowFailure, callData }) => ({ target, allowFailure, callData }))
  );

  /** @type {Map<string, {factory: string, nfpm: string, name: string}>} */
  const deploymentOfPool = new Map();
  poolResults.forEach((r, i) => {
    if (!r.success) return;
    try {
      const [addr] = factoryIface.decodeFunctionResult('getPool', r.returnData);
      if (addr && addr !== ZERO_ADDR) deploymentOfPool.set(addr.toLowerCase(), poolCalls[i]._deployment);
    } catch (_) { /* not a pool */ }
  });
  const pools = [...deploymentOfPool.keys()];

  trace('poolsFound', pools.length);
  if (pools.length === 0) return [];

  // 2. pool -> gauge
  const voterIface = new ethers.utils.Interface(VOTER_ABI);
  const gaugeResults = await multicall(provider, pools.map((pool) => ({
    target: voterAddr,
    allowFailure: true,
    callData: voterIface.encodeFunctionData('gauges', [pool]),
  })));

  /** @type {Array<{pool: string, gauge: string, deployment: object}>} */
  const gauges = [];
  gaugeResults.forEach((r, i) => {
    if (!r.success) return;
    try {
      const [addr] = voterIface.decodeFunctionResult('gauges', r.returnData);
      if (addr && addr !== ZERO_ADDR) {
        gauges.push({ pool: pools[i], gauge: addr.toLowerCase(), deployment: deploymentOfPool.get(pools[i]) });
      }
    } catch (_) { /* not a gauge */ }
  });

  trace('gaugesFound', gauges.map((g) => g.gauge));
  if (gauges.length === 0) return [];

  // 3. gauge.stakedValues(wallet). Kept as individual calls: stakedValues returns a
  //    dynamic array, and decoding those through aggregate3 is where this breaks quietly.
  const staked = await batchedRequests(
    gauges,
    async ({ pool, gauge, deployment }) => {
      const gc = new ethers.Contract(gauge, CL_GAUGE_ABI, provider);
      const ids = await withTimeout(gc.stakedValues(wallet), 6000).catch(() => []);
      if (!Array.isArray(ids) || ids.length === 0) return [];

      // Ask the gauge which position manager holds its NFTs instead of assuming.
      // Deployments differ, and an assumption here reads the wrong contract and
      // reverts with "ID", which looks like "the position does not exist".
      const nfpmFromGauge = await withTimeout(gc.nft(), 6000)
        .then((a) => a.toLowerCase())
        .catch(() => null);

      return ids.map((id) => ({
        tokenId: id.toString(),
        poolAddress: pool,
        gaugeAddress: gauge,
        nfpmAddress: nfpmFromGauge || deployment?.nfpm || null,
        factoryAddress: deployment?.factory || null,
      }));
    },
    20,
    50
  );

  const found = staked.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  trace('stakedValuesHits', found.length);
  return found;
}

/**
 * Completeness pass: every tokenId this NFPM ever minted to the wallet or moved
 * out of it, plus who owns it now.
 *
 * Catches the case the pool probing cannot: a position in a pool built from
 * tokens nobody thought to guess.
 *
 * @returns {Promise<Array<{tokenId: string, currentOwner: string|null}>>}
 */
export async function getWalletTokenIdsFromLogs(wallet, protocol = 'aerodrome', nfpmOverride = null) {
  const nfpmAddr = nfpmOverride || NFPM_ADDRS[protocol]?.[CHAIN];
  if (!nfpmAddr) return [];

  const provider = await getProvider(CHAIN);

  // Indexed path first. Scanning every Transfer of the position manager since
  // genesis with eth_getLogs is not something a request can afford.
  let ids = [];
  /** True when we fell back to log scanning and could not cover the full range. */
  let scanIncomplete = false;
  const indexed = await getEverOwnedTokenIds({ contractAddress: nfpmAddr, wallet });
  if (indexed) {
    ids = indexed.map((t) => t.tokenId);
  } else {
    // The fallback path, used only when the indexed API is unavailable.
    //
    // It used to start 180 days back, which quietly capped every wallet's
    // history at six months. A wallet two years deep would be told, with no
    // caveat, that its story began half a year ago. The floor is now the
    // position manager's own deploy block, and when the scan cannot finish that
    // range it says so instead of returning a short list that looks complete.
    const logsProvider = (await getLogsProvider(CHAIN)) || provider;
    const currentBlock = await withTimeout(logsProvider.getBlockNumber(), 8000);
    const fromBlock = DEPLOY_BLOCKS_BY_PROTOCOL[protocol]?.[CHAIN]
      ?? DEPLOY_BLOCKS[CHAIN] ?? 0;
    const walletTopic = pad32(wallet);

    const inReport = {};
    const outReport = {};
    const [inbound, outbound] = await Promise.all([
      chunkedGetLogs(CHAIN, { address: nfpmAddr, topics: [topic.transfer, null, walletTopic] },
        { fromBlock, toBlock: currentBlock, backward: false, collectAll: true, maxResults: 500,
          maxChunks: 900, report: inReport }),
      chunkedGetLogs(CHAIN, { address: nfpmAddr, topics: [topic.transfer, walletTopic, null] },
        { fromBlock, toBlock: currentBlock, backward: false, collectAll: true, maxResults: 500,
          maxChunks: 900, report: outReport }),
    ]);
    scanIncomplete = Boolean(inReport.truncated || outReport.truncated);

    ids = [...new Set([...(inbound || []), ...(outbound || [])]
      .map((log) => (log.topics[3] ? ethers.BigNumber.from(log.topics[3]).toString() : null))
      .filter(Boolean))];
  }

  if (ids.length === 0) return scanIncomplete ? { incomplete: true, items: [] } : [];

  const nfpm = new ethers.Contract(nfpmAddr, NFPM_ABI, provider);
  const owners = await batchedRequests(
    ids,
    async (id) => ({
      tokenId: id,
      nfpmAddress: nfpmAddr.toLowerCase(),
      currentOwner: await withTimeout(nfpm.ownerOf(id), 6000).then((o) => o.toLowerCase()).catch(() => null),
    }),
    15,
    50
  );

  const items = owners.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  return scanIncomplete ? { incomplete: true, items } : items;
}


// ─── Burned positions ─────────────────────────────────────────────────────────

/**
 * Rebuild a position whose NFT no longer exists.
 *
 * Closing a position and burning its NFT deletes the CONTRACT STATE, not the
 * chain. `positions(tokenId)` reverts with "ID" and every scanner on the market
 * treats that as "no such position", which is how a wallet with years of history
 * gets told it has claimed zero fees. The events are all still there.
 *
 * The mint transaction is the key. Its receipt contains the pool's own Mint log,
 * emitted by the pool contract itself, and that log carries the pool address in
 * `address` and the tick bounds in its indexed topics. From the pool we read the
 * pair. After that the position replays like any other.
 */
const POOL_MINT_TOPIC = ethers.utils.id('Mint(address,address,int24,int24,uint128,uint256,uint256)');
const int24Of = (topicHex) => {
  const raw = ethers.BigNumber.from(topicHex).toNumber();
  return raw >= 0x800000 ? raw - 0x1000000 : raw;   // two's complement, 24 bits
};

export async function reconstructBurnedPosition({ protocol = 'aerodrome', tokenId, nfpmAddr, wallet }) {
  const fail = (reason) => ({ ok: false, tokenId: String(tokenId), reason });

  const resolvedNfpm = nfpmAddr || NFPM_ADDRS[protocol]?.[CHAIN];
  if (!resolvedNfpm) return fail('no position manager for this protocol');

  const provider = await getProvider(CHAIN);
  const logsProvider = (await getLogsProvider(CHAIN)) || provider;
  const currentBlock = await withTimeout(logsProvider.getBlockNumber(), 8000);

  const mintLog = await findMintLog(resolvedNfpm, tokenId, wallet, currentBlock, protocol);
  if (mintLog?.incomplete) {
    return fail('the search for its opening transaction did not finish, so this is not a definitive miss');
  }
  if (!mintLog?.transactionHash) return fail('mint transaction not found');

  const receipt = await withTimeout(provider.getTransactionReceipt(mintLog.transactionHash), 12000)
    .catch(() => null);
  if (!receipt?.logs?.length) return fail('mint receipt unavailable');

  const nfpmLower = resolvedNfpm.toLowerCase();
  const isAero = protocol === 'aerodrome';

  // First choice: the pool's own Mint log, which carries the pool address in
  // `address` and the tick bounds in its indexed topics.
  const poolLog = receipt.logs.find((l) =>
    l.topics?.[0] === POOL_MINT_TOPIC && String(l.address).toLowerCase() !== nfpmLower);

  let poolAddress = poolLog ? String(poolLog.address).toLowerCase() : null;
  let tickLower = poolLog?.topics?.[2] != null ? int24Of(poolLog.topics[2]) : null;
  let tickUpper = poolLog?.topics?.[3] != null ? int24Of(poolLog.topics[3]) : null;

  // Fallback: a position opened through a router or a zapper does not
  // necessarily put a recognisable Mint in the receipt. Every other contract
  // that logged in the transaction is a candidate; the pool is whichever one
  // answers token0() and token1(). Slower, and it rescues the cases the clean
  // path drops on the floor.
  if (!poolAddress) {
    const candidates = [...new Set(
      receipt.logs
        .map((l) => String(l.address).toLowerCase())
        .filter((a) => a !== nfpmLower),
    )].slice(0, 12);

    for (const candidate of candidates) {
      try {
        const probe = new ethers.Contract(candidate, isAero ? POOL_ABI_AERO : POOL_ABI, provider);
        const [a, b] = await withTimeout(Promise.all([probe.token0(), probe.token1()]), 6000);
        if (a && b) { poolAddress = candidate; break; }
      } catch (_) { /* not a pool */ }
    }
  }
  if (!poolAddress) return fail('could not identify the pool from the mint transaction');

  const pool = new ethers.Contract(poolAddress, isAero ? POOL_ABI_AERO : POOL_ABI, provider);
  const [addr0, addr1] = await withTimeout(Promise.all([pool.token0(), pool.token1()]), 10000)
    .catch(() => [null, null]);
  if (!addr0 || !addr1) return fail('pool did not answer token0/token1');

  const [token0, token1] = await Promise.all([
    getTokenInfo(provider, addr0).catch(() => null),
    getTokenInfo(provider, addr1).catch(() => null),
  ]);
  if (!token0 || !token1) return fail('token metadata unavailable');

  // A position that was staked earned emissions, and those claims are part of
  // its result. The NFT is gone but the voter still maps pool to gauge, so the
  // link is recoverable and the rebuild is not silently missing income.
  let gaugeAddress = null;
  try {
    const voterAddr = VOTER_ADDRS['aerodrome']?.[CHAIN];
    if (voterAddr && isAero) {
      const voter = new ethers.Contract(voterAddr, VOTER_ABI, provider);
      const g = await withTimeout(voter.gauges(poolAddress), 6000);
      if (g && g !== ethers.constants.AddressZero) gaugeAddress = String(g).toLowerCase();
    }
  } catch (_) { /* no gauge, or the voter did not answer */ }

  return {
    ok: true,
    poolAddress,
    gaugeAddress,
    tickLower,
    tickUpper,
    token0: { address: String(addr0).toLowerCase(), symbol: token0.symbol, decimals: Number(token0.decimals) },
    token1: { address: String(addr1).toLowerCase(), symbol: token1.symbol, decimals: Number(token1.decimals) },
    mintTxHash: mintLog.transactionHash,
  };
}

// ─── Event timeline ───────────────────────────────────────────────────────────

/**
 * Locate the mint of a tokenId. Fast path over the last 60 days first, because
 * most positions are recent and that scan is cheap; only widen to the full range
 * if it misses. The HTML stopped at 60 days and reported "position not found",
 * which is a wrong answer dressed as a limitation.
 */
async function findMintLog(nfpmAddr, tokenId, wallet, currentBlock, protocol = 'aerodrome') {
  // Alchemy's Transfers API already indexed this, so it answers in one request
  // regardless of how old the position is. This is what removes the 60 day ceiling.
  const indexed = await findMintViaTransfers({ contractAddress: nfpmAddr, wallet, tokenId });
  if (indexed) return { blockNumber: indexed.blockNumber, transactionHash: indexed.txHash };

  // Without Alchemy, scan backwards from the position manager's own deploy block.
  // The floor matters: with a placeholder floor the range spans tens of millions
  // of blocks, the scan runs out of budget partway, and "not found" becomes
  // indistinguishable from "we stopped looking".
  const filter = { address: nfpmAddr, topics: [topic.transfer, pad32(ZERO_ADDR), null, idTopic(tokenId)] };
  const deployBlock = DEPLOY_BLOCKS_BY_PROTOCOL[protocol]?.[CHAIN]
    ?? DEPLOY_BLOCKS[CHAIN] ?? 0;
  const fastFrom = Math.max(deployBlock, currentBlock - BASE_BLOCKS_PER_DAY * 60);

  const recent = await chunkedGetLogs(CHAIN, filter, { fromBlock: fastFrom, toBlock: currentBlock, backward: true });
  if (recent) return recent;

  if (fastFrom <= deployBlock) return null;

  const report = {};
  const older = await chunkedGetLogs(CHAIN, filter, {
    fromBlock: deployBlock, toBlock: fastFrom, backward: true, maxChunks: 900, report,
  });
  if (older) return older;

  // Nothing found AND the scan did not finish: say so rather than let a caller
  // read this as proof the position does not exist.
  if (report.truncated) return { incomplete: true };
  return null;
}

/**
 * Full event timeline of one position, every amount valued at the price on the
 * day it happened.
 *
 * Two rules from PNL_SPEC that this function exists to honour:
 *   item 1: multiple deposits are summed each at its own price, not averaged.
 *   item 3: a Collect in the same transaction as a DecreaseLiquidity is mostly
 *           returned principal, not fees. Counting it as fees inflates earnings.
 *
 * @returns {Promise<{events: PositionEvent[], openedAt: number|null, mintBlock: number|null,
 *                    closed: boolean, confidence: 'full'|'partial', notes: string[]}>}
 */
export async function getPositionHistory({
  protocol = 'aerodrome', tokenId, nfpmAddr, gaugeAddress, wallet, token0, token1,
}) {
  const notes = [];
  let confidence = 'full';
  const degrade = (note) => { confidence = 'partial'; if (!notes.includes(note)) notes.push(note); };

  const resolvedNfpm = nfpmAddr || NFPM_ADDRS[protocol]?.[CHAIN];
  if (!resolvedNfpm) {
    return { events: [], openedAt: null, mintBlock: null, closed: false,
             confidence: 'partial', notes: ['Unknown position manager for this protocol.'] };
  }

  const provider = await getProvider(CHAIN);
  const logsProvider = (await getLogsProvider(CHAIN)) || provider;
  const currentBlock = await withTimeout(logsProvider.getBlockNumber(), 8000);
  const tid = idTopic(tokenId);

  const mintLog = await findMintLog(resolvedNfpm, tokenId, wallet, currentBlock, protocol);
  if (!mintLog || mintLog.incomplete) {
    return { events: [], openedAt: null, mintBlock: null, closed: false, confidence: 'partial',
             notes: ['Could not find the mint of this position onchain, so entry data is unavailable.'] };
  }
  const mintBlock = mintLog.blockNumber;

  // Everything that happened to this position, from its mint forward.
  const scan = (topics, address = resolvedNfpm) => chunkedGetLogs(
    CHAIN, { address, topics },
    { fromBlock: mintBlock, toBlock: currentBlock, backward: false, collectAll: true, maxResults: 500 }
  ).then((r) => r || []).catch(() => []);

  const [increases, decreases, collects, transfers, claims] = await Promise.all([
    scan([topic.increase, tid]),
    scan([topic.decrease, tid]),
    scan([topic.collect, tid]),
    scan([topic.transfer, null, null, tid]),
    gaugeAddress ? scan([topic.claim2, pad32(wallet)], gaugeAddress) : Promise.resolve([]),
  ]);

  let claimLogs = claims;
  if (gaugeAddress && claimLogs.length === 0) {
    // Some gauge versions index the reward token too, which changes the topic.
    claimLogs = await scan([topic.claim3, pad32(wallet)], gaugeAddress);
  }

  const allLogs = [...increases, ...decreases, ...collects, ...transfers, ...claimLogs];
  if (allLogs.length === 0) {
    return { events: [], openedAt: null, mintBlock, closed: false, confidence: 'partial',
             notes: ['No position events could be read.'] };
  }

  // Timestamps and gas, one lookup per block and per transaction rather than per log.
  const blockNumbers = [...new Set(allLogs.map((l) => l.blockNumber))];
  const txHashes     = [...new Set(allLogs.map((l) => l.transactionHash))];

  const blockResults = await batchedRequests(blockNumbers,
    async (bn) => [bn, await withTimeout(logsProvider.getBlock(bn), 8000)], 10, 40);
  const timestampOf = new Map();
  blockResults.forEach((r) => {
    if (r.status === 'fulfilled' && r.value[1]) timestampOf.set(r.value[0], r.value[1].timestamp);
  });
  if (timestampOf.size < blockNumbers.length) degrade('Some event timestamps could not be read.');

  const receiptResults = await batchedRequests(txHashes,
    async (h) => [h, await withTimeout(logsProvider.getTransactionReceipt(h), 10000)], 10, 40);
  /** @type {Map<string, {gasEth: number, from: string|null}>} */
  const txInfo = new Map();
  receiptResults.forEach((r) => {
    if (r.status !== 'fulfilled' || !r.value[1]) return;
    const [hash, receipt] = r.value;
    const price = receipt.effectiveGasPrice || receipt.gasPrice;
    const gasEth = price && receipt.gasUsed
      ? parseFloat(ethers.utils.formatEther(receipt.gasUsed.mul(price)))
      : 0;
    txInfo.set(hash, { gasEth, from: receipt.from ? receipt.from.toLowerCase() : null });
  });
  if (txInfo.size < txHashes.length) degrade('Gas could not be read for every transaction.');

  // PNL_SPEC item 3: a Collect sharing a transaction with a DecreaseLiquidity is
  // returning principal, so only the excess over the withdrawn amounts is fees.
  const withdrawnByTx = new Map();
  for (const log of decreases) {
    const [, amount0, amount1] = ethers.utils.defaultAbiCoder.decode(['uint128', 'uint256', 'uint256'], log.data);
    const prev = withdrawnByTx.get(log.transactionHash) || [ethers.constants.Zero, ethers.constants.Zero];
    withdrawnByTx.set(log.transactionHash, [prev[0].add(amount0), prev[1].add(amount1)]);
  }

  /** @type {PositionEvent[]} */
  const events = [];
  const push = (type, log, extra) => events.push({
    type,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    timestamp: timestampOf.get(log.blockNumber) || 0,
    ...extra,
  });

  for (const log of increases) {
    const [, amount0, amount1] = ethers.utils.defaultAbiCoder.decode(['uint128', 'uint256', 'uint256'], log.data);
    push(log.blockNumber === mintBlock ? 'mint' : 'increase', log, {
      amount0: human(amount0, token0.decimals),
      amount1: human(amount1, token1.decimals),
    });
  }

  for (const log of decreases) {
    const [, amount0, amount1] = ethers.utils.defaultAbiCoder.decode(['uint128', 'uint256', 'uint256'], log.data);
    push('decrease', log, {
      amount0: human(amount0, token0.decimals),
      amount1: human(amount1, token1.decimals),
    });
  }

  for (const log of collects) {
    const [, amount0, amount1] = ethers.utils.defaultAbiCoder.decode(['address', 'uint256', 'uint256'], log.data);
    const [w0, w1] = withdrawnByTx.get(log.transactionHash) || [ethers.constants.Zero, ethers.constants.Zero];
    const fee0 = amount0.gt(w0) ? amount0.sub(w0) : ethers.constants.Zero;
    const fee1 = amount1.gt(w1) ? amount1.sub(w1) : ethers.constants.Zero;
    const eventNotes = (!w0.isZero() || !w1.isZero())
      ? ['Collected in the same transaction as a withdrawal; principal excluded from fees.']
      : undefined;
    push('collect', log, {
      amount0: human(fee0, token0.decimals),
      amount1: human(fee1, token1.decimals),
      notes: eventNotes,
    });
  }

  const walletLower = String(wallet).toLowerCase();
  let closed = false;
  for (const log of transfers) {
    const from = ethers.utils.getAddress('0x' + log.topics[1].slice(26)).toLowerCase();
    const to   = ethers.utils.getAddress('0x' + log.topics[2].slice(26)).toLowerCase();
    if (from === ZERO_ADDR) continue;             // the mint, already recorded
    if (to === ZERO_ADDR) { closed = true; push('burn', log, {}); continue; }
    if (from === walletLower) push('stake', log, {});
    else if (to === walletLower) push('unstake', log, {});
  }

  const rewardDecimals = 18; // AERO
  for (const log of claimLogs) {
    try {
      const [amount] = ethers.utils.defaultAbiCoder.decode(['uint256'], log.data);
      push('claim_rewards', log, { rewardAmount: human(amount, rewardDecimals) });
    } catch (_) { degrade('A rewards claim could not be decoded.'); }
  }

  // Value every event at the price of its own timestamp.
  const priceTargets = [token0.address, token1.address, BASE_TOKENS.WETH, BASE_TOKENS.AERO];
  const byTimestamp = [...new Set(events.map((e) => e.timestamp).filter(Boolean))];
  const priceAt = new Map();
  const priceResults = await batchedRequests(byTimestamp,
    async (ts) => [ts, await fetchHistoricalPricesBatch(CHAIN, priceTargets, ts)], 5, 120);
  priceResults.forEach((r) => { if (r.status === 'fulfilled') priceAt.set(r.value[0], r.value[1]); });

  let missingPrice = false;
  for (const event of events) {
    const prices = priceAt.get(event.timestamp) || {};
    const p0 = prices[token0.address.toLowerCase()];
    const p1 = prices[token1.address.toLowerCase()];
    const pEth = prices[BASE_TOKENS.WETH];
    const pAero = prices[BASE_TOKENS.AERO];

    if (event.amount0 != null) {
      if (p0 == null) missingPrice = true; else event.amount0Usd = event.amount0 * p0;
    }
    if (event.amount1 != null) {
      if (p1 == null) missingPrice = true; else event.amount1Usd = event.amount1 * p1;
    }
    if (event.rewardAmount != null) {
      if (pAero == null) missingPrice = true; else event.rewardUsd = event.rewardAmount * pAero;
    }
    const tx = txInfo.get(event.txHash);
    if (tx && pEth != null) event.gasUsd = tx.gasEth * pEth;
    else if (tx) missingPrice = true;
  }
  if (missingPrice) degrade('Some historical prices were unavailable, so those amounts are not valued in USD.');

  // Gas is per transaction, not per event: charging it to every log in the same
  // transaction would multiply the cost by the number of events it emitted.
  const gasCharged = new Set();
  for (const event of events.sort((a, b) => a.blockNumber - b.blockNumber || a.type.localeCompare(b.type))) {
    if (gasCharged.has(event.txHash)) delete event.gasUsd;
    else gasCharged.add(event.txHash);
  }

  const mintEvent = events.find((e) => e.type === 'mint');
  const openedAt = mintEvent?.timestamp || timestampOf.get(mintBlock) || null;

  return { events, openedAt, mintBlock, closed, confidence, notes };
}

/** Pending AERO for a staked position: gauge.earned(wallet, tokenId). Human units. */
export async function getPendingRewards(gaugeAddress, wallet, tokenId, provider) {
  const gauge = new ethers.Contract(gaugeAddress, CL_GAUGE_ABI, provider);
  const raw = await withTimeout(gauge['earned(address,uint256)'](wallet, tokenId), 6000).catch(() => null);
  return raw ? parseFloat(ethers.utils.formatUnits(raw, 18)) : 0;
}
