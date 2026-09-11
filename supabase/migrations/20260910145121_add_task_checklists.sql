alter table public.tasks
  add column if not exists checklist jsonb not null default '[]'::jsonb;

alter table public.tasks
  drop constraint if exists tasks_checklist_array_check;
alter table public.tasks
  add constraint tasks_checklist_array_check
  check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 30);

comment on column public.tasks.checklist is
  'Lista validada pelo backend: [{id: string, text: string, done: boolean}].';
