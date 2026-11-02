import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pool: null as Pool | null, enqueue: vi.fn(), identity: vi.fn(), sync: vi.fn() }));
vi.mock("../../db/client.js", () => ({ pool: {
  query: (...args: unknown[]) => (state.pool!.query as Function)(...args),
  connect: () => state.pool!.connect(),
} }));
vi.mock("../whatsapp/whatsappQueue.js", () => ({ enqueueWhatsappCampaignRecipients: state.enqueue }));
vi.mock("../whatsapp/evolutionMetadataService.js", () => ({ fetchEvolutionInstanceIdentity: state.identity }));
vi.mock("../platform/syncService.js", () => ({ runPrimarySync: state.sync }));
vi.mock("../whatsapp/whatsappGroupService.js", async (original) => ({
  ...await original<object>(), importWhatsappGroupsFromDefaultWorkbook: vi.fn(async () => ({})),
}));

import { prepareLiliReactivation, previewLiliReactivation } from "./reactivationSetupService.js";
import { listMessageAutomations, runMessageAutomationNow, approveMessageAutomationRun, rejectMessageAutomationRun, computeNextAutomationRunAt, executeDueMessageAutomations } from "./automationService.js";
import { claimRecipientForDispatch, markRecipientSent, resetStaleSendingRecipients } from "../whatsapp/whatsappCampaignService.js";
import { findReactivationCustomers } from "./reactivationAudience.js";
import { REACTIVATION_PHONE, REACTIVATION_PRESET } from "./reactivationCore.js";

// O teste clona apenas a estrutura; o search_path nunca inclui public e nenhum envio sai da fila falsa.
describe.runIf(Boolean(process.env.TEST_DATABASE_URL))("reativacao com Postgres real em schema isolado", () => {
  const schema = `reactivation_test_${randomUUID().replace(/-/g, "")}`;
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  let user: { id: string; email: string; name: string; role: "ADMIN" };
  let instanceId: string;
  let rules: Awaited<ReturnType<typeof listMessageAutomations>>;
  const db = () => state.pool!;
  const tables = ["users", "customers", "orders", "saved_segments", "message_templates", "whatsapp_instances", "whatsapp_groups", "customer_snapshot", "whatsapp_campaigns", "whatsapp_campaign_recipients", "message_logs", "sync_cursors", "message_automations", "message_automation_runs", "message_automation_customer_events", "whatsapp_campaign_stats_cache"];

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network prohibited in integration tests'); }));
    await admin.query(`CREATE SCHEMA "${schema}"`);
    for (const table of tables) await admin.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
    state.pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},pg_catalog`, max: 8, statement_timeout: 15000 });
    state.identity.mockResolvedValue({ phone: REACTIVATION_PHONE, state: "open" });
    user = { id: randomUUID(), email: "reactivation-test@example.invalid", name: "Teste", role: "ADMIN" };
    await db().query("INSERT INTO users (id,email,password_hash,name,role) VALUES ($1,$2,'test-only',$3,$4)", [user.id, user.email, user.name, user.role]);
    instanceId = randomUUID();
    await db().query(`INSERT INTO whatsapp_instances (id,instance_name,display_label,phone_number,status,provider,evolution_base_url,evolution_api_key)
      VALUES ($1,'Lili','Lili Assistente',$2,'ACTIVE','EVOLUTION','https://example.invalid','test-only')`, [instanceId, REACTIVATION_PHONE]);
    await prepareLiliReactivation();
    rules = await listMessageAutomations();
  }, 60000);

  beforeEach(async () => {
    await db().query("TRUNCATE message_automation_customer_events, message_automation_runs, whatsapp_campaign_recipients, whatsapp_campaigns, message_logs, whatsapp_groups, orders, customers, customer_snapshot, sync_cursors");
    await db().query("INSERT INTO sync_cursors(key,cursor_value,updated_at) VALUES ('primary_hourly_sync_timestamp','test',NOW())");
    await db().query("UPDATE message_automations SET status='PAUSED',next_run_at=NULL,last_run_at=NULL");
    await db().query("UPDATE whatsapp_instances SET phone_number = $1, status = 'ACTIVE' WHERE id = $2", [REACTIVATION_PHONE, instanceId]);
    state.enqueue.mockReset().mockResolvedValue([]);
    state.identity.mockReset().mockResolvedValue({ phone: REACTIVATION_PHONE, state: "open" });
    state.sync.mockReset().mockImplementation(async () => { await db().query('UPDATE sync_cursors SET updated_at=NOW()'); });
  });

  afterAll(async () => {
    await state.pool?.end();
    if (!/^reactivation_test_[a-f0-9]{32}$/.test(schema)) throw new Error("Schema de teste invalido");
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    vi.unstubAllGlobals();
  });

  async function customer(days = 35, mapping = "AUTO_MAPPED", groupCount = 1) {
    const id = randomUUID();
    const code = `CL${Math.random().toString().slice(2, 10)}`;
    await db().query("INSERT INTO customers (id,customer_code,display_name,normalized_name,source_system_first) VALUES ($1,$2,$3,'cliente teste','history_xls')", [id, code, `${code} - Cliente Teste`]);
    await db().query("INSERT INTO orders (customer_id,customer_code,order_date,total_amount,status,source_system,order_number) VALUES ($1,$2,(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date-$3::int,100,'VALID','history_xls',$4)", [id, code, days, randomUUID()]);
    const groups: string[] = [];
    for (let index = 0; index < groupCount; index++) {
      const groupId = randomUUID(); groups.push(groupId);
      await db().query(`INSERT INTO whatsapp_groups (id,jid,source_name,normalized_source_name,source_code,classification,mapping_status,customer_id)
        VALUES ($1,$2,$3,'cliente teste',$4,'WITH_ORDER',$5,$6)`, [groupId, `${Date.now()}${Math.floor(Math.random()*100000)}@g.us`, `${code} - Cliente Teste`, code, mapping, id]);
    }
    return { id, code, groups };
  }
  const rule = (days: number) => rules.find((item) => item.segmentDefinition.minDaysInactive === days)!;
  async function queuedRecipient(days = 30) {
    const run = await runMessageAutomationNow(rule(days).id, user, "AUTOMATIC");
    expect(run.status, run.errorMessage ?? "run failed").toBe("ENQUEUED");
    expect(run.campaignId).toBeTruthy();
    const rows = await db().query("SELECT * FROM whatsapp_campaign_recipients WHERE campaign_id=$1", [run.campaignId]);
    return { run, recipient: rows.rows[0] };
  }

  it("prepara exatamente tres regras pausadas e nao duplica em nova preparacao", async () => {
    const preview = await prepareLiliReactivation();
    expect(preview.stages.map((stage) => stage.days)).toEqual([30, 60, 90]);
    expect((await listMessageAutomations())).toHaveLength(3);
    expect(preview.stages.every((stage) => stage.status === "PAUSED")).toBe(true);
    expect(preview.sender.phone).toBe(REACTIVATION_PHONE);
    expect(state.enqueue).not.toHaveBeenCalled();
  });
  it("simula mensagens personalizadas sem campanha, evento ou envio", async () => {
    await customer();
    const preview = await previewLiliReactivation();
    expect(preview.stages[0]!.rows[0]).toMatchObject({ status: "READY" });
    expect(preview.stages[0]!.rows[0]!.message).toContain("Oi Cliente Teste,");
    expect((await db().query("SELECT * FROM message_automation_customer_events")).rows).toHaveLength(0);
    expect((await db().query("SELECT * FROM whatsapp_campaigns")).rows).toHaveLength(0);
    expect(state.enqueue).not.toHaveBeenCalled();
  });
  it("enfileira uma unica vez e registra o envio no historico", async () => {
    const c = await customer();
    const { recipient } = await queuedRecipient();
    const context = await claimRecipientForDispatch(recipient.id);
    expect(context?.customerDisplayName).toBe("Cliente Teste");
    expect(context?.evolutionInstance?.instanceName).toBe("Lili");
    await markRecipientSent(context!, { key: { id: "test-provider-id" } }, "test-provider-id", "PENDING");
    expect((await runMessageAutomationNow(rule(30).id, user)).status).toBe("NO_MATCH");
    expect((await db().query("SELECT status,destination FROM message_logs WHERE customer_id=$1", [c.id])).rows[0]).toMatchObject({ status: "SENT", destination: recipient.jid });
    expect((await db().query("SELECT * FROM whatsapp_campaigns")).rows).toHaveLength(1);
    await db().query("UPDATE orders SET id=gen_random_uuid() WHERE customer_id=$1", [c.id]);
    expect((await runMessageAutomationNow(rule(30).id, user)).status).toBe("NO_MATCH");
  });
  it("inicia novo ciclo depois de recompra", async () => {
    const c = await customer(45);
    await queuedRecipient();
    await db().query("UPDATE orders SET order_date=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date WHERE customer_id=$1", [c.id]);
    expect((await findReactivationCustomers(rule(30)))).toHaveLength(0);
    await db().query("UPDATE orders SET order_date=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date-31 WHERE customer_id=$1", [c.id]);
    await queuedRecipient();
    expect((await db().query("SELECT * FROM whatsapp_campaigns")).rows).toHaveLength(2);
  });
  it("nao consome a faixa de quem esta bloqueado ou sem grupo", async () => {
    const c = await customer(35, "PENDING_REVIEW");
    expect((await runMessageAutomationNow(rule(30).id, user)).status).toBe("NO_MATCH");
    await db().query("UPDATE whatsapp_groups SET mapping_status='MANUAL_MAPPED',last_contact_at=NOW() WHERE customer_id=$1", [c.id]);
    expect((await runMessageAutomationNow(rule(30).id, user)).status).toBe("NO_MATCH");
    expect((await db().query("SELECT * FROM message_automation_customer_events")).rows).toHaveLength(0);
    await db().query("UPDATE whatsapp_groups SET last_contact_at=NULL WHERE customer_id=$1", [c.id]);
    await queuedRecipient();
  });
  it("separa clientes com mais de um grupo para revisao", async () => {
    await customer(35, "AUTO_MAPPED", 2);
    expect((await previewLiliReactivation()).stages[0]!.rows[0]!.status).toBe("MULTIPLE_GROUPS");
    expect((await runMessageAutomationNow(rule(30).id, user)).status).toBe("NO_MATCH");
  });
  it("separa codigo conflitante entre cadastro, nome e grupo", async () => {
    const c = await customer();
    await db().query("UPDATE customers SET display_name='CL999999 - Outro Cliente' WHERE id=$1", [c.id]);
    expect((await previewLiliReactivation()).stages[0]!.rows[0]!.status).toBe('IDENTITY_CONFLICT');
    expect((await runMessageAutomationNow(rule(30).id, user)).status).toBe('NO_MATCH');
  });
  it("cancela mensagem na fila apos recompra", async () => {
    const c = await customer();
    const { recipient } = await queuedRecipient();
    await db().query("UPDATE orders SET order_date=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date WHERE customer_id=$1", [c.id]);
    expect(await claimRecipientForDispatch(recipient.id)).toBeNull();
    expect((await db().query("SELECT status,last_error FROM whatsapp_campaign_recipients WHERE id=$1", [recipient.id])).rows[0]).toMatchObject({ status: "SKIPPED", last_error: expect.stringContaining("recomprou") });
  });
  it("revalida compra quando aprova uma simulacao", async () => {
    const c = await customer();
    const run = await runMessageAutomationNow(rule(30).id, user, "APPROVAL");
    expect(run.status).toBe("PENDING_APPROVAL");
    await db().query("UPDATE orders SET order_date=(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date WHERE customer_id=$1", [c.id]);
    expect((await approveMessageAutomationRun(run.id, user)).status).toBe("NO_MATCH");
    expect((await db().query("SELECT * FROM whatsapp_campaigns")).rows).toHaveLength(0);
  });
  it("permite nova tentativa apos rejeitar uma execucao para aprovacao", async () => {
    await customer();
    const run = await runMessageAutomationNow(rule(30).id, user, "APPROVAL");
    expect((await runMessageAutomationNow(rule(30).id, user, "APPROVAL")).status).toBe("NO_MATCH");
    await rejectMessageAutomationRun(run.id, user);
    await queuedRecipient();
  });
  it("trava execucoes concorrentes sem duplicar campanha", async () => {
    await customer();
    const results = await Promise.allSettled([runMessageAutomationNow(rule(30).id, user), runMessageAutomationNow(rule(30).id, user)]);
    expect(results.some((item) => item.status === "fulfilled" && item.value.status === "ENQUEUED")).toBe(true);
    expect((await db().query("SELECT * FROM whatsapp_campaigns")).rows).toHaveLength(1);
  });
  it("aprova a mesma execucao uma unica vez mesmo com cliques concorrentes", async () => {
    await customer();
    const run = await runMessageAutomationNow(rule(30).id, user, 'APPROVAL');
    await Promise.allSettled([approveMessageAutomationRun(run.id, user), approveMessageAutomationRun(run.id, user)]);
    expect((await db().query('SELECT * FROM whatsapp_campaigns')).rows).toHaveLength(1);
  });
  it("agenda pela API ou worker e nao acumula execucoes de dias perdidos", async () => {
    await customer();
    await db().query("UPDATE message_automations SET status='ACTIVE',next_run_at=NOW()-INTERVAL '3 days' WHERE id=$1", [rule(30).id]);
    await executeDueMessageAutomations();
    await executeDueMessageAutomations();
    expect((await db().query('SELECT * FROM whatsapp_campaigns')).rows).toHaveLength(1);
    const row = (await db().query('SELECT next_run_at > NOW() AS future FROM message_automations WHERE id=$1', [rule(30).id])).rows[0];
    expect(row.future).toBe(true);
    expect((await db().query('SELECT created_by_user_id FROM whatsapp_campaigns')).rows[0].created_by_user_id).toBe(user.id);
  });
  it("mantem o destinatario persistido se o Redis falhar", async () => {
    await customer(); state.enqueue.mockRejectedValueOnce(new Error("Redis unavailable (test)"));
    await queuedRecipient();
    expect((await runMessageAutomationNow(rule(30).id, user)).status).toBe("NO_MATCH");
    expect((await db().query("SELECT status FROM whatsapp_campaign_recipients")).rows[0].status).toBe("PENDING");
  });
  it("aguarda vendas atualizadas e nao dispara com banco desatualizado", async () => {
    await customer();
    const { recipient } = await queuedRecipient();
    await db().query("UPDATE sync_cursors SET updated_at=NOW()-INTERVAL '3 hours'");
    expect(await claimRecipientForDispatch(recipient.id)).toBeNull();
    expect((await db().query("SELECT status FROM whatsapp_campaign_recipients WHERE id=$1", [recipient.id])).rows[0].status).toBe("PENDING");
  });
  it("atualiza vendas antes da verificacao diaria quando a sincronizacao esta atrasada", async () => {
    await customer();
    await db().query("UPDATE sync_cursors SET updated_at=NOW()-INTERVAL '3 hours'");
    await db().query("UPDATE message_automations SET status='ACTIVE',next_run_at=NOW()-INTERVAL '1 minute' WHERE id=$1", [rule(30).id]);
    await executeDueMessageAutomations();
    expect(state.sync).toHaveBeenCalledWith('lili-reactivation-before-send');
    expect((await db().query('SELECT * FROM whatsapp_campaigns')).rows).toHaveLength(1);
  });
  it("recusa conta reconectada em outro numero e nao usa remetente padrao", async () => {
    await customer();
    const { recipient } = await queuedRecipient();
    state.identity.mockResolvedValue({ phone: "5511000000000", state: "open" });
    await expect(claimRecipientForDispatch(recipient.id)).rejects.toThrow("numero");
    expect((await db().query("SELECT status FROM whatsapp_campaign_recipients WHERE id=$1", [recipient.id])).rows[0].status).toBe("PENDING");
  });
  it("nao reenvia automaticamente um envio sem confirmacao depois de reiniciar", async () => {
    await customer();
    const { recipient } = await queuedRecipient();
    await db().query("UPDATE whatsapp_campaign_recipients SET status='SENDING',last_attempt_at=NOW()-INTERVAL '10 minutes' WHERE id=$1", [recipient.id]);
    await resetStaleSendingRecipients();
    expect((await db().query("SELECT status FROM whatsapp_campaign_recipients WHERE id=$1", [recipient.id])).rows[0].status).toBe("FAILED");
  });
  it("respeita o intervalo da Lili mesmo quando destinatarios atrasados voltam juntos", async () => {
    await customer(); await customer();
    const { run } = await queuedRecipient();
    const recipients = (await db().query('SELECT id FROM whatsapp_campaign_recipients WHERE campaign_id=$1 ORDER BY scheduled_for', [run.campaignId])).rows;
    const first = await claimRecipientForDispatch(recipients[0].id);
    expect(first).toBeTruthy();
    expect(await claimRecipientForDispatch(recipients[1].id)).toBeNull();
    await markRecipientSent(first!, { key: { id: 'test-rate-id' } }, 'test-rate-id', 'PENDING');
    expect(await claimRecipientForDispatch(recipients[1].id)).toBeNull();
    await db().query("UPDATE whatsapp_campaign_recipients SET last_attempt_at=NOW()-INTERVAL '10 minutes' WHERE id=$1", [recipients[0].id]);
    expect(await claimRecipientForDispatch(recipients[1].id)).toBeTruthy();
  });
  it("revalida o grupo e o contato recente antes do envio", async () => {
    const c = await customer();
    const { recipient } = await queuedRecipient();
    await db().query('UPDATE whatsapp_groups SET last_contact_at=NOW() WHERE customer_id=$1', [c.id]);
    expect(await claimRecipientForDispatch(recipient.id)).toBeNull();
    expect((await db().query('SELECT status FROM whatsapp_campaign_recipients WHERE id=$1', [recipient.id])).rows[0].status).toBe('SKIPPED');
  });
  it("nao perde o controle de repeticao se o processo cair antes de gravar o evento", async () => {
    await customer(); await queuedRecipient();
    await db().query('DELETE FROM message_automation_customer_events');
    expect((await runMessageAutomationNow(rule(30).id, user)).status).toBe('NO_MATCH');
    expect((await db().query('SELECT * FROM whatsapp_campaigns')).rows).toHaveLength(1);
  });
  it("ignora cancelados, pedidos futuros e pedidos Olist ainda nao enviados", async () => {
    const c = await customer(35);
    await db().query("UPDATE orders SET status='cancelado' WHERE customer_id=$1", [c.id]);
    expect(await findReactivationCustomers(rule(30))).toHaveLength(0);
    await db().query("UPDATE orders SET status='Em aberto',source_system='olist_v2' WHERE customer_id=$1", [c.id]);
    expect(await findReactivationCustomers(rule(30))).toHaveLength(0);
    await db().query("UPDATE orders SET status='Enviado',order_date=CURRENT_DATE+1 WHERE customer_id=$1", [c.id]);
    expect(await findReactivationCustomers(rule(30))).toHaveLength(0);
  });
  it("trata a base antiga so na faixa atual, inclusive acima de 180 dias", async () => {
    await customer(250);
    expect(await findReactivationCustomers(rule(30))).toHaveLength(0);
    expect(await findReactivationCustomers(rule(60))).toHaveLength(0);
    expect(await findReactivationCustomers(rule(90))).toHaveLength(1);
    await queuedRecipient(90);
  });
  it("agenda em Sao Paulo e pula datas perdidas sem disparos acumulados", () => {
    expect(computeNextAutomationRunAt({ frequency: "DAILY", time: "09:00", timezone: "America/Sao_Paulo" }, new Date("2026-11-02T13:00:00Z")).toISOString()).toBe("2026-11-03T12:00:00.000Z");
    expect(rules.every((item) => item.flowDefinition.reactivationPreset === REACTIVATION_PRESET)).toBe(true);
  });
});
