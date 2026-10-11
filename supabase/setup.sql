-- Centixio one-shot database setup.
-- Paste into the Supabase SQL Editor and run once. Generated from supabase/migrations/* (keep in sync).
-- Equivalent to: supabase db push

-- ===== 20261009000001_core.sql =====
-- Centixio core schema: profiles, projects, configuration, conversations,
-- versions, assets. Row-level security restricts every row to its owner.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  prompt text not null default '' check (char_length(prompt) <= 4000),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_updated_idx on public.projects (user_id, updated_at desc);

create table public.project_configs (
  project_id uuid primary key references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  -- Config snapshot used by the current version; differences = unapplied changes.
  applied_config jsonb,
  updated_at timestamptz not null default now(),
  constraint config_size check (pg_column_size(config) < 65536)
);

-- ---------------------------------------------------------------- conversation
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) <= 8000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index messages_project_created_idx on public.messages (project_id, created_at);

-- ---------------------------------------------------------------- assets
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('image', 'logo', 'model', 'reference', 'favicon', 'social')),
  name text not null check (char_length(name) <= 200),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  sha256 text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index assets_project_idx on public.assets (project_id, created_at);

-- ---------------------------------------------------------------- versions (immutable)
create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  number integer not null,
  parent_version_id uuid references public.project_versions (id),
  kind text not null check (kind in ('generate', 'edit', 'reassemble', 'restore', 'repair')),
  prompt text not null default '',
  config jsonb not null,
  spec jsonb not null,
  html text not null,
  asset_refs uuid[] not null default '{}',
  credit_charge integer not null default 0 check (credit_charge >= 0),
  job_id uuid,
  provider text not null default 'rules',
  notes jsonb not null default '[]'::jsonb,
  runtime_status text not null default 'unknown' check (runtime_status in ('unknown', 'ok', 'errors')),
  runtime_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, number)
);
create index versions_project_idx on public.project_versions (project_id, number desc);

alter table public.projects
  add constraint projects_current_version_fk foreign key (current_version_id)
  references public.project_versions (id) on delete set null;

-- Versions are immutable except for runtime diagnostics reported by the preview.
create or replace function public.prevent_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'runtime_status' - 'runtime_errors') is distinct from (to_jsonb(old) - 'runtime_status' - 'runtime_errors') then
    raise exception 'project versions are immutable';
  end if;
  return new;
end;
$$;
create trigger project_versions_immutable before update on public.project_versions
  for each row execute function public.prevent_version_mutation();

-- ---------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger project_configs_touch before update on public.project_configs for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_configs enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.assets enable row level security;
alter table public.project_versions enable row level security;

create policy "own profile read" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "own profile update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own projects read" on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "own projects insert" on public.projects for insert to authenticated with check ((select auth.uid()) = user_id and current_version_id is null);
create policy "own projects update" on public.projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own projects delete" on public.projects for delete to authenticated using ((select auth.uid()) = user_id);

-- Users may only point current_version_id at their own versions of the same project (restore).
create or replace function public.check_current_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.current_version_id is not null and not exists (
    select 1 from public.project_versions v where v.id = new.current_version_id and v.project_id = new.id and v.user_id = new.user_id
  ) then
    raise exception 'invalid current version';
  end if;
  return new;
end; $$;
create trigger projects_current_version_check before insert or update of current_version_id on public.projects
  for each row execute function public.check_current_version();

create policy "own config read" on public.project_configs for select to authenticated using ((select auth.uid()) = user_id);
create policy "own config insert" on public.project_configs for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));
create policy "own config update" on public.project_configs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own conversations read" on public.conversations for select to authenticated using ((select auth.uid()) = user_id);
create policy "own conversations insert" on public.conversations for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create policy "own messages read" on public.messages for select to authenticated using ((select auth.uid()) = user_id);
-- Users can only add their own 'user' messages; assistant/system messages are written by the server.
create policy "own messages insert" on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id and role = 'user'
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.project_id = project_id and c.user_id = (select auth.uid()))
  );

create policy "own assets read" on public.assets for select to authenticated using ((select auth.uid()) = user_id);
create policy "own assets insert" on public.assets for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and storage_path like (select auth.uid())::text || '/%'
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
  );
create policy "own assets delete" on public.assets for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own versions read" on public.project_versions for select to authenticated using ((select auth.uid()) = user_id);
-- Versions are inserted only through security-definer functions (job completion, restore).
create policy "own versions runtime report" on public.project_versions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-assets', 'project-assets', false, 26214400)
on conflict (id) do nothing;

create policy "own asset objects read" on storage.objects for select to authenticated
  using (bucket_id = 'project-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own asset objects insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own asset objects delete" on storage.objects for delete to authenticated
  using (bucket_id = 'project-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- ===== 20261009000002_billing_credits_jobs.sql =====
-- Centixio billing, credit ledger and durable generation jobs.
--
-- Credits are held in grants (allocations). Every change is recorded in an
-- append-only ledger with two deltas:
--   delta_available: change in spendable credits
--   delta_held:      change in credits reserved for in-flight work
-- Invariants (verified by tests):
--   sum(ledger.delta_available) = sum(credit_grants.remaining)
--   sum(ledger.delta_held)      = sum(active credit_reservations.amount)
--
-- All mutating functions are SECURITY DEFINER and executable only by the
-- service role. Clients can read their own rows but never modify balances.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- billing
create table public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id text primary key, -- Stripe subscription id
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('starter', 'pro')),
  status text not null,
  price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);

create table public.processed_billing_events (
  event_id text primary key,
  event_type text not null,
  event_created timestamptz not null,
  processed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- credits
create table public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('subscription', 'purchase', 'demo', 'refund', 'adjustment')),
  amount integer not null check (amount > 0),
  remaining integer not null check (remaining >= 0 and remaining <= amount),
  expires_at timestamptz,
  idempotency_key text not null unique,
  stripe_ref text,
  created_at timestamptz not null default now()
);
create index credit_grants_user_idx on public.credit_grants (user_id, source, expires_at);

create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid,
  amount integer not null check (amount > 0),
  status text not null default 'active' check (status in ('active', 'settled', 'released', 'refunded')),
  allocations jsonb not null default '[]'::jsonb,
  idempotency_key text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index credit_reservations_user_idx on public.credit_reservations (user_id, status);

create table public.credit_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_type text not null check (entry_type in ('allocation', 'purchase', 'reservation', 'deduction', 'release', 'expiration', 'refund', 'revocation', 'adjustment')),
  delta_available integer not null,
  delta_held integer not null default 0,
  grant_id uuid references public.credit_grants (id) on delete set null,
  reservation_id uuid references public.credit_reservations (id) on delete set null,
  job_id uuid,
  idempotency_key text unique,
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------- jobs
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('generate', 'edit', 'repair')),
  status text not null default 'queued' check (status in ('queued', 'running', 'validating', 'completed', 'failed', 'canceled')),
  stage text not null default 'queued',
  input jsonb not null,
  cost integer not null default 0 check (cost >= 0),
  reservation_id uuid references public.credit_reservations (id),
  idempotency_key text not null,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  locked_by text,
  locked_until timestamptz,
  cancel_requested boolean not null default false,
  error text,
  result_version_id uuid references public.project_versions (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index generation_jobs_claim_idx on public.generation_jobs (status, created_at);
create index generation_jobs_user_idx on public.generation_jobs (user_id, created_at desc);
create trigger generation_jobs_touch before update on public.generation_jobs for each row execute function public.touch_updated_at();

create table public.rate_limit_events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_idx on public.rate_limit_events (user_id, bucket, created_at);

-- ---------------------------------------------------------------- RLS (read-only for owners)
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.processed_billing_events enable row level security;
alter table public.credit_grants enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.rate_limit_events enable row level security;

create policy "own billing customer" on public.billing_customers for select to authenticated using ((select auth.uid()) = user_id);
create policy "own subscriptions" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own grants" on public.credit_grants for select to authenticated using ((select auth.uid()) = user_id);
create policy "own reservations" on public.credit_reservations for select to authenticated using ((select auth.uid()) = user_id);
create policy "own ledger" on public.credit_ledger for select to authenticated using ((select auth.uid()) = user_id);
create policy "own jobs" on public.generation_jobs for select to authenticated using ((select auth.uid()) = user_id);
-- processed_billing_events and rate_limit_events: no client access.

-- ---------------------------------------------------------------- internal credit primitives
create or replace function private.lock_user(p_user uuid)
returns void language sql set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('centixio:user:' || p_user::text, 0));
$$;

create or replace function private.available_credits(p_user uuid)
returns integer language sql stable set search_path = '' as $$
  select coalesce(sum(remaining), 0)::integer from public.credit_grants
  where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now());
$$;

create or replace function private.grant_credits(
  p_user uuid, p_source text, p_amount integer, p_expires timestamptz, p_key text,
  p_entry_type text, p_description text, p_stripe_ref text default null
) returns uuid
language plpgsql set search_path = '' as $$
declare v_grant uuid;
begin
  perform private.lock_user(p_user);
  select id into v_grant from public.credit_grants where idempotency_key = p_key;
  if found then return v_grant; end if;
  insert into public.credit_grants (user_id, source, amount, remaining, expires_at, idempotency_key, stripe_ref)
  values (p_user, p_source, p_amount, p_amount, p_expires, p_key, p_stripe_ref)
  returning id into v_grant;
  insert into public.credit_ledger (user_id, entry_type, delta_available, grant_id, idempotency_key, description)
  values (p_user, p_entry_type, p_amount, v_grant, 'ledger:' || p_key, p_description);
  return v_grant;
end; $$;

create or replace function private.expire_grant(p_grant uuid, p_reason text)
returns void language plpgsql set search_path = '' as $$
declare g record;
begin
  select * into g from public.credit_grants where id = p_grant for update;
  if not found then return; end if;
  if g.remaining > 0 then
    insert into public.credit_ledger (user_id, entry_type, delta_available, grant_id, description)
    values (g.user_id, 'expiration', -g.remaining, g.id, p_reason);
  end if;
  update public.credit_grants set remaining = 0, expires_at = least(coalesce(expires_at, now()), now()) where id = p_grant;
end; $$;

create or replace function private.reserve_credits(p_user uuid, p_amount integer, p_key text, p_job uuid, p_ttl_seconds integer)
returns uuid
language plpgsql set search_path = '' as $$
declare
  v_res uuid;
  v_need integer := p_amount;
  v_take integer;
  v_alloc jsonb := '[]'::jsonb;
  g record;
begin
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;
  perform private.lock_user(p_user);
  select id into v_res from public.credit_reservations where idempotency_key = p_key;
  if found then return v_res; end if;
  if private.available_credits(p_user) < p_amount then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;
  -- Subscription credits first (soonest expiry first), then purchased/other credits (oldest first).
  for g in
    select id, remaining from public.credit_grants
    where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now())
    order by case when source = 'subscription' then 0 else 1 end, expires_at asc nulls last, created_at asc
    for update
  loop
    exit when v_need = 0;
    v_take := least(g.remaining, v_need);
    update public.credit_grants set remaining = remaining - v_take where id = g.id;
    v_alloc := v_alloc || jsonb_build_array(jsonb_build_object('grant_id', g.id, 'amount', v_take));
    v_need := v_need - v_take;
  end loop;
  if v_need > 0 then raise exception 'insufficient_credits' using errcode = 'P0001'; end if;
  insert into public.credit_reservations (user_id, job_id, amount, allocations, idempotency_key, expires_at)
  values (p_user, p_job, p_amount, v_alloc, p_key, now() + make_interval(secs => p_ttl_seconds))
  returning id into v_res;
  insert into public.credit_ledger (user_id, entry_type, delta_available, delta_held, reservation_id, job_id, description)
  values (p_user, 'reservation', -p_amount, p_amount, v_res, p_job, 'Credits reserved');
  return v_res;
end; $$;

create or replace function private.settle_reservation(p_res uuid)
returns void language plpgsql set search_path = '' as $$
declare r record;
begin
  select * into r from public.credit_reservations where id = p_res for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if r.status = 'settled' then return; end if;
  if r.status <> 'active' then raise exception 'reservation_not_active'; end if;
  update public.credit_reservations set status = 'settled', resolved_at = now() where id = p_res;
  insert into public.credit_ledger (user_id, entry_type, delta_available, delta_held, reservation_id, job_id, description, metadata)
  values (r.user_id, 'deduction', 0, -r.amount, r.id, r.job_id, 'Credits charged', jsonb_build_object('amount', r.amount));
end; $$;

-- Returns credits to their original grants. Credits whose grant has expired in the meantime are not restored (no rollover).
create or replace function private.release_reservation(p_res uuid, p_reason text)
returns integer language plpgsql set search_path = '' as $$
declare
  r record;
  a jsonb;
  v_returned integer := 0;
  v_lost integer := 0;
  v_grant record;
begin
  select * into r from public.credit_reservations where id = p_res for update;
  if not found or r.status <> 'active' then return 0; end if;
  for a in select * from jsonb_array_elements(r.allocations) loop
    select * into v_grant from public.credit_grants where id = (a ->> 'grant_id')::uuid for update;
    if found and (v_grant.expires_at is null or v_grant.expires_at > now()) then
      update public.credit_grants set remaining = remaining + (a ->> 'amount')::integer where id = v_grant.id;
      v_returned := v_returned + (a ->> 'amount')::integer;
    else
      v_lost := v_lost + (a ->> 'amount')::integer;
    end if;
  end loop;
  update public.credit_reservations set status = 'released', resolved_at = now() where id = p_res;
  insert into public.credit_ledger (user_id, entry_type, delta_available, delta_held, reservation_id, job_id, description, metadata)
  values (r.user_id, 'release', v_returned, -r.amount, r.id, r.job_id, p_reason, jsonb_build_object('expired_not_restored', v_lost));
  return v_returned;
end; $$;

-- ---------------------------------------------------------------- service API: credits & billing
create or replace function public.credit_summary(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'subscription', coalesce(sum(remaining) filter (where source = 'subscription'), 0),
    'purchased', coalesce(sum(remaining) filter (where source <> 'subscription'), 0),
    'total', coalesce(sum(remaining), 0),
    'held', (select coalesce(sum(amount), 0) from public.credit_reservations where user_id = p_user and status = 'active'),
    'subscription_expires_at', min(expires_at) filter (where source = 'subscription')
  )
  from public.credit_grants
  where user_id = p_user and remaining > 0 and (expires_at is null or expires_at > now());
$$;

create or replace function public.grant_credits(p_user uuid, p_source text, p_amount integer, p_expires timestamptz, p_key text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return private.grant_credits(p_user, p_source, p_amount, p_expires, p_key,
    case p_source when 'purchase' then 'purchase' when 'subscription' then 'allocation' when 'refund' then 'refund' else 'adjustment' end,
    p_description);
end; $$;

create or replace function private.allocate_subscription(p_user uuid, p_amount integer, p_period_end timestamptz, p_key text, p_ref text)
returns uuid language plpgsql set search_path = '' as $$
declare g record; v_grant uuid;
begin
  perform private.lock_user(p_user);
  select id into v_grant from public.credit_grants where idempotency_key = p_key;
  if found then return v_grant; end if;
  -- A new period replaces the previous one; unused subscription credits do not roll over.
  for g in select id from public.credit_grants where user_id = p_user and source = 'subscription' and remaining > 0 loop
    perform private.expire_grant(g.id, 'Subscription period ended');
  end loop;
  return private.grant_credits(p_user, 'subscription', p_amount, p_period_end, p_key, 'allocation', 'Subscription credits for new billing period', p_ref);
end; $$;

create or replace function private.revoke_credits(p_user uuid, p_amount integer, p_key text, p_description text)
returns integer language plpgsql set search_path = '' as $$
declare g record; v_need integer := p_amount; v_take integer;
begin
  perform private.lock_user(p_user);
  if exists (select 1 from public.credit_ledger where idempotency_key = p_key) then return 0; end if;
  for g in select id, remaining from public.credit_grants where user_id = p_user and source = 'purchase' and remaining > 0 order by created_at desc for update loop
    exit when v_need = 0;
    v_take := least(g.remaining, v_need);
    update public.credit_grants set remaining = remaining - v_take where id = g.id;
    v_need := v_need - v_take;
  end loop;
  insert into public.credit_ledger (user_id, entry_type, delta_available, idempotency_key, description, metadata)
  values (p_user, 'revocation', -(p_amount - v_need), p_key, p_description, jsonb_build_object('requested', p_amount, 'unrecoverable', v_need));
  return p_amount - v_need;
end; $$;

/**
 * Applies one verified Stripe event exactly once. p_action is computed by the
 * webhook handler from the verified event (and Stripe API reads):
 *   {kind:'purchase', user_id, credits, ref}
 *   {kind:'subscription', user_id, subscription_id, plan, status, price_id,
 *    period_start, period_key, period_end, cancel_at_period_end, allocate_credits}
 *   {kind:'revoke_purchase', user_id, credits, ref}
 *   {kind:'customer', user_id, customer_id}
 *   {kind:'noop'}
 * Returns false when the event was already processed.
 */
create or replace function public.process_billing_event(p_event_id text, p_type text, p_created timestamptz, p_action jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := nullif(p_action ->> 'user_id', '')::uuid;
  v_kind text := p_action ->> 'kind';
  v_sub record;
begin
  insert into public.processed_billing_events (event_id, event_type, event_created)
  values (p_event_id, p_type, p_created)
  on conflict (event_id) do nothing;
  if not found then return false; end if;

  if v_kind = 'customer' then
    insert into public.billing_customers (user_id, stripe_customer_id) values (v_user, p_action ->> 'customer_id')
    on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id;

  elsif v_kind = 'purchase' then
    perform private.grant_credits(v_user, 'purchase', (p_action ->> 'credits')::integer, null,
      'purchase:' || (p_action ->> 'ref'), 'purchase', 'Credit pack purchase', p_action ->> 'ref');

  elsif v_kind = 'revoke_purchase' then
    perform private.revoke_credits(v_user, (p_action ->> 'credits')::integer, 'revoke:' || (p_action ->> 'ref'), 'Credit pack refunded');

  elsif v_kind = 'subscription' then
    select * into v_sub from public.subscriptions where id = p_action ->> 'subscription_id' for update;
    -- Ignore state older than what we already applied (out-of-order delivery).
    if not found or v_sub.last_event_at <= p_created then
      insert into public.subscriptions (id, user_id, plan, status, price_id, current_period_start, current_period_end, cancel_at_period_end, last_event_at)
      values (p_action ->> 'subscription_id', v_user, p_action ->> 'plan', p_action ->> 'status', p_action ->> 'price_id',
              (p_action ->> 'period_start')::timestamptz, (p_action ->> 'period_end')::timestamptz,
              coalesce((p_action ->> 'cancel_at_period_end')::boolean, false), p_created)
      on conflict (id) do update set
        plan = excluded.plan, status = excluded.status, price_id = excluded.price_id,
        current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end, last_event_at = excluded.last_event_at, updated_at = now();
    end if;
    -- Credits are granted once per (subscription, period), only for paid periods, regardless of event order.
    if coalesce((p_action ->> 'allocate_credits')::integer, 0) > 0 then
      perform private.allocate_subscription(v_user, (p_action ->> 'allocate_credits')::integer, (p_action ->> 'period_end')::timestamptz,
        'sub:' || (p_action ->> 'subscription_id') || ':' || coalesce(p_action ->> 'period_key', p_action ->> 'period_start'), p_action ->> 'subscription_id');
    end if;
  end if;
  return true;
end; $$;

-- ---------------------------------------------------------------- service API: jobs
create or replace function public.enqueue_job(
  p_user uuid, p_project uuid, p_kind text, p_input jsonb, p_cost integer, p_key text,
  p_max_concurrent integer, p_max_per_hour integer, p_reservation_ttl integer, p_max_attempts integer
) returns public.generation_jobs
language plpgsql security definer set search_path = '' as $$
declare v_job public.generation_jobs; v_res uuid;
begin
  perform private.lock_user(p_user);
  select * into v_job from public.generation_jobs where user_id = p_user and idempotency_key = p_key;
  if found then return v_job; end if;
  if not exists (select 1 from public.projects where id = p_project and user_id = p_user) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.generation_jobs where user_id = p_user and status in ('queued', 'running', 'validating')) >= p_max_concurrent then
    raise exception 'concurrency_limit' using errcode = 'P0001';
  end if;
  if (select count(*) from public.generation_jobs where user_id = p_user and created_at > now() - interval '1 hour') >= p_max_per_hour then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.generation_jobs (user_id, project_id, kind, input, cost, idempotency_key, max_attempts)
  values (p_user, p_project, p_kind, p_input, p_cost, p_key, p_max_attempts)
  returning * into v_job;
  if p_cost > 0 then
    v_res := private.reserve_credits(p_user, p_cost, 'job:' || v_job.id::text, v_job.id, p_reservation_ttl);
    update public.generation_jobs set reservation_id = v_res where id = v_job.id returning * into v_job;
  end if;
  return v_job;
end; $$;

create or replace function public.claim_job(p_worker text, p_lease_seconds integer, p_job uuid default null)
returns setof public.generation_jobs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.generation_jobs j set
    status = 'running', stage = 'starting', locked_by = p_worker,
    locked_until = now() + make_interval(secs => p_lease_seconds),
    attempts = j.attempts + 1, started_at = coalesce(j.started_at, now())
  where j.id = (
    select id from public.generation_jobs
    where (p_job is null or id = p_job)
      and not cancel_requested
      and attempts < max_attempts
      and (status = 'queued' or (status in ('running', 'validating') and locked_until < now()))
    order by created_at
    for update skip locked
    limit 1
  )
  returning j.*;
end; $$;

create or replace function public.heartbeat_job(p_job uuid, p_worker text, p_stage text, p_lease_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_cancel boolean;
begin
  update public.generation_jobs set
    stage = p_stage,
    status = case when p_stage = 'validating' then 'validating' else 'running' end,
    locked_until = now() + make_interval(secs => p_lease_seconds)
  where id = p_job and locked_by = p_worker and status in ('running', 'validating')
  returning cancel_requested into v_cancel;
  if not found then raise exception 'job_not_owned'; end if;
  return v_cancel;
end; $$;

/** Atomically saves the version, settles credits, and completes the job. */
create or replace function public.complete_job(p_job uuid, p_worker text, p_version jsonb, p_message text, p_sync_config boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs; v_version uuid;
begin
  select * into j from public.generation_jobs where id = p_job for update;
  if not found or j.status not in ('running', 'validating') or j.locked_by is distinct from p_worker then
    raise exception 'job_not_owned';
  end if;
  if j.cancel_requested then
    if j.reservation_id is not null then perform private.release_reservation(j.reservation_id, 'Generation canceled'); end if;
    update public.generation_jobs set status = 'canceled', stage = 'canceled', finished_at = now(), locked_by = null, locked_until = null where id = p_job;
    return null;
  end if;
  v_version := private.insert_version(j.user_id, j.project_id, p_version, j.id, p_message, p_sync_config);
  if j.reservation_id is not null then perform private.settle_reservation(j.reservation_id); end if;
  update public.generation_jobs set status = 'completed', stage = 'completed', result_version_id = v_version,
    finished_at = now(), locked_by = null, locked_until = null, error = null
  where id = p_job;
  return v_version;
end; $$;

create or replace function public.fail_job(p_job uuid, p_worker text, p_error text, p_retryable boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs; v_status text;
begin
  select * into j from public.generation_jobs where id = p_job for update;
  if not found then raise exception 'job_not_found'; end if;
  if j.status in ('completed', 'failed', 'canceled') then return j.status; end if;
  if j.locked_by is distinct from p_worker then raise exception 'job_not_owned'; end if;
  if p_retryable and j.attempts < j.max_attempts and not j.cancel_requested then
    update public.generation_jobs set status = 'queued', stage = 'retrying', locked_by = null, locked_until = null, error = left(p_error, 1000) where id = p_job;
    return 'queued';
  end if;
  v_status := case when j.cancel_requested then 'canceled' else 'failed' end;
  if j.reservation_id is not null then
    perform private.release_reservation(j.reservation_id, case when v_status = 'canceled' then 'Generation canceled' else 'Generation failed — credits returned' end);
  end if;
  update public.generation_jobs set status = v_status, stage = v_status, error = left(p_error, 1000), finished_at = now(), locked_by = null, locked_until = null where id = p_job;
  return v_status;
end; $$;

create or replace function public.cancel_job(p_user uuid, p_job uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id = p_job and user_id = p_user for update;
  if not found then raise exception 'job_not_found' using errcode = 'P0002'; end if;
  if j.status = 'queued' then
    if j.reservation_id is not null then perform private.release_reservation(j.reservation_id, 'Generation canceled'); end if;
    update public.generation_jobs set status = 'canceled', stage = 'canceled', cancel_requested = true, finished_at = now() where id = p_job;
    return 'canceled';
  elsif j.status in ('running', 'validating') then
    update public.generation_jobs set cancel_requested = true where id = p_job;
    return 'canceling';
  end if;
  return j.status;
end; $$;

/** Periodic maintenance: time out stuck jobs, release orphaned reservations, expire subscription credits. */
create or replace function public.sweep_jobs(p_timeout_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j record; r record; g record; v_jobs integer := 0; v_res integer := 0; v_exp integer := 0;
begin
  for j in
    select id, reservation_id, attempts, max_attempts, status, locked_until, created_at from public.generation_jobs
    where status in ('queued', 'running', 'validating')
      and (created_at < now() - make_interval(secs => p_timeout_seconds)
           or (status <> 'queued' and locked_until < now() and attempts >= max_attempts))
    for update skip locked
  loop
    if j.reservation_id is not null then perform private.release_reservation(j.reservation_id, 'Generation timed out — credits returned'); end if;
    update public.generation_jobs set status = 'failed', stage = 'failed', finished_at = now(), locked_by = null, locked_until = null,
      error = case when j.created_at < now() - make_interval(secs => p_timeout_seconds) then 'Timed out' else 'Worker stopped responding' end
    where id = j.id;
    v_jobs := v_jobs + 1;
  end loop;
  for r in
    select cr.id from public.credit_reservations cr
    left join public.generation_jobs gj on gj.id = cr.job_id
    where cr.status = 'active' and cr.expires_at < now()
      and (gj.id is null or gj.status in ('completed', 'failed', 'canceled'))
  loop
    perform private.release_reservation(r.id, 'Reservation expired — credits returned');
    v_res := v_res + 1;
  end loop;
  for g in select id from public.credit_grants where remaining > 0 and expires_at is not null and expires_at <= now() loop
    perform private.expire_grant(g.id, 'Credits expired at end of billing period');
    v_exp := v_exp + 1;
  end loop;
  return jsonb_build_object('jobs_failed', v_jobs, 'reservations_released', v_res, 'grants_expired', v_exp);
end; $$;

-- ---------------------------------------------------------------- versions
create or replace function private.insert_version(p_user uuid, p_project uuid, p_version jsonb, p_job uuid, p_message text, p_sync_config boolean)
returns uuid language plpgsql set search_path = '' as $$
declare v_number integer; v_id uuid; v_conv uuid;
begin
  perform 1 from public.projects where id = p_project and user_id = p_user for update;
  if not found then raise exception 'project_not_found'; end if;
  select coalesce(max(number), 0) + 1 into v_number from public.project_versions where project_id = p_project;
  insert into public.project_versions (project_id, user_id, number, parent_version_id, kind, prompt, config, spec, html, asset_refs, credit_charge, job_id, provider, notes)
  values (
    p_project, p_user, v_number, nullif(p_version ->> 'parent_version_id', '')::uuid, p_version ->> 'kind',
    coalesce(p_version ->> 'prompt', ''), p_version -> 'config', p_version -> 'spec', p_version ->> 'html',
    coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(coalesce(p_version -> 'asset_refs', '[]'::jsonb))), '{}'),
    coalesce((p_version ->> 'credit_charge')::integer, 0), p_job, coalesce(p_version ->> 'provider', 'rules'),
    coalesce(p_version -> 'notes', '[]'::jsonb)
  ) returning id into v_id;
  update public.projects set current_version_id = v_id, updated_at = now() where id = p_project;
  if p_sync_config then
    update public.project_configs set config = p_version -> 'config', applied_config = p_version -> 'config' where project_id = p_project;
  else
    update public.project_configs set applied_config = p_version -> 'config' where project_id = p_project;
  end if;
  if p_message is not null and p_message <> '' then
    select id into v_conv from public.conversations where project_id = p_project;
    if v_conv is not null then
      insert into public.messages (conversation_id, project_id, user_id, role, content, metadata)
      values (v_conv, p_project, p_user, 'assistant', left(p_message, 8000),
              jsonb_build_object('version_id', v_id, 'version_number', v_number, 'job_id', p_job, 'credit_charge', coalesce((p_version ->> 'credit_charge')::integer, 0)));
    end if;
  end if;
  return v_id;
end; $$;

/** Free actions (restore, re-assembly, repair) create versions directly without a job. */
create or replace function public.create_free_version(p_user uuid, p_project uuid, p_version jsonb, p_message text, p_sync_config boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((p_version ->> 'credit_charge')::integer, 0) <> 0 then raise exception 'free_version_must_cost_zero'; end if;
  return private.insert_version(p_user, p_project, p_version, null, p_message, p_sync_config);
end; $$;

create or replace function public.add_assistant_message(p_user uuid, p_project uuid, p_content text, p_metadata jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_conv uuid; v_id uuid;
begin
  select id into v_conv from public.conversations where project_id = p_project and user_id = p_user;
  if not found then raise exception 'project_not_found'; end if;
  insert into public.messages (conversation_id, project_id, user_id, role, content, metadata)
  values (v_conv, p_project, p_user, 'assistant', left(p_content, 8000), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.check_rate_limit(p_user uuid, p_bucket text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_user(p_user);
  if (select count(*) from public.rate_limit_events where user_id = p_user and bucket = p_bucket
      and created_at > now() - make_interval(secs => p_window_seconds)) >= p_max then
    return false;
  end if;
  insert into public.rate_limit_events (user_id, bucket) values (p_user, p_bucket);
  delete from public.rate_limit_events where user_id = p_user and bucket = p_bucket and created_at < now() - interval '1 day';
  return true;
end; $$;

-- ---------------------------------------------------------------- privileges
do $$
declare f text;
begin
  foreach f in array array[
    'public.credit_summary(uuid)',
    'public.grant_credits(uuid,text,integer,timestamptz,text,text)',
    'public.process_billing_event(text,text,timestamptz,jsonb)',
    'public.enqueue_job(uuid,uuid,text,jsonb,integer,text,integer,integer,integer,integer)',
    'public.claim_job(text,integer,uuid)',
    'public.heartbeat_job(uuid,text,text,integer)',
    'public.complete_job(uuid,text,jsonb,text,boolean)',
    'public.fail_job(uuid,text,text,boolean)',
    'public.cancel_job(uuid,uuid)',
    'public.sweep_jobs(integer)',
    'public.create_free_version(uuid,uuid,jsonb,text,boolean)',
    'public.add_assistant_message(uuid,uuid,text,jsonb)',
    'public.check_rate_limit(uuid,text,integer,integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on all functions in schema private to service_role;


-- ===== backfill: profiles for users who signed up before setup =====
insert into public.profiles (id, display_name)
select u.id, split_part(u.email, '@', 1) from auth.users u
on conflict (id) do nothing;
