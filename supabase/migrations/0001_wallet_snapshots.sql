-- Wallet snapshots: the "total capital analyzed" metric.
--
-- One row per address ever analysed, updated on each successful portfolio build.
-- This is the product's own traction number: not visits, but dollars of real
-- onchain capital the engine has actually reconstructed.
--
-- Privacy stance: an address is pseudonymous but it is still someone's wallet, so
-- rows are never publicly readable. Only the aggregate is exposed, through a
-- function that returns counts and totals and nothing that identifies anyone.

create table if not exists public.wallet_snapshots (
  address          text primary key,
  total_value_usd  numeric(24, 6) not null default 0,
  positions_count  integer        not null default 0,
  first_seen_at    timestamptz    not null default now(),
  last_seen_at     timestamptz    not null default now(),
  snapshots_count  integer        not null default 1
);

create index if not exists wallet_snapshots_last_seen_idx
  on public.wallet_snapshots (last_seen_at desc);

-- RLS on, and no policy for anon or authenticated. Writes happen server side with
-- the secret key, which bypasses RLS. Without this, the publishable key would let
-- anyone list every wallet that has ever used the product.
alter table public.wallet_snapshots enable row level security;

-- The only thing the world may read.
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
