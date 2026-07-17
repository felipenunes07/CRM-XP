import type { ConversationInsight, EventsOverviewResponse } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import { sendWhatsappInstanceTextMessage } from "../whatsapp/evolutionService.js";
import { sendUazapiTextMessage } from "../whatsapp/uazapiService.js";
import type { JwtUser } from "../platform/authService.js";
import { getEventsOverview, listConversationInsights } from "./conversationAi.js";

const RADAR_WHATSAPP_DESTINATION = "5511997431733@s.whatsapp.net";
const RADAR_WHATSAPP_PHONE = "11997431733";
const RADAR_WHATSAPP_INSTANCE_LABEL = "Lili Assistente";
const MAX_RADAR_ITEMS = 5;

interface RadarWhatsappInstanceRow {
  id: string;
  provider: "EVOLUTION" | "UAZAPI";
  instance_name: string | null;
  display_label: string | null;
  evolution_base_url: string | null;
  evolution_api_key: string | null;
  uazapi_base_url: string | null;
  uazapi_token: string | null;
}

export interface RadarWhatsappPreview {
  destinationPhone: string;
  destinationLabel: string;
  instanceLabel: string;
  period: { from: string; to: string };
  radarCount: number;
  message: string;
}

function formatBrDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function cleanLine(value: string | null | undefined, maxLength = 240) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function attentionLabel(level: ConversationInsight["attentionLevel"]) {
  return level === "critical" ? "CRÍTICO" : level === "high" ? "ALTO" : "ATENÇÃO";
}

function insightTitle(insight: ConversationInsight) {
  const name = cleanLine(insight.chatName, 70) || "Conversa sem nome";
  return insight.isGroup ? `${name} (grupo)` : name;
}

export function buildRadarWhatsappMessage(
  overview: EventsOverviewResponse,
  radar: ConversationInsight[],
) {
  const { from, to } = overview.period;
  const periodLabel = from === to ? formatBrDate(from) : `${formatBrDate(from)} a ${formatBrDate(to)}`;
  const stats = overview.stats;
  const openCount = stats.openRadar;
  const criticalCount = stats.byAttention.critical ?? 0;
  const highCount = stats.byAttention.high ?? 0;

  const lines = [
    `📡 *RADAR — INTELIGÊNCIA DO WHATSAPP*`,
    `🗓️ ${periodLabel}`,
    "",
    `*Resumo rápido*`,
    `• ${openCount} ${openCount === 1 ? "ponto aberto" : "pontos abertos"} no radar`,
    `• ${criticalCount} ${criticalCount === 1 ? "crítico" : "críticos"} e ${highCount} de atenção alta`,
    `• ${stats.complaints} ${stats.complaints === 1 ? "reclamação" : "reclamações"} · ${stats.unanswered} sem resposta · ${stats.churnRisks} com risco de perda`,
  ];

  if (radar.length === 0) {
    lines.push("", "✅ *Nenhum problema prioritário em aberto neste período.*");
  } else {
    lines.push("", "⚠️ *Principais pontos que pedem ação*");
    radar.slice(0, MAX_RADAR_ITEMS).forEach((insight, index) => {
      const reason = cleanLine(insight.attentionReason) || cleanLine(insight.summary);
      const action = cleanLine(insight.actionItems[0]);
      const agent = cleanLine(insight.agentName, 70);
      lines.push(
        "",
        `${index + 1}. *${insightTitle(insight)}* — ${attentionLabel(insight.attentionLevel)}`,
        `   ${reason || "Conversa sinalizada para acompanhamento."}`,
      );
      if (agent) lines.push(`   👤 Responsável: ${agent}`);
      if (action) lines.push(`   ➜ Próximo passo: ${action}`);
    });
  }

  const leadingTopics = overview.topics
    .filter((topic) => topic.negativeCount > 0)
    .slice(0, 3)
    .map((topic) => `${topic.topic} (${topic.negativeCount})`);
  if (leadingTopics.length > 0) {
    lines.push("", `🏷️ *Temas em atenção:* ${leadingTopics.join(" · ")}`);
  }

  lines.push("", "_Resumo gerado pelo Radar de Inteligência do WhatsApp._");
  return lines.join("\n");
}

async function loadRadarWhatsappData(
  user: JwtUser,
  period: { dateFrom?: string; dateTo?: string },
) {
  const [overview, insightResult] = await Promise.all([
    getEventsOverview(user, period),
    listConversationInsights(user, {
      ...period,
      attention: ["high", "critical"],
      onlyOpen: true,
    }, { page: 1, pageSize: MAX_RADAR_ITEMS }),
  ]);
  return { overview, radar: insightResult.insights };
}

export async function previewRadarWhatsapp(
  user: JwtUser,
  period: { dateFrom?: string; dateTo?: string },
): Promise<RadarWhatsappPreview> {
  const { overview, radar } = await loadRadarWhatsappData(user, period);
  return {
    destinationPhone: RADAR_WHATSAPP_PHONE,
    destinationLabel: "Lili",
    instanceLabel: RADAR_WHATSAPP_INSTANCE_LABEL,
    period: overview.period,
    radarCount: overview.stats.openRadar,
    message: buildRadarWhatsappMessage(overview, radar),
  };
}

async function resolveLiliAssistantInstance(): Promise<RadarWhatsappInstanceRow> {
  const result = await pool.query<RadarWhatsappInstanceRow>(`
    SELECT id, provider, instance_name, display_label,
           evolution_base_url, evolution_api_key, uazapi_base_url, uazapi_token
      FROM whatsapp_instances
     WHERE status = 'ACTIVE'
       AND (
         LOWER(TRIM(COALESCE(display_label, ''))) = LOWER($1)
         OR LOWER(TRIM(COALESCE(assigned_user_name, ''))) = LOWER($1)
         OR LOWER(TRIM(COALESCE(instance_name, ''))) = LOWER($1)
       )
     ORDER BY (LOWER(TRIM(COALESCE(display_label, ''))) = LOWER($1)) DESC,
              updated_at DESC
     LIMIT 1
  `, [RADAR_WHATSAPP_INSTANCE_LABEL]);

  const instance = result.rows[0];
  if (!instance) {
    throw new HttpError(409, 'A instância "Lili Assistente" não foi encontrada ativa. Reconecte-a antes de enviar.');
  }
  return instance;
}

export async function sendRadarWhatsapp(
  user: JwtUser,
  period: { dateFrom?: string; dateTo?: string },
) {
  const [preview, instance] = await Promise.all([
    previewRadarWhatsapp(user, period),
    resolveLiliAssistantInstance(),
  ]);

  let providerPayload: unknown;
  if (instance.provider === "UAZAPI" && instance.uazapi_base_url && instance.uazapi_token) {
    providerPayload = await sendUazapiTextMessage(
      { baseUrl: instance.uazapi_base_url, token: instance.uazapi_token },
      RADAR_WHATSAPP_DESTINATION,
      preview.message,
    );
  } else if (instance.instance_name && instance.evolution_base_url && instance.evolution_api_key) {
    providerPayload = await sendWhatsappInstanceTextMessage(
      {
        instanceName: instance.instance_name,
        evolutionBaseUrl: instance.evolution_base_url,
        evolutionApiKey: instance.evolution_api_key,
      },
      RADAR_WHATSAPP_DESTINATION,
      preview.message,
    );
  } else {
    throw new HttpError(409, 'A instância "Lili Assistente" está ativa, mas sem credenciais válidas de envio.');
  }

  logger.info("WhatsApp radar summary sent", {
    userId: user.id,
    instanceId: instance.id,
    instanceLabel: instance.display_label,
    provider: instance.provider,
    destinationPhone: RADAR_WHATSAPP_PHONE,
    period: preview.period,
    radarCount: preview.radarCount,
  });

  return {
    ok: true as const,
    sentAt: new Date().toISOString(),
    destinationPhone: RADAR_WHATSAPP_PHONE,
    instanceLabel: instance.display_label || RADAR_WHATSAPP_INSTANCE_LABEL,
    provider: instance.provider,
    providerPayload,
  };
}
