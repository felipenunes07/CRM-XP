-- Campaign performance attribution read indexes
create index if not exists idx_message_logs_campaign_created
  on public.message_logs(campaign_id, created_at desc)
  where campaign_id is not null;

create index if not exists idx_whatsapp_campaign_recipients_campaign_customer_sent
  on public.whatsapp_campaign_recipients(campaign_id, customer_id, sent_at)
  where customer_id is not null
    and sent_at is not null;

create index if not exists idx_whatsapp_campaign_recipients_campaign_jid_sent
  on public.whatsapp_campaign_recipients(campaign_id, jid, sent_at)
  where sent_at is not null;

create index if not exists idx_orders_customer_order_date
  on public.orders(customer_id, order_date)
  where customer_id is not null;

create index if not exists idx_orders_customer_code_order_date
  on public.orders(customer_code, order_date)
  where customer_code is not null;
