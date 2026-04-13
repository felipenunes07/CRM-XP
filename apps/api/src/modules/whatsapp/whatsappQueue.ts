import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import {
  claimRecipientForDispatch,
  markRecipientFailed,
  markRecipientSent,
  type EnqueuedRecipientJob,
} from "./whatsappCampaignService.js";
import { sendWhatsappTextMessage } from "./evolutionService.js";

const queueEnabled = Boolean(env.REDIS_URL);
const connection = queueEnabled
  ? new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    })
  : null;

const queue = queueEnabled && connection
  ? new Queue("whatsapp-dispatch", {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 1,
      },
    })
  : null;

const localTimers = new Set<ReturnType<typeof setTimeout>>();

function extractProviderMessageId(payload: Record<string, unknown>) {
  if (payload.key && typeof payload.key === "object" && payload.key !== null) {
    const key = payload.key as Record<string, unknown>;
    return key.id ? String(key.id) : null;
  }

  return null;
}

async function processRecipientDispatch(recipientId: string) {
  const context = await claimRecipientForDispatch(recipientId);
  if (!context) {
    return { skipped: true };
  }

  try {
    const payload = await sendWhatsappTextMessage(context.jid, context.messageText);
    await markRecipientSent(context, payload, extractProviderMessageId(payload), payload.status ? String(payload.status) : null);
    return { sent: true };
  } catch (error) {
    const responsePayload =
      error && typeof error === "object" && "responsePayload" in error && typeof error.responsePayload === "object"
        ? (error.responsePayload as Record<string, unknown>)
        : null;

    await markRecipientFailed(context, error instanceof Error ? error.message : String(error), responsePayload);
    return { sent: false, failed: true };
  }
}

export async function enqueueWhatsappCampaignRecipients(recipientJobs: EnqueuedRecipientJob[]) {
  if (!recipientJobs.length) {
    return [];
  }

  if (!queue) {
    recipientJobs.forEach((job) => {
      const timer = setTimeout(() => {
        void processRecipientDispatch(job.recipientId)
          .catch((error) => {
            logger.error("local whatsapp recipient dispatch failed", {
              recipientId: job.recipientId,
              error: String(error),
            });
          })
          .finally(() => {
            localTimers.delete(timer);
          });
      }, Math.max(0, job.delayMs));

      timer.unref?.();
      localTimers.add(timer);
    });

    return recipientJobs.map((job) => ({ recipientId: job.recipientId }));
  }

  return queue.addBulk(
    recipientJobs.map((job) => ({
      name: "dispatch-recipient",
      data: {
        recipientId: job.recipientId,
      },
      opts: {
        delay: Math.max(0, job.delayMs),
        jobId: job.recipientId,
      },
    })),
  );
}

export function startWhatsappDispatchWorker() {
  if (!queueEnabled || !connection) {
    logger.info("whatsapp dispatch worker running in local timer mode without Redis");
    return {
      async close() {
        localTimers.forEach((timer) => clearTimeout(timer));
        localTimers.clear();
      },
    };
  }

  const worker = new Worker(
    "whatsapp-dispatch",
    async (job) => {
      if (job.name !== "dispatch-recipient") {
        throw new Error(`Unknown WhatsApp dispatch job: ${job.name}`);
      }

      const recipientId = String((job.data as { recipientId?: string }).recipientId ?? "");
      return processRecipientDispatch(recipientId);
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => {
    logger.info("whatsapp dispatch job completed", { id: job.id, name: job.name });
  });

  worker.on("failed", (job, error) => {
    logger.error("whatsapp dispatch job failed", {
      id: job?.id,
      name: job?.name,
      error: String(error),
    });
  });

  return worker;
}
