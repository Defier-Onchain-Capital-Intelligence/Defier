-- Range alerts, delivered as native Base App notifications.
--
-- Two tables and a deliberate separation between them.
--
-- `notification_tokens` holds permission to notify one person. Base App issues a
-- token when they add the mini app or turn notifications on. The token IS the
-- permission: nothing can be delivered without one the client itself issued.
--
-- The primary key is (fid, token), NOT fid alone, and that is a security
-- decision rather than a modelling one. Our webhook is a public URL whose
-- signature we do not verify yet, so anyone can post a forged event to it. With
-- one row per fid, a forged event would OVERWRITE a real person's token and
-- silence their alerts — a targeted denial of service against a user. With one
-- row per token, a forged event can only add a row that never works: the send
-- path tries every token a person has and deletes the ones the client rejects as
-- invalid, so junk cleans itself up and the real token keeps working.
--
-- For the same reason a disable event does not delete anything here. Revocation
-- is enforced where it cannot be forged: once Base App stops honouring a token
-- it reports it as invalid and the sender removes it.
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
  fid          bigint      not null,
  token        text        not null,
  url          text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (fid, token)
);

create index if not exists notification_tokens_fid_idx
  on public.notification_tokens (fid);

create table if not exists public.alert_subscriptions (
  id           bigserial   primary key,
  fid          bigint      not null,
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
