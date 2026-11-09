import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { sendToGroup } from "../crm/offboardingAlertService.js";
import { requireReactivationSender } from "../crm/reactivationAudience.js";
import { startRecurringJob } from "../platform/scheduledJobs.js";
import { runPrimarySync } from "../platform/syncService.js";
import { fetchEvolutionGroupInfo } from "./evolutionMetadataService.js";
import { areWhatsappJidsEqual } from "./whatsappMonitorCore.js";
import { extractWhatsappSourceCode } from "./whatsappCore.js";
import { getWhatsappGroupsCreatedOnDate, getWhatsappReportTeamIdentities, isInternalWhatsappReportChat } from "./whatsappMonitorService.js";
import { buildProspectFollowupText, getProspectFollowupSchedule, pickProspectCustomer, prospectConversionReason, type ProspectCustomerRecord } from "./prospectFollowupCore.js";
import { getProspectRemarketingSettings } from "./prospectRemarketingSettings.js";
import type { ProspectRemarketingSettings } from "@olist-crm/shared";

type Sender = Awaited<ReturnType<typeof requireReactivationSender>>;
export interface ProspectFollowupPreview {
  jid: string;
  name: string;
  createdAt: string | null;
  phone: string | null;
  reason: string | null;
  text: string | null;
}

async function loadSender() {
  const result = await pool.query("SELECT id FROM whatsapp_instances WHERE status = 'ACTIVE' AND LOWER(instance_name) = 'lili' LIMIT 1");
  if (!result.rows[0]) throw new Error("Lili nao cadastrada para o retorno dos grupos novos.");
  const sender = await requireReactivationSender(String(result.rows[0].id), true);
  if (sender.provider !== "EVOLUTION") throw new Error("O retorno de grupos novos requer a instancia Lili na Evolution.");
  return sender;
}

type ProspectGroup = { jid: string; name: string; createdAt: string | null; firstRecipient?: string };
type Stage = "first" | "second";

async function inspectProspectGroup(group: ProspectGroup, sender: Sender, template?: string): Promise<ProspectFollowupPreview> {
  const skip = (reason: string): ProspectFollowupPreview => ({ ...group, phone: null, reason, text: null });
  const live = await fetchEvolutionGroupInfo({ instanceName: String(sender.instance_name), baseUrl: String(sender.evolution_base_url), apiKey: String(sender.evolution_api_key) }, group.jid);
  if (!live || live.rawProfile.id !== group.jid) return skip("group_unavailable");
  const name = live.displayName || group.name;
  group = { ...group, name };
  if (isInternalWhatsappReportChat({ name, remoteJid: group.jid }) || live.rawProfile.isCommunity || live.rawProfile.isCommunityAnnounce) return skip("internal_or_community");
  if (extractWhatsappSourceCode(name)) return skip("already_customer_code");
  const [team, links, customers] = await Promise.all([
    pool.query("SELECT phone_number FROM whatsapp_team_contacts UNION SELECT phone_number FROM whatsapp_instances WHERE phone_number IS NOT NULL"),
    pool.query(`SELECT source_name AS name, source_code AS code, customer_id, mapping_status FROM whatsapp_groups WHERE jid = $1
      UNION ALL SELECT title, NULL::text, customer_id, NULL::text FROM deals WHERE whatsapp_jid = $1`, [group.jid]),
    pool.query(`SELECT c.id, c.customer_code, c.display_name, c.phone,
      EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.order_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
        AND COALESCE(o.total_amount,0) > 0 AND LOWER(COALESCE(o.status,'')) NOT IN ('cancelado','cancelled','canceled','invalid')) AS has_purchase
      FROM customers c`),
  ]);
  if (links.rows.some((row) => row.mapping_status === "IGNORED")) return skip("ignored_group");
  if (links.rows.some((row) => row.code || extractWhatsappSourceCode(String(row.name ?? "")))) return skip("already_customer_code");
  const teamIdentities = [...getWhatsappReportTeamIdentities(), ...team.rows.map((row) => String(row.phone_number ?? ""))].filter(Boolean);
  const owner = String(live.rawProfile.owner ?? "");
  const participants = Array.isArray(live.rawProfile.participants) ? live.rawProfile.participants as Record<string, unknown>[] : [];
  const ownerMember = participants.find((participant) => String(participant.id ?? "") === owner);
  const ownerIdentities = [owner, String(ownerMember?.phoneNumber ?? "")].filter(Boolean);
  if (!ownerIdentities.some((identity) => teamIdentities.some((team) => areWhatsappJidsEqual(identity, team)))) return skip("group_creator_not_team");
  const target = pickProspectCustomer(participants, teamIdentities);
  if (!target.phone) return skip(target.reason!);
  const records: ProspectCustomerRecord[] = customers.rows.map((row) => ({ id: String(row.id), customerCode: row.customer_code, name: String(row.display_name), phone: row.phone, hasPurchase: Boolean(row.has_purchase) }));
  const reason = prospectConversionReason(name, target.phone, links.rows.filter((row) => row.customer_id).map((row) => String(row.customer_id)), records);
  if (reason) return skip(reason);
  return { ...group, phone: target.phone, reason: null, text: buildProspectFollowupText(target.phone, template) };
}

export async function previewProspectFollowups(date = getProspectFollowupSchedule().date) {
  const settings = await getProspectRemarketingSettings();
  const schedule = getProspectFollowupSchedule(new Date(`${date}T12:00:00Z`), settings.first.daysAfterCreation);
  const groups = await getWhatsappGroupsCreatedOnDate(schedule.createdDate);
  if (!groups.length) return { date, createdDate: schedule.createdDate, groups: [] as ProspectFollowupPreview[] };
  const sender = await loadSender();
  const previews: ProspectFollowupPreview[] = [];
  for (const group of groups) previews.push(await inspectProspectGroup(group, sender, settings.first.message));
  return { date, createdDate: schedule.createdDate, groups: previews };
}

async function salesAreFresh() {
  const result = await pool.query("SELECT EXISTS (SELECT 1 FROM sync_cursors WHERE key = 'primary_hourly_sync_timestamp' AND updated_at >= NOW() - INTERVAL '15 minutes') AS fresh");
  return Boolean(result.rows[0]?.fresh);
}

async function secondCandidates(date: string, daysAfterFirst: number): Promise<ProspectGroup[]> {
  // The first-stage ledger is the source of truth, including deliveries made before settings existed.
  const result = await pool.query(`WITH deliveries AS MATERIALIZED (
      SELECT key,cursor_value::jsonb AS delivery FROM sync_cursors WHERE starts_with(key,'prospect_group_followup:')
    ) SELECT substring(key FROM length('prospect_group_followup:')+1) AS jid,
      delivery->>'name' AS name, delivery->>'createdAt' AS created_at, delivery->>'phone' AS first_recipient
    FROM deliveries WHERE delivery->>'status' = 'sent'
      AND ((delivery->>'sentAt')::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date = $1::date - $2::int`, [date, daysAfterFirst]);
  return result.rows.map(row => ({ jid: String(row.jid), name: String(row.name ?? ""), createdAt: row.created_at ?? null, firstRecipient: String(row.first_recipient ?? "") }));
}

async function sendProspectFollowup(group: ProspectGroup, sender: Sender, stage: Stage, settings: ProspectRemarketingSettings) {
  const key = `${stage === "first" ? "prospect_group_followup" : "prospect_group_followup_second"}:${group.jid}`;
  const client = await pool.connect();
  let locked = false;
  try {
    locked = Boolean((await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [key])).rows[0]?.locked);
    if (!locked) return { jid: group.jid, status: "running" };
    if ((await client.query("SELECT cursor_value FROM sync_cursors WHERE key=$1", [key])).rows.length) return { jid: group.jid, status: "already_handled" };
    // Refresh identity, membership and sales immediately before the outbound message.
    const template = stage === "first" ? settings.first.message : settings.second!.message;
    const preview = await inspectProspectGroup(group, sender, template);
    if (preview.reason) {
      if (["already_customer_code", "already_customer", "already_purchased", "ignored_group", "internal_or_community"].includes(preview.reason)) {
        await client.query("INSERT INTO sync_cursors(key,cursor_value,updated_at) VALUES($1,$2,NOW())", [key, JSON.stringify({status:"skipped",name:preview.name,reason:preview.reason})]);
      }
      logger.info("prospect followup skipped", { jid: group.jid, reason: preview.reason });
      return { jid: group.jid, status: "skipped", reason: preview.reason };
    }
    if (!await salesAreFresh()) throw new Error("Vendas desatualizadas: retorno de prospect nao enviado.");
    if (stage === "second" && (!group.firstRecipient || !areWhatsappJidsEqual(group.firstRecipient, preview.phone!))) return { jid: group.jid, status: "skipped", reason: "customer_changed" };
    const current = await getProspectRemarketingSettings();
    if (!current.enabled || JSON.stringify(current) !== JSON.stringify(settings)) return { jid: group.jid, status: "settings_changed" };
    await client.query("INSERT INTO sync_cursors(key,cursor_value,updated_at) VALUES($1,$2,NOW())", [key, JSON.stringify({ status: "sending", name: preview.name, createdAt: group.createdAt, phone: preview.phone, message: preview.text })]);
    try {
      await sendToGroup(group.jid, preview.text!, String(sender.id), [preview.phone!]);
    } catch (error) {
      await client.query("UPDATE sync_cursors SET cursor_value=$2,updated_at=NOW() WHERE key=$1", [key, JSON.stringify({ status: "failed", name: preview.name, message: preview.text, error: String(error) })]);
      throw error;
    }
    await client.query("UPDATE sync_cursors SET cursor_value=$2,updated_at=NOW() WHERE key=$1", [key, JSON.stringify({ status: "sent", name: preview.name, createdAt: group.createdAt, phone: preview.phone, message: preview.text, sentAt: new Date().toISOString() })]);
    await client.query(`INSERT INTO message_logs(destination,message,status,sent_by_name)
      VALUES($1,$2,'SENT','Lili — retorno de grupo novo')`, [group.jid, preview.text]);
    logger.info("prospect followup sent", { jid: group.jid });
    return { jid: group.jid, status: "sent" };
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]);
    } finally { client.release(); }
  }
}

export async function runProspectFollowups(now = new Date()) {
  if (!getProspectFollowupSchedule(now).due) return { results: [], reason: "not_due" };
  const settings = await getProspectRemarketingSettings();
  if (!settings.enabled) return { results: [], reason: "not_due" };
  const schedule = getProspectFollowupSchedule(now, settings.first.daysAfterCreation);
  const first = await getWhatsappGroupsCreatedOnDate(schedule.createdDate);
  const second = settings.second?.enabled ? await secondCandidates(schedule.date, settings.second.daysAfterFirst) : [];
  const candidates = [...first.map(group => ({ group, stage: "first" as const })), ...second.map(group => ({ group, stage: "second" as const }))];
  if (!candidates.length) return { results: [], reason: "no_groups" };
  if (!await salesAreFresh()) await runPrimarySync("prospect-group-followup-before-send");
  if (!await salesAreFresh()) throw new Error("Nao foi possivel confirmar vendas atualizadas para o retorno de grupos novos.");
  const sender = await loadSender();
  const results = [];
  for (const { group, stage } of candidates) {
    try {
      const result = await sendProspectFollowup(group, sender, stage, settings);
      results.push(result);
      if (result.status === "sent") await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    catch (error) { logger.error("prospect followup failed", { jid: group.jid, error: String(error) }); }
  }
  return { results };
}

export function startProspectFollowupScheduler() {
  logger.info("prospect group followup scheduler", { enabled: env.WHATSAPP_PROSPECT_FOLLOWUP_ENABLED, time: "09:00", timezone: "America/Sao_Paulo", daysAfterCreation: 2, everyDay: true });
  return startRecurringJob({ intervalMs: 30_000, run: () => runProspectFollowups(), onError: (error) => logger.error("prospect followup scheduler failed", { error: String(error) }) });
}
