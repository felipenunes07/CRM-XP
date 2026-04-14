import cors from "cors";
import express from "express";
import { z } from "zod";
import type { CustomerStatus } from "@olist-crm/shared";
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
import { getAmbassadorOverview } from "./modules/crm/ambassadorService.js";
import { getAttendantsOverview } from "./modules/crm/attendantService.js";
import { getAgendaItems, getDashboardMetrics } from "./modules/crm/dashboardService.js";
import {
  createSavedSegment,
  deleteSavedSegment,
  listSavedSegments,
  updateSavedSegment,
} from "./modules/crm/segmentService.js";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  listMessageTemplates,
  updateMessageTemplate,
} from "./modules/crm/messageService.js";
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
  cancelWhatsappCampaign,
  createWhatsappCampaign,
  getWhatsappCampaignDetail,
  listWhatsappCampaigns,
} from "./modules/whatsapp/whatsappCampaignService.js";
import { ensureEvolutionConfigured } from "./modules/whatsapp/evolutionService.js";
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
import { enqueueWhatsappCampaignRecipients } from "./modules/whatsapp/whatsappQueue.js";
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
});

const dashboardQuerySchema = z.object({
  trendDays: z.coerce.number().int().min(1).max(730).optional(),
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
});

const messageSchema = z.object({
  category: z.enum(["reativacao", "follow_up", "promocao"]),
  title: z.string().min(1),
  content: z.string().min(1),
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

const whatsappCampaignCreateSchema = z.object({
  name: z.string().min(1),
  templateId: z.string().uuid().nullable().optional(),
  savedSegmentId: z.string().uuid().nullable().optional(),
  messageText: z.string().min(1),
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

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || webOrigins.includes(origin) || origin.endsWith(".trycloudflare.com")) {
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
      response.json(await getDashboardMetrics(query.trendDays));
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
        throw new HttpError(404, "Cliente nÃ£o encontrado");
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
      ensureEvolutionConfigured();
      const payload = whatsappCampaignCreateSchema.parse(request.body);
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
