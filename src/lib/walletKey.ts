import { createHmac } from 'node:crypto';

/**
 * A stable, non-reversible handle for a wallet address.
 *
 * Keyed with the Supabase secret, which never reaches a browser, so the digest
 * cannot be recomputed by someone holding a list of addresses and compared
 * against our rows. Deterministic, so the same wallet still deduplicates.
 *
 * This existed inside cards.ts and is lifted out because the usage table needs
 * the same thing: it was storing full addresses in plaintext, for every wallet
 * anyone pasted in, including wallets the visitor did not own.
 */
export function walletKey(address: string): string | null {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createHmac('sha256', secret).update(address.toLowerCase()).digest('hex');
}
