create table if not exists public.prospect_keyword_presets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  keyword text not null unique,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospect_leads (
  id uuid primary key default gen_random_uuid(),
  google_place_id text not null unique,
  source text not null default 'GOOGLE_PLACES',
  display_name text not null,
  normalized_name text not null,
  primary_category text,
  normalized_primary_category text,
  rating numeric(4, 2),
  user_rating_count integer not null default 0,
  phone text,
  normalized_phone text,
  website_url text,
  address text,
  state text not null,
  city text,
  maps_url text,
  score numeric(6, 2) not null default 0,
  status text not null default 'NEW',
  assigned_to_user_id uuid,
  assigned_to_name text,
  assigned_to_role text,
  claimed_at timestamptz,
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  last_contact_by_user_id uuid,
  last_contact_by_name text,
  discard_reason text,
  last_google_basic_sync_at timestamptz,
  last_google_detail_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source = 'GOOGLE_PLACES'),
  check (status in ('NEW', 'CLAIMED', 'CONTACTED', 'DISCARDED'))
);

create index if not exists idx_prospect_leads_status on public.prospect_leads(status);
create index if not exists idx_prospect_leads_assigned_to_user_id on public.prospect_leads(assigned_to_user_id);
create index if not exists idx_prospect_leads_state_city on public.prospect_leads(state, city);
create index if not exists idx_prospect_leads_score on public.prospect_leads(score desc);
create index if not exists idx_prospect_leads_normalized_name on public.prospect_leads(normalized_name);

create table if not exists public.prospect_contact_attempts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.prospect_leads(id) on delete cascade,
  seller_user_id uuid not null,
  seller_name text not null,
  seller_role text not null,
  channel text not null,
  contact_type text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (channel in ('WHATSAPP', 'PHONE', 'SITE', 'OTHER')),
  check (contact_type in ('FIRST_CONTACT', 'FOLLOW_UP', 'NO_RESPONSE', 'INTERESTED', 'DISQUALIFIED'))
);

create index if not exists idx_prospect_contact_attempts_lead_id on public.prospect_contact_attempts(lead_id, created_at desc);
create index if not exists idx_prospect_contact_attempts_seller_user_id on public.prospect_contact_attempts(seller_user_id, created_at desc);

create table if not exists public.prospect_api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  requested_by_user_id uuid not null,
  requested_by_name text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (sku in ('TEXT_SEARCH_PRO', 'PLACE_DETAILS_ENTERPRISE'))
);

create index if not exists idx_prospect_api_usage_logs_sku_created_at on public.prospect_api_usage_logs(sku, created_at desc);

create table if not exists public.prospect_search_snapshots (
  query_signature text primary key,
  keyword text not null,
  state text not null,
  city text,
  result_place_ids text[] not null default array[]::text[],
  last_fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prospect_search_snapshots_updated_at on public.prospect_search_snapshots(updated_at desc);

drop trigger if exists set_prospect_keyword_presets_updated_at on public.prospect_keyword_presets;
create trigger set_prospect_keyword_presets_updated_at before update on public.prospect_keyword_presets for each row execute function public.set_updated_at();

drop trigger if exists set_prospect_leads_updated_at on public.prospect_leads;
create trigger set_prospect_leads_updated_at before update on public.prospect_leads for each row execute function public.set_updated_at();

drop trigger if exists set_prospect_search_snapshots_updated_at on public.prospect_search_snapshots;
create trigger set_prospect_search_snapshots_updated_at before update on public.prospect_search_snapshots for each row execute function public.set_updated_at();

insert into public.prospect_keyword_presets (label, keyword, description, sort_order)
values
  ('Assistencia Tecnica', 'assistencia tecnica', 'Busca ampla para assistencias tecnicas do nicho.', 10),
  ('Distribuidora de Telas', 'distribuidora de telas', 'Distribuidores e atacados com foco em telas e reposicao.', 20),
  ('Troca de Tela', 'troca de tela', 'Leads com forte aderencia a reparo rapido e manutencao.', 30)
on conflict (keyword) do update
set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  updated_at = now();

delete from public.prospect_keyword_presets
where keyword in (
  'assistencia tecnica iphone',
  'assistencia tecnica celular',
  'loja de celular',
  'loja de acessorios para celular',
  'peliculas para celular',
  'assistencia tecnica samsung',
  'revenda de celulares'
);

alter table public.prospect_keyword_presets enable row level security;
alter table public.prospect_leads enable row level security;
alter table public.prospect_contact_attempts enable row level security;
alter table public.prospect_api_usage_logs enable row level security;
alter table public.prospect_search_snapshots enable row level security;
