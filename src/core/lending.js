/**
 * core/lending.js · What the wallet has lent and what it owes, on Base.
 *
 * Three protocols are read: Aave v3, Moonwell and Compound v3. Each is asked
 * directly, with a fixed number of calls, so a position is either measured or
 * reported as unreadable. Morpho is not covered yet; every screen that shows
 * this says which protocols were checked, because a wallet borrowing somewhere
 * we do not look would otherwise read as a wallet with no debt, and that is a
 * wrong answer rather than a missing one.
 *
 * Two rules this file exists to enforce:
 *
 * 1. **The health factor is the protocol's, never ours.** It decides whether
 *    someone is liquidated, so it is computed from that protocol's own oracle
 *    and its own collateral factors. Valuing the collateral with our prices and
 *    the debt with theirs produces a number that belongs to nobody.
 * 2. **Every derived figure is checked against a number the protocol states
 *    itself**, and when the two disagree we report neither. Aave gives totals
 *    next to the per asset rows; Moonwell gives account liquidity next to the
 *    balances; Comet says outright whether an account is liquidatable. Each is a
 *    free second opinion and each is used.
 *
 * Addresses are resolved from on chain registries rather than written down:
 * Aave's data provider and oracle come from its AddressesProvider, Moonwell's
 * markets and oracle from its Comptroller, Comet's collateral set from the
 * market itself. A hardcoded address goes stale silently.
 */
import { ethers } from 'ethers';
import { MULTICALL3_ADDR, MULTICALL3_ABI, ERC20_ABI } from './constants.js';
import { getProvider, withTimeout } from './providers.js';
import { classify } from './exposure.js';

const CHAIN = 'base';

/** Verified on Base, 10 Sep 2026, by calling each one. See registry row 122. */
export const LENDING_ADDRS = {
  aaveAddressesProvider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
  aavePool: '0xa238dd80c259a72e81d7e4664a9801593f98d1c5',
  moonwellComptroller: '0xfBb21d0380beE3312B33c4353c8936a0F13EF26C',
  comets: [
    { address: '0xb125E6687d4313864e53df431d5425969c15Eb2F', label: 'USDC' },
    { address: '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf', label: 'USDbC' },
    { address: '0x46e6b214b524310239732D51387075E0e70970bf', label: 'WETH' },
  ],
};

export const LENDING_COVERAGE = {
  checked: ['Aave v3', 'Moonwell', 'Compound v3'],
  notCovered: ['Morpho'],
};

const PROTOCOL_LABEL = {
  'aave-v3': 'Aave v3',
  moonwell: 'Moonwell',
  'compound-v3': 'Compound v3',
};

export function lendingProtocolLabel(protocol) {
  return PROTOCOL_LABEL[protocol] || protocol;
}

const ABI = new ethers.utils.Interface([
  // Aave
  'function getPoolDataProvider() view returns (address)',
  'function getPriceOracle() view returns (address)',
  'function getAllReservesTokens() view returns (tuple(string symbol, address tokenAddress)[])',
  'function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)',
  'function getAssetPrice(address asset) view returns (uint256)',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  // Moonwell / Compound v2
  'function getAllMarkets() view returns (address[])',
  'function getAssetsIn(address account) view returns (address[])',
  'function getAccountSnapshot(address account) view returns (uint256 err, uint256 mTokenBalance, uint256 borrowBalance, uint256 exchangeRateMantissa)',
  'function getAccountLiquidity(address account) view returns (uint256 err, uint256 liquidity, uint256 shortfall)',
  'function markets(address mToken) view returns (bool isListed, uint256 collateralFactorMantissa)',
  'function oracle() view returns (address)',
  'function getUnderlyingPrice(address mToken) view returns (uint256)',
  'function underlying() view returns (address)',
  // Comet
  'function baseToken() view returns (address)',
  'function baseTokenPriceFeed() view returns (address)',
  'function decimals() view returns (uint8)',
  'function numAssets() view returns (uint8)',
  'function getAssetInfo(uint8 i) view returns (tuple(uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint128 supplyCap))',
  'function getPrice(address priceFeed) view returns (uint256)',
  'function userCollateral(address account, address asset) view returns (uint128 balance, uint128 reserved)',
  'function balanceOf(address account) view returns (uint256)',
  'function borrowBalanceOf(address account) view returns (uint256)',
  'function isLiquidatable(address account) view returns (bool)',
  'function symbol() view returns (string)',
]);

const call = (target, fn, args = []) => ({
  target,
  allowFailure: true,
  callData: ABI.encodeFunctionData(fn, args),
});

/** aggregate3, tolerating per call failure. One eth_call per chunk. */
async function multicall(provider, calls, timeout = 20000) {
  if (calls.length === 0) return [];
  const mc = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, provider);
  const out = [];
  for (let i = 0; i < calls.length; i += 200) {
    const slice = calls.slice(i, i + 200);
    try {
      out.push(...(await withTimeout(mc.callStatic.aggregate3(slice), timeout)));
    } catch (_) {
      out.push(...slice.map(() => ({ success: false, returnData: '0x' })));
    }
  }
  return out;
}

const decode = (res, fn) => {
  if (!res || !res.success) return null;
  try { return ABI.decodeFunctionResult(fn, res.returnData); } catch (_) { return null; }
};

const bnToFloat = (bn, decimals) => {
  if (bn == null) return 0;
  try { return Number(ethers.utils.formatUnits(bn, decimals)); } catch (_) { return 0; }
};

/** Metadata for a set of token addresses, in one multicall. */
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
    map.set(address, { address, symbol, decimals: Number(decimals), assetClass: classify(address) });
  });
  return map;
}

/** Within 2% is the same number reported two ways; beyond it, one of them is wrong. */
const RECONCILE_TOLERANCE = 0.02;
function reconciles(ours, theirs) {
  if (!Number.isFinite(ours) || !Number.isFinite(theirs)) return false;
  if (theirs === 0) return Math.abs(ours) < 0.01;
  return Math.abs(ours - theirs) / Math.abs(theirs) <= RECONCILE_TOLERANCE;
}

/* ------------------------------------------------------------------ Aave v3 */

async function readAave(provider, wallet) {
  const p = LENDING_ADDRS.aaveAddressesProvider;
  const head = await multicall(provider, [
    call(p, 'getPoolDataProvider'),
    call(p, 'getPriceOracle'),
    call(LENDING_ADDRS.aavePool, 'getUserAccountData', [wallet]),
  ]);
  const dp = decode(head[0], 'getPoolDataProvider')?.[0];
  const oracle = decode(head[1], 'getPriceOracle')?.[0];
  const account = decode(head[2], 'getUserAccountData');
  if (!dp || !oracle || !account) return { position: null, note: 'Aave could not be read, so it is not included.' };

  // Aave states these in its own base currency, which is USD with 8 decimals.
  const totalCollateralUsd = bnToFloat(account.totalCollateralBase, 8);
  const totalDebtUsd = bnToFloat(account.totalDebtBase, 8);
  if (totalCollateralUsd === 0 && totalDebtUsd === 0) return { position: null, note: null };

  const reserves = decode(await multicall(provider, [call(dp, 'getAllReservesTokens')]).then((r) => r[0]), 'getAllReservesTokens')?.[0] || [];
  if (reserves.length === 0) return { position: null, note: 'Aave reserves could not be listed, so the position is not included.' };

  const assets = reserves.map((r) => r.tokenAddress);
  const res = await multicall(provider, [
    ...assets.map((a) => call(dp, 'getUserReserveData', [a, wallet])),
    ...assets.map((a) => call(oracle, 'getAssetPrice', [a])),
  ]);

  const meta = await tokenMeta(provider, assets);
  const supplied = [];
  const borrowed = [];

  assets.forEach((asset, i) => {
    const d = decode(res[i], 'getUserReserveData');
    const priceRaw = decode(res[assets.length + i], 'getAssetPrice')?.[0];
    if (!d || !priceRaw) return;
    const info = meta.get(asset.toLowerCase()) || { address: asset, symbol: reserves[i].symbol, decimals: 18, assetClass: classify(asset) };
    const token = { address: asset.toLowerCase(), symbol: reserves[i].symbol || info.symbol, decimals: info.decimals, assetClass: info.assetClass };
    const price = bnToFloat(priceRaw, 8);

    const supplyAmount = bnToFloat(d.currentATokenBalance, info.decimals);
    if (supplyAmount > 0) {
      supplied.push({ token, amount: supplyAmount, valueUsd: supplyAmount * price, isCollateral: d.usageAsCollateralEnabled === true });
    }
    const debtAmount = bnToFloat(d.currentVariableDebt, info.decimals) + bnToFloat(d.currentStableDebt, info.decimals);
    if (debtAmount > 0) {
      borrowed.push({ token, amount: debtAmount, valueUsd: debtAmount * price });
    }
  });

  // Aave states the totals itself. Our rows have to add up to them.
  const rowsCollateral = supplied.filter((s) => s.isCollateral).reduce((a, s) => a + s.valueUsd, 0);
  const rowsDebt = borrowed.reduce((a, b) => a + b.valueUsd, 0);
  const breakdownOk = reconciles(rowsCollateral, totalCollateralUsd) && reconciles(rowsDebt, totalDebtUsd);

  const NO_DEBT = ethers.constants.MaxUint256;
  const healthFactor = totalDebtUsd === 0 || account.healthFactor.eq(NO_DEBT)
    ? null
    : Number(ethers.utils.formatUnits(account.healthFactor, 18));

  return {
    position: {
      protocol: 'aave-v3',
      protocolLabel: 'Aave v3',
      supplied: breakdownOk ? supplied : [],
      borrowed: breakdownOk ? borrowed : [],
      healthFactor,
      healthSource: 'aave-v3',
      liquidationThresholdPct: Number(account.currentLiquidationThreshold) / 100,
      totalCollateralUsd,
      totalDebtUsd,
      netValueUsd: totalCollateralUsd - totalDebtUsd,
      breakdownComplete: breakdownOk,
    },
    note: breakdownOk ? null : 'Aave per asset rows did not add up to the totals Aave reports, so only the totals are shown.',
  };
}

/* ---------------------------------------------------------------- Moonwell */

async function readMoonwell(provider, wallet) {
  const c = LENDING_ADDRS.moonwellComptroller;
  const head = await multicall(provider, [
    call(c, 'getAllMarkets'),
    call(c, 'getAssetsIn', [wallet]),
    call(c, 'oracle'),
    call(c, 'getAccountLiquidity', [wallet]),
  ]);
  const markets = decode(head[0], 'getAllMarkets')?.[0] || [];
  const assetsIn = new Set((decode(head[1], 'getAssetsIn')?.[0] || []).map((a) => a.toLowerCase()));
  const oracle = decode(head[2], 'oracle')?.[0];
  const liq = decode(head[3], 'getAccountLiquidity');
  if (markets.length === 0 || !oracle) return { position: null, note: 'Moonwell could not be read, so it is not included.' };

  const snaps = await multicall(provider, markets.map((m) => call(m, 'getAccountSnapshot', [wallet])));
  const active = [];
  markets.forEach((m, i) => {
    const s = decode(snaps[i], 'getAccountSnapshot');
    if (!s || !s.err.isZero()) return;
    if (s.mTokenBalance.isZero() && s.borrowBalance.isZero()) return;
    active.push({ mToken: m, snap: s });
  });
  if (active.length === 0) return { position: null, note: null };

  const detail = await multicall(provider, [
    ...active.map((a) => call(a.mToken, 'underlying')),
    ...active.map((a) => call(c, 'markets', [a.mToken])),
    ...active.map((a) => call(oracle, 'getUnderlyingPrice', [a.mToken])),
  ]);

  const n = active.length;
  const underlyings = active.map((_, i) => decode(detail[i], 'underlying')?.[0] || null);
  const meta = await tokenMeta(provider, underlyings);

  const supplied = [];
  const borrowed = [];
  let weightedCollateralUsd = 0;
  let borrowUsd = 0;
  let readable = true;

  active.forEach((a, i) => {
    const underlying = underlyings[i];
    const mk = decode(detail[n + i], 'markets');
    const priceRaw = decode(detail[2 * n + i], 'getUnderlyingPrice')?.[0];
    if (!underlying || !mk || !priceRaw) { readable = false; return; }

    const info = meta.get(underlying.toLowerCase()) || { symbol: '???', decimals: 18, assetClass: classify(underlying) };
    const token = { address: underlying.toLowerCase(), symbol: info.symbol, decimals: info.decimals, assetClass: info.assetClass };

    // The oracle quotes USD scaled by 36 minus the underlying's decimals, so a
    // raw amount times that price always lands on 1e36, whatever the token.
    const valueOf = (raw) => Number(ethers.utils.formatUnits(raw.mul(priceRaw), 36));

    const underlyingRaw = a.snap.mTokenBalance.mul(a.snap.exchangeRateMantissa).div(ethers.constants.WeiPerEther);
    const supplyAmount = bnToFloat(underlyingRaw, info.decimals);
    const supplyUsd = valueOf(underlyingRaw);
    if (supplyAmount > 0) {
      const isCollateral = assetsIn.has(a.mToken.toLowerCase());
      supplied.push({ token, amount: supplyAmount, valueUsd: supplyUsd, isCollateral });
      if (isCollateral) {
        weightedCollateralUsd += supplyUsd * Number(ethers.utils.formatUnits(mk.collateralFactorMantissa, 18));
      }
    }

    const debtAmount = bnToFloat(a.snap.borrowBalance, info.decimals);
    if (debtAmount > 0) {
      const debtUsd = valueOf(a.snap.borrowBalance);
      borrowed.push({ token, amount: debtAmount, valueUsd: debtUsd });
      borrowUsd += debtUsd;
    }
  });

  if (!readable || (supplied.length === 0 && borrowed.length === 0)) {
    return { position: null, note: readable ? null : 'A Moonwell market could not be priced, so Moonwell is not included.' };
  }

  // Moonwell states its own account liquidity. Our weighted collateral minus
  // debt has to equal it, or the health factor below is not the one that would
  // liquidate this wallet and we do not print it.
  let healthFactor = null;
  if (borrowUsd > 0) {
    const theirs = liq && liq.err.isZero()
      ? Number(ethers.utils.formatUnits(liq.liquidity, 18)) - Number(ethers.utils.formatUnits(liq.shortfall, 18))
      : null;
    const ours = weightedCollateralUsd - borrowUsd;
    const agrees = theirs != null && Math.abs(ours - theirs) <= Math.max(1, Math.abs(theirs) * RECONCILE_TOLERANCE);
    if (agrees) healthFactor = weightedCollateralUsd / borrowUsd;
  }

  const collateralUsd = supplied.reduce((a, s) => a + s.valueUsd, 0);
  return {
    position: {
      protocol: 'moonwell',
      protocolLabel: 'Moonwell',
      supplied,
      borrowed,
      healthFactor,
      healthSource: 'moonwell',
      liquidationThresholdPct: null,
      totalCollateralUsd: collateralUsd,
      totalDebtUsd: borrowUsd,
      netValueUsd: collateralUsd - borrowUsd,
      breakdownComplete: true,
    },
    note: borrowUsd > 0 && healthFactor == null
      ? 'Moonwell balances are shown, but its account liquidity did not match the balances, so no health figure is stated.'
      : null,
  };
}

/* -------------------------------------------------------------- Compound v3 */

async function readComet(provider, wallet, market) {
  const { address } = market;
  const head = await multicall(provider, [
    call(address, 'balanceOf', [wallet]),
    call(address, 'borrowBalanceOf', [wallet]),
    call(address, 'baseToken'),
    call(address, 'baseTokenPriceFeed'),
    call(address, 'decimals'),
    call(address, 'numAssets'),
    call(address, 'isLiquidatable', [wallet]),
  ]);
  const baseSupplyRaw = decode(head[0], 'balanceOf')?.[0];
  const baseBorrowRaw = decode(head[1], 'borrowBalanceOf')?.[0];
  const baseToken = decode(head[2], 'baseToken')?.[0];
  const baseFeed = decode(head[3], 'baseTokenPriceFeed')?.[0];
  const baseDecimals = decode(head[4], 'decimals')?.[0];
  const numAssets = decode(head[5], 'numAssets')?.[0];
  const liquidatable = decode(head[6], 'isLiquidatable')?.[0];
  if (!baseToken || !baseFeed || baseDecimals == null || numAssets == null) return { position: null, note: null };

  const infos = await multicall(provider, Array.from({ length: Number(numAssets) }, (_, i) => call(address, 'getAssetInfo', [i])));
  const collateralAssets = infos.map((r) => decode(r, 'getAssetInfo')?.[0]).filter(Boolean);

  const balances = await multicall(provider, [
    ...collateralAssets.map((a) => call(address, 'userCollateral', [wallet, a.asset])),
    ...collateralAssets.map((a) => call(address, 'getPrice', [a.priceFeed])),
    call(address, 'getPrice', [baseFeed]),
  ]);

  const m = collateralAssets.length;
  const basePrice = bnToFloat(decode(balances[2 * m], 'getPrice')?.[0], 8);
  const heldRaw = collateralAssets.map((_, i) => decode(balances[i], 'userCollateral')?.balance ?? null);
  const anyCollateral = heldRaw.some((b) => b && !b.isZero());
  const hasBase = (baseSupplyRaw && !baseSupplyRaw.isZero()) || (baseBorrowRaw && !baseBorrowRaw.isZero());
  if (!anyCollateral && !hasBase) return { position: null, note: null };

  const meta = await tokenMeta(provider, [baseToken, ...collateralAssets.map((a) => a.asset)]);
  const baseInfo = meta.get(baseToken.toLowerCase()) || { symbol: market.label, decimals: Number(baseDecimals), assetClass: classify(baseToken) };
  const baseRef = { address: baseToken.toLowerCase(), symbol: baseInfo.symbol, decimals: baseInfo.decimals, assetClass: baseInfo.assetClass };

  const supplied = [];
  const borrowed = [];
  let liquidationCapacityUsd = 0;

  const baseSupply = bnToFloat(baseSupplyRaw, baseInfo.decimals);
  if (baseSupply > 0) supplied.push({ token: baseRef, amount: baseSupply, valueUsd: baseSupply * basePrice, isCollateral: false });

  const baseBorrow = bnToFloat(baseBorrowRaw, baseInfo.decimals);
  const borrowUsd = baseBorrow * basePrice;
  if (baseBorrow > 0) borrowed.push({ token: baseRef, amount: baseBorrow, valueUsd: borrowUsd });

  collateralAssets.forEach((a, i) => {
    const raw = heldRaw[i];
    const priceRaw = decode(balances[m + i], 'getPrice')?.[0];
    if (!raw || raw.isZero() || !priceRaw) return;
    const info = meta.get(a.asset.toLowerCase()) || { symbol: '???', decimals: 18, assetClass: classify(a.asset) };
    const amount = bnToFloat(raw, info.decimals);
    const valueUsd = amount * bnToFloat(priceRaw, 8);
    supplied.push({
      token: { address: a.asset.toLowerCase(), symbol: info.symbol, decimals: info.decimals, assetClass: info.assetClass },
      amount,
      valueUsd,
      isCollateral: true,
    });
    // Comet's factors are 1e18 fractions. The liquidation one, not the borrow
    // one: the borrow factor decides how much you may take out, the liquidation
    // factor decides when they come for it.
    liquidationCapacityUsd += valueUsd * Number(ethers.utils.formatUnits(a.liquidateCollateralFactor, 18));
  });

  let healthFactor = null;
  if (borrowUsd > 0) {
    const derived = liquidationCapacityUsd / borrowUsd;
    // Comet answers the question directly. If our ratio disagrees with its own
    // verdict, the ratio is wrong and stays unprinted.
    const consistent = liquidatable === true ? derived < 1 : derived >= 1;
    if (consistent) healthFactor = derived;
  }

  const collateralUsd = supplied.reduce((a, s) => a + s.valueUsd, 0);
  return {
    position: {
      protocol: 'compound-v3',
      protocolLabel: `Compound v3 ${market.label}`,
      market: market.label,
      supplied,
      borrowed,
      healthFactor,
      healthSource: 'compound-v3',
      liquidationThresholdPct: null,
      totalCollateralUsd: collateralUsd,
      totalDebtUsd: borrowUsd,
      netValueUsd: collateralUsd - borrowUsd,
      breakdownComplete: true,
    },
    note: borrowUsd > 0 && healthFactor == null
      ? `Compound v3 ${market.label} balances are shown, but the derived health figure contradicted the market's own liquidation check, so it is not stated.`
      : null,
  };
}

/* -------------------------------------------------------------------------- */

/**
 * @param {string} wallet
 * @returns {Promise<{positions: import('../types/portfolio').LendingPosition[], notes: string[], coverage: {checked: string[], notCovered: string[], failed: string[]}}>}
 */
export async function getLendingPositions(wallet) {
  let provider;
  try {
    provider = await getProvider(CHAIN);
  } catch (_) {
    return {
      positions: [],
      notes: ['Lending positions could not be read on this request.'],
      coverage: { ...LENDING_COVERAGE, checked: [], failed: LENDING_COVERAGE.checked },
    };
  }

  const settled = await Promise.allSettled([
    readAave(provider, wallet),
    readMoonwell(provider, wallet),
    ...LENDING_ADDRS.comets.map((m) => readComet(provider, wallet, m)),
  ]);

  const labels = ['Aave v3', 'Moonwell', ...LENDING_ADDRS.comets.map((m) => `Compound v3 ${m.label}`)];
  const positions = [];
  const notes = [];
  const failed = [];

  settled.forEach((r, i) => {
    if (r.status !== 'fulfilled') {
      failed.push(labels[i]);
      // The note the reader shows says the protocol could not be read, which is
      // true of an RPC failure and equally true of a typo in the ABI above. They
      // are indistinguishable on screen, so the reason goes to the log.
      console.error('[lending]', labels[i], r.reason instanceof Error ? r.reason.message : r.reason);
      notes.push(`${labels[i]} could not be read, so it is not included.`);
      return;
    }
    if (r.value.position) positions.push(r.value.position);
    if (r.value.note) notes.push(r.value.note);
  });

  // Three Comet markets are one protocol as far as coverage is concerned.
  const cometFailed = failed.filter((f) => f.startsWith('Compound v3')).length;
  const checked = LENDING_COVERAGE.checked.filter((name) => {
    if (name === 'Compound v3') return cometFailed < LENDING_ADDRS.comets.length;
    return !failed.includes(name);
  });

  return {
    positions,
    notes,
    coverage: {
      checked,
      notCovered: LENDING_COVERAGE.notCovered,
      failed: checked.length === LENDING_COVERAGE.checked.length ? [] : LENDING_COVERAGE.checked.filter((c) => !checked.includes(c)),
    },
  };
}
