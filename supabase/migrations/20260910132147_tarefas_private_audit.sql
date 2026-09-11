-- Tarefas passam a usar os mesmos usuarios autenticados do CRM. O backend e o
-- unico ponto de acesso: anon/authenticated nao recebem acesso direto pelo Data API.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text not null default '',
  audience text not null default 'user',
  assignee_user_id uuid references public.profiles(id) on delete restrict,
  due_date date not null,
  due_time time,
  status text not null default 'todo',
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deleted_at timestamptz,
  version integer not null default 1,
  constraint tasks_audience_check check (audience in ('user', 'team')),
  constraint tasks_status_check check (status in ('todo', 'doing', 'done')),
  constraint tasks_assignee_check check (
    (audience = 'team' and assignee_user_id is null)
    or (audience = 'user' and assignee_user_id is not null)
  )
);

create index if not exists tasks_assignee_user_id_idx
  on public.tasks (assignee_user_id) where deleted_at is null;
create index if not exists tasks_audience_idx
  on public.tasks (audience) where deleted_at is null;
create index if not exists tasks_deadline_idx
  on public.tasks (due_date, due_time) where deleted_at is null;

create table if not exists public.task_audit_logs (
  id bigserial primary key,
  task_id uuid references public.tasks(id) on delete set null,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  task_title text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_audit_logs_task_id_idx
  on public.task_audit_logs (task_id, created_at desc);
create index if not exists task_audit_logs_actor_user_id_idx
  on public.task_audit_logs (actor_user_id, created_at desc);
create index if not exists task_audit_logs_created_at_idx
  on public.task_audit_logs (created_at desc);

alter table public.tasks enable row level security;
alter table public.task_audit_logs enable row level security;

revoke all on table public.tasks from anon, authenticated;
revoke all on table public.task_audit_logs from anon, authenticated;
revoke all on sequence public.task_audit_logs_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.tasks to service_role;
grant select, insert, update, delete on table public.task_audit_logs to service_role;
grant usage, select on sequence public.task_audit_logs_id_seq to service_role;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'vendas', 'financeiro', 'operacional', 'tarefas', 'viewer'));
alter table public.role_permissions drop constraint if exists role_permissions_role_check;
alter table public.role_permissions add constraint role_permissions_role_check
  check (role in ('admin', 'vendas', 'financeiro', 'operacional', 'tarefas', 'viewer'));

insert into public.permissions (key, name, description)
values ('tasks.view', 'Tarefas', 'Acessar o quadro de tarefas.')
on conflict (key) do update
set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role, permission_key)
values
  ('admin', 'tasks.view'),
  ('vendas', 'tasks.view'),
  ('financeiro', 'tasks.view'),
  ('operacional', 'tasks.view'),
  ('tarefas', 'tasks.view'),
  ('viewer', 'tasks.view')
on conflict do nothing;

create or replace function public.normalize_app_role(input_role text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized text := lower(coalesce(trim(input_role), ''));
begin
  if normalized = 'admin' then return 'admin'; end if;
  if normalized in ('vendas', 'seller', 'sales') then return 'vendas'; end if;
  if normalized in ('financeiro', 'finance', 'financial') then return 'financeiro'; end if;
  if normalized in ('operacional', 'operations', 'operator', 'manager') then return 'operacional'; end if;
  if normalized in ('tarefas', 'tasks', 'task_only') then return 'tarefas'; end if;
  return 'viewer';
end;
$$;

-- Preserva apenas as tarefas reais do quadro anterior. Registros enviados para
-- a Lixeira eram testes/apagados e ficam de fora.
with creator as (
  select id from public.profiles where role = 'admin' and is_active = true
  order by created_at asc limit 1
), assignee as (
  select id from public.profiles
  where is_active = true and lower(split_part(full_name, ' ', 1)) = 'thais'
  order by created_at asc limit 1
), legacy (id, title, notes, due_date, status, created_at, version) as (
  values
    ('cce521e1-5ae5-4d82-96ac-39042164096e'::uuid, 'chamar naiara', 'oferecer vv de bateria ,,,quero saber porque ela compra pouco,qual e a dificuldade', '2026-09-09'::date, 'doing', '2026-09-08T20:04:37.248Z'::timestamptz, 5),
    ('1c980327-d6b4-4d0a-a0c4-54f886bc91c7'::uuid, 'vendas do james', 'sistema james com as vendas', '2026-09-09'::date, 'doing', '2026-09-08T20:05:27.695Z'::timestamptz, 3)
)
insert into public.tasks (
  id, title, notes, audience, assignee_user_id, due_date, status,
  created_by_user_id, created_at, updated_at, version
)
select legacy.id, legacy.title, legacy.notes, 'user', assignee.id,
       legacy.due_date, legacy.status, creator.id, legacy.created_at, legacy.created_at, legacy.version
from legacy cross join creator cross join assignee
on conflict (id) do nothing;
