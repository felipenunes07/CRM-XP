import cors from "cors";
import express from "express";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CustomerStatus, EventType, EventSeverity } from "@olist-crm/shared";
import { env, webOrigins } from "./lib/env.js";
import { HttpError } from "./lib/httpError.js";
import { logger } from "./lib/logger.js";
import {
  createCustomerLabel,
  deleteCustomerLabel,
  updateCustomerLabel,
  getCustomerDetail,
  getCustomerDocInsights,
  listCustomerLabels,
  listCustomers,
  previewSegment,
  updateCustomerAmbassador,
  updateCustomerLabels,
  bulkAssignLabelToCustomers,
} from "./modules/crm/customerService.js";
import {
  getCustomerCreditDetail,
  getCustomerCreditOverview,
  refreshCustomerCreditOverview,
} from "./modules/crm/customerCreditService.js";
import {
  getCustomerDefectCustomerDetail,
  getCustomerDefectOverview,
  getCustomerDefectProducts,
  refreshCustomerDefectOverview,
} from "./modules/crm/customerDefectService.js";
import {
  getInventoryBuying,
  getInventoryIntelligence,
  getInventoryIntelligenceDetail,
  getInventoryModelDetail,
  getInventoryModels,
  getInventoryOverview,
  getInventorySalesReport,
  getInventoryRestock,
  getInventoryStale,
} from "./modules/crm/inventoryIntelligenceService.js";
import { getInventorySnapshot, refreshInventorySnapshot } from "./modules/crm/inventoryService.js";
import { getCrossSellStrategy } from "./modules/crm/strategyCrossSellService.js";
import { getSlowMovingStrategy } from "./modules/crm/strategySlowMovingService.js";
import { getCustomerCreditOpportunities, getCustomerOpportunity } from "./modules/crm/opportunityService.js";
import { getAcquisitionMetrics } from "./modules/crm/acquisitionService.js";
import { getAmbassadorOverview } from "./modules/crm/ambassadorService.js";
import { getAttendantsOverview } from "./modules/crm/attendantService.js";
import { getAgendaItems, getDashboardMetrics, getCustomerMovements, getTrendRangeAnalysis, saveMonthlyTarget, deleteMonthlyTarget, getMonthlyTargets, getChartAnnotations, saveChartAnnotation, deleteChartAnnotation } from "./modules/crm/dashboardService.js";
import {
  createSavedSegment,
  deleteSavedSegment,
  listSavedSegments,
  updateSavedSegment,
} from "./modules/crm/segmentService.js";
import {
  approveMessageAutomationRun,
  createMessageAutomation,
  deleteMessageAutomation,
  listMessageAutomationRuns,
  listMessageAutomations,
  rejectMessageAutomationRun,
  runMessageAutomationNow,
  updateMessageAutomation,
} from "./modules/crm/automationService.js";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  listMessageTemplates,
  updateMessageTemplate,
} from "./modules/crm/messageService.js";
import {
  runOffboardingAlert,
  findInactiveBacklog,
  findUpcomingInactive,
  findInactiveByDayOffset,
  sendOffboardingForCustomers,
} from "./modules/crm/offboardingAlertService.js";
import {
  getLifecycleConfig,
  setLifecycleConfig,
  getLifecycleOverview,
  runLifecycleAutomation,
  findScheduledLifecycle,
  getLifecycleRecovery,
  getLifecycleJourneys,
  sendLifecycleHandoff,
  LIFECYCLE_STAGES,
  type LifecycleStage,
  triggerIndividualLifecycle,
  skipIndividualLifecycle,
} from "./modules/crm/lifecycleAutomationService.js";
import {
  createIdea,
  deleteIdea,
  getIdeaDetail,
  listIdeaFeedbacks,
  listIdeas,
  moveIdeaToLane,
  submitIdeaVote,
} from "./modules/ideas/ideaBoardService.js";
import {
  syncGeographicData,
  getGeographicStats,
  getGeographicSalesStats,
  getCitiesByState,
  getGeographicModelSales,
} from "./modules/crm/geographicService.js";
import {
  claimProspectLead,
  createProspectKeywordPreset,
  createProspectContactAttempt,
  discardProspectLead,
  getProspectingConfig,
  getProspectingSummary,
  releaseProspectLead,
  searchProspectLeads,
} from "./modules/prospecting/prospectingService.js";
import { importHistoryFile } from "./modules/ingestion/historyImporter.js";
import { syncOlistIncremental } from "./modules/ingestion/olistSyncService.js";
import { importSupabase2026 } from "./modules/ingestion/supabaseImporter.js";
import { login, verifyToken } from "./modules/platform/authService.js";
import { requireAuth, requirePermission, requireRole } from "./modules/platform/authMiddleware.js";
import { subscribeMonitorMessages } from "./modules/whatsapp/whatsappMonitorBus.js";
import { getAvatarBytes } from "./modules/whatsapp/whatsappAvatarCache.js";
import {
  createAdminUser,
  createPasswordResetLink,
  listAdminUsers,
  setAdminUserPassword,
  setAdminUserActive,
  updateAdminUser,
} from "./modules/platform/adminUserService.js";
import { APP_PERMISSIONS } from "./modules/platform/permissionService.js";
import { enqueueHistoryImportJob, enqueueOlistSyncJob } from "./modules/platform/jobs.js";
import { runPrimarySync } from "./modules/platform/syncService.js";
import {
  getEventsMetrics,
  getEventsIntelligence,
  listEvents,
  resolveEvent,
  getDailySentiments,
} from "./modules/events/eventsService.js";
import {
  acknowledgeConversationInsight,
  getEventsOverview,
  getIntelligenceProgress,
  listConversationInsights,
  startManualIntelligenceRun,
} from "./modules/events/conversationAi.js";
import {
  getProductComplaintsModelReport,
  getProductComplaintsOverview,
  listProductComplaints,
} from "./modules/events/productComplaintsService.js";
import {
  getGeneralComplaintsOverview,
  listGeneralComplaints,
} from "./modules/events/generalComplaintsService.js";
import {
  previewRadarWhatsapp,
  sendRadarWhatsapp,
} from "./modules/events/radarWhatsappService.js";
import {
  cancelWhatsappCampaign,
  createWhatsappCampaign,
  getWhatsappCampaignAccess,
  getWhatsappCampaignDetail,
  getWhatsappCampaignRecipientChat,
  listWhatsappCampaigns,
  pauseWhatsappCampaign,
  resumeWhatsappCampaign,
  retryAllFailedWhatsappCampaignRecipients,
  retryWhatsappCampaignRecipient,
  skipWhatsappCampaignRecipient,
} from "./modules/whatsapp/whatsappCampaignService.js";
import { ensureEvolutionConfigured, sendWhatsappTextMessage } from "./modules/whatsapp/evolutionService.js";
import { refreshMissingWhatsappMonitorProfiles } from "./modules/whatsapp/evolutionMetadataService.js";
import {
  getWhatsappMappingSummary,
  importWhatsappGroupsFromDefaultWorkbook,
  importWhatsappGroupsFromWorkbook,
  listWhatsappGroups,
  updateWhatsappGroupMatch,
} from "./modules/whatsapp/whatsappGroupService.js";
import {
  WHATSAPP_GROUP_CLASSIFICATIONS,
  WHATSAPP_GROUP_MAPPING_STATUSES,
} from "./modules/whatsapp/whatsappCore.js";
import {
  getWhatsappMonitorConversation,
  getWhatsappMonitorMetrics,
  getWhatsappAgentActivityReport,
  getWhatsappDailySummaryReport,
  listWhatsappMonitorAgents,
  listWhatsappMonitorConversations,
  sendWhatsappMonitorReply,
  setWhatsappConversationReadState,
} from "./modules/whatsapp/whatsappMonitorService.js";
import { enqueueWhatsappCampaignRecipients, resumeDueWhatsappCampaignRecipients } from "./modules/whatsapp/whatsappQueue.js";
import {
  getPipelineSummary,
  createDeal,
  getDealDetail,
  updateDeal,
  moveDealStage,
  addDealActivity,
  listWhatsappInstances,
  createWhatsappInstance,
  deleteWhatsappInstance,
} from "./modules/pipeline/pipelineService.js";
import { handleEvolutionWebhook } from "./modules/whatsapp/evolutionWebhook.js";
import { handleUazapiWebhook } from "./modules/whatsapp/uazapiWebhook.js";
import { assertSupportedOutboundVideo, getCampaignMediaDir, IMAGE_MIME_EXTENSIONS } from "./modules/whatsapp/whatsappMedia.js";
import { pool, redis } from "./db/client.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const userPermissionOverrideSchema = z.object({
  permissionKey: z.string().min(1),
  allowed: z.boolean(),
});

const adminUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
  role: z.enum(["admin", "vendas", "financeiro", "operacional", "viewer", "ADMIN", "MANAGER", "SELLER"]),
  isActive: z.boolean().default(true),
  permissionOverrides: z.array(userPermissionOverrideSchema).default([]),
  password: z.string().min(6).or(z.literal("")).optional(),
});

const adminUserStatusSchema = z.object({
  isActive: z.boolean(),
});

const adminUserPasswordSchema = z.object({
  password: z.string().min(6),
});

const customerQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  minDaysInactive: z.coerce.number().optional(),
  maxDaysInactive: z.coerce.number().optional(),
  minAvgTicket: z.coerce.number().optional(),
  minTotalSpent: z.coerce.number().optional(),
  minFrequencyDrop: z.coerce.number().optional(),
  sortBy: z.enum(["priority", "faturamento", "recencia"]).optional(),
  limit: z.coerce.number().optional(),
  labels: z.string().optional(),
  excludeLabels: z.string().optional(),
  isAmbassador: z.coerce.boolean().optional(),
  purchasedInYearMonth: z.string().regex(/^\d{4}-\d{2}$/, "deve estar no formato YYYY-MM").optional(),
  customerPrefix: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  minTotalOrders: z.coerce.number().optional(),
});

const dashboardQuerySchema = z.object({
  trendDays: z.coerce.number().int().min(1).max(3650).optional(),
  customerPrefix: z.string().optional(),
});

const movementsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

const trendRangeAnalysisQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate deve estar no formato YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate deve estar no formato YYYY-MM-DD"),
});

const monthlyTargetSchema = z.object({
  year: z.number().int().min(2000),
  month: z.number().int().min(1).max(12),
  targetAmount: z.number().int().min(0),
  attendant: z.string().default('TOTAL'),
  targetRevenue: z.number().min(0).optional().default(0),
});

const chartAnnotationSchema = z.object({
  id: z.string().uuid().optional(),
  date: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional().default(""),
});

const attendantsQuerySchema = z.object({
  windowMonths: z
    .enum(["3", "6", "12", "24"])
    .transform((value) => Number(value) as 3 | 6 | 12 | 24)
    .optional(),
});

const agendaQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  search: z.string().optional(),
  status: z.string().optional(),
  labels: z.string().optional(),
  excludeLabels: z.string().optional(),
  isAmbassador: z.coerce.boolean().optional(),
  purchasedInYearMonth: z.string().regex(/^\d{4}-\d{2}$/, "deve estar no formato YYYY-MM").optional(),
  customerPrefix: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
});

const segmentSchema = z.object({
  status: z.array(z.enum(["ACTIVE", "ATTENTION", "INACTIVE"])).optional(),
  minDaysInactive: z.number().optional(),
  maxDaysInactive: z.number().optional(),
  minAvgTicket: z.number().optional(),
  minTotalSpent: z.number().optional(),
  frequencyDropRatio: z.number().optional(),
  newCustomersWithinDays: z.number().optional(),
  stoppedTopCustomers: z.boolean().optional(),
  labels: z.array(z.string()).optional(),
  excludeLabels: z.array(z.string()).optional(),
  customerPrefix: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  customerCodes: z.array(z.string()).optional(),
  minTotalOrders: z.number().optional(),
});

const messageSchema = z
  .object({
    category: z.enum(["reativacao", "follow_up", "promocao", "credito"]),
    title: z.string().min(1),
    content: z.string().default(""),
    messageType: z.enum(["TEXT", "IMAGE", "VIDEO"]).default("TEXT"),
    mediaUrl: z.string().nullable().default(null),
  })
  .refine((data) => data.messageType === "TEXT" || Boolean(data.mediaUrl), {
    message: "Templates de imagem/video precisam de uma midia (mediaUrl).",
    path: ["mediaUrl"],
  })
  .refine((data) => data.messageType !== "TEXT" || data.content.trim().length > 0, {
    message: "Template de texto precisa de conteudo.",
    path: ["content"],
  });

const createIdeaSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    isAnonymous: z.boolean(),
    authorDisplayName: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (!value.isAnonymous && !String(value.authorDisplayName ?? "").trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authorDisplayName"],
        message: "Informe o nome que sera exibido na ideia.",
      });
    }
  });

const submitIdeaVoteSchema = z.object({
  option: z.enum(["LIKE", "MAYBE", "NO"]),
  comment: z.string().optional(),
});

const moveIdeaLaneSchema = z.object({
  laneId: z.enum(["INBOX", "SUPPORT", "REFINE", "STOP"]).nullable(),
});

const manualImportSchema = z.object({
  files: z.array(z.string()).optional(),
  mode: z.enum(["queue", "direct"]).default("queue"),
});

const manualSyncSchema = z.object({
  mode: z.enum(["queue", "direct"]).default("queue"),
});

const customerLabelUpdateSchema = z.object({
  labels: z.array(z.string().min(1)).optional(),
  internalNotes: z.string().optional(),
});

const createCustomerLabelSchema = z.object({
  name: z.string().min(1),
});

const updateCustomerLabelSchema = z.object({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve estar no formato hexadecimal #RRGGBB"),
});

const customerAmbassadorSchema = z.object({
  isAmbassador: z.boolean(),
});

const savedSegmentSchema = z.object({
  name: z.string().min(1),
  definition: segmentSchema,
});

const automationScheduleSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY"]),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/, "deve estar no formato HH:mm"),
  timezone: z.string().min(1),
});

const automationSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["ACTIVE", "PAUSED"]),
  channel: z.literal("WHATSAPP_GROUP"),
  sendMode: z.enum(["AUTOMATIC", "APPROVAL"]).optional(),
  triggerMode: z.enum(["SCHEDULED", "ON_STAGE_ENTRY"]).optional(),
  savedSegmentId: z.string().uuid().nullable().optional(),
  segmentDefinition: segmentSchema,
  flowDefinition: z.record(z.unknown()).optional(),
  whatsappInstanceId: z.string().uuid().nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
  messageText: z.string().min(1),
  schedule: automationScheduleSchema,
  overrideRecentBlock: z.boolean().optional(),
  minDelaySeconds: z.number().int().min(1).optional(),
  maxDelaySeconds: z.number().int().min(1).optional(),
});

const automationRunsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const automationRunNowSchema = z.object({
  sendMode: z.enum(["AUTOMATIC", "APPROVAL"]).optional(),
});

const optionalQueryBoolean = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  return value;
}, z.boolean().optional());

const inventoryIntelligenceQuerySchema = z.object({
  brand: z.string().optional(),
  family: z.string().optional(),
  quality: z.string().optional(),
  stockStatus: z.enum(["NEGATIVE", "OUT", "LOW", "HEALTHY", "HIGH"]).optional(),
  demandStatus: z.enum(["NO_SALES", "COLD", "WARM", "HOT"]).optional(),
  newArrivalOnly: optionalQueryBoolean,
  depositName: z.string().optional(),
  seller: z.string().optional(),
});

const prospectingSearchSchema = z.object({
  keyword: z.string().min(1),
  state: z.string().min(2),
  city: z.string().optional(),
  onlyNew: optionalQueryBoolean,
  onlyUnassigned: optionalQueryBoolean,
  hasPhone: optionalQueryBoolean,
  myLeads: optionalQueryBoolean,
  includeWorked: optionalQueryBoolean,
  limit: z.coerce.number().int().min(1).max(20).optional(),
  refresh: optionalQueryBoolean,
});

const prospectContactAttemptSchema = z.object({
  channel: z.enum(["WHATSAPP", "PHONE", "SITE", "OTHER"]),
  contactType: z.enum(["FIRST_CONTACT", "FOLLOW_UP", "NO_RESPONSE", "INTERESTED", "DISQUALIFIED"]),
  notes: z.string().optional(),
});

const prospectDiscardSchema = z.object({
  reason: z.string().optional(),
});

const prospectPresetSchema = z.object({
  keyword: z.string().min(1),
});

const whatsappGroupFiltersQuerySchema = z.object({
  search: z.string().optional(),
  classification: z.string().optional(),
  mappingStatus: z.string().optional(),
  savedSegmentId: z.string().uuid().optional(),
  onlyRecentlyBlocked: optionalQueryBoolean,
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  customerStatus: z.string().optional(),
});

const whatsappMappingSummaryQuerySchema = z.object({
  search: z.string().optional(),
  savedSegmentId: z.string().uuid().optional(),
  recentBlock: z.enum(["AVAILABLE_ONLY", "BLOCKED_ONLY", "ALL"]).optional(),
});

const whatsappImportSchema = z.object({
  fileName: z.string().min(1),
  fileBase64: z.string().min(1),
});

const whatsappGroupMatchSchema = z.object({
  customerId: z.string().uuid().nullable().optional(),
  mappingStatus: z.enum(["MANUAL_MAPPED", "CONFIRMED_UNMATCHED", "IGNORED"]),
  note: z.string().optional(),
});

const carouselSlideSchema = z.object({
  text: z.string().min(1),
  image: z.string().url(),
  buttons: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    type: z.string().min(1),
  })).min(1),
});

const whatsappMenuDataSchema = z.object({
  menuType: z.enum(["button", "list", "poll"]),
  choices: z.array(z.string().min(1)).min(1),
  footerText: z.string().nullable().optional(),
  listButton: z.string().nullable().optional(),
  selectableCount: z.number().int().min(1).nullable().optional(),
  imageButton: z.string().nullable().optional(),
});

const whatsappCampaignCreateSchema = z.object({
  name: z.string().min(1),
  templateId: z.string().uuid().nullable().optional(),
  savedSegmentId: z.string().uuid().nullable().optional(),
  whatsappInstanceId: z.string().uuid().nullable().optional(),
  messageText: z.string().optional().default(""),
  messageType: z.enum(["TEXT", "IMAGE", "CAROUSEL", "VIDEO", "MENU"]).optional(),
  carouselData: z.array(carouselSlideSchema).nullable().optional(),
  menuData: whatsappMenuDataSchema.nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  autoReplyText: z.string().max(4000).nullable().optional(),
  filtersSnapshot: z.record(z.unknown()).optional(),
  groupIds: z.array(z.string().uuid()).min(1),
  overrideRecentBlock: z.boolean().optional(),
  minDelaySeconds: z.number().int().min(1).optional(),
  maxDelaySeconds: z.number().int().min(1).optional(),
  scheduledStartAt: z.string().nullable().optional(),
});

const whatsappCampaignListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const whatsappCampaignDetailQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(5000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  excludePerformance: z.preprocess(
    (val) => val === "true" || val === true,
    z.boolean(),
  ).optional(),
});

function parseClassificationList(value?: string) {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is (typeof WHATSAPP_GROUP_CLASSIFICATIONS)[number] =>
      (WHATSAPP_GROUP_CLASSIFICATIONS as readonly string[]).includes(entry),
    );
}

function parseMappingStatusList(value?: string) {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is (typeof WHATSAPP_GROUP_MAPPING_STATUSES)[number] =>
      (WHATSAPP_GROUP_MAPPING_STATUSES as readonly string[]).includes(entry),
    );
}

function decodeBase64File(value: string) {
  const raw = value.includes(",") ? value.split(",").at(-1) ?? "" : value;
  return Buffer.from(raw, "base64");
}

const IDEA_BOARD_NOTIFICATION_GROUP_JID = "120363025402961504@g.us";

function buildIdeaBoardNotificationMessage(input: { title: string; description: string }) {
  const description = String(input.description ?? "").replace(/\s+/g, " ").trim();
  const preview = description.length > 140 ? `${description.slice(0, 137).trimEnd()}...` : description;

  return [
    "Nova ideia no mural XP CRM",
    "",
    `Titulo: ${input.title}`,
    preview ? `Resumo: ${preview}` : null,
    "",
    "Entre na aba Ideias/Votacao do CRM para votar e comentar de forma anonima.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function notifyIdeaBoardNewIdea(input: { title: string; description: string }) {
  try {
    ensureEvolutionConfigured();
  } catch (error) {
    logger.warn("idea board whatsapp notification skipped", { error: String(error) });
    return;
  }

  try {
    await sendWhatsappTextMessage(
      IDEA_BOARD_NOTIFICATION_GROUP_JID,
      buildIdeaBoardNotificationMessage(input),
    );
  } catch (error) {
    logger.warn("idea board whatsapp notification failed", { error: String(error), title: input.title });
  }
}

function isAllowedCorsOrigin(origin?: string | null) {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = origin.trim().toLowerCase().replace(/\/+$/, "");

  // Normalize entries in webOrigins to avoid trailing slash or capitalization mismatches
  const allowedWebOrigins = webOrigins.map((o) => o.trim().toLowerCase().replace(/\/+$/, ""));

  if (
    allowedWebOrigins.includes(normalizedOrigin) ||
    normalizedOrigin === "http://localhost:5173" ||
    normalizedOrigin === "http://localhost:5174" ||
    normalizedOrigin.endsWith(".trycloudflare.com")
  ) {
    return true;
  }

  try {
    const hostname = new URL(normalizedOrigin).hostname;
    return (
      hostname === "xpcrm.vercel.app" ||
      hostname.endsWith(".vercel.app") ||
      hostname.endsWith(".ngrok-free.dev") ||
      hostname.endsWith(".ngrok-free.app") ||
      hostname.endsWith(".ngrok.app") ||
      hostname.endsWith(".ngrok.io")
    );
  } catch {
    return false;
  }
}

function logWhatsappMonitorEndpointTiming(
  route: string,
  startedAt: number,
  context: Record<string, unknown> = {},
) {
  logger.info("whatsapp monitor endpoint timing", {
    route,
    durationMs: Date.now() - startedAt,
    ...context,
  });
}

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100mb" }));

  // Diretório onde os vídeos de campanha enviados do computador são hospedados,
  // servido publicamente em /media/campaign-videos. Mandar a URL (em vez de base64
  // inline) pros provedores elimina o timeout e o "Bad Request" no disparo.
  const campaignMediaDir = getCampaignMediaDir();
  app.use(
    "/media/campaign-videos",
    express.static(campaignMediaDir, {
      maxAge: "7d",
      setHeaders(res) {
        res.setHeader("Content-Type", "video/mp4");
      },
    }),
  );
  // Imagens de campanha (ex.: cabeçalho do menu interativo) enviadas do
  // computador. Mesmo diretório dos vídeos, mas servidas deixando o express
  // inferir o Content-Type pela extensão do arquivo.
  app.use("/media/campaign-images", express.static(campaignMediaDir, { maxAge: "7d" }));

  app.get("/api/health", async (_request, response) => {
    const db = await pool.query("SELECT 1");
    const redisPing = await redis.ping();
    response.json({
      status: "ok",
      database: db.rowCount === 1 ? "up" : "down",
      redis: redisPing,
      now: new Date().toISOString(),
    });
  });

  app.post("/api/auth/login", async (request, response, next) => {
    try {
      const payload = loginSchema.parse(request.body);
      response.json(await login(payload.email, payload.password));
    } catch (error) {
      next(error);
    }
  });

  // Evolution API webhook — public endpoint (no auth required)
  app.post("/api/webhooks/evolution", async (request, response, next) => {
    try {
      const result = await handleEvolutionWebhook(request.body);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  // uazapi webhook — public endpoint (no auth required). Translates uazapi's
  // payload into the Evolution shape so uazapi instances feed the same
  // communication/messages pipeline (private chats, groups, media, contacts).
  app.post("/api/webhooks/uazapi", async (request, response, next) => {
    try {
      const result = await handleUazapiWebhook(request.body);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  // SSE stream for real-time WhatsApp monitor messages (Auth verified manually via query token)
  app.get("/api/whatsapp-monitor/stream", async (request, response) => {
    const token = typeof request.query.token === "string" ? request.query.token : "";
    let user;
    try {
      user = await verifyToken(token);
    } catch {
      response.status(401).end();
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // prevents buffering behind proxies like Nginx/EasyPanel
    });

    response.write(`event: ready\ndata: "ok"\n\n`);

    const unsubscribe = subscribeMonitorMessages((msg) => {
      response.write(`data: ${JSON.stringify(msg)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      response.write(`: ping\n\n`);
    }, 25_000);

    request.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  });

  // Public avatar endpoint: serves re-hosted WhatsApp profile pictures stored in
  // Postgres (whatsapp_avatars). Must be public — <img> tags cannot send the JWT.
  app.get("/api/whatsapp-monitor/avatar/:key", async (request, response, next) => {
    try {
      const avatar = await getAvatarBytes(String(request.params.key));
      if (!avatar) {
        response.status(404).end();
        return;
      }
      response.setHeader("Content-Type", avatar.contentType);
      response.setHeader("Cache-Control", "public, max-age=86400");
      response.end(avatar.bytes);
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", requireAuth);

  app.get("/api/auth/me", (request, response) => {
    response.json({ user: request.user });
  });

  app.get("/api/prospecting/config", requireRole(["ADMIN", "MANAGER", "SELLER"]), async (_request, response, next) => {
    try {
      response.json(await getProspectingConfig());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/prospecting/presets", requireRole(["ADMIN", "MANAGER", "SELLER"]), async (request, response, next) => {
    try {
      response.status(201).json(await createProspectKeywordPreset(prospectPresetSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/prospecting/search", requireRole(["ADMIN", "MANAGER", "SELLER"]), async (request, response, next) => {
    try {
      response.json(await searchProspectLeads(prospectingSearchSchema.parse(request.query), request.user!));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/prospecting/leads/:id/claim", requireRole(["ADMIN", "MANAGER", "SELLER"]), async (request, response, next) => {
    try {
      response.json(await claimProspectLead(String(request.params.id), request.user!));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/prospecting/leads/:id/release", requireRole(["ADMIN", "MANAGER", "SELLER"]), async (request, response, next) => {
    try {
      response.json(await releaseProspectLead(String(request.params.id), request.user!));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/prospecting/leads/:id/contact-attempts", requireRole(["ADMIN", "MANAGER", "SELLER"]), async (request, response, next) => {
    try {
      response.status(201).json(
        await createProspectContactAttempt(
          String(request.params.id),
          request.user!,
          prospectContactAttemptSchema.parse(request.body),
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/prospecting/leads/:id/discard", requireRole(["ADMIN", "MANAGER", "SELLER"]), async (request, response, next) => {
    try {
      response.json(await discardProspectLead(String(request.params.id), request.user!, prospectDiscardSchema.parse(request.body).reason));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/prospecting/summary", requireRole(["ADMIN", "MANAGER", "SELLER"]), async (request, response, next) => {
    try {
      response.json(await getProspectingSummary(request.user!));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard/metrics", async (request, response, next) => {
    try {
      const query = dashboardQuerySchema.parse(request.query);
      response.json(await getDashboardMetrics(query.trendDays, query.customerPrefix));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard/movements", async (request, response, next) => {
    try {
      const query = movementsQuerySchema.parse(request.query);
      response.json(await getCustomerMovements(query.days));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard/trend-range-analysis", async (request, response, next) => {
    try {
      const query = trendRangeAnalysisQuerySchema.parse(request.query);
      response.json(await getTrendRangeAnalysis(query.startDate, query.endDate));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard/annotations", async (_request, response, next) => {
    try {
      response.json(await getChartAnnotations());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/dashboard/annotations", async (request, response, next) => {
    try {
      const payload = chartAnnotationSchema.parse(request.body);
      response.json(await saveChartAnnotation(payload));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/dashboard/annotations/:id", async (request, response, next) => {
    try {
      await deleteChartAnnotation(String(request.params.id));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard/targets", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const year = request.query.year ? parseInt(String(request.query.year), 10) : undefined;
      response.json(await getMonthlyTargets(year));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/dashboard/targets", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const payload = monthlyTargetSchema.parse(request.body);
      await saveMonthlyTarget(payload.year, payload.month, payload.targetAmount, payload.attendant, payload.targetRevenue);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/dashboard/targets", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const year = parseInt(String(request.query.year), 10);
      const month = parseInt(String(request.query.month), 10);
      const attendant = String(request.query.attendant || 'TOTAL');
      if (!year || !month) {
        throw new HttpError(400, "Parâmetros year e month são obrigatórios");
      }
      await deleteMonthlyTarget(year, month, attendant);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard/acquisition", async (_request, response, next) => {
    try {
      response.json(await getAcquisitionMetrics());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/ambassadors", async (_request, response, next) => {
    try {
      response.json(await getAmbassadorOverview());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/attendants", async (request, response, next) => {
    try {
      const query = attendantsQuerySchema.parse(request.query);
      response.json(await getAttendantsOverview(query.windowMonths ?? 12));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agenda", async (request, response, next) => {
    try {
      const query = agendaQuerySchema.parse(request.query);
      const statuses = query.status
        ? query.status
            .split(",")
            .filter((value): value is CustomerStatus => ["ACTIVE", "ATTENTION", "INACTIVE"].includes(value))
        : undefined;

      response.json(
        await getAgendaItems(query.limit, query.offset, {
          search: query.search,
          status: statuses,
          labels: query.labels?.split(",").filter(Boolean),
          excludeLabels: query.excludeLabels?.split(",").filter(Boolean),
          isAmbassador: query.isAmbassador,
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/customers", async (request, response, next) => {
    try {
      const query = customerQuerySchema.parse(request.query);
      const statuses = query.status
        ? query.status
            .split(",")
            .filter((value): value is CustomerStatus => ["ACTIVE", "ATTENTION", "INACTIVE"].includes(value))
        : undefined;
      response.json(
        await listCustomers({
          ...query,
          status: statuses,
          labels: query.labels?.split(",").filter(Boolean),
          excludeLabels: query.excludeLabels?.split(",").filter(Boolean),
          isAmbassador: query.isAmbassador,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/customer-insights/doc", async (_request, response, next) => {
    try {
      response.json(await getCustomerDocInsights());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/customer-credit/overview", async (_request, response, next) => {
    try {
      response.json(await getCustomerCreditOverview());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/customer-credit/refresh", requireRole(["ADMIN", "MANAGER"]), async (_request, response, next) => {
    try {
      response.json(await refreshCustomerCreditOverview());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/customer-credit/opportunities", async (_request, response, next) => {
    try {
      response.json(await getCustomerCreditOpportunities());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/customer-defects/overview", async (_request, response, next) => {
    try {
      response.json(await getCustomerDefectOverview());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/customer-defects/customers/:customerCode", async (request, response, next) => {
    try {
      response.json(await getCustomerDefectCustomerDetail(request.params.customerCode));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/customer-defects/products", async (request, response, next) => {
    try {
      const year = z.coerce.number().int().parse(request.query.year);
      response.json(await getCustomerDefectProducts(year));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/customer-defects/refresh", requireRole(["ADMIN", "MANAGER"]), async (_request, response, next) => {
    try {
      response.json(await refreshCustomerDefectOverview());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/inventory/snapshot", async (_request, response, next) => {
    try {
      response.json(await getInventorySnapshot());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/inventory/refresh", requireRole(["ADMIN", "MANAGER"]), async (_request, response, next) => {
    try {
      response.json(await refreshInventorySnapshot());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/inventory/intelligence", async (request, response, next) => {
    try {
      response.json(await getInventoryIntelligence(inventoryIntelligenceQuerySchema.parse(request.query)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/inventory/overview", async (_request, response, next) => {
    try {
      response.json(await getInventoryOverview());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/inventory/buying", async (_request, response, next) => {
    try {
      response.json(await getInventoryBuying());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/inventory/restock", async (_request, response, next) => {
    try {
      response.json(await getInventoryRestock());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/inventory/stale", async (_request, response, next) => {
    try {
      response.json(await getInventoryStale());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/inventory/sales-report", async (_request, response, next) => {
    try {
      response.json(await getInventorySalesReport());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/inventory/models", async (_request, response, next) => {
    try {
      response.json(await getInventoryModels());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/inventory/models/:modelKey", async (request, response, next) => {
    try {
      response.json(await getInventoryModelDetail(String(request.params.modelKey ?? "")));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/inventory/items/:sku", async (request, response, next) => {
    try {
      response.json(await getInventoryIntelligenceDetail(String(request.params.sku ?? "")));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/customers/:id", async (request, response, next) => {
    try {
      const customer = await getCustomerDetail(request.params.id);
      if (!customer) {
        throw new HttpError(404, "Cliente não encontrado");
      }
      response.json(customer);
    } catch (error) {
      next(error);
    }
  });

/*
  app.get("/api/customers/:id/credit", async (request, response, next) => {
    try {
      response.json(await getCustomerCreditDetail(request.params.id));
    } catch (error) {
      next(error);
    }
  });
*/

  app.get("/api/customers/:id/opportunity", async (request, response, next) => {
    try {
      const opportunity = await getCustomerOpportunity(request.params.id);
      if (!opportunity) {
        throw new HttpError(404, "Cliente nao encontrado");
      }
      response.json(opportunity);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/customers/:id/labels", async (request, response, next) => {
    try {
      const customer = await updateCustomerLabels(request.params.id, customerLabelUpdateSchema.parse(request.body));
      if (!customer) {
        throw new HttpError(404, "Cliente não encontrado");
      }
      response.json(customer);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/customers/batch/labels", async (request, response, next) => {
    try {
      const { customerIds, labelName } = request.body;
      if (!Array.isArray(customerIds) || !labelName) {
        throw new HttpError(400, "customerIds (array) e labelName (string) são obrigatórios");
      }
      await bulkAssignLabelToCustomers(customerIds, labelName);
      response.json({ success: true });
    } catch (error) {
      next(error);
    }
  });


  app.get("/api/customer-labels", async (_request, response, next) => {
    try {
      response.json(await listCustomerLabels());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/customer-labels", async (request, response, next) => {
    try {
      response.status(201).json(await createCustomerLabel(createCustomerLabelSchema.parse(request.body).name));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/customer-labels/:id", async (request, response, next) => {
    try {
      const updated = await updateCustomerLabel(request.params.id, updateCustomerLabelSchema.parse(request.body).color);
      if (!updated) {
        throw new HttpError(404, "Rótulo não encontrado");
      }
      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/customer-labels/:id", async (request, response, next) => {
    try {
      const deleted = await deleteCustomerLabel(request.params.id);
      if (!deleted) {
        throw new HttpError(404, "Rótulo não encontrado");
      }
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/segments/preview", async (request, response, next) => {
    try {
      response.json(await previewSegment(segmentSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/customers/:id/ambassador", async (request, response, next) => {
    try {
      const customer = await updateCustomerAmbassador(request.params.id, customerAmbassadorSchema.parse(request.body).isAmbassador);
      if (!customer) {
        throw new HttpError(404, "Cliente não encontrado");
      }
      response.json(customer);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/segments/saved", async (_request, response, next) => {
    try {
      response.json(await listSavedSegments());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/segments/saved", async (request, response, next) => {
    try {
      response.status(201).json(await createSavedSegment(savedSegmentSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/segments/saved/:id", async (request, response, next) => {
    try {
      const savedSegment = await updateSavedSegment(request.params.id, savedSegmentSchema.parse(request.body));
      if (!savedSegment) {
        throw new HttpError(404, "Publico salvo nao encontrado");
      }
      response.json(savedSegment);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/segments/saved/:id", async (request, response, next) => {
    try {
      const deleted = await deleteSavedSegment(request.params.id);
      if (!deleted) {
        throw new HttpError(404, "Publico salvo nao encontrado");
      }
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/geographic/sync", async (_request, response, next) => {
    try {
      response.json(await syncGeographicData());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/geographic/stats", async (_request, response, next) => {
    try {
      response.json(await getGeographicStats());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/geographic/sales", async (_request, response, next) => {
    try {
      response.json(await getGeographicSalesStats());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/geographic/model-sales", async (request, response, next) => {
    try {
      const state = request.query.state ? String(request.query.state) : undefined;
      const city = request.query.city ? String(request.query.city) : undefined;
      const year = request.query.year ? Number(request.query.year) : undefined;
      response.json(await getGeographicModelSales({ state, city, year }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/geographic/cities/:state", async (request, response, next) => {
    try {
      response.json(await getCitiesByState(request.params.state));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/automations", async (_request, response, next) => {
    try {
      response.json(await listMessageAutomations());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/automations", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      response.status(201).json(await createMessageAutomation(automationSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/automations/:id", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const updated = await updateMessageAutomation(String(request.params.id), automationSchema.parse(request.body));
      if (!updated) {
        throw new HttpError(404, "Automacao nao encontrada");
      }
      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/automations/:id", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const deleted = await deleteMessageAutomation(String(request.params.id));
      if (!deleted) {
        throw new HttpError(404, "Automacao nao encontrada");
      }
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/automations/:id/run-now", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const payload = automationRunNowSchema.parse(request.body ?? {});
      response.json(await runMessageAutomationNow(String(request.params.id), request.user!, payload.sendMode));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/automations/runs", async (request, response, next) => {
    try {
      const query = automationRunsQuerySchema.parse(request.query);
      response.json(await listMessageAutomationRuns(query.limit ?? 100));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/automations/runs/:id/approve", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      response.json(await approveMessageAutomationRun(String(request.params.id), request.user!));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/automations/runs/:id/reject", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      response.json(await rejectMessageAutomationRun(String(request.params.id), request.user!));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/messages/templates", async (_request, response, next) => {
    try {
      response.json(await listMessageTemplates());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/messages/templates", async (request, response, next) => {
    try {
      response.status(201).json(await createMessageTemplate(messageSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/messages/templates/:id", async (request, response, next) => {
    try {
      const updated = await updateMessageTemplate(request.params.id, messageSchema.parse(request.body));
      if (!updated) {
        throw new HttpError(404, "Template não encontrado");
      }
      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/messages/templates/:id", async (request, response, next) => {
    try {
      await deleteMessageTemplate(request.params.id);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Alerta "Saida da Base": previa de quem virou INATIVO hoje. Por padrao roda em
  // dry-run (so devolve as mensagens, nao envia). Passe ?send=true para forcar o
  // envio real ao grupo (respeita OFFBOARDING_ALERT_ENABLED + group jid).
  app.get("/api/offboarding-alert/preview", async (request, response, next) => {
    try {
      const dryRun = request.query.send !== "true";
      const result = await runOffboardingAlert({ dryRun });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Lote programado para os proximos dias (o que o automatico vai disparar).
  // ?days=1 (default) = quem vira inativo amanha.
  app.get("/api/offboarding-alert/upcoming", async (request, response, next) => {
    try {
      const days = Math.max(1, Math.min(30, Number(request.query.days ?? 1) || 1));
      const customers = await findUpcomingInactive(days);
      response.json({ days, customers });
    } catch (error) {
      next(error);
    }
  });

  // Navegacao por dia: quem cruza os 90 dias exatamente em ?offset dias
  // (0 = hoje, 1 = amanha, -1 = ontem, etc.).
  app.get("/api/offboarding-alert/day", async (request, response, next) => {
    try {
      const offset = Math.max(-365, Math.min(365, Math.trunc(Number(request.query.offset ?? 0)) || 0));
      const customers = await findInactiveByDayOffset(offset);
      response.json({ offset, customers });
    } catch (error) {
      next(error);
    }
  });

  // Backlog de quem JA esta inativo. ?withinDays=30 limita a quem entrou nos
  // ultimos N dias; omitir (ou ?withinDays=all) traz todo o backlog.
  app.get("/api/offboarding-alert/backlog", async (request, response, next) => {
    try {
      const raw = request.query.withinDays;
      const withinDays = raw === undefined || raw === "all" || raw === "" ? null : Math.max(0, Number(raw) || 0);
      const customers = await findInactiveBacklog(withinDays);
      response.json({ withinDays, customers });
    } catch (error) {
      next(error);
    }
  });

  // Envio MANUAL dos clientes selecionados pela interface.
  app.post("/api/offboarding-alert/send", async (request, response, next) => {
    try {
      const ids = request.body?.customerIds;
      if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string")) {
        throw new HttpError(400, "Informe customerIds (array de IDs de cliente).");
      }
      const result = await sendOffboardingForCustomers(ids);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  // ── Automacao de carteira (regua de relacionamento) ──
  app.get("/api/lifecycle/overview", async (_request, response, next) => {
    try {
      response.json(await getLifecycleOverview());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/lifecycle/config", async (_request, response, next) => {
    try {
      response.json(await getLifecycleConfig());
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/lifecycle/config/:stage", async (request, response, next) => {
    try {
      const stage = request.params.stage as LifecycleStage;
      if (!LIFECYCLE_STAGES.includes(stage)) {
        throw new HttpError(400, "Estagio invalido.");
      }
      const templateId = request.body?.templateId ?? null;
      const enabled = request.body?.enabled !== false;
      if (templateId !== null && typeof templateId !== "string") {
        throw new HttpError(400, "templateId invalido.");
      }
      await setLifecycleConfig(stage, templateId, enabled);
      response.json(await getLifecycleConfig());
    } catch (error) {
      next(error);
    }
  });

  // Roda a automacao manualmente agora (respeita LIFECYCLE_SIMULATION_ONLY).
  app.post("/api/lifecycle/run", async (_request, response, next) => {
    try {
      response.json(await runLifecycleAutomation());
    } catch (error) {
      next(error);
    }
  });

  // Fila de envios programados (quem vai cruzar pra um estagio nos proximos N dias).
  app.get("/api/lifecycle/scheduled", async (request, response, next) => {
    try {
      const days = Math.max(1, Math.min(60, Number(request.query.days ?? 7) || 7));
      const entries = await findScheduledLifecycle(days);
      response.json({ days, entries });
    } catch (error) {
      next(error);
    }
  });

  // Recuperacao: quem voltou a comprar depois do follow-up.
  app.get("/api/lifecycle/recovery", async (_request, response, next) => {
    try {
      response.json(await getLifecycleRecovery());
    } catch (error) {
      next(error);
    }
  });

  // Jornada por cliente: etapas enviadas, recompra (atribuicao) e resposta.
  app.get("/api/lifecycle/journeys", async (request, response, next) => {
    try {
      const limit = Math.max(1, Math.min(500, Number(request.query.limit ?? 100) || 100));
      response.json({ journeys: await getLifecycleJourneys(limit) });
    } catch (error) {
      next(error);
    }
  });

  // Handoff: avisa o grupo/vendedora que um cliente respondeu ao follow-up.
  app.post("/api/lifecycle/handoff", async (request, response, next) => {
    try {
      const customerId = request.body?.customerId;
      if (typeof customerId !== "string" || !customerId) {
        throw new HttpError(400, "Informe customerId.");
      }
      response.json(await sendLifecycleHandoff(customerId));
    } catch (error) {
      next(error);
    }
  });

  // Dispara follow-up individual agora
  app.post("/api/lifecycle/trigger-individual", async (request, response, next) => {
    try {
      const { customerId, targetStage } = request.body;
      if (!customerId || !targetStage) {
        throw new HttpError(400, "Informe customerId e targetStage.");
      }
      const res = await triggerIndividualLifecycle(customerId, targetStage);
      response.json(res);
    } catch (error) {
      next(error);
    }
  });

  // Pula follow-up individual agora
  app.post("/api/lifecycle/skip-individual", async (request, response, next) => {
    try {
      const { customerId, targetStage } = request.body;
      if (!customerId || !targetStage) {
        throw new HttpError(400, "Informe customerId e targetStage.");
      }
      const res = await skipIndividualLifecycle(customerId, targetStage);
      response.json(res);
    } catch (error) {
      next(error);
    }
  });

  // Recebe um vídeo MP4 (base64), salva no disco do backend e devolve uma URL
  // pública. O disparo passa a mandar essa URL pros provedores em vez do base64
  // gigante — é o que elimina de vez o timeout e o "Bad Request" no vídeo.
  app.post("/api/messages/upload-video", async (request, response, next) => {
    try {
      const { fileBase64, fileName } = (request.body ?? {}) as {
        fileBase64?: string;
        fileName?: string;
      };

      if (!fileBase64 || typeof fileBase64 !== "string") {
        throw new HttpError(400, "fileBase64 é obrigatório");
      }

      // Aceita tanto data URL ("data:video/mp4;base64,AAAA") quanto base64 puro.
      let base64 = fileBase64;
      let mime = "video/mp4";
      if (fileBase64.startsWith("data:")) {
        const match = fileBase64.match(/^data:([^;]+);base64,(.*)$/s);
        if (match && match[1] && match[2]) {
          mime = match[1];
          base64 = match[2];
        }
      }

      if (mime !== "video/mp4") {
        throw new HttpError(400, "Formato inválido. Envie um vídeo MP4 (video/mp4).");
      }

      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length) {
        throw new HttpError(400, "Arquivo de vídeo inválido ou vazio.");
      }
      if (buffer.length > 64 * 1024 * 1024) {
        throw new HttpError(413, "Vídeo muito grande. Máximo 64MB.");
      }

      const objectName = `${Date.now()}-${randomUUID()}.mp4`;
      await fsPromises.mkdir(campaignMediaDir, { recursive: true });
      await fsPromises.writeFile(path.join(campaignMediaDir, objectName), buffer);

      const base = (env.PUBLIC_URL || "https://xpcrm-crm-backend.f0dgeg.easypanel.host").replace(/\/+$/, "");
      const url = `${base}/media/campaign-videos/${objectName}`;
      logger.info("🎥 Vídeo de campanha hospedado", { objectName, bytes: buffer.length, sourceName: fileName ?? null });
      response.json({ url });
    } catch (error) {
      next(error);
    }
  });

  // Recebe uma imagem (base64), salva no disco do backend e devolve uma URL
  // pública. Usado pelo cabeçalho do menu interativo: o provedor (UAZAPI) precisa
  // de uma URL acessível, então hospedamos em vez de pedir o link ao usuário.
  app.post("/api/messages/upload-image", async (request, response, next) => {
    try {
      const { fileBase64, fileName } = (request.body ?? {}) as {
        fileBase64?: string;
        fileName?: string;
      };

      if (!fileBase64 || typeof fileBase64 !== "string") {
        throw new HttpError(400, "fileBase64 é obrigatório");
      }

      // Aceita data URL ("data:image/png;base64,AAAA") ou base64 puro (assume jpeg).
      let base64 = fileBase64;
      let mime = "image/jpeg";
      if (fileBase64.startsWith("data:")) {
        const match = fileBase64.match(/^data:([^;]+);base64,(.*)$/s);
        if (match && match[1] && match[2]) {
          mime = match[1].toLowerCase();
          base64 = match[2];
        }
      }

      const extension = IMAGE_MIME_EXTENSIONS[mime];
      if (!extension) {
        throw new HttpError(400, "Formato inválido. Envie uma imagem JPG, PNG, GIF ou WEBP.");
      }

      const buffer = Buffer.from(base64, "base64");
      if (!buffer.length) {
        throw new HttpError(400, "Arquivo de imagem inválido ou vazio.");
      }
      if (buffer.length > 10 * 1024 * 1024) {
        throw new HttpError(413, "Imagem muito grande. Máximo 10MB.");
      }

      const objectName = `${Date.now()}-${randomUUID()}.${extension}`;
      await fsPromises.mkdir(campaignMediaDir, { recursive: true });
      await fsPromises.writeFile(path.join(campaignMediaDir, objectName), buffer);

      const base = (env.PUBLIC_URL || "https://xpcrm-crm-backend.f0dgeg.easypanel.host").replace(/\/+$/, "");
      const url = `${base}/media/campaign-images/${objectName}`;
      logger.info("🖼️ Imagem de campanha hospedada", { objectName, bytes: buffer.length, sourceName: fileName ?? null });
      response.json({ url });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/messages/test", async (request, response, next) => {
    try {
      const { messageText: rawTestMessageText, messageType, carouselData, menuData, videoUrl, imageUrl, whatsappInstanceId } = request.body;
      const testNumber = "5511911279702@s.whatsapp.net";
      // No teste não existe cliente real, então o {nome} é substituído por um
      // exemplo ("Cliente") para o usuário confirmar que a variável funciona.
      const { applyWhatsappMessagePlaceholders } = await import("./modules/whatsapp/whatsappCore.js");
      const messageText = applyWhatsappMessagePlaceholders(String(rawTestMessageText ?? ""), { nome: "Cliente" });

      logger.info("📱 Test message request received", {
        messageType,
        hasCarousel: !!carouselData,
        carouselSlides: carouselData?.length || 0,
        hasMenu: !!menuData,
        menuChoices: menuData?.choices?.length || 0,
        hasVideo: !!videoUrl,
        instanceId: whatsappInstanceId,
        messageLength: messageText?.length || 0
      });

      if (!messageText && messageType !== "CAROUSEL" && messageType !== "VIDEO" && messageType !== "IMAGE") {
        throw new HttpError(400, "Mensagem de texto é obrigatória");
      }

      if (messageType === "IMAGE" && !imageUrl?.trim()) {
        throw new HttpError(400, "Imagem é obrigatória para mensagens de imagem.");
      }

      if (messageType === "MENU" && !menuData?.choices?.length) {
        throw new HttpError(400, "Adicione ao menos uma opção para o menu interativo.");
      }

      // Import services
      const { sendUazapiCarouselMessage, sendUazapiTextMessage, sendUazapiVideoMessage, sendUazapiMenuMessage, sendUazapiImageMessage } = await import("./modules/whatsapp/uazapiService.js");
      const { sendWhatsappInstanceTextMessage, sendWhatsappTextMessage } = await import("./modules/whatsapp/evolutionService.js");
      
      // Get WhatsApp instance if specified
      let instanceConfig: any = null;
      if (whatsappInstanceId) {
        try {
          const instanceResult = await pool.query(
            `SELECT 
              provider, 
              instance_name AS evolution_instance_name, 
              evolution_base_url, 
              evolution_api_key, 
              uazapi_base_url, 
              uazapi_token,
              display_label
            FROM whatsapp_instances 
            WHERE id = $1`,
            [whatsappInstanceId]
          );
          
          if (instanceResult.rows[0]) {
            const row = instanceResult.rows[0];
            logger.info("✅ Found WhatsApp instance", { 
              provider: row.provider, 
              label: row.display_label,
              hasUazapiConfig: !!(row.uazapi_base_url && row.uazapi_token),
              hasEvolutionConfig: !!(row.evolution_instance_name && row.evolution_base_url && row.evolution_api_key)
            });
            
            if (row.provider === "UAZAPI" && row.uazapi_base_url && row.uazapi_token) {
              instanceConfig = {
                provider: "UAZAPI",
                baseUrl: String(row.uazapi_base_url),
                token: String(row.uazapi_token)
              };
            } else if (row.evolution_instance_name && row.evolution_base_url && row.evolution_api_key) {
              instanceConfig = {
                provider: "EVOLUTION",
                instanceName: String(row.evolution_instance_name),
                evolutionBaseUrl: String(row.evolution_base_url),
                evolutionApiKey: String(row.evolution_api_key)
              };
            } else {
              logger.warn("⚠️ Instance found but missing configuration");
            }
          } else {
            logger.warn("⚠️ No active instance found with ID", { whatsappInstanceId });
          }
        } catch (dbError: any) {
          logger.error("❌ Database error fetching instance, using default", { error: dbError.message });
          // Don't throw, just use default Evolution
        }
      }

      let result: any;
      
      // Validate carousel support
      if (messageType === "CAROUSEL" && carouselData?.length) {
        if (!instanceConfig || instanceConfig.provider !== "UAZAPI") {
          throw new HttpError(400, "Carrossel só é suportado com instâncias UazAPI. Por favor, selecione uma instância UazAPI ou mude para mensagem de texto.");
        }
      }

      // Validate interactive menu support
      if (messageType === "MENU") {
        if (!instanceConfig || instanceConfig.provider !== "UAZAPI") {
          throw new HttpError(400, "Menu interativo só é suportado com instâncias UazAPI. Por favor, selecione uma instância UazAPI ou mude para mensagem de texto.");
        }
      }

      // Send message based on provider and type
      try {
        if (instanceConfig?.provider === "UAZAPI" && messageType === "MENU" && menuData?.choices?.length) {
          logger.info("📋 Sending interactive menu test via UazAPI", { menuType: menuData.menuType, choices: menuData.choices.length });
          result = await sendUazapiMenuMessage(
            { baseUrl: instanceConfig.baseUrl, token: instanceConfig.token },
            testNumber,
            messageText,
            menuData
          );
        } else if (instanceConfig?.provider === "UAZAPI" && messageType === "CAROUSEL" && carouselData?.length) {
          logger.info("🎠 Sending carousel test via UazAPI", { slides: carouselData.length });
          result = await sendUazapiCarouselMessage(
            { baseUrl: instanceConfig.baseUrl, token: instanceConfig.token },
            testNumber,
            carouselData
          );
        } else if (instanceConfig?.provider === "UAZAPI" && messageType === "VIDEO" && videoUrl) {
          logger.info("🎥 Sending video test via UazAPI");
          result = await sendUazapiVideoMessage(
            { baseUrl: instanceConfig.baseUrl, token: instanceConfig.token },
            testNumber,
            videoUrl,
            messageText
          );
        } else if (instanceConfig?.provider === "UAZAPI" && messageType === "IMAGE" && imageUrl) {
          logger.info("🖼️ Sending image test via UazAPI");
          result = await sendUazapiImageMessage(
            { baseUrl: instanceConfig.baseUrl, token: instanceConfig.token },
            testNumber,
            imageUrl,
            messageText
          );
        } else if (instanceConfig?.provider === "UAZAPI") {
          logger.info("💬 Sending text test via UazAPI");
          result = await sendUazapiTextMessage(
            { baseUrl: instanceConfig.baseUrl, token: instanceConfig.token },
            testNumber,
            messageText
          );
        } else if (instanceConfig?.provider === "EVOLUTION") {
          if (messageType === "VIDEO" && videoUrl) {
            logger.info("🎥 Sending video test via Evolution instance");
            const { sendWhatsappInstanceMediaMessage } = await import("./modules/whatsapp/evolutionService.js");
            result = await sendWhatsappInstanceMediaMessage(
              {
                instanceName: instanceConfig.instanceName,
                evolutionBaseUrl: instanceConfig.evolutionBaseUrl,
                evolutionApiKey: instanceConfig.evolutionApiKey
              },
              testNumber,
              videoUrl,
              "video",
              "video.mp4",
              messageText
            );
          } else if (messageType === "IMAGE" && imageUrl) {
            logger.info("🖼️ Sending image test via Evolution instance");
            const { sendWhatsappInstanceMediaMessage } = await import("./modules/whatsapp/evolutionService.js");
            result = await sendWhatsappInstanceMediaMessage(
              {
                instanceName: instanceConfig.instanceName,
                evolutionBaseUrl: instanceConfig.evolutionBaseUrl,
                evolutionApiKey: instanceConfig.evolutionApiKey
              },
              testNumber,
              imageUrl,
              "image",
              "image.jpg",
              messageText
            );
          } else {
            logger.info("💬 Sending text test via Evolution instance");
            result = await sendWhatsappInstanceTextMessage(
              {
                instanceName: instanceConfig.instanceName,
                evolutionBaseUrl: instanceConfig.evolutionBaseUrl,
                evolutionApiKey: instanceConfig.evolutionApiKey
              },
              testNumber,
              messageText
            );
          }
        } else {
          if (messageType === "VIDEO" && videoUrl) {
            logger.info("🎥 Sending video test via default Evolution");
            const { sendWhatsappInstanceMediaMessage } = await import("./modules/whatsapp/evolutionService.js");
            result = await sendWhatsappInstanceMediaMessage(
              {
                instanceName: env.EVOLUTION_INSTANCE_NAME,
                evolutionBaseUrl: env.EVOLUTION_API_BASE_URL,
                evolutionApiKey: env.EVOLUTION_API_KEY
              },
              testNumber,
              videoUrl,
              "video",
              "video.mp4",
              messageText
            );
          } else if (messageType === "IMAGE" && imageUrl) {
            logger.info("🖼️ Sending image test via default Evolution");
            const { sendWhatsappInstanceMediaMessage } = await import("./modules/whatsapp/evolutionService.js");
            result = await sendWhatsappInstanceMediaMessage(
              {
                instanceName: env.EVOLUTION_INSTANCE_NAME,
                evolutionBaseUrl: env.EVOLUTION_API_BASE_URL,
                evolutionApiKey: env.EVOLUTION_API_KEY
              },
              testNumber,
              imageUrl,
              "image",
              "image.jpg",
              messageText
            );
          } else {
            logger.info("💬 Sending text test via default Evolution");
            result = await sendWhatsappTextMessage(testNumber, messageText);
          }
        }
      } catch (sendError: any) {
        logger.error("❌ Error sending message", { 
          error: sendError.message,
          stack: sendError.stack,
          responsePayload: sendError.responsePayload
        });
        const providerStatusCode = Number(sendError.statusCode ?? 500);
        const isVideoValidationError = String(sendError.message ?? "").includes("Formato de video invalido");
        const statusCode = isVideoValidationError || (providerStatusCode >= 400 && providerStatusCode < 500) ? 400 : 500;
        throw new HttpError(statusCode, `Erro ao enviar mensagem: ${sendError.message}`);
      }

      logger.info("✅ Test message sent successfully");
      response.json({ success: true, result });
    } catch (error: any) {
      logger.error("❌ Test message endpoint error", { 
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  });

  // Endpoint para enviar mensagem WhatsApp real (usado no mini chat)
  app.post("/api/whatsapp/send-message", async (request, response, next) => {
    try {
      const { instanceId, jid, message, campaignId } = request.body;

      if (!instanceId || !jid || !message) {
        throw new HttpError(400, "instanceId, jid e message são obrigatórios");
      }

      logger.info("📱 Sending WhatsApp message", { instanceId, jid, messageLength: message.length });

      // Buscar configuração da instância
      const instanceResult = await pool.query(
        `SELECT 
          provider, 
          instance_name AS evolution_instance_name, 
          evolution_base_url, 
          evolution_api_key, 
          uazapi_base_url, 
          uazapi_token,
          display_label
        FROM whatsapp_instances 
        WHERE id = $1 AND status = 'ACTIVE'`,
        [instanceId]
      );
      
      if (!instanceResult.rows[0]) {
        throw new HttpError(404, "Instância WhatsApp não encontrada ou inativa");
      }

      const instance = instanceResult.rows[0];
      const { sendUazapiTextMessage } = await import("./modules/whatsapp/uazapiService.js");
      const { sendWhatsappInstanceTextMessage } = await import("./modules/whatsapp/evolutionService.js");
      
      let result: Record<string, any>;
      
      if (instance.provider === "UAZAPI" && instance.uazapi_base_url && instance.uazapi_token) {
        result = await sendUazapiTextMessage(
          { baseUrl: String(instance.uazapi_base_url), token: String(instance.uazapi_token) },
          jid,
          message
        );
      } else if (instance.evolution_instance_name && instance.evolution_base_url && instance.evolution_api_key) {
        result = await sendWhatsappInstanceTextMessage(
          {
            instanceName: String(instance.evolution_instance_name),
            evolutionBaseUrl: String(instance.evolution_base_url),
            evolutionApiKey: String(instance.evolution_api_key)
          },
          jid,
          message
        );
      } else {
        throw new HttpError(500, "Configuração da instância WhatsApp inválida");
      }

      logger.info("✅ WhatsApp message sent successfully", { messageId: result?.key?.id });

      // Persiste o envio para o histórico do mini chat sobreviver ao reload
      await pool
        .query(
          `
            INSERT INTO message_logs (destination, message, status, campaign_id, sent_by_user_id, sent_by_name)
            VALUES ($1, $2, 'SENT', $3, $4, $5)
          `,
          [jid, message, campaignId ?? null, request.user?.id ?? null, request.user?.name ?? null],
        )
        .catch((logError) => {
          logger.warn("failed to persist mini chat message log", { error: String(logError) });
        });

      response.json({ success: true, messageId: (result as any)?.key?.id || `msg-${Date.now()}` });
    } catch (error: any) {
      logger.error("❌ Send WhatsApp message error", { error: error.message, stack: error.stack });
      next(error);
    }
  });

  app.get("/api/ideas", async (request, response, next) => {
    try {
      response.json(await listIdeas(request.user!));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ideas", async (request, response, next) => {
    try {
      const created = await createIdea(createIdeaSchema.parse(request.body), request.user!);
      response.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/ideas/:id", async (request, response, next) => {
    try {
      const idea = await getIdeaDetail(String(request.params.id), request.user!);
      if (!idea) {
        throw new HttpError(404, "Ideia nao encontrada");
      }
      response.json(idea);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ideas/:id/notify-whatsapp", async (request, response, next) => {
    try {
      const idea = await getIdeaDetail(String(request.params.id), request.user!);
      if (!idea) {
        throw new HttpError(404, "Ideia nao encontrada");
      }

      await notifyIdeaBoardNewIdea(idea);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/ideas/:id/feedback", async (request, response, next) => {
    try {
      const idea = await getIdeaDetail(String(request.params.id), request.user!);
      if (!idea) {
        throw new HttpError(404, "Ideia nao encontrada");
      }
      response.json(await listIdeaFeedbacks(String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/ideas/:id/vote", async (request, response, next) => {
    try {
      response.json(
        await submitIdeaVote(String(request.params.id), request.user!, submitIdeaVoteSchema.parse(request.body)),
      );
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/ideas/:id/lane", async (request, response, next) => {
    try {
      response.json(await moveIdeaToLane(String(request.params.id), request.user!, moveIdeaLaneSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/ideas/:id", async (request, response, next) => {
    try {
      await deleteIdea(String(request.params.id), request.user!);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp-groups", async (request, response, next) => {
    try {
      const query = whatsappGroupFiltersQuerySchema.parse(request.query);
      response.json(
        await listWhatsappGroups({
          ...query,
          classification: parseClassificationList(query.classification),
          mappingStatus: parseMappingStatusList(query.mappingStatus),
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp-groups/mapping-summary", async (request, response, next) => {
    try {
      const query = whatsappMappingSummaryQuerySchema.parse(request.query);
      response.json(await getWhatsappMappingSummary(query));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-groups/import", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const payload = whatsappImportSchema.parse(request.body);
      response.status(201).json(
        await importWhatsappGroupsFromWorkbook(decodeBase64File(payload.fileBase64)),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-groups/import-default", requireRole(["ADMIN", "MANAGER"]), async (_request, response, next) => {
    try {
      response.status(201).json(await importWhatsappGroupsFromDefaultWorkbook());
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/whatsapp-groups/:id/match", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      response.json(await updateWhatsappGroupMatch(String(request.params.id), whatsappGroupMatchSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp-campaigns", async (request, response, next) => {
    try {
      const query = whatsappCampaignListQuerySchema.parse(request.query);
      response.json(await listWhatsappCampaigns(query.limit ?? 20));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp-campaigns/:id", async (request, response, next) => {
    try {
      const query = whatsappCampaignDetailQuerySchema.parse(request.query);
      const detail = await getWhatsappCampaignDetail(
        String(request.params.id),
        query.limit ?? 100,
        query.offset ?? 0,
        query.excludePerformance,
      );
      if (!detail) {
        throw new HttpError(404, "Campanha nao encontrada.");
      }
      response.json(detail);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-campaigns", async (request, response, next) => {
    try {
      const payload = whatsappCampaignCreateSchema.parse(request.body);
      if (payload.messageType === "MENU") {
        if (!payload.menuData?.choices?.length) {
          throw new HttpError(400, "Adicione ao menos uma opcao para o menu interativo.");
        }

        if (!payload.whatsappInstanceId) {
          throw new HttpError(400, "Menu interativo so e suportado com instancias UazAPI.");
        }

        const menuInstanceResult = await pool.query(
          `SELECT provider FROM whatsapp_instances WHERE id = $1`,
          [payload.whatsappInstanceId],
        );
        if (menuInstanceResult.rows[0]?.provider !== "UAZAPI") {
          throw new HttpError(400, "Menu interativo so e suportado com instancias UazAPI.");
        }
      }

      if (payload.messageType === "VIDEO") {
        if (!payload.videoUrl?.trim()) {
          throw new HttpError(400, "Video MP4 e obrigatorio para campanhas de video.");
        }

        try {
          assertSupportedOutboundVideo(payload.videoUrl);
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : String(error));
        }
      }

      if (payload.messageType === "IMAGE" && !payload.imageUrl?.trim()) {
        throw new HttpError(400, "Imagem e obrigatoria para campanhas de imagem.");
      }

      // Only enforce Evolution config when not using a specific instance
      if (!payload.whatsappInstanceId) {
        ensureEvolutionConfigured();
      }
      const created = await createWhatsappCampaign(payload, request.user!);
      await enqueueWhatsappCampaignRecipients(created.enqueuedJobs);

      // Garante que respostas de instâncias uazapi cheguem ao CRM: aponta o
      // webhook da instância para /api/webhooks/uazapi (idempotente, não bloqueia).
      // Só roda se explicitamente habilitado (UAZAPI_AUTO_CONFIGURE_WEBHOOK=true);
      // por padrão o CRM não mexe no webhook da uazapi.
      if (env.UAZAPI_AUTO_CONFIGURE_WEBHOOK && payload.whatsappInstanceId) {
        void (async () => {
          const instanceResult = await pool.query(
            `SELECT provider, uazapi_base_url, uazapi_token FROM whatsapp_instances WHERE id = $1`,
            [payload.whatsappInstanceId],
          );
          const instance = instanceResult.rows[0];
          if (instance?.provider === "UAZAPI" && instance.uazapi_base_url && instance.uazapi_token) {
            const { configureUazapiWebhook } = await import("./modules/whatsapp/uazapiService.js");
            const base = (env.PUBLIC_URL || "https://xpcrm-crm-backend.f0dgeg.easypanel.host").replace(/\/+$/, "");
            await configureUazapiWebhook(
              { baseUrl: String(instance.uazapi_base_url), token: String(instance.uazapi_token) },
              `${base}/api/webhooks/uazapi`,
            );
          }
        })().catch((error) => {
          logger.warn("uazapi webhook auto-config failed", { error: String(error) });
        });
      }

      const detail = await getWhatsappCampaignDetail(created.campaignId, 100, 0, true);
      response.status(201).json(detail);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-campaigns/:id/pause", async (request, response, next) => {
    try {
      const campaignId = String(request.params.id);
      const access = await getWhatsappCampaignAccess(campaignId);
      if (!access) {
        throw new HttpError(404, "Campanha nao encontrada.");
      }

      const user = request.user!;
      if (!["ADMIN", "MANAGER"].includes(user.role) && access.createdByUserId !== user.id) {
        throw new HttpError(403, "Voce nao tem permissao para pausar esta campanha.");
      }

      response.json(await pauseWhatsappCampaign(campaignId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-campaigns/:id/resume", async (request, response, next) => {
    try {
      const campaignId = String(request.params.id);
      const access = await getWhatsappCampaignAccess(campaignId);
      if (!access) {
        throw new HttpError(404, "Campanha nao encontrada.");
      }

      const user = request.user!;
      if (!["ADMIN", "MANAGER"].includes(user.role) && access.createdByUserId !== user.id) {
        throw new HttpError(403, "Voce nao tem permissao para retomar esta campanha.");
      }

      // Tira de PAUSED -> IN_PROGRESS e cutuca o dispatcher pra continuar de onde parou.
      const detail = await resumeWhatsappCampaign(campaignId);
      await resumeDueWhatsappCampaignRecipients(campaignId, 1);
      response.json(detail);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-campaigns/:id/retry-failed", async (request, response, next) => {
    try {
      const campaignId = String(request.params.id);
      const access = await getWhatsappCampaignAccess(campaignId);
      if (!access) {
        throw new HttpError(404, "Campanha nao encontrada.");
      }

      const user = request.user!;
      if (!["ADMIN", "MANAGER"].includes(user.role) && access.createdByUserId !== user.id) {
        throw new HttpError(403, "Voce nao tem permissao para alterar esta campanha.");
      }

      const { retried, detail } = await retryAllFailedWhatsappCampaignRecipients(campaignId);
      if (retried > 0) {
        await resumeDueWhatsappCampaignRecipients(campaignId, 1);
      }
      response.json({ retried, ...detail });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-campaigns/:id/cancel", async (request, response, next) => {
    try {
      const access = await getWhatsappCampaignAccess(String(request.params.id));
      if (!access) {
        throw new HttpError(404, "Campanha nao encontrada.");
      }

      const user = request.user!;
      if (!["ADMIN", "MANAGER"].includes(user.role) && access.createdByUserId !== user.id) {
        throw new HttpError(403, "Voce nao tem permissao para cancelar esta campanha.");
      }

      response.json(await cancelWhatsappCampaign(String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/whatsapp-campaigns/:id", async (request, response, next) => {
    try {
      const access = await getWhatsappCampaignAccess(String(request.params.id));
      if (!access) {
        throw new HttpError(404, "Campanha nao encontrada.");
      }

      const user = request.user!;
      if (!["ADMIN", "MANAGER"].includes(user.role) && access.createdByUserId !== user.id) {
        throw new HttpError(403, "Voce nao tem permissao para excluir esta campanha.");
      }

      await pool.query(`DELETE FROM whatsapp_campaigns WHERE id = $1`, [String(request.params.id)]);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-campaigns/:id/recipients/:recipientId/skip", async (request, response, next) => {
    try {
      const access = await getWhatsappCampaignAccess(String(request.params.id));
      if (!access) {
        throw new HttpError(404, "Campanha nao encontrada.");
      }

      const user = request.user!;
      if (!["ADMIN", "MANAGER"].includes(user.role) && access.createdByUserId !== user.id) {
        throw new HttpError(403, "Voce nao tem permissao para alterar esta campanha.");
      }

      response.json(await skipWhatsappCampaignRecipient(String(request.params.id), String(request.params.recipientId)));
    } catch (error) {
      next(error);
    }
  });

  // Conversa completa de um destinatário (mesmas fontes da atribuição do badge
  // "Respondeu", então o mini chat sempre mostra o que foi contado como resposta)
  app.post("/api/whatsapp-campaigns/:id/recipients/:recipientId/retry", async (request, response, next) => {
    try {
      const campaignId = String(request.params.id);
      const access = await getWhatsappCampaignAccess(campaignId);
      if (!access) {
        throw new HttpError(404, "Campanha nao encontrada.");
      }

      const user = request.user!;
      if (!["ADMIN", "MANAGER"].includes(user.role) && access.createdByUserId !== user.id) {
        throw new HttpError(403, "Voce nao tem permissao para alterar esta campanha.");
      }

      const result = await retryWhatsappCampaignRecipient(campaignId, String(request.params.recipientId));
      await resumeDueWhatsappCampaignRecipients(campaignId, 1);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp-campaigns/:id/recipients/:recipientId/chat", async (request, response, next) => {
    try {
      response.json({
        messages: await getWhatsappCampaignRecipientChat(
          String(request.params.id),
          String(request.params.recipientId),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/permissions", requirePermission("admin.users.manage"), async (_request, response, next) => {
    try {
      response.json(APP_PERMISSIONS);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/users", requirePermission("admin.users.manage"), async (_request, response, next) => {
    try {
      response.json(await listAdminUsers());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/users", requirePermission("admin.users.manage"), async (request, response, next) => {
    try {
      response.status(201).json(
        await createAdminUser(adminUserSchema.parse(request.body), request.user!.id),
      );
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/admin/users/:id", requirePermission("admin.users.manage"), async (request, response, next) => {
    try {
      response.json(await updateAdminUser(String(request.params.id), adminUserSchema.parse(request.body)));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/users/:id/status", requirePermission("admin.users.manage"), async (request, response, next) => {
    try {
      const payload = adminUserStatusSchema.parse(request.body);
      response.json(await setAdminUserActive(String(request.params.id), payload.isActive));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/users/:id/reset-password", requirePermission("admin.users.manage"), async (request, response, next) => {
    try {
      response.json(await createPasswordResetLink(String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/users/:id/password", requirePermission("admin.users.manage"), async (request, response, next) => {
    try {
      const payload = adminUserPasswordSchema.parse(request.body);
      response.json(await setAdminUserPassword(String(request.params.id), payload.password));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/import-runs", requireRole(["ADMIN"]), async (_request, response, next) => {
    try {
      const result = await pool.query("SELECT * FROM import_runs ORDER BY started_at DESC LIMIT 20");
      response.json(result.rows);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/sync-runs", requireRole(["ADMIN"]), async (_request, response, next) => {
    try {
      const result = await pool.query("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 20");
      response.json(result.rows);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/import-history", requireRole(["ADMIN"]), async (request, response, next) => {
    try {
      const payload = manualImportSchema.parse(request.body ?? {});
      if (payload.mode === "direct") {
        const files = payload.files?.length ? payload.files : env.HISTORICAL_FILES.split(";").filter(Boolean);
        const results = [];
        for (const file of files) {
          results.push(await importHistoryFile(file));
        }
        response.json({ mode: "direct", results });
        return;
      }

      const job = await enqueueHistoryImportJob(payload.files);
      response.status(202).json({ mode: "queue", jobId: job.id });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/sync/olist", requirePermission("settings.manage"), async (request, response, next) => {
    try {
      const payload = manualSyncSchema.parse(request.body ?? {});
      if (payload.mode === "direct") {
        response.json({ mode: "direct", result: await syncOlistIncremental() });
        return;
      }

      const job = await enqueueOlistSyncJob();
      response.status(202).json({ mode: "queue", jobId: job.id });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/sync", requirePermission("settings.manage"), async (request, response, next) => {
    try {
      const payload = manualSyncSchema.parse(request.body ?? {});
      if (payload.mode === "direct") {
        response.json({ mode: "direct", result: await runPrimarySync("manual-dashboard") });
        return;
      }

      const job = await enqueueOlistSyncJob();
      response.status(202).json({ mode: "queue", jobId: job.id });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/import-supabase-2026", requirePermission("settings.manage"), async (_request, response, next) => {
    try {
      response.json({ mode: "direct", result: await importSupabase2026() });
    } catch (error) {
      next(error);
    }
  });

  // ── Pipeline / Kanban ──────────────────────────────────────────

  const pipelineDealCreateSchema = z.object({
    title: z.string().min(1),
    customerId: z.string().uuid().nullable().optional(),
    stageId: z.string().uuid(),
    expectedValue: z.number().min(0).optional(),
    expectedCloseDate: z.string().nullable().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
    notes: z.string().optional(),
    whatsappInstanceId: z.string().uuid().nullable().optional(),
    whatsappJid: z.string().nullable().optional(),
  });

  const pipelineDealUpdateSchema = pipelineDealCreateSchema.partial().extend({
    lostReason: z.string().optional(),
  });

  const pipelineActivitySchema = z.object({
    activityType: z.enum(["NOTE", "CALL", "MEETING", "TASK", "WHATSAPP_SENT"]),
    content: z.string().min(1),
  });

  const pipelineStageMovSchema = z.object({
    stageId: z.string().uuid(),
  });

  const instanceCreateSchema = z.object({
    provider: z.enum(["EVOLUTION", "UAZAPI"]).optional().default("EVOLUTION"),
    instanceName: z.string().min(1),
    displayLabel: z.string().min(1),
    phoneNumber: z.string().optional(),
    evolutionBaseUrl: z.string().optional(),
    evolutionApiKey: z.string().optional(),
    uazapiBaseUrl: z.string().optional(),
    uazapiToken: z.string().optional(),
    isDefault: z.boolean().optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
    assignedUserName: z.string().nullable().optional(),
  });

  const whatsappMonitorAgentsQuerySchema = z.object({
    includeStats: optionalQueryBoolean,
  });

  const whatsappMonitorQuerySchema = z.object({
    instanceId: z.string().uuid().optional(),
    search: z.string().optional(),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    period: z.enum(["today", "yesterday", "7d", "30d"]).optional(),
    status: z.enum(["unread", "risk"]).optional(),
    group: z.enum(["groups", "contacts"]).optional(),
    agentInteraction: z.enum(["sent"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    updatedSince: z.string().optional(),
  });

  const whatsappMonitorConversationDetailQuerySchema = z.object({
    instanceId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    before: z.string().optional(),
    after: z.string().optional(),
  });

  const whatsappMonitorReadStateSchema = z.object({
    unread: z.boolean(),
  });

  const whatsappMonitorReplySchema = z.object({
    messageText: z.string().trim().min(1).max(4000),
  });

  const whatsappActivityReportQuerySchema = z.object({
    days: z.coerce.number().int().min(1).max(31).optional(),
  });

  const whatsappDailySummaryQuerySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

  app.get("/api/pipeline/summary", async (request, response, next) => {
    try {
      const includeClosed = request.query.includeClosed === "true";
      response.json(await getPipelineSummary(request.user!, includeClosed));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/pipeline/deals", async (request, response, next) => {
    try {
      const payload = pipelineDealCreateSchema.parse(request.body);
      response.status(201).json(await createDeal(payload, request.user!));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/pipeline/deals/:id", async (request, response, next) => {
    try {
      response.json(await getDealDetail(String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/pipeline/deals/:id", async (request, response, next) => {
    try {
      const payload = pipelineDealUpdateSchema.parse(request.body);
      response.json(await updateDeal(String(request.params.id), payload, request.user!));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/pipeline/deals/:id/stage", async (request, response, next) => {
    try {
      const payload = pipelineStageMovSchema.parse(request.body);
      response.json(await moveDealStage(String(request.params.id), payload.stageId, request.user!));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/pipeline/deals/:id/activities", async (request, response, next) => {
    try {
      const payload = pipelineActivitySchema.parse(request.body);
      response.status(201).json(await addDealActivity(String(request.params.id), payload, request.user!));
    } catch (error) {
      next(error);
    }
  });

  // ── WhatsApp Instances ────────────────────────────────────────

  app.get("/api/whatsapp-monitor/agents", async (request, response, next) => {
    const startedAt = Date.now();
    try {
      const query = whatsappMonitorAgentsQuerySchema.parse(request.query);
      const agents = await listWhatsappMonitorAgents(request.user!, query);
      response.json(agents);
      logWhatsappMonitorEndpointTiming("agents", startedAt, {
        count: agents.length,
        includeStats: query.includeStats !== false,
      });
    } catch (error) {
      logWhatsappMonitorEndpointTiming("agents", startedAt, {
        failed: true,
        error: String(error),
      });
      next(error);
    }
  });

  app.get("/api/whatsapp-monitor/conversations", async (request, response, next) => {
    const startedAt = Date.now();
    try {
      const query = whatsappMonitorQuerySchema.parse(request.query);
      const result = await listWhatsappMonitorConversations(request.user!, query);
      response.json(result);
      logWhatsappMonitorEndpointTiming("conversations", startedAt, {
        count: result.conversations.length,
        limit: result.pageInfo.limit,
        hasNextPage: result.pageInfo.hasNextPage,
        cursor: Boolean(query.cursor),
        updatedSince: Boolean(query.updatedSince),
        instanceId: query.instanceId ?? "all",
      });
    } catch (error) {
      logWhatsappMonitorEndpointTiming("conversations", startedAt, {
        failed: true,
        error: String(error),
      });
      next(error);
    }
  });

  app.get("/api/whatsapp-monitor/metrics", async (request, response, next) => {
    try {
      response.json(await getWhatsappMonitorMetrics(request.user!));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp-monitor/activity-report", async (request, response, next) => {
    const startedAt = Date.now();
    try {
      const query = whatsappActivityReportQuerySchema.parse(request.query);
      const report = await getWhatsappAgentActivityReport(request.user!, query.days);
      response.json(report);
      logWhatsappMonitorEndpointTiming("activity-report", startedAt, {
        days: query.days ?? 7,
        agents: report.agents.length,
        cells: report.hourlyCells.length,
      });
    } catch (error) {
      logWhatsappMonitorEndpointTiming("activity-report", startedAt, {
        failed: true,
        error: String(error),
      });
      next(error);
    }
  });

  app.get("/api/whatsapp-monitor/daily-summary", async (request, response, next) => {
    try {
      const query = whatsappDailySummaryQuerySchema.parse(request.query);
      response.json(await getWhatsappDailySummaryReport(request.user!, query.date));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp-monitor/conversations/:id", async (request, response, next) => {
    const startedAt = Date.now();
    try {
      const query = whatsappMonitorConversationDetailQuerySchema.parse(request.query);
      const result = await getWhatsappMonitorConversation(String(request.params.id), request.user!, query);
      response.json(result);
      logWhatsappMonitorEndpointTiming("conversation-detail", startedAt, {
        dealId: String(request.params.id),
        messages: result.messages.length,
        limit: result.pageInfo.limit,
        before: Boolean(query.before),
        after: Boolean(query.after),
        hasPreviousPage: result.pageInfo.hasPreviousPage,
      });
    } catch (error) {
      logWhatsappMonitorEndpointTiming("conversation-detail", startedAt, {
        dealId: String(request.params.id),
        failed: true,
        error: String(error),
      });
      next(error);
    }
  });

  app.patch("/api/whatsapp-monitor/conversations/:id/read-state", async (request, response, next) => {
    try {
      const payload = whatsappMonitorReadStateSchema.parse(request.body);
      response.json(await setWhatsappConversationReadState(String(request.params.id), request.user!, payload.unread));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-monitor/conversations/:id/replies", async (request, response, next) => {
    try {
      const payload = whatsappMonitorReplySchema.parse(request.body);
      response.status(201).json(await sendWhatsappMonitorReply(String(request.params.id), request.user!, payload.messageText));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-monitor/conversations/:id/media-replies", async (request, response, next) => {
    try {
      const { sendWhatsappMonitorMediaReply } = await import("./modules/whatsapp/whatsappMonitorService.js");
      response.status(201).json(await sendWhatsappMonitorMediaReply(String(request.params.id), request.user!, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-monitor/refresh-profiles", async (_request, response, next) => {
    try {
      response.json(await refreshMissingWhatsappMonitorProfiles());
    } catch (error) {
      next(error);
    }
  });

  // ── Messaging Intelligence Events ──────────────────────────

  const eventResolutionSchema = z.object({
    resolutionNote: z.string().trim().min(1).max(5000),
  });

  const eventsFiltersSchema = z.object({
    eventType: z.string().optional().transform(v => v ? v.split(",") as EventType[] : undefined),
    severity: z.string().optional().transform(v => v ? v.split(",") as EventSeverity[] : undefined),
    resolved: z.enum(["true", "false"]).optional().transform(v => v ? v === "true" : undefined),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    agentId: z.string().optional(),
    search: z.string().optional(),
    isGroup: z.enum(["true", "false"]).optional().transform(v => v ? v === "true" : undefined),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  });

  app.get("/api/events/metrics", async (request, response, next) => {
    try {
      const query = eventsFiltersSchema.parse(request.query);
      const metrics = await getEventsMetrics(request.user!, query);
      response.json(metrics);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/events/intelligence", async (request, response, next) => {
    try {
      const query = eventsFiltersSchema.parse(request.query);
      const intelligence = await getEventsIntelligence(request.user!, query);
      response.json(intelligence);
    } catch (error) {
      next(error);
    }
  });

  // Rota legada: agora dispara o motor novo (analise de conversas + briefing).
  app.post("/api/events/ai-batch/run", requireRole(["ADMIN", "MANAGER"]), (_request, response, next) => {
    try {
      response.json(startManualIntelligenceRun());
    } catch (error) {
      next(error);
    }
  });

  // ── Inteligencia de Mensagens v2 (conversas + briefing) ──

  const conversationInsightsQuerySchema = z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    attention: z.string().optional().transform((value) =>
      value ? value.split(",").filter((entry) => ["none", "low", "medium", "high", "critical"].includes(entry)) as Array<"none" | "low" | "medium" | "high" | "critical"> : undefined,
    ),
    flag: z.string().regex(/^[a-z_]+$/).optional(),
    topic: z.string().trim().max(60).optional(),
    search: z.string().optional(),
    isGroup: z.enum(["true", "false"]).optional().transform((value) => (value ? value === "true" : undefined)),
    agentName: z.string().optional(),
    onlyOpen: z.enum(["true", "false"]).optional().transform((value) => (value ? value === "true" : undefined)),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  });

  app.get("/api/events/overview", async (request, response, next) => {
    try {
      const query = conversationInsightsQuerySchema.parse(request.query);
      response.json(await getEventsOverview(request.user!, query));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/events/conversations", async (request, response, next) => {
    try {
      const query = conversationInsightsQuerySchema.parse(request.query);
      const result = await listConversationInsights(request.user!, query, {
        page: query.page || 1,
        pageSize: query.pageSize || 20,
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Dispara o run manual em background e devolve o snapshot inicial do
  // progresso; o front acompanha pela rota de progresso abaixo.
  // Aceita { date: "YYYY-MM-DD" } para analise retroativa de um dia inteiro.
  app.post("/api/events/intelligence/run", requireRole(["ADMIN", "MANAGER"]), (request, response, next) => {
    try {
      const payload = z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }).parse(request.body ?? {});
      response.json(startManualIntelligenceRun(payload.date));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/events/intelligence/progress", (_request, response, next) => {
    try {
      response.json(getIntelligenceProgress());
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/events/conversations/:id/ack", async (request, response, next) => {
    try {
      const payload = z.object({ note: z.string().trim().max(2000).optional() }).parse(request.body ?? {});
      response.json(await acknowledgeConversationInsight(request.params.id, request.user!, payload.note));
    } catch (error) {
      next(error);
    }
  });

  const radarWhatsappOptionsSchema = z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    detailLevel: z.enum(["summary", "standard", "complete"]).default("standard"),
    alertLimit: z.coerce.number().int()
      .refine((value) => [3, 5, 10, 20].includes(value))
      .transform((value) => value as 3 | 5 | 10 | 20)
      .default(5),
  });

  app.get("/api/events/radar-whatsapp/preview", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const query = radarWhatsappOptionsSchema.parse(request.query);
      response.json(await previewRadarWhatsapp(
        request.user!,
        { dateFrom: query.dateFrom, dateTo: query.dateTo },
        { detailLevel: query.detailLevel, alertLimit: query.alertLimit },
      ));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/events/radar-whatsapp/send", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const payload = radarWhatsappOptionsSchema.parse(request.body ?? {});
      response.status(201).json(await sendRadarWhatsapp(
        request.user!,
        { dateFrom: payload.dateFrom, dateTo: payload.dateTo },
        { detailLevel: payload.detailLevel, alertLimit: payload.alertLimit },
      ));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/events", async (request, response, next) => {
    try {
      const query = eventsFiltersSchema.parse(request.query);
      const filters = query;

      const result = await listEvents(request.user!, filters, {
        page: query.page || 1,
        pageSize: query.pageSize || 20,
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/events/:id/resolve", async (request, response, next) => {
    try {
      const payload = eventResolutionSchema.parse(request.body);
      const event = await resolveEvent(request.params.id, request.user!, payload);
      response.json(event);
    } catch (error) {
      next(error);
    }
  });

  // ── Reclamacoes por produto (historico permanente) ──

  const productComplaintsQuerySchema = z.object({
    model: z.string().trim().max(80).optional(),
    exact: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
    category: z.enum(["reclamacao", "defeito"]).optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  });

  app.get("/api/product-complaints/models", async (request, response, next) => {
    try {
      const query = productComplaintsQuerySchema.parse(request.query);
      response.json(await getProductComplaintsModelReport(query));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/product-complaints", async (request, response, next) => {
    try {
      const query = productComplaintsQuerySchema.parse(request.query);
      response.json(await listProductComplaints(query, {
        page: query.page || 1,
        pageSize: query.pageSize || 25,
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/product-complaints/overview", async (request, response, next) => {
    try {
      const query = productComplaintsQuerySchema.parse(request.query);
      response.json(await getProductComplaintsOverview(query));
    } catch (error) {
      next(error);
    }
  });

  // ── Reclamacoes gerais (nao ligadas a produto: atendimento/vendedora) ──

  const generalComplaintsQuerySchema = z.object({
    category: z.enum(["atendimento", "vendedora", "entrega", "cobranca", "outro"]).optional(),
    agentName: z.string().trim().max(80).optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  });

  app.get("/api/general-complaints", async (request, response, next) => {
    try {
      const query = generalComplaintsQuerySchema.parse(request.query);
      response.json(await listGeneralComplaints(query, {
        page: query.page || 1,
        pageSize: query.pageSize || 25,
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/general-complaints/overview", async (request, response, next) => {
    try {
      const query = generalComplaintsQuerySchema.parse(request.query);
      response.json(await getGeneralComplaintsOverview(query));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/events/sentiments/daily", async (request, response, next) => {
    try {
      const { dateFrom, dateTo } = request.query;
      if (!dateFrom || !dateTo) {
        throw new HttpError(400, "dateFrom and dateTo are required");
      }
      const sentiments = await getDailySentiments(request.user!, {
        from: dateFrom as string,
        to: dateTo as string,
      });
      response.json(sentiments);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp-instances/defaults", requireRole(["ADMIN", "MANAGER"]), (_request, response, next) => {
    try {
      response.json({
        baseUrl: env.EVOLUTION_API_BASE_URL,
        apiKey: env.EVOLUTION_API_KEY,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp-instances", async (_request, response, next) => {
    try {
      response.json(await listWhatsappInstances());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-instances", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const payload = instanceCreateSchema.parse(request.body);
      response.status(201).json(await createWhatsappInstance(payload));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-instances/:id/configure", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const { configureWhatsappInstance } = await import("./modules/pipeline/pipelineService.js");
      await configureWhatsappInstance(String(request.params.id));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp-instances/:id/connection", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const { getWhatsappInstanceConnection } = await import("./modules/pipeline/pipelineService.js");
      response.json(await getWhatsappInstanceConnection(String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-instances/:id/connect", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      const { connectWhatsappInstance } = await import("./modules/pipeline/pipelineService.js");
      response.json(await connectWhatsappInstance(String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/whatsapp-instances/:id", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      await deleteWhatsappInstance(String(request.params.id));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // ── Strategies ──────────────────────────────────────────────

  app.get("/api/strategies/cross-sell", async (request, response, next) => {
    try {
      const minStock = request.query.minStock ? parseInt(String(request.query.minStock), 10) : 50;
      const topN = request.query.topN ? parseInt(String(request.query.topN), 10) : 50;
      const safeMinStock = Number.isFinite(minStock) && minStock >= 0 ? minStock : 50;
      const safeTopN = Number.isFinite(topN) && topN > 0 && topN <= 5000 ? topN : 50;
      response.json(await getCrossSellStrategy(safeMinStock, safeTopN));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/strategies/slow-moving", async (request, response, next) => {
    try {
      const minStock = request.query.minStock ? parseInt(String(request.query.minStock), 10) : 1;
      const daysWithoutSales = request.query.daysWithoutSales ? parseInt(String(request.query.daysWithoutSales), 10) : 30;
      const safeMinStock = Number.isFinite(minStock) && minStock >= 0 ? minStock : 1;
      const safeDays = Number.isFinite(daysWithoutSales) && daysWithoutSales >= 0 ? daysWithoutSales : 30;
      response.json(await getSlowMovingStrategy(safeMinStock, safeDays));
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    logger.error("request failed", { error: String(error) });

    if (error instanceof z.ZodError) {
      response.status(400).json({
        message: "Payload inválido",
        issues: error.issues,
      });
      return;
    }

    if (error instanceof HttpError) {
      response.status(error.statusCode).json({ message: error.message });
      return;
    }

    response.status(500).json({ message: "Erro interno do servidor", details: error instanceof Error ? error.stack : String(error) });
  });

  return app;
}
