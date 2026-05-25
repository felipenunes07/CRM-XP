import cors from "cors";
import express from "express";
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
} from "./modules/crm/customerService.js";
import {
  getCustomerCreditDetail,
  getCustomerCreditOverview,
  refreshCustomerCreditOverview,
} from "./modules/crm/customerCreditService.js";
import {
  getInventoryBuying,
  getInventoryIntelligence,
  getInventoryIntelligenceDetail,
  getInventoryModelDetail,
  getInventoryModels,
  getInventoryOverview,
  getInventoryRestock,
  getInventoryStale,
} from "./modules/crm/inventoryIntelligenceService.js";
import { getInventorySnapshot, refreshInventorySnapshot } from "./modules/crm/inventoryService.js";
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
import { listUsers, login } from "./modules/platform/authService.js";
import { requireAuth, requireRole } from "./modules/platform/authMiddleware.js";
import { enqueueHistoryImportJob, enqueueOlistSyncJob } from "./modules/platform/jobs.js";
import { runPrimarySync } from "./modules/platform/syncService.js";
import {
  getEventsMetrics,
  listEvents,
  resolveEvent,
  getDailySentiments,
} from "./modules/events/eventsService.js";
import {
  cancelWhatsappCampaign,
  createWhatsappCampaign,
  getWhatsappCampaignDetail,
  listWhatsappCampaigns,
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
  listWhatsappMonitorConversations,
  sendWhatsappMonitorReply,
  setWhatsappConversationReadState,
} from "./modules/whatsapp/whatsappMonitorService.js";
import { enqueueWhatsappCampaignRecipients } from "./modules/whatsapp/whatsappQueue.js";
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
import { pool, redis } from "./db/client.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
});

const messageSchema = z.object({
  category: z.enum(["reativacao", "follow_up", "promocao", "credito"]),
  title: z.string().min(1),
  content: z.string().min(1),
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

const whatsappCampaignCreateSchema = z.object({
  name: z.string().min(1),
  templateId: z.string().uuid().nullable().optional(),
  savedSegmentId: z.string().uuid().nullable().optional(),
  whatsappInstanceId: z.string().uuid().nullable().optional(),
  messageText: z.string().min(1),
  messageType: z.enum(["TEXT", "CAROUSEL"]).optional(),
  carouselData: z.array(carouselSlideSchema).nullable().optional(),
  filtersSnapshot: z.record(z.unknown()).optional(),
  groupIds: z.array(z.string().uuid()).min(1),
  overrideRecentBlock: z.boolean().optional(),
  minDelaySeconds: z.number().int().min(1).optional(),
  maxDelaySeconds: z.number().int().min(1).optional(),
});

const whatsappCampaignListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const whatsappCampaignDetailQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
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

  if (
    webOrigins.includes(origin) ||
    origin === "http://localhost:5174" ||
    origin.endsWith(".trycloudflare.com")
  ) {
    return true;
  }

  try {
    const hostname = new URL(origin).hostname;
    return (
      hostname.endsWith(".ngrok-free.dev") ||
      hostname.endsWith(".ngrok-free.app") ||
      hostname.endsWith(".ngrok.app") ||
      hostname.endsWith(".ngrok.io")
    );
  } catch {
    return false;
  }
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
  app.use(express.json({ limit: "20mb" }));

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

/*
  app.get("/api/customer-credit/overview", async (_request, response, next) => {
    try {
      response.json(await getCustomerCreditOverview());
    } catch (error) {
      next(error);
    }
  });
*/

/*
  app.post("/api/customer-credit/refresh", requireRole(["ADMIN", "MANAGER"]), async (_request, response, next) => {
    try {
      response.json(await refreshCustomerCreditOverview());
    } catch (error) {
      next(error);
    }
  });
*/

/*
  app.get("/api/customer-credit/opportunities", async (_request, response, next) => {
    try {
      response.json(await getCustomerCreditOpportunities());
    } catch (error) {
      next(error);
    }
  });
*/

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

  app.get("/api/whatsapp-groups/mapping-summary", async (_request, response, next) => {
    try {
      response.json(await getWhatsappMappingSummary());
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
      const detail = await getWhatsappCampaignDetail(String(request.params.id), query.limit ?? 100, query.offset ?? 0);
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
      // Only enforce Evolution config when not using a specific instance
      if (!payload.whatsappInstanceId) {
        ensureEvolutionConfigured();
      }
      const created = await createWhatsappCampaign(payload, request.user!);
      await enqueueWhatsappCampaignRecipients(created.enqueuedJobs);
      const detail = await getWhatsappCampaignDetail(created.campaignId, 100, 0);
      response.status(201).json(detail);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/whatsapp-campaigns/:id/cancel", async (request, response, next) => {
    try {
      const detail = await getWhatsappCampaignDetail(String(request.params.id), 1, 0);
      if (!detail) {
        throw new HttpError(404, "Campanha nao encontrada.");
      }

      const user = request.user!;
      if (!["ADMIN", "MANAGER"].includes(user.role) && detail.createdByUserId !== user.id) {
        throw new HttpError(403, "Voce nao tem permissao para cancelar esta campanha.");
      }

      response.json(await cancelWhatsappCampaign(String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/users", requireRole(["ADMIN"]), async (_request, response, next) => {
    try {
      response.json(await listUsers());
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

  app.post("/api/admin/sync/olist", requireRole(["ADMIN"]), async (request, response, next) => {
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

  app.post("/api/admin/sync", requireRole(["ADMIN"]), async (request, response, next) => {
    try {
      const payload = manualSyncSchema.parse(request.body ?? {});
      if (payload.mode === "direct") {
        response.json({ mode: "direct", result: await runPrimarySync("manual-dashboard") });
        return;
      }

      response.status(202).json({ mode: "queue", result: await runPrimarySync("manual-dashboard") });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/import-supabase-2026", requireRole(["ADMIN"]), async (_request, response, next) => {
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

  const whatsappMonitorQuerySchema = z.object({
    instanceId: z.string().uuid().optional(),
    search: z.string().optional(),
    contactName: z.string().optional(),
    contactPhone: z.string().optional(),
    period: z.enum(["today", "yesterday", "7d", "30d"]).optional(),
    status: z.enum(["unread", "risk"]).optional(),
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

  app.get("/api/whatsapp-monitor/conversations", async (request, response, next) => {
    try {
      const query = whatsappMonitorQuerySchema.parse(request.query);
      response.json(await listWhatsappMonitorConversations(request.user!, query));
    } catch (error) {
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
    try {
      const query = whatsappActivityReportQuerySchema.parse(request.query);
      response.json(await getWhatsappAgentActivityReport(request.user!, query.days));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/whatsapp-monitor/conversations/:id", async (request, response, next) => {
    try {
      response.json(await getWhatsappMonitorConversation(String(request.params.id), request.user!));
    } catch (error) {
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

  app.delete("/api/whatsapp-instances/:id", requireRole(["ADMIN", "MANAGER"]), async (request, response, next) => {
    try {
      await deleteWhatsappInstance(String(request.params.id));
      response.status(204).send();
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
