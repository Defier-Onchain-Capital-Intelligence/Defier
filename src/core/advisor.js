/**
 * core/advisor.js · Observations about a portfolio's composition. Pure.
 *
 * This is not advice and the language enforces that. Every item is an
 * observation about what the wallet holds, paired with what exists on Base for
 * that situation. Never an instruction, never a suggestion to buy or sell.
 *
 *   "54% of your portfolio is ETH. Aave pays yield on deposited ETH."
 *   not "you should deposit your ETH in Aave."
 *
 * The distinction is not cosmetic. A product that tells people what to do with
 * their money is giving investment advice; one that tells them what they hold
 * and what is available is giving them their own situation back, which is what
 * they actually lack.
 *
 * The AI agent consumes this as a tool. It does not invent observations, it
 * reports these. Same rule as everywhere else in the product: the agent cites
 * figures, it does not produce them.
 */
import { STOCK_ADDRESSES, BASE_TOKENS } from './constants.base.js';

const STABLES = new Set([BASE_TOKENS.USDC, BASE_TOKENS.USDbC, BASE_TOKENS.DAI, BASE_TOKENS.EURC]);
const DAY = 86400;

const money = (value) => `$${Math.abs(value).toLocaleString('en-US', {
  minimumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
  maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
})}`;

/**
 * @param {import('../types/portfolio').Portfolio} portfolio
 * @returns {Array<{id: string, severity: 'info'|'attention', title: string, detail: string, available: string|null}>}
 */
export function observe(portfolio) {
  const out = [];
  const { summary, exposure, positions, tokens, scenarios } = portfolio;
  const open = (positions || []).filter((p) => !p.closed);
  const total = summary?.totalValueUsd || 0;
  if (total <= 0) return out;

  const add = (id, severity, title, detail, available = null) =>
    out.push({ id, severity, title, detail, available });

  // ── Idle capital ────────────────────────────────────────────────────────────
  for (const holding of tokens || []) {
    const value = holding.valueUsd || 0;
    if (value < total * 0.05 || value < 25) continue;
    const address = holding.token.address;
    const share = ((value / total) * 100).toFixed(0);

    if (STABLES.has(address)) {
      add(`idle-stable-${address}`, 'info',
        `${money(value)} in ${holding.token.symbol} is sitting in your wallet`,
        `That is ${share}% of your portfolio, earning nothing where it is.`,
        'Stablecoin pairs on Aerodrome hold their value against each other, so a position between two stables diverges far less than one against a volatile asset. Aave also pays yield on deposited stablecoins.');
    } else if (STOCK_ADDRESSES.has(address)) {
      add(`idle-stock-${address}`, 'info',
        `${holding.token.symbol} is held without earning anything`,
        `${money(value)} in a tokenized stock that only moves with its share price.`,
        'Aerodrome has pools pairing tokenized stocks against WETH and USDC, and Aave lists some of these assets for lending.');
    } else {
      add(`idle-${address}`, 'info',
        `${money(value)} in ${holding.token.symbol} is not deployed`,
        `That is ${share}% of your portfolio.`,
        `Aave pays yield on deposited ${holding.token.symbol}. Pairing it with a correlated asset diverges less than pairing it against a stablecoin, because two assets that move together drift apart more slowly.`);
    }
  }

  // ── Concentration ───────────────────────────────────────────────────────────
  const top = exposure?.byAsset?.[0];
  if (top && top.pct >= 60) {
    add('concentration', 'attention',
      `${top.pct.toFixed(0)}% of your capital is ${top.symbol}`,
      'Positions in different pools can still be the same bet if they share an asset.',
      null);
  }

  if ((exposure?.marketBiasPct ?? 0) >= 99 && total > 100) {
    add('no-cash', 'info',
      'You hold no stablecoins',
      'Every dollar in this wallet moves with the market. That is a position, not an oversight, but it is worth seeing stated.',
      null);
  }

  // ── Positions that need attention ───────────────────────────────────────────
  const outOfRange = open.filter((p) => !p.inRange);
  for (const p of outOfRange) {
    add(`out-of-range-${p.id}`, 'attention',
      `${p.symbol} is out of range`,
      'A position outside its range earns no fees and sits entirely on one side of the pair.',
      'The simulator shows which range would have covered the price where it has been trading.');
  }

  const stakeable = open.filter((p) => !p.staked && p.protocol === 'aerodrome');
  if (stakeable.length) {
    add('unstaked', 'info',
      `${stakeable.length} Aerodrome ${stakeable.length === 1 ? 'position is' : 'positions are'} not staked`,
      'Unstaked positions still collect trading fees but receive no AERO emissions.',
      'Staking in the pool gauge adds emissions on top of fees. It does not change your price exposure.');
  }

  // ── What the portfolio becomes ──────────────────────────────────────────────
  if (scenarios?.hasPositions) {
    const upTop = scenarios.up.holdings?.[0];
    const downTop = scenarios.down.holdings?.[0];
    if (upTop && downTop && upTop.symbol !== downTop.symbol) {
      add('scenario-flip', 'attention',
        `Your exposure flips with the market`,
        `If prices rise your liquidity converts towards ${upTop.symbol} (${upTop.pct.toFixed(0)}% of the portfolio). If they fall, towards ${downTop.symbol} (${downTop.pct.toFixed(0)}%). Today's split does not show that.`,
        null);
    }
  }

  // ── Results worth naming ────────────────────────────────────────────────────
  const vsHodl = summary?.allTime?.lpVsHodlUsd;
  if (Number.isFinite(vsHodl) && Math.abs(vsHodl) > 1) {
    add('vs-hodl', 'info',
      vsHodl >= 0
        ? `Providing liquidity has earned ${money(vsHodl)} more than holding`
        : `Providing liquidity has cost ${money(vsHodl)} against holding`,
      'Measured against the same tokens left untouched in your wallet, valued today.',
      null);
  }

  const young = open.filter((p) => p.pnl && p.pnl.daysOpen < 1);
  if (young.length === open.length && open.length > 0) {
    add('too-young', 'info',
      'These positions are less than a day old',
      'Returns over a few hours annualise into meaningless numbers, so no APR is shown yet.',
      null);
  }

  return out;
}

/** Portfolio facts an agent can quote without re-deriving anything. */
export function portfolioFacts(portfolio) {
  const { summary, exposure, positions, scenarios } = portfolio;
  const open = (positions || []).filter((p) => !p.closed);
  return {
    address: portfolio.address,
    totalValueUsd: summary?.totalValueUsd ?? 0,
    liquidityValueUsd: summary?.lpValueUsd ?? 0,
    walletTokensUsd: summary?.tokensValueUsd ?? 0,
    tokenizedStocksUsd: summary?.stocksValueUsd ?? 0,
    openPositions: open.length,
    closedPositions: (positions?.length ?? 0) - open.length,
    stakedPositions: open.filter((p) => p.staked).length,
    outOfRangePositions: open.filter((p) => !p.inRange).length,
    feesUncollectedUsd: summary?.feesTotalUsd ?? 0,
    rewardsPendingUsd: summary?.incentivesTotalUsd ?? 0,
    // Two different scopes, named so they cannot be mistaken for each other.
    // Open positions describe today; all time includes everything ever closed,
    // and on most wallets those two numbers tell opposite stories.
    openPositionsNetPnlUsd: summary?.open?.netPnlUsd ?? null,
    openPositionsVsHoldingUsd: summary?.open?.lpVsHodlUsd ?? null,
    allTimeNetPnlUsd: summary?.allTime?.netPnlUsd ?? null,
    allTimeVsHoldingUsd: summary?.allTime?.lpVsHodlUsd ?? null,
    headlineAboutOpenPositionsOnly: summary?.headline ?? null,
    headlineAboutAllTimeIncludingClosed: summary?.historyHeadline ?? null,
    exposureByClass: exposure?.byClass ?? [],
    marketBiasPct: exposure?.marketBiasPct ?? null,
    ifMarketRises: scenarios?.up?.holdings?.slice(0, 4) ?? [],
    ifMarketFalls: scenarios?.down?.holdings?.slice(0, 4) ?? [],
    positions: open.map((p) => ({
      id: p.id, pair: p.symbol, valueUsd: p.valueUsd,
      inRange: p.inRange, staked: p.staked,
      containsTokenizedStock: p.token0.isTokenizedStock || p.token1.isTokenizedStock,
      priceLower: p.priceLower, priceUpper: p.priceUpper, currentPrice: p.currentPrice,
      vsHoldingUsd: p.pnl?.lpVsHodlUsd ?? null,
      daysOpen: p.pnl?.daysOpen ?? null,
      confidence: p.confidence,
    })),
    dataConfidence: summary?.confidence ?? 'partial',
  };
}
