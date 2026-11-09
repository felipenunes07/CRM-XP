import type { AutomationActivityQuery, AutomationActivityResponse } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { ensureAutomationTables } from "./automationService.js";

// Each row is a destination's actual state; an enqueued run alone never means a sent message.
export const AUTOMATION_ACTIVITY_SQL = `
WITH prospect_ledger AS MATERIALIZED (
  SELECT key,cursor_value::jsonb AS delivery,updated_at
  FROM sync_cursors WHERE starts_with(key,'prospect_group_followup:') OR starts_with(key,'prospect_group_followup_second:')
), activity AS (
  SELECT r.id::text AS id,ar.id::text AS run_id,r.customer_id::text AS customer_id,
    COALESCE(r.customer_code,r.source_code) AS customer_code,
    COALESCE(NULLIF(r.customer_display_name,''),r.source_name) AS customer_name,
    r.source_name AS group_name,r.jid AS group_jid,
    CASE WHEN c.filters_snapshot->>'reactivationPreset' = 'lili-inactivity-v1'
      THEN COALESCE(c.filters_snapshot->>'reactivationStageDays',a.segment_definition->>'minDaysInactive') || ' dias sem comprar'
      ELSE COALESCE(c.filters_snapshot->>'automationName',a.name,c.name) END AS rule_name,
    CASE WHEN c.filters_snapshot->>'reactivationPreset' = 'lili-inactivity-v1' THEN 'REACTIVATION' ELSE 'CUSTOM' END AS kind,
    CASE WHEN r.status = 'PENDING' AND c.status = 'PAUSED' THEN 'PAUSED'
      WHEN r.status IN ('PENDING','SENDING') AND c.status = 'CANCELLED' THEN 'SKIPPED' ELSE r.status END AS status,
    CASE WHEN r.status = 'SENT' THEN r.sent_at WHEN r.status = 'FAILED' THEN r.failed_at
      WHEN r.status = 'SKIPPED' THEN r.skipped_at ELSE COALESCE(r.scheduled_for,r.created_at) END AS event_at,
    r.sent_at,r.scheduled_for,
    CASE WHEN r.status = 'SENT' THEN sent.message ELSE c.message_text END AS message,
    COALESCE(r.last_error,CASE WHEN c.status = 'CANCELLED' THEN 'Campanha cancelada.' END) AS last_error
  FROM whatsapp_campaign_recipients r
  JOIN whatsapp_campaigns c ON c.id = r.campaign_id
  LEFT JOIN message_automation_runs ar ON ar.campaign_id = c.id
  LEFT JOIN message_automations a ON a.id = ar.automation_id
  LEFT JOIN LATERAL (
    SELECT ml.message FROM message_logs ml WHERE ml.campaign_id = c.id AND ml.destination = r.jid AND ml.status = 'SENT'
    ORDER BY ml.created_at DESC LIMIT 1
  ) sent ON r.status = 'SENT'
  WHERE c.filters_snapshot->>'originType' = 'AUTOMATION' OR ar.id IS NOT NULL
  UNION ALL
  SELECT ar.id::text || ':' || g.id::text,ar.id::text,g.customer_id::text,
    COALESCE(c.customer_code,g.source_code),COALESCE(c.display_name,g.source_name),g.source_name,g.jid,
    a.name,CASE WHEN a.flow_definition->>'reactivationPreset' = 'lili-inactivity-v1' THEN 'REACTIVATION' ELSE 'CUSTOM' END,
    'PENDING_APPROVAL',ar.scheduled_for,NULL::timestamptz,ar.scheduled_for,a.message_text,NULL::text
  FROM message_automation_runs ar JOIN message_automations a ON a.id = ar.automation_id
  JOIN whatsapp_groups g ON g.id::text IN (SELECT jsonb_array_elements_text(COALESCE(ar.audience_snapshot->'eligibleGroupIds','[]'::jsonb)))
  LEFT JOIN customers c ON c.id = g.customer_id
  WHERE ar.status = 'PENDING_APPROVAL' AND ar.campaign_id IS NULL
  UNION ALL
  SELECT p.key,NULL::text,NULL::text,NULL::text,COALESCE(p.delivery->>'name','Grupo novo'),
    COALESCE(p.delivery->>'name','Grupo novo'),split_part(p.key,':',2),
    CASE WHEN starts_with(p.key,'prospect_group_followup_second:') THEN 'Grupo novo · 2ª mensagem' ELSE 'Grupo novo · 1ª mensagem' END,
    'PROSPECT',CASE p.delivery->>'status' WHEN 'sent' THEN 'SENT' WHEN 'failed' THEN 'FAILED' WHEN 'sending' THEN 'SENDING' ELSE 'SKIPPED' END,
    COALESCE((p.delivery->>'sentAt')::timestamptz,p.updated_at),(p.delivery->>'sentAt')::timestamptz,NULL::timestamptz,
    COALESCE(p.delivery->>'message',sent.message),COALESCE(p.delivery->>'error',p.delivery->>'reason')
  FROM prospect_ledger p
  LEFT JOIN LATERAL (
    SELECT ml.message FROM message_logs ml WHERE ml.destination = split_part(p.key,':',2)
      AND ml.sent_by_name = 'Lili — retorno de grupo novo' AND ml.status = 'SENT' AND p.delivery->>'status' = 'sent'
      AND ml.created_at BETWEEN (p.delivery->>'sentAt')::timestamptz - INTERVAL '5 minutes' AND (p.delivery->>'sentAt')::timestamptz + INTERVAL '5 minutes'
    ORDER BY abs(extract(epoch FROM ml.created_at - (p.delivery->>'sentAt')::timestamptz)) LIMIT 1
  ) sent ON TRUE
), day_rows AS MATERIALIZED (
  SELECT * FROM activity WHERE event_at >= ($1::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND event_at < (($1::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND ($2 = 'ALL' OR kind = $2)
    AND ($3 = '' OR position(lower($3) IN lower(COALESCE(customer_code,'') || ' ' || customer_name || ' ' || group_name || ' ' || rule_name)) > 0)
    AND ($4::text IS NULL OR run_id = $4)
), filtered AS (
  SELECT * FROM day_rows WHERE $5 = 'ALL' OR status = $5
    OR ($5 = 'WAITING' AND status IN ('PENDING','SENDING','PAUSED'))
    OR ($5 = 'NOT_SENT' AND status IN ('SKIPPED','BLOCKED_RECENT'))
), page AS (
  SELECT * FROM filtered ORDER BY event_at DESC,id LIMIT $6 OFFSET $7
)
SELECT json_build_object(
  'sent',count(*) FILTER (WHERE status = 'SENT'),
  'waiting',count(*) FILTER (WHERE status IN ('PENDING','SENDING','PAUSED')),
  'failed',count(*) FILTER (WHERE status = 'FAILED'),
  'notSent',count(*) FILTER (WHERE status IN ('SKIPPED','BLOCKED_RECENT')),
  'awaitingApproval',count(*) FILTER (WHERE status = 'PENDING_APPROVAL')
) AS summary,(SELECT count(*) FROM filtered)::int AS total,
COALESCE((SELECT json_agg(json_build_object(
  'id',id,'runId',run_id,'customerId',customer_id,'customerCode',customer_code,'customerName',customer_name,
  'groupName',group_name,'groupJid',group_jid,'ruleName',rule_name,'kind',kind,'status',status,
  'eventAt',event_at,'sentAt',sent_at,'scheduledFor',scheduled_for,'message',message,'lastError',last_error
) ORDER BY event_at DESC,id) FROM page),'[]'::json) AS items FROM day_rows`;

export async function getAutomationActivity(query: AutomationActivityQuery): Promise<AutomationActivityResponse> {
  await ensureAutomationTables();
  const result = await pool.query(AUTOMATION_ACTIVITY_SQL, [query.date,query.kind ?? "ALL",query.search?.trim() ?? "",query.runId ?? null,query.status ?? "ALL",query.limit ?? 25,query.offset ?? 0]);
  return { date: query.date, ...result.rows[0] };
}
