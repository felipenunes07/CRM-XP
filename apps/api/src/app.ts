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
  getCustomerDetail,
  listCustomerLabels,
  listCustomers,
  previewSegment,
  updateCustomerLabels,
} from "./modules/crm/customerService.js";
import { getAgendaItems, getDashboardMetrics } from "./modules/crm/dashboardService.js";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  listMessageTemplates,
  updateMessageTemplate,
} from "./modules/crm/messageService.js";
import { importHistoryFile } from "./modules/ingestion/historyImporter.js";
import { syncOlistIncremental } from "./modules/ingestion/olistSyncService.js";
import { importSupabase2026 } from "./modules/ingestion/supabaseImporter.js";
import { listUsers, login } from "./modules/platform/authService.js";
import { requireAuth, requireRole } from "./modules/platform/authMiddleware.js";
import { enqueueHistoryImportJob, enqueueOlistSyncJob } from "./modules/platform/jobs.js";
import { runPrimarySync } from "./modules/platform/syncService.js";
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
  labels: z.array(z.string().min(1)).default([]),
  internalNotes: z.string().default(""),
});

const createCustomerLabelSchema = z.object({
  name: z.string().min(1),
});

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || webOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

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

  app.get("/api/dashboard/metrics", async (_request, response, next) => {
    try {
      response.json(await getDashboardMetrics());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/agenda", async (request, response, next) => {
    try {
      const limit = request.query.limit ? Number(request.query.limit) : 25;
      response.json(await getAgendaItems(limit));
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
        }),
      );
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

    response.status(500).json({ message: "Erro interno do servidor" });
  });

  return app;
}
