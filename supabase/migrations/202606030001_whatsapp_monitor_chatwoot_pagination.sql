-- WhatsApp monitor Chatwoot-style pagination indexes

CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_instance_last_activity
  ON public.deals(whatsapp_instance_id, last_activity_at DESC, id DESC)
  WHERE whatsapp_jid IS NOT NULL
    AND whatsapp_instance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_assigned_last_activity
  ON public.deals(assigned_to, last_activity_at DESC, id DESC)
  WHERE whatsapp_jid IS NOT NULL
    AND assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_assigned_name_last_activity
  ON public.deals((LOWER(COALESCE(assigned_to_name, ''))), last_activity_at DESC, id DESC)
  WHERE whatsapp_jid IS NOT NULL;
