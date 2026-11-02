import type { MessageAutomation } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { buildShippedSalesOnlySql } from "./salesOrderScope.js";
import { REACTIVATION_PHONE, reactivationStage, reactivationEventKey } from "./reactivationCore.js";
import { fetchEvolutionInstanceIdentity } from "../whatsapp/evolutionMetadataService.js";

// Datas de pedidos sao estaveis mesmo quando a reconstrucao recria os UUIDs.
export const REACTIVATION_LAST_PURCHASE_SQL = `
  SELECT o.customer_id, MAX(o.order_date::date) AS last_purchase
  FROM orders o
  WHERE o.order_date::date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
    AND o.total_amount > 0
    AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelado', 'cancelled', 'canceled', 'invalid')
    ${buildShippedSalesOnlySql("o")}
  GROUP BY o.customer_id
`;

export async function findReactivationCustomers(automation: MessageAutomation, ignoreRunId: string | null = null) {
  const stage = reactivationStage(automation.segmentDefinition);
  const result = await pool.query<{
    id: string; display_name: string; customer_code: string | null; last_purchase: string; days_inactive: number;
  }>(`
    WITH purchases AS (${REACTIVATION_LAST_PURCHASE_SQL})
    SELECT c.id, c.display_name, c.customer_code, p.last_purchase::text,
      ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - p.last_purchase)::int AS days_inactive
    FROM customers c JOIN purchases p ON p.customer_id = c.id
    WHERE ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - p.last_purchase) >= $1
      AND ($2::int IS NULL OR ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - p.last_purchase) <= $2)
      AND NOT EXISTS (
        SELECT 1 FROM message_automation_customer_events e
        JOIN message_automation_runs run ON run.id = e.last_triggered_run_id
        WHERE e.automation_id = $3 AND e.customer_id = c.id
          AND ($4::uuid IS NULL OR run.id <> $4)
          AND e.event_key = 'lili-inactivity:' || $1::text || ':purchase:' || p.last_purchase::text
          AND (run.status = 'PENDING_APPROVAL' OR EXISTS (
            SELECT 1 FROM whatsapp_campaign_recipients r
            WHERE r.campaign_id = run.campaign_id AND r.customer_id = c.id
              AND r.status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')
          ))
      )
      AND NOT EXISTS (
        SELECT 1 FROM whatsapp_campaign_recipients r JOIN whatsapp_campaigns campaign ON campaign.id = r.campaign_id
        WHERE r.customer_id = c.id AND r.status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')
          AND campaign.filters_snapshot->>'reactivationPreset' = 'lili-inactivity-v1'
          AND campaign.filters_snapshot->>'reactivationStageDays' = $1::text
          AND campaign.filters_snapshot->'reactivationCycles'->>c.id::text = p.last_purchase::text
      )
    ORDER BY days_inactive DESC, c.display_name
  `, [stage.days, stage.maxDays, automation.id, ignoreRunId]);
  return result.rows;
}

export async function requireReactivationSender(instanceId: string | null, verifyLive = false) {
  const result = await pool.query(`
    SELECT id, display_label, phone_number, provider, instance_name, evolution_base_url, evolution_api_key FROM whatsapp_instances
    WHERE id = $1 AND status = 'ACTIVE'
      AND (regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g') = $2
        OR ($3 AND COALESCE(phone_number, '') = '' AND instance_name = 'Lili'))
      AND ((provider = 'UAZAPI' AND COALESCE(uazapi_base_url, '') <> '' AND COALESCE(uazapi_token, '') <> '')
        OR (provider = 'EVOLUTION' AND COALESCE(instance_name, '') <> '' AND COALESCE(evolution_base_url, '') <> '' AND COALESCE(evolution_api_key, '') <> ''))
  `, [instanceId, REACTIVATION_PHONE, verifyLive]);
  if (!result.rows[0]) throw new Error("Selecione a instancia ativa Lili Assistente (+55 11 91127-9702), com credenciais configuradas.");
  const sender = result.rows[0];
  if (verifyLive && sender.provider === 'EVOLUTION') {
    const identity = await fetchEvolutionInstanceIdentity({ instanceName: String(sender.instance_name), baseUrl: String(sender.evolution_base_url), apiKey: String(sender.evolution_api_key) });
    if (identity.phone !== REACTIVATION_PHONE || identity.state !== 'open') throw new Error("A conta Lili Assistente deve estar conectada ao numero +55 11 91127-9702.");
    if (!sender.phone_number) {
      await pool.query("UPDATE whatsapp_instances SET phone_number = $2 WHERE id = $1 AND COALESCE(phone_number, '') = ''", [instanceId, identity.phone]);
      sender.phone_number = identity.phone;
    }
  }
  return sender;
}

export async function reactivationSalesAreFresh() {
  const result = await pool.query(`SELECT EXISTS (SELECT 1 FROM sync_cursors
    WHERE key = 'primary_hourly_sync_timestamp' AND updated_at >= NOW() - INTERVAL '2 hours') AS fresh`);
  return Boolean(result.rows[0]?.fresh);
}

export async function markReactivationCustomersHandled(automation: MessageAutomation, runId: string, cycles: Record<string, string>, customerIds: string[]) {
  const stage = reactivationStage(automation.segmentDefinition);
  const entries = customerIds.filter((id) => cycles[id]).map((id) => ({ id, key: reactivationEventKey(stage.days, cycles[id]!) }));
  if (!entries.length) return;
  await pool.query(`
    INSERT INTO message_automation_customer_events (automation_id, customer_id, event_key, last_triggered_run_id)
    SELECT $1, x.id::uuid, x.key, $2 FROM jsonb_to_recordset($3::jsonb) AS x(id text, key text)
    ON CONFLICT (automation_id, customer_id, event_key) DO UPDATE
      SET last_triggered_run_id = EXCLUDED.last_triggered_run_id, updated_at = NOW()
  `, [automation.id, runId, JSON.stringify(entries)]);
}
