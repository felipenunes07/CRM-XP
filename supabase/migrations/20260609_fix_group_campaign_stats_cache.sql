-- Migration: Fix group campaign stats cache trigger logic
-- If the refresh_campaign_stats_cache function exists, we update it to correct the JID matching logic (allowing group-to-group matches, but keeping them isolated from individual campaigns).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'refresh_campaign_stats_cache'
  ) THEN
    -- Redefine function with correct JID matching (no NOT LIKE '%@g.us' filter, as the exact match LOWER(wim.remote_jid) = LOWER(r.jid) handles JID matching cleanly)
    EXECUTE $sql$
    CREATE OR REPLACE FUNCTION refresh_campaign_stats_cache()
    RETURNS TRIGGER AS $body$
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
        
        -- Count recipients with responses
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.status = 'SENT' 
            AND r.sent_at IS NOT NULL
            AND EXISTS (
              SELECT 1 
              FROM whatsapp_incoming_messages wim
              WHERE COALESCE(wim.from_me, false) = false
                AND wim.created_at >= r.sent_at
                AND wim.created_at < r.sent_at + INTERVAL '7 days'
                AND (
                  LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
                  OR EXISTS (
                    SELECT 1 FROM whatsapp_jid_aliases wja1
                    JOIN whatsapp_jid_aliases wja2 
                      ON wja1.canonical_jid = wja2.canonical_jid 
                     AND LOWER(wja1.instance_name) = LOWER(wja2.instance_name)
                    WHERE LOWER(wja1.alias_jid) = LOWER(COALESCE(wim.remote_jid, ''))
                      AND LOWER(wja2.alias_jid) = LOWER(COALESCE(r.jid, ''))
                  )
                )
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
    $body$ LANGUAGE plpgsql;
    $sql$;
    
    -- Recalculate stats for all existing campaigns with the corrected logic
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
                  AND wim.created_at >= r.sent_at
                  AND wim.created_at < r.sent_at + INTERVAL '7 days'
                  AND (
                    LOWER(COALESCE(wim.remote_jid, '')) = LOWER(COALESCE(r.jid, ''))
                    OR EXISTS (
                      SELECT 1 FROM whatsapp_jid_aliases wja1
                      JOIN whatsapp_jid_aliases wja2 
                        ON wja1.canonical_jid = wja2.canonical_jid 
                       AND LOWER(wja1.instance_name) = LOWER(wja2.instance_name)
                      WHERE LOWER(wja1.alias_jid) = LOWER(COALESCE(wim.remote_jid, ''))
                        AND LOWER(wja2.alias_jid) = LOWER(COALESCE(r.jid, ''))
                    )
                  )
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
    END;
  END IF;
END $$;
