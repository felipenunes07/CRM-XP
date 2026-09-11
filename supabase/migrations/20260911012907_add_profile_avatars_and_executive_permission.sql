alter table public.profiles
  add column if not exists profile_avatar_url text;

comment on column public.profiles.profile_avatar_url is
  'URL da foto de perfil cadastrada por administrador; usada como avatar padrão no CRM.';

insert into public.permissions (key, name, description)
values ('reports.executive.view', 'Relatório executivo', 'Exibir o relatório executivo de vendas.')
on conflict (key) do update
set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role, permission_key)
values
  ('admin', 'reports.executive.view'),
  ('vendas', 'reports.executive.view'),
  ('financeiro', 'reports.executive.view'),
  ('operacional', 'reports.executive.view'),
  ('viewer', 'reports.executive.view')
on conflict do nothing;
