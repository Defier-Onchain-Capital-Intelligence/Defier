/**
 * core/strategies.js · The four things you could have done with the same money. Pure.
 *
 * Replaces the breakeven sentence, which asked the reader to hold two breakeven
 * prices of WETH quoted in NVDAc in their head. Nobody thinks in those units.
 * The question people actually ask is simpler and answerable: I put in this
 * much, what would each choice be worth today?
 *
 *   LP + fees + rewards − gas   what you did
 *   Hold both                   the same two tokens, untouched
 *   All token0                  the same money, entirely in one side
 *   All token1                  the same money, entirely in the other
 *
 * Every column starts from the identical deposit, valued at the price of the day
 * it went in, and ends at today's price. That is the only way the comparison is
 * a comparison and not four unrelated numbers.
 */

/** Deposit weighted entry price: what a token actually cost across every deposit. */
function entryPriceOf(events, amountKey, usdKey) {
  let tokens = 0;
  let usd = 0;
  for (const e of events || []) {
    if (e.type !== 'mint' && e.type !== 'increase') continue;
    const amount = Number(e[amountKey]);
    const value = Number(e[usdKey]);
    if (!Number.isFinite(amount) || !Number.isFinite(value) || amount <= 0) continue;
    tokens += amount;
    usd += value;
  }
  return tokens > 0 && usd > 0 ? { price: usd / tokens, tokens, usd } : null;
}

/**
 * @param {import('../types/portfolio').LpPosition} pos
 * @returns {import('../types/portfolio').StrategyComparison | null}
 */
export function compareStrategies(pos) {
  const pnl = pos?.pnl;
  if (!pnl || !(pnl.initialCapitalUsd > 0)) return null;

  const price0Now = Number(pos.prices?.token0?.usd);
  const price1Now = Number(pos.prices?.token1?.usd);
  const entry0 = entryPriceOf(pos.events, 'amount0', 'amount0Usd');
  const entry1 = entryPriceOf(pos.events, 'amount1', 'amount1Usd');

  const capital = pnl.initialCapitalUsd;

  // What the position is worth all in: what is still inside, what came out,
  // every fee and reward whether collected or not, less the gas it took.
  const lpValue = pnl.currentValueUsd + pnl.withdrawnUsd
    + pnl.feesClaimedUsd + pnl.feesUnclaimedUsd
    + pnl.incentivesClaimedUsd + pnl.incentivesPendingUsd
    - pnl.gasUsd;

  /** Same dollars, converted entirely into one token on the day they went in. */
  const allIn = (entry, priceNow) => {
    if (!entry || !Number.isFinite(priceNow) || !(entry.price > 0)) return null;
    return (capital / entry.price) * priceNow;
  };

  const options = [
    {
      key: 'lp',
      label: 'LP + fees + rewards',
      valueUsd: lpValue,
      detail: 'What you did: the position, everything it earned, less the gas it cost.',
    },
    {
      key: 'hold-both',
      label: `Hold ${pos.token0.symbol} + ${pos.token1.symbol}`,
      valueUsd: Number.isFinite(pnl.hodlValueUsd) ? pnl.hodlValueUsd : null,
      detail: 'The exact tokens you deposited, left untouched in your wallet.',
    },
    {
      key: 'all-token0',
      label: `All ${pos.token0.symbol}`,
      valueUsd: allIn(entry0, price0Now),
      detail: `The same money put entirely into ${pos.token0.symbol} on the day you deposited.`,
    },
    {
      key: 'all-token1',
      label: `All ${pos.token1.symbol}`,
      valueUsd: allIn(entry1, price1Now),
      detail: `The same money put entirely into ${pos.token1.symbol} on the day you deposited.`,
    },
  ]
    .filter((o) => Number.isFinite(o.valueUsd))
    .map((o) => ({
      ...o,
      pnlUsd: o.valueUsd - capital,
      pnlPct: (o.valueUsd - capital) / capital * 100,
    }));

  if (options.length < 2) return null;

  let best = options[0];
  for (const o of options) if (o.valueUsd > best.valueUsd) best = o;
  for (const o of options) o.isBest = o.key === best.key;

  const lp = options.find((o) => o.key === 'lp');

  return {
    capitalUsd: capital,
    options,
    bestKey: best.key,
    /** True when the thing you actually did was the best of the four. */
    lpWon: best.key === 'lp',
    lpVsBestUsd: lp && best ? lp.valueUsd - best.valueUsd : null,
  };
}
