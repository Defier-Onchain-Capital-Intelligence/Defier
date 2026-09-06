-- Range alerts, delivered as native Base App notifications.
--
-- Two tables and a deliberate separation between them.
--
-- `notification_tokens` holds permission to notify one person. Base App issues
-- the token when they add the mini app or turn notifications on, and revokes it
-- by sending us a disable event. The token IS the permission: if it is gone, we
-- have no business messaging anyone, so a revocation deletes the row rather than
-- flagging it.
--
-- `alert_subscriptions` holds what to watch. A row is one position someone asked
-- to be told about, plus the last range state we saw, which is what turns a
-- condition that is true every minute into an event that fires once.
--
-- Privacy stance, same as wallet_snapshots: RLS on, no policy for anon or
-- authenticated, all access server side with the secret key. A Farcaster id tied
-- to a wallet address is a real identity link and must never be publicly
-- readable.

create table if not exists public.notification_tokens (
  fid          bigint      primary key,
  token        text        not null,
  url          text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.alert_subscriptions (
  id           bigserial   primary key,
  fid          bigint      not null references public.notification_tokens(fid) on delete cascade,
  wallet       text        not null,
  position_id  text        not null,
  pool_address text        not null,
  tick_lower   integer     not null,
  tick_upper   integer     not null,
  pair         text        not null,
  -- 'in' or 'out'. Null until the first check establishes a baseline, so a
  -- subscription created while out of range does not fire immediately.
  last_state   text,
  last_fired_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (fid, position_id)
);

create index if not exists alert_subscriptions_pool_idx
  on public.alert_subscriptions (pool_address);

alter table public.notification_tokens  enable row level security;
alter table public.alert_subscriptions  enable row level security;
