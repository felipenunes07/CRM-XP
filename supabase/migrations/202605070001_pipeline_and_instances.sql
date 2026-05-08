-- Pipeline & WhatsApp Multi-Instance tables

-- WhatsApp instances (multi-number support)
create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  instance_name varchar(100) not null unique,
  display_label varchar(200) not null,
  phone_number varchar(20),
  evolution_base_url text not null,
  evolution_api_key text not null,
  status varchar(20) not null default 'ACTIVE',
  is_default boolean not null default false,
  assigned_user_id uuid,
  assigned_user_name varchar(200),
  last_health_check_at timestamptz,
  last_health_status varchar(20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pipeline stages (configurable columns)
create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  sort_order int not null default 0,
  color varchar(7) default '#6366f1',
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now()
);

-- Default stages
insert into public.pipeline_stages (name, sort_order, color, is_won, is_lost) values
  ('Contato Inicial', 0, '#8b5cf6', false, false),
  ('Orcamento Enviado', 1, '#3b82f6', false, false),
  ('Negociacao', 2, '#f59e0b', false, false),
  ('Fechado Ganho', 3, '#22c55e', true, false),
  ('Perdido', 4, '#ef4444', false, true)
on conflict do nothing;

-- Deals (negotiations)
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  title varchar(300) not null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_code varchar(50),
  customer_display_name varchar(300),
  stage_id uuid not null references public.pipeline_stages(id),
  assigned_to uuid,
  assigned_to_name varchar(200),
  whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  whatsapp_jid varchar(200),
  expected_value numeric(12,2) default 0,
  expected_close_date date,
  priority varchar(10) default 'MEDIUM',
  notes text default '',
  lost_reason text,
  won_at timestamptz,
  lost_at timestamptz,
  last_activity_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deals_stage_id on public.deals(stage_id);
create index if not exists idx_deals_customer_id on public.deals(customer_id);
create index if not exists idx_deals_assigned_to on public.deals(assigned_to);

-- Deal activities / timeline
create table if not exists public.deal_activities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  activity_type varchar(30) not null,
  actor_user_id uuid,
  actor_name varchar(200),
  content text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_deal_activities_deal_id on public.deal_activities(deal_id);

-- Triggers
drop trigger if exists set_whatsapp_instances_updated_at on public.whatsapp_instances;
create trigger set_whatsapp_instances_updated_at before update on public.whatsapp_instances for each row execute function public.set_updated_at();

drop trigger if exists set_deals_updated_at on public.deals;
create trigger set_deals_updated_at before update on public.deals for each row execute function public.set_updated_at();
