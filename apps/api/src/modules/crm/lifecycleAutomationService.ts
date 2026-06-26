/**
 * Automacao de carteira — a "regua de relacionamento".
 *
 * Todo dia detecta quais clientes cruzaram um estagio (pela regua de dias sem
 * comprar) e registra o template que o sistema MANDARIA para o cliente. Comeca em
 * modo SIMULACAO (LIFECYCLE_SIMULATION_ONLY=true): apenas registra, nao envia —
 * para a equipe validar antes de ligar o disparo real.
 *
 * Regua (definida pelo Felipe): Atencao 1 = 31-60d, Atencao 2 = 61-89d,
 * Inativo = 90-119d, Inativo +30 = 120d+. Cada cliente passa por cada estagio uma
 * unica vez (UNIQUE(customer_id, stage)) — sem reenvio do mesmo template.
 *
 * Mantem o status global do CRM (Ativo/Atencao/Inativo do dashboard) intacto:
 * a regua fina vale so para esta automacao.
 */
import { pool } from "../../db/client.js";
import { logger } from "../../lib/logger.js";
import { env } from "../../lib/env.js";
import {
  sendWhatsappInstanceTextMessage,
  sendWhatsappInstanceMediaMessage,
  sendWhatsappTextMessage,
} from "../whatsapp/evolutionService.js";
import {
  sendUazapiTextMessage,
  sendUazapiImageMessage,
  sendUazapiVideoMessage,
} from "../whatsapp/uazapiService.js";

const SEND_DELAY_MS = 2000; // respiro entre envios para nao tomar rate-limit

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TemplatePayload {
  messageType: "TEXT" | "IMAGE" | "VIDEO";
  content: string;
  mediaUrl: string | null;
}

/**
 * Envia o template (texto/imagem/video) para o jid do cliente, resolvendo a
 * instancia ativa (LIFECYCLE_AUTOMATION_INSTANCE_ID ou a is_default) e o provedor
 * dela. Mesma estrategia do offboarding, estendida para midia.
 */
async function sendTemplateToCustomer(jid: string, template: TemplatePayload): Promise<void> {
  const explicitId = env.LIFECYCLE_AUTOMATION_INSTANCE_ID.trim();
  const instanceResult = await pool.query(
    explicitId
      ? `SELECT provider, instance_name, evolution_base_url, evolution_api_key, uazapi_base_url, uazapi_token
           FROM whatsapp_instances WHERE id = $1 AND status = 'ACTIVE'`
      : `SELECT provider, instance_name, evolution_base_url, evolution_api_key, uazapi_base_url, uazapi_token
           FROM whatsapp_instances WHERE status = 'ACTIVE'
          ORDER BY is_default DESC, created_at ASC
          LIMIT 1`,
    explicitId ? [explicitId] : [],
  );
  const instance = instanceResult.rows[0];
  const caption = template.content ?? "";

  if (instance?.provider === "UAZAPI" && instance.uazapi_base_url && instance.uazapi_token) {
    const config = { baseUrl: String(instance.uazapi_base_url), token: String(instance.uazapi_token) };
    if (template.messageType === "IMAGE" && template.mediaUrl) {
      await sendUazapiImageMessage(config, jid, template.mediaUrl, caption);
    } else if (template.messageType === "VIDEO" && template.mediaUrl) {
      await sendUazapiVideoMessage(config, jid, template.mediaUrl, caption);
    } else {
      await sendUazapiTextMessage(config, jid, template.content);
    }
    return;
  }

  if (instance?.instance_name && instance.evolution_base_url && instance.evolution_api_key) {
    const evo = {
      instanceName: String(instance.instance_name),
      evolutionBaseUrl: String(instance.evolution_base_url),
      evolutionApiKey: String(instance.evolution_api_key),
    };
    if ((template.messageType === "IMAGE" || template.messageType === "VIDEO") && template.mediaUrl) {
      await sendWhatsappInstanceMediaMessage(
        evo,
        jid,
        template.mediaUrl,
        template.messageType === "IMAGE" ? "image" : "video",
        undefined,
        caption,
      );
    } else {
      await sendWhatsappInstanceTextMessage(evo, jid, template.content);
    }
    return;
  }

  // Sem instancia no banco: fallback para o sender global (Evolution, so texto).
  await sendWhatsappTextMessage(jid, template.content);
}

async function loadTemplatePayload(templateId: string): Promise<TemplatePayload | null> {
  const result = await pool.query(
    `SELECT message_type, content, media_url FROM message_templates WHERE id = $1`,
    [templateId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    messageType: (String(row.message_type ?? "TEXT")) as TemplatePayload["messageType"],
    content: String(row.content ?? ""),
    mediaUrl: row.media_url ? String(row.media_url) : null,
  };
}

export type LifecycleStage = "ATENCAO_1" | "ATENCAO_2" | "INATIVO" | "INATIVO_30";

export const LIFECYCLE_STAGES: LifecycleStage[] = ["ATENCAO_1", "ATENCAO_2", "INATIVO", "INATIVO_30"];

export const STAGE_LABELS: Record<LifecycleStage, string> = {
  ATENCAO_1: "Atenção 1 (31–60 dias)",
  ATENCAO_2: "Atenção 2 (61–89 dias)",
  INATIVO: "Inativo (90–119 dias)",
  INATIVO_30: "Inativo +30 (120+ dias)",
};

const LIFECYCLE_CURSOR_KEY = "lifecycle_automation_date";
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

// Expressao SQL que traduz dias-sem-comprar para o estagio da regua. Centralizada
// para que deteccao e preview usem exatamente a mesma faixa.
const STAGE_CASE_SQL = `
  CASE
    WHEN days_since BETWEEN 31 AND 60 THEN 'ATENCAO_1'
    WHEN days_since BETWEEN 61 AND 89 THEN 'ATENCAO_2'
    WHEN days_since BETWEEN 90 AND 119 THEN 'INATIVO'
    WHEN days_since >= 120 THEN 'INATIVO_30'
    ELSE NULL
  END
`;

export interface LifecycleCandidate {
  customerId: string;
  customerCode: string;
  displayName: string;
  stage: LifecycleStage;
  daysSinceLastPurchase: number;
  templateId: string | null;
  templateTitle: string | null;
  jid: string | null;
}

/**
 * Clientes que ESTAO num estagio-gatilho hoje e ainda nao foram registrados nele.
 * E o conjunto que o job processaria agora. Junta o template configurado de cada
 * estagio para ja mostrar o que sairia.
 */
export async function findLifecycleCandidates(): Promise<LifecycleCandidate[]> {
  const result = await pool.query(
    `
      WITH params AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE $1)::date AS today
      ),
      last_orders AS (
        SELECT customer_id, MAX(order_date::date) AS last_order
        FROM orders
        GROUP BY customer_id
      ),
      staged AS (
        SELECT
          c.id AS customer_id,
          c.customer_code,
          c.display_name,
          (p.today - lo.last_order) AS days_since,
          ${STAGE_CASE_SQL.replace(/days_since/g, "(p.today - lo.last_order)")} AS stage
        FROM customers c
        JOIN last_orders lo ON lo.customer_id = c.id
        CROSS JOIN params p
        WHERE lo.last_order IS NOT NULL
      )
      SELECT
        s.customer_id,
        s.customer_code,
        s.display_name,
        s.days_since AS days_since_last_purchase,
        s.stage,
        cfg.template_id,
        t.title AS template_title,
        (
          SELECT d.whatsapp_jid FROM deals d
          WHERE d.customer_id = s.customer_id AND COALESCE(d.whatsapp_jid, '') <> ''
          LIMIT 1
        ) AS jid
      FROM staged s
      LEFT JOIN lifecycle_stage_config cfg ON cfg.stage = s.stage AND cfg.enabled = TRUE
      LEFT JOIN message_templates t ON t.id = cfg.template_id
      WHERE s.stage IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM customer_lifecycle_events e
          WHERE e.customer_id = s.customer_id AND e.stage = s.stage
        )
      ORDER BY s.days_since DESC, s.display_name
    `,
    [env.LIFECYCLE_AUTOMATION_TIMEZONE],
  );

  return result.rows.map((row) => ({
    customerId: String(row.customer_id),
    customerCode: String(row.customer_code ?? ""),
    displayName: String(row.display_name ?? "Cliente"),
    stage: String(row.stage) as LifecycleStage,
    daysSinceLastPurchase: Number(row.days_since_last_purchase ?? 0),
    templateId: row.template_id ? String(row.template_id) : null,
    templateTitle: row.template_title ? String(row.template_title) : null,
    jid: row.jid ? String(row.jid) : null,
  }));
}

/**
 * Processa os candidatos: registra um evento por cliente/estagio (dedupe pela
 * UNIQUE). Em simulacao (padrao) marca SIMULATED; o envio real fica para a fase 2.
 * Sem template configurado para o estagio -> SKIPPED (com motivo).
 */
export async function runLifecycleAutomation(): Promise<{
  processed: number;
  simulated: number;
  sent: number;
  skipped: number;
  simulationOnly: boolean;
}> {
  const candidates = await findLifecycleCandidates();
  const simulationOnly = env.LIFECYCLE_SIMULATION_ONLY;

  let simulated = 0;
  let sent = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    let action: "SIMULATED" | "SENT" | "SKIPPED";
    let detail: string | null = null;

    if (!candidate.templateId) {
      action = "SKIPPED";
      detail = "Nenhum template configurado/ativo para este estagio.";
    } else if (simulationOnly) {
      action = "SIMULATED";
      detail = "Modo simulacao: mensagem nao enviada.";
    } else if (!candidate.jid) {
      action = "SKIPPED";
      detail = "Cliente sem numero de WhatsApp vinculado (deals.whatsapp_jid).";
    } else {
      // Envio real ao cliente.
      const template = await loadTemplatePayload(candidate.templateId);
      if (!template) {
        action = "SKIPPED";
        detail = "Template nao encontrado.";
      } else {
        try {
          await sendTemplateToCustomer(candidate.jid, template);
          action = "SENT";
          detail = `Enviado (${template.messageType}).`;
        } catch (error) {
          action = "SKIPPED";
          detail = `Falha no envio: ${String(error)}`;
        }
      }
    }

    const inserted = await pool.query(
      `
        INSERT INTO customer_lifecycle_events
          (customer_id, stage, template_id, action, detail, days_since_last_purchase)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (customer_id, stage) DO NOTHING
        RETURNING id
      `,
      [
        candidate.customerId,
        candidate.stage,
        candidate.templateId,
        action,
        detail,
        candidate.daysSinceLastPurchase,
      ],
    );

    if (inserted.rowCount === 0) {
      continue; // ja existia (corrida): nao conta
    }

    if (action === "SKIPPED") skipped += 1;
    else if (action === "SENT") sent += 1;
    else simulated += 1;

    // Esgotou a regua (chegou no ultimo estagio): marca como descartado.
    if (candidate.stage === "INATIVO_30") {
      await pool.query(
        `UPDATE customers SET lifecycle_discarded_at = NOW()
          WHERE id = $1 AND lifecycle_discarded_at IS NULL`,
        [candidate.customerId],
      );
    }

    // Respiro entre envios reais para nao tomar rate-limit do WhatsApp.
    if (action === "SENT") {
      await sleep(SEND_DELAY_MS);
    }
  }

  const processed = simulated + sent + skipped;
  logger.info("lifecycle automation run", { processed, simulated, sent, skipped, simulationOnly });
  return { processed, simulated, sent, skipped, simulationOnly };
}

// ── Config (estagio -> template) ──

export interface LifecycleStageConfig {
  stage: LifecycleStage;
  label: string;
  templateId: string | null;
  templateTitle: string | null;
  enabled: boolean;
}

export async function getLifecycleConfig(): Promise<LifecycleStageConfig[]> {
  const result = await pool.query(
    `
      SELECT cfg.stage, cfg.template_id, cfg.enabled, t.title AS template_title
      FROM lifecycle_stage_config cfg
      LEFT JOIN message_templates t ON t.id = cfg.template_id
    `,
  );
  const byStage = new Map(result.rows.map((row) => [String(row.stage), row]));

  return LIFECYCLE_STAGES.map((stage) => {
    const row = byStage.get(stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      templateId: row?.template_id ? String(row.template_id) : null,
      templateTitle: row?.template_title ? String(row.template_title) : null,
      enabled: row ? Boolean(row.enabled) : true,
    };
  });
}

export async function setLifecycleConfig(
  stage: LifecycleStage,
  templateId: string | null,
  enabled: boolean,
): Promise<void> {
  await pool.query(
    `
      INSERT INTO lifecycle_stage_config (stage, template_id, enabled, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (stage) DO UPDATE
      SET template_id = EXCLUDED.template_id, enabled = EXCLUDED.enabled, updated_at = NOW()
    `,
    [stage, templateId, enabled],
  );
}

// ── Acompanhamento ──

export interface LifecycleOverview {
  stageCounts: Record<LifecycleStage, number>;
  discardedCount: number;
  pendingCandidates: number;
  recentEvents: {
    customerId: string;
    displayName: string;
    stage: LifecycleStage;
    action: string;
    templateTitle: string | null;
    daysSinceLastPurchase: number | null;
    createdAt: string;
  }[];
}

export async function getLifecycleOverview(): Promise<LifecycleOverview> {
  const [counts, discarded, recent, candidates] = await Promise.all([
    pool.query(
      `SELECT stage, COUNT(*)::int AS n FROM customer_lifecycle_events GROUP BY stage`,
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM customers WHERE lifecycle_discarded_at IS NOT NULL`),
    pool.query(
      `
        SELECT e.customer_id, c.display_name, e.stage, e.action, e.days_since_last_purchase,
               e.created_at, t.title AS template_title
        FROM customer_lifecycle_events e
        JOIN customers c ON c.id = e.customer_id
        LEFT JOIN message_templates t ON t.id = e.template_id
        ORDER BY e.created_at DESC
        LIMIT 100
      `,
    ),
    findLifecycleCandidates(),
  ]);

  const stageCounts = { ATENCAO_1: 0, ATENCAO_2: 0, INATIVO: 0, INATIVO_30: 0 } as Record<LifecycleStage, number>;
  for (const row of counts.rows) {
    stageCounts[String(row.stage) as LifecycleStage] = Number(row.n);
  }

  return {
    stageCounts,
    discardedCount: Number(discarded.rows[0]?.n ?? 0),
    pendingCandidates: candidates.length,
    recentEvents: recent.rows.map((row) => ({
      customerId: String(row.customer_id),
      displayName: String(row.display_name ?? "Cliente"),
      stage: String(row.stage) as LifecycleStage,
      action: String(row.action),
      templateTitle: row.template_title ? String(row.template_title) : null,
      daysSinceLastPurchase: row.days_since_last_purchase === null ? null : Number(row.days_since_last_purchase),
      createdAt: String(row.created_at),
    })),
  };
}

// ── Agendador diario ──

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
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour ?? "0") };
}

async function getCursor(key: string) {
  const result = await pool.query("SELECT cursor_value FROM sync_cursors WHERE key = $1", [key]);
  return (result.rows[0]?.cursor_value as string | undefined) ?? null;
}

async function setCursor(key: string, value: string) {
  await pool.query(
    `
      INSERT INTO sync_cursors (key, cursor_value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET cursor_value = EXCLUDED.cursor_value, updated_at = NOW()
    `,
    [key, value],
  );
}

export function startDailyLifecycleScheduler() {
  if (!env.LIFECYCLE_AUTOMATION_ENABLED) {
    logger.info("lifecycle automation scheduler disabled");
    return {
      async close() {
        return;
      },
    };
  }

  const timeZone = env.LIFECYCLE_AUTOMATION_TIMEZONE;

  const check = async () => {
    try {
      const now = getLocalParts(timeZone);
      if (now.hour !== env.LIFECYCLE_AUTOMATION_HOUR) {
        return;
      }
      const lastRun = await getCursor(LIFECYCLE_CURSOR_KEY);
      if (lastRun === now.dateKey) {
        return;
      }

      logger.info("lifecycle automation started", { dateKey: now.dateKey });
      const result = await runLifecycleAutomation();
      await setCursor(LIFECYCLE_CURSOR_KEY, now.dateKey);
      logger.info("lifecycle automation completed", { dateKey: now.dateKey, ...result });
    } catch (error) {
      logger.error("lifecycle automation failed", { error: String(error) });
    }
  };

  const interval = setInterval(check, CHECK_INTERVAL_MS);
  void check();

  logger.info("lifecycle automation scheduler initialized", {
    hour: env.LIFECYCLE_AUTOMATION_HOUR,
    timezone: timeZone,
    simulationOnly: env.LIFECYCLE_SIMULATION_ONLY,
  });

  return {
    async close() {
      clearInterval(interval);
    },
  };
}
