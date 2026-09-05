/**
 * core/lending.js · Aave v3 on Base, read only.
 *
 * Deliberately minimal for the MVP. `getUserAccountData` gives the shape of the
 * position and the health factor in one call, which is what the portfolio needs
 * to stop pretending a leveraged wallet is an unleveraged one. Per reserve
 * balances need UiPoolDataProvider and come later.
 *
 * The pool address is marked VERIFY in 04_REFERENCIAS_TECNICAS_BASE.md. If the
 * call reverts we report that we could not read Aave, rather than reporting zero,
 * because zero debt and unknown debt are very different things.
 */
import { ethers } from 'ethers';
import { AAVE_V3_BASE, AAVE_POOL_ABI } from './constants.base.js';
import { getProvider, withTimeout } from './providers.js';

const CHAIN = 'base';
const BASE_UNIT = 1e8;      // Aave reports base currency amounts with 8 decimals
const RAY = 1e18;           // health factor is a WAD
const NO_DEBT_HEALTH_FACTOR = ethers.constants.MaxUint256;

/**
 * @param {string} wallet
 * @returns {Promise<{positions: import('../types/portfolio').LendingPosition[], notes: string[]}>}
 */
export async function getLendingPositions(wallet) {
  if (!AAVE_V3_BASE.pool) {
    return { positions: [], notes: ['Aave is not configured for this network.'] };
  }

  try {
    const provider = await getProvider(CHAIN);
    const pool = new ethers.Contract(AAVE_V3_BASE.pool, AAVE_POOL_ABI, provider);
    const data = await withTimeout(pool.getUserAccountData(wallet), 8000);

    const collateralUsd = Number(data.totalCollateralBase) / BASE_UNIT;
    const debtUsd = Number(data.totalDebtBase) / BASE_UNIT;

    if (collateralUsd === 0 && debtUsd === 0) return { positions: [], notes: [] };

    const healthFactor = data.healthFactor.eq(NO_DEBT_HEALTH_FACTOR)
      ? null                                   // no borrows, so the ratio is undefined
      : Number(data.healthFactor.toString()) / RAY;

    return {
      positions: [{
        protocol: 'aave-v3',
        supplied: [],
        borrowed: [],
        healthFactor,
        netValueUsd: collateralUsd - debtUsd,
        totalCollateralUsd: collateralUsd,
        totalDebtUsd: debtUsd,
      }],
      notes: ['Aave is summarised at the account level. Per asset balances arrive with UiPoolDataProvider.'],
    };
  } catch (_) {
    return { positions: [], notes: ['Aave positions could not be read, so they are not included in this portfolio.'] };
  }
}
