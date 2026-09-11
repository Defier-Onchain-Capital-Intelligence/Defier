-- Stop storing wallet addresses in plaintext.
--
-- wallet_snapshots kept the full address of every wallet ever analysed. RLS
-- meant nobody could read the table, and the stance written into migration
-- 0001 was already the right one, but the table still held a permanent,
-- readable-by-us list of addresses — including addresses a visitor pasted in
-- that were not theirs.
--
-- Nothing this table is for needs the address. It counts distinct wallets,
-- sums capital, and must not double count the same wallet twice. A keyed hash
-- does all three: deterministic, so the upsert still deduplicates, and not
-- reversible, so the row stops being about a person.
--
-- The key is the Supabase secret, which never reaches a browser, so the digest
-- cannot be recomputed by someone holding a list of addresses and matched
-- against these rows. report_cards has worked this way since migration 0003;
-- this brings the usage table into line.
--
-- RUN IT IN THREE STEPS. The hash is keyed with the Supabase secret, which
-- Postgres does not have and should not be given: pasting a secret into the
-- SQL editor writes it into that editor's query history. So the conversion
-- happens in a script that reads the key from the environment and never
-- prints it.
--
--   1. Add the column. Run this line alone, here in the SQL editor:
--
--        alter table public.wallet_snapshots add column if not exists wallet_key text;
--
--   2. Convert the existing rows, from the repository:
--
--        vercel env pull .env.local
--        node scripts/backfill-wallet-keys.mjs
--        rm .env.local
--
--      It reports how many it converted and refuses to claim success if any
--      failed. Safe to run twice.
--
--   3. Run the rest of this file, below.
--
-- Skipping step 2 is allowed and costs only history: rows without a wallet_key
-- are deleted in step 3 and the public capital total restarts from the next
-- wallet analysed. Nothing breaks either way.
--
-- Until step 3 runs, the application cannot write to this table at all — it
-- already sends wallet_key — so the capital counter is frozen from the deploy
-- that shipped that code until this migration lands.

alter table public.wallet_snapshots add column if not exists wallet_key text;

-- Anything not backfilled above cannot be kept: without the key there is no
-- way to match a future analysis of the same wallet to this row.
delete from public.wallet_snapshots where wallet_key is null;

alter table public.wallet_snapshots drop constraint if exists wallet_snapshots_pkey;
alter table public.wallet_snapshots drop column if exists address;
alter table public.wallet_snapshots alter column wallet_key set not null;
alter table public.wallet_snapshots add primary key (wallet_key);

-- get_capital_stats is unchanged in shape: it never selected the address, which
-- is the point. Recreated only because the column it counted rows from moved.
create or replace function public.get_capital_stats()
returns table (
  wallets_analyzed  bigint,
  total_capital_usd numeric,
  last_updated      timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    count(*)::bigint,
    coalesce(sum(total_value_usd), 0)::numeric,
    max(last_seen_at)
  from public.wallet_snapshots;
$$;

grant execute on function public.get_capital_stats() to anon, authenticated;
