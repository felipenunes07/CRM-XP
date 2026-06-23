import { useEffect, useMemo, useRef, useState, Fragment, type SyntheticEvent } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CarouselSlide,
  MessageTemplate,
  SavedSegment,
  WhatsappCampaignDetail,
  WhatsappCampaignMessageType,
  WhatsappCampaignRecipient,
  WhatsappGroup,
  WhatsappGroupClassification,
  WhatsappGroupMappingStatus,
  WhatsappInstanceProvider,
  WhatsappMappingSummary,
  WhatsappMenuType,
} from "@olist-crm/shared";
import { CheckCircle2, Clock3, LoaderCircle, Send, ShieldAlert, XCircle, Plus, ArrowRight, Filter, Check, Trash2, HelpCircle, Info, Users, Smartphone, PlusCircle, Sparkles, ChevronRight, ChevronLeft, Award, Search, ClipboardList, Bookmark, Save, X, CheckCheck, Smile, Paperclip, Film, MessageCircle, Copy, RotateCcw, Pause, Play } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDateTime, formatNumber, formatFileSize } from "../lib/format";
import { MiniChatDrawer, type MiniChatMessage } from "../components/MiniChatDrawer";
import { CampaignCreationProgress } from "../components/CampaignCreationProgress";
import { CampaignTableSkeleton } from "../components/CampaignTableSkeleton";
import { PurchaseSparkline } from "../components/PurchaseSparkline";

// Avatar de fallback gerado em SVG (data URI, sem rede). As fotos de perfil da
// Evolution vêm do CDN do WhatsApp (pps.whatsapp.net) e EXPIRAM — depois de um
// tempo retornam 403 e o <img> quebra. Em vez de mostrar o ícone de imagem
// quebrada, trocamos por um avatar com as iniciais do nome.
const AVATAR_FALLBACK_COLORS = ["#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#14b8a6", "#f43f5e"];

function initialsAvatarDataUri(name: string): string {
  const clean = (name || "?").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = (
    parts.length >= 2
      ? (parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")
      : clean.slice(0, 2)
  ).toUpperCase();
  // Cor estável por nome para o mesmo contato sempre ter o mesmo avatar.
  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  const bg = AVATAR_FALLBACK_COLORS[hash % AVATAR_FALLBACK_COLORS.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" fill="${bg}"/>` +
    `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#ffffff" ` +
    `font-family="Segoe UI, Arial, sans-serif" font-size="38" font-weight="600">${initials}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// onError trocando o src pelo avatar de iniciais. Limpa o próprio onError para
// não entrar em loop caso o fallback (impossível, mas por segurança) falhe.
function handleAvatarError(event: SyntheticEvent<HTMLImageElement>, name: string) {
  const img = event.currentTarget;
  img.onerror = null;
  img.src = initialsAvatarDataUri(name);
}

type QuickFilter = "ALL" | "WITH_ORDER" | "NO_ORDER_EXCEL" | "OTHER" | "BLOQUEADOS" | "ULTIMO_CONTATO" | "SELECTED" | "ACTIVE" | "ATTENTION" | "INACTIVE";
type RecentBlockFilter = "AVAILABLE_ONLY" | "ALL" | "BLOCKED_ONLY";
export type CampaignPerformanceFilter = "ALL" | "SENT" | "RESPONDED" | "NO_RESPONSE" | "PURCHASED" | "ISSUES";

const quickFilters: Array<{ value: QuickFilter; label: string; description: string }> = [
  { value: "ALL", label: "Todos", description: "Toda a base importada." },
  { value: "WITH_ORDER", label: "Clientes", description: "Clientes com pedido." },
  { value: "NO_ORDER_EXCEL", label: "Nunca comprou", description: "Nunca comprou." },
  { value: "ACTIVE", label: "Ativos", description: "Clientes ativos." },
  { value: "ATTENTION", label: "Atenção", description: "Clientes que necessitam de atenção." },
  { value: "INACTIVE", label: "Inativos", description: "Clientes inativos." },
  { value: "OTHER", label: "Outros", description: "LJ, internos e demais grupos." },
  { value: "BLOQUEADOS", label: "Bloqueados", description: "Grupos sob bloqueio recente." },
  { value: "ULTIMO_CONTATO", label: "Último contato", description: "Histórico de envio recente." },
  { value: "SELECTED", label: "Selecionados", description: "Visualizar apenas contatos selecionados para envio." },
];

const campaignPerformanceFilters: Array<{ value: CampaignPerformanceFilter; label: string }> = [
  { value: "ALL", label: "Todos" },
  { value: "SENT", label: "Enviados" },
  { value: "RESPONDED", label: "Responderam" },
  { value: "NO_RESPONSE", label: "Nao responderam" },
  { value: "ISSUES", label: "Bloqueios/Falhas" },
];

export const WHATSAPP_VIDEO_MAX_FILE_SIZE_BYTES = 64 * 1024 * 1024;
const WHATSAPP_VIDEO_MAX_FILE_SIZE_LABEL = "64MB";
const unsupportedVideoUrlExtensionPattern = /\.(mov|qt|webm|ogg|ogv|avi|mkv|wmv|flv|3gp|m4v)(?:[?#].*)?$/i;

type DisparadorVideoFileLike = Pick<File, "name" | "size" | "type">;

function isMp4FileName(fileName: string) {
  return fileName.trim().toLowerCase().endsWith(".mp4");
}

function getDataUrlMimeType(value: string) {
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)*;base64,/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function validateDisparadorVideoFile(file: DisparadorVideoFileLike) {
  if (file.size > WHATSAPP_VIDEO_MAX_FILE_SIZE_BYTES) {
    return `Erro: O vídeo deve ter no máximo ${WHATSAPP_VIDEO_MAX_FILE_SIZE_LABEL}.`;
  }

  const mimeType = file.type.trim().toLowerCase();
  if (mimeType && mimeType !== "video/mp4") {
    return "Erro: Apenas arquivos MP4 são aceitos para envio de vídeo no WhatsApp.";
  }

  if (!isMp4FileName(file.name)) {
    return "Erro: Apenas arquivos .mp4 são aceitos para envio de vídeo no WhatsApp.";
  }

  return null;
}

function validateDisparadorVideoSource(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Selecione um arquivo MP4 ou informe uma URL de vídeo MP4.";
  }

  const dataUrlMimeType = getDataUrlMimeType(trimmed);
  if (dataUrlMimeType && dataUrlMimeType !== "video/mp4") {
    return "Erro: Apenas vídeos MP4 (video/mp4) são aceitos.";
  }

  if (!dataUrlMimeType && unsupportedVideoUrlExtensionPattern.test(trimmed)) {
    return "Erro: URLs de vídeo precisam apontar para arquivo MP4.";
  }

  return null;
}



function buildGroupsQueryParams(input: {
  quickFilter: QuickFilter;
  search: string;
  savedSegmentId: string;
  onlyRecentlyBlocked: boolean;
}) {
  const params: Record<string, string | boolean | undefined> = {
    search: input.search || undefined,
    savedSegmentId: input.savedSegmentId || undefined,
    onlyRecentlyBlocked: input.onlyRecentlyBlocked || undefined,
  };

  if (input.quickFilter === "WITH_ORDER" || input.quickFilter === "NO_ORDER_EXCEL" || input.quickFilter === "OTHER") {
    params.classification = input.quickFilter;
  }

  if (input.quickFilter === "ACTIVE" || input.quickFilter === "ATTENTION" || input.quickFilter === "INACTIVE") {
    params.customerStatus = input.quickFilter;
  }

  if (input.quickFilter === "BLOQUEADOS") {
    params.onlyRecentlyBlocked = true;
  }

  return params;
}

function classificationLabel(value: WhatsappGroupClassification) {
  if (value === "WITH_ORDER") return "Cliente com pedido";
  if (value === "NO_ORDER_EXCEL") return "Nunca comprou";
  return "Outro grupo";
}

function mappingStatusLabel(value: WhatsappGroupMappingStatus) {
  if (value === "AUTO_MAPPED") return "Mapeado auto";
  if (value === "MANUAL_MAPPED") return "Mapeado manual";
  if (value === "CONFIRMED_UNMATCHED") return "Sem cliente";
  if (value === "IGNORED") return "Ignorado";
  return "Pendente";
}

function campaignStatusTone(status: WhatsappCampaignDetail["status"]) {
  if (status === "COMPLETED") return "success";
  if (status === "CANCELLED") return "danger";
  return "warning";
}

function recipientTone(status: WhatsappCampaignRecipient["status"]) {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  if (status === "BLOCKED_RECENT" || status === "SKIPPED") return "warning";
  return "neutral";
}

function renderRecipientIdentifier(recipient: WhatsappCampaignRecipient) {
  const displayName = recipient.customerDisplayName || recipient.customerCode;
  const isGroup = recipient.jid.endsWith("@g.us") || recipient.jid.includes("-");
  const jidNum = recipient.jid.split("@")[0] || recipient.jid;
  const formattedJid = isGroup
    ? `👥 Grupo: ${jidNum}`
    : `📞 +${jidNum.slice(0, 2)} (${jidNum.slice(2, 4)}) ${jidNum.slice(4, 9)}-${jidNum.slice(9)}`;

  return (
    <div className="wp-recipient-info-col">
      <strong className="wp-recipient-row-name" style={{ color: "#0f172a", fontSize: "0.92rem", fontWeight: 700 }}>
        {displayName || recipient.sourceName || (isGroup ? "Grupo de WhatsApp" : "Cliente WhatsApp")}
      </strong>
      <span className="wp-recipient-row-jid" style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
        {formattedJid}
      </span>
    </div>
  );
}

function recipientLiveLabel(recipient: WhatsappCampaignRecipient) {
  if (recipient.status === "SENT") {
    return `Enviado ${formatDateTime(recipient.sentAt)}`;
  }

  if (recipient.status === "FAILED") {
    return recipient.lastError || "Falha no envio";
  }

  if (recipient.status === "SENDING") {
    return "Enviando agora";
  }

  if (recipient.status === "PENDING") {
    return `Agendado para ${formatDateTime(recipient.scheduledFor)}`;
  }

  if (recipient.status === "BLOCKED_RECENT") {
    return "Bloqueado por contato recente";
  }

  return "Pulado";
}

function formatCountdown(targetAt: string | null, nowMs: number) {
  if (!targetAt) {
    return null;
  }

  const targetMs = new Date(targetAt).getTime();
  if (!Number.isFinite(targetMs)) {
    return null;
  }

  const diffMs = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.ceil(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function truncateText(value: string | null | undefined, maxLength = 96) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function quickFilterCount(
  filter: QuickFilter,
  summary: WhatsappMappingSummary | undefined,
  loadedItems: WhatsappGroup[],
  selectedCount?: number,
) {
  if (filter === "SELECTED") return formatNumber(selectedCount ?? 0);
  if (!summary) return "--";
  if (filter === "ACTIVE") {
    return formatNumber(summary.activeCount ?? 0);
  }
  if (filter === "ATTENTION") {
    return formatNumber(summary.attentionCount ?? 0);
  }
  if (filter === "INACTIVE") {
    return formatNumber(summary.inactiveCount ?? 0);
  }
  if (filter === "ALL") return formatNumber(summary.totalGroups);
  if (filter === "WITH_ORDER") return formatNumber(summary.classificationCounts["WITH_ORDER"]);
  if (filter === "NO_ORDER_EXCEL") return formatNumber(summary.classificationCounts["NO_ORDER_EXCEL"]);
  if (filter === "OTHER") return formatNumber(summary.classificationCounts["OTHER"]);
  if (filter === "BLOQUEADOS") return formatNumber(summary.recentlyBlockedGroups);
  if (filter === "ULTIMO_CONTATO") {
    return formatNumber(loadedItems.filter(g => g.lastContactAt !== null).length);
  }
  return "--";
}

export function campaignPerformanceFilterCount(filter: CampaignPerformanceFilter, campaign: WhatsappCampaignDetail | null) {
  if (!campaign) return "0";
  const performance = campaign.performance;
  const progress = campaign.progress;

  if (filter === "SENT") return formatNumber(progress.sentCount);
  if (filter === "RESPONDED") return formatNumber(performance.respondedRecipients);
  if (filter === "NO_RESPONSE") return formatNumber(performance.notRespondedRecipients || Math.max(0, progress.sentCount - performance.respondedRecipients));
  if (filter === "PURCHASED") return formatNumber(performance.purchasedRecipients);
  if (filter === "ISSUES") return formatNumber(progress.blockedRecentCount + progress.failedCount + progress.skippedCount);
  return formatNumber(progress.totalRecipients || performance.totalRecipients);
}

export function filterCampaignRecipients(recipients: WhatsappCampaignRecipient[], filter: CampaignPerformanceFilter) {
  if (filter === "SENT") {
    return recipients.filter((recipient) => recipient.status === "SENT");
  }

  if (filter === "RESPONDED") {
    return recipients.filter((recipient) => recipient.responded);
  }

  if (filter === "NO_RESPONSE") {
    return recipients.filter((recipient) => recipient.status === "SENT" && !recipient.responded);
  }

  if (filter === "PURCHASED") {
    return recipients.filter((recipient) => recipient.purchased);
  }

  if (filter === "ISSUES") {
    return recipients.filter((recipient) => ["BLOCKED_RECENT", "FAILED", "SKIPPED"].includes(recipient.status));
  }

  return recipients;
}

function mergeCampaignDetailsForDisplay(
  baseCampaign: WhatsappCampaignDetail | null,
  performanceCampaign: WhatsappCampaignDetail | null,
) {
  if (!baseCampaign || !performanceCampaign) {
    return baseCampaign;
  }

  const performanceByRecipientId = new Map(
    performanceCampaign.recipients.map((recipient) => [recipient.id, recipient]),
  );

  return {
    ...baseCampaign,
    performance: performanceCampaign.performance,
    recipients: baseCampaign.recipients.map((recipient) => ({
      ...recipient,
      ...(performanceByRecipientId.get(recipient.id) ?? {}),
      status: recipient.status,
      scheduledFor: recipient.scheduledFor,
      lastAttemptAt: recipient.lastAttemptAt,
      sentAt: recipient.sentAt,
      failedAt: recipient.failedAt,
      skippedAt: recipient.skippedAt,
      lastError: recipient.lastError,
    })),
  };
}

function recipientDispatchTime(recipient: WhatsappCampaignRecipient) {
  if (recipient.status === "SENT") return recipient.sentAt;
  if (recipient.status === "FAILED") return recipient.failedAt ?? recipient.lastAttemptAt ?? recipient.scheduledFor;
  if (recipient.status === "SENDING") return recipient.lastAttemptAt ?? recipient.scheduledFor;
  if (recipient.status === "PENDING") return recipient.scheduledFor;
  if (recipient.status === "SKIPPED") return recipient.skippedAt ?? recipient.scheduledFor;
  return recipient.scheduledFor;
}

function recipientDispatchTimeCaption(recipient: WhatsappCampaignRecipient, nowMs: number) {
  if (recipient.status === "PENDING") {
    const countdown = formatCountdown(recipient.scheduledFor, nowMs);
    return countdown ? `Falta ${countdown}` : "Na fila";
  }

  if (recipient.status === "SENDING") return "Enviando agora";
  if (recipient.status === "SENT") return "Disparo feito";
  if (recipient.status === "FAILED") return "Tentativa com falha";
  if (recipient.status === "SKIPPED") return "Envio cancelado";
  if (recipient.status === "BLOCKED_RECENT") return "Nao disparado";
  return "";
}

function recipientDispatchTimeTitle(recipient: WhatsappCampaignRecipient) {
  if (recipient.status === "SENT") return "Disparado em";
  if (recipient.status === "FAILED") return "Tentativa em";
  if (recipient.status === "SENDING") return "Enviando desde";
  if (recipient.status === "PENDING") return "Programado para";
  if (recipient.status === "SKIPPED") return "Cancelado em";
  if (recipient.status === "BLOCKED_RECENT") return "Nao disparado";
  return "Horario";
}

function recipientDispatchTimeLabel(recipient: WhatsappCampaignRecipient) {
  const value = recipientDispatchTime(recipient);
  return value ? formatDateTime(value) : "--";
}

function recipientObservation(recipient: WhatsappCampaignRecipient) {
  if (recipient.lastError) return recipient.lastError;
  if (recipient.status === "FAILED") return recipient.providerStatus || "Falha no envio";
  if (recipient.status === "SENDING") return recipient.providerStatus || "Em envio";
  if (recipient.providerStatus && !["PENDING", "SENT", "DELIVERED"].includes(recipient.providerStatus.toUpperCase())) {
    return recipient.providerStatus;
  }
  return "-";
}

export function campaignHasDuePendingRecipients(campaign: WhatsappCampaignDetail | null | undefined, nowMs: number) {
  if (!campaign || !["QUEUED", "IN_PROGRESS"].includes(campaign.status)) {
    return false;
  }

  return campaign.recipients.some((recipient) => {
    if (recipient.status !== "PENDING" || !recipient.scheduledFor) {
      return false;
    }

    const scheduledMs = new Date(recipient.scheduledFor).getTime();
    return Number.isFinite(scheduledMs) && scheduledMs <= nowMs;
  });
}

function campaignDiagnosisColors(tone: WhatsappCampaignDetail["performance"]["diagnosis"]["tone"]) {
  if (tone === "success") {
    return { background: "#f0fdf4", border: "#bbf7d0", color: "#166534" };
  }

  if (tone === "warning") {
    return { background: "#fffbeb", border: "#fde68a", color: "#92400e" };
  }

  if (tone === "danger") {
    return { background: "#fef2f2", border: "#fecaca", color: "#991b1b" };
  }

  return { background: "#f8fafc", border: "#e2e8f0", color: "#334155" };
}

export function CampaignPerformancePanel({
  campaign,
  performanceReady = true,
  performanceError = false,
  performanceLoading = false,
  nowMs = Date.now(),
  activeFilter,
  recipients,
  onFilterChange,
  onOpenMiniChat,
  onRetryRecipient,
  retryingRecipientId = null,
}: {
  campaign: WhatsappCampaignDetail;
  performanceReady?: boolean;
  performanceError?: boolean;
  performanceLoading?: boolean;
  nowMs?: number;
  activeFilter: CampaignPerformanceFilter;
  recipients: WhatsappCampaignRecipient[];
  onFilterChange: (filter: CampaignPerformanceFilter) => void;
  onOpenMiniChat: (recipient: WhatsappCampaignRecipient) => void;
  onRetryRecipient: (recipient: WhatsappCampaignRecipient) => void;
  retryingRecipientId?: string | null;
}) {
  const performance = campaign.performance;
  const diagnosisColors = campaignDiagnosisColors(performance.diagnosis.tone);
  const recentMessages = performanceReady ? performance.messages.slice(-120) : [];
  const [respondedCopied, setRespondedCopied] = useState(false);

  const formatJidPhone = (jid: string) => {
    const digits = jid.split("@")[0]?.replace(/\D/g, "") ?? "";
    if (!digits) return jid;
    // 55 + DDD + número → +55 (11) 99999-9999
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
      const ddd = digits.slice(2, 4);
      const rest = digits.slice(4);
      return `+55 (${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
    }
    return `+${digits}`;
  };

  const respondedRecipients = campaign.recipients.filter((recipient) => recipient.responded);
  const progress = campaign.progress;
  const statsTotalRecipients = performanceReady ? performance.totalRecipients : progress.totalRecipients;
  const statsEligibleRecipients = performanceReady ? performance.eligibleRecipients : progress.totalRecipients - progress.blockedRecentCount - progress.skippedCount;
  const statsSentRecipients = performanceReady ? performance.sentRecipients : progress.sentCount;
  const statsRespondedRecipients = performanceReady ? performance.respondedRecipients : respondedRecipients.length;
  const statsNotRespondedRecipients = performanceReady ? performance.notRespondedRecipients : Math.max(0, progress.sentCount - respondedRecipients.length);

  const copyRespondedList = async () => {
    const lines = respondedRecipients.map((recipient, index) => {
      const name = recipient.customerDisplayName || recipient.customerCode || recipient.sourceName || "Cliente WhatsApp";
      const phone = recipient.jid.endsWith("@g.us") ? "(grupo)" : formatJidPhone(recipient.jid);
      const when = recipient.firstResponseAt ? ` — respondeu em ${formatDateTime(recipient.firstResponseAt)}` : "";
      return `${index + 1}. *${name}* — ${phone}${when}`;
    });

    const text = [
      `📣 *Clientes que responderam — ${campaign.name}*`,
      `Disparo de ${formatDateTime(campaign.createdAt)}`,
      "",
      ...lines,
      "",
      `Total: *${respondedRecipients.length}* cliente(s). Favor dar sequência no atendimento ✅`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback para contextos sem clipboard API (http, navegadores antigos)
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setRespondedCopied(true);
    setTimeout(() => setRespondedCopied(false), 2500);
  };

  const funnelStats = [
    { label: "Publico", value: formatNumber(statsTotalRecipients), detail: `${formatNumber(Math.max(0, statsEligibleRecipients))} elegiveis`, icon: Users, accent: "#4f46e5", soft: "#eef2ff" },
    { label: "Enviados", value: formatNumber(statsSentRecipients), detail: `${formatNumber(progress.pendingCount)} na fila`, icon: Send, accent: "#0284c7", soft: "#e0f2fe" },
    { label: "Aguardando", value: formatNumber(progress.pendingCount), detail: progress.nextScheduledAt ? `Proximo: ${formatDateTime(progress.nextScheduledAt)}` : "Sem fila pendente", icon: Clock3, accent: "#d97706", soft: "#fff7ed" },
    { label: "Falhas", value: formatNumber(progress.failedCount), detail: `${formatNumber(progress.blockedRecentCount)} bloqueados`, icon: ShieldAlert, accent: "#dc2626", soft: "#fef2f2" },
    { label: "Responderam", value: formatNumber(statsRespondedRecipients), detail: performanceReady ? `${formatNumber(statsNotRespondedRecipients)} sem resposta` : "Calculando respostas", icon: MessageCircle, accent: "#059669", soft: "#ecfdf5" },
    { label: "Concluidos", value: formatNumber(progress.completedCount), detail: progress.estimatedFinishAt ? `Termina: ${formatDateTime(progress.estimatedFinishAt)}` : "Sem previsao", icon: CheckCircle2, accent: "#475569", soft: "#f1f5f9" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "0.6rem" }}>
        {funnelStats.map((stat) => {
          const StatIcon = stat.icon;
          return (
            <div
              key={stat.label}
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderLeft: `4px solid ${stat.accent}`,
                borderRadius: "8px",
                padding: "0.75rem 0.85rem",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: "0.45rem 0.65rem",
                alignItems: "start",
                boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
              }}
            >
              <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {stat.label}
              </span>
              <span style={{ width: "28px", height: "28px", borderRadius: "7px", background: stat.soft, display: "grid", placeItems: "center", flexShrink: 0, gridRow: "1 / span 2" }}>
                <StatIcon size={15} style={{ color: stat.accent }} />
              </span>
              <strong style={{ fontSize: "1.35rem", fontWeight: 850, color: "#0f172a", lineHeight: 1 }}>{stat.value}</strong>
              <span style={{ color: "#71717a", fontSize: "0.72rem", fontWeight: 550, gridColumn: "1 / -1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stat.detail}</span>
            </div>
          );
        })}
      </div>

      {performanceReady ? (
      <div
        style={{
          background: diagnosisColors.background,
          border: `1px solid ${diagnosisColors.border}`,
          borderRadius: "8px",
          color: diagnosisColors.color,
          padding: "0.9rem 1rem",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
        }}
      >
        <Info size={18} style={{ marginTop: "2px", flexShrink: 0 }} />
        <div>
          <strong style={{ display: "block", fontSize: "0.9rem" }}>{performance.diagnosis.title}</strong>
          <span style={{ display: "block", fontSize: "0.82rem", marginTop: "2px", lineHeight: 1.45 }}>
            {performance.diagnosis.description}
          </span>
          <span style={{ display: "block", fontSize: "0.74rem", marginTop: "6px", opacity: 0.82 }}>
            Janela de atribuição: {performance.attributionWindowDays} dias; crédito para a campanha mais recente.
          </span>
        </div>
      </div>
      ) : (
        <div
          style={{
            background: performanceError ? "#fffbeb" : "#eff6ff",
            border: `1px solid ${performanceError ? "#fde68a" : "#bfdbfe"}`,
            borderRadius: "8px",
            color: performanceError ? "#92400e" : "#1e40af",
            padding: "0.9rem 1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            fontSize: "0.84rem",
          }}
        >
          {performanceLoading ? <LoaderCircle size={17} className="spin" /> : <Info size={17} />}
          <span>
            {performanceError
              ? "Metricas de resposta/compras falharam, mas a fila e os horarios continuam disponiveis abaixo."
              : "Carregando metricas em segundo plano. A fila e os horarios ja estao disponiveis."}
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {campaignPerformanceFilters.map((filter) => {
          const active = activeFilter === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => onFilterChange(filter.value)}
              style={{
                border: active ? "1px solid #18181b" : "1px solid #e4e4e7",
                background: active ? "#18181b" : "#ffffff",
                color: active ? "#ffffff" : "#3f3f46",
                borderRadius: "8px",
                padding: "0.45rem 0.7rem",
                fontSize: "0.78rem",
                fontWeight: 650,
                cursor: "pointer",
              }}
            >
              {filter.label} ({campaignPerformanceFilterCount(filter.value, campaign)})
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "1.25rem", alignItems: "start" }}>
        <div style={{ border: "1px solid #e4e4e7", borderRadius: "8px", overflow: "hidden", background: "#fff" }}>
          <div style={{ padding: "0.85rem 1rem", borderBottom: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <h5 style={{ margin: 0, fontSize: "0.88rem", color: "#18181b" }}>Clientes da campanha</h5>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.74rem", color: "#71717a" }}>
                {formatNumber(recipients.length)} exibidos neste filtro
              </p>
            </div>
            <button
              type="button"
              onClick={copyRespondedList}
              disabled={respondedRecipients.length === 0}
              title="Copia a lista de quem respondeu, pronta para colar no WhatsApp das vendedoras"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                background: respondedCopied ? "#dcfce7" : respondedRecipients.length === 0 ? "#f4f4f5" : "#10b981",
                border: respondedCopied ? "1px solid #86efac" : "1px solid transparent",
                borderRadius: "8px",
                color: respondedCopied ? "#166534" : respondedRecipients.length === 0 ? "#a1a1aa" : "#ffffff",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: respondedRecipients.length === 0 ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              {respondedCopied ? (
                <>
                  <CheckCheck size={14} />
                  Copiado! É só colar no WhatsApp
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copiar respondidos ({formatNumber(respondedRecipients.length)})
                </>
              )}
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="z-table" style={{ width: "100%", minWidth: "720px", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "23%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "19%" }} />
                <col style={{ width: "18%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>CLIENTE</th>
                  <th>STATUS</th>
                  <th>DISPARO / HORARIO</th>
                  <th>RESPOSTA</th>
                  <th style={{ textAlign: "right" }}>ERRO / OBS</th>
                  <th style={{ textAlign: "center" }}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {recipients.length ? recipients.map((recipient) => {
                  const observation = recipientObservation(recipient);
                  return (
                  <tr key={recipient.id}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                            {recipient.status === "SENT" && <CheckCircle2 size={14} style={{ color: "#10b981" }} />}
                            {recipient.status === "FAILED" && <XCircle size={14} style={{ color: "#ef4444" }} />}
                            {recipient.status === "SENDING" && <LoaderCircle size={14} style={{ color: "#3b82f6" }} className="spin" />}
                            {recipient.status === "PENDING" && <Clock3 size={14} style={{ color: "#f59e0b" }} />}
                            <strong style={{ color: "#18181b", fontSize: "0.84rem" }}>
                              {recipient.customerDisplayName || recipient.customerCode || recipient.sourceName || "Cliente WhatsApp"}
                            </strong>
                          </div>
                          {recipient.responded && (
                            <span style={{ 
                              background: "#dcfce7", 
                              color: "#166534", 
                              padding: "2px 6px", 
                              borderRadius: "4px",
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px"
                            }}>
                              💬 Respondeu
                            </span>
                          )}
                        </div>
                        <span style={{ color: "#71717a", fontSize: "0.72rem", fontFamily: "monospace", display: "block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recipient.jid}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge status-${recipientTone(recipient.status)}`}>
                        {recipient.status === "SENT" ? "ENVIADO" : recipient.status === "FAILED" ? "FALHA" : recipient.status === "BLOCKED_RECENT" ? "BLOQUEADO" : recipient.status}
                      </span>
                      <div style={{ color: "#71717a", fontSize: "0.72rem", marginTop: "4px" }}>
                        {recipient.status === "SENT"
                          ? "Enviado"
                          : recipient.status === "FAILED"
                            ? "Falhou"
                            : recipient.status === "PENDING"
                              ? "Na fila"
                              : recipient.status === "SENDING"
                                ? "Enviando"
                                : recipient.status === "BLOCKED_RECENT"
                                  ? "Bloqueado"
                                  : "Cancelado"}
                      </div>
                    </td>
                    <td>
                      <div style={{ color: "#64748b", fontSize: "0.68rem", fontWeight: 700, marginBottom: "3px", textTransform: "uppercase" }}>
                        {recipientDispatchTimeTitle(recipient)}
                      </div>
                      <strong style={{ color: "#18181b", fontSize: "0.82rem" }}>
                        {recipientDispatchTimeLabel(recipient)}
                      </strong>
                      <div style={{ color: "#71717a", fontSize: "0.72rem", marginTop: "4px" }}>
                        {recipientDispatchTimeCaption(recipient, nowMs)}
                      </div>
                    </td>
                    <td>
                      <strong style={{ color: recipient.responded ? "#166534" : "#71717a", fontSize: "0.82rem" }}>
                        {recipient.responded ? `${formatNumber(recipient.responseCount)} resposta(s)` : "Sem resposta"}
                      </strong>
                      <div style={{ color: "#71717a", fontSize: "0.72rem", marginTop: "4px" }}>
                        {recipient.responded ? formatDateTime(recipient.firstResponseAt) : ""}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span
                        title={observation !== "-" ? observation : undefined}
                        style={{
                          display: "inline-block",
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: recipient.status === "FAILED" ? "#b91c1c" : "#71717a",
                          fontSize: "0.76rem",
                          fontWeight: recipient.status === "FAILED" ? 650 : 500,
                          verticalAlign: "middle",
                        }}
                      >
                        {observation}
                      </span>
                    </td>
                    <td style={{ textAlign: "center", padding: "0.75rem 0.65rem" }}>
                      <div style={{ display: "flex", justifyContent: "center", gap: "6px", flexWrap: "wrap" }}>
                      {recipient.status === "FAILED" && (
                        <button
                          type="button"
                          onClick={() => onRetryRecipient(recipient)}
                          disabled={retryingRecipientId === recipient.id}
                          title="Retentar envio para este contato"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "6px 9px",
                            background: "#fff7ed",
                            border: "1px solid #fed7aa",
                            borderRadius: "6px",
                            color: "#c2410c",
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            cursor: retryingRecipientId === recipient.id ? "not-allowed" : "pointer",
                            opacity: retryingRecipientId === recipient.id ? 0.65 : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {retryingRecipientId === recipient.id ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />}
                          Retentar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onOpenMiniChat(recipient);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 10px",
                          background: recipient.responded ? "#dcfce7" : "#eff6ff",
                          border: recipient.responded ? "1px solid #86efac" : "1px solid #bfdbfe",
                          borderRadius: "6px",
                          color: recipient.responded ? "#166534" : "#1e40af",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.15s",
                          whiteSpace: "nowrap"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "scale(1.05)";
                          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      >
                        <Smartphone size={14} />
                        Chat
                      </button>
                      </div>
                    </td>
                  </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "#71717a" }}>
                      Nenhum cliente encontrado neste filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ border: "1px solid #e4e4e7", borderRadius: "8px", background: "#fff", padding: "1rem" }}>
            <h5 style={{ margin: "0 0 0.6rem 0", fontSize: "0.88rem", color: "#18181b" }}>Mensagem enviada</h5>
            {campaign.messageType === "VIDEO" && campaign.videoUrl && (
              <div style={{ marginBottom: "0.75rem" }}>
                <video
                  src={campaign.videoUrl}
                  controls
                  style={{ width: "100%", maxHeight: "150px", borderRadius: "6px", backgroundColor: "#000" }}
                />
              </div>
            )}
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e4e4e7",
                borderRadius: "8px",
                padding: "0.85rem",
                fontSize: "0.82rem",
                color: "#18181b",
                whiteSpace: "pre-wrap",
                maxHeight: "180px",
                overflowY: "auto",
                lineHeight: 1.45,
              }}
            >
              {campaign.messageText || "Sem conteudo de mensagem."}
            </div>
          </div>

          <div style={{ border: "1px solid #e4e4e7", borderRadius: "8px", background: "#fff", padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center", marginBottom: "0.75rem" }}>
              <h5 style={{ margin: 0, fontSize: "0.88rem", color: "#18181b" }}>Mensagens da campanha</h5>
              <span style={{ color: "#71717a", fontSize: "0.74rem" }}>
                {formatNumber(performance.sentMessages)} enviadas / {formatNumber(performance.receivedMessages)} recebidas
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", maxHeight: "430px", overflowY: "auto", paddingRight: "2px" }}>
              {recentMessages.length ? recentMessages.map((message) => {
                const inbound = message.direction === "INBOUND";
                return (
                  <article
                    key={`${message.source}-${message.id}`}
                    style={{
                      alignSelf: inbound ? "flex-start" : "flex-end",
                      maxWidth: "88%",
                      border: `1px solid ${inbound ? "#bbf7d0" : "#e4e4e7"}`,
                      borderRadius: inbound ? "12px 12px 12px 4px" : "12px 12px 4px 12px",
                      padding: "0.6rem 0.8rem",
                      background: inbound ? "#f0fdf4" : "#f8fafc",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.3rem" }}>
                      <strong style={{ fontSize: "0.72rem", color: inbound ? "#166534" : "#334155", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        {inbound ? <><MessageCircle size={11} /> Recebida</> : <><Send size={11} /> Enviada</>}
                      </strong>
                      <span style={{ color: "#71717a", fontSize: "0.68rem", whiteSpace: "nowrap" }}>{formatDateTime(message.createdAt)}</span>
                    </div>
                    <p style={{ margin: 0, color: "#18181b", fontSize: "0.8rem", lineHeight: 1.42 }}>{truncateText(message.content, 180)}</p>
                    <span style={{ display: "block", color: "#71717a", fontSize: "0.68rem", marginTop: "0.3rem" }}>
                      {message.customerDisplayName || message.customerCode || message.jid || message.senderName || "Contato da campanha"}
                    </span>
                  </article>
                );
              }) : (
                <div style={{ color: "#71717a", fontSize: "0.82rem", padding: "1rem", textAlign: "center", border: "1px dashed #d4d4d8", borderRadius: "8px" }}>
                  Nenhuma mensagem atribuida a esta campanha ainda.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DisparadorPage() {
  const auth = useAuth() as {
    token: string | null;
    user: { role: "ADMIN" | "MANAGER" | "SELLER"; name: string } | null;
  };
  const { token, user } = auth;
  const canImport = ["ADMIN", "MANAGER"].includes(user?.role ?? "");
  const queryClient = useQueryClient();
  const resumeAttemptByCampaignRef = useRef<Record<string, number>>({});


  const [quickFilter, setQuickFilter] = useState<QuickFilter>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [dispatchesFilter, setDispatchesFilter] = useState<"ALL" | "ZERO" | "SOME" | "FEW" | "MANY">("ALL");
  const [search, setSearch] = useState("");
  const [savedSegmentId, setSavedSegmentId] = useState("");
  const [recentBlockFilter, setRecentBlockFilter] = useState<RecentBlockFilter>("AVAILABLE_ONLY");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [pastedClsText, setPastedClsText] = useState("");
  const [newSegmentName, setNewSegmentName] = useState("");
  const [showClPasteArea, setShowClPasteArea] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [overrideRecentBlock, setOverrideRecentBlock] = useState(false);
  const [minDelaySeconds, setMinDelaySeconds] = useState(183);
  const [dispatchMode, setDispatchMode] = useState<"NOW" | "SCHEDULED">("NOW");
  const [scheduledStartAtLocal, setScheduledStartAtLocal] = useState("");
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(304);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignPerformanceFilter, setCampaignPerformanceFilter] = useState<CampaignPerformanceFilter>("ALL");
  const [attemptedAutoImport, setAttemptedAutoImport] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Mini Chat States
  const [miniChatOpen, setMiniChatOpen] = useState(false);
  const [miniChatRecipient, setMiniChatRecipient] = useState<WhatsappCampaignRecipient | null>(null);
  const [miniChatMessages, setMiniChatMessages] = useState<MiniChatMessage[]>([]);
  const [miniChatLoading, setMiniChatLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"NEW_CAMPAIGN" | "HISTORY">("NEW_CAMPAIGN");
  const [currentStep, setCurrentStep] = useState(1); // Start at step 1 (Criação)

  // Pré-seleciona um público quando chegamos vindo de outra tela (ex.: aba de
  // Crédito & Pagamento → "Criar público e disparar cobrança").
  const location = useLocation();
  const appliedIncomingSegmentRef = useRef(false);
  useEffect(() => {
    if (appliedIncomingSegmentRef.current) return;
    const incoming = (location.state as { savedSegmentId?: string } | null)?.savedSegmentId;
    if (incoming) {
      appliedIncomingSegmentRef.current = true;
      setSavedSegmentId(incoming);
      setActiveTab("NEW_CAMPAIGN");
      setCurrentStep(1);
    }
  }, [location.state]);
  const [abTestActive, setAbTestActive] = useState(false);
  const [abMessageText, setAbMessageText] = useState("");
  const [selectedAbTemplateId, setSelectedAbTemplateId] = useState("");
  
  const whatsappInstancesQuery = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: () => api.whatsappInstances(token!),
    enabled: Boolean(token),
  });

  interface SenderItem {
    id: string;
    name: string;
    role: string;
    phone: string;
    avatarUrl: string;
    status?: string;
    provider?: WhatsappInstanceProvider;
  }

  // Real Senders derived from the backend whatsappInstancesQuery
  const senders: SenderItem[] = useMemo(() => {
    const list = whatsappInstancesQuery.data ?? [];
    if (list.length === 0) {
      return [
        { id: "default", name: "Carregando...", role: "WhatsApp", phone: "", avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80", status: "DISCONNECTED" }
      ];
    }
    return list.map(instance => {
      const name = instance.displayLabel || instance.instanceName || "Canal WhatsApp";
      return {
        id: instance.id,
        name,
        role: instance.assignedUserName || "Conexão",
        phone: instance.phoneNumber || "Sem número",
        avatarUrl: instance.profilePictureUrl || initialsAvatarDataUri(name),
        status: instance.status,
        provider: instance.provider ?? "EVOLUTION",
      };
    });
  }, [whatsappInstancesQuery.data]);

  const [selectedSenderIds, setSelectedSenderIds] = useState<string[]>([]);

  // Carousel / UazAPI state
  const [campaignMessageType, setCampaignMessageType] = useState<WhatsappCampaignMessageType>("TEXT");
  const [carouselSlides, setCarouselSlides] = useState<CarouselSlide[]>([
    { text: "", image: "", buttons: [{ id: "btn1", text: "", type: "url" }] },
  ]);
  const [uploadingSlideIndex, setUploadingSlideIndex] = useState<number | null>(null);
  // Menu interativo (uazapi /send/menu)
  const [menuType, setMenuType] = useState<WhatsappMenuType>("button");
  const [menuChoices, setMenuChoices] = useState<string[]>(["", ""]);
  const [menuFooterText, setMenuFooterText] = useState("");
  const [menuListButton, setMenuListButton] = useState("");
  const [menuSelectableCount, setMenuSelectableCount] = useState(1);
  const [menuImageButton, setMenuImageButton] = useState("");
  const [uploadingMenuImage, setUploadingMenuImage] = useState(false);
  // Resposta automática quando o cliente responder ao disparo
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyText, setAutoReplyText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoFileName, setVideoFileName] = useState("");
  const [videoFileSize, setVideoFileSize] = useState<number | null>(null);
  const [videoOrientation, setVideoOrientation] = useState<"UNKNOWN" | "VERTICAL" | "LANDSCAPE">("UNKNOWN");
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const selectedSenderProvider: WhatsappInstanceProvider = useMemo(() => {
    if (!selectedSenderIds.length) return "EVOLUTION";
    const sender = senders.find(s => s.id === selectedSenderIds[0]);
    return sender?.provider ?? "EVOLUTION";
  }, [selectedSenderIds, senders]);

  const isLocalVideoFile = videoUrl.startsWith("data:");
  const videoInputDisplayValue = isLocalVideoFile
    ? `Arquivo selecionado: ${videoFileName || "video.mp4"}`
    : videoUrl;
  const videoDisplayLabel = isLocalVideoFile
    ? `${videoFileName || "video.mp4"}${videoFileSize ? ` (${formatFileSize(videoFileSize)})` : ""}`
    : videoUrl;
  const isVerticalVideoPreview = videoOrientation !== "LANDSCAPE";
  const videoStageStyle = {
    width: "100%",
    minHeight: isVerticalVideoPreview ? "420px" : "260px",
    maxHeight: "560px",
    display: "grid",
    placeItems: "center",
    borderRadius: "10px",
    background: "#0f172a",
    overflow: "hidden",
  } as const;
  const videoElementStyle = {
    width: isVerticalVideoPreview ? "min(100%, 320px)" : "100%",
    height: isVerticalVideoPreview ? "min(62vh, 540px)" : "auto",
    maxHeight: "560px",
    aspectRatio: isVerticalVideoPreview ? "9 / 16" : "16 / 9",
    objectFit: "contain",
    borderRadius: isVerticalVideoPreview ? "10px" : "0",
    backgroundColor: "#000",
    display: "block",
  } as const;
  const phoneVideoStyle = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    backgroundColor: "#000",
  } as const;

  function handleVideoMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const element = event.currentTarget;
    if (element.videoWidth > 0 && element.videoHeight > 0) {
      setVideoOrientation(element.videoHeight > element.videoWidth ? "VERTICAL" : "LANDSCAPE");
    }
  }

  // Reset message type when provider changes
  useEffect(() => {
    if (selectedSenderProvider !== "UAZAPI" && (campaignMessageType === "CAROUSEL" || campaignMessageType === "MENU")) {
      setCampaignMessageType("TEXT");
    }
  }, [selectedSenderProvider, campaignMessageType]);

  function buildMenuData() {
    return {
      menuType,
      choices: menuChoices.map((choice) => choice.trim()).filter(Boolean),
      footerText: menuFooterText.trim() || null,
      listButton: menuType === "list" ? menuListButton.trim() || null : null,
      selectableCount: menuType === "poll" ? menuSelectableCount : null,
      imageButton: menuType === "button" ? menuImageButton.trim() || null : null,
    };
  }

  // Por padrão nenhum remetente vem selecionado: o usuário escolhe
  // manualmente quais conexões serão usadas no disparo.
  const [recipientSenderMapping, setRecipientSenderMapping] = useState<Record<string, string>>({}); // groupId -> senderId

  // Tooltip tracking
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const groupQueryParams = useMemo(
    () =>
      buildGroupsQueryParams({
        quickFilter,
        search,
        savedSegmentId,
        onlyRecentlyBlocked: recentBlockFilter === "BLOCKED_ONLY",
      }),
    [quickFilter, recentBlockFilter, savedSegmentId, search],
  );

  async function invalidateWhatsappQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["whatsapp-group-mapping-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["whatsapp-groups"] }),
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
    ]);
  }

  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => api.messageTemplates(token!),
    enabled: Boolean(token),
  });

  const savedSegmentsQuery = useQuery({
    queryKey: ["saved-segments"],
    queryFn: () => api.savedSegments(token!),
    enabled: Boolean(token),
  });




  // O summary alimenta os contadores das abas. Passamos os mesmos filtros que a
  // lista usa (Busca, Público salvo e o toggle Bloqueio) para que o número do
  // badge bata com as linhas exibidas.
  const mappingSummaryParams = useMemo(
    () => ({
      search: search || undefined,
      savedSegmentId: savedSegmentId || undefined,
      recentBlock: recentBlockFilter,
    }),
    [search, savedSegmentId, recentBlockFilter],
  );

  const mappingSummaryQuery = useQuery({
    queryKey: ["whatsapp-group-mapping-summary", mappingSummaryParams],
    queryFn: () => api.whatsappGroupMappingSummary(token!, mappingSummaryParams),
    enabled: Boolean(token),
  });

  const groupsQuery = useQuery({
    queryKey: ["whatsapp-groups", groupQueryParams],
    queryFn: () => api.whatsappGroups(token!, groupQueryParams),
    enabled: Boolean(token),
  });

  const campaignsQuery = useQuery({
    queryKey: ["whatsapp-campaigns"],
    queryFn: () => api.whatsappCampaigns(token!, 20),
    enabled: Boolean(token),
    staleTime: 30000, // Cache por 30 segundos
    refetchOnWindowFocus: false, // Não refetch ao voltar para a aba
    refetchInterval: (query) =>
      query.state.data?.some((campaign) => ["QUEUED", "IN_PROGRESS"].includes(campaign.status)) ? 10000 : false,
  });

  // Carga rápida do painel: traz a campanha, destinatários e status SEM a
  // atribuição pesada de respostas/compras (excludePerformance). Isso evita que
  // o painel inteiro fique preso no spinner enquanto a query de atribuição roda.
  const selectedCampaignQuery = useQuery({
    queryKey: ["whatsapp-campaign", selectedCampaignId],
    queryFn: () => api.whatsappCampaign(token!, selectedCampaignId!, { limit: 5000, offset: 0, excludePerformance: true }),
    enabled: Boolean(token && selectedCampaignId),
    staleTime: 5000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.data && ["QUEUED", "IN_PROGRESS"].includes(query.state.data.status) ? 10000 : false,
  });

  // Métricas de resposta/compra (atribuição) são caras. Carregam em segundo
  // plano, sem bloquear o painel; se falharem/demorarem, o painel mostra um
  // aviso em vez de travar tudo. retry: 1 evita o loop de 3 tentativas que
  // mantinha o spinner por minutos.
  const selectedCampaignPerformanceQuery = useQuery({
    queryKey: ["whatsapp-campaign-performance", selectedCampaignId],
    queryFn: () => api.whatsappCampaign(token!, selectedCampaignId!, { limit: 5000, offset: 0 }),
    enabled: Boolean(token && selectedCampaignId),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.data && ["QUEUED", "IN_PROGRESS"].includes(query.state.data.status) ? 30000 : false,
  });

  useEffect(() => {
    setCampaignPerformanceFilter("ALL");
  }, [selectedCampaignId]);

  const importDefaultMutation = useMutation({
    mutationFn: () => api.importWhatsappGroupsDefault(token!),
    onSuccess: async () => {
      await invalidateWhatsappQueries();
    },
  });

  const createSavedSegmentMutation = useMutation({
    mutationFn: (input: { name: string; definition: any }) => api.createSavedSegment(token!, input),
    onSuccess: (savedSegment) => {
      void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
      setSavedSegmentId(savedSegment.id);
      setShowClPasteArea(false);
      setPastedClsText("");
      setNewSegmentName("");
    },
    onError: (err: any) => {
      alert(`Erro ao criar grupo: ${err.message || err}`);
    }
  });



  const createCampaignMutation = useMutation({
    mutationFn: () => {
      const preparedVideoUrl = campaignMessageType === "VIDEO" ? videoUrl.trim() : null;
      if (campaignMessageType === "VIDEO") {
        const validationError = validateDisparadorVideoSource(preparedVideoUrl ?? "");
        if (validationError) {
          throw new Error(validationError);
        }
      }

      return api.createWhatsappCampaign(token!, {
        name: campaignName.trim() || `Disparo ${new Date().toLocaleDateString("pt-BR")}`,
        templateId: selectedTemplateId || null,
        savedSegmentId: savedSegmentId || null,
        whatsappInstanceId: selectedSenderIds[0] || null,
        messageText,
        messageType: campaignMessageType,
        carouselData: campaignMessageType === "CAROUSEL" ? carouselSlides : null,
        menuData: campaignMessageType === "MENU" ? buildMenuData() : null,
        videoUrl: preparedVideoUrl,
        autoReplyText: autoReplyEnabled && autoReplyText.trim() ? autoReplyText.trim() : null,
        filtersSnapshot: {
          quickFilter,
          search,
          savedSegmentId: savedSegmentId || null,
          recentBlockFilter,
          selectedCount: selectedGroupIds.length,
        },
        groupIds: selectedGroupIds,
        overrideRecentBlock,
        minDelaySeconds,
        maxDelaySeconds,
        scheduledStartAt:
          dispatchMode === "SCHEDULED" && scheduledStartAtLocal
            ? new Date(scheduledStartAtLocal).toISOString()
            : null,
      });
    },
    onSuccess: async (campaign) => {
      setSelectedCampaignId(campaign?.id ?? null);
      setSelectedGroupIds([]);
      await invalidateWhatsappQueries();
      setActiveTab("HISTORY");
    },
    onError: (error: any) => {
      alert(`Erro ao criar campanha: ${error?.message || error}`);
    },
  });

  const activeCampaignId = useMemo(() => {
    if (createCampaignMutation.data?.id) {
      return createCampaignMutation.data.id;
    }

    const activeCampaign = campaignsQuery.data?.find((campaign) => ["QUEUED", "IN_PROGRESS", "PAUSED"].includes(campaign.status));
    return activeCampaign?.id ?? selectedCampaignId ?? null;
  }, [campaignsQuery.data, createCampaignMutation.data?.id, selectedCampaignId]);

  const activeCampaignQuery = useQuery({
    queryKey: ["whatsapp-campaign-live", activeCampaignId],
    queryFn: () => api.whatsappCampaign(token!, activeCampaignId!, { limit: 5000, offset: 0, excludePerformance: true }),
    enabled: Boolean(token && activeCampaignId),
    refetchInterval: (query) =>
      query.state.data && ["QUEUED", "IN_PROGRESS"].includes(query.state.data.status) ? 5000 : false,
  });

  const cancelCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => api.cancelWhatsappCampaign(token!, campaignId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign", selectedCampaignId] }),
      ]);
    },
  });

  const resumeCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => api.resumeWhatsappCampaign(token!, campaignId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign-live", activeCampaignId] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign", selectedCampaignId] }),
      ]);
    },
  });

  const pauseCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => api.pauseWhatsappCampaign(token!, campaignId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign-live", activeCampaignId] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign", selectedCampaignId] }),
      ]);
    },
    onError: (error: any) => {
      alert(`Erro ao pausar campanha: ${error?.message || error}`);
    },
  });

  const retryAllFailedMutation = useMutation({
    mutationFn: (campaignId: string) => api.retryAllFailedWhatsappCampaign(token!, campaignId),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign-live", activeCampaignId] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign", selectedCampaignId] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign-performance", selectedCampaignId] }),
      ]);
      const retried = (data as { retried?: number } | null)?.retried ?? 0;
      alert(retried > 0 ? `${retried} disparo(s) reenfileirado(s) para nova tentativa.` : "Nenhuma falha para retentar.");
    },
    onError: (error: any) => {
      alert(`Erro ao retentar falhas: ${error?.message || error}`);
    },
  });

  const skipRecipientMutation = useMutation({
    mutationFn: ({ campaignId, recipientId }: { campaignId: string; recipientId: string }) =>
      api.skipWhatsappCampaignRecipient(token!, campaignId, recipientId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign-live", activeCampaignId] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign", selectedCampaignId] }),
      ]);
    },
  });

  const retryRecipientMutation = useMutation({
    mutationFn: ({ campaignId, recipientId }: { campaignId: string; recipientId: string }) =>
      api.retryWhatsappCampaignRecipient(token!, campaignId, recipientId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign-live", activeCampaignId] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign", selectedCampaignId] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign-performance", selectedCampaignId] }),
      ]);
    },
    onError: (error: any) => {
      alert(`Erro ao retentar disparo: ${error?.message || error}`);
    },
  });

  const sendTestMessageMutation = useMutation({
    mutationFn: () => {
      const preparedVideoUrl = campaignMessageType === "VIDEO" ? videoUrl.trim() : undefined;
      if (campaignMessageType === "VIDEO") {
        const validationError = validateDisparadorVideoSource(preparedVideoUrl ?? "");
        if (validationError) {
          throw new Error(validationError);
        }
      }

      const payload = {
        messageText: campaignMessageType === "VIDEO" ? messageText.trim() : messageText || "Mensagem de teste",
        messageType: campaignMessageType,
        carouselData: campaignMessageType === "CAROUSEL" ? carouselSlides : undefined,
        menuData: campaignMessageType === "MENU" ? buildMenuData() : undefined,
        videoUrl: preparedVideoUrl,
        whatsappInstanceId: selectedSenderIds[0] || undefined
      };
      
      console.log("Sending test message with payload:", payload);
      return api.sendTestMessage(token!, payload);
    },
    onSuccess: (data) => {
      console.log("Test message sent successfully:", data);
      alert("✅ Mensagem de teste enviada com sucesso para +55 11 91127-9702!");
    },
    onError: (error: any) => {
      console.error("Error sending test message:", error);
      const errorMessage = error?.message || error?.toString() || "Erro desconhecido";
      alert(`❌ Erro ao enviar teste: ${errorMessage}\n\nVerifique se a instância WhatsApp está ativa e configurada corretamente.`);
    }
  });

  useEffect(() => {
    if (!selectedTemplateId) return;
    const template = templatesQuery.data?.find((item) => item.id === selectedTemplateId);
    if (!template) return;

    setMessageText(template.content);
    setCampaignName((current) => current || `${template.title} ${new Date().toLocaleDateString("pt-BR")}`);
  }, [selectedTemplateId, templatesQuery.data]);

  useEffect(() => {
    if (!canImport || attemptedAutoImport || importDefaultMutation.isPending) {
      return;
    }

    setAttemptedAutoImport(true);
    importDefaultMutation.mutate();
  }, [attemptedAutoImport, canImport, importDefaultMutation]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const loadedGroups = groupsQuery.data?.items ?? [];
  const filteredGroups = useMemo(() => {
    let result = loadedGroups;

    if (quickFilter === "SELECTED") {
      result = result.filter((group) => selectedGroupIds.includes(group.id));
    } else if (quickFilter === "ULTIMO_CONTATO") {
      result = result.filter((group) => group.lastContactAt !== null);
    } else if (quickFilter === "ACTIVE") {
      result = result.filter((group) => group.customerStatus === "ACTIVE");
    } else if (quickFilter === "ATTENTION") {
      result = result.filter((group) => group.customerStatus === "ATTENTION");
    } else if (quickFilter === "INACTIVE") {
      result = result.filter((group) => group.customerStatus === "INACTIVE");
    }

    if (dispatchesFilter === "ZERO") {
      result = result.filter((group) => (group.sentCampaignsCount ?? 0) === 0);
    } else if (dispatchesFilter === "SOME") {
      result = result.filter((group) => (group.sentCampaignsCount ?? 0) >= 1);
    } else if (dispatchesFilter === "FEW") {
      result = result.filter((group) => (group.sentCampaignsCount ?? 0) >= 1 && (group.sentCampaignsCount ?? 0) <= 2);
    } else if (dispatchesFilter === "MANY") {
      result = result.filter((group) => (group.sentCampaignsCount ?? 0) >= 3);
    }

    if (quickFilter !== "BLOQUEADOS" && quickFilter !== "SELECTED") {
      if (recentBlockFilter === "AVAILABLE_ONLY") {
        return result.filter((group) => !group.isRecentlyBlocked);
      } else if (recentBlockFilter === "BLOCKED_ONLY") {
        return result.filter((group) => group.isRecentlyBlocked);
      }
    }

    return result;
  }, [loadedGroups, quickFilter, recentBlockFilter, selectedGroupIds, dispatchesFilter]);
  const selectedGroupCount = selectedGroupIds.length;

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [quickFilter, recentBlockFilter, savedSegmentId, search, dispatchesFilter]);

  const itemsPerPage = 50;
  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);
  const paginatedGroups = useMemo(() => {
    return filteredGroups.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredGroups, currentPage]);

  const allVisibleSelected =
    paginatedGroups.length > 0 && paginatedGroups.every((group) => selectedGroupIds.includes(group.id));

  const selectedSavedSegment = savedSegmentsQuery.data?.find((segment) => segment.id === savedSegmentId) ?? null;
  const selectedTemplate = templatesQuery.data?.find((template) => template.id === selectedTemplateId) ?? null;
  const importSummary = importDefaultMutation.data;
  const importError = importDefaultMutation.error as Error | null;
  const isImporting = importDefaultMutation.isPending;
  const liveCampaign = activeCampaignQuery.data ?? selectedCampaignQuery.data ?? createCampaignMutation.data ?? null;
  const liveCampaignIsRunning = liveCampaign ? ["QUEUED", "IN_PROGRESS", "PAUSED"].includes(liveCampaign.status) : false;
  const nextDispatchCountdown = liveCampaign ? formatCountdown(liveCampaign.progress.nextScheduledAt, nowMs) : null;
  const hiddenBlockedCount = useMemo(() => {
    if (recentBlockFilter !== "AVAILABLE_ONLY") {
      return 0;
    }

    return loadedGroups.filter((group) => group.isRecentlyBlocked).length;
  }, [loadedGroups, recentBlockFilter]);
  const liveRecipients = useMemo(() => {
    if (!liveCampaign?.recipients.length) {
      return [];
    }

    const statusOrder: Record<WhatsappCampaignRecipient["status"], number> = {
      SENDING: 0,
      PENDING: 1,
      FAILED: 2,
      BLOCKED_RECENT: 3,
      SENT: 4,
      SKIPPED: 5,
    };

    return [...liveCampaign.recipients]
      .sort((left, right) => {
        const orderDiff = statusOrder[left.status] - statusOrder[right.status];
        if (orderDiff !== 0) {
          return orderDiff;
        }

        const leftTime = left.scheduledFor ? new Date(left.scheduledFor).getTime() : 0;
        const rightTime = right.scheduledFor ? new Date(right.scheduledFor).getTime() : 0;
        return leftTime - rightTime;
      });
  }, [liveCampaign]);
  const selectedCampaignDetail = selectedCampaignQuery.data ?? null;
  const selectedCampaignPerformanceDetail = selectedCampaignPerformanceQuery.data ?? null;
  const selectedCampaignDisplayDetail = useMemo(
    () => mergeCampaignDetailsForDisplay(selectedCampaignDetail, selectedCampaignPerformanceDetail),
    [selectedCampaignDetail, selectedCampaignPerformanceDetail],
  );

  useEffect(() => {
    if (!token || !liveCampaign || resumeCampaignMutation.isPending) {
      return;
    }

    // Campanha pausada NÃO deve ser retomada pelo nudge automático — só pelo botão
    // Retomar. Sem isto, o auto-resume desfaria a pausa em ~15s.
    if (liveCampaign.status === "PAUSED") {
      return;
    }

    if (!campaignHasDuePendingRecipients(liveCampaign, nowMs)) {
      return;
    }

    const lastAttemptMs = resumeAttemptByCampaignRef.current[liveCampaign.id] ?? 0;
    if (nowMs - lastAttemptMs < 15_000) {
      return;
    }

    resumeAttemptByCampaignRef.current[liveCampaign.id] = nowMs;
    resumeCampaignMutation.mutate(liveCampaign.id);
  }, [liveCampaign, nowMs, resumeCampaignMutation, token]);

  const selectedCampaignPerformanceRecipients = useMemo(
    () => filterCampaignRecipients(selectedCampaignDisplayDetail?.recipients ?? [], campaignPerformanceFilter),
    [campaignPerformanceFilter, selectedCampaignDisplayDetail?.recipients],
  );
  const menuChoicesCount = menuChoices.filter((choice) => choice.trim()).length;
  const hasMessage = campaignMessageType === "CAROUSEL"
    ? true
    : campaignMessageType === "VIDEO"
      ? Boolean(videoUrl.trim())
      : campaignMessageType === "MENU"
        ? Boolean(messageText.trim()) && menuChoicesCount > 0
        : Boolean(messageText.trim());
  const isReadyToDispatch = hasMessage && selectedGroupCount > 0 && selectedSenderIds.length > 0;
  const dispatchButtonLabel = createCampaignMutation.isPending
    ? "Criando campanha..."
    : selectedGroupCount > 0
      ? `Disparar para ${formatNumber(selectedGroupCount)} grupos`
      : "Selecione grupos para disparar";
  const composeHelperText = campaignMessageType === "VIDEO" && !videoUrl
    ? "Selecione ou insira um arquivo/URL de vídeo para liberar o disparo."
    : campaignMessageType === "MENU" && menuChoicesCount === 0
    ? "Adicione ao menos uma opção no menu interativo para liberar o disparo."
    : !hasMessage
      ? "Escreva ou escolha a mensagem final para liberar o disparo."
      : selectedGroupCount === 0
        ? "Selecione os grupos abaixo para habilitar o disparo."
        : `Delay configurado entre ${minDelaySeconds}s e ${maxDelaySeconds}s por envio.`;



  function toggleGroupSelection(groupId: string) {
    setSelectedGroupIds((current) =>
      current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId],
    );
  }

  function toggleVisibleSelection() {
    const visibleIds = paginatedGroups.map((group) => group.id);
    setSelectedGroupIds((current) => {
      if (allVisibleSelected) {
        return current.filter((groupId) => !visibleIds.includes(groupId));
      }

      return [...new Set([...current, ...visibleIds])];
    });
  }

  function handleApplyPastedCls() {
    const codes = pastedClsText
      .split(/[\s,;\n]+/)
      .map(c => c.trim().toUpperCase())
      .filter(c => c.startsWith("CL"));
    
    if (codes.length === 0) {
      alert("Nenhum código válido (iniciando com CL) foi inserido.");
      return;
    }

    const matchingGroups = loadedGroups.filter(g => g.customerCode && codes.includes(g.customerCode.trim().toUpperCase()));
    const matchingIds = matchingGroups.map(g => g.id);

    if (matchingIds.length > 0) {
      setSelectedGroupIds(current => [...new Set([...current, ...matchingIds])]);
      
      // Clear filters and redirect straight to SELECTED tab to show them
      setSearch("");
      setSavedSegmentId("");
      setQuickFilter("SELECTED");
      
      alert(`${matchingIds.length} grupos mapeados para os códigos CL foram selecionados e exibidos na aba 'Selecionados'!`);
    } else {
      alert("Nenhum grupo correspondente aos códigos CL inseridos foi encontrado no filtro atual. Dica: Use a opção 'Criar & Salvar Novo Público' para salvar e filtrar todos os códigos CL da sua base de dados.");
    }
  }

  function handleCreateSegmentFromPastedCls() {
    const codes = pastedClsText
      .split(/[\s,;\n]+/)
      .map(c => c.trim().toUpperCase())
      .filter(c => c.startsWith("CL"));
    
    if (codes.length === 0) {
      alert("Nenhum código válido (iniciando com CL) foi inserido.");
      return;
    }

    if (!newSegmentName.trim()) {
      alert("Por favor, digite um nome para o novo público salvo.");
      return;
    }

    createSavedSegmentMutation.mutate({
      name: newSegmentName.trim(),
      definition: {
        customerCodes: codes
      }
    });
  }


  function changeGroupSender(groupId: string, senderId: string) {
    setRecipientSenderMapping(current => ({
      ...current,
      [groupId]: senderId
    }));
  }

  function toggleSenderSelection(id: string) {
    setSelectedSenderIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    );
  }


  return (
    <>
    <div className="page-stack">
      {/* ── TOP NAV SEGMENTED CONTROL TABS ── */}
      <div className="z-tabs" style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          className={`z-tab ${activeTab === "NEW_CAMPAIGN" ? "active" : ""}`}
          onClick={() => setActiveTab("NEW_CAMPAIGN")}
        >
          <Plus size={16} />
          Nova Campanha
        </button>
        <button
          type="button"
          className={`z-tab ${activeTab === "HISTORY" ? "active" : ""}`}
          onClick={() => setActiveTab("HISTORY")}
        >
          <Clock3 size={16} />
          Histórico de Campanhas
        </button>
      </div>

      {/* ── TAB 1: NEW CAMPAIGN STEPPER WIZARD ── */}
      {activeTab === "NEW_CAMPAIGN" && (
        <>
          {/* ── STEPPER COMPONENT ── */}
          <div className="wp-stepper">
            <button
              type="button"
              className={`wp-step ${currentStep === 1 ? "active" : ""} ${currentStep > 1 ? "completed" : ""}`}
              onClick={() => setCurrentStep(1)}
            >
              <span className="wp-step-num">{currentStep > 1 ? <Check size={14} /> : "1"}</span>
              <span>Criação</span>
            </button>
            <span className="wp-step-arrow"><ChevronRight size={14} /></span>

            <button
              type="button"
              className={`wp-step ${currentStep === 2 ? "active" : ""} ${currentStep > 2 ? "completed" : ""}`}
              onClick={() => setCurrentStep(2)}
            >
              <span className="wp-step-num">{currentStep > 2 ? <Check size={14} /> : "2"}</span>
              <span>Remetentes</span>
            </button>
            <span className="wp-step-arrow"><ChevronRight size={14} /></span>

            <button
              type="button"
              className={`wp-step ${currentStep === 3 ? "active" : ""} ${currentStep > 3 ? "completed" : ""}`}
              onClick={() => setCurrentStep(3)}
            >
              <span className="wp-step-num">{currentStep > 3 ? <Check size={14} /> : "3"}</span>
              <span>Destinatários</span>
            </button>
            <span className="wp-step-arrow"><ChevronRight size={14} /></span>

            <button
              type="button"
              className={`wp-step ${currentStep === 4 ? "active" : ""} ${currentStep > 4 ? "completed" : ""}`}
              onClick={() => setCurrentStep(4)}
            >
              <span className="wp-step-num">{currentStep > 4 ? <Check size={14} /> : "4"}</span>
              <span>Mensagem</span>
            </button>
            <span className="wp-step-arrow"><ChevronRight size={14} /></span>

            <button
              type="button"
              className={`wp-step ${currentStep === 5 ? "active" : ""} ${currentStep > 5 ? "completed" : ""}`}
              onClick={() => setCurrentStep(5)}
            >
              <span className="wp-step-num">5</span>
              <span>Revisão</span>
            </button>

            <div className="wp-stepper-progress" style={{ width: `${((currentStep - 1) / 4) * 100}%` }} />
          </div>

          {/* ── WIZARD WORKSPACE ── */}
          <div className="wp-wizard-layout full-width">
            
            {/* LEFT COLUMN: ACTIVE STEP */}
            <div className="wp-wizard-main">
              
              {/* STEP 1: CRIAÇÃO */}
              {currentStep === 1 && (
                <div className="wp-card-step">
                  {/* Circular step indicator */}
                  <div className="wp-card-step-badge">01</div>
                  
                  {/* Step tab header */}
                  <div className="wp-card-step-header">
                    <h3 className="wp-card-step-title">Criação</h3>
                  </div>

                  {/* Input Label with Icon */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "0.5rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.95rem", fontWeight: 700, color: "#18181b" }}>
                      <PlusCircle size={18} style={{ color: "#10b981" }} />
                      Digite o título da sua campanha
                    </label>
                    
                    {/* Input Container */}
                    <div className="wp-card-input-container">
                      <input
                        value={campaignName}
                        onChange={(event) => setCampaignName(event.target.value)}
                        placeholder="Digite o nome da campanha..."
                        className="wp-card-input"
                      />
                    </div>
                  </div>

                  {/* Advanced Anti-Spam settings inside a beautifully integrated sub-card */}
                  {canImport && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", background: "#f8fafc", padding: "1.25rem", borderRadius: "12px", border: "1px solid #e2e8f0", marginTop: "0.5rem" }}>
                      <h4 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Configurações Anti-Spam (Recomendado)
                      </h4>
                      
                      <div className="whatsapp-delay-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                        <div className="whatsapp-delay-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>Delay mínimo (segundos)</span>
                          <input
                            type="number"
                            min={1}
                            value={minDelaySeconds}
                            onChange={(event) => setMinDelaySeconds(Number(event.target.value) || 1)}
                            className="wp-card-input"
                            style={{ padding: "0.5rem 0.75rem", fontSize: "0.9rem" }}
                          />
                        </div>

                        <div className="whatsapp-delay-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>Delay máximo (segundos)</span>
                          <input
                            type="number"
                            min={1}
                            value={maxDelaySeconds}
                            onChange={(event) => setMaxDelaySeconds(Number(event.target.value) || 1)}
                            className="wp-card-input"
                            style={{ padding: "0.5rem 0.75rem", fontSize: "0.9rem" }}
                          />
                        </div>
                      </div>
                      
                      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "1rem", marginTop: "0.5rem" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            alignItems: "flex-start",
                            background: overrideRecentBlock ? "rgba(239, 68, 68, 0.03)" : "transparent",
                            border: overrideRecentBlock ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid transparent",
                            padding: overrideRecentBlock ? "0.75rem 1rem" : "0.5rem 0",
                            borderRadius: "10px",
                            transition: "all 0.2s ease"
                          }}
                        >
                          <input
                            type="checkbox"
                            id="overrideRecentBlock"
                            checked={overrideRecentBlock}
                            onChange={(event) => setOverrideRecentBlock(event.target.checked)}
                            style={{
                              marginTop: "4px",
                              width: "16px",
                              height: "16px",
                              accentColor: "#ef4444",
                              cursor: "pointer"
                            }}
                          />
                          <label htmlFor="overrideRecentBlock" style={{ display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer", flex: 1 }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: overrideRecentBlock ? "#ef4444" : "#334155", transition: "color 0.2s" }}>
                              Ignorar o bloqueio de proteção anti-spam de 7 dias
                            </span>
                            <span style={{ fontSize: "0.75rem", color: overrideRecentBlock ? "#991b1b" : "#64748b", lineHeight: "1.4" }}>
                              Use com moderação. Forçar disparos recentes aumenta riscos de block.
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation row inside the card */}
                  <div className="wp-card-nav-row">
                    <button
                      type="button"
                      className="wp-card-btn-back"
                      onClick={() => setActiveTab("HISTORY")}
                    >
                      ‹ Voltar ao Histórico
                    </button>
                    
                    <button
                      type="button"
                      className="wp-card-btn-next"
                      onClick={() => setCurrentStep(2)}
                      disabled={!campaignName.trim()}
                      style={{ opacity: campaignName.trim() ? 1 : 0.6 }}
                    >
                      Continuar
                    </button>
                  </div>

                  {/* Step Footer */}
                  <div className="wp-card-step-footer">
                    <h4 className="wp-card-step-footer-title">Crie sua campanha</h4>
                    <p className="wp-card-step-footer-subtitle">Defina seu público, conteúdo e objetivos.</p>
                  </div>
                </div>
              )}

              {/* STEP 2: REMETENTES */}
              {currentStep === 2 && (
                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <h3>Selecionar Remetentes</h3>
                      <p className="panel-subcopy">Marque as conexões de WhatsApp reais que serão usadas para realizar os disparos desta campanha.</p>
                    </div>
                  </div>

                  {whatsappInstancesQuery.isLoading ? (
                    <div className="page-loading">Buscando conexões de WhatsApp ativas...</div>
                  ) : senders.length === 0 || (senders.length === 1 && senders[0]?.id === "default") ? (
                    <div className="empty-panel" style={{ padding: "3rem 1rem" }}>
                      <div className="empty-state">
                        Nenhuma linha de WhatsApp conectada encontrada no seu painel. Conecte uma linha na tela de Configuração de Usuários/WhatsApp para disparar!
                      </div>
                    </div>
                  ) : (
                    <div className="wp-senders-grid" style={{ marginTop: "1.5rem" }}>
                      {senders.map((sender) => (
                        <div
                          key={sender.id}
                          className={`wp-sender-card ${selectedSenderIds.includes(sender.id) ? "selected" : ""}`}
                          onClick={() => {
                            if (sender.status !== "ACTIVE") return; // Only allow selecting active lines
                            toggleSenderSelection(sender.id);
                          }}
                          style={{ opacity: sender.status === "ACTIVE" ? 1 : 0.6, cursor: sender.status === "ACTIVE" ? "pointer" : "not-allowed" }}
                        >
                          <img src={sender.avatarUrl} alt={sender.name} className="wp-sender-avatar" onError={(e) => handleAvatarError(e, sender.name)} />
                          <div className="wp-sender-info">
                            <h4 className="wp-sender-name">{sender.name}</h4>
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px" }}>
                              <span className="wp-sender-role">{sender.role}</span>
                              <span className={`status-badge ${sender.status === "ACTIVE" ? "status-success" : "status-danger"}`} style={{ fontSize: "0.65rem", padding: "1px 6px" }}>
                                {sender.status === "ACTIVE" ? "Ativo" : sender.status === "PAUSED" ? "Pausado" : "Inativo"}
                              </span>
                            </div>
                            <p className="wp-profile-phone" style={{ margin: "4px 0 0 0" }}>{sender.phone}</p>
                          </div>
                          {selectedSenderIds.includes(sender.id) && (
                            <span className="wp-sender-checked">
                              <Check size={12} />
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )}

              {/* STEP 3: DESTINATÁRIOS */}
              {currentStep === 3 && (
                <article className="panel">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--line)", paddingBottom: "1rem", marginBottom: "1rem" }}>
                    <div>
                      <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                        <Users size={18} style={{ color: "#10b981" }} />
                        Grupos para disparo
                      </h3>
                      <p className="panel-subcopy" style={{ margin: "2px 0 0 0" }}>Filtre e marque os grupos que vão receber.</p>
                    </div>
                    
                    {/* Top-Right Counters */}
                    <div style={{ display: "flex", gap: "10px" }}>
                      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.5rem 1rem", textAlign: "center", minWidth: "90px" }}>
                        <span style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Mostrados</span>
                        <strong style={{ fontSize: "1.1rem", color: "#1e293b" }}>{formatNumber(filteredGroups.length)}</strong>
                      </div>
                      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "0.5rem 1rem", textAlign: "center", minWidth: "90px" }}>
                        <span style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#1e40af", textTransform: "uppercase" }}>Selecionados</span>
                        <strong style={{ fontSize: "1.1rem", color: "#1e40af" }}>{formatNumber(selectedGroupCount)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Filter Toolbar (Row 1 of inputs exactly like screenshot) */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "1.25rem", margin: "1.25rem 0" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>Público salvo</span>
                      <select
                        value={savedSegmentId}
                        onChange={(event) => {
                          setSavedSegmentId(event.target.value);
                          if (quickFilter === "SELECTED") {
                            setQuickFilter("ALL");
                          }
                        }}
                        className="wp-card-input"
                        style={{ padding: "0.625rem 0.75rem", fontSize: "0.9rem", background: "#fff" }}
                      >
                        <option value="">Todos os grupos</option>
                        {(savedSegmentsQuery.data ?? []).map((segment) => (
                          <option key={segment.id} value={segment.id}>
                            {segment.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>Buscar</span>
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Nome do grupo, cliente ou código"
                        className="wp-card-input"
                        style={{ padding: "0.625rem 0.75rem", fontSize: "0.9rem" }}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>Bloqueio</span>
                      <div className="z-tabs" style={{ margin: 0, borderBottom: "none", background: "#f1f5f9", padding: "0.25rem", borderRadius: "8px", display: "flex", gap: "4px" }}>
                        <button
                          type="button"
                          className={`z-tab ${recentBlockFilter === "AVAILABLE_ONLY" ? "active" : ""}`}
                          onClick={() => setRecentBlockFilter("AVAILABLE_ONLY")}
                          style={{ flex: 1, padding: "0.4rem", fontSize: "0.82rem", borderRadius: "6px", borderBottom: "none", justifyContent: "center", background: recentBlockFilter === "AVAILABLE_ONLY" ? "#fff" : "transparent" }}
                        >
                          Disponíveis
                        </button>
                        <button
                          type="button"
                          className={`z-tab ${recentBlockFilter === "ALL" ? "active" : ""}`}
                          onClick={() => setRecentBlockFilter("ALL")}
                          style={{ flex: 1, padding: "0.4rem", fontSize: "0.82rem", borderRadius: "6px", borderBottom: "none", justifyContent: "center", background: recentBlockFilter === "ALL" ? "#fff" : "transparent" }}
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          className={`z-tab ${recentBlockFilter === "BLOCKED_ONLY" ? "active" : ""}`}
                          onClick={() => setRecentBlockFilter("BLOCKED_ONLY")}
                          style={{ flex: 1, padding: "0.4rem", fontSize: "0.82rem", borderRadius: "6px", borderBottom: "none", justifyContent: "center", background: recentBlockFilter === "BLOCKED_ONLY" ? "#fff" : "transparent" }}
                        >
                          Bloqueados
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>Qtd. Disparos</span>
                      <select
                        value={dispatchesFilter}
                        onChange={(e) => setDispatchesFilter(e.target.value as any)}
                        className="wp-card-input"
                        style={{ padding: "0.625rem 0.75rem", fontSize: "0.9rem", background: "#fff", cursor: "pointer" }}
                      >
                        <option value="ALL">Qualquer quantidade</option>
                        <option value="ZERO">Sem disparos (Novo)</option>
                        <option value="SOME">Com disparos (1 ou mais)</option>
                        <option value="FEW">Poucos disparos (1 a 2)</option>
                        <option value="MANY">Muitos disparos (3 ou mais)</option>
                      </select>
                    </div>
                  </div>

                  {/* Tabs Row (Row 2 exactly like screenshot) */}
                  <div className="z-tabs" style={{ marginBottom: "1rem", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {quickFilters.map((filter) => {
                      const count = quickFilterCount(filter.value, mappingSummaryQuery.data, loadedGroups, selectedGroupIds.length);
                      const isActive = quickFilter === filter.value;
                      return (
                        <button
                          key={filter.value}
                          type="button"
                          className={`z-tab ${isActive ? "active" : ""}`}
                          onClick={() => setQuickFilter(filter.value)}
                          style={{
                            padding: "0.6rem 1rem",
                            fontSize: "0.85rem",
                            fontWeight: isActive ? 700 : 500,
                            borderRadius: "8px",
                            backgroundColor: isActive ? "#eff6ff" : "transparent",
                            borderBottom: isActive ? "2px solid #3b82f6" : "2px solid transparent",
                            color: isActive ? "#1e40af" : "#64748b"
                          }}
                        >
                          {filter.label}
                          <span style={{ fontSize: "0.72rem", background: isActive ? "#bfdbfe" : "#f1f5f9", padding: "2px 6px", borderRadius: "999px", marginLeft: "6px", color: isActive ? "#1e40af" : "#64748b" }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Actions Row */}
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", margin: "1.25rem 0", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={toggleVisibleSelection}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        border: "1px solid #e4e4e7",
                        borderRadius: "8px",
                        padding: "0.625rem 1.25rem",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        backgroundColor: "#ffffff",
                        color: "#3f3f46",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#f4f4f5";
                        e.currentTarget.style.borderColor = "#d4d4d8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#ffffff";
                        e.currentTarget.style.borderColor = "#e4e4e7";
                      }}
                    >
                      <CheckCircle2 size={16} style={{ color: "#10b981" }} />
                      Selecionar visíveis
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroupIds([]);
                        if (quickFilter === "SELECTED") {
                          setQuickFilter("ALL");
                        }
                      }}
                      disabled={selectedGroupCount === 0}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        border: "1px solid #e4e4e7",
                        borderRadius: "8px",
                        padding: "0.625rem 1.25rem",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        backgroundColor: "#ffffff",
                        color: selectedGroupCount === 0 ? "#a1a1aa" : "#ef4444",
                        cursor: selectedGroupCount === 0 ? "not-allowed" : "pointer",
                        opacity: selectedGroupCount === 0 ? 0.6 : 1,
                        transition: "all 0.2s ease",
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
                      }}
                      onMouseEnter={(e) => {
                        if (selectedGroupCount > 0) {
                          e.currentTarget.style.backgroundColor = "#fef2f2";
                          e.currentTarget.style.borderColor = "#fca5a5";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#ffffff";
                        e.currentTarget.style.borderColor = "#e4e4e7";
                      }}
                    >
                      <Trash2 size={16} />
                      Limpar seleção
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowClPasteArea(!showClPasteArea)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        border: "1px solid",
                        borderColor: showClPasteArea ? "#18181b" : "#e4e4e7",
                        borderRadius: "8px",
                        padding: "0.625rem 1.25rem",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        backgroundColor: showClPasteArea ? "#18181b" : "#ffffff",
                        color: showClPasteArea ? "#ffffff" : "#18181b",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
                      }}
                      onMouseEnter={(e) => {
                        if (!showClPasteArea) {
                          e.currentTarget.style.backgroundColor = "#f4f4f5";
                          e.currentTarget.style.borderColor = "#d4d4d8";
                        } else {
                          e.currentTarget.style.backgroundColor = "#27272a";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showClPasteArea) {
                          e.currentTarget.style.backgroundColor = "#ffffff";
                          e.currentTarget.style.borderColor = "#e4e4e7";
                        } else {
                          e.currentTarget.style.backgroundColor = "#18181b";
                        }
                      }}
                    >
                      <ClipboardList size={16} style={{ color: showClPasteArea ? "#ffffff" : "#3b82f6" }} />
                      {showClPasteArea ? "✕ Fechar Importador CL" : "Importador de CLs"}
                    </button>
                  </div>

                  {/* CL Paste Panel */}
                  {showClPasteArea && (
                    <div style={{
                      background: "#ffffff",
                      border: "1px solid #e4e4e7",
                      borderRadius: "16px",
                      padding: "1.5rem",
                      margin: "1.25rem 0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "1.25rem",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.03)"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <ClipboardList size={20} style={{ color: "#3b82f6" }} />
                        <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#18181b" }}>
                          Importar Destinatários via Códigos CL
                        </h4>
                      </div>
                      
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "#71717a", lineHeight: "1.5" }}>
                        Cole os códigos de clientes (ex: <code style={{ background: "#f4f4f5", padding: "2px 6px", borderRadius: "4px", color: "#0f766e" }}>CL1002, CL1003, CL1004</code>) abaixo. Você pode selecionar os grupos na tabela atual ou <strong>criar e salvar esse grupo de clientes</strong> no banco de dados.
                      </p>

                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>Nome do Público Salvo (Opcional - Necessário para Salvar)</span>
                        <input
                          value={newSegmentName}
                          onChange={(e) => setNewSegmentName(e.target.value)}
                          placeholder="Ex: Clientes VIP Região Sul, Campanha de Inverno..."
                          className="wp-card-input"
                          style={{ padding: "0.625rem 0.75rem", fontSize: "0.9rem" }}
                        />
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>Códigos dos Clientes</span>
                        <textarea
                          rows={4}
                          value={pastedClsText}
                          onChange={(e) => setPastedClsText(e.target.value)}
                          placeholder="CL1002, CL1003, CL1004..."
                          className="wp-card-input"
                          style={{ fontFamily: "monospace", fontSize: "0.85rem", background: "#fff", resize: "vertical" }}
                        />
                      </div>

                      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "0.25rem" }}>
                        <button
                          type="button"
                          onClick={handleApplyPastedCls}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            backgroundColor: "#3b82f6",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "8px",
                            padding: "0.625rem 1.25rem",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "background 0.2s"
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#2563eb"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#3b82f6"}
                        >
                          <CheckCircle2 size={16} />
                          Selecionar na Tabela
                        </button>

                        <button
                          type="button"
                          onClick={handleCreateSegmentFromPastedCls}
                          disabled={createSavedSegmentMutation.isPending || !newSegmentName.trim() || !pastedClsText.trim()}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            backgroundColor: "#10b981",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "8px",
                            padding: "0.625rem 1.25rem",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            cursor: (createSavedSegmentMutation.isPending || !newSegmentName.trim() || !pastedClsText.trim()) ? "not-allowed" : "pointer",
                            opacity: (createSavedSegmentMutation.isPending || !newSegmentName.trim() || !pastedClsText.trim()) ? 0.6 : 1,
                            transition: "background 0.2s"
                          }}
                          onMouseEnter={(e) => {
                            if (!createSavedSegmentMutation.isPending && newSegmentName.trim() && pastedClsText.trim()) {
                              e.currentTarget.style.backgroundColor = "#059669";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!createSavedSegmentMutation.isPending && newSegmentName.trim() && pastedClsText.trim()) {
                              e.currentTarget.style.backgroundColor = "#10b981";
                            }
                          }}
                        >
                          {createSavedSegmentMutation.isPending ? (
                            <>
                              <LoaderCircle size={16} className="animate-spin" />
                              Salvando público...
                            </>
                          ) : (
                            <>
                              <Save size={16} />
                              Criar & Salvar Novo Público
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Groups table with custom styling exactly like screenshot */}
                  {groupsQuery.isLoading ? <div className="page-loading">Carregando grupos destinatários...</div> : null}

                  {groupsQuery.data?.items.length ? (
                    <>
                      <div className="table-scroll" style={{ overflowX: "auto", border: "1px solid #e4e4e7", borderRadius: "12px", background: "#fff", marginTop: "1rem" }}>
                      <table className="z-table">
                        <thead>
                          <tr>
                            <th style={{ width: "50px", padding: "1rem 1.5rem" }}>
                              <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={toggleVisibleSelection}
                              />
                            </th>
                            <th style={{ padding: "1rem 1.5rem" }}>REMETENTE (WHATSAPP CANAL)</th>
                            <th style={{ padding: "1rem 0.5rem", width: "40px", textAlign: "center" }}></th>
                            <th style={{ padding: "1rem 1.5rem" }}>DESTINATÁRIO (WHATSAPP & CRM)</th>
                            <th style={{ padding: "1rem 1.5rem" }}>COMPRAS (PEÇAS/MÊS · 12M)</th>
                            <th style={{ padding: "1rem 1.5rem" }}>DISPAROS</th>
                            <th style={{ padding: "1rem 1.5rem" }}>STATUS (SPAM RISK)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedGroups.map((group) => {
                            const isSelected = selectedGroupIds.includes(group.id);

                            // Risk configuration
                            let riskClass = "low";
                            let riskLabel = "Baixo risco";
                            let riskTooltip = "Recomendada: essa interação não oferece riscos de bloqueio.";

                            if (group.isRecentlyBlocked) {
                              riskClass = "critical";
                              riskLabel = "Crítico";
                              riskTooltip = "Alerta: número foi bloqueado ou marcado recentemente. Risco altíssimo de bloqueio total!";
                            } else if (group.lastContactAt) {
                              const diffDays = (nowMs - new Date(group.lastContactAt).getTime()) / (1000 * 60 * 60 * 24);
                              if (diffDays <= 7) {
                                riskClass = "attention";
                                riskLabel = "Atenção";
                                riskTooltip = "Cuidado: interação feita nos últimos 7 dias. Disparos frequentes podem incomodar o cliente.";
                              }
                            }

                            const mappedSenderId = recipientSenderMapping[group.id] || selectedSenderIds[0] || "default";
                            const activeSender = senders.find(s => s.id === mappedSenderId) || senders[0] || {
                              id: "default",
                              name: "Instância Padrão",
                              role: "WhatsApp",
                              avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
                              phone: ""
                            };

                            return (
                              <tr
                                key={group.id}
                                style={{
                                  borderBottom: "1px solid #e4e4e7",
                                  backgroundColor: isSelected ? "rgba(59, 130, 246, 0.01)" : "transparent"
                                }}
                              >
                                <td style={{ padding: "1.25rem 1.5rem" }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleGroupSelection(group.id)}
                                  />
                                </td>
                                <td style={{ padding: "1.25rem 1.5rem" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <img
                                      src={activeSender.avatarUrl}
                                      alt={activeSender.name}
                                      onError={(e) => handleAvatarError(e, activeSender.name)}
                                      style={{ width: "36px", height: "36px", borderRadius: "50%", border: "1px solid rgba(0,0,0,0.06)", objectFit: "cover" }}
                                    />
                                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>
                                        {activeSender.name}
                                      </span>
                                      <span style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 500 }}>
                                        {activeSender.role} {activeSender.phone && `• ${activeSender.phone}`}
                                      </span>
                                      <select
                                        value={mappedSenderId}
                                        onChange={(e) => changeGroupSender(group.id, e.target.value)}
                                        className="ghost-button"
                                        style={{ padding: "2px 6px", fontSize: "0.75rem", border: "1px solid var(--line)", marginTop: "4px", background: "#fff", cursor: "pointer", borderRadius: "6px", width: "fit-content" }}
                                      >
                                        {senders.filter(s => selectedSenderIds.includes(s.id)).map(s => (
                                          <option key={s.id} value={s.id}>
                                            Mapear para {s.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: "1.25rem 0.5rem", textAlign: "center" }}>
                                  <ArrowRight size={16} style={{ color: "#10b981" }} />
                                </td>
                                <td style={{ padding: "1.25rem 1.5rem" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <div
                                      style={{
                                        width: "36px",
                                        height: "36px",
                                        borderRadius: "50%",
                                        background: "linear-gradient(135deg, #10b981, #059669)",
                                        color: "#fff",
                                        display: "grid",
                                        placeItems: "center",
                                        fontWeight: "bold",
                                        fontSize: "0.85rem"
                                      }}
                                    >
                                      {String(group.customerDisplayName || group.sourceName || "G").charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                      <strong style={{ fontSize: "0.9rem", color: "#18181b", fontWeight: 700 }}>
                                        {group.sourceName}
                                      </strong>
                                      <span style={{ fontSize: "0.75rem", color: "#71717a", fontFamily: "monospace" }}>
                                        {group.jid}
                                      </span>
                                      
                                      <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px" }}>
                                        <span style={{ fontSize: "0.78rem", color: "#475569", fontWeight: 600 }}>
                                          👤 {group.customerDisplayName || "Sem cliente mapeado"}
                                        </span>
                                        {group.customerCode && (
                                          <span style={{ fontSize: "0.72rem", background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", color: "#475569", fontWeight: 700 }}>
                                            {group.customerCode}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: "1.25rem 1.5rem" }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <PurchaseSparkline
                                      trend={group.purchaseTrend}
                                      emptyHint={classificationLabel(group.classification)}
                                    />
                                    <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                                      Últ. contato: <strong style={{ color: "#64748b" }}>{group.lastContactAt ? formatDateTime(group.lastContactAt) : "Sem registro"}</strong>
                                    </span>
                                  </div>
                                </td>
                                <td style={{ padding: "1.25rem 1.5rem" }}>
                                  <span style={{ fontSize: "0.82rem", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: "6px", color: "#166534", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                    🚀 {group.sentCampaignsCount ?? 0} {group.sentCampaignsCount === 1 ? 'disparo' : 'disparos'}
                                  </span>
                                </td>
                                <td style={{ padding: "1.25rem 1.5rem", position: "relative" }}>
                                  <span
                                    className={`wp-risk-badge ${riskClass}`}
                                    style={{ cursor: "help", display: "inline-block" }}
                                    onMouseEnter={(e) => {
                                      setHoveredGroupId(group.id);
                                      setTooltipPosition({ x: e.clientX - 100, y: e.clientY - 65 });
                                    }}
                                    onMouseLeave={() => setHoveredGroupId(null)}
                                  >
                                    {riskLabel}
                                  </span>
                                  {hoveredGroupId === group.id && (
                                    <div
                                      className="wp-tooltip-box"
                                      style={{
                                        position: "fixed",
                                        left: `${tooltipPosition.x}px`,
                                        top: `${tooltipPosition.y}px`,
                                        zIndex: 1000
                                      }}
                                    >
                                      {riskTooltip}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Premium Client-Side Pagination Control Bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", background: "#f8fafc", padding: "0.75rem 1.25rem", borderRadius: "12px", border: "1px solid #e4e4e7" }}>
                      <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 500 }}>
                        Mostrando <strong>{filteredGroups.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(filteredGroups.length, currentPage * itemsPerPage)}</strong> de <strong>{formatNumber(filteredGroups.length)}</strong> destinatários
                      </span>
                      
                      {totalPages > 1 && (
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "0.4rem 0.8rem",
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              borderRadius: "6px",
                              border: "1px solid #e4e4e7",
                              backgroundColor: "#ffffff",
                              color: currentPage === 1 ? "#a1a1aa" : "#3f3f46",
                              cursor: currentPage === 1 ? "not-allowed" : "pointer",
                              transition: "all 0.2s"
                            }}
                          >
                            <ChevronLeft size={16} />
                            Anterior
                          </button>
                          
                          <span style={{ fontSize: "0.82rem", color: "#475569", fontWeight: 600, padding: "0 0.5rem" }}>
                            Página {currentPage} de {totalPages}
                          </span>
                          
                          <button
                            type="button"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "0.4rem 0.8rem",
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              borderRadius: "6px",
                              border: "1px solid #e4e4e7",
                              backgroundColor: "#ffffff",
                              color: currentPage === totalPages ? "#a1a1aa" : "#3f3f46",
                              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                              transition: "all 0.2s"
                            }}
                          >
                            Próximo
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                    <div className="empty-panel" style={{ padding: "3rem 1rem" }}>
                      <div className="empty-state">
                        Nenhum destinatário encontrado com os filtros atuais.
                      </div>
                    </div>
                  )}
                </article>
              )}

              {/* STEP 4: MENSAGEM */}
              {currentStep === 4 && (
                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <h3>Conteúdo do Envio</h3>
                      <p className="panel-subcopy">Escolha ou crie a mensagem e confira o visual no simulador do smartphone.</p>
                    </div>
                  </div>

                  <div className="whatsapp-compose-editor-grid" style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem" }}>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      <label>
                        Template de mensagem
                        <select
                          value={selectedTemplateId}
                          onChange={(event) => setSelectedTemplateId(event.target.value)}
                          className="wp-search-input"
                          style={{ paddingLeft: "12px", background: "#fff" }}
                        >
                          <option value="">Mensagem livre</option>
                          {(templatesQuery.data ?? []).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.title}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)" }}>Tipo de envio:</span>
                        <button
                          type="button"
                          className={`ghost-button${campaignMessageType === "TEXT" ? " active" : ""}`}
                          style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, background: campaignMessageType === "TEXT" ? "var(--accent)" : "var(--bg-soft)", color: campaignMessageType === "TEXT" ? "#fff" : "var(--muted)", border: "1px solid var(--line)" }}
                          onClick={() => setCampaignMessageType("TEXT")}
                        >
                          Texto
                        </button>
                        {selectedSenderProvider === "UAZAPI" ? (
                          <button
                            type="button"
                            className={`ghost-button${campaignMessageType === "CAROUSEL" ? " active" : ""}`}
                            style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, background: campaignMessageType === "CAROUSEL" ? "var(--accent)" : "var(--bg-soft)", color: campaignMessageType === "CAROUSEL" ? "#fff" : "var(--muted)", border: "1px solid var(--line)" }}
                            onClick={() => setCampaignMessageType("CAROUSEL")}
                          >
                            Carrossel
                          </button>
                        ) : null}
                        {selectedSenderProvider === "UAZAPI" ? (
                          <button
                            type="button"
                            className={`ghost-button${campaignMessageType === "MENU" ? " active" : ""}`}
                            style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, background: campaignMessageType === "MENU" ? "var(--accent)" : "var(--bg-soft)", color: campaignMessageType === "MENU" ? "#fff" : "var(--muted)", border: "1px solid var(--line)" }}
                            onClick={() => setCampaignMessageType("MENU")}
                          >
                            Menu interativo
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={`ghost-button${campaignMessageType === "VIDEO" ? " active" : ""}`}
                          style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, background: campaignMessageType === "VIDEO" ? "var(--accent)" : "var(--bg-soft)", color: campaignMessageType === "VIDEO" ? "#fff" : "var(--muted)", border: "1px solid var(--line)" }}
                          onClick={() => setCampaignMessageType("VIDEO")}
                        >
                          Vídeo
                        </button>
                      </div>

                      <label className="whatsapp-message-field">
                        <span>Texto da Mensagem{campaignMessageType === "CAROUSEL" ? " (acompanha o carrossel)" : campaignMessageType === "VIDEO" ? " (legenda do vídeo)" : campaignMessageType === "MENU" ? " (texto principal do menu)" : " (Versão A)"}</span>
                        <textarea
                          rows={campaignMessageType === "CAROUSEL" || campaignMessageType === "VIDEO" || campaignMessageType === "MENU" ? 4 : 8}
                          value={messageText}
                          onChange={(event) => setMessageText(event.target.value)}
                          placeholder="Digite a mensagem principal que será enviada aos clientes..."
                        />
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "6px", alignSelf: "flex-start", padding: "3px 10px", borderRadius: "999px", background: "#eff6ff", border: "1px solid #dbeafe", fontSize: "0.72rem", color: "#1d4ed8", fontWeight: 600 }}>
                          <Sparkles size={12} />
                          Use <code style={{ background: "#dbeafe", padding: "0 4px", borderRadius: "4px" }}>{"{nome}"}</code> para o nome do cliente
                        </span>
                      </label>

                      <div style={{ borderRadius: "12px", border: `1px solid ${autoReplyEnabled ? "#a7f3d0" : "var(--line)"}`, background: "#fff", overflow: "hidden", transition: "border-color 0.2s" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px 16px", background: autoReplyEnabled ? "rgba(16,185,129,0.07)" : "var(--bg-soft)" }}>
                          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "linear-gradient(135deg, #10b981, #047857)", display: "grid", placeItems: "center", flexShrink: 0, boxShadow: "0 2px 6px rgba(16,185,129,0.3)" }}>
                            <MessageCircle size={19} color="#fff" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a" }}>Resposta automática</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "2px", lineHeight: 1.4 }}>
                              Quando o cliente responder ao disparo (mensagem, mídia ou clique no menu), o sistema responde na hora — só uma vez por cliente.
                            </div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={autoReplyEnabled}
                            onClick={() => setAutoReplyEnabled((value) => !value)}
                            style={{ position: "relative", width: "44px", height: "24px", borderRadius: "999px", border: "none", cursor: "pointer", flexShrink: 0, padding: 0, marginTop: "2px", background: autoReplyEnabled ? "#10b981" : "#cbd5e1", transition: "background 0.2s" }}
                          >
                            <span style={{ position: "absolute", top: "2px", left: autoReplyEnabled ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
                          </button>
                        </div>
                        {autoReplyEnabled && (
                          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--line)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155" }}>Mensagem que será enviada</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px", borderRadius: "999px", background: "#ecfdf5", border: "1px solid #a7f3d0", fontSize: "0.72rem", color: "#047857", fontWeight: 600 }}>
                                <Sparkles size={12} />
                                Use <code style={{ background: "#d1fae5", padding: "0 4px", borderRadius: "4px" }}>{"{nome}"}</code> aqui também
                              </span>
                            </div>
                            <textarea
                              rows={4}
                              value={autoReplyText}
                              onChange={(event) => setAutoReplyText(event.target.value)}
                              placeholder="Ex: Oi {nome}! Que bom que respondeu 😊 Já vou te passar todos os detalhes..."
                              style={{ width: "100%", resize: "vertical", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--line)", fontFamily: "inherit", fontSize: "0.88rem", lineHeight: 1.45, color: "#1a1a1a", outline: "none" }}
                            />
                          </div>
                        )}
                      </div>

                      {campaignMessageType === "VIDEO" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem", background: "var(--bg-soft)", borderRadius: "12px", border: "1px solid var(--line)" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a" }}>Arquivo de Vídeo</span>
                          
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)" }}>URL do Vídeo MP4 ou Selecionar Arquivo:</label>
                            
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <input
                                type="text"
                                className="wp-search-input"
                                style={{ flex: 1, background: "#fff" }}
                                placeholder={`Insira uma URL .mp4 ou selecione um MP4 até ${WHATSAPP_VIDEO_MAX_FILE_SIZE_LABEL}`}
                                value={videoInputDisplayValue}
                                onChange={(e) => {
                                  setVideoUrl(e.target.value);
                                  setVideoFileName("");
                                  setVideoFileSize(null);
                                  setVideoOrientation("UNKNOWN");
                                }}
                                readOnly={isLocalVideoFile}
                                disabled={uploadingVideo}
                              />
                              
                              <label
                                className="ghost-button"
                                style={{
                                  padding: "8px 16px",
                                  borderRadius: "8px",
                                  fontSize: "0.82rem",
                                  fontWeight: 650,
                                  background: uploadingVideo ? "#e2e8f0" : "#3b82f6",
                                  color: uploadingVideo ? "#94a3b8" : "#fff",
                                  border: "1px solid var(--line)",
                                  cursor: uploadingVideo ? "not-allowed" : "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px"
                                }}
                              >
                                {uploadingVideo ? (
                                  <>
                                    <LoaderCircle className="animate-spin" size={16} />
                                    Processando...
                                  </>
                                ) : (
                                  <>
                                    <Paperclip size={16} />
                                    Selecionar Arquivo
                                  </>
                                )}
                                <input
                                  type="file"
                                  accept="video/mp4,.mp4"
                                  style={{ display: "none" }}
                                  disabled={uploadingVideo}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    
                                    const validationError = validateDisparadorVideoFile(file);
                                    if (validationError) {
                                      alert(validationError);
                                      e.currentTarget.value = "";
                                      return;
                                    }
                                    
                                    setUploadingVideo(true);
                                    try {
                                      const reader = new FileReader();
                                      reader.onload = async (event) => {
                                        const base64 = event.target?.result as string;
                                        setVideoFileName(file.name);
                                        setVideoFileSize(file.size);
                                        setVideoOrientation("UNKNOWN");
                                        try {
                                          // Hospeda o vídeo e usa a URL — evita o timeout/Bad Request
                                          // que o base64 inline causa no disparo.
                                          const { url } = await api.uploadCampaignVideo(token!, {
                                            fileBase64: base64,
                                            fileName: file.name,
                                          });
                                          setVideoUrl(url);
                                        } catch (uploadErr) {
                                          // Se o hosting falhar, cai no base64 (comportamento antigo).
                                          console.warn("Upload de vídeo para o backend falhou, usando base64 inline:", uploadErr);
                                          setVideoUrl(base64);
                                        } finally {
                                          setUploadingVideo(false);
                                        }
                                      };
                                      reader.onerror = () => {
                                        alert("Erro ao ler arquivo de vídeo.");
                                        setUploadingVideo(false);
                                      };
                                      reader.readAsDataURL(file);
                                    } catch (err) {
                                      console.error(err);
                                      alert("Erro ao processar vídeo.");
                                      setUploadingVideo(false);
                                    }
                                  }}
                                />
                              </label>
                            </div>
                            
                            {videoUrl && (
                              <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.5rem", padding: "0.75rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontSize: "0.78rem", color: "#64748b", wordBreak: "break-word", display: "flex", alignItems: "center", gap: "6px" }}>
                                    <Film size={14} />
                                    {isLocalVideoFile ? `MP4 carregado: ${videoDisplayLabel}` : videoDisplayLabel}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVideoUrl("");
                                      setVideoFileName("");
                                      setVideoFileSize(null);
                                      setVideoOrientation("UNKNOWN");
                                    }}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      color: "#ef4444",
                                      fontSize: "0.78rem",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px"
                                    }}
                                  >
                                    <Trash2 size={14} /> Remover
                                  </button>
                                </div>
                                {videoUrl.startsWith("data:") || videoUrl.match(/\.mp4(?:[?#].*)?$/i) || videoUrl.includes("http") ? (
                                  <div style={videoStageStyle}>
                                    <video
                                      src={videoUrl}
                                      controls
                                      preload="metadata"
                                      onLoadedMetadata={handleVideoMetadata}
                                      style={videoElementStyle}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {campaignMessageType === "MENU" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem", background: "var(--bg-soft)", borderRadius: "12px", border: "1px solid var(--line)" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a" }}>Menu Interativo</span>

                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)" }}>Formato:</span>
                            {([
                              { value: "button", label: "Botões" },
                              { value: "list", label: "Lista" },
                              { value: "poll", label: "Enquete" },
                            ] as { value: WhatsappMenuType; label: string }[]).map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`ghost-button${menuType === option.value ? " active" : ""}`}
                                style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, background: menuType === option.value ? "var(--accent)" : "#fff", color: menuType === option.value ? "#fff" : "var(--muted)", border: "1px solid var(--line)" }}
                                onClick={() => setMenuType(option.value)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)" }}>
                              Opções{menuType === "list" ? " (use [Título] para criar seções e Texto|id|descrição para detalhes)" : ""}
                            </span>
                            {menuChoices.map((choice, choiceIdx) => (
                              <div key={choiceIdx} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                <input
                                  type="text"
                                  className="wp-search-input"
                                  style={{ flex: 1, background: "#fff", paddingLeft: "12px" }}
                                  placeholder={menuType === "list" ? `Opção ${choiceIdx + 1} (ex: [Seção] ou Texto|id|descrição)` : `Opção ${choiceIdx + 1}`}
                                  value={choice}
                                  onChange={(event) => {
                                    const updated = [...menuChoices];
                                    updated[choiceIdx] = event.target.value;
                                    setMenuChoices(updated);
                                  }}
                                />
                                {menuChoices.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setMenuChoices(menuChoices.filter((_, i) => i !== choiceIdx))}
                                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center" }}
                                    title="Remover opção"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              type="button"
                              className="ghost-button"
                              style={{ padding: "4px 10px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px", alignSelf: "flex-start" }}
                              onClick={() => setMenuChoices((prev) => [...prev, ""])}
                            >
                              <PlusCircle size={14} /> Adicionar opção
                            </button>
                          </div>

                          {menuType !== "poll" && (
                            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)" }}>
                              Texto do rodapé (opcional)
                              <input
                                type="text"
                                className="wp-search-input"
                                style={{ background: "#fff", paddingLeft: "12px" }}
                                placeholder="Ex: Menu de serviços"
                                value={menuFooterText}
                                onChange={(event) => setMenuFooterText(event.target.value)}
                              />
                            </label>
                          )}

                          {menuType === "list" && (
                            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)" }}>
                              Texto do botão da lista
                              <input
                                type="text"
                                className="wp-search-input"
                                style={{ background: "#fff", paddingLeft: "12px" }}
                                placeholder="Ex: Ver opções"
                                value={menuListButton}
                                onChange={(event) => setMenuListButton(event.target.value)}
                              />
                            </label>
                          )}

                          {menuType === "poll" && (
                            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)" }}>
                              Máximo de opções selecionáveis
                              <input
                                type="number"
                                min={1}
                                max={Math.max(1, menuChoicesCount)}
                                className="wp-search-input"
                                style={{ background: "#fff", paddingLeft: "12px", maxWidth: "120px" }}
                                value={menuSelectableCount}
                                onChange={(event) => setMenuSelectableCount(Math.max(1, Number(event.target.value) || 1))}
                              />
                            </label>
                          )}

                          {menuType === "button" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)" }}>
                              <span>Imagem do cabeçalho (opcional)</span>

                              <label style={{ cursor: uploadingMenuImage ? "not-allowed" : "pointer" }}>
                                <input
                                  type="file"
                                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                                  style={{ display: "none" }}
                                  disabled={uploadingMenuImage}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const maxSize = 10 * 1024 * 1024; // 10MB
                                    if (file.size > maxSize) {
                                      alert(`Arquivo muito grande! Tamanho máximo: 10MB. Seu arquivo: ${formatFileSize(file.size)}`);
                                      return;
                                    }
                                    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
                                    if (!validTypes.includes(file.type)) {
                                      alert("Tipo de arquivo inválido! Use: JPG, PNG, GIF ou WEBP");
                                      return;
                                    }
                                    setUploadingMenuImage(true);
                                    try {
                                      const fileBase64 = await new Promise<string>((resolve, reject) => {
                                        const reader = new FileReader();
                                        reader.onload = () => resolve(reader.result as string);
                                        reader.onerror = () => reject(new Error("read error"));
                                        reader.readAsDataURL(file);
                                      });
                                      const { url } = await api.uploadCampaignImage(token!, { fileBase64, fileName: file.name });
                                      setMenuImageButton(url);
                                    } catch (uploadErr) {
                                      console.error("Upload da imagem do menu falhou:", uploadErr);
                                      alert("Erro ao enviar a imagem. Tente novamente.");
                                    } finally {
                                      setUploadingMenuImage(false);
                                      e.target.value = "";
                                    }
                                  }}
                                />
                                <div style={{
                                  padding: "10px 14px",
                                  background: uploadingMenuImage ? "#f0fdf4" : "#f8fafc",
                                  border: uploadingMenuImage ? "2px solid #10b981" : "2px dashed #cbd5e1",
                                  borderRadius: "8px",
                                  textAlign: "center",
                                  fontSize: "0.8rem",
                                  fontWeight: 600,
                                  color: uploadingMenuImage ? "#10b981" : "#475569",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "6px",
                                }}>
                                  {uploadingMenuImage ? (
                                    <><LoaderCircle size={14} className="spin" /> Enviando...</>
                                  ) : (
                                    <>📁 Escolher do computador</>
                                  )}
                                </div>
                              </label>

                              {menuImageButton && (
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#fff", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--line)" }}>
                                  <img
                                    src={menuImageButton}
                                    alt="Prévia"
                                    style={{ width: "40px", height: "40px", borderRadius: "6px", objectFit: "cover" }}
                                  />
                                  <span style={{ flex: 1, fontSize: "0.72rem", color: "#64748b", fontWeight: 500, wordBreak: "break-all" }}>
                                    {menuImageButton.startsWith("data:") ? "Imagem carregada" : menuImageButton}
                                  </span>
                                  <button
                                    type="button"
                                    className="ghost-button danger"
                                    style={{ padding: "2px 8px", fontSize: "0.72rem" }}
                                    onClick={() => setMenuImageButton("")}
                                  >
                                    <Trash2 size={12} /> Remover
                                  </button>
                                </div>
                              )}

                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600 }}>OU</span>
                                <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                              </div>

                              <input
                                type="text"
                                className="wp-search-input"
                                style={{ background: "#fff", paddingLeft: "12px" }}
                                placeholder="https://exemplo.com/imagem.jpg"
                                value={menuImageButton.startsWith("data:") ? "" : menuImageButton}
                                disabled={uploadingMenuImage}
                                onChange={(event) => setMenuImageButton(event.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {campaignMessageType === "CAROUSEL" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem", background: "var(--bg-soft)", borderRadius: "12px", border: "1px solid var(--line)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a" }}>Slides do Carrossel</span>
                            <button
                              type="button"
                              className="ghost-button"
                              style={{ padding: "4px 10px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px" }}
                              onClick={() => setCarouselSlides(prev => [...prev, { text: "", image: "", buttons: [{ id: `btn${Date.now()}`, text: "", type: "url" }] }])}
                            >
                              <PlusCircle size={14} /> Adicionar Slide
                            </button>
                          </div>
                          {carouselSlides.map((slide, slideIdx) => (
                            <div key={slideIdx} style={{ padding: "1rem", background: "#fff", borderRadius: "10px", border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--accent)" }}>Slide {slideIdx + 1}</span>
                                {carouselSlides.length > 1 && (
                                  <button
                                    type="button"
                                    className="ghost-button danger"
                                    style={{ padding: "2px 8px", fontSize: "0.72rem" }}
                                    onClick={() => setCarouselSlides(prev => prev.filter((_, i) => i !== slideIdx))}
                                  >
                                    <Trash2 size={12} /> Remover
                                  </button>
                                )}
                              </div>
                              <label style={{ fontSize: "0.82rem" }}>
                                Texto do slide
                                <textarea
                                  rows={2}
                                  value={slide.text}
                                  onChange={(e) => {
                                    const updated = [...carouselSlides];
                                    updated[slideIdx] = { ...slide, text: e.target.value };
                                    setCarouselSlides(updated);
                                  }}
                                  placeholder="Texto que aparece neste slide..."
                                  style={{ marginTop: "4px" }}
                                />
                              </label>
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#0f172a" }}>Imagem</span>
                                  <span style={{ 
                                    fontSize: "0.7rem", 
                                    color: "#10b981", 
                                    background: "#f0fdf4", 
                                    padding: "2px 8px", 
                                    borderRadius: "6px",
                                    fontWeight: 600,
                                    border: "1px solid #bbf7d0"
                                  }}>
                                    📐 Ideal: 800x600px (4:3)
                                  </span>
                                </div>
                                
                                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                  <label style={{ flex: 1, cursor: "pointer" }}>
                                    <input
                                      type="file"
                                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                                      style={{ display: "none" }}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          // Validate file size (max 5MB)
                                          const maxSize = 5 * 1024 * 1024; // 5MB
                                          if (file.size > maxSize) {
                                            alert(`Arquivo muito grande! Tamanho máximo: 5MB. Seu arquivo: ${formatFileSize(file.size)}`);
                                            return;
                                          }

                                          // Validate file type
                                          const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                                          if (!validTypes.includes(file.type)) {
                                            alert('Tipo de arquivo inválido! Use: JPG, PNG, GIF ou WEBP');
                                            return;
                                          }

                                          setUploadingSlideIndex(slideIdx);
                                          const reader = new FileReader();
                                          reader.onload = (event) => {
                                            const updated = [...carouselSlides];
                                            updated[slideIdx] = { ...slide, image: event.target?.result as string };
                                            setCarouselSlides(updated);
                                            setUploadingSlideIndex(null);
                                          };
                                          reader.onerror = () => {
                                            alert('Erro ao carregar a imagem. Tente novamente.');
                                            setUploadingSlideIndex(null);
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      }}
                                    />
                                    <div style={{ 
                                      padding: "10px 14px", 
                                      background: uploadingSlideIndex === slideIdx ? "#f0fdf4" : "#f8fafc", 
                                      border: uploadingSlideIndex === slideIdx ? "2px solid #10b981" : "2px dashed #cbd5e1", 
                                      borderRadius: "8px", 
                                      textAlign: "center",
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                      color: uploadingSlideIndex === slideIdx ? "#10b981" : "#475569",
                                      transition: "all 0.2s",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      gap: "6px"
                                    }}
                                    onMouseEnter={(e) => {
                                      if (uploadingSlideIndex !== slideIdx) {
                                        e.currentTarget.style.background = "#f1f5f9";
                                        e.currentTarget.style.borderColor = "#94a3b8";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (uploadingSlideIndex !== slideIdx) {
                                        e.currentTarget.style.background = "#f8fafc";
                                        e.currentTarget.style.borderColor = "#cbd5e1";
                                      }
                                    }}
                                    >
                                      {uploadingSlideIndex === slideIdx ? (
                                        <>
                                          <LoaderCircle size={14} className="spin" />
                                          Carregando...
                                        </>
                                      ) : (
                                        <>
                                          📁 Escolher do computador
                                        </>
                                      )}
                                    </div>
                                  </label>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                                  <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600 }}>OU</span>
                                  <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                                </div>

                                <input
                                  type="url"
                                  value={slide.image.startsWith('data:') ? '' : slide.image}
                                  onChange={(e) => {
                                    const updated = [...carouselSlides];
                                    updated[slideIdx] = { ...slide, image: e.target.value };
                                    setCarouselSlides(updated);
                                  }}
                                  placeholder="https://exemplo.com/imagem.jpg"
                                  style={{ fontSize: "0.82rem" }}
                                  disabled={uploadingSlideIndex === slideIdx}
                                />
                                
                                <div style={{ 
                                  fontSize: "0.7rem", 
                                  color: "#64748b", 
                                  background: "#f8fafc",
                                  padding: "8px 10px",
                                  borderRadius: "6px",
                                  border: "1px solid #e2e8f0",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "4px"
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <Info size={12} />
                                    <strong>Dimensões recomendadas:</strong>
                                  </div>
                                  <div style={{ paddingLeft: "16px" }}>
                                    • <strong>Ideal:</strong> 800x600px (proporção 4:3)<br/>
                                    • <strong>Mínimo:</strong> 400x300px<br/>
                                    • <strong>Máximo:</strong> 1920x1440px<br/>
                                    • <strong>Tamanho:</strong> até 5MB
                                  </div>
                                </div>
                                
                                {slide.image && !slide.image.startsWith('data:') && (
                                  <div style={{ fontSize: "0.7rem", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                                    <Info size={12} />
                                    URL externa
                                  </div>
                                )}
                                
                                {slide.image && slide.image.startsWith('data:') && (
                                  <div style={{ fontSize: "0.7rem", color: "#10b981", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                                    <CheckCircle2 size={12} />
                                    Imagem carregada ({formatFileSize(slide.image.length * 0.75)})
                                  </div>
                                )}
                              </div>

                              {slide.image && (
                                <div style={{ position: "relative" }}>
                                  <img
                                    src={slide.image}
                                    alt={`Preview slide ${slideIdx + 1}`}
                                    style={{ 
                                      width: "100%",
                                      maxHeight: "200px", 
                                      objectFit: "cover", 
                                      borderRadius: "10px", 
                                      border: "3px solid #10b981",
                                      boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)"
                                    }}
                                    onError={(e) => { 
                                      (e.target as HTMLImageElement).style.display = "none";
                                      alert('Erro ao carregar a imagem. Verifique a URL ou tente fazer upload novamente.');
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...carouselSlides];
                                      updated[slideIdx] = { ...slide, image: "" };
                                      setCarouselSlides(updated);
                                    }}
                                    style={{
                                      position: "absolute",
                                      top: "10px",
                                      right: "10px",
                                      background: "rgba(239, 68, 68, 0.95)",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: "8px",
                                      padding: "6px 10px",
                                      fontSize: "0.75rem",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                                      transition: "all 0.2s"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = "rgba(220, 38, 38, 0.95)";
                                      e.currentTarget.style.transform = "scale(1.05)";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = "rgba(239, 68, 68, 0.95)";
                                      e.currentTarget.style.transform = "scale(1)";
                                    }}
                                  >
                                    <Trash2 size={12} /> Remover
                                  </button>
                                </div>
                              )}
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted)" }}>Botões</span>
                                {slide.buttons.map((btn, btnIdx) => (
                                  <div key={btn.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                    <input
                                      value={btn.text}
                                      onChange={(e) => {
                                        const updated = [...carouselSlides];
                                        const updatedBtns = [...slide.buttons];
                                        updatedBtns[btnIdx] = { ...btn, text: e.target.value };
                                        updated[slideIdx] = { ...slide, buttons: updatedBtns };
                                        setCarouselSlides(updated);
                                      }}
                                      placeholder="Texto do botão"
                                      style={{ flex: 1, fontSize: "0.82rem" }}
                                    />
                                    {slide.buttons.length > 1 && (
                                      <button
                                        type="button"
                                        className="ghost-button danger"
                                        style={{ padding: "2px 6px", fontSize: "0.7rem" }}
                                        onClick={() => {
                                          const updated = [...carouselSlides];
                                          updated[slideIdx] = { ...slide, buttons: slide.buttons.filter((_, i) => i !== btnIdx) };
                                          setCarouselSlides(updated);
                                        }}
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className="ghost-button"
                                  style={{ padding: "3px 8px", fontSize: "0.72rem", alignSelf: "flex-start" }}
                                  onClick={() => {
                                    const updated = [...carouselSlides];
                                    updated[slideIdx] = { ...slide, buttons: [...slide.buttons, { id: `btn${Date.now()}`, text: "", type: "url" }] };
                                    setCarouselSlides(updated);
                                  }}
                                >
                                  + Botão
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {abTestActive ? (
                        <div className="wp-ab-split" style={{
                          background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                          border: "2px solid #10b981",
                          borderRadius: "12px",
                          padding: "1rem"
                        }}>
                          <div className="wp-ab-split-header" style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "0.75rem"
                          }}>
                            <span style={{ fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: "6px", fontSize: "0.9rem" }}>
                              <Sparkles size={16} />
                              Mensagem Alternativa (Versão B)
                            </span>
                            <button
                              type="button"
                              className="ghost-button danger"
                              style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                              onClick={() => {
                                setAbTestActive(false);
                                setAbMessageText("");
                              }}
                            >
                              <X size={14} /> Desativar A/B
                            </button>
                          </div>
                          
                          <label className="whatsapp-message-field" style={{ marginTop: "0" }}>
                            <span style={{ fontSize: "0.82rem", color: "#059669" }}>Texto da Versão B</span>
                            <textarea
                              rows={6}
                              value={abMessageText}
                              onChange={(e) => setAbMessageText(e.target.value)}
                              placeholder="Digite a variação de texto para o teste A/B..."
                              style={{ borderColor: "#10b981" }}
                            />
                          </label>
                          
                          <div style={{
                            marginTop: "0.75rem",
                            padding: "0.75rem",
                            background: "rgba(16, 185, 129, 0.1)",
                            borderRadius: "8px",
                            fontSize: "0.75rem",
                            color: "#059669",
                            display: "flex",
                            alignItems: "start",
                            gap: "8px"
                          }}>
                            <Info size={14} style={{ flexShrink: 0, marginTop: "2px" }} />
                            <div>
                              <strong>Teste A/B ativo:</strong> Metade dos destinatários receberá a Versão A e a outra metade receberá a Versão B. Isso ajuda a reduzir o risco de bloqueios por mensagens repetitivas.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAbTestActive(true)}
                          style={{
                            width: "100%",
                            padding: "1rem",
                            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                            border: "2px dashed #cbd5e1",
                            borderRadius: "12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            color: "#475569",
                            cursor: "pointer",
                            transition: "all 0.2s"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)";
                            e.currentTarget.style.borderColor = "#10b981";
                            e.currentTarget.style.color = "#10b981";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)";
                            e.currentTarget.style.borderColor = "#cbd5e1";
                            e.currentTarget.style.color = "#475569";
                          }}
                        >
                          <Sparkles size={18} />
                          Ativar Teste A/B (Recomendado para evitar bloqueios)
                        </button>
                      )}
                    </div>

                    <div>
                      <div className="wp-preview-device" style={{
                        width: "280px",
                        background: "#1f1f1f",
                        borderRadius: "32px",
                        padding: "12px",
                        boxShadow: "0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)",
                        position: "sticky",
                        top: "20px"
                      }}>
                        <div className="wp-preview-screen" style={{
                          background: "#e5ddd5",
                          borderRadius: "20px",
                          overflow: "hidden",
                          height: "560px",
                          display: "flex",
                          flexDirection: "column"
                        }}>
                          <div className="wp-preview-top-bar" style={{
                            background: "#075e54",
                            color: "#fff",
                            padding: "12px 16px",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                          }}>
                            <div style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              background: "#25d366",
                              display: "grid",
                              placeItems: "center",
                              fontSize: "0.85rem",
                              fontWeight: "bold"
                            }}>
                              {(user?.name || "C").charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>Cliente</div>
                              <div style={{ fontSize: "0.7rem", opacity: 0.8 }}>online</div>
                            </div>
                            <Smartphone size={16} />
                          </div>
                          
                          <div className="wp-preview-chat-area" style={{
                            flex: 1,
                            padding: "16px",
                            overflowY: "auto",
                            backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h100v100H0z\" fill=\"%23e5ddd5\"/%3E%3Cpath d=\"M20 20l5 5-5 5m20-10l5 5-5 5\" stroke=\"%23d1c7b8\" stroke-width=\"0.5\" fill=\"none\" opacity=\"0.3\"/%3E%3C/svg%3E')",
                            backgroundSize: "100px 100px"
                          }}>
                            {campaignMessageType === "VIDEO" ? (
                              <div className="wp-preview-bubble" style={{
                                background: "#d9fdd3",
                                padding: "4px",
                                borderRadius: "8px",
                                maxWidth: "88%",
                                marginLeft: "auto",
                                marginBottom: "8px",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                position: "relative",
                                overflow: "hidden",
                                color: "#1a1a1a"
                              }}>
                                {videoUrl ? (
                                  <div style={{
                                    width: isVerticalVideoPreview ? "min(100%, 150px)" : "100%",
                                    aspectRatio: isVerticalVideoPreview ? "9 / 16" : "16 / 9",
                                    marginLeft: isVerticalVideoPreview ? "auto" : undefined,
                                    borderRadius: "7px",
                                    overflow: "hidden",
                                    backgroundColor: "#111827",
                                  }}>
                                    <video
                                      src={videoUrl}
                                      controls
                                      preload="metadata"
                                      onLoadedMetadata={handleVideoMetadata}
                                      style={phoneVideoStyle}
                                    />
                                  </div>
                                ) : (
                                  <div style={{ width: "150px", aspectRatio: "9 / 16", marginLeft: "auto", borderRadius: "7px", backgroundColor: "#111827", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: "0.76rem", gap: "6px" }}>
                                    <Film size={20} />
                                    MP4 não selecionado
                                  </div>
                                )}
                                {messageText && (
                                  <div style={{ padding: "6px 6px 2px 6px", fontSize: "0.85rem", lineHeight: "1.4", wordWrap: "break-word" }}>
                                    {messageText}
                                  </div>
                                )}
                                <div className="wp-preview-bubble-meta" style={{
                                  fontSize: "0.65rem",
                                  color: "#667781",
                                  textAlign: "right",
                                  marginTop: "4px",
                                  paddingRight: "6px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "flex-end",
                                  gap: "4px"
                                }}>
                                  Agora <CheckCheck size={12} style={{ color: "#53bdeb" }} />
                                </div>
                              </div>
                            ) : campaignMessageType === "MENU" ? (
                              <div style={{ maxWidth: "88%", marginLeft: "auto", marginBottom: "8px" }}>
                                <div className="wp-preview-bubble" style={{
                                  background: "#d9fdd3",
                                  padding: "8px 12px",
                                  borderRadius: "8px 8px 0 0",
                                  boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                  fontSize: "0.85rem",
                                  lineHeight: "1.4",
                                  color: "#1a1a1a",
                                  wordWrap: "break-word"
                                }}>
                                  {menuType === "button" && menuImageButton.trim() && (
                                    <img
                                      src={menuImageButton.trim()}
                                      alt=""
                                      style={{ width: "100%", borderRadius: "6px", marginBottom: "6px", display: "block" }}
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                  )}
                                  {messageText || <span style={{ color: "#94a3b8" }}>Texto principal do menu...</span>}
                                  {menuType !== "poll" && menuFooterText.trim() && (
                                    <div style={{ fontSize: "0.72rem", color: "#667781", marginTop: "4px" }}>{menuFooterText}</div>
                                  )}
                                  <div className="wp-preview-bubble-meta" style={{
                                    fontSize: "0.65rem",
                                    color: "#667781",
                                    textAlign: "right",
                                    marginTop: "4px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "flex-end",
                                    gap: "4px"
                                  }}>
                                    Agora <CheckCheck size={12} style={{ color: "#53bdeb" }} />
                                  </div>
                                </div>
                                {menuType === "list" ? (
                                  <div style={{ background: "#fff", borderRadius: "0 0 8px 8px", padding: "8px 12px", textAlign: "center", fontSize: "0.8rem", fontWeight: 600, color: "#0088cc", borderTop: "1px solid #e0e0e0", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                                    ☰ {menuListButton.trim() || "Ver opções"}
                                  </div>
                                ) : menuType === "poll" ? (
                                  <div style={{ background: "#fff", borderRadius: "0 0 8px 8px", padding: "8px 12px", display: "flex", flexDirection: "column", gap: "6px", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                                    {menuChoices.filter((choice) => choice.trim()).map((choice, i) => (
                                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "#1a1a1a" }}>
                                        <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid #8696a0", flexShrink: 0 }} />
                                        {choice}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    {menuChoices.filter((choice) => choice.trim()).map((choice, i) => (
                                      <div key={i} style={{ background: "#fff", padding: "8px 12px", textAlign: "center", fontSize: "0.8rem", fontWeight: 600, color: "#0088cc", boxShadow: "0 1px 2px rgba(0,0,0,0.1)", borderRadius: i === menuChoices.filter((c) => c.trim()).length - 1 ? "0 0 8px 8px" : "0" }}>
                                        {choice}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : campaignMessageType === "TEXT" ? (
                              <>
                                {messageText && (
                                  <div className="wp-preview-bubble" style={{
                                    background: "#d9fdd3",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    maxWidth: "85%",
                                    marginLeft: "auto",
                                    marginBottom: "8px",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                    position: "relative",
                                    fontSize: "0.85rem",
                                    lineHeight: "1.4",
                                    color: "#1a1a1a",
                                    wordWrap: "break-word"
                                  }}>
                                    {messageText}
                                    <div className="wp-preview-bubble-meta" style={{
                                      fontSize: "0.65rem",
                                      color: "#667781",
                                      textAlign: "right",
                                      marginTop: "4px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "flex-end",
                                      gap: "4px"
                                    }}>
                                      Agora <CheckCheck size={12} style={{ color: "#53bdeb" }} />
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                {messageText && (
                                  <div className="wp-preview-bubble" style={{
                                    background: "#d9fdd3",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    maxWidth: "85%",
                                    marginLeft: "auto",
                                    marginBottom: "8px",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                    fontSize: "0.85rem",
                                    lineHeight: "1.4",
                                    color: "#1a1a1a"
                                  }}>
                                    {messageText}
                                    <div className="wp-preview-bubble-meta" style={{
                                      fontSize: "0.65rem",
                                      color: "#667781",
                                      textAlign: "right",
                                      marginTop: "4px"
                                    }}>
                                      Agora
                                    </div>
                                  </div>
                                )}
                                
                                {carouselSlides.some(s => s.image || s.text) && (
                                  <div style={{ 
                                    display: "flex", 
                                    gap: "8px", 
                                    overflowX: "auto", 
                                    padding: "4px 0",
                                    scrollbarWidth: "thin",
                                    scrollbarColor: "#bbb #e5ddd5"
                                  }}>
                                    {carouselSlides.map((slide, i) => (
                                      <div key={i} style={{ 
                                        minWidth: "180px", 
                                        maxWidth: "200px", 
                                        background: "#fff", 
                                        borderRadius: "12px", 
                                        overflow: "hidden", 
                                        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                                        flexShrink: 0,
                                        border: "1px solid #e0e0e0"
                                      }}>
                                        {slide.image && (
                                          <div style={{ 
                                            position: "relative", 
                                            width: "100%", 
                                            height: "120px",
                                            background: "#f0f0f0",
                                            overflow: "hidden"
                                          }}>
                                            <img 
                                              src={slide.image} 
                                              alt="" 
                                              style={{ 
                                                width: "100%", 
                                                height: "100%", 
                                                objectFit: "cover",
                                                objectPosition: "center"
                                              }} 
                                              onError={(e) => { 
                                                (e.target as HTMLImageElement).style.display = "none"; 
                                              }} 
                                            />
                                          </div>
                                        )}
                                        {slide.text && (
                                          <div style={{ 
                                            padding: "10px 12px", 
                                            fontSize: "0.75rem", 
                                            color: "#1a1a1a", 
                                            lineHeight: 1.4,
                                            minHeight: "60px",
                                            maxHeight: "80px",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis"
                                          }}>
                                            {slide.text.slice(0, 80)}{slide.text.length > 80 ? "..." : ""}
                                          </div>
                                        )}
                                        {slide.buttons.filter(b => b.text).map((btn, bi) => (
                                          <div key={bi} style={{ 
                                            padding: "8px 12px", 
                                            fontSize: "0.75rem", 
                                            color: "#0088cc", 
                                            textAlign: "center", 
                                            borderTop: "1px solid #e0e0e0", 
                                            fontWeight: 600,
                                            background: "#f8f9fa",
                                            cursor: "pointer",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis"
                                          }}>
                                            {btn.text}
                                          </div>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}

                            {abTestActive && abMessageText && (
                              <div className="wp-preview-bubble ab-split" style={{
                                background: "#dcf8c6",
                                padding: "8px 12px",
                                borderRadius: "8px",
                                maxWidth: "85%",
                                marginLeft: "auto",
                                marginTop: "8px",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                fontSize: "0.85rem",
                                lineHeight: "1.4",
                                color: "#1a1a1a",
                                border: "2px dashed #10b981"
                              }}>
                                {abMessageText}
                                <div className="wp-preview-bubble-meta" style={{
                                  fontSize: "0.65rem",
                                  color: "#10b981",
                                  textAlign: "right",
                                  marginTop: "4px",
                                  fontWeight: 600
                                }}>
                                  Variação B
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div style={{
                            background: "#f0f0f0",
                            padding: "8px 12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            borderTop: "1px solid #d0d0d0"
                          }}>
                            <Smile size={20} style={{ color: "#8696a0" }} />
                            <div style={{
                              flex: 1,
                              background: "#fff",
                              borderRadius: "20px",
                              padding: "6px 12px",
                              fontSize: "0.8rem",
                              color: "#8696a0"
                            }}>
                              Mensagem
                            </div>
                            <Paperclip size={20} style={{ color: "#8696a0" }} />
                          </div>
                        </div>
                      </div>
                      <p className="panel-subcopy" style={{ textAlign: "center", marginTop: "12px", fontSize: "0.75rem", color: "#64748b" }}>
                        📱 Simulador em tempo real
                      </p>
                    </div>
                  </div>
                </article>
              )}

              {/* STEP 5: REVISÃO & DISPARO */}
              {currentStep === 5 && (
                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <h3>Revisão da Campanha</h3>
                      <p className="panel-subcopy">Tudo pronto! Verifique se as informações estão corretas antes de lançar.</p>
                    </div>
                  </div>

                  <div className="whatsapp-compose-summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", marginTop: "1rem" }}>
                    <div style={{ background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }}>
                      <span style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Campanha</span>
                      <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{campaignName || "Disparo Geral"}</strong>
                    </div>
                    
                    <div style={{ background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }}>
                      <span style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Destinatários</span>
                      <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{formatNumber(selectedGroupCount)} grupos mapeados</strong>
                      {selectedSavedSegment && (
                        <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted)", marginTop: "2px" }}>Segmento: {selectedSavedSegment.name}</span>
                      )}
                    </div>

                    <div style={{ background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }}>
                      <span style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Mensagem Ativa</span>
                      <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{abTestActive ? "Teste A/B (2 variações)" : "Variação única"}</strong>
                    </div>

                    <div style={{ background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }}>
                      <span style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Anti-spam Cadence</span>
                      <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{minDelaySeconds}s a {maxDelaySeconds}s</strong>
                      <span style={{ display: "block", fontSize: "0.75rem", color: overrideRecentBlock ? "var(--danger)" : "var(--success)", fontWeight: 600, marginTop: "2px" }}>
                        {overrideRecentBlock ? "⚠ Proteção 7-dias inativa" : "✓ Proteção 7-dias ativa"}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: "1.5rem" }}>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", fontWeight: 700 }}>Canais de Disparo Selecionados (Remetentes Reais)</h4>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {senders.filter(s => selectedSenderIds.includes(s.id)).map(s => (
                        <div key={s.id} className="wp-review-sender-pill" style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--bg-soft)", padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--line)" }}>
                          <img src={s.avatarUrl} alt={s.name} className="wp-avatar-sm" onError={(e) => handleAvatarError(e, s.name)} style={{ width: "20px", height: "20px", borderRadius: "50%" }} />
                          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{s.name} ({s.phone})</span>
                          <span className="status-badge status-success" style={{ fontSize: "0.6rem", padding: "0 4px" }}>Ativo</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: "1.5rem" }}>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", fontWeight: 700 }}>Conteúdo das Mensagens</h4>
                    <div style={{ background: "#f8fafc", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.75rem", fontWeight: 600, color: "var(--accent)" }}>
                        <span>VERSÃO A (PRINCIPAL)</span>
                        <span>{messageText.length} caracteres</span>
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: "0.88rem", background: "#fff", border: "1px solid rgba(0,0,0,0.05)", padding: "10px 14px", borderRadius: "8px", color: "var(--text)" }}>
                        {messageText || "Nenhuma mensagem definida."}
                      </div>
                      
                      {abTestActive && (
                        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed var(--line)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.75rem", fontWeight: 600, color: "#10b981" }}>
                            <span>VERSÃO B (A/B SPLIT)</span>
                            <span>{abMessageText.length} caracteres</span>
                          </div>
                          <div style={{ whiteSpace: "pre-wrap", fontSize: "0.88rem", background: "#fff", border: "1px solid rgba(0,0,0,0.05)", padding: "10px 14px", borderRadius: "8px", color: "var(--text)" }}>
                            {abMessageText || "Nenhuma variação definida."}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: "1.5rem", background: "rgba(16, 185, 129, 0.03)", padding: "1.25rem 1.5rem", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.15)" }}>
                    <h4 style={{ margin: "0 0 8px 0", color: "#059669", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }}>
                      <ShieldAlert size={16} />
                      Verificações de Segurança do Disparador
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: "20px", display: "grid", gap: "4px", fontSize: "0.82rem", color: "var(--muted)" }}>
                      <li>Cadência de delay configurada de forma natural para imitar o comportamento de digitação de agentes.</li>
                      <li>Contatos sob alto risco de proteção bloqueados ou sinalizados para evitar bloqueios da conta da empresa.</li>
                      <li>{abTestActive ? "Distribuição A/B ativada! Mensagens divididas reduzem o risco de algoritmos do WhatsApp rastrearem padrões." : "Dica: Considere ativar o teste A/B no passo anterior para reduzir o risco de bloqueios por texto repetitivo."}</li>
                    </ul>
                  </div>

                  {/* TEST MESSAGE SECTION */}
                  <div style={{ 
                    marginTop: "1.5rem", 
                    background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", 
                    padding: "1.5rem", 
                    borderRadius: "16px", 
                    border: "2px solid #3b82f6",
                    boxShadow: "0 4px 12px rgba(59, 130, 246, 0.15)"
                  }}>
                    <div style={{ display: "flex", alignItems: "start", gap: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: "0 0 8px 0", color: "#1e40af", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
                          <Smartphone size={18} />
                          Enviar Mensagem de Teste
                        </h4>
                        <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "#1e40af", lineHeight: 1.5 }}>
                          Antes de disparar para todos os destinatários, envie uma mensagem de teste para verificar se está tudo correto.
                        </p>
                        <div style={{ 
                          background: "rgba(255, 255, 255, 0.7)", 
                          padding: "10px 14px", 
                          borderRadius: "8px",
                          fontSize: "0.82rem",
                          color: "#1e40af",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "12px"
                        }}>
                          <Info size={14} />
                          <div>
                            <strong>Número de teste:</strong> +55 11 91127-9702
                            {campaignMessageType === "CAROUSEL" && (
                              <div style={{ marginTop: "4px", fontSize: "0.75rem" }}>
                                ⚠️ O carrossel será enviado com todas as imagens e botões configurados
                              </div>
                            )}
                            {campaignMessageType === "MENU" && (
                              <div style={{ marginTop: "4px", fontSize: "0.75rem" }}>
                                ⚠️ O menu interativo será enviado com todas as opções configuradas
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => sendTestMessageMutation.mutate()}
                        disabled={sendTestMessageMutation.isPending || !hasMessage}
                        style={{
                          padding: "1rem 1.5rem",
                          background: sendTestMessageMutation.isPending || !hasMessage ? "#94a3b8" : "#3b82f6",
                          color: "#fff",
                          border: "none",
                          borderRadius: "12px",
                          fontSize: "0.9rem",
                          fontWeight: 700,
                          cursor: sendTestMessageMutation.isPending || !hasMessage ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
                          transition: "all 0.2s",
                          whiteSpace: "nowrap"
                        }}
                        onMouseEnter={(e) => {
                          if (!sendTestMessageMutation.isPending && hasMessage) {
                            e.currentTarget.style.background = "#2563eb";
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 6px 16px rgba(59, 130, 246, 0.4)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!sendTestMessageMutation.isPending && hasMessage) {
                            e.currentTarget.style.background = "#3b82f6";
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.3)";
                          }
                        }}
                      >
                        {sendTestMessageMutation.isPending ? (
                          <>
                            <LoaderCircle size={18} className="spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Send size={18} />
                            Enviar Teste
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* AGENDAMENTO */}
                  <div style={{
                    marginTop: "1.5rem",
                    background: "#fff",
                    border: "1px solid var(--line)",
                    borderRadius: "16px",
                    padding: "1.25rem 1.5rem",
                  }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "0.95rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px", color: "#18181b" }}>
                      <Clock3 size={16} />
                      Quando disparar?
                    </h4>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setDispatchMode("NOW")}
                        style={{
                          flex: "1 1 200px",
                          padding: "0.9rem 1rem",
                          borderRadius: "12px",
                          border: dispatchMode === "NOW" ? "2px solid #10b981" : "1px solid var(--line)",
                          background: dispatchMode === "NOW" ? "#ecfdf5" : "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <strong style={{ display: "block", fontSize: "0.9rem", color: dispatchMode === "NOW" ? "#047857" : "#18181b" }}>
                          🚀 Disparar agora
                        </strong>
                        <span style={{ fontSize: "0.78rem", color: "#71717a" }}>Os envios começam imediatamente.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDispatchMode("SCHEDULED")}
                        style={{
                          flex: "1 1 200px",
                          padding: "0.9rem 1rem",
                          borderRadius: "12px",
                          border: dispatchMode === "SCHEDULED" ? "2px solid #6366f1" : "1px solid var(--line)",
                          background: dispatchMode === "SCHEDULED" ? "#eef2ff" : "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <strong style={{ display: "block", fontSize: "0.9rem", color: dispatchMode === "SCHEDULED" ? "#4338ca" : "#18181b" }}>
                          📅 Agendar
                        </strong>
                        <span style={{ fontSize: "0.78rem", color: "#71717a" }}>Escolha o dia e horário do início.</span>
                      </button>
                    </div>
                    {dispatchMode === "SCHEDULED" && (
                      <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                        <input
                          type="datetime-local"
                          value={scheduledStartAtLocal}
                          min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
                          onChange={(event) => setScheduledStartAtLocal(event.target.value)}
                          style={{
                            padding: "0.7rem 0.9rem",
                            borderRadius: "10px",
                            border: "1px solid var(--line)",
                            fontSize: "0.9rem",
                            fontFamily: "inherit",
                          }}
                        />
                        {scheduledStartAtLocal ? (
                          <span style={{ fontSize: "0.82rem", color: "#4338ca", fontWeight: 600 }}>
                            Início agendado para {new Date(scheduledStartAtLocal).toLocaleString("pt-BR")}
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.82rem", color: "#b45309" }}>
                            Escolha data e horário para liberar o botão de agendamento.
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="whatsapp-wizard-nav" style={{ justifyContent: "center", border: "none", marginTop: "1.5rem" }}>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => createCampaignMutation.mutate()}
                      disabled={
                        createCampaignMutation.isPending ||
                        !isReadyToDispatch ||
                        (dispatchMode === "SCHEDULED" && !scheduledStartAtLocal)
                      }
                      style={{ padding: "1rem 2.5rem", fontSize: "1rem" }}
                    >
                      {createCampaignMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <Send size={18} />}
                      {dispatchMode === "SCHEDULED" ? "Agendar campanha" : dispatchButtonLabel}
                    </button>
                  </div>
                </article>
              )}

              {/* NAVIGATION FOOTER FOR WIZARD */}
              <div className="wp-wizard-nav">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setCurrentStep(current => Math.max(1, current - 1))}
                  disabled={currentStep === 1}
                >
                  <ChevronLeft size={16} />
                  Voltar
                </button>

                <span>Etapa {currentStep} de 5</span>

                {currentStep < 5 ? (
                  <button
                    type="button"
                    className="wp-btn-action primary"
                    onClick={() => setCurrentStep(current => Math.min(5, current + 1))}
                  >
                    Avançar
                    <ChevronRight size={16} />
                  </button>
                ) : (
                  <span />
                )}
              </div>

            </div>



          </div>
        </>
      )}

      {/* ── TAB 2: UNIFIED ACCOMPANIMENT & HISTORY DASHBOARD ── */}
      {activeTab === "HISTORY" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Header Row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#18181b", margin: 0 }}>Histórico de Campanhas</h2>
              <p style={{ fontSize: "0.9rem", color: "#71717a", margin: "0.25rem 0 0 0" }}>
                Acompanhe o desempenho e o status dos seus disparos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab("NEW_CAMPAIGN");
                setCurrentStep(1);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "#18181b",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "0.625rem 1.25rem",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#27272a"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#18181b"}
            >
              <Plus size={16} />
              Nova Campanha
            </button>
          </div>

          {/* ── LIVE DISPATCH PANEL ── */}
          {liveCampaign && liveCampaignIsRunning && (() => {
            const progress = liveCampaign.progress;
            const totalR = progress.totalRecipients || 1;
            const completedCount = progress.sentCount + progress.failedCount + progress.blockedRecentCount + progress.skippedCount;
            const overallPct = Math.round((completedCount / totalR) * 100);
            return (
              <div style={{
                background: "#ffffff",
                borderRadius: "12px",
                padding: "1.5rem",
                color: "#18181b",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.02)",
                border: "1px solid #e4e4e7",
                marginBottom: "1.5rem",
              }}>
                {/* Panel Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "10px",
                      background: "#ecfdf5",
                      display: "grid", placeItems: "center",
                    }}>
                      <Send size={18} style={{ color: "#10b981" }} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#18181b" }}>
                        {liveCampaign.status === "PAUSED" ? "⏸️ Campanha pausada" : "🚀 Disparo em andamento"}
                      </h3>
                      <span style={{ fontSize: "0.82rem", color: "#71717a" }}>
                        {liveCampaign.name}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    {liveCampaign.status !== "PAUSED" && nextDispatchCountdown && (
                      <div style={{
                        background: "#ecfdf5",
                        border: "1px solid #a7f3d0",
                        borderRadius: "8px",
                        padding: "6px 14px",
                        display: "flex", alignItems: "center", gap: "6px",
                      }}>
                        <Clock3 size={14} style={{ color: "#047857" }} />
                        <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#047857", fontFamily: "monospace" }}>
                          {nextDispatchCountdown}
                        </span>
                        <span style={{ fontSize: "0.72rem", color: "#71717a" }}>próximo envio</span>
                      </div>
                    )}
                    {/* Pausar (some quando já pausada) — para TODOS os pendentes sem cancelar */}
                    {liveCampaign.status !== "PAUSED" && (
                      <button
                        type="button"
                        onClick={() => pauseCampaignMutation.mutate(liveCampaign.id)}
                        disabled={pauseCampaignMutation.isPending}
                        title="Pausa todos os pendentes. Você pode Retomar de onde parou."
                        style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "8px 16px",
                          background: "rgba(245, 158, 11, 0.08)",
                          border: "1px solid rgba(245, 158, 11, 0.25)",
                          borderRadius: "8px",
                          color: "#b45309",
                          fontSize: "0.85rem", fontWeight: 650,
                          cursor: pauseCampaignMutation.isPending ? "not-allowed" : "pointer",
                          opacity: pauseCampaignMutation.isPending ? 0.6 : 1,
                        }}
                      >
                        {pauseCampaignMutation.isPending ? (
                          <><LoaderCircle size={14} className="spin" /> Pausando...</>
                        ) : (
                          <><Pause size={14} /> Pausar</>
                        )}
                      </button>
                    )}

                    {/* Retomar — só aparece quando está pausada */}
                    {liveCampaign.status === "PAUSED" && (
                      <button
                        type="button"
                        onClick={() => resumeCampaignMutation.mutate(liveCampaign.id)}
                        disabled={resumeCampaignMutation.isPending}
                        title="Continua os envios de onde parou (não reenvia quem já recebeu)."
                        style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "8px 16px",
                          background: "rgba(16, 185, 129, 0.10)",
                          border: "1px solid rgba(16, 185, 129, 0.30)",
                          borderRadius: "8px",
                          color: "#047857",
                          fontSize: "0.85rem", fontWeight: 650,
                          cursor: resumeCampaignMutation.isPending ? "not-allowed" : "pointer",
                          opacity: resumeCampaignMutation.isPending ? 0.6 : 1,
                        }}
                      >
                        {resumeCampaignMutation.isPending ? (
                          <><LoaderCircle size={14} className="spin" /> Retomando...</>
                        ) : (
                          <><Play size={14} /> Retomar</>
                        )}
                      </button>
                    )}

                    {/* Retentar todos que falharam — só quando há falhas */}
                    {progress.failedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Retentar os ${formatNumber(progress.failedCount)} envios que falharam?`)) {
                            retryAllFailedMutation.mutate(liveCampaign.id);
                          }
                        }}
                        disabled={retryAllFailedMutation.isPending}
                        title="Volta todos os destinatários com falha para a fila e tenta de novo."
                        style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "8px 16px",
                          background: "rgba(59, 130, 246, 0.08)",
                          border: "1px solid rgba(59, 130, 246, 0.25)",
                          borderRadius: "8px",
                          color: "#1d4ed8",
                          fontSize: "0.85rem", fontWeight: 650,
                          cursor: retryAllFailedMutation.isPending ? "not-allowed" : "pointer",
                          opacity: retryAllFailedMutation.isPending ? 0.6 : 1,
                        }}
                      >
                        {retryAllFailedMutation.isPending ? (
                          <><LoaderCircle size={14} className="spin" /> Retentando...</>
                        ) : (
                          <><RotateCcw size={14} /> Retentar falhas ({formatNumber(progress.failedCount)})</>
                        )}
                      </button>
                    )}

                    {/* Cancelar — encerra a campanha de vez (pendentes viram cancelados) */}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("CANCELAR a campanha? Os envios pendentes serão descartados e NÃO dá pra retomar. (Para parar temporariamente, use Pausar.)")) {
                          cancelCampaignMutation.mutate(liveCampaign.id);
                        }
                      }}
                      disabled={cancelCampaignMutation.isPending}
                      title="Encerra a campanha. Os pendentes são descartados e não dá pra retomar."
                      style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        padding: "8px 16px",
                        background: "rgba(239, 68, 68, 0.06)",
                        border: "1px solid rgba(239, 68, 68, 0.15)",
                        borderRadius: "8px",
                        color: "#dc2626",
                        fontSize: "0.85rem", fontWeight: 650,
                        cursor: cancelCampaignMutation.isPending ? "not-allowed" : "pointer",
                        opacity: cancelCampaignMutation.isPending ? 0.6 : 1,
                      }}
                    >
                      {cancelCampaignMutation.isPending ? (
                        <><LoaderCircle size={14} className="spin" /> Cancelando...</>
                      ) : (
                        <><XCircle size={14} /> Cancelar</>
                      )}
                    </button>
                  </div>
                </div>

                {/* Overall Progress Bar */}
                <div style={{ marginBottom: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "0.82rem", color: "#3f3f46", fontWeight: 500 }}>
                      Progresso geral: {formatNumber(completedCount)} de {formatNumber(totalR)} processados
                    </span>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#10b981" }}>
                      {overallPct}%
                    </span>
                  </div>
                  <div style={{
                    width: "100%", height: "10px",
                    background: "#f4f4f5",
                    borderRadius: "9999px", overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${overallPct}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #10b981, #34d399)",
                      borderRadius: "9999px",
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                  <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
                    <span style={{ fontSize: "0.75rem", color: "#71717a" }}>
                      ✅ Enviados: <strong style={{ color: "#16a34a" }}>{formatNumber(progress.sentCount)}</strong>
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#71717a" }}>
                      ⏳ Pendentes: <strong style={{ color: "#d97706" }}>{formatNumber(progress.pendingCount)}</strong>
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#71717a" }}>
                      ❌ Falhas: <strong style={{ color: "#dc2626" }}>{formatNumber(progress.failedCount)}</strong>
                    </span>
                  </div>
                </div>

                {/* Recipients List with per-recipient countdown */}
                <div style={{
                  background: "#ffffff",
                  border: "1px solid #e4e4e7",
                  borderRadius: "12px",
                  overflow: "hidden",
                }}>
                  <div style={{
                    background: "#f8fafc",
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid #e4e4e7",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#18181b" }}>
                      Destinatários ({formatNumber(liveRecipients.length)} exibidos)
                    </span>
                  </div>
                  <div style={{ maxHeight: "420px", overflowY: "auto" }}>
                    {liveRecipients.map((recipient) => {
                      const isGroup = recipient.jid.endsWith("@g.us") || recipient.jid.includes("-");
                      const displayName = recipient.customerDisplayName || recipient.customerCode || recipient.sourceName || (isGroup ? "Grupo" : "Cliente");

                      // Calculate individual countdown in seconds
                      let countdownSeconds: number | null = null;
                      let countdownLabel: string | null = null;
                      if (recipient.status === "PENDING" && recipient.scheduledFor) {
                        const targetMs = new Date(recipient.scheduledFor).getTime();
                        const diffMs = Math.max(0, targetMs - nowMs);
                        countdownSeconds = Math.ceil(diffMs / 1000);
                        if (countdownSeconds > 0) {
                          const mins = Math.floor(countdownSeconds / 60);
                          const secs = countdownSeconds % 60;
                          countdownLabel = mins > 0
                            ? `${mins}m ${String(secs).padStart(2, "0")}s`
                            : `${secs}s`;
                        } else {
                          countdownLabel = "Enviando em breve...";
                        }
                      }

                      // Individual progress percentage
                      let recipientBarPct = 0;
                      let recipientBarColor = "#e4e4e7";
                      if (recipient.status === "SENT") {
                        recipientBarPct = 100;
                        recipientBarColor = "#10b981";
                      } else if (recipient.status === "FAILED") {
                        recipientBarPct = 100;
                        recipientBarColor = "#ef4444";
                      } else if (recipient.status === "SENDING") {
                        recipientBarPct = 50;
                        recipientBarColor = "#3b82f6";
                      } else if (recipient.status === "BLOCKED_RECENT") {
                        recipientBarPct = 100;
                        recipientBarColor = "#f59e0b";
                      } else if (recipient.status === "SKIPPED") {
                        recipientBarPct = 100;
                        recipientBarColor = "#71717a";
                      }

                      // Status badge
                      let statusBadgeBg = "#f4f4f5";
                      let statusBadgeColor = "#52525b";
                      let statusBadgeText: string = recipient.status;
                      if (recipient.status === "SENT") {
                        statusBadgeBg = "#ecfdf5";
                        statusBadgeColor = "#047857";
                        statusBadgeText = "ENVIADO";
                      } else if (recipient.status === "SENDING") {
                        statusBadgeBg = "#eff6ff";
                        statusBadgeColor = "#1d4ed8";
                        statusBadgeText = "ENVIANDO";
                      } else if (recipient.status === "PENDING") {
                        statusBadgeBg = "#fffbeb";
                        statusBadgeColor = "#b45309";
                        statusBadgeText = "AGUARDANDO";
                      } else if (recipient.status === "FAILED") {
                        statusBadgeBg = "#fef2f2";
                        statusBadgeColor = "#b91c1c";
                        statusBadgeText = "FALHA";
                      } else if (recipient.status === "BLOCKED_RECENT") {
                        statusBadgeBg = "#fff7ed";
                        statusBadgeColor = "#c2410c";
                        statusBadgeText = "BLOQUEADO";
                      } else if (recipient.status === "SKIPPED") {
                        statusBadgeBg = "#f4f4f5";
                        statusBadgeColor = "#52525b";
                        statusBadgeText = "PULADO";
                      }

                      return (
                        <div
                          key={recipient.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.2fr auto 1fr auto auto",
                            alignItems: "center",
                            gap: "12px",
                            padding: "0.75rem 1rem",
                            borderBottom: "1px solid #f1f5f9",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "#f8fafc";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          {/* Col 1: Name + JID */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                            <span style={{ fontSize: "0.88rem", fontWeight: 650, color: "#18181b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {displayName}
                            </span>
                            <span style={{ fontSize: "0.7rem", color: "#71717a", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {recipient.jid}
                            </span>
                          </div>

                          {/* Col 2: Status badge */}
                          <span style={{
                            display: "inline-flex", alignItems: "center",
                            padding: "3px 10px", borderRadius: "9999px",
                            fontSize: "0.68rem", fontWeight: 700,
                            textTransform: "uppercase", letterSpacing: "0.04em",
                            background: statusBadgeBg, color: statusBadgeColor,
                            whiteSpace: "nowrap",
                          }}>
                            {statusBadgeText}
                          </span>

                          {/* Col 3: Progress bar */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <div style={{
                              width: "100%", height: "6px",
                              background: "#f1f5f9",
                              borderRadius: "9999px", overflow: "hidden",
                            }}>
                              <div style={{
                                width: `${recipientBarPct}%`,
                                height: "100%",
                                background: recipientBarColor,
                                borderRadius: "9999px",
                                transition: "width 0.5s ease",
                              }} />
                            </div>
                          </div>

                          {/* Col 4: Countdown / Time info */}
                          <div style={{ textAlign: "right", minWidth: "90px" }}>
                            {recipient.status === "PENDING" && countdownLabel ? (
                              <span style={{
                                fontSize: "0.85rem",
                                fontWeight: 700,
                                color: countdownSeconds !== null && countdownSeconds <= 10 ? "#b45309" : "#71717a",
                                fontFamily: "monospace",
                                display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px",
                              }}>
                                <Clock3 size={12} />
                                {countdownLabel}
                              </span>
                            ) : recipient.status === "SENDING" ? (
                              <span style={{ fontSize: "0.82rem", color: "#2563eb", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                                <LoaderCircle size={12} className="spin" />
                                Enviando...
                              </span>
                            ) : recipient.status === "SENT" ? (
                              <span style={{ fontSize: "0.78rem", color: "#16a34a", fontWeight: 600 }}>
                                ✓ Enviado
                              </span>
                            ) : recipient.status === "FAILED" ? (
                              <span style={{ fontSize: "0.78rem", color: "#dc2626", fontWeight: 600 }}>
                                ✕ Falha
                              </span>
                            ) : (
                              <span style={{ fontSize: "0.78rem", color: "#71717a" }}>
                                {recipientLiveLabel(recipient)}
                              </span>
                            )}
                            {recipient.status === "PENDING" && recipient.scheduledFor && (
                              <div style={{ marginTop: "3px", fontSize: "0.7rem", color: "#71717a", fontWeight: 600 }}>
                                {formatDateTime(recipient.scheduledFor)}
                              </div>
                            )}
                            {["SENT", "FAILED"].includes(recipient.status) && (
                              <div style={{ marginTop: "3px", fontSize: "0.7rem", color: "#71717a", fontWeight: 600 }}>
                                {recipientDispatchTimeLabel(recipient)}
                              </div>
                            )}
                          </div>

                          {/* Col 5: Skip button */}
                          <div style={{ display: "flex", justifyContent: "center", width: "24px" }}>
                            {recipient.status === "PENDING" ? (
                              <button
                                onClick={() => {
                                  if (confirm(`Deseja cancelar o envio para ${displayName}?`)) {
                                    skipRecipientMutation.mutate({
                                      campaignId: recipient.campaignId,
                                      recipientId: recipient.id,
                                    });
                                  }
                                }}
                                disabled={skipRecipientMutation.isPending}
                                title="Cancelar envio para este contato"
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#a1a1aa",
                                  cursor: "pointer",
                                  padding: "4px",
                                  borderRadius: "4px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  transition: "all 0.15s",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "#fef2f2";
                                  e.currentTarget.style.color = "#dc2626";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "transparent";
                                  e.currentTarget.style.color = "#a1a1aa";
                                }}
                              >
                                <X size={16} />
                              </button>
                            ) : recipient.status === "FAILED" ? (
                              <button
                                onClick={() => {
                                  if (confirm(`Retentar envio para ${displayName}? A mensagem sera disparada novamente.`)) {
                                    retryRecipientMutation.mutate({
                                      campaignId: recipient.campaignId,
                                      recipientId: recipient.id,
                                    });
                                  }
                                }}
                                disabled={retryRecipientMutation.isPending && retryRecipientMutation.variables?.recipientId === recipient.id}
                                title="Retentar envio para este contato"
                                style={{
                                  background: "#fff7ed",
                                  border: "1px solid #fed7aa",
                                  color: "#c2410c",
                                  cursor: retryRecipientMutation.isPending && retryRecipientMutation.variables?.recipientId === recipient.id ? "not-allowed" : "pointer",
                                  padding: "5px",
                                  borderRadius: "6px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  opacity: retryRecipientMutation.isPending && retryRecipientMutation.variables?.recipientId === recipient.id ? 0.65 : 1,
                                }}
                              >
                                {retryRecipientMutation.isPending && retryRecipientMutation.variables?.recipientId === recipient.id ? (
                                  <LoaderCircle size={15} className="spin" />
                                ) : (
                                  <RotateCcw size={15} />
                                )}
                              </button>
                            ) : (
                              <div style={{ width: "24px" }} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {liveRecipients.length === 0 && (
                      <div style={{ padding: "2rem", textAlign: "center", color: "#71717a", fontSize: "0.85rem" }}>
                        Nenhum destinatário encontrado.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Table Area */}
          {campaignsQuery.isPending ? (
            <CampaignTableSkeleton />
          ) : (
            <div className="z-table-wrapper" style={{ border: "1px solid #e4e4e7", borderRadius: "12px", background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.02)" }}>
              <table className="z-table">
                <thead>
                  <tr>
                    <th style={{ padding: "1rem 1.5rem" }}>CAMPANHA</th>
                    <th style={{ padding: "1rem 1.5rem" }}>STATUS</th>
                    <th style={{ padding: "1rem 1.5rem" }}>PROGRESSO GERAL</th>
                    <th style={{ padding: "1rem 1.5rem", textAlign: "right" }}>AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignsQuery.data && campaignsQuery.data.length > 0 ? (
                    campaignsQuery.data.map((campaign) => {
                    const isExpanded = selectedCampaignId === campaign.id;
                    const completionRatio = campaign.progress.completionRatio;
                    const pct = Math.round(completionRatio * 100);
                    
                    // Style attributes for Status
                    let statusBg = "#f1f5f9";
                    let statusColor = "#475569";
                    let statusBorder = "rgba(0, 0, 0, 0.05)";
                    let statusText: string = campaign.status;

                    if (campaign.status === "COMPLETED") {
                      statusBg = "#f0fdf4";
                      statusColor = "#166534";
                      statusBorder = "#bbf7d0";
                      statusText = "CONCLUÍDO";
                    } else if (campaign.status === "CANCELLED") {
                      statusBg = "#fef2f2";
                      statusColor = "#991b1b";
                      statusBorder = "#fecaca";
                      statusText = "CANCELADO";
                    } else if (campaign.status === "IN_PROGRESS") {
                      statusBg = "#eff6ff";
                      statusColor = "#1e40af";
                      statusBorder = "#bfdbfe";
                      statusText = "EM PROGRESSO";
                    } else if (campaign.status === "QUEUED") {
                      statusBg = "#fffbeb";
                      statusColor = "#854d0e";
                      statusBorder = "#fef08a";
                      statusText = "NA FILA";
                    }

                    const isScheduledForFuture =
                      campaign.status === "QUEUED" &&
                      campaign.scheduledStartAt &&
                      new Date(campaign.scheduledStartAt).getTime() > Date.now();
                    if (isScheduledForFuture) {
                      statusBg = "#eef2ff";
                      statusColor = "#4338ca";
                      statusBorder = "#c7d2fe";
                      statusText = "AGENDADA";
                    }

                    // Progress bar color - CORES CORRETAS baseadas no status real
                    const { sentCount, failedCount, totalRecipients } = campaign.progress;
                    let progressBarColor = "#e4e4e7"; // Cinza padrão
                    
                    if (campaign.status === "CANCELLED") {
                      progressBarColor = "#71717a"; // Cinza para cancelado
                    } else if (failedCount === 0 && sentCount > 0) {
                      progressBarColor = "#10b981"; // Verde - tudo certo
                    } else if (failedCount > sentCount || (totalRecipients > 0 && failedCount / totalRecipients > 0.5)) {
                      progressBarColor = "#ef4444"; // Vermelho - mais falhas que sucessos
                    } else if (failedCount > 0) {
                      progressBarColor = "#f59e0b"; // Laranja - tem falhas mas mais sucessos
                    } else if (sentCount > 0) {
                      progressBarColor = "#10b981"; // Verde - enviando bem
                    }

                    return (
                      <Fragment key={campaign.id}>
                        <tr style={{ borderBottom: isExpanded ? "none" : "1px solid #e4e4e7" }}>
                          <td style={{ padding: "1.25rem 1.5rem" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#18181b" }}>
                                {campaign.name}
                              </span>
                              <span style={{ fontSize: "0.78rem", color: "#71717a" }}>
                                Criado em {formatDateTime(campaign.createdAt)}
                              </span>
                              {isScheduledForFuture && (
                                <span style={{ fontSize: "0.78rem", color: "#4338ca", fontWeight: 600 }}>
                                  📅 Início agendado: {formatDateTime(campaign.scheduledStartAt)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "1.25rem 1.5rem" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0.25rem 0.6rem",
                                borderRadius: "9999px",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                backgroundColor: statusBg,
                                color: statusColor,
                                border: `1px solid ${statusBorder}`,
                                letterSpacing: "0.025em"
                              }}
                            >
                              {statusText}
                            </span>
                          </td>
                          <td style={{ padding: "1.25rem 1.5rem", width: "300px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div
                                  className="z-progress-bar-bg"
                                  style={{
                                    flex: 1,
                                    height: "6px",
                                    backgroundColor: "#f4f4f5",
                                    borderRadius: "9999px",
                                    overflow: "hidden"
                                  }}
                                >
                                  <div
                                    className="z-progress-bar-fill"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: progressBarColor,
                                      height: "100%",
                                      borderRadius: "9999px",
                                      transition: "width 0.3s ease"
                                    }}
                                  />
                                </div>
                                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#18181b" }}>
                                  {pct}%
                                </span>
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "#71717a" }}>
                                Enviados: <strong style={{ color: "#18181b", fontWeight: 600 }}>{formatNumber(campaign.progress.sentCount)}</strong>{" "}
                                Falhas: <strong style={{ color: "#ef4444", fontWeight: 600 }}>{formatNumber(campaign.progress.failedCount)}</strong>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "1.25rem 1.5rem", textAlign: "right" }}>
                            <button
                              type="button"
                              className="z-btn-detail"
                              onClick={() => {
                                if (isExpanded) {
                                  setSelectedCampaignId(null);
                                } else {
                                  setSelectedCampaignId(campaign.id);
                                }
                              }}
                              style={{
                                background: "#ffffff",
                                border: "1px solid #e4e4e7",
                                padding: "0.5rem 1rem",
                                borderRadius: "8px",
                                fontSize: "0.85rem",
                                fontWeight: 500,
                                color: "#18181b",
                                cursor: "pointer",
                                transition: "all 0.2s"
                              }}
                            >
                              {isExpanded ? "Ocultar Detalhes" : "Ver Detalhes"}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={4} style={{ padding: "0 1.5rem 1.5rem 1.5rem", background: "#fafafa", borderBottom: "1px solid #e4e4e7" }}>
                              <div
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #e4e4e7",
                                  borderRadius: "12px",
                                  padding: "1.5rem",
                                  marginTop: "0.5rem",
                                  boxShadow: "0 4px 12px rgba(0,0,0,0.02)"
                                }}
                              >
                                {/* Delete Campaign Button */}
                                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (confirm(`Tem certeza que deseja EXCLUIR a campanha "${campaign.name}"? Esta ação não pode ser desfeita.`)) {
                                        try {
                                          await api.deleteCampaign(token!, campaign.id);
                                          queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
                                          setSelectedCampaignId(null);
                                          alert("Campanha excluída com sucesso!");
                                        } catch (error: any) {
                                          alert(`Erro ao excluir campanha: ${error?.message || error}`);
                                        }
                                      }
                                    }}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      padding: "0.5rem 1rem",
                                      background: "#fef2f2",
                                      border: "1px solid #fecaca",
                                      borderRadius: "8px",
                                      color: "#dc2626",
                                      fontSize: "0.85rem",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      transition: "all 0.2s"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = "#fee2e2";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = "#fef2f2";
                                    }}
                                  >
                                    <Trash2 size={16} />
                                    Excluir Campanha
                                  </button>
                                </div>

                                {selectedCampaignQuery.isLoading ? (
                                  <div style={{ textAlign: "center", padding: "2rem", color: "#71717a" }}>
                                    <LoaderCircle size={24} className="spin" style={{ margin: "0 auto 8px" }} />
                                    Carregando informações da campanha...
                                  </div>
                                ) : selectedCampaignQuery.data ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                                    
                                    {/* Sub-Header Detail */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                      <div>
                                        <h4 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#18181b", margin: 0 }}>
                                          {selectedCampaignQuery.data.name}
                                        </h4>
                                        <p style={{ fontSize: "0.8rem", color: "#71717a", margin: "2px 0 0 0" }}>
                                          Criada por {selectedCampaignQuery.data.createdByName} às {formatDateTime(selectedCampaignQuery.data.createdAt)}
                                        </p>
                                      </div>
                                      {["QUEUED", "IN_PROGRESS"].includes(selectedCampaignQuery.data.status) && (
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                          <button
                                            className="ghost-button danger"
                                            type="button"
                                            onClick={() => cancelCampaignMutation.mutate(selectedCampaignQuery.data!.id)}
                                            disabled={cancelCampaignMutation.isPending}
                                            style={{ padding: "6px 12px", fontSize: "0.8rem", borderRadius: "6px" }}
                                          >
                                            Cancelar campanha
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {selectedCampaignDisplayDetail ? (
                                    <CampaignPerformancePanel
                                      campaign={selectedCampaignDisplayDetail}
                                      performanceReady={Boolean(selectedCampaignPerformanceDetail)}
                                      performanceError={selectedCampaignPerformanceQuery.isError}
                                      performanceLoading={selectedCampaignPerformanceQuery.isFetching}
                                      nowMs={nowMs}
                                      activeFilter={campaignPerformanceFilter}
                                      recipients={selectedCampaignPerformanceRecipients}
                                      onFilterChange={setCampaignPerformanceFilter}
                                      retryingRecipientId={retryRecipientMutation.variables?.recipientId ?? null}
                                      onRetryRecipient={(recipient) => {
                                        const name = recipient.customerDisplayName || recipient.customerCode || recipient.sourceName || "este contato";
                                        if (confirm(`Retentar envio para ${name}? A mensagem sera disparada novamente.`)) {
                                          retryRecipientMutation.mutate({
                                            campaignId: recipient.campaignId,
                                            recipientId: recipient.id,
                                          });
                                        }
                                      }}
                                      onOpenMiniChat={async (recipient) => {
                                        setMiniChatRecipient(recipient);
                                        setMiniChatOpen(true);
                                        setMiniChatLoading(true);
                                        setMiniChatMessages([]);
                                        
                                        try {
                                          // Conversa agregada de todas as fontes (mesma base do badge "Respondeu")
                                          const conversationData = await api.whatsappCampaignRecipientChat(
                                            token!,
                                            selectedCampaignQuery.data.id,
                                            recipient.id,
                                          );

                                          // Converter para o formato do MiniChat
                                          let realMessages: MiniChatMessage[] = conversationData.messages.map(msg => ({
                                            id: msg.id,
                                            content: msg.content || "(mensagem sem texto)",
                                            direction: msg.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
                                            timestamp: msg.createdAt,
                                            status: msg.direction === "OUTBOUND" ? "sent" : undefined,
                                            senderName: msg.senderName,
                                            senderAvatarUrl: msg.senderAvatarUrl,
                                          }));

                                          // Garantir que a mensagem da campanha apareça como primeira mensagem se não houver registros de envio
                                          const hasOutbound = realMessages.some(msg => msg.direction === "OUTBOUND");
                                          if (!hasOutbound && selectedCampaignQuery.data.messageText) {
                                            realMessages.unshift({
                                              id: "campaign-msg",
                                              content: selectedCampaignQuery.data.messageText,
                                              direction: "OUTBOUND",
                                              timestamp: recipient.sentAt || selectedCampaignQuery.data.createdAt,
                                              status: "sent",
                                              senderName: `${selectedCampaignQuery.data.createdByName || "Equipe"} (campanha)`,
                                            });
                                          }
                                          
                                          setMiniChatMessages(realMessages);
                                        } catch (error) {
                                          console.error("Erro ao carregar mensagens:", error);
                                          // Fallback: mostrar pelo menos a mensagem da campanha
                                          setMiniChatMessages([{
                                            id: "campaign-msg",
                                            content: selectedCampaignQuery.data.messageText || "Mensagem da campanha",
                                            direction: "OUTBOUND",
                                            timestamp: recipient.sentAt || selectedCampaignQuery.data.createdAt,
                                            status: "sent",
                                            senderName: `${selectedCampaignQuery.data.createdByName || "Equipe"} (campanha)`,
                                          }]);
                                        } finally {
                                          setMiniChatLoading(false);
                                        }
                                      }}
                                    />
                                    ) : selectedCampaignPerformanceQuery.isError ? (
                                      <div style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: "8px",
                                        padding: "1.5rem",
                                        background: "#fffbeb",
                                        border: "1px solid #fde68a",
                                        borderRadius: "12px",
                                        color: "#92400e",
                                        fontSize: "0.85rem",
                                        textAlign: "center",
                                      }}>
                                        <span>Não foi possível calcular as métricas de resposta e compras agora (o cálculo demorou demais).</span>
                                        <button
                                          type="button"
                                          onClick={() => selectedCampaignPerformanceQuery.refetch()}
                                          disabled={selectedCampaignPerformanceQuery.isFetching}
                                          style={{
                                            padding: "0.4rem 1rem",
                                            background: "#ffffff",
                                            border: "1px solid #fbbf24",
                                            borderRadius: "8px",
                                            color: "#92400e",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                          }}
                                        >
                                          {selectedCampaignPerformanceQuery.isFetching ? "Calculando..." : "Tentar novamente"}
                                        </button>
                                      </div>
                                    ) : (
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "1.5rem", color: "#71717a", fontSize: "0.85rem" }}>
                                        <LoaderCircle size={18} className="spin" />
                                        Calculando métricas de resposta e compras...
                                      </div>
                                    )}

                                  </div>
                                ) : (
                                  <div style={{ textAlign: "center", padding: "1.5rem", color: "#ef4444" }}>
                                    Erro ao carregar detalhes.
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} style={{ padding: "3rem", textAlign: "center", color: "#71717a" }}>
                      Nenhuma campanha encontrada. Comece criando uma nova campanha!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </div>

    {/* Mini Chat Drawer */}
    <MiniChatDrawer
      open={miniChatOpen}
      onClose={() => {
        setMiniChatOpen(false);
        setMiniChatRecipient(null);
        setMiniChatMessages([]);
      }}
      recipientId={miniChatRecipient?.id || ""}
      customerName={miniChatRecipient?.customerDisplayName || miniChatRecipient?.customerCode || "Cliente"}
      customerPhone={miniChatRecipient?.jid.split("@")[0] || ""}
      jid={miniChatRecipient?.jid || ""}
      messages={miniChatMessages}
      loading={miniChatLoading}
      onSendMessage={async (message: string) => {
        if (!miniChatRecipient || !selectedCampaignQuery.data) {
          alert("Erro: informações da campanha não disponíveis");
          return;
        }

        try {
          // Enviar mensagem pela MESMA instância WhatsApp da campanha
          const instanceId = selectedCampaignQuery.data.whatsappInstanceId;
          
          if (!instanceId) {
            alert("Erro: Instância WhatsApp da campanha não encontrada");
            return;
          }

          // Chamar API para enviar mensagem
          await api.sendWhatsappMessage(token!, {
            instanceId: instanceId,
            jid: miniChatRecipient.jid,
            message: message,
            campaignId: selectedCampaignQuery.data.id
          });

          // Adicionar mensagem enviada ao chat
          const newMessage: MiniChatMessage = {
            id: `msg-${Date.now()}`,
            content: message,
            direction: "OUTBOUND",
            timestamp: new Date().toISOString(),
            status: "sent",
            senderName: user?.name || "Você",
          };
          
          setMiniChatMessages(prev => [...prev, newMessage]);
        } catch (error: any) {
          console.error("Erro ao enviar mensagem:", error);
          alert(`Erro ao enviar mensagem: ${error?.message || "Erro desconhecido"}`);
        }
      }}
    />

    {/* Campaign Creation Progress */}
    <CampaignCreationProgress isCreating={createCampaignMutation.isPending} />
    </>
  );
}





