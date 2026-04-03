create or replace function public.list_customers(filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with auth_check as (
    select public.ensure_authenticated() as uid
  ),
  input as (
    select
      nullif(trim(filters ->> 'search'), '') as search,
      case
        when coalesce(filters ->> 'sortBy', '') in ('priority', 'faturamento', 'recencia') then filters ->> 'sortBy'
        else 'priority'
      end as sort_by,
      nullif(filters ->> 'limit', '')::integer as limit_value,
      array(select jsonb_array_elements_text(coalesce(filters -> 'status', '[]'::jsonb))) as status_list,
      array(select jsonb_array_elements_text(coalesce(filters -> 'labels', '[]'::jsonb))) as labels_list,
      array(select jsonb_array_elements_text(coalesce(filters -> 'excludeLabels', '[]'::jsonb))) as exclude_labels_list,
      nullif(filters ->> 'minDaysInactive', '')::integer as min_days_inactive,
      nullif(filters ->> 'maxDaysInactive', '')::integer as max_days_inactive,
      nullif(filters ->> 'minAvgTicket', '')::numeric as min_avg_ticket,
      nullif(filters ->> 'minTotalSpent', '')::numeric as min_total_spent,
      nullif(filters ->> 'minFrequencyDrop', '')::numeric as min_frequency_drop,
      nullif(filters ->> 'frequencyDropRatio', '')::numeric as frequency_drop_ratio,
      nullif(filters ->> 'newCustomersWithinDays', '')::integer as new_customers_within_days,
      coalesce((filters ->> 'stoppedTopCustomers')::boolean, false) as stopped_top_customers
  ),
  base as (
    select
      s.customer_id,
      s.customer_code,
      s.display_name,
      s.last_purchase_at,
      s.days_since_last_purchase,
      s.total_orders,
      s.total_spent,
      s.avg_ticket,
      s.status,
      s.priority_score,
      s.value_score,
      s.primary_insight,
      s.insight_tags,
      s.last_attendant,
      coalesce((
        select jsonb_agg(
          jsonb_build_object('id', cl.id, 'name', cl.name, 'color', cl.color)
          order by cl.name
        )
        from public.customer_label_assignments cla
        join public.customer_labels cl on cl.id = cla.label_id
        where cla.customer_id = s.customer_id
      ), '[]'::jsonb) as labels
    from public.customer_snapshot s
    cross join input i
    cross join auth_check
    where
      (i.search is null or s.display_name ilike '%' || i.search || '%' or s.customer_code ilike '%' || i.search || '%')
      and (coalesce(array_length(i.status_list, 1), 0) = 0 or s.status = any(i.status_list))
      and (i.min_days_inactive is null or coalesce(s.days_since_last_purchase, 9999) >= i.min_days_inactive)
      and (i.max_days_inactive is null or coalesce(s.days_since_last_purchase, 0) <= i.max_days_inactive)
      and (i.min_avg_ticket is null or s.avg_ticket >= i.min_avg_ticket)
      and (i.min_total_spent is null or s.total_spent >= i.min_total_spent)
      and (i.min_frequency_drop is null or s.frequency_drop_ratio >= i.min_frequency_drop)
      and (i.frequency_drop_ratio is null or s.frequency_drop_ratio >= i.frequency_drop_ratio)
      and (
        i.new_customers_within_days is null
        or (
          coalesce(s.days_since_last_purchase, 9999) <= i.new_customers_within_days
          and s.total_orders <= 2
        )
      )
      and (not i.stopped_top_customers or (s.value_score >= 70 and s.status <> 'ACTIVE'))
      and (
        coalesce(array_length(i.labels_list, 1), 0) = 0
        or exists (
          select 1
          from public.customer_label_assignments cla
          join public.customer_labels cl on cl.id = cla.label_id
          where cla.customer_id = s.customer_id
            and cl.name = any(i.labels_list)
        )
      )
      and (
        coalesce(array_length(i.exclude_labels_list, 1), 0) = 0
        or not exists (
          select 1
          from public.customer_label_assignments cla
          join public.customer_labels cl on cl.id = cla.label_id
          where cla.customer_id = s.customer_id
            and cl.name = any(i.exclude_labels_list)
        )
      )
  ),
  ranked as (
    select
      b.*,
      row_number() over (
        order by
          case when (select sort_by from input) = 'faturamento' then b.total_spent end desc nulls last,
          case when (select sort_by from input) = 'recencia' then b.days_since_last_purchase end desc nulls last,
          case when (select sort_by from input) = 'priority' then b.priority_score end desc nulls last,
          b.priority_score desc,
          b.total_spent desc
      ) as rn
    from base b
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ranked.customer_id,
        'customerCode', ranked.customer_code,
        'displayName', ranked.display_name,
        'lastPurchaseAt', ranked.last_purchase_at,
        'daysSinceLastPurchase', ranked.days_since_last_purchase,
        'totalOrders', ranked.total_orders,
        'totalSpent', ranked.total_spent,
        'avgTicket', ranked.avg_ticket,
        'status', ranked.status,
        'priorityScore', ranked.priority_score,
        'valueScore', ranked.value_score,
        'primaryInsight', ranked.primary_insight,
        'insightTags', to_jsonb(coalesce(ranked.insight_tags, array[]::text[])),
        'lastAttendant', ranked.last_attendant,
        'labels', ranked.labels
      )
      order by ranked.rn
    ),
    '[]'::jsonb
  )
  from ranked
  where (select limit_value from input) is null or ranked.rn <= (select limit_value from input)
$$;

create or replace function public.get_customer_detail(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with auth_check as (
    select public.ensure_authenticated() as uid
  ),
  customer_row as (
    select
      s.customer_id,
      s.customer_code,
      s.display_name,
      s.last_purchase_at,
      s.days_since_last_purchase,
      s.total_orders,
      s.total_spent,
      s.avg_ticket,
      s.status,
      s.priority_score,
      s.value_score,
      s.primary_insight,
      s.insight_tags,
      s.last_attendant,
      c.internal_notes,
      s.avg_days_between_orders,
      s.purchase_frequency_90d,
      s.frequency_drop_ratio,
      s.predicted_next_purchase_at,
      coalesce((
        select jsonb_agg(
          jsonb_build_object('id', cl.id, 'name', cl.name, 'color', cl.color)
          order by cl.name
        )
        from public.customer_label_assignments cla
        join public.customer_labels cl on cl.id = cla.label_id
        where cla.customer_id = s.customer_id
      ), '[]'::jsonb) as labels
    from public.customer_snapshot s
    join public.customers c on c.id = s.customer_id
    cross join auth_check
    where s.customer_id = p_customer_id
  ),
  recent_orders as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'orderNumber', o.order_number,
            'orderDate', o.order_date,
            'sourceSystem', o.source_system,
            'totalAmount', o.total_amount,
            'status', o.status,
            'itemCount', o.item_count
          )
          order by o.order_date desc
        ),
        '[]'::jsonb
      ) as orders
    from (
      select *
      from public.orders
      where customer_id = p_customer_id
      order by order_date desc
      limit 20
    ) o
  )
  select case
    when exists (select 1 from customer_row) then (
      select jsonb_build_object(
        'id', customer_row.customer_id,
        'customerCode', customer_row.customer_code,
        'displayName', customer_row.display_name,
        'lastPurchaseAt', customer_row.last_purchase_at,
        'daysSinceLastPurchase', customer_row.days_since_last_purchase,
        'totalOrders', customer_row.total_orders,
        'totalSpent', customer_row.total_spent,
        'avgTicket', customer_row.avg_ticket,
        'status', customer_row.status,
        'priorityScore', customer_row.priority_score,
        'valueScore', customer_row.value_score,
        'primaryInsight', customer_row.primary_insight,
        'insightTags', to_jsonb(coalesce(customer_row.insight_tags, array[]::text[])),
        'lastAttendant', customer_row.last_attendant,
        'labels', customer_row.labels,
        'avgDaysBetweenOrders', customer_row.avg_days_between_orders,
        'purchaseFrequency90d', customer_row.purchase_frequency_90d,
        'frequencyDropRatio', customer_row.frequency_drop_ratio,
        'predictedNextPurchaseAt', customer_row.predicted_next_purchase_at,
        'internalNotes', customer_row.internal_notes,
        'recentOrders', recent_orders.orders
      )
      from customer_row, recent_orders
    )
    else null
  end
$$;

create or replace function public.get_agenda_items(p_limit integer default 25)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with auth_check as (
    select public.ensure_authenticated() as uid
  ),
  agenda_rows as (
    select
      s.customer_id,
      s.customer_code,
      s.display_name,
      s.last_purchase_at,
      s.days_since_last_purchase,
      s.total_orders,
      s.total_spent,
      s.avg_ticket,
      s.status,
      s.priority_score,
      s.value_score,
      s.primary_insight,
      s.insight_tags,
      s.last_attendant,
      coalesce((
        select jsonb_agg(
          jsonb_build_object('id', cl.id, 'name', cl.name, 'color', cl.color)
          order by cl.name
        )
        from public.customer_label_assignments cla
        join public.customer_labels cl on cl.id = cla.label_id
        where cla.customer_id = s.customer_id
      ), '[]'::jsonb) as labels
    from public.customer_snapshot s
    cross join auth_check
    order by s.priority_score desc, s.total_spent desc
    limit greatest(coalesce(p_limit, 25), 1)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', agenda_rows.customer_id,
        'customerCode', agenda_rows.customer_code,
        'displayName', agenda_rows.display_name,
        'lastPurchaseAt', agenda_rows.last_purchase_at,
        'daysSinceLastPurchase', agenda_rows.days_since_last_purchase,
        'totalOrders', agenda_rows.total_orders,
        'totalSpent', agenda_rows.total_spent,
        'avgTicket', agenda_rows.avg_ticket,
        'status', agenda_rows.status,
        'priorityScore', agenda_rows.priority_score,
        'valueScore', agenda_rows.value_score,
        'primaryInsight', agenda_rows.primary_insight,
        'insightTags', to_jsonb(coalesce(agenda_rows.insight_tags, array[]::text[])),
        'lastAttendant', agenda_rows.last_attendant,
        'labels', agenda_rows.labels,
        'reason', public.agenda_reason(coalesce(agenda_rows.insight_tags, array[]::text[]), agenda_rows.status, agenda_rows.days_since_last_purchase),
        'suggestedAction', public.agenda_suggested_action(coalesce(agenda_rows.insight_tags, array[]::text[]), agenda_rows.status)
      )
      order by agenda_rows.priority_score desc, agenda_rows.total_spent desc
    ),
    '[]'::jsonb
  )
  from agenda_rows
$$;

create or replace function public.get_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with auth_check as (
    select public.ensure_authenticated() as uid
  ),
  totals as (
    select
      count(*)::integer as total_customers,
      count(*) filter (where status = 'ACTIVE')::integer as active_count,
      count(*) filter (where status = 'ATTENTION')::integer as attention_count,
      count(*) filter (where status = 'INACTIVE')::integer as inactive_count,
      coalesce(avg(avg_ticket), 0)::numeric(14, 2) as average_ticket,
      coalesce(avg(avg_days_between_orders), 0)::numeric(14, 2) as average_frequency_days
    from public.customer_snapshot
    cross join auth_check
  ),
  buckets as (
    select jsonb_build_array(
      jsonb_build_object('label', '0-14', 'count', (select count(*)::integer from public.customer_snapshot where coalesce(days_since_last_purchase, 0) between 0 and 14)),
      jsonb_build_object('label', '15-29', 'count', (select count(*)::integer from public.customer_snapshot where days_since_last_purchase between 15 and 29)),
      jsonb_build_object('label', '30-59', 'count', (select count(*)::integer from public.customer_snapshot where days_since_last_purchase between 30 and 59)),
      jsonb_build_object('label', '60-89', 'count', (select count(*)::integer from public.customer_snapshot where days_since_last_purchase between 60 and 89)),
      jsonb_build_object('label', '90-179', 'count', (select count(*)::integer from public.customer_snapshot where days_since_last_purchase between 90 and 179)),
      jsonb_build_object('label', '180+', 'count', (select count(*)::integer from public.customer_snapshot where days_since_last_purchase >= 180))
    ) as data
  ),
  last_sync as (
    select max(finished_at) as last_sync_at
    from (
      select finished_at from public.import_runs where status = 'COMPLETED'
      union all
      select finished_at from public.sync_runs where status = 'COMPLETED'
    ) sync_data
  )
  select jsonb_build_object(
    'totalCustomers', totals.total_customers,
    'statusCounts', jsonb_build_object(
      'ACTIVE', totals.active_count,
      'ATTENTION', totals.attention_count,
      'INACTIVE', totals.inactive_count
    ),
    'inactivityBuckets', buckets.data,
    'averageTicket', totals.average_ticket,
    'averageFrequencyDays', totals.average_frequency_days,
    'lastSyncAt', last_sync.last_sync_at,
    'topCustomers', public.list_customers(jsonb_build_object('sortBy', 'faturamento', 'limit', 8)),
    'dailyAgendaCount', jsonb_array_length(public.get_agenda_items(12))
  )
  from totals, buckets, last_sync
$$;

create or replace function public.preview_segment(definition jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with customers as (
    select value as customer
    from jsonb_array_elements(
      public.list_customers(
        jsonb_strip_nulls(
          definition || jsonb_build_object('sortBy', 'priority')
        )
      )
    )
  ),
  customer_ids as (
    select (customer ->> 'id')::uuid as customer_id
    from customers
  ),
  pieces as (
    select
      coalesce(sum(total_quantity / nullif(total_orders, 0)), 0)::numeric(14, 2) as potential_recovered_pieces
    from (
      select
        o.customer_id,
        coalesce(sum(oi.quantity), 0)::numeric(14, 2) as total_quantity,
        count(distinct o.id)::numeric(14, 2) as total_orders
      from public.orders o
      left join public.order_items oi on oi.order_id = o.id
      where o.customer_id in (select customer_id from customer_ids)
      group by o.customer_id
    ) piece_stats
  ),
  summary as (
    select
      count(*)::integer as total_customers,
      coalesce(avg((customer ->> 'priorityScore')::numeric), 0)::numeric(14, 2) as average_priority_score,
      coalesce(sum((customer ->> 'avgTicket')::numeric), 0)::numeric(14, 2) as potential_recovered_revenue
    from customers
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'totalCustomers', summary.total_customers,
      'averagePriorityScore', summary.average_priority_score,
      'potentialRecoveredRevenue', summary.potential_recovered_revenue,
      'potentialRecoveredPieces', pieces.potential_recovered_pieces
    ),
    'customers', coalesce((select jsonb_agg(customer) from customers), '[]'::jsonb)
  )
  from summary, pieces
$$;

create or replace function public.update_customer_labels(
  p_customer_id uuid,
  p_labels text[] default array[]::text[],
  p_internal_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_labels text[];
  label_name text;
begin
  perform public.ensure_authenticated();

  update public.customers
  set
    internal_notes = coalesce(p_internal_notes, ''),
    updated_at = now()
  where id = p_customer_id;

  normalized_labels := array(
    select distinct trimmed.label_name
    from (
      select trim(coalesce(label, '')) as label_name
      from unnest(coalesce(p_labels, array[]::text[])) as label
    ) trimmed
    where trimmed.label_name <> ''
  );

  if coalesce(array_length(normalized_labels, 1), 0) > 0 then
    foreach label_name in array normalized_labels loop
      insert into public.customer_labels (name, normalized_name, color)
      values (label_name, lower(label_name), public.label_color_for_name(label_name))
      on conflict (normalized_name) do update
      set
        name = excluded.name,
        color = excluded.color,
        updated_at = now();
    end loop;
  end if;

  if coalesce(array_length(normalized_labels, 1), 0) = 0 then
    delete from public.customer_label_assignments
    where customer_id = p_customer_id;
  else
    delete from public.customer_label_assignments cla
    where cla.customer_id = p_customer_id
      and not exists (
        select 1
        from public.customer_labels cl
        where cl.id = cla.label_id
          and cl.normalized_name = any(array(select lower(value) from unnest(normalized_labels) as value))
      );

    insert into public.customer_label_assignments (customer_id, label_id, created_at)
    select p_customer_id, cl.id, now()
    from public.customer_labels cl
    where cl.normalized_name = any(array(select lower(value) from unnest(normalized_labels) as value))
    on conflict (customer_id, label_id) do nothing;
  end if;

  return public.get_customer_detail(p_customer_id);
end;
$$;

grant execute on function public.ensure_authenticated() to authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.get_current_profile() to authenticated;
grant execute on function public.list_customer_labels() to authenticated;
grant execute on function public.create_customer_label(text) to authenticated;
grant execute on function public.delete_customer_label(uuid) to authenticated;
grant execute on function public.list_message_templates() to authenticated;
grant execute on function public.save_message_template(uuid, text, text, text) to authenticated;
grant execute on function public.delete_message_template(uuid) to authenticated;
grant execute on function public.list_customers(jsonb) to authenticated;
grant execute on function public.get_customer_detail(uuid) to authenticated;
grant execute on function public.get_agenda_items(integer) to authenticated;
grant execute on function public.get_dashboard_metrics() to authenticated;
grant execute on function public.preview_segment(jsonb) to authenticated;
grant execute on function public.update_customer_labels(uuid, text[], text) to authenticated;
