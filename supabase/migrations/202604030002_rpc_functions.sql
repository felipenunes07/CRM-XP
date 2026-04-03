create or replace function public.ensure_authenticated()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_uid uuid := auth.uid();
begin
  if current_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return current_uid;
end;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = public.ensure_authenticated()
$$;

create or replace function public.get_current_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'name', p.name,
    'role', p.role
  )
  from public.profiles p
  where p.id = public.ensure_authenticated()
$$;

create or replace function public.label_color_for_name(label_name text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text := lower(trim(coalesce(label_name, '')));
begin
  if normalized like '%negra%' or normalized like '%bloque%' then
    return '#b42318';
  end if;

  if normalized like '%credito%' or normalized like '%dev%' then
    return '#d97706';
  end if;

  if normalized like '%bom%' or normalized like '%vip%' or normalized like '%reativ%' then
    return '#2956d7';
  end if;

  return '#5f8cff';
end;
$$;

create or replace function public.agenda_reason(tags text[], status text, days_since integer)
returns text
language plpgsql
immutable
as $$
begin
  if 'risco_churn' = any(tags) then
    return 'Queda forte de frequencia e cliente fora da zona ativa'
      || case when days_since is not null then ' ha ' || days_since || ' dias.' else '.' end;
  end if;

  if 'reativacao' = any(tags) then
    return 'Cliente inativo com historico relevante'
      || case when days_since is not null then ' e ' || days_since || ' dias sem comprar.' else '.' end;
  end if;

  if 'compra_prevista_vencida' = any(tags) then
    return 'A data prevista de recompra passou e vale contato agora.';
  end if;

  if 'alto_valor' = any(tags) then
    return 'Cliente de alto valor que merece acompanhamento proximo.';
  end if;

  if status = 'ATTENTION' then
    return 'Cliente em atencao'
      || case when days_since is not null then ' com ' || days_since || ' dias desde a ultima compra.' else '.' end;
  end if;

  return 'Cliente estrategico para contato comercial.';
end;
$$;

create or replace function public.agenda_suggested_action(tags text[], status text)
returns text
language plpgsql
immutable
as $$
begin
  if 'risco_churn' = any(tags) then
    return 'Fazer contato de recuperacao com proposta personalizada.';
  end if;

  if 'reativacao' = any(tags) then
    return 'Retomar conversa e investigar por que parou de comprar.';
  end if;

  if 'compra_prevista_vencida' = any(tags) then
    return 'Fazer follow-up objetivo com proposta de recompra.';
  end if;

  if status = 'ATTENTION' then
    return 'Fazer follow-up antes de o cliente virar inativo.';
  end if;

  return 'Manter relacionamento e estimular nova compra.';
end;
$$;

create or replace function public.list_customer_labels()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', cl.id,
          'name', cl.name,
          'color', cl.color
        )
        order by cl.name
      ),
      '[]'::jsonb
    )
  from public.customer_labels cl
  where public.ensure_authenticated() is not null
$$;

create or replace function public.create_customer_label(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_name text := trim(coalesce(p_name, ''));
  normalized_name text := lower(trim(coalesce(p_name, '')));
  created_label public.customer_labels;
begin
  perform public.ensure_authenticated();

  if cleaned_name = '' then
    raise exception 'Label name is required' using errcode = '22023';
  end if;

  insert into public.customer_labels (name, normalized_name, color)
  values (cleaned_name, normalized_name, public.label_color_for_name(cleaned_name))
  on conflict (normalized_name) do update
  set
    name = excluded.name,
    color = excluded.color,
    updated_at = now()
  returning * into created_label;

  return jsonb_build_object(
    'id', created_label.id,
    'name', created_label.name,
    'color', created_label.color
  );
end;
$$;

create or replace function public.delete_customer_label(p_label_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  perform public.ensure_authenticated();

  delete from public.customer_labels
  where id = p_label_id;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

create or replace function public.list_message_templates()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', mt.id,
          'category', mt.category,
          'title', mt.title,
          'content', mt.content,
          'createdAt', mt.created_at,
          'updatedAt', mt.updated_at
        )
        order by mt.updated_at desc
      ),
      '[]'::jsonb
    )
  from public.message_templates mt
  where public.ensure_authenticated() is not null
$$;

create or replace function public.save_message_template(
  p_id uuid default null,
  p_category text default null,
  p_title text default null,
  p_content text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_template public.message_templates;
begin
  perform public.ensure_authenticated();

  if coalesce(trim(p_category), '') = '' or coalesce(trim(p_title), '') = '' or coalesce(trim(p_content), '') = '' then
    raise exception 'Category, title and content are required' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.message_templates (category, title, content)
    values (trim(p_category), trim(p_title), trim(p_content))
    returning * into saved_template;
  else
    update public.message_templates
    set
      category = trim(p_category),
      title = trim(p_title),
      content = trim(p_content),
      updated_at = now()
    where id = p_id
    returning * into saved_template;

    if saved_template is null then
      raise exception 'Message template not found' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'id', saved_template.id,
    'category', saved_template.category,
    'title', saved_template.title,
    'content', saved_template.content,
    'createdAt', saved_template.created_at,
    'updatedAt', saved_template.updated_at
  );
end;
$$;

create or replace function public.delete_message_template(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  perform public.ensure_authenticated();

  delete from public.message_templates
  where id = p_id;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;
