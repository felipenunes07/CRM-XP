-- WhatsApp monitor performance indexes

CREATE INDEX IF NOT EXISTS idx_deal_activities_whatsapp_deal_created
  ON public.deal_activities(deal_id, created_at DESC, id DESC)
  WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED');

CREATE INDEX IF NOT EXISTS idx_deal_activities_whatsapp_created
  ON public.deal_activities(created_at DESC, id DESC)
  WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED');

CREATE INDEX IF NOT EXISTS idx_deal_activities_whatsapp_type_created
  ON public.deal_activities(activity_type, created_at DESC, id DESC)
  WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED');

CREATE INDEX IF NOT EXISTS idx_deal_activities_whatsapp_deal_instance
  ON public.deal_activities(deal_id, (LOWER(COALESCE(metadata ->> 'instance', ''))))
  WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED');

CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_jid
  ON public.deals(whatsapp_jid)
  WHERE whatsapp_jid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_instance_id
  ON public.deals(whatsapp_instance_id)
  WHERE whatsapp_instance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_whatsapp_last_activity
  ON public.deals(last_activity_at DESC, id DESC)
  WHERE whatsapp_jid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_remote_instance_created
  ON public.whatsapp_incoming_messages(
    remote_jid,
    (LOWER(COALESCE(instance_name, ''))),
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_whatsapp_chat_profiles_remote_instance_updated
  ON public.whatsapp_chat_profiles(remote_jid, instance_name, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_participant_profiles_jid_instance_updated
  ON public.whatsapp_participant_profiles(participant_jid, instance_name, updated_at DESC);
