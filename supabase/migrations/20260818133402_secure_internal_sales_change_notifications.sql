create or replace function public.notify_crm_sales_changed()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_notify('crm_sales_changed', tg_op);
  return null;
end;
$$;

revoke all on function public.notify_crm_sales_changed() from public;

drop trigger if exists crm_sales_changed_trigger on public.f_vendas_2026;
create trigger crm_sales_changed_trigger
after insert or update or delete on public.f_vendas_2026
for each statement
execute function public.notify_crm_sales_changed();
