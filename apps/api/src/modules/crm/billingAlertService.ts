/**
 * Alerta de cobranca do financeiro.
 *
 * - Todo dia as BILLING_ALERT_HOUR (9h) manda ao grupo do financeiro o
 *   relatorio completo: estourou o limite, acima do credito, prazo vencido,
 *   perto do limite e quem deve sem prazo cadastrado.
 * - Durante o dia, sempre que a planilha de saldo for reprocessada (o worker
 *   olha o Dropbox a cada poucos minutos), avisa na hora somente os alertas
 *   NOVOS — ex.: lancaram um pedido que fez o cliente passar do limite.
 *
 * Os dados vem do snapshot ativo da planilha (RESUMO/OUT/PAG) que o
 * customerCreditService ja importa; as regras ficam em billingAlertEngine.
 */
import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { safeNumber } from "../../lib/normalize.js";
import {
  buildBillingAlertReport,
  buildDailyReportMessages,
  buildNewAlertsMessages,
  collectAlertKeys,
  type BillingAlertReport,
  type BillingCustomerInput,
  type BillingOrderInput,
  type BillingPaymentInput,
  type BillingUnmatchedEntry,
} from "./billingAlertEngine.js";
import { sendToGroup } from "./offboardingAlertService.js";

const BILLING_DAILY_CURSOR_KEY = "billing_alert_daily_date";
const BILLING_STATE_CURSOR_KEY = "billing_alert_state";
const BILLING_LOCK_NS = 724021;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SEND_DELAY_MS = 1500;
const UNMATCHED_LOOKBACK_DAYS = 60;

interface BillingAlertState {
  dateKey: string;
  snapshotId: string;
  keys: string[];
}

export interface BillingAlertRunResult {
  report: BillingAlertReport | null;
  messages: string[];
  sent: boolean;
  reason?: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLocalParts(timeZone: string, date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour ?? "0"),
  };
}

async function getActiveSnapshotId(): Promise<string | null> {
  const result = await pool.query(
    `SELECT id FROM customer_credit_snapshots WHERE is_active = TRUE ORDER BY imported_at DESC LIMIT 1`,
  );
  return result.rows[0]?.id ? String(result.rows[0].id) : null;
}

/**
 * Le do snapshot so quem esta devendo. CREDITO INTERNO e STATUS (colunas H e
 * J da RESUMO) nao tem coluna propria: vem do raw_payload da linha, cujo
 * cabecalho o SheetJS entrega com espacos (" CREDITO INTERNO ").
 *
 * A divida usada no limite e a da RESUMO, que inclui valores extras da aba
 * DADOS (PENDENCIA / CAIXAS FECHADAS). Esses extras nao tem pedido nem data,
 * entao nao entram no calculo de prazo — que usa so OUT x PAG.
 */
async function loadBillingInputs(snapshotId: string) {
  const customersResult = await pool.query(
    `
      SELECT
        snapshot_row.customer_id,
        snapshot_row.customer_code,
        COALESCE(snapshot_row.customer_display_name, snapshot_row.source_display_name, snapshot_row.customer_code) AS display_name,
        snapshot_row.balance_amount,
        COALESCE(override.credit_limit, snapshot_row.credit_limit) AS credit_limit,
        COALESCE(override.payment_term, snapshot_row.payment_term) AS payment_term,
        (
          SELECT entry.value FROM jsonb_each_text(snapshot_row.raw_payload) AS entry
          WHERE UPPER(BTRIM(entry.key)) = 'CREDITO INTERNO'
          LIMIT 1
        ) AS internal_credit_limit,
        (
          SELECT entry.value FROM jsonb_each_text(snapshot_row.raw_payload) AS entry
          WHERE UPPER(BTRIM(entry.key)) = 'STATUS'
          LIMIT 1
        ) AS customer_status
      FROM customer_credit_snapshot_rows snapshot_row
      LEFT JOIN customer_credit_overrides override
        ON override.customer_id = snapshot_row.customer_id
      WHERE snapshot_row.snapshot_id = $1
        AND snapshot_row.balance_amount < 0
        AND COALESCE(snapshot_row.customer_display_name, '') NOT ILIKE '%shop online%'
        AND COALESCE(snapshot_row.source_display_name, '') NOT ILIKE '%shop online%'
    `,
    [snapshotId],
  );

  const customers: BillingCustomerInput[] = customersResult.rows.map((row) => ({
    customerCode: String(row.customer_code),
    customerId: row.customer_id ? String(row.customer_id) : null,
    displayName: String(row.display_name ?? row.customer_code),
    debtAmount: Math.abs(Number(row.balance_amount ?? 0)),
    creditLimit: row.credit_limit === null ? null : Number(row.credit_limit),
    internalCreditLimit: row.internal_credit_limit ? safeNumber(row.internal_credit_limit) : null,
    paymentTerm: row.payment_term === null || row.payment_term === undefined ? null : Number(row.payment_term),
    status: row.customer_status ? String(row.customer_status).trim() || null : null,
  }));

  const codes = customers.map((customer) => customer.customerCode);
  if (!codes.length) {
    return { customers, orders: [] as BillingOrderInput[], payments: [] as BillingPaymentInput[] };
  }

  const [ordersResult, paymentsResult] = await Promise.all([
    pool.query(
      `
        SELECT customer_code, order_key, order_number, order_date::text AS order_date, total_amount
        FROM customer_credit_order_entries
        WHERE snapshot_id = $1 AND customer_code = ANY($2::text[])
      `,
      [snapshotId, codes],
    ),
    pool.query(
      `
        SELECT customer_code, SUM(amount) AS amount
        FROM customer_credit_payment_entries
        WHERE snapshot_id = $1 AND customer_code = ANY($2::text[])
        GROUP BY customer_code
      `,
      [snapshotId, codes],
    ),
  ]);

  const orders: BillingOrderInput[] = ordersResult.rows.map((row) => ({
    customerCode: String(row.customer_code),
    orderKey: String(row.order_key),
    orderNumber: String(row.order_number ?? ""),
    orderDate: row.order_date ? String(row.order_date) : null,
    totalAmount: Number(row.total_amount ?? 0),
  }));
  const payments: BillingPaymentInput[] = paymentsResult.rows.map((row) => ({
    customerCode: String(row.customer_code),
    amount: Number(row.amount ?? 0),
  }));

  return { customers, orders, payments };
}

/**
 * Lancamentos recentes cujo COD nao existe no RESUMO (ex.: OEM382, CL80, OUT).
 * Codigos com "|" ficam de fora: e a convencao da planilha para caixas
 * fechadas / pendencias (CL034 |, KH41 |), que o RESUMO soma pela aba DADOS.
 */
async function loadUnmatchedEntries(snapshotId: string, dateKey: string): Promise<BillingUnmatchedEntry[]> {
  const result = await pool.query(
    `
      WITH known AS (
        SELECT DISTINCT customer_code FROM customer_credit_snapshot_rows WHERE snapshot_id = $1
      )
      SELECT 'PAG' AS source, payment_key AS entry_key, customer_code, payment_date::text AS entry_date,
             amount, CONCAT_WS(' ', NULLIF(payment_type, ''), NULLIF(observation, '')) AS reference
      FROM customer_credit_payment_entries
      WHERE snapshot_id = $1
        AND payment_date >= $2::date - $3::int
        AND customer_code NOT LIKE '%|%'
        AND customer_code NOT IN (SELECT customer_code FROM known)
      UNION ALL
      SELECT 'OUT', order_key, customer_code, order_date::text, total_amount,
             CASE WHEN order_number <> '' THEN 'pedido ' || order_number ELSE '' END
      FROM customer_credit_order_entries
      WHERE snapshot_id = $1
        AND order_date >= $2::date - $3::int
        AND customer_code NOT LIKE '%|%'
        AND customer_code NOT IN (SELECT customer_code FROM known)
    `,
    [snapshotId, dateKey, UNMATCHED_LOOKBACK_DAYS],
  );

  return result.rows
    .filter((row) => Math.abs(Number(row.amount ?? 0)) >= 0.01)
    .map((row) => ({
      source: row.source === "OUT" ? "OUT" : "PAG",
      entryKey: String(row.entry_key),
      customerCode: String(row.customer_code),
      entryDate: row.entry_date ? String(row.entry_date) : null,
      amount: Number(row.amount ?? 0),
      reference: String(row.reference ?? "").trim(),
    }));
}

async function buildReportForSnapshot(snapshotId: string, dateKey: string) {
  const [{ customers, orders, payments }, unmatchedEntries] = await Promise.all([
    loadBillingInputs(snapshotId),
    loadUnmatchedEntries(snapshotId, dateKey),
  ]);
  return buildBillingAlertReport(customers, orders, payments, {
    today: dateKey,
    nearLimitRatio: env.BILLING_ALERT_NEAR_LIMIT_PERCENT / 100,
    unmatchedEntries,
  });
}

export async function getBillingAlertReport(): Promise<BillingAlertReport | null> {
  const snapshotId = await getActiveSnapshotId();
  if (!snapshotId) {
    return null;
  }
  return buildReportForSnapshot(snapshotId, getLocalParts(env.BILLING_ALERT_TIMEZONE).dateKey);
}

function canSend() {
  return env.BILLING_ALERT_ENABLED && Boolean(env.BILLING_ALERT_GROUP_JID.trim());
}

async function sendMessages(messages: string[]) {
  const groupJid = env.BILLING_ALERT_GROUP_JID.trim();
  for (let index = 0; index < messages.length; index += 1) {
    await sendToGroup(groupJid, messages[index]!, env.BILLING_ALERT_INSTANCE_ID);
    if (index < messages.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }
}

async function readState(client: { query: typeof pool.query }): Promise<BillingAlertState | null> {
  const result = await client.query<{ cursor_value: string }>(
    "SELECT cursor_value FROM sync_cursors WHERE key = $1",
    [BILLING_STATE_CURSOR_KEY],
  );
  const raw = result.rows[0]?.cursor_value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BillingAlertState;
  } catch {
    return null;
  }
}

async function writeCursor(client: { query: typeof pool.query }, key: string, value: string) {
  await client.query(
    `
      INSERT INTO sync_cursors (key, cursor_value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET cursor_value = EXCLUDED.cursor_value, updated_at = NOW()
    `,
    [key, value],
  );
}

/**
 * Executa `work` com lock exclusivo (API e worker rodam o mesmo agendador).
 * O `work` decide e grava o estado dentro da transacao; o envio acontece
 * depois do COMMIT para nao segurar o lock enquanto fala com o WhatsApp.
 */
async function withBillingLock<T>(work: (client: { query: typeof pool.query }) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [BILLING_LOCK_NS, 1]);
    const result = await work(client as unknown as { query: typeof pool.query });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function hasDailyReportRun(dateKey: string) {
  const result = await pool.query<{ cursor_value: string }>(
    "SELECT cursor_value FROM sync_cursors WHERE key = $1",
    [BILLING_DAILY_CURSOR_KEY],
  );
  return result.rows[0]?.cursor_value === dateKey;
}

/**
 * Relatorio completo do dia. `force` ignora a trava de "ja rodou hoje"
 * (envio manual pelo CRM); `dryRun` so monta as mensagens.
 */
export async function runDailyBillingReport(
  options: { dryRun?: boolean; force?: boolean } = {},
): Promise<BillingAlertRunResult> {
  const { dateKey } = getLocalParts(env.BILLING_ALERT_TIMEZONE);
  if (!options.dryRun && !options.force && canSend() && (await hasDailyReportRun(dateKey))) {
    return { report: null, messages: [], sent: false, reason: "relatorio de hoje ja foi enviado" };
  }

  const snapshotId = await getActiveSnapshotId();
  if (!snapshotId) {
    return { report: null, messages: [], sent: false, reason: "sem planilha de saldo importada" };
  }

  const report = await buildReportForSnapshot(snapshotId, dateKey);
  const messages = buildDailyReportMessages(report);

  if (options.dryRun || !canSend()) {
    return {
      report,
      messages,
      sent: false,
      reason: options.dryRun ? "pre-visualizacao" : "envio desligado (BILLING_ALERT_ENABLED / BILLING_ALERT_GROUP_JID)",
    };
  }

  const claimed = await withBillingLock(async (client) => {
    if (!options.force) {
      const result = await client.query<{ cursor_value: string }>(
        "SELECT cursor_value FROM sync_cursors WHERE key = $1",
        [BILLING_DAILY_CURSOR_KEY],
      );
      if (result.rows[0]?.cursor_value === dateKey) {
        return false;
      }
    }
    await writeCursor(client, BILLING_DAILY_CURSOR_KEY, dateKey);
    await writeCursor(
      client,
      BILLING_STATE_CURSOR_KEY,
      JSON.stringify({ dateKey, snapshotId, keys: [...collectAlertKeys(report)] } satisfies BillingAlertState),
    );
    return true;
  });

  if (!claimed) {
    return { report, messages, sent: false, reason: "relatorio de hoje ja foi enviado" };
  }

  await sendMessages(messages);
  logger.info("billing daily report sent", {
    dateKey,
    overLimit: report.overLimit.length,
    overCredit: report.overCredit.length,
    overdue: report.overdue.length,
    messages: messages.length,
  });
  return { report, messages, sent: true };
}

/**
 * Chamado periodicamente: se a planilha mudou desde a ultima leitura, avisa
 * so o que surgiu de novo. Alertas que se resolveram saem do estado e voltam
 * a disparar se reaparecerem.
 */
export async function checkNewBillingAlerts(): Promise<BillingAlertRunResult> {
  const { dateKey } = getLocalParts(env.BILLING_ALERT_TIMEZONE);
  const snapshotId = await getActiveSnapshotId();
  if (!snapshotId) {
    return { report: null, messages: [], sent: false, reason: "sem planilha de saldo importada" };
  }

  const decision = await withBillingLock(async (client) => {
    const state = await readState(client);
    // So depois do relatorio da manha: antes dele, o proprio relatorio cobre tudo.
    if (!state || state.dateKey !== dateKey) {
      return null;
    }
    if (state.snapshotId === snapshotId) {
      return null;
    }

    const report = await buildReportForSnapshot(snapshotId, dateKey);
    const currentKeys = collectAlertKeys(report);
    const previousKeys = new Set(state.keys);
    const newKeys = new Set([...currentKeys].filter((key) => !previousKeys.has(key)));

    await writeCursor(
      client,
      BILLING_STATE_CURSOR_KEY,
      JSON.stringify({ dateKey, snapshotId, keys: [...currentKeys] } satisfies BillingAlertState),
    );
    return { report, messages: buildNewAlertsMessages(report, newKeys) };
  });

  if (!decision) {
    return { report: null, messages: [], sent: false, reason: "nada novo" };
  }
  if (!decision.messages.length) {
    return { report: decision.report, messages: [], sent: false, reason: "planilha mudou sem alertas novos" };
  }

  await sendMessages(decision.messages);
  logger.info("billing instant alert sent", { dateKey, snapshotId, messages: decision.messages.length });
  return { report: decision.report, messages: decision.messages, sent: true };
}

export function startBillingAlertScheduler() {
  if (!canSend()) {
    logger.info("billing alert scheduler disabled", {
      enabled: env.BILLING_ALERT_ENABLED,
      hasGroup: Boolean(env.BILLING_ALERT_GROUP_JID.trim()),
    });
    return {
      async close() {
        return;
      },
    };
  }

  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    try {
      const now = getLocalParts(env.BILLING_ALERT_TIMEZONE);
      if (now.hour < env.BILLING_ALERT_HOUR) {
        return;
      }
      const daily = await runDailyBillingReport();
      if (daily.sent) {
        return;
      }
      if (env.BILLING_ALERT_INSTANT_ENABLED && now.hour <= env.BILLING_ALERT_INSTANT_UNTIL_HOUR) {
        await checkNewBillingAlerts();
      }
    } catch (error) {
      logger.error("billing alert check failed", { error: String(error) });
    } finally {
      running = false;
    }
  };

  const interval = setInterval(check, CHECK_INTERVAL_MS);
  void check();

  logger.info("billing alert scheduler initialized", {
    hour: env.BILLING_ALERT_HOUR,
    timezone: env.BILLING_ALERT_TIMEZONE,
    instant: env.BILLING_ALERT_INSTANT_ENABLED,
  });

  return {
    async close() {
      clearInterval(interval);
    },
  };
}
