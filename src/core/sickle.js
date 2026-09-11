/**
 * core/sickle.js · Positions held through vfat.io.
 *
 * Someone who provides liquidity on Aerodrome through vfat does not hold the
 * position. vfat deploys a smart contract wallet per user — a Sickle — and the
 * position belongs to that, so a wallet that has real money working on Base
 * reads here as a wallet with nothing. DeBank and Rabby show these already,
 * which makes a portfolio that omits them wrong rather than incomplete.
 *
 * The mechanism is small enough to be almost free: one call per wallet.
 *
 *   sickles(owner) -> the user's Sickle, or the zero address
 *
 * Verified on Base, 11 Sep 2026, against four wallets covering both outcomes.
 * The factory at 0x71D2… answers implementation() with the Sickle contract the
 * vfat docs name and registry() with the registry they name, which is what
 * makes it the right factory rather than merely a contract that responds.
 *
 * The trap to avoid is predict(). It also exists, it returns the same address,
 * and it returns it for everybody: the clone is deterministic, so its address
 * is a fact before the contract exists. Reading predict() instead of sickles()
 * would make every wallet on Base look like a vfat user. sickles() returns the
 * zero address until a Sickle is actually deployed, which is the question we
 * are asking.
 *
 * A predecessor factory was the other expected trap, since that is the shape of
 * the two-Slipstream-deployments bug. previousFactory() on this one answers
 * with the zero address, so on Base there is no earlier factory to also ask.
 * The call stays in the code path so that the day there is one, it is found.
 */
import { ethers } from 'ethers';
import { getProvider, withTimeout } from './providers.js';

const CHAIN = 'base';

export const VFAT = {
  factory: '0x71D234A3e1dfC161cc1d081E6496e76627baAc31',
  /** What the factory should answer, or it is not the factory we verified. */
  expectedImplementation: '0xfff75d099baee29f447866bc5299cd67c04761c8',
};

const ABI = new ethers.utils.Interface([
  'function sickles(address owner) view returns (address)',
  'function previousFactory() view returns (address)',
]);

const ZERO = '0x0000000000000000000000000000000000000000';
const isZero = (a) => !a || a.toLowerCase() === ZERO;

/** Per process, because a Sickle address never changes for a given owner. */
const cache = new Map();

/**
 * The Sickle for this wallet, or null when there is none.
 *
 * Never throws. vfat coverage is additive: if this cannot be read, the wallet's
 * own positions still have to come back intact.
 *
 * @param {string} wallet
 * @returns {Promise<string|null>}
 */
export async function resolveSickle(wallet) {
  const key = String(wallet || '').toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  let found = null;
  try {
    const provider = await getProvider(CHAIN);
    const factory = new ethers.Contract(VFAT.factory, ABI, provider);

    const direct = await withTimeout(factory.sickles(key), 8000);
    if (!isZero(direct)) {
      found = direct.toLowerCase();
    } else {
      // No Sickle on the current factory. If this one was ever replaced, the
      // user's Sickle may live on the one before it.
      const prev = await withTimeout(factory.previousFactory(), 8000).catch(() => ZERO);
      if (!isZero(prev)) {
        const older = new ethers.Contract(prev, ABI, provider);
        const fromOlder = await withTimeout(older.sickles(key), 8000).catch(() => ZERO);
        if (!isZero(fromOlder)) found = fromOlder.toLowerCase();
      }
    }
  } catch (_) {
    // Unreadable is not the same as absent, but the caller cannot act on the
    // difference: either way there is nothing to add to the portfolio.
    found = null;
  }

  cache.set(key, found);
  return found;
}

export function clearSickleCache() {
  cache.clear();
}
