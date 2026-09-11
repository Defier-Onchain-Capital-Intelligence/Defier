/**
 * One-time backfill: turn the stored wallet addresses into keyed hashes.
 *
 * Migration 0004 replaces wallet_snapshots.address with wallet_key, a keyed
 * hash. Postgres cannot compute it, because the key is the Supabase secret and
 * the whole point is that it never leaves the server. So the conversion happens
 * here instead of in SQL.
 *
 * Written as a script rather than as a line in a runbook for one reason: the
 * alternative was pasting a secret into a SQL editor, which stores it in query
 * history. This reads the key from the environment, uses it, and never prints
 * it. It never prints a wallet address either — the point of the exercise is to
 * stop holding those, and a script that dumps them to a terminal on the way out
 * has missed it.
 *
 * Safe to run twice: it only touches rows that still have no wallet_key.
 *
 *   node scripts/backfill-wallet-keys.mjs
 */
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

/** .env.local if present, so nobody has to copy a secret by hand. */
function loadEnvFile() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, '');
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
    console.log(`Read configuration from ${file}.`);
    return;
  }
}

loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.\n' +
    'Pull them into this folder without reading them:  vercel env pull .env.local',
  );
  process.exit(1);
}

const supabase = createClient(url, secret, { auth: { persistSession: false } });
const walletKey = (address) => createHmac('sha256', secret).update(String(address).toLowerCase()).digest('hex');

const { data, error } = await supabase
  .from('wallet_snapshots')
  .select('address')
  .is('wallet_key', null);

if (error) {
  console.error('Could not read wallet_snapshots:', error.message);
  console.error('If it says the column does not exist, run step 1 of the migration first.');
  process.exit(1);
}

if (!data?.length) {
  console.log('Nothing to convert: every row already has a wallet_key.');
  process.exit(0);
}

console.log(`${data.length} row${data.length === 1 ? '' : 's'} to convert.`);

let done = 0;
let failed = 0;
for (const row of data) {
  if (!row.address) continue;
  const { error: updateError } = await supabase
    .from('wallet_snapshots')
    .update({ wallet_key: walletKey(row.address) })
    .eq('address', row.address);
  if (updateError) failed += 1; else done += 1;
}

// Counts only. Never the addresses, and never the key.
console.log(`Converted ${done}. Failed ${failed}.`);
if (failed) {
  console.error('Some rows did not convert. Do not run step 3 of the migration yet, or they will be deleted.');
  process.exit(1);
}
console.log('Done. Step 3 of the migration is now safe to run.');
