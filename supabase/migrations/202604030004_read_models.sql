create or replace function public.extract_display_name(label_value text, fallback_code text)
returns text
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(label_value, '')), '') is not null then trim(label_value)
    when nullif(trim(coalesce(fallback_code, '')), '') is not null then trim(fallback_code)
    else 'Cliente sem nome'
  end
$$;

create or replace function public.normalize_name(input_name text)
returns text
language sql
immutable
as $$
  select lower(trim(regexp_replace(unaccent(coalesce(input_name, '')), '\s+', ' ', 'g')))
$$;

create or replace function public.days_between(a timestamptz, b timestamptz)
returns integer
language sql
immutable
as $$
  select greatest(0, floor(extract(epoch from (a - b)) / 86400))::integer
$$;

create or replace function public.compute_frequency_drop(order_dates date[], reference_time timestamptz default now())
returns numeric
language sql
stable
as $$
  with counts as (
    select
      count(*) filter (where order_date >= (reference_time::date - 90))::numeric as recent_count,
      count(*) filter (where order_date >= (reference_time::date - 180) and order_date < (reference_time::date - 90))::numeric as previous_count
    from unnest(coalesce(order_dates, array[]::date[])) as order_date
  )
  select case
    when previous_count <= 0 then 0
    else round(least(100, greatest(0, ((previous_count - recent_count) / previous_count) * 100))) / 100
  end
  from counts
$$;

create or replace function public.refresh_customer_snapshots(p_customer_codes text[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  max_spent numeric := 1;
  max_orders integer := 1;
  high_value_threshold numeric := 0;
  aggregate_row record;
  total_spent numeric;
  total_orders integer;
  avg_ticket numeric;
  avg_gap numeric;
  last_purchase_at timestamptz;
  days_since_last_purchase integer;
  purchase_frequency_90d numeric;
  frequency_drop_ratio numeric;
  customer_status text;
  value_recency numeric;
  value_frequency numeric;
  value_monetary numeric;
  value_score numeric;
  predicted_next_purchase_at timestamptz;
  overdue_score numeric;
  contact_recency_score numeric;
  priority_score numeric;
  insight_tags text[];
  primary_insight text;
begin
  with aggregates as (
    select
      c.id as customer_id,
      c.customer_code,
      c.display_name,
      c.last_attendant,
      array_agg(o.order_date order by o.order_date asc) as order_dates,
      array_agg(o.total_amount order by o.order_date asc) as order_totals,
      sum(o.total_amount)::numeric as total_spent,
      count(*)::integer as total_orders
    from public.customers c
    join public.orders o on o.customer_id = c.id
    where p_customer_codes is null or c.customer_code = any(p_customer_codes)
    group by c.id, c.customer_code, c.display_name, c.last_attendant
  ),
  percentile_stats as (
    select
      coalesce(max(total_spent), 1) as max_spent_value,
      coalesce(max(total_orders), 1) as max_orders_value,
      coalesce(percentile_disc(0.8) within group (order by total_spent), 0) as high_value_threshold_value
    from aggregates
  )
  select
    percentile_stats.max_spent_value,
    percentile_stats.max_orders_value,
    percentile_stats.high_value_threshold_value
  into
    max_spent,
    max_orders,
    high_value_threshold
  from percentile_stats;

  for aggregate_row in
    select
      c.id as customer_id,
      c.customer_code,
      c.display_name,
      c.last_attendant,
      array_agg(o.order_date order by o.order_date asc) as order_dates,
      array_agg(o.total_amount order by o.order_date asc) as order_totals
    from public.customers c
    join public.orders o on o.customer_id = c.id
    where p_customer_codes is null or c.customer_code = any(p_customer_codes)
    group by c.id, c.customer_code, c.display_name, c.last_attendant
  loop
    total_orders := coalesce(array_length(aggregate_row.order_dates, 1), 0);
    total_spent := coalesce((select sum(value) from unnest(aggregate_row.order_totals) as value), 0);
    avg_ticket := case when total_orders > 0 then total_spent / total_orders else 0 end;
    last_purchase_at := aggregate_row.order_dates[array_upper(aggregate_row.order_dates, 1)];
    days_since_last_purchase := case when last_purchase_at is null then null else public.days_between(now(), last_purchase_at) end;

    if total_orders < 2 then
      avg_gap := null;
    else
      select avg(gap_days)::numeric(14, 2)
      into avg_gap
      from (
        select
          public.days_between(aggregate_row.order_dates[idx]::timestamptz, aggregate_row.order_dates[idx - 1]::timestamptz) as gap_days
        from generate_series(2, array_length(aggregate_row.order_dates, 1)) as idx
      ) gaps;
    end if;

    select count(*)::numeric
    into purchase_frequency_90d
    from unnest(aggregate_row.order_dates) as order_date
    where order_date >= (current_date - 90);

    frequency_drop_ratio := public.compute_frequency_drop(aggregate_row.order_dates, now());
    customer_status := case
      when days_since_last_purchase is not null and days_since_last_purchase <= 30 then 'ACTIVE'
      when days_since_last_purchase is not null and days_since_last_purchase <= 89 then 'ATTENTION'
      else 'INACTIVE'
    end;

    value_recency := case when days_since_last_purchase is null then 0 else greatest(0, least(100, 100 - days_since_last_purchase * 0.556)) end;
    value_frequency := greatest(0, least(100, (total_orders::numeric / greatest(max_orders, 1)) * 100));
    value_monetary := greatest(0, least(100, (total_spent / greatest(max_spent, 1)) * 100));
    value_score := value_recency * 0.3 + value_frequency * 0.3 + value_monetary * 0.4;

    predicted_next_purchase_at := case
      when total_orders >= 3 and avg_gap is not null and last_purchase_at is not null then last_purchase_at + make_interval(days => round(avg_gap)::integer)
      else null
    end;

    overdue_score := case when predicted_next_purchase_at is not null and predicted_next_purchase_at < now() then 100 else 0 end;
    contact_recency_score := case when days_since_last_purchase is null then 0 else greatest(0, least(100, (days_since_last_purchase::numeric / 120) * 100)) end;
    priority_score := contact_recency_score * 0.4 + value_score * 0.25 + frequency_drop_ratio * 100 * 0.2 + overdue_score * 0.15;

    insight_tags := array[]::text[];
    if total_spent >= high_value_threshold and total_spent > 0 then insight_tags := array_append(insight_tags, 'alto_valor'); end if;
    if customer_status = 'INACTIVE' and total_spent > 0 then insight_tags := array_append(insight_tags, 'reativacao'); end if;
    if customer_status = 'ACTIVE' and avg_gap is not null and avg_gap <= 45 and frequency_drop_ratio < 0.2 then insight_tags := array_append(insight_tags, 'recorrente'); end if;
    if frequency_drop_ratio >= 0.5 then
      insight_tags := array_append(insight_tags, 'queda_frequencia');
      if customer_status <> 'ACTIVE' then insight_tags := array_append(insight_tags, 'risco_churn'); end if;
    end if;
    if predicted_next_purchase_at is not null and predicted_next_purchase_at < now() then insight_tags := array_append(insight_tags, 'compra_prevista_vencida'); end if;
    if total_orders <= 2 and last_purchase_at is not null and public.days_between(now(), last_purchase_at) <= 30 then insight_tags := array_append(insight_tags, 'novo_cliente'); end if;

    insight_tags := array(select distinct value from unnest(insight_tags) as value);
    primary_insight := null;
    if 'risco_churn' = any(insight_tags) then
      primary_insight := 'risco_churn';
    elsif 'reativacao' = any(insight_tags) then
      primary_insight := 'reativacao';
    elsif 'alto_valor' = any(insight_tags) then
      primary_insight := 'alto_valor';
    elsif 'compra_prevista_vencida' = any(insight_tags) then
      primary_insight := 'compra_prevista_vencida';
    elsif coalesce(array_length(insight_tags, 1), 0) > 0 then
      primary_insight := insight_tags[1];
    end if;

    insert into public.customer_snapshot (
      customer_id,
      display_name,
      customer_code,
      last_purchase_at,
      days_since_last_purchase,
      total_orders,
      total_spent,
      avg_ticket,
      avg_days_between_orders,
      purchase_frequency_90d,
      frequency_drop_ratio,
      status,
      value_score,
      priority_score,
      predicted_next_purchase_at,
      primary_insight,
      insight_tags,
      last_attendant,
      updated_at
    )
    values (
      aggregate_row.customer_id,
      aggregate_row.display_name,
      aggregate_row.customer_code,
      last_purchase_at,
      days_since_last_purchase,
      total_orders,
      round(total_spent, 2),
      round(avg_ticket, 2),
      case when avg_gap is null then null else round(avg_gap, 2) end,
      round(purchase_frequency_90d, 2),
      round(frequency_drop_ratio, 4),
      customer_status,
      round(value_score, 2),
      round(priority_score, 2),
      predicted_next_purchase_at,
      primary_insight,
      insight_tags,
      aggregate_row.last_attendant,
      now()
    )
    on conflict (customer_id) do update
    set
      display_name = excluded.display_name,
      customer_code = excluded.customer_code,
      last_purchase_at = excluded.last_purchase_at,
      days_since_last_purchase = excluded.days_since_last_purchase,
      total_orders = excluded.total_orders,
      total_spent = excluded.total_spent,
      avg_ticket = excluded.avg_ticket,
      avg_days_between_orders = excluded.avg_days_between_orders,
      purchase_frequency_90d = excluded.purchase_frequency_90d,
      frequency_drop_ratio = excluded.frequency_drop_ratio,
      status = excluded.status,
      value_score = excluded.value_score,
      priority_score = excluded.priority_score,
      predicted_next_purchase_at = excluded.predicted_next_purchase_at,
      primary_insight = excluded.primary_insight,
      insight_tags = excluded.insight_tags,
      last_attendant = excluded.last_attendant,
      updated_at = now();
  end loop;
end;
$$;

create or replace function public.rebuild_read_models(p_customer_codes text[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row record;
  order_row record;
  current_customer_id uuid;
  current_order_id uuid;
begin
  if p_customer_codes is null then
    p_customer_codes := array(
      select distinct sr.customer_code
      from public.sales_raw sr
      where sr.customer_code is not null and sr.customer_code <> ''
    );
  end if;

  if coalesce(array_length(p_customer_codes, 1), 0) = 0 then
    return;
  end if;

  for source_row in
    select distinct on (sr.customer_code)
      sr.customer_code,
      sr.customer_label,
      sr.attendant_name,
      sr.source_system,
      sr.external_customer_id
    from public.sales_raw sr
    where sr.customer_code = any(p_customer_codes)
    order by sr.customer_code, sr.sale_date desc, sr.created_at desc
  loop
    insert into public.customers (
      customer_code,
      external_customer_id,
      display_name,
      normalized_name,
      source_system_first,
      last_attendant
    )
    values (
      source_row.customer_code,
      source_row.external_customer_id,
      public.extract_display_name(source_row.customer_label, source_row.customer_code),
      public.normalize_name(public.extract_display_name(source_row.customer_label, source_row.customer_code)),
      source_row.source_system,
      source_row.attendant_name
    )
    on conflict (customer_code) do update
    set
      external_customer_id = coalesce(excluded.external_customer_id, public.customers.external_customer_id),
      display_name = excluded.display_name,
      normalized_name = excluded.normalized_name,
      last_attendant = coalesce(excluded.last_attendant, public.customers.last_attendant),
      updated_at = now();
  end loop;

  delete from public.orders
  where customer_code = any(p_customer_codes);

  for order_row in
    select
      sr.source_system,
      sr.external_order_id,
      sr.order_number,
      sr.customer_code,
      sr.sale_date,
      coalesce(max(sr.order_status), 'VALID') as order_status,
      nullif(coalesce(max(sr.attendant_name), ''), '') as last_attendant,
      sum(sr.line_total)::numeric(14, 2) as total_amount,
      count(*)::integer as item_count
    from public.sales_raw sr
    where sr.customer_code = any(p_customer_codes)
    group by sr.source_system, sr.external_order_id, sr.order_number, sr.customer_code, sr.sale_date
    order by sr.sale_date desc
  loop
    select c.id
    into current_customer_id
    from public.customers c
    where c.customer_code = order_row.customer_code;

    if current_customer_id is null then
      continue;
    end if;

    insert into public.orders (
      source_system,
      external_order_id,
      order_number,
      customer_id,
      customer_code,
      order_date,
      total_amount,
      status,
      item_count,
      last_attendant
    )
    values (
      order_row.source_system,
      order_row.external_order_id,
      order_row.order_number,
      current_customer_id,
      order_row.customer_code,
      order_row.sale_date,
      order_row.total_amount,
      order_row.order_status,
      order_row.item_count,
      order_row.last_attendant
    )
    returning id into current_order_id;

    insert into public.order_items (
      order_id,
      sale_raw_id,
      sku,
      item_description,
      quantity,
      unit_price,
      line_total,
      attendant_name
    )
    select
      current_order_id,
      sr.id,
      sr.sku,
      sr.item_description,
      sr.quantity,
      sr.unit_price,
      sr.line_total,
      sr.attendant_name
    from public.sales_raw sr
    where sr.source_system = order_row.source_system
      and sr.order_number = order_row.order_number
      and sr.customer_code = order_row.customer_code
      and sr.sale_date = order_row.sale_date;
  end loop;

  perform public.refresh_customer_snapshots(p_customer_codes);
end;
$$;

grant execute on function public.refresh_customer_snapshots(text[]) to authenticated;
grant execute on function public.rebuild_read_models(text[]) to authenticated;
