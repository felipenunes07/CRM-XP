-- Migration: Fix Badge "Respondeu" - Filter Group Messages
-- Issue: Messages from WhatsApp groups (@g.us) were being counted as individual responses
-- Solution: Add filter to exclude group messages from response attribution

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trg_refresh_campaign_stats_cache ON whatsapp_campaign_recipients;
DROP FUNCTION IF EXISTS refresh_campaign_stats_cache();

-- Recreate function with group message filter
CREATE OR REPLACE FUNCTION refresh_campaign_stats_cache()
RETURNS TRIGGER AS $$
BEGIN
  -- Clear cache for this campaign
  DELETE FROM whatsapp_campaign_stats_cache 
  WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id);
  
  -- Recalculate and insert fresh stats
  INSERT INTO whatsapp_campaign_stats_cache (
    campaign_id,
    total_recipients,
    pending_count,
    blocked_recent_count,
    sending_count,
    sent_count,
    failed_count,
    skipped_count,
    responded_count,
    purchased_count,
    total_revenue,
    cached_at
  )
  SELECT
    r.campaign_id,
    COUNT(*) AS total_recipients,
    COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
    COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
    COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
    COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
    COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
    COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
    
    -- Count recipients with responses (FIXED: exclude group messages)
    COUNT(DISTINCT r.id) FILTER (
      WHERE r.status = 'SENT' 
        AND r.sent_at IS NOT NULL
        AND EXISTS (
          SELECT 1 
          FROM whatsapp_incoming_messages wim
          WHERE COALESCE(wim.from_me, false) = false
            -- ✅ FIX: Exclude group messages
            AND LOWER(COALESCE(wim.remote_jid, '')) NOT LIKE '%@g.us'
            AND wim.created_at >= r.sent_at
            AND wim.created_at < r.sent_at + INTERVAL '7 days'
            AND LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
        )
    ) AS responded_count,
    
    -- Count recipients with purchases
    COUNT(DISTINCT r.id) FILTER (
      WHERE r.status = 'SENT'
        AND r.sent_at IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM orders o
          WHERE o.order_date >= r.sent_at::date
            AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
            AND (
              (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
              OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
            )
        )
    ) AS purchased_count,
    
    -- Calculate total revenue from attributed orders
    COALESCE(SUM(
      CASE 
        WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
          (
            SELECT COALESCE(SUM(o.total_amount), 0)
            FROM orders o
            WHERE o.order_date >= r.sent_at::date
              AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
              AND (
                (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
              )
          )
        ELSE 0
      END
    ), 0) AS total_revenue,
    
    NOW() AS cached_at
  FROM whatsapp_campaign_recipients r
  WHERE r.campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)
  GROUP BY r.campaign_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER trg_refresh_campaign_stats_cache
AFTER INSERT OR UPDATE OR DELETE ON whatsapp_campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION refresh_campaign_stats_cache();

-- Force refresh all existing campaign caches with the new logic
DO $$
DECLARE
  campaign_record RECORD;
BEGIN
  FOR campaign_record IN 
    SELECT DISTINCT campaign_id 
    FROM whatsapp_campaign_recipients
  LOOP
    DELETE FROM whatsapp_campaign_stats_cache 
    WHERE campaign_id = campaign_record.campaign_id;
    
    INSERT INTO whatsapp_campaign_stats_cache (
      campaign_id,
      total_recipients,
      pending_count,
      blocked_recent_count,
      sending_count,
      sent_count,
      failed_count,
      skipped_count,
      responded_count,
      purchased_count,
      total_revenue,
      cached_at
    )
    SELECT
      r.campaign_id,
      COUNT(*) AS total_recipients,
      COUNT(*) FILTER (WHERE r.status = 'PENDING') AS pending_count,
      COUNT(*) FILTER (WHERE r.status = 'BLOCKED_RECENT') AS blocked_recent_count,
      COUNT(*) FILTER (WHERE r.status = 'SENDING') AS sending_count,
      COUNT(*) FILTER (WHERE r.status = 'SENT') AS sent_count,
      COUNT(*) FILTER (WHERE r.status = 'FAILED') AS failed_count,
      COUNT(*) FILTER (WHERE r.status = 'SKIPPED') AS skipped_count,
      
      COUNT(DISTINCT r.id) FILTER (
        WHERE r.status = 'SENT' 
          AND r.sent_at IS NOT NULL
          AND EXISTS (
            SELECT 1 
            FROM whatsapp_incoming_messages wim
            WHERE COALESCE(wim.from_me, false) = false
              AND LOWER(COALESCE(wim.remote_jid, '')) NOT LIKE '%@g.us'
              AND wim.created_at >= r.sent_at
              AND wim.created_at < r.sent_at + INTERVAL '7 days'
              AND LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
          )
      ) AS responded_count,
      
      COUNT(DISTINCT r.id) FILTER (
        WHERE r.status = 'SENT'
          AND r.sent_at IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM orders o
            WHERE o.order_date >= r.sent_at::date
              AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
              AND (
                (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
              )
          )
      ) AS purchased_count,
      
      COALESCE(SUM(
        CASE 
          WHEN r.status = 'SENT' AND r.sent_at IS NOT NULL THEN
            (
              SELECT COALESCE(SUM(o.total_amount), 0)
              FROM orders o
              WHERE o.order_date >= r.sent_at::date
                AND o.order_date <= (r.sent_at + INTERVAL '7 days')::date
                AND (
                  (o.customer_id IS NOT NULL AND r.customer_id IS NOT NULL AND o.customer_id = r.customer_id)
                  OR (o.customer_code IS NOT NULL AND r.customer_code IS NOT NULL AND LOWER(o.customer_code) = LOWER(r.customer_code))
                )
            )
          ELSE 0
        END
      ), 0) AS total_revenue,
      
      NOW() AS cached_at
    FROM whatsapp_campaign_recipients r
    WHERE r.campaign_id = campaign_record.campaign_id
    GROUP BY r.campaign_id;
  END LOOP;
  
  RAISE NOTICE 'Successfully refreshed % campaign caches', 
    (SELECT COUNT(DISTINCT campaign_id) FROM whatsapp_campaign_recipients);
END $$;

-- Create index on remote_jid for faster filtering (if not exists)
CREATE INDEX IF NOT EXISTS idx_whatsapp_incoming_remote_jid_lower 
  ON whatsapp_incoming_messages(LOWER(COALESCE(remote_jid, '')));

-- Add comment explaining the fix
COMMENT ON FUNCTION refresh_campaign_stats_cache() IS 
  'Calculates campaign statistics with GROUP MESSAGE FILTER to prevent incorrect response attribution. 
   Updated 2026-06-09 to exclude @g.us messages from response counts.';
