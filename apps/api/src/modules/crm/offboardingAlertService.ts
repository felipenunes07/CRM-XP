/**
 * Alerta diario de "Saida da Base".
 *
 * Todo dia de manha detecta quais clientes VIRARAM INATIVOS desde ontem — ou
 * seja, cruzaram 90 dias sem comprar (de ATENCAO/ATIVO para INATIVO) — e avisa
 * num grupo de WhatsApp: uma mensagem de cabecalho seguida de uma mensagem por
 * cliente, com a media de pecas/mes que ele comprava enquanto estava ativo.
 *
 * Reaproveita exatamente a mesma logica de transicao de status da pagina
 * "Movimentacao da Base" (getCustomerMovements): o status e calculado ao vivo a
 * partir de orders em dois instantes (ontem x hoje), entao nao precisa de tabela
 * de historico e cada cliente aparece uma unica vez, no dia em que cruzou.
 */
import { createHash } from "node:crypto";
import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { env } from "../../lib/env.js";
import { sendWhatsappInstanceTextMessage, sendWhatsappTextMessage } from "../whatsapp/evolutionService.js";
import { sendUazapiTextMessage } from "../whatsapp/uazapiService.js";

const OFFBOARDING_CURSOR_KEY = "offboarding_alert_date";
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // checa a cada 30 min
const SEND_DELAY_MS = 1500; // respiro entre mensagens para nao tomar rate-limit
const MANUAL_SEND_DEDUP_WINDOW_SECONDS = 15 * 60;
const OFFBOARDING_DAILY_LOCK_NS = 724011;
const OFFBOARDING_MANUAL_LOCK_NS = 724012;

export interface NewlyInactiveCustomer {
  customerId: string;
  customerCode: string;
  displayName: string;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number;
  avgPiecesPerMonth: number;
  totalOrders: number;
}

type OffboardingSkipReason = "recent_duplicate";

/**
 * Nivel de urgencia pela media de telas/mes que o cliente comprava: quanto mais
 * volume ele movia, mais critico e perde-lo. Faixas definidas pelo Felipe.
 */
export function urgencyLevel(avgPiecesPerMonth: number): string {
  if (avgPiecesPerMonth > 300) return "🔴 URGÊNCIA CRÍTICA";
  if (avgPiecesPerMonth > 100) return "🟠 URGÊNCIA ALTA";
  if (avgPiecesPerMonth > 50) return "🟡 URGÊNCIA MÉDIA";
  return "⚪ URGÊNCIA BAIXA";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lockKey(value: string): number {
  return parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16) & 0x7fffffff;
}

function manualSendCursorKey(groupJid: string, customerId: string): string {
  return `offboarding_manual_send:${groupJid}:${customerId}`;
}

/**
 * Registra que estes clientes ja foram alertados no grupo. O alerta diario
 * consulta este log e nunca repete o mesmo cliente dentro de 30 dias.
 */
async function logAlertedCustomers(customerIds: string[]): Promise<void> {
  if (customerIds.length === 0) return;
  await pool.query(
    `INSERT INTO offboarding_alert_log (customer_id) SELECT unnest($1::uuid[])`,
    [customerIds],
  );
}

async function claimManualOffboardingCustomerSends(
  groupJid: string,
  customerIds: string[],
): Promise<{ claimedIds: string[]; skippedIds: string[] }> {
  const uniqueIds = Array.from(new Set(customerIds)).sort();
  if (uniqueIds.length === 0) {
    return { claimedIds: [], skippedIds: [] };
  }

  const keysById = new Map(uniqueIds.map((id) => [id, manualSendCursorKey(groupJid, id)]));
  const keys = uniqueIds.map((id) => keysById.get(id)!);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [
      OFFBOARDING_MANUAL_LOCK_NS,
      lockKey(groupJid),
    ]);

    const recentResult = await client.query<{ key: string }>(
      `
        SELECT key
        FROM sync_cursors
        WHERE key = ANY($1::text[])
          AND updated_at > NOW() - ($2::int * INTERVAL '1 second')
      `,
      [keys, MANUAL_SEND_DEDUP_WINDOW_SECONDS],
    );

    const recentKeys = new Set(recentResult.rows.map((row) => row.key));
    const claimedIds = uniqueIds.filter((id) => !recentKeys.has(keysById.get(id)!));
    const skippedIds = uniqueIds.filter((id) => recentKeys.has(keysById.get(id)!));
    const claimedKeys = claimedIds.map((id) => keysById.get(id)!);

    if (claimedKeys.length > 0) {
      await client.query(
        `
          INSERT INTO sync_cursors (key, cursor_value, updated_at)
          SELECT unnest($1::text[]), $2::text, NOW()
          ON CONFLICT (key) DO UPDATE
          SET cursor_value = EXCLUDED.cursor_value, updated_at = NOW()
        `,
        [claimedKeys, "manual_offboarding_send"],
      );
    }

    await client.query("COMMIT");
    return { claimedIds, skippedIds };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Resolve a instancia de WhatsApp que envia o alerta e manda o texto pelo
 * provedor dela (UAZAPI ou Evolution) — mesmo padrao do auto-reply. Prioridade:
 * OFFBOARDING_ALERT_INSTANCE_ID (se setado) → instancia UAZAPI ativa (a conta
 * conectada que ja esta no grupo) → is_default → mais antiga → fallback para o
 * sender global da Evolution (.env).
 */
async function sendToGroup(destinationJid: string, messageText: string) {
  const explicitId = env.OFFBOARDING_ALERT_INSTANCE_ID.trim();
  const instanceResult = await pool.query(
    explicitId
      ? `SELECT provider, instance_name, evolution_base_url, evolution_api_key, uazapi_base_url, uazapi_token, display_label
           FROM whatsapp_instances WHERE id = $1 AND status = 'ACTIVE'`
      : `SELECT provider, instance_name, evolution_base_url, evolution_api_key, uazapi_base_url, uazapi_token, display_label
           FROM whatsapp_instances WHERE status = 'ACTIVE'
          ORDER BY (provider = 'UAZAPI') DESC, is_default DESC, created_at ASC
          LIMIT 1`,
    explicitId ? [explicitId] : [],
  );

  const instance = instanceResult.rows[0];

  if (instance?.provider === "UAZAPI" && instance.uazapi_base_url && instance.uazapi_token) {
    return sendUazapiTextMessage(
      { baseUrl: String(instance.uazapi_base_url), token: String(instance.uazapi_token) },
      destinationJid,
      messageText,
    );
  }

  if (instance?.instance_name && instance.evolution_base_url && instance.evolution_api_key) {
    return sendWhatsappInstanceTextMessage(
      {
        instanceName: String(instance.instance_name),
        evolutionBaseUrl: String(instance.evolution_base_url),
        evolutionApiKey: String(instance.evolution_api_key),
      },
      destinationJid,
      messageText,
    );
  }

  // Sem instancia no banco: cai no sender global do .env (Evolution).
  return sendWhatsappTextMessage(destinationJid, messageText);
}

function formatBrDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return "—";
  return `${day}/${month}/${year}`;
}

/**
 * Clientes que cruzaram de ATIVO/ATENCAO para INATIVO entre ontem (t1) e hoje
 * (t2), com a media de pecas/mes (total de pecas / meses entre 1a e ultima
 * compra). Mesma regra de status da Movimentacao da Base.
 */
export async function findNewlyInactiveCustomers(): Promise<NewlyInactiveCustomer[]> {
  const result = await pool.query(
    `
      WITH params AS (
        SELECT
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 1 AS t1,
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date AS t2
      ),
      last_orders AS (
        SELECT
          o.customer_id,
          MAX(CASE WHEN o.order_date::date <= p.t1 THEN o.order_date::date END) AS last_order_t1,
          MAX(o.order_date::date) AS last_order_t2
        FROM orders o
        CROSS JOIN params p
        WHERE o.order_date::date <= p.t2
        GROUP BY o.customer_id
      ),
      statuses AS (
        SELECT
          c.id AS customer_id,
          c.customer_code,
          c.display_name,
          lo.last_order_t2 AS last_purchase_at,
          CASE
            WHEN lo.last_order_t1 IS NULL THEN 'NEW'
            WHEN p.t1 - lo.last_order_t1 <= 30 THEN 'ACTIVE'
            WHEN p.t1 - lo.last_order_t1 BETWEEN 31 AND 89 THEN 'ATTENTION'
            ELSE 'INACTIVE'
          END::text AS status_t1,
          CASE
            WHEN lo.last_order_t2 IS NULL THEN 'INACTIVE'
            WHEN p.t2 - lo.last_order_t2 <= 30 THEN 'ACTIVE'
            WHEN p.t2 - lo.last_order_t2 BETWEEN 31 AND 89 THEN 'ATTENTION'
            ELSE 'INACTIVE'
          END::text AS status_t2,
          COALESCE(p.t2 - lo.last_order_t2, 999) AS days_since_last_purchase
        FROM customers c
        LEFT JOIN last_orders lo ON c.id = lo.customer_id
        CROSS JOIN params p
      ),
      newly_inactive AS (
        SELECT *
        FROM statuses
        -- Cruzou de verdade: tinha compra, estava em ATENCAO ontem (89d) e virou
        -- INATIVO hoje (90d). Sem o filtro de compra, clientes SEM NENHUM pedido
        -- caiam aqui todo dia como NEW->INACTIVE (bug do flood de "999 dias").
        WHERE status_t2 = 'INACTIVE'
          AND status_t1 = 'ATTENTION'
          AND last_purchase_at IS NOT NULL
          -- Trava anti-repeticao: nunca alertar o mesmo cliente 2x em 30 dias.
          AND NOT EXISTS (
            SELECT 1 FROM offboarding_alert_log l
            WHERE l.customer_id = statuses.customer_id
              AND l.sent_at > NOW() - INTERVAL '30 days'
          )
      ),
      pieces AS (
        SELECT
          o.customer_id,
          COALESCE(SUM(oi.quantity), 0)::numeric AS total_pieces,
          COUNT(DISTINCT o.id) AS total_orders,
          MIN(o.order_date::date) AS first_order,
          MAX(o.order_date::date) AS last_order
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.customer_id IN (SELECT customer_id FROM newly_inactive)
        GROUP BY o.customer_id
      )
      SELECT
        ni.customer_id,
        ni.customer_code,
        ni.display_name,
        ni.last_purchase_at::text AS last_purchase_at,
        ni.days_since_last_purchase,
        COALESCE(pc.total_pieces, 0) AS total_pieces,
        COALESCE(pc.total_orders, 0) AS total_orders,
        GREATEST(1, ROUND(COALESCE((pc.last_order - pc.first_order), 0) / 30.0)) AS months_active
      FROM newly_inactive ni
      LEFT JOIN pieces pc ON pc.customer_id = ni.customer_id
      ORDER BY ni.display_name
    `,
  );

  return result.rows.map(mapEnrichedRow);
}

function mapEnrichedRow(row: Record<string, unknown>): NewlyInactiveCustomer {
  const totalPieces = Number(row.total_pieces ?? 0);
  const monthsActive = Math.max(1, Number(row.months_active ?? 1));
  return {
    customerId: String(row.customer_id),
    customerCode: String(row.customer_code ?? ""),
    displayName: String(row.display_name ?? "Cliente"),
    lastPurchaseAt: row.last_purchase_at ? String(row.last_purchase_at) : null,
    daysSinceLastPurchase: Number(row.days_since_last_purchase ?? 0),
    avgPiecesPerMonth: Math.round(totalPieces / monthsActive),
    totalOrders: Number(row.total_orders ?? 0),
  };
}

/**
 * Clientes que JA estao inativos hoje (90+ dias sem comprar). Se withinDays for
 * informado, limita a quem virou inativo nessa janela (ex.: 30 = entrou nos
 * ultimos 30 dias); null = todo o backlog. Enriquecido com telas/mes e historico.
 */
export async function findInactiveBacklog(withinDays: number | null): Promise<NewlyInactiveCustomer[]> {
  const result = await pool.query(
    `
      WITH params AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date AS today
      ),
      last_orders AS (
        SELECT customer_id, MAX(order_date::date) AS last_order
        FROM orders
        GROUP BY customer_id
      ),
      target AS (
        SELECT
          c.id, c.customer_code, c.display_name,
          lo.last_order,
          (p.today - lo.last_order) AS days_since
        FROM customers c
        JOIN last_orders lo ON lo.customer_id = c.id
        CROSS JOIN params p
        WHERE lo.last_order IS NOT NULL
          AND (p.today - lo.last_order) >= 90
          AND ($1::int IS NULL OR (p.today - lo.last_order) - 90 <= $1::int)
      ),
      pieces AS (
        SELECT
          o.customer_id,
          COALESCE(SUM(oi.quantity), 0)::numeric AS total_pieces,
          COUNT(DISTINCT o.id) AS total_orders,
          MIN(o.order_date::date) AS first_order,
          MAX(o.order_date::date) AS last_order
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.customer_id IN (SELECT id FROM target)
        GROUP BY o.customer_id
      )
      SELECT
        t.id AS customer_id,
        t.customer_code,
        t.display_name,
        t.last_order::text AS last_purchase_at,
        t.days_since AS days_since_last_purchase,
        COALESCE(pc.total_pieces, 0) AS total_pieces,
        COALESCE(pc.total_orders, 0) AS total_orders,
        GREATEST(1, ROUND(COALESCE((pc.last_order - pc.first_order), 0) / 30.0)) AS months_active
      FROM target t
      LEFT JOIN pieces pc ON pc.customer_id = t.id
      ORDER BY t.days_since ASC, t.display_name
    `,
    [withinDays],
  );

  return result.rows.map(mapEnrichedRow);
}

/**
 * Clientes que VAO virar inativos em `offsetDays` dias — ou seja, o que o
 * automatico vai disparar no proximo(s) ciclo(s). Para offsetDays=1 mostra
 * exatamente o lote programado para amanha (quem hoje esta com 89 dias).
 */
export async function findUpcomingInactive(offsetDays: number): Promise<NewlyInactiveCustomer[]> {
  const result = await pool.query(
    `
      WITH params AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date AS today
      ),
      last_orders AS (
        SELECT customer_id, MAX(order_date::date) AS last_order
        FROM orders
        GROUP BY customer_id
      ),
      target AS (
        SELECT
          c.id, c.customer_code, c.display_name,
          lo.last_order,
          (p.today - lo.last_order) AS days_since
        FROM customers c
        JOIN last_orders lo ON lo.customer_id = c.id
        CROSS JOIN params p
        WHERE lo.last_order IS NOT NULL
          AND (p.today - lo.last_order) BETWEEN (90 - $1::int) AND 89
      ),
      pieces AS (
        SELECT
          o.customer_id,
          COALESCE(SUM(oi.quantity), 0)::numeric AS total_pieces,
          COUNT(DISTINCT o.id) AS total_orders,
          MIN(o.order_date::date) AS first_order,
          MAX(o.order_date::date) AS last_order
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.customer_id IN (SELECT id FROM target)
        GROUP BY o.customer_id
      )
      SELECT
        t.id AS customer_id,
        t.customer_code,
        t.display_name,
        t.last_order::text AS last_purchase_at,
        t.days_since AS days_since_last_purchase,
        COALESCE(pc.total_pieces, 0) AS total_pieces,
        COALESCE(pc.total_orders, 0) AS total_orders,
        GREATEST(1, ROUND(COALESCE((pc.last_order - pc.first_order), 0) / 30.0)) AS months_active
      FROM target t
      LEFT JOIN pieces pc ON pc.customer_id = t.id
      ORDER BY t.days_since DESC, t.display_name
    `,
    [Math.max(1, offsetDays)],
  );

  return result.rows.map(mapEnrichedRow);
}

/**
 * Clientes que cruzam os 90 dias EXATAMENTE em `offsetDays` (navegacao por dia):
 * offset 0 = hoje, +1 = amanha, -1 = ontem. Internamente: quem hoje tem
 * (90 - offset) dias parado. Permite andar pra frente/tras na linha do tempo.
 */
export async function findInactiveByDayOffset(offsetDays: number): Promise<NewlyInactiveCustomer[]> {
  const targetDaysSince = 90 - offsetDays;
  if (targetDaysSince < 0) return [];

  const result = await pool.query(
    `
      WITH params AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date AS today
      ),
      last_orders AS (
        SELECT customer_id, MAX(order_date::date) AS last_order
        FROM orders
        GROUP BY customer_id
      ),
      target AS (
        SELECT
          c.id, c.customer_code, c.display_name,
          lo.last_order,
          (p.today - lo.last_order) AS days_since
        FROM customers c
        JOIN last_orders lo ON lo.customer_id = c.id
        CROSS JOIN params p
        WHERE lo.last_order IS NOT NULL
          AND (p.today - lo.last_order) = $1::int
      ),
      pieces AS (
        SELECT
          o.customer_id,
          COALESCE(SUM(oi.quantity), 0)::numeric AS total_pieces,
          COUNT(DISTINCT o.id) AS total_orders,
          MIN(o.order_date::date) AS first_order,
          MAX(o.order_date::date) AS last_order
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.customer_id IN (SELECT id FROM target)
        GROUP BY o.customer_id
      )
      SELECT
        t.id AS customer_id,
        t.customer_code,
        t.display_name,
        t.last_order::text AS last_purchase_at,
        t.days_since AS days_since_last_purchase,
        COALESCE(pc.total_pieces, 0) AS total_pieces,
        COALESCE(pc.total_orders, 0) AS total_orders,
        GREATEST(1, ROUND(COALESCE((pc.last_order - pc.first_order), 0) / 30.0)) AS months_active
      FROM target t
      LEFT JOIN pieces pc ON pc.customer_id = t.id
      ORDER BY t.display_name
    `,
    [targetDaysSince],
  );

  return result.rows.map(mapEnrichedRow);
}

/** Enriquece um conjunto especifico de clientes (por id), para envio manual. */
async function enrichCustomersByIds(customerIds: string[]): Promise<NewlyInactiveCustomer[]> {
  if (customerIds.length === 0) return [];
  const result = await pool.query(
    `
      WITH params AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date AS today
      ),
      pieces AS (
        SELECT
          o.customer_id,
          COALESCE(SUM(oi.quantity), 0)::numeric AS total_pieces,
          COUNT(DISTINCT o.id) AS total_orders,
          MIN(o.order_date::date) AS first_order,
          MAX(o.order_date::date) AS last_order
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.customer_id = ANY($1::uuid[])
        GROUP BY o.customer_id
      )
      SELECT
        c.id AS customer_id,
        c.customer_code,
        c.display_name,
        pc.last_order::text AS last_purchase_at,
        COALESCE(p.today - pc.last_order, 999) AS days_since_last_purchase,
        COALESCE(pc.total_pieces, 0) AS total_pieces,
        COALESCE(pc.total_orders, 0) AS total_orders,
        GREATEST(1, ROUND(COALESCE((pc.last_order - pc.first_order), 0) / 30.0)) AS months_active
      FROM customers c
      LEFT JOIN pieces pc ON pc.customer_id = c.id
      CROSS JOIN params p
      WHERE c.id = ANY($1::uuid[])
      ORDER BY c.display_name
    `,
    [customerIds],
  );

  return result.rows.map(mapEnrichedRow);
}

/**
 * Envio MANUAL pela interface: dispara o cabecalho + uma mensagem por cliente
 * selecionado para o grupo. Diferente do automatico, nao depende da flag
 * OFFBOARDING_ALERT_ENABLED (o usuario clicou de proposito) — so exige o grupo
 * configurado e a Evolution ativa.
 */
export async function sendOffboardingForCustomers(customerIds: string[]): Promise<{
  customers: NewlyInactiveCustomer[];
  messages: string[];
  sent: boolean;
  skippedCustomerIds?: string[];
  skippedReason?: OffboardingSkipReason;
}> {
  const groupJid = env.OFFBOARDING_ALERT_GROUP_JID.trim();
  if (!groupJid) {
    throw new Error("Grupo de destino nao configurado (OFFBOARDING_ALERT_GROUP_JID).");
  }

  const enrichedCustomers = await enrichCustomersByIds(Array.from(new Set(customerIds)));
  if (enrichedCustomers.length === 0) {
    return { customers: [], messages: [], sent: false };
  }

  const claim = await claimManualOffboardingCustomerSends(
    groupJid,
    enrichedCustomers.map((customer) => customer.customerId),
  );
  const claimedIds = new Set(claim.claimedIds);
  const customers = enrichedCustomers.filter((customer) => claimedIds.has(customer.customerId));

  if (customers.length === 0) {
    logger.warn("offboarding manual duplicado bloqueado", {
      skippedCustomers: claim.skippedIds.length,
      groupJid,
    });
    return {
      customers: [],
      messages: [],
      sent: false,
      skippedCustomerIds: claim.skippedIds,
      skippedReason: "recent_duplicate",
    };
  }

  const messages = [
    buildHeaderMessage(),
    ...customers.map((customer) => buildCustomerMessage(customer)),
  ];

  for (let i = 0; i < messages.length; i += 1) {
    await sendToGroup(groupJid, messages[i]!);
    if (i < messages.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  await logAlertedCustomers(customers.map((customer) => customer.customerId));

  logger.info("offboarding manual enviado", {
    customers: customers.length,
    skippedCustomers: claim.skippedIds.length,
    groupJid,
  });
  return { customers, messages, sent: true, skippedCustomerIds: claim.skippedIds };
}

/** Mensagem de cabecalho, enviada uma vez quando ha ao menos um cliente. */
export function buildHeaderMessage(today = new Date()): string {
  const dateLabel = today.toLocaleDateString("pt-BR", { timeZone: env.OFFBOARDING_ALERT_TIMEZONE });
  return `🧠 DETECÇÃO AUTOMÁTICA DE INATIVIDADE • ${dateLabel}`;
}

/** Mensagem individual de um cliente, com nivel de urgencia e historico. */
export function buildCustomerMessage(customer: NewlyInactiveCustomer): string {
  const codeLabel = customer.customerCode ? ` — cód. ${customer.customerCode}` : "";
  const ordersLabel = customer.totalOrders === 1 ? "1 compra" : `${customer.totalOrders} compras`;
  return (
    `${urgencyLevel(customer.avgPiecesPerMonth)}\n\n` +
    `👤 *${customer.displayName}*${codeLabel}\n` +
    `🛒 Última compra: ${formatBrDate(customer.lastPurchaseAt)}\n` +
    `⏳ *${customer.daysSinceLastPurchase} dias sem comprar*\n` +
    `📦 Média anterior: ~${customer.avgPiecesPerMonth} telas/mês\n` +
    `🤝 Histórico: ${ordersLabel}`
  );
}

/**
 * Roda a deteccao e (se habilitado) envia para o grupo. Com dryRun=true apenas
 * retorna as mensagens que SERIAM enviadas, sem tocar no WhatsApp — util para
 * testar o texto antes de ligar o disparo real.
 */
export async function runOffboardingAlert(options: { dryRun?: boolean } = {}): Promise<{
  customers: NewlyInactiveCustomer[];
  messages: string[];
  sent: boolean;
}> {
  const customers = await findNewlyInactiveCustomers();

  if (customers.length === 0) {
    logger.info("offboarding alert: nenhum cliente virou inativo hoje");
    return { customers, messages: [], sent: false };
  }

  const messages = [
    buildHeaderMessage(),
    ...customers.map((customer) => buildCustomerMessage(customer)),
  ];

  const groupJid = env.OFFBOARDING_ALERT_GROUP_JID.trim();
  const shouldSend = !options.dryRun && env.OFFBOARDING_ALERT_ENABLED && Boolean(groupJid);

  if (!shouldSend) {
    logger.info("offboarding alert: modo somente-leitura (sem envio)", {
      customers: customers.length,
      enabled: env.OFFBOARDING_ALERT_ENABLED,
      hasGroup: Boolean(groupJid),
      dryRun: Boolean(options.dryRun),
    });
    return { customers, messages, sent: false };
  }

  for (let i = 0; i < messages.length; i += 1) {
    await sendToGroup(groupJid, messages[i]!);
    if (i < messages.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  await logAlertedCustomers(customers.map((customer) => customer.customerId));

  logger.info("offboarding alert enviado", { customers: customers.length, groupJid });
  return { customers, messages, sent: true };
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

async function claimDailyOffboardingRun(dateKey: string): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [OFFBOARDING_DAILY_LOCK_NS, 1]);

    const result = await client.query<{ cursor_value: string }>(
      "SELECT cursor_value FROM sync_cursors WHERE key = $1 FOR UPDATE",
      [OFFBOARDING_CURSOR_KEY],
    );

    if (result.rows[0]?.cursor_value === dateKey) {
      await client.query("COMMIT");
      return false;
    }

    await client.query(
      `
        INSERT INTO sync_cursors (key, cursor_value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE
        SET cursor_value = EXCLUDED.cursor_value, updated_at = NOW()
      `,
      [OFFBOARDING_CURSOR_KEY, dateKey],
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function startDailyOffboardingScheduler() {
  if (!env.OFFBOARDING_ALERT_ENABLED) {
    logger.info("offboarding alert scheduler disabled");
    return {
      async close() {
        return;
      },
    };
  }

  const timeZone = env.OFFBOARDING_ALERT_TIMEZONE;

  const check = async () => {
    try {
      const now = getLocalParts(timeZone);
      if (now.hour !== env.OFFBOARDING_ALERT_HOUR) {
        return;
      }
      const claimed = await claimDailyOffboardingRun(now.dateKey);
      if (!claimed) {
        return; // ja rodou hoje ou outro worker acabou de assumir o envio
      }

      logger.info("offboarding alert started", { dateKey: now.dateKey });
      const result = await runOffboardingAlert();
      logger.info("offboarding alert completed", {
        dateKey: now.dateKey,
        customers: result.customers.length,
        sent: result.sent,
      });
    } catch (error) {
      logger.error("offboarding alert failed", { error: String(error) });
    }
  };

  const interval = setInterval(check, CHECK_INTERVAL_MS);
  void check();

  logger.info("offboarding alert scheduler initialized", {
    hour: env.OFFBOARDING_ALERT_HOUR,
    timezone: timeZone,
    hasGroup: Boolean(env.OFFBOARDING_ALERT_GROUP_JID.trim()),
  });

  return {
    async close() {
      clearInterval(interval);
    },
  };
}
