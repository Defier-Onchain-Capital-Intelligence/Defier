-- Report cards: the shareable snapshot behind a /report/c/<id> link.
--
-- Why a stored snapshot rather than figures in the URL. Two reasons, and both
-- are the product's own rules:
--
--   1. Privacy. The link a user posts on X must not carry their address. A row
--      here holds the last four characters and nothing else that points at a
--      wallet. `wallet_key` is an HMAC, not the address: it exists only so that
--      re-sharing updates one row instead of creating a new one every time, and
--      it cannot be reversed into the address it came from.
--   2. Truth. If the numbers travelled in the query string, anyone could publish
--      a fabricated card carrying our name. The figures in this table are
--      written by the server from the engine's own output, never from a client.
--
-- The row is deliberately small: only what the card actually draws.

create table if not exists public.report_cards (
  id          text primary key,
  wallet_key  text unique,
  address_tail text not null,
  figures     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  views       integer     not null default 0
);

create index if not exists report_cards_created_idx
  on public.report_cards (created_at desc);

-- RLS on, and no policy for anon or authenticated. Reads and writes both happen
-- server side with the secret key. The card page is public, but it is served by
-- our own server reading one row by id, not by the browser querying the table.
alter table public.report_cards enable row level security;

-- One atomic increment, so two people opening the same card do not overwrite
-- each other's count. Never granted to anon: the server calls it with the
-- secret key, which bypasses RLS.
create or replace function public.bump_card_views(card_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.report_cards set views = views + 1 where id = card_id;
$$;

revoke execute on function public.bump_card_views(text) from anon, authenticated;
