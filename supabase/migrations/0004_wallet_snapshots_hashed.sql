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
-- BACKFILL. The hash is keyed with a secret Postgres does not have, so the
-- existing rows cannot be converted by this migration alone. Pick one before
-- running it:
--
--   A. Keep the history. Run this first in the SQL editor, pasting the real
--      SUPABASE_SECRET_KEY in place of the placeholder:
--
--        create extension if not exists pgcrypto;
--        alter table public.wallet_snapshots add column if not exists wallet_key text;
--        update public.wallet_snapshots
--           set wallet_key = encode(hmac(address, 'PASTE_SUPABASE_SECRET_KEY_HERE', 'sha256'), 'hex')
--         where wallet_key is null;
--
--      then run the rest of this file.
--
--   B. Start the counter over. Run this file as is; rows with no wallet_key
--      are dropped, and the public total restarts from the next wallet
--      analysed.

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
