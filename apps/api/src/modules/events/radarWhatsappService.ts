import type {
  ConversationInsight,
  EventsOverviewResponse,
  RadarWhatsappAlertLimit,
  RadarWhatsappDetailLevel,
  RadarWhatsappOptions,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { logger } from "../../lib/logger.js";
import type { JwtUser } from "../platform/authService.js";
import { sendWhatsappInstanceTextMessage } from "../whatsapp/evolutionService.js";
import { sendUazapiTextMessage } from "../whatsapp/uazapiService.js";
import { getEventsOverview, listConversationInsights } from "./conversationAi.js";

const RADAR_WHATSAPP_DESTINATION = "5511997431733@s.whatsapp.net";
const RADAR_WHATSAPP_PHONE = "11997431733";
const RADAR_WHATSAPP_INSTANCE_LABEL = "Lili Assistente";
const DEFAULT_RADAR_OPTIONS: RadarWhatsappOptions = { detailLevel: "standard", alertLimit: 5 };

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
  includedAlertCount: number;
  detailLevel: RadarWhatsappDetailLevel;
  alertLimit: RadarWhatsappAlertLimit;
  message: string;
}

function formatBrDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function cleanLine(value: string | null | undefined, maxLength = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function attentionLabel(level: ConversationInsight["attentionLevel"]) {
  return level === "critical" ? "CRÍTICO" : level === "high" ? "ALTO" : "ATENÇÃO";
}

function insightTitle(insight: ConversationInsight) {
  const name = cleanLine(insight.chatName, 70) || "Conversa sem nome";
  return insight.isGroup ? `${name} (grupo)` : name;
}

const ATTENTION_PRIORITY: Record<ConversationInsight["attentionLevel"], number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  none: 1,
};

export function sortRadarByPriority(radar: ConversationInsight[]) {
  return [...radar].sort((left, right) => {
    const priorityDifference = ATTENTION_PRIORITY[right.attentionLevel] - ATTENTION_PRIORITY[left.attentionLevel];
    if (priorityDifference !== 0) return priorityDifference;
    const rightDate = Date.parse(right.lastMessageAt || right.analyzedAt || "") || 0;
    const leftDate = Date.parse(left.lastMessageAt || left.analyzedAt || "") || 0;
    return rightDate - leftDate;
  });
}

export function buildRadarWhatsappMessage(
  overview: EventsOverviewResponse,
  radar: ConversationInsight[],
  options: RadarWhatsappOptions = DEFAULT_RADAR_OPTIONS,
) {
  const { from, to } = overview.period;
  const periodLabel = from === to ? formatBrDate(from) : `${formatBrDate(from)} a ${formatBrDate(to)}`;
  const stats = overview.stats;
  const openCount = stats.openRadar;
  const criticalCount = stats.byAttention.critical ?? 0;
  const highCount = stats.byAttention.high ?? 0;
  const prioritizedRadar = sortRadarByPriority(radar).slice(0, options.alertLimit);

  const lines = [
    "📡 *RADAR — INTELIGÊNCIA DO WHATSAPP*",
    `🗓️ ${periodLabel}`,
    "",
    "*Resumo rápido*",
    `• ${openCount} ${openCount === 1 ? "ponto aberto" : "pontos abertos"} no radar`,
    `• ${criticalCount} ${criticalCount === 1 ? "crítico" : "críticos"} e ${highCount} de atenção alta`,
    `• ${stats.complaints} ${stats.complaints === 1 ? "reclamação" : "reclamações"} · ${stats.unanswered} sem resposta · ${stats.churnRisks} com risco de perda`,
  ];

  if (prioritizedRadar.length === 0) {
    lines.push("", "✅ *Nenhum problema prioritário em aberto neste período.*");
  } else {
    lines.push("", "⚠️ *Principais pontos que pedem ação — por prioridade*");
    prioritizedRadar.forEach((insight, index) => {
      const reason = cleanLine(insight.attentionReason) || cleanLine(insight.summary);
      const summary = cleanLine(insight.summary, 320);
      const actions = insight.actionItems.map((action) => cleanLine(action)).filter(Boolean);
      const agent = cleanLine(insight.agentName, 70);
      lines.push(
        "",
        `${index + 1}. *${insightTitle(insight)}* — ${attentionLabel(insight.attentionLevel)}`,
        `   ${reason || "Conversa sinalizada para acompanhamento."}`,
      );

      if (options.detailLevel === "summary") return;

      if (agent) lines.push(`   👤 Responsável: ${agent}`);
      if (actions[0]) lines.push(`   ➜ Próximo passo: ${actions[0]}`);

      if (options.detailLevel === "complete") {
        if (summary && summary !== reason) lines.push(`   💬 Resumo: ${summary}`);
        lines.push(`   📱 Canal: ${insight.isGroup ? "grupo" : "privado"}`);
        if (insight.topics.length > 0) lines.push(`   🏷️ Tema: ${insight.topics.slice(0, 3).join(" · ")}`);
        actions.slice(1, 3).forEach((action) => lines.push(`   ➜ Também fazer: ${action}`));
      }
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
  alertLimit: RadarWhatsappAlertLimit,
) {
  const [overview, insightResult] = await Promise.all([
    getEventsOverview(user, period),
    listConversationInsights(user, {
      ...period,
      attention: ["high", "critical"],
      onlyOpen: true,
    }, { page: 1, pageSize: alertLimit }),
  ]);
  return { overview, radar: sortRadarByPriority(insightResult.insights) };
}

export async function previewRadarWhatsapp(
  user: JwtUser,
  period: { dateFrom?: string; dateTo?: string },
  options: RadarWhatsappOptions = DEFAULT_RADAR_OPTIONS,
): Promise<RadarWhatsappPreview> {
  const { overview, radar } = await loadRadarWhatsappData(user, period, options.alertLimit);
  return {
    destinationPhone: RADAR_WHATSAPP_PHONE,
    destinationLabel: "Lili",
    instanceLabel: RADAR_WHATSAPP_INSTANCE_LABEL,
    period: overview.period,
    radarCount: overview.stats.openRadar,
    includedAlertCount: radar.length,
    detailLevel: options.detailLevel,
    alertLimit: options.alertLimit,
    message: buildRadarWhatsappMessage(overview, radar, options),
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
  options: RadarWhatsappOptions = DEFAULT_RADAR_OPTIONS,
) {
  const [preview, instance] = await Promise.all([
    previewRadarWhatsapp(user, period, options),
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
    includedAlertCount: preview.includedAlertCount,
    detailLevel: preview.detailLevel,
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
