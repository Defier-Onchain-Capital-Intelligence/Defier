/**
 * One-time backfill: turn the stored wallet addresses into keyed hashes.
 *
 * Migration 0004 replaces wallet_snapshots.address with wallet_key, a keyed
 * hash. Postgres cannot compute it, because the key is the Supabase secret and
 * the point of that secret is that it stays on the server. So the conversion
 * happens here.
 *
 * Written to need nothing installed. No npm packages, no Vercel CLI, no
 * node_modules: just Node's own fetch, crypto and readline against Supabase's
 * REST API. The first version imported @supabase/supabase-js and assumed
 * `vercel` was on the PATH, and neither was true on the machine that had to
 * run it — which is the whole failure mode of a script written by someone who
 * never ran it where it was going to run.
 *
 * The key is asked for on the terminal rather than taken from an argument, so
 * it does not land in shell history the way `KEY=... node script.mjs` would.
 * It is never printed, and neither is any wallet address: the point of this
 * exercise is to stop holding those, and a script that dumps them on the way
 * out has missed it.
 *
 * Safe to run twice: it only touches rows that still have no wallet_key.
 *
 *   node scripts/backfill-wallet-keys.mjs
 */
import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

/** .env.local if it happens to exist, so nobody types anything they need not. */
function loadEnvFile() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    console.log(`Read configuration from ${file}.`);
    return;
  }
}

loadEnvFile();

let url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
let secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  // Prompting only works with a terminal attached. Piped or in CI it would
  // wait forever on an answer nobody is there to type, so say what is missing
  // instead of hanging.
  if (!stdin.isTTY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY, and there is no terminal to ask.');
    console.error('Run it directly in a terminal, or put both in .env.local.');
    process.exit(1);
  }
  const rl = createInterface({ input: stdin, output: stdout });
  if (!url) {
    console.log('\nSupabase dashboard > Settings > Data API > Project URL');
    url = (await rl.question('Project URL: ')).trim();
  }
  if (!secret) {
    console.log('\nSupabase dashboard > Settings > API Keys > the secret key');
    console.log('(nothing is saved, and it is never printed back)');
    secret = (await rl.question('Secret key: ')).trim();
  }
  rl.close();
}

if (!url || !secret) {
  console.error('Both the project URL and the secret key are needed.');
  process.exit(1);
}

const base = url.replace(/\/$/, '');
const headers = {
  apikey: secret,
  authorization: `Bearer ${secret}`,
  'content-type': 'application/json',
};

const walletKey = (address) => createHmac('sha256', secret).update(String(address).toLowerCase()).digest('hex');

const rows = await fetch(`${base}/rest/v1/wallet_snapshots?select=address&wallet_key=is.null`, { headers })
  .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${await r.text()}`))))
  .catch((e) => {
    console.error('\nCould not read wallet_snapshots:', e.message);
    console.error('If it mentions wallet_key, run step 1 of the migration first:');
    console.error('  alter table public.wallet_snapshots add column if not exists wallet_key text;');
    process.exit(1);
  });

if (!rows.length) {
  console.log('\nNothing to convert: every row already has a wallet_key.');
  process.exit(0);
}

console.log(`\n${rows.length} row${rows.length === 1 ? '' : 's'} to convert.`);

let done = 0;
let failed = 0;
for (const row of rows) {
  if (!row.address) continue;
  const res = await fetch(
    `${base}/rest/v1/wallet_snapshots?address=eq.${encodeURIComponent(row.address)}`,
    { method: 'PATCH', headers: { ...headers, prefer: 'return=minimal' },
      body: JSON.stringify({ wallet_key: walletKey(row.address) }) },
  ).catch(() => null);
  if (res && res.ok) done += 1; else failed += 1;
}

// Counts only. Never an address, never the key.
console.log(`Converted ${done}. Failed ${failed}.`);
if (failed) {
  console.error('Some rows did not convert. Do not run step 3 yet, or those rows are deleted.');
  process.exit(1);
}
console.log('Done. Step 3 of the migration is now safe to run.');
