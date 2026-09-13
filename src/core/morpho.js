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
 * Discovery cannot be done on chain, and that is Morpho's own position, not a
 * shortcut: "The total collateral on a given market is not easily retrievable
 * onchain. One has to index all positions." There are 4,298 markets on Base as
 * of today, nothing enumerates a wallet's, and reading `position()` for all of
 * them on every request is not a design either.
 *
 * The first attempt at this file discovered markets from Morpho's events. It
 * worked and it was unusable: Morpho has been live on Base for 37.3 million
 * blocks, every RPC caps eth_getLogs between 1,000 and 10,000 blocks a call
 * (measured — drpc refuses over 10,000, Tenderly over 1,000), so covering that
 * history took 900 sequential requests per filter, per wallet. It turned an 8
 * second portfolio into a 52 second one for every wallet on the site,
 * including the ones that have never touched Morpho.
 *
 * So the split is: **the API says where to look, the chain says what is
 * there.** One GraphQL call to Morpho's own indexer names the markets this
 * wallet has a position in, in about 700 ms. Every figure that reaches a
 * screen is then read from the chain, here, and cross-checked against what the
 * API claimed. Nothing is cached: the numbers are as live as an eth_call.
 *
 * That cross-check is worth more than it looks. Morpho publishes no health
 * factor and no account state, so unlike Aave, Moonwell and Comet it offers no
 * second opinion of its own — and this file's second rule is that every
 * derived figure is checked against a number stated elsewhere. The API is that
 * number. Measured on a live position: our chain read said 1,530.000161 USDC
 * of debt, the API said 1,530.132778, a gap of 0.0087% which is the interest
 * accrued between the two reads. Collateral matched to the unit.
 *
 * If the API is unreachable, Morpho is reported as UNSEARCHED. Not as empty.
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
import { withTimeout } from './providers.js';
import { classify } from './exposure.js';
import { fetchTokenPricesBatch } from './prices.js';
import { safeSymbol } from './untrusted.js';

const CHAIN = 'base';

/** Morpho Blue on Base. */
export const MORPHO = {
  address: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
  /**
   * Kept though nothing scans any more. It was established by binary search on
   * eth_getCode against an archive node — code at this block, none at the one
   * before — and a verified fact is cheaper to keep than to establish twice.
   */
  deployBlock: 13977148,
};

const ABI = new ethers.utils.Interface([
  'function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',
  'function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
  'function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
  'function accrueInterest((address loanToken,address collateralToken,address oracle,address irm,uint256 lltv) marketParams)',
  'function price() view returns (uint256)',
]);

/*
 * If anyone ever comes back to reading Morpho's events — for verification, or
 * because the indexer went away — this is the trap that cost a day, written
 * down so it is paid for once. Morpho indexes `onBehalf` in all three, but NOT
 * in the same topic slot:
 *
 *   Supply(id, caller, onBehalf, ...)            onBehalf is topic 3
 *   SupplyCollateral(id, caller, onBehalf, ...)  onBehalf is topic 3
 *   Borrow(id, onBehalf, receiver, ...)          onBehalf is topic 2
 *
 * Borrow does not index the caller, so everything shifts left by one. One
 * filter on topic 3 for all three finds every supply and misses every borrow —
 * a wallet with debt reported as a wallet with collateral and nothing owed,
 * which is the failure this whole file exists to prevent. Confirmed against a
 * live Borrow log on Base at block 51,252,660: four topics, onBehalf in slot 2.
 */

/**
 * Morpho's own indexer. Used for one thing: which markets to look at.
 *
 * A cap on how long it may take, because the last version of this file taught
 * the lesson the expensive way — a discovery step with no ceiling becomes the
 * request. Past this, Morpho is reported as unsearched.
 */
const API_URL = 'https://api.morpho.org/graphql';
const API_BUDGET_MS = 5000;
const BASE_CHAIN_ID = 8453;

/**
 * How far our chain read may sit from what the API said before we stop
 * believing either of them.
 *
 * Interest accrues between the two reads, so they are never identical: the gap
 * measured on a live position was 0.0087%. Two percent is loose enough for
 * that and for a slow indexer, and tight enough that a real mismatch — a
 * decimals mistake, the wrong market, a shares conversion off by a factor —
 * cannot hide inside it.
 */
const API_AGREEMENT_TOLERANCE = 0.02;

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
 * Which markets this wallet has a position in, and what the indexer thinks is
 * in them.
 *
 * The claimed amounts come back too, and they are not used as figures — every
 * one is re-read from the chain below. They are kept as a second opinion,
 * because Morpho gives us none of its own.
 *
 * @returns {Promise<{markets: Array<object>, ok: boolean, reason: string|null}>}
 */
export async function discoverMarkets(wallet) {
  const query = `{
    marketPositions(where: { userAddress_in: ["${wallet}"], chainId_in: [${BASE_CHAIN_ID}] }) {
      items {
        healthFactor
        market { marketId }
        state { collateral borrowAssets supplyAssets }
      }
    }
  }`;

  let json;
  try {
    const res = await withTimeout(fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    }), API_BUDGET_MS);
    if (!res.ok) return { markets: [], ok: false, reason: `http ${res.status}` };
    json = await res.json();
  } catch (err) {
    return { markets: [], ok: false, reason: String(err?.message || err).slice(0, 120) };
  }

  if (json?.errors) {
    return { markets: [], ok: false, reason: String(json.errors[0]?.message || 'query rejected').slice(0, 120) };
  }
  const items = json?.data?.marketPositions?.items;
  // A missing list is not an empty one. Only an array means "we were told, and
  // the answer was none".
  if (!Array.isArray(items)) return { markets: [], ok: false, reason: 'unexpected response shape' };

  const markets = items
    .map((it) => {
      const id = it?.market?.marketId;
      if (typeof id !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(id)) return null;
      const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      return {
        id,
        claimed: {
          collateral: num(it?.state?.collateral),
          borrowAssets: num(it?.state?.borrowAssets),
          supplyAssets: num(it?.state?.supplyAssets),
          healthFactor: num(it?.healthFactor),
        },
      };
    })
    .filter(Boolean);

  return { markets, ok: true, reason: null };
}

/**
 * @param {string} wallet
 * @returns {Promise<{position: object|null, note: string|null, readFailed?: boolean, transportError?: string|null}>}
 */
export async function readMorpho(provider, wallet) {
  const { markets, ok, reason } = await discoverMarkets(wallet);
  if (!ok) {
    // Not "no position on Morpho". We did not get to look.
    return {
      position: null,
      note: 'Morpho could not be searched on this request, so any position there is not included.',
      readFailed: true,
      transportError: reason,
    };
  }
  if (markets.length === 0) return { position: null, note: null };

  const ids = markets.map((m) => m.id);
  const claimedById = new Map(markets.map((m) => [m.id.toLowerCase(), m.claimed]));

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
  /** Markets where our chain read and the indexer do not describe the same position. */
  const disagreements = [];

  /**
   * Our figure against the one the indexer stated, in raw units.
   *
   * This file's second rule is that a derived figure is checked against a
   * number stated somewhere else, and Morpho is the one protocol here that
   * states nothing about an account — no health factor, no totals. The indexer
   * is the only second opinion available, so it is used as one: not to supply
   * a number, only to disagree with ours.
   */
  const agrees = (ours, claimed) => {
    if (claimed == null) return true;          // nothing claimed, nothing to check
    const mine = Number(ours);
    if (!Number.isFinite(mine)) return false;
    if (mine < 1 && claimed < 1) return true;  // dust either way
    const scale = Math.max(Math.abs(claimed), 1);
    return Math.abs(mine - claimed) / scale <= API_AGREEMENT_TOLERANCE;
  };
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

    const claimed = claimedById.get(String(r.id).toLowerCase()) || {};
    if (!agrees(borrowedAssets, claimed.borrowAssets)
      || !agrees(r.collateral, claimed.collateral)
      || !agrees(suppliedAssets, claimed.supplyAssets)) {
      disagreements.push(`${coll.symbol}/${loan.symbol}`);
    }

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
  if (unpriced > 0) {
    notes.push('Some Morpho markets use tokens we could not price, so their dollar value is missing from the totals.');
  }
  if (disagreements.length) {
    // Two readings of the same position that do not match. One of them is
    // wrong and we cannot tell which, so neither is put on a screen as fact.
    notes.push(
      `Our reading of ${disagreements.join(', ')} on Morpho did not match Morpho's own, so the figures are shown without a health factor.`,
    );
  }

  return {
    position: {
      protocol: 'morpho',
      protocolLabel: 'Morpho',
      supplied,
      borrowed: borrowedOut,
      // A health factor that is close is worse than none: see the type contract.
      healthFactor: disagreements.length ? null : worstHealth,
      healthSource: 'morpho',
      liquidationThresholdPct: worstLltv,
      netValueUsd: totalCollateralUsd + supplied.reduce((a, s) => a + (s.isCollateral ? 0 : s.valueUsd), 0) - totalDebtUsd,
      totalCollateralUsd,
      totalDebtUsd,
      breakdownComplete: unpriced === 0 && disagreements.length === 0,
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

export const _internals = { toAssetsUp, toAssetsDown, API_AGREEMENT_TOLERANCE };
