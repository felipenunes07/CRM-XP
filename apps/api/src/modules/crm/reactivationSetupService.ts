import type { MessageAutomation } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { computeRecentBlock, applyWhatsappMessagePlaceholders, extractWhatsappSourceCode } from "../whatsapp/whatsappCore.js";
import { importWhatsappGroupsFromDefaultWorkbook } from "../whatsapp/whatsappGroupService.js";
import { createMessageAutomation, listMessageAutomations } from "./automationService.js";
import { findReactivationCustomers, requireReactivationSender } from "./reactivationAudience.js";
import { REACTIVATION_PHONE, REACTIVATION_PRESET, REACTIVATION_STAGES, isReactivationPreset, reactivationCustomerName, reactivationIdentityConflict } from "./reactivationCore.js";
import { buildReactivationGroupScopeSql } from "./reactivationGroupScope.js";

export async function prepareLiliReactivation() {
  const instances = await pool.query(`SELECT id FROM whatsapp_instances WHERE status = 'ACTIVE'
    AND (regexp_replace(COALESCE(phone_number,''), '[^0-9]', '', 'g') = $1
      OR (instance_name = 'Lili' AND COALESCE(phone_number,'') = ''))`, [REACTIVATION_PHONE]);
  if (instances.rows.length !== 1) throw new HttpError(400, "Nao foi encontrada uma unica instancia ativa com o numero da Lili Assistente.");
  const instanceId = String(instances.rows[0].id);
  await requireReactivationSender(instanceId, true);
  const lock = await pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(hashtextextended('prepare-lili-reactivation', 0))");
    await importWhatsappGroupsFromDefaultWorkbook();
    const existing = await listMessageAutomations();
    for (const stage of REACTIVATION_STAGES) {
      if (existing.some((item) => isReactivationPreset(item) && item.segmentDefinition.minDaysInactive === stage.days)) continue;
      await createMessageAutomation({
        name: `Lili — clientes sem comprar ha ${stage.days} dias`, status: "PAUSED", channel: "WHATSAPP_GROUP",
        sendMode: "AUTOMATIC", triggerMode: "ON_STAGE_ENTRY", whatsappInstanceId: instanceId,
        segmentDefinition: { minDaysInactive: stage.days, ...(stage.maxDays === null ? {} : { maxDaysInactive: stage.maxDays }) },
        flowDefinition: { reactivationPreset: REACTIVATION_PRESET }, messageText: stage.message,
        schedule: { frequency: "DAILY", time: "09:00", timezone: "America/Sao_Paulo" },
        minDelaySeconds: env.WHATSAPP_MIN_DELAY_SECONDS, maxDelaySeconds: env.WHATSAPP_MAX_DELAY_SECONDS,
      });
    }
    return previewLiliReactivation();
  } finally {
    await lock.query("SELECT pg_advisory_unlock(hashtextextended('prepare-lili-reactivation', 0))").catch(() => undefined);
    lock.release();
  }
}

export async function previewLiliReactivation() {
  const automations = (await listMessageAutomations()).filter(isReactivationPreset);
  if (!automations.length) throw new HttpError(404, "Prepare a regua Lili antes de simular.");
  const sender = await requireReactivationSender(automations[0]!.whatsappInstanceId);
  const stages = [];
  for (const automation of automations.sort((a, b) => a.segmentDefinition.minDaysInactive! - b.segmentDefinition.minDaysInactive!)) {
    await requireReactivationSender(automation.whatsappInstanceId);
    stages.push(await previewStage(automation));
  }
  return { generatedAt: new Date().toISOString(), sender: { id: String(sender.id), name: String(sender.display_label), phone: String(sender.phone_number) }, stages };
}

async function previewStage(automation: MessageAutomation) {
  const customers = await findReactivationCustomers(automation);
  const groups = await pool.query(`SELECT id, customer_id, jid, source_name, source_code, last_contact_at FROM whatsapp_groups g
    WHERE customer_id = ANY($1::uuid[]) AND ${buildReactivationGroupScopeSql('g')}`, [customers.map((item) => item.id)]);
  const codes = [...new Set(customers.map(c => extractWhatsappSourceCode(c.customer_code) ?? extractWhatsappSourceCode(c.display_name)).filter(Boolean))];
  const canonicalGroups = await pool.query(`SELECT g.customer_id, g.jid, g.source_name, g.source_code, g.last_contact_at
    FROM whatsapp_groups g JOIN customers owner ON owner.id = g.customer_id
    WHERE g.source_code = ANY($1::text[]) AND owner.customer_code = g.source_code
      AND ${buildReactivationGroupScopeSql('g')}`, [codes]);
  const rows = customers.map((customer) => {
    const matched = groups.rows.filter((group) => String(group.customer_id) === customer.id);
    const code = extractWhatsappSourceCode(customer.customer_code) ?? extractWhatsappSourceCode(customer.display_name);
    const duplicates = matched.length === 0 ? canonicalGroups.rows.filter(g => g.source_code === code && String(g.customer_id) !== customer.id) : [];
    const duplicate = duplicates.length === 1 ? duplicates[0] : null;
    const group = matched.length === 1 ? matched[0] : duplicate;
    const blocked = group && !automation.overrideRecentBlock && computeRecentBlock(group.last_contact_at ? String(group.last_contact_at) : null, env.WHATSAPP_RECENT_CONTACT_BLOCK_DAYS).isBlocked;
    const conflict = reactivationIdentityConflict(customer.customer_code, customer.display_name, group?.source_code ?? null);
    const status = conflict ? "IDENTITY_CONFLICT" : duplicate ? "DUPLICATE_CUSTOMER" : matched.length === 0 ? "NO_GROUP" : matched.length > 1 ? "MULTIPLE_GROUPS" : blocked ? "RECENT_CONTACT" : "READY";
    return { customerId: customer.id, customerCode: customer.customer_code, customerName: customer.display_name,
      daysInactive: Number(customer.days_inactive), lastPurchase: customer.last_purchase, status,
      groupName: group ? String(group.source_name) : null, groupJid: group ? String(group.jid) : null,
      message: applyWhatsappMessagePlaceholders(automation.messageText, { nome: reactivationCustomerName(customer.display_name) }) };
  });
  return { automationId: automation.id, days: automation.segmentDefinition.minDaysInactive!, status: automation.status,
    schedule: automation.schedule, nextRunAt: automation.nextRunAt, ready: rows.filter((row) => row.status === "READY").length, rows };
}
