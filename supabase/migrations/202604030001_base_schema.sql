create extension if not exists pgcrypto;
create extension if not exists unaccent;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'app_role'
  ) then
    create type public.app_role as enum ('ADMIN', 'MANAGER', 'SELLER');
  end if;
end
$$;

create table if not exists public.source_files (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  original_path text not null unique,
  file_name text not null,
  file_hash text not null,
  file_size_bytes bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid references public.source_files(id) on delete set null,
  status text not null,
  rows_seen integer not null default 0,
  rows_inserted integer not null default 0,
  rows_duplicated integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.sales_raw (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_file_id uuid references public.source_files(id) on delete set null,
  import_run_id uuid references public.import_runs(id) on delete set null,
  external_order_id text,
  external_customer_id text,
  sale_date date not null,
  item_description text not null,
  quantity numeric(14, 2) not null,
  customer_code text not null,
  unit_price numeric(14, 2) not null,
  line_total numeric(14, 2) not null,
  order_number text not null,
  sku text,
  customer_label text not null,
  attendant_name text,
  order_status text not null default 'VALID',
  order_updated_at timestamptz,
  fingerprint text not null unique,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_raw_customer_code on public.sales_raw(customer_code);
create index if not exists idx_sales_raw_order_number on public.sales_raw(order_number);
create index if not exists idx_sales_raw_sale_date on public.sales_raw(sale_date desc);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique,
  external_customer_id text unique,
  display_name text not null,
  normalized_name text not null,
  phone text,
  email text,
  internal_notes text not null default '',
  source_system_first text not null,
  last_attendant text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_normalized_name on public.customers(normalized_name);

create table if not exists public.customer_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  normalized_name text not null unique,
  color text not null default '#2956d7',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_label_assignments (
  customer_id uuid not null references public.customers(id) on delete cascade,
  label_id uuid not null references public.customer_labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, label_id)
);

create index if not exists idx_customer_label_assignments_customer_id on public.customer_label_assignments(customer_id);
create index if not exists idx_customer_label_assignments_label_id on public.customer_label_assignments(label_id);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  external_order_id text,
  order_number text not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  customer_code text not null,
  order_date date not null,
  total_amount numeric(14, 2) not null default 0,
  status text not null default 'VALID',
  item_count integer not null default 0,
  last_attendant text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_system, order_number, customer_code, order_date)
);

create index if not exists idx_orders_customer_id on public.orders(customer_id);
create index if not exists idx_orders_order_date on public.orders(order_date desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sale_raw_id uuid unique references public.sales_raw(id) on delete cascade,
  sku text,
  item_description text not null,
  quantity numeric(14, 2) not null,
  unit_price numeric(14, 2) not null,
  line_total numeric(14, 2) not null,
  attendant_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on public.order_items(order_id);

create table if not exists public.customer_snapshot (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  display_name text not null,
  customer_code text,
  last_purchase_at timestamptz,
  days_since_last_purchase integer,
  total_orders integer not null default 0,
  total_spent numeric(14, 2) not null default 0,
  avg_ticket numeric(14, 2) not null default 0,
  avg_days_between_orders numeric(14, 2),
  purchase_frequency_90d numeric(14, 2) not null default 0,
  frequency_drop_ratio numeric(14, 4) not null default 0,
  status text not null default 'INACTIVE',
  value_score numeric(6, 2) not null default 0,
  priority_score numeric(6, 2) not null default 0,
  predicted_next_purchase_at timestamptz,
  primary_insight text,
  insight_tags text[] not null default array[]::text[],
  last_attendant text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_snapshot_status on public.customer_snapshot(status);
create index if not exists idx_customer_snapshot_priority on public.customer_snapshot(priority_score desc);

create table if not exists public.sync_cursors (
  key text primary key,
  cursor_value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_seen integer not null default 0,
  records_inserted integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('reativacao', 'follow_up', 'promocao')),
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  template_id uuid references public.message_templates(id) on delete set null,
  destination text,
  message text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_balances_imported (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null,
  customer_label text not null,
  balance_amount numeric(14, 2) not null default 0,
  source_file_id uuid references public.source_files(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role public.app_role not null default 'MANAGER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.normalize_app_role(input_role text)
returns public.app_role
language plpgsql
immutable
as $$
declare
  normalized text := upper(coalesce(trim(input_role), ''));
begin
  if normalized = 'ADMIN' then
    return 'ADMIN';
  end if;

  if normalized = 'SELLER' then
    return 'SELLER';
  end if;

  return 'MANAGER';
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
  profile_role public.app_role;
begin
  profile_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(new.email, '@', 1),
    'Usuario'
  );

  profile_role := public.normalize_app_role(new.raw_user_meta_data ->> 'role');

  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, profile_name, profile_role)
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    role = excluded.role,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row
execute function public.handle_auth_user();

drop trigger if exists set_source_files_updated_at on public.source_files;
create trigger set_source_files_updated_at before update on public.source_files for each row execute function public.set_updated_at();

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at before update on public.customers for each row execute function public.set_updated_at();

drop trigger if exists set_customer_labels_updated_at on public.customer_labels;
create trigger set_customer_labels_updated_at before update on public.customer_labels for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

drop trigger if exists set_customer_snapshot_updated_at on public.customer_snapshot;
create trigger set_customer_snapshot_updated_at before update on public.customer_snapshot for each row execute function public.set_updated_at();

drop trigger if exists set_sync_cursors_updated_at on public.sync_cursors;
create trigger set_sync_cursors_updated_at before update on public.sync_cursors for each row execute function public.set_updated_at();

drop trigger if exists set_message_templates_updated_at on public.message_templates;
create trigger set_message_templates_updated_at before update on public.message_templates for each row execute function public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

alter table public.source_files enable row level security;
alter table public.import_runs enable row level security;
alter table public.sales_raw enable row level security;
alter table public.customers enable row level security;
alter table public.customer_labels enable row level security;
alter table public.customer_label_assignments enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.customer_snapshot enable row level security;
alter table public.sync_cursors enable row level security;
alter table public.sync_runs enable row level security;
alter table public.message_templates enable row level security;
alter table public.message_logs enable row level security;
alter table public.customer_balances_imported enable row level security;
alter table public.profiles enable row level security;
