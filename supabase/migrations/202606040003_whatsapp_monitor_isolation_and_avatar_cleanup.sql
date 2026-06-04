-- WhatsApp monitor isolation/performance indexes and avatar cleanup.
-- Idempotent: safe to run more than once.

CREATE INDEX IF NOT EXISTS idx_wmm_instance_direction_created_deal
  ON public.whatsapp_monitor_messages (
    (lower(coalesce(instance_name, ''))),
    direction,
    created_at DESC,
    deal_id
  );

CREATE INDEX IF NOT EXISTS idx_wmm_instance_deal_created
  ON public.whatsapp_monitor_messages (
    (lower(coalesce(instance_name, ''))),
    deal_id,
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_wmm_remote_instance_created
  ON public.whatsapp_monitor_messages (
    remote_jid,
    (lower(coalesce(instance_name, ''))),
    created_at DESC,
    id DESC
  )
  WHERE remote_jid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wmm_direction_created
  ON public.whatsapp_monitor_messages (
    direction,
    created_at DESC,
    deal_id
  );

UPDATE public.whatsapp_chat_profiles wcp
SET profile_picture_url = NULL,
    updated_at = NOW()
WHERE NULLIF(wcp.profile_picture_url, '') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_instances wi
    WHERE wi.status = 'ACTIVE'
      AND NULLIF(wi.profile_picture_url, '') IS NOT NULL
      AND wi.profile_picture_url = wcp.profile_picture_url
  );

UPDATE public.whatsapp_participant_profiles wpp
SET profile_picture_url = NULL,
    last_synced_at = NOW()
WHERE NULLIF(wpp.profile_picture_url, '') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_instances wi
    WHERE wi.status = 'ACTIVE'
      AND NULLIF(wi.profile_picture_url, '') IS NOT NULL
      AND wi.profile_picture_url = wpp.profile_picture_url
  );

UPDATE public.whatsapp_monitor_messages wmm
SET sender_pic_url = NULL
WHERE NULLIF(wmm.sender_pic_url, '') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.whatsapp_instances wi
    WHERE wi.status = 'ACTIVE'
      AND NULLIF(wi.profile_picture_url, '') IS NOT NULL
      AND wi.profile_picture_url = wmm.sender_pic_url
  );

UPDATE public.whatsapp_incoming_messages wim
SET chat_profile_picture_url = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.whatsapp_instances wi
        WHERE wi.status = 'ACTIVE'
          AND NULLIF(wi.profile_picture_url, '') IS NOT NULL
          AND wi.profile_picture_url = wim.chat_profile_picture_url
      )
      THEN NULL
      ELSE wim.chat_profile_picture_url
    END,
    sender_profile_picture_url = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.whatsapp_instances wi
        WHERE wi.status = 'ACTIVE'
          AND NULLIF(wi.profile_picture_url, '') IS NOT NULL
          AND wi.profile_picture_url = wim.sender_profile_picture_url
      )
      THEN NULL
      ELSE wim.sender_profile_picture_url
    END
WHERE NULLIF(wim.chat_profile_picture_url, '') IS NOT NULL
   OR NULLIF(wim.sender_profile_picture_url, '') IS NOT NULL;
