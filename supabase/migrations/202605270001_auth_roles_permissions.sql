create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'viewer',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  constraint profiles_role_check check (role in ('admin', 'vendas', 'financeiro', 'operacional', 'viewer'))
);

create table if not exists public.permissions (
  key text primary key,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role text not null,
  permission_key text not null references public.permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission_key),
  constraint role_permissions_role_check check (role in ('admin', 'vendas', 'financeiro', 'operacional', 'viewer'))
);

create table if not exists public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  allowed boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop function if exists public.current_app_role() cascade;
drop function if exists public.app_has_permission(text) cascade;
drop function if exists public.normalize_app_role(text) cascade;
drop function if exists public.handle_auth_user() cascade;

create or replace function public.normalize_app_role(input_role text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized text := lower(coalesce(trim(input_role), ''));
begin
  if normalized in ('admin') then
    return 'admin';
  end if;
  if normalized in ('vendas', 'seller', 'sales') then
    return 'vendas';
  end if;
  if normalized in ('financeiro', 'finance', 'financial') then
    return 'financeiro';
  end if;
  if normalized in ('operacional', 'operations', 'operator', 'manager') then
    return 'operacional';
  end if;
  if normalized in ('viewer', 'leitor', 'read_only') then
    return 'viewer';
  end if;
  return 'viewer';
end;
$$;

create or replace function public.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_name text;
  profile_role text;
begin
  profile_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(new.email, '@', 1),
    'Usuario'
  );

  profile_role := public.normalize_app_role(new.raw_user_meta_data ->> 'role');

  insert into public.profiles (id, email, full_name, role, is_active)
  values (new.id, new.email, profile_name, profile_role, true)
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      updated_at = now();

  return new;
end;
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
$$;

create or replace function public.app_has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select p.id, p.role
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
  ),
  role_allowed as (
    select true as allowed
    from current_profile cp
    join public.role_permissions rp on rp.role = cp.role
    where rp.permission_key = app_has_permission.permission_key
  ),
  user_override as (
    select up.allowed
    from current_profile cp
    join public.user_permissions up on up.user_id = cp.id
    where up.permission_key = app_has_permission.permission_key
  )
  select coalesce((select allowed from user_override limit 1), exists(select 1 from role_allowed), false)
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_auth_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_user_permissions_updated_at on public.user_permissions;
create trigger set_user_permissions_updated_at
before update on public.user_permissions
for each row execute function public.set_updated_at();

insert into public.permissions (key, name, description)
values
  ('dashboard.view', 'Dashboard geral', 'Visualizar os indicadores principais do CRM.'),
  ('commercial.view', 'Ferramentas comerciais', 'Acessar clientes, agenda, pipeline e prospeccao.'),
  ('commercial.manage', 'Gestao comercial', 'Criar e alterar registros comerciais.'),
  ('messages.view', 'Mensagens', 'Visualizar mensagens, disparos e conversas.'),
  ('messages.manage', 'Gestao de mensagens', 'Criar modelos, campanhas e responder conversas.'),
  ('finance.view', 'Financeiro', 'Visualizar credito, comprovantes e informacoes financeiras.'),
  ('finance.manage', 'Gestao financeira', 'Atualizar metas e dados financeiros.'),
  ('reports.view', 'Relatorios', 'Visualizar relatorios e analises.'),
  ('settings.manage', 'Configuracoes', 'Alterar configuracoes internas do CRM.'),
  ('admin.panel.view', 'Painel administrativo', 'Acessar area administrativa.'),
  ('admin.users.manage', 'Gestao de usuarios', 'Criar, editar, desativar usuarios e redefinir acessos.'),
  ('automations.view', 'Automacoes', 'Visualizar automacoes.'),
  ('automations.manage', 'Gestao de automacoes', 'Criar, editar, executar e aprovar automacoes.'),
  ('integrations.manage', 'Integracoes', 'Gerenciar integracoes e instancias externas.')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description;

insert into public.role_permissions (role, permission_key)
select 'admin', key from public.permissions
on conflict do nothing;

insert into public.role_permissions (role, permission_key)
values
  ('vendas', 'dashboard.view'),
  ('vendas', 'commercial.view'),
  ('vendas', 'commercial.manage'),
  ('vendas', 'messages.view'),
  ('vendas', 'messages.manage'),
  ('vendas', 'reports.view'),
  ('vendas', 'automations.view'),
  ('financeiro', 'dashboard.view'),
  ('financeiro', 'finance.view'),
  ('financeiro', 'finance.manage'),
  ('financeiro', 'reports.view'),
  ('operacional', 'dashboard.view'),
  ('operacional', 'commercial.view'),
  ('operacional', 'messages.view'),
  ('operacional', 'reports.view'),
  ('operacional', 'automations.view'),
  ('operacional', 'integrations.manage'),
  ('viewer', 'dashboard.view'),
  ('viewer', 'reports.view')
on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.app_has_permission('admin.users.manage'));

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert"
on public.profiles
for insert
to authenticated
with check (public.app_has_permission('admin.users.manage'));

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
on public.profiles
for update
to authenticated
using (public.app_has_permission('admin.users.manage'))
with check (public.app_has_permission('admin.users.manage'));

drop policy if exists "permissions_select_authenticated" on public.permissions;
create policy "permissions_select_authenticated"
on public.permissions
for select
to authenticated
using (true);

drop policy if exists "role_permissions_select_authenticated" on public.role_permissions;
create policy "role_permissions_select_authenticated"
on public.role_permissions
for select
to authenticated
using (true);

drop policy if exists "user_permissions_select_own_or_admin" on public.user_permissions;
create policy "user_permissions_select_own_or_admin"
on public.user_permissions
for select
to authenticated
using (user_id = auth.uid() or public.app_has_permission('admin.users.manage'));

drop policy if exists "user_permissions_admin_all" on public.user_permissions;
create policy "user_permissions_admin_all"
on public.user_permissions
for all
to authenticated
using (public.app_has_permission('admin.users.manage'))
with check (public.app_has_permission('admin.users.manage'));

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.normalize_app_role(text) from public, anon, authenticated;
revoke execute on function public.handle_auth_user() from public, anon, authenticated;
revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.app_has_permission(text) from public, anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.app_has_permission(text) to authenticated;
grant select on public.permissions to authenticated;
grant select on public.role_permissions to authenticated;
grant select on public.profiles to authenticated;
grant select on public.user_permissions to authenticated;
