/**
 * core/lending.js  (NEW · Part 2, minimal)
 * Aave v3 on Base, read-only: account health + main reserves.
 */
import { ethers } from 'ethers';
import { AAVE_V3_BASE, AAVE_POOL_ABI } from './constants.base.js';
import { getProvider, withTimeout } from './providers.js';

/** @returns {Promise<import('../types/portfolio').LendingPosition[]>} */
export async function getLendingPositions(wallet) {
  // TODO(Part 2): getUserAccountData(wallet) → if totalCollateralBase == 0 && totalDebtBase == 0 return [].
  //   Then per-reserve balances via UiPoolDataProvider (VERIFY address) or aToken/debtToken balanceOf for
  //   USDC, WETH, cbBTC (+ tokenized stocks if Aave lists them). Base units: 8 decimals USD.
  throw new Error('not implemented');
}
