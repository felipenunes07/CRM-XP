alter table public.whatsapp_instances
  add column if not exists profile_picture_url text;

create index if not exists idx_whatsapp_instances_instance_name
  on public.whatsapp_instances(instance_name);
