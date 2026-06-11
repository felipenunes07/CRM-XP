import * as fs from 'fs';
import * as path from 'path';

const filePath = path.resolve('apps/api/src/db/migrations.ts');
console.log('Reading:', filePath);
let content = fs.readFileSync(filePath, 'utf8');

const queryText = '-- Migration 40: Fix group campaign stats cache trigger logic';
const firstIndex = content.indexOf(queryText);
const secondIndex = content.indexOf(queryText, firstIndex + queryText.length);

if (firstIndex === -1 || secondIndex === -1) {
  console.error('Error: Could not find both occurrences of Migration 40 text!');
  process.exit(1);
}

// Find the backtick starting the string for migrations[39]
const startIndex = content.lastIndexOf('`', firstIndex);

// Find the ending backtick and comma of migrations[39] (which is right before migrations[40] starts)
// migrations[40] starts with a backtick at secondIndex - some offset.
// Let's find the closing backtick and comma of the malformed block:
const endString = 'ON whatsapp_incoming_messages(LOWER(COALESCE(remote_jid, \'\')));';
const endQueryIndex = content.indexOf(endString, firstIndex);
if (endQueryIndex === -1) {
  console.error('Error: Could not find the expected end string of malformed block!');
  process.exit(1);
}

const endIndex = content.indexOf('`,', endQueryIndex) + 2; // include ` and ,

console.log('Replacing from index', startIndex, 'to', endIndex);
console.log('Content to be replaced:\n', content.substring(startIndex, endIndex));

const replacementSql = `  \`
  -- Migration 40: Fix group campaign stats cache trigger logic
  -- Redefines refresh_campaign_stats_cache() to fix JID matching and recounts all campaign stats.
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'refresh_campaign_stats_cache'
    ) THEN
      EXECUTE $sql$
      CREATE OR REPLACE FUNCTION refresh_campaign_stats_cache()
      RETURNS TRIGGER AS $body$
      BEGIN
        DELETE FROM whatsapp_campaign_stats_cache 
        WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id);
        
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
        WHERE r.campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id)
        GROUP BY r.campaign_id;
        
        RETURN NEW;
      END;
      $body$ LANGUAGE plpgsql;
      $sql$;
      
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
      END;
    END IF;
  END $$;
  \`,`;

const updatedContent = content.substring(0, startIndex) + replacementSql + content.substring(endIndex);
fs.writeFileSync(filePath, updatedContent, 'utf8');
console.log('Successfully replaced malformed block!');
