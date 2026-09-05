/**
 * core/stocks.js · Coinbase tokenized stocks (B20) as first class assets.
 *
 * Two things about B20 that a naive integration gets wrong, both from
 * docs.base.org/base-chain/asset-issuance/tokenized-stocks-on-base:
 *
 *   1. One token is not one share, and the ratio moves. Cash dividends and
 *      splits raise a multiplier instead of minting tokens, so `balanceOf` is
 *      not a share count. `scaledBalanceOf` is.
 *   2. Symbols and names are mutable onchain (`updateSymbol`, `updateName`), so
 *      tokens are identified by address here. Never by symbol.
 *
 * Prices come from the Chainlink feed for the token, which is total return and
 * already accounts for the multiplier. Those feeds are 24/5 and freeze during
 * corporate actions, so `updatedAt` is checked and a stale price is labelled
 * rather than presented as current. DeFiLlama is the fallback because the DEX
 * market trades around the clock.
 */
import { ethers } from 'ethers';
import {
  TOKENIZED_STOCKS, B20_ABI, CHAINLINK_FEED_ABI, CHAINLINK_STALE_SECONDS,
} from './constants.base.js';
import { MULTICALL3_ADDR, MULTICALL3_ABI, ERC20_ABI } from './constants.js';
import { getProvider, withTimeout, batchedRequests } from './providers.js';
import { fetchTokenPrice } from './prices.js';

const CHAIN = 'base';

async function multicall(provider, calls, chunk = 200) {
  const mc = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, provider);
  const out = [];
  for (let i = 0; i < calls.length; i += chunk) {
    const slice = calls.slice(i, i + chunk);
    try {
      out.push(...await withTimeout(mc.callStatic.aggregate3(slice), 20000));
    } catch (_) {
      out.push(...slice.map(() => ({ success: false, returnData: '0x' })));
    }
  }
  return out;
}

/**
 * Price of one tokenized stock, with its provenance attached so the interface
 * can say where the number came from and whether to trust it right now.
 *
 * @returns {Promise<import('../types/portfolio').PriceQuote|null>}
 */
export async function getStockPrice(address, feed) {
  const provider = await getProvider(CHAIN);

  if (feed) {
    try {
      const oracle = new ethers.Contract(feed, CHAINLINK_FEED_ABI, provider);
      const [round, decimals] = await Promise.all([
        withTimeout(oracle.latestRoundData(), 8000),
        withTimeout(oracle.decimals(), 8000),
      ]);
      const usd = parseFloat(ethers.utils.formatUnits(round.answer, decimals));
      const updatedAt = Number(round.updatedAt);
      const stale = (Math.floor(Date.now() / 1000) - updatedAt) > CHAINLINK_STALE_SECONDS;
      if (usd > 0) return { usd, source: 'chainlink', updatedAt, stale };
    } catch (_) { /* fall through to the DEX price */ }
  }

  const usd = await fetchTokenPrice(CHAIN, address);
  return usd ? { usd, source: 'llama' } : null;
}

/**
 * Every tokenized stock this wallet holds directly.
 *
 * @param {string} wallet
 * @returns {Promise<{holdings: import('../types/portfolio').TokenHolding[], notes: string[]}>}
 */
export async function getStockHoldings(wallet) {
  const provider = await getProvider(CHAIN);
  const notes = [];
  const entries = Object.entries(TOKENIZED_STOCKS);

  // One multicall for every balance, rather than thirteen round trips.
  const erc20 = new ethers.utils.Interface(ERC20_ABI);
  const b20 = new ethers.utils.Interface(B20_ABI);

  const balanceResults = await multicall(provider, entries.map(([, stock]) => ({
    target: stock.address,
    allowFailure: true,
    callData: b20.encodeFunctionData('balanceOf', [wallet]),
  })));

  /** @type {Array<[string, object, ethers.BigNumber]>} */
  const held = [];
  balanceResults.forEach((r, i) => {
    if (!r.success) return;
    try {
      const [raw] = b20.decodeFunctionResult('balanceOf', r.returnData);
      if (!raw.isZero()) held.push([entries[i][0], entries[i][1], raw]);
    } catch (_) { /* not a balance */ }
  });

  if (held.length === 0) return { holdings: [], notes };

  const holdings = await batchedRequests(held, async ([symbol, stock, rawBalance]) => {
    const token = new ethers.Contract(stock.address, [...B20_ABI, ...ERC20_ABI], provider);

    const [decimals, onchainSymbol, scaledRaw, price] = await Promise.all([
      withTimeout(token.decimals(), 6000).then(Number).catch(() => 8),
      withTimeout(token.symbol(), 6000).catch(() => symbol),
      // scaledBalanceOf is the share equivalent. If a token does not expose it we
      // say so instead of pretending the raw balance is a share count.
      withTimeout(token.scaledBalanceOf(wallet), 6000).catch(() => null),
      getStockPrice(stock.address, stock.feed),
    ]);

    const balance = parseFloat(ethers.utils.formatUnits(rawBalance, decimals));
    const scaledBalance = scaledRaw != null
      ? parseFloat(ethers.utils.formatUnits(scaledRaw, decimals))
      : null;

    if (scaledBalance == null) {
      notes.push(`${symbol}: share equivalent unavailable, showing the raw token balance.`);
    }
    if (price?.stale) {
      notes.push(`${symbol}: the Chainlink price has not updated recently, which happens on weekends and during corporate actions.`);
    }

    return {
      token: {
        address: stock.address,
        symbol: onchainSymbol || symbol,
        decimals,
        isTokenizedStock: true,
        assetClass: 'STOCK',
      },
      balance,
      scaledBalance: scaledBalance ?? undefined,
      // Shares per token. 1 means no dividend or split has been applied yet.
      multiplier: scaledBalance != null && balance > 0 ? scaledBalance / balance : undefined,
      price,
      // Value uses the raw balance against the total return price, which is the
      // single consistent pairing. Mixing scaled shares with the token price
      // double counts the multiplier.
      valueUsd: price ? balance * price.usd : null,
    };
  }, 6, 60);

  return {
    holdings: holdings.filter((r) => r.status === 'fulfilled').map((r) => r.value),
    notes: [...new Set(notes)],
  };
}
