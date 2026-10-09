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
