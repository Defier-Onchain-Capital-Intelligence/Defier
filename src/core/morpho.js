/**
 * core/morpho.js · What a wallet has supplied, collateralised and borrowed on
 * Morpho Blue, on Base.
 *
 * Morpho is the largest lending protocol on Base by TVL, and until this file
 * existed a wallet borrowing there was told it had no debt. That is a wrong
 * answer, not a missing one, which is the only reason this was built before
 * anything faster or prettier.
 *
 * Morpho is not shaped like the others. Aave and Moonwell have a pool with a
 * list of reserves and a single account state; Morpho has thousands of
 * independent markets, each one a pair of tokens plus an oracle, an interest
 * rate model and a liquidation LTV. There is no "get this wallet's position"
 * call, because there is no such thing: there is a position per market, and
 * nothing on chain enumerates which markets a wallet has touched.
 *
 * So discovery is by event, and the events are the subtle part. Morpho indexes
 * `onBehalf` in all of them, but NOT in the same topic slot:
 *
 *   Supply(id, caller, onBehalf, ...)             → onBehalf is topic 3
 *   SupplyCollateral(id, caller, onBehalf, ...)   → onBehalf is topic 3
 *   Borrow(id, onBehalf, receiver, ...)           → onBehalf is topic 2
 *
 * Borrow does not index `caller`, so everything shifts left by one. Filtering
 * all three on topic 3 finds the supplies and silently misses every borrow,
 * which would have produced the exact failure this file exists to prevent: a
 * wallet with debt, reported as a wallet with collateral and no debt. Verified
 * against a live Borrow log on Base: four topics, onBehalf in slot 2.
 *
 * Totals are read exactly rather than approximately. `market(id)` returns
 * figures as of `lastUpdate`, so a position read straight from it understates
 * the debt by whatever interest has accrued since. `accrueInterest` brings the
 * market to the current block; it is a state changing function, but inside an
 * `eth_call` the state change is real for the duration of that call, so a
 * Multicall3 `aggregate3` carrying `accrueInterest` immediately before
 * `market(id)` returns current totals in a single request. Verified on Base:
 * `lastUpdate` comes back later than the same market reports on its own.
 *
 * SECURITY: Morpho markets are permissionless. Anybody can create one, pairing
 * any two ERC-20s, which makes every symbol here a stranger's text on a much
 * shorter path than anywhere else in this codebase — no pool to seed, no NFT
 * to transfer, just a market nobody has to interact with. Symbols go through
 * safeSymbol before they go anywhere near the assistant.
 */
import { ethers } from 'ethers';
import { MULTICALL3_ADDR, MULTICALL3_ABI, ERC20_ABI } from './constants.js';
import { getLogsProvider, withTimeout, chunkedGetLogs } from './providers.js';
import { classify } from './exposure.js';
import { fetchTokenPricesBatch } from './prices.js';
import { safeSymbol } from './untrusted.js';

const CHAIN = 'base';

/**
 * Morpho Blue on Base.
 *
 * The deploy block was found by binary search on eth_getCode against an
 * archive node, not copied from a document: there is code at 13,977,148 and
 * none at 13,977,147. It is the floor for every log scan below, and a floor
 * that is too low turns one scan into hundreds of chunks.
 */
export const MORPHO = {
  address: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
  deployBlock: 13977148,
};

const ABI = new ethers.utils.Interface([
  'function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',
  'function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
  'function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
  'function accrueInterest((address loanToken,address collateralToken,address oracle,address irm,uint256 lltv) marketParams)',
  'function price() view returns (uint256)',
]);

const TOPIC = {
  supply: ethers.utils.id('Supply(bytes32,address,address,uint256,uint256)'),
  supplyCollateral: ethers.utils.id('SupplyCollateral(bytes32,address,address,uint256)'),
  borrow: ethers.utils.id('Borrow(bytes32,address,address,address,uint256,uint256)'),
};

const pad32 = (addr) => ethers.utils.hexZeroPad(String(addr).toLowerCase(), 32);

/**
 * Morpho's share maths, copied exactly rather than approximated.
 *
 * The virtual shares and assets exist to make the first deposit in a market
 * unprofitable to attack, and they are part of the conversion, not a rounding
 * detail: leaving them out shifts every figure. Debt rounds UP and supply
 * rounds DOWN, the direction the protocol itself rounds, so neither is ever
 * reported in the wallet's favour.
 */
const VIRTUAL_SHARES = 1000000n;
const VIRTUAL_ASSETS = 1n;
const toAssetsDown = (shares, totalAssets, totalShares) =>
  (shares * (totalAssets + VIRTUAL_ASSETS)) / (totalShares + VIRTUAL_SHARES);
const toAssetsUp = (shares, totalAssets, totalShares) => {
  const d = totalShares + VIRTUAL_SHARES;
  return (shares * (totalAssets + VIRTUAL_ASSETS) + d - 1n) / d;
};

/** Morpho oracles quote collateral in loan token, scaled by 1e36. */
const ORACLE_SCALE = 10n ** 36n;
const WAD = 10n ** 18n;

const call = (target, fn, args = []) => ({
  target, allowFailure: true, callData: ABI.encodeFunctionData(fn, args),
});

async function multicall(provider, calls, timeout = 20000) {
  if (calls.length === 0) return [];
  const mc = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, provider);
  const out = [];
  for (let i = 0; i < calls.length; i += 120) {
    const slice = calls.slice(i, i + 120);
    try {
      out.push(...(await withTimeout(mc.callStatic.aggregate3(slice), timeout)));
    } catch (err) {
      const message = String(err?.message || err).slice(0, 160);
      out.push(...slice.map(() => ({ success: false, returnData: '0x', transportError: message })));
    }
  }
  return out;
}

const decode = (res, fn) => {
  if (!res || !res.success) return null;
  try { return ABI.decodeFunctionResult(fn, res.returnData); } catch (_) { return null; }
};

const asFloat = (raw, decimals) => {
  try { return Number(ethers.utils.formatUnits(raw.toString(), decimals)); } catch (_) { return 0; }
};

/**
 * Every Morpho market this wallet has ever touched.
 *
 * Two scans rather than one because of the topic slot difference described at
 * the top of this file. `incomplete` travels with the result: a short list that
 * looks complete is how a wallet gets told it has no debt on a market we simply
 * stopped looking for.
 *
 * @returns {Promise<{ids: string[], incomplete: boolean}>}
 */
export async function discoverMarkets(wallet) {
  const walletTopic = pad32(wallet);
  const logsProvider = await getLogsProvider(CHAIN);
  if (!logsProvider) return { ids: [], incomplete: true };

  let head;
  try {
    head = await withTimeout(logsProvider.getBlockNumber(), 8000);
  } catch (_) {
    return { ids: [], incomplete: true };
  }

  const suppliedReport = {};
  const borrowedReport = {};
  const range = {
    fromBlock: MORPHO.deployBlock, toBlock: head, backward: false,
    collectAll: true, maxResults: 400, maxChunks: 900,
  };

  const [supplied, borrowed] = await Promise.all([
    chunkedGetLogs(CHAIN, {
      address: MORPHO.address,
      // onBehalf sits in topic 3 for both of these.
      topics: [[TOPIC.supply, TOPIC.supplyCollateral], null, null, walletTopic],
    }, { ...range, report: suppliedReport }).catch(() => []),
    chunkedGetLogs(CHAIN, {
      address: MORPHO.address,
      // and in topic 2 for this one, because Borrow does not index the caller.
      topics: [TOPIC.borrow, null, walletTopic],
    }, { ...range, report: borrowedReport }).catch(() => []),
  ]);

  const ids = [...new Set(
    [...(supplied || []), ...(borrowed || [])]
      .map((log) => log?.topics?.[1])
      .filter(Boolean),
  )];

  return { ids, incomplete: Boolean(suppliedReport.truncated || borrowedReport.truncated) };
}

/**
 * @param {string} wallet
 * @returns {Promise<{position: object|null, note: string|null, readFailed?: boolean, transportError?: string|null}>}
 */
export async function readMorpho(provider, wallet) {
  const { ids, incomplete } = await discoverMarkets(wallet);
  if (incomplete && ids.length === 0) {
    return {
      position: null,
      note: 'Morpho could not be searched, so any position there is not included.',
      readFailed: true,
    };
  }
  if (ids.length === 0) return { position: null, note: null };

  // Market parameters first: every later call needs them, and accrueInterest
  // takes the whole struct rather than the id.
  const paramsRes = await multicall(provider, ids.map((id) => call(MORPHO.address, 'idToMarketParams', [id])));
  const params = new Map();
  ids.forEach((id, i) => {
    const p = decode(paramsRes[i], 'idToMarketParams');
    if (p?.loanToken && p.loanToken !== ethers.constants.AddressZero) {
      params.set(id, {
        loanToken: p.loanToken, collateralToken: p.collateralToken,
        oracle: p.oracle, irm: p.irm, lltv: p.lltv.toBigInt(),
      });
    }
  });
  if (params.size === 0) {
    return {
      position: null,
      note: 'Morpho markets could not be read, so any position there is not included.',
      readFailed: true,
      transportError: paramsRes.find((r) => r?.transportError)?.transportError || null,
    };
  }

  // accrueInterest immediately before market(id), so the totals are current
  // rather than as of lastUpdate. Three calls per market, one request.
  const live = [...params.entries()];
  const stateCalls = live.flatMap(([id, p]) => ([
    call(MORPHO.address, 'accrueInterest', [[p.loanToken, p.collateralToken, p.oracle, p.irm, p.lltv]]),
    call(MORPHO.address, 'market', [id]),
    call(MORPHO.address, 'position', [id, wallet]),
    call(p.oracle, 'price'),
  ]));
  const state = await multicall(provider, stateCalls);

  const rows = [];
  live.forEach(([id, p], i) => {
    const m = decode(state[i * 4 + 1], 'market');
    const pos = decode(state[i * 4 + 2], 'position');
    const px = decode(state[i * 4 + 3], 'price');
    if (!m || !pos) return;
    const supplyShares = pos.supplyShares.toBigInt();
    const borrowShares = pos.borrowShares.toBigInt();
    const collateral = pos.collateral.toBigInt();
    if (supplyShares === 0n && borrowShares === 0n && collateral === 0n) return;
    rows.push({
      id, p, price: px ? px[0].toBigInt() : null,
      supplyShares, borrowShares, collateral,
      totalSupplyAssets: m.totalSupplyAssets.toBigInt(),
      totalSupplyShares: m.totalSupplyShares.toBigInt(),
      totalBorrowAssets: m.totalBorrowAssets.toBigInt(),
      totalBorrowShares: m.totalBorrowShares.toBigInt(),
    });
  });
  if (rows.length === 0) return { position: null, note: null };

  const addresses = [...new Set(rows.flatMap((r) => [r.p.loanToken, r.p.collateralToken]))];
  const [meta, usdPrices] = await Promise.all([
    tokenMeta(provider, addresses),
    fetchTokenPricesBatch(addresses.map((a) => ({ chain: CHAIN, address: a.toLowerCase() })))
      .catch(() => new Map()),
  ]);
  const usdOf = (addr) => usdPrices.get(`${CHAIN}:${addr.toLowerCase()}`) ?? null;
  const refOf = (addr) => {
    const info = meta.get(addr.toLowerCase()) || { symbol: '???', decimals: 18 };
    return {
      address: addr.toLowerCase(),
      symbol: info.symbol,
      decimals: info.decimals,
      assetClass: info.assetClass ?? classify(addr),
    };
  };

  const supplied = [];
  const borrowedOut = [];
  let totalCollateralUsd = 0;
  let totalDebtUsd = 0;
  /** Worst health across markets. A wallet is liquidated market by market, so
   *  the number that matters is the closest one to the edge, not the average. */
  let worstHealth = null;
  let worstLltv = null;
  let unpriced = 0;

  for (const r of rows) {
    const loan = refOf(r.p.loanToken);
    const coll = refOf(r.p.collateralToken);
    const loanUsd = usdOf(r.p.loanToken);
    const collUsd = usdOf(r.p.collateralToken);

    const suppliedAssets = r.supplyShares > 0n
      ? toAssetsDown(r.supplyShares, r.totalSupplyAssets, r.totalSupplyShares) : 0n;
    const borrowedAssets = r.borrowShares > 0n
      ? toAssetsUp(r.borrowShares, r.totalBorrowAssets, r.totalBorrowShares) : 0n;

    const suppliedAmount = asFloat(suppliedAssets, loan.decimals);
    const borrowedAmount = asFloat(borrowedAssets, loan.decimals);
    const collateralAmount = asFloat(r.collateral, coll.decimals);

    if (suppliedAmount > 0) {
      if (loanUsd == null) unpriced += 1;
      supplied.push({
        token: loan, amount: suppliedAmount,
        valueUsd: loanUsd == null ? 0 : suppliedAmount * loanUsd,
        isCollateral: false,
      });
    }
    if (collateralAmount > 0) {
      if (collUsd == null) unpriced += 1;
      const valueUsd = collUsd == null ? 0 : collateralAmount * collUsd;
      supplied.push({ token: coll, amount: collateralAmount, valueUsd, isCollateral: true });
      totalCollateralUsd += valueUsd;
    }
    if (borrowedAmount > 0) {
      if (loanUsd == null) unpriced += 1;
      const valueUsd = loanUsd == null ? 0 : borrowedAmount * loanUsd;
      borrowedOut.push({ token: loan, amount: borrowedAmount, valueUsd });
      totalDebtUsd += valueUsd;
    }

    // Health, in the market's own terms. Morpho publishes no health factor, so
    // this is computed the way the protocol decides a liquidation: collateral
    // valued by THIS market's oracle, against this market's LLTV. Our own USD
    // prices never enter it — they would produce a ratio belonging to nobody.
    if (borrowedAssets > 0n && r.price != null && r.price > 0n) {
      const collateralInLoan = (r.collateral * r.price) / ORACLE_SCALE;
      const maxBorrow = (collateralInLoan * r.p.lltv) / WAD;
      const health = Number(maxBorrow) / Number(borrowedAssets);
      if (Number.isFinite(health) && (worstHealth == null || health < worstHealth)) {
        worstHealth = health;
        worstLltv = Number(r.p.lltv) / 1e16;
      }
    }
  }

  if (supplied.length === 0 && borrowedOut.length === 0) return { position: null, note: null };

  const notes = [];
  if (incomplete) {
    notes.push('Morpho could only be searched over part of this wallet\'s history, so there may be markets we did not see.');
  }
  if (unpriced > 0) {
    notes.push('Some Morpho markets use tokens we could not price, so their dollar value is missing from the totals.');
  }

  return {
    position: {
      protocol: 'morpho',
      protocolLabel: 'Morpho',
      supplied,
      borrowed: borrowedOut,
      healthFactor: worstHealth,
      healthSource: 'morpho',
      liquidationThresholdPct: worstLltv,
      netValueUsd: totalCollateralUsd + supplied.reduce((a, s) => a + (s.isCollateral ? 0 : s.valueUsd), 0) - totalDebtUsd,
      totalCollateralUsd,
      totalDebtUsd,
      breakdownComplete: unpriced === 0 && !incomplete,
    },
    note: notes.length ? notes.join(' ') : null,
  };
}

/** Symbols and decimals, sanitised. See the SECURITY note at the top. */
async function tokenMeta(provider, addresses) {
  const list = [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))];
  if (list.length === 0) return new Map();
  const erc20 = new ethers.utils.Interface(ERC20_ABI.concat(['function decimals() view returns (uint8)']));
  const calls = list.flatMap((address) => ([
    { target: address, allowFailure: true, callData: erc20.encodeFunctionData('symbol') },
    { target: address, allowFailure: true, callData: erc20.encodeFunctionData('decimals') },
  ]));
  const res = await multicall(provider, calls);
  const map = new Map();
  list.forEach((address, i) => {
    let symbol = '???';
    let decimals = 18;
    try { if (res[i * 2]?.success) [symbol] = erc20.decodeFunctionResult('symbol', res[i * 2].returnData); } catch (_) { /* keep */ }
    try { if (res[i * 2 + 1]?.success) [decimals] = erc20.decodeFunctionResult('decimals', res[i * 2 + 1].returnData); } catch (_) { /* keep */ }
    map.set(address, {
      address,
      symbol: safeSymbol(symbol),
      decimals: Number(decimals),
      assetClass: classify(address),
    });
  });
  return map;
}

export const _internals = { toAssetsUp, toAssetsDown, TOPIC, pad32 };
