import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import {
  claimRecipientForDispatch,
  listDueWhatsappCampaignRecipientJobs,
  markRecipientDispatchClaimFailed,
  markRecipientFailed,
  markRecipientSent,
  recoverWhatsappCampaignDispatchClaimFailures,
  resetStaleSendingRecipients,
  type EnqueuedRecipientJob,
} from "./whatsappCampaignService.js";
import { sendWhatsappInstanceTextMessage, sendWhatsappTextMessage, sendWhatsappInstanceMediaMessage } from "./evolutionService.js";
import { sendUazapiTextMessage, sendUazapiCarouselMessage, sendUazapiVideoMessage } from "./uazapiService.js";

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
const localScheduledRecipientIds = new Set<string>();
const directDispatchRecipientIds = new Set<string>();
const WHATSAPP_DISPATCH_RESCUE_INTERVAL_MS = 10_000;

function extractProviderMessageId(payload: Record<string, unknown>) {
  if (payload.key && typeof payload.key === "object" && payload.key !== null) {
    const key = payload.key as Record<string, unknown>;
    return key.id ? String(key.id) : null;
  }

  return null;
}

async function processRecipientDispatch(recipientId: string) {
  let context;

  try {
    context = await claimRecipientForDispatch(recipientId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("whatsapp recipient dispatch claim failed", {
      recipientId,
      error: message,
    });

    await markRecipientDispatchClaimFailed(recipientId, message).catch((markError) => {
      logger.error("failed to mark whatsapp recipient claim error", {
        recipientId,
        error: String(markError),
      });
    });

    return { sent: false, failed: true, claimFailed: true };
  }

  if (!context) {
    return { skipped: true };
  }

  try {
    let payload: Record<string, unknown>;

    if (context.uazapiInstance) {
      // UazAPI provider
      if (context.messageType === "CAROUSEL" && context.carouselData?.length) {
        payload = await sendUazapiCarouselMessage(context.uazapiInstance, context.jid, context.carouselData);
      } else if (context.messageType === "VIDEO" && context.videoUrl) {
        payload = await sendUazapiVideoMessage(context.uazapiInstance, context.jid, context.videoUrl, context.messageText);
      } else {
        payload = await sendUazapiTextMessage(context.uazapiInstance, context.jid, context.messageText);
      }
    } else if (context.evolutionInstance) {
      // Evolution API provider
      if (context.messageType === "VIDEO" && context.videoUrl) {
        payload = await sendWhatsappInstanceMediaMessage(
          context.evolutionInstance,
          context.jid,
          context.videoUrl,
          "video",
          "video.mp4",
          context.messageText,
        );
      } else {
        payload = await sendWhatsappInstanceTextMessage(context.evolutionInstance, context.jid, context.messageText);
      }
    } else {
      // Default Evolution fallback
      if (context.messageType === "VIDEO" && context.videoUrl) {
        payload = await sendWhatsappInstanceMediaMessage(
          {
            instanceName: env.EVOLUTION_INSTANCE_NAME,
            evolutionBaseUrl: env.EVOLUTION_API_BASE_URL,
            evolutionApiKey: env.EVOLUTION_API_KEY,
          },
          context.jid,
          context.videoUrl,
          "video",
          "video.mp4",
          context.messageText,
        );
      } else {
        payload = await sendWhatsappTextMessage(context.jid, context.messageText);
      }
    }

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
      if (localScheduledRecipientIds.has(job.recipientId)) {
        return;
      }

      localScheduledRecipientIds.add(job.recipientId);
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
            localScheduledRecipientIds.delete(job.recipientId);
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

export async function resumeDueWhatsappCampaignRecipients(campaignId?: string, limit = 1) {
  // Auto-cura: destrava destinatários presos em SENDING (processo reiniciado/travado
  // no meio do envio). Sem isso, um único SENDING preso congela a campanha inteira.
  const unstuck = await resetStaleSendingRecipients(5);
  if (unstuck > 0) {
    logger.warn("reset stale SENDING whatsapp recipients", { count: unstuck });
  }

  const recovered = await recoverWhatsappCampaignDispatchClaimFailures({ campaignId, limit });
  if (recovered.recovered > 0) {
    logger.info("recovered whatsapp campaign dispatch claim failures", {
      campaignId,
      recovered: recovered.recovered,
      campaignIds: recovered.campaignIds,
    });
  }

  const dueJobs = await listDueWhatsappCampaignRecipientJobs({ campaignId, limit });
  let started = 0;

  for (const job of dueJobs) {
    if (directDispatchRecipientIds.has(job.recipientId)) {
      continue;
    }

    directDispatchRecipientIds.add(job.recipientId);
    started += 1;

    const timer = setTimeout(() => {
      void processRecipientDispatch(job.recipientId)
        .catch((error) => {
          logger.error("resumed whatsapp recipient dispatch failed", {
            recipientId: job.recipientId,
            campaignId: job.campaignId,
            error: String(error),
          });
        })
        .finally(() => {
          directDispatchRecipientIds.delete(job.recipientId);
          localTimers.delete(timer);
        });
    }, 0);

    timer.unref?.();
    localTimers.add(timer);
  }

  if (started > 0) {
    logger.info("resumed due whatsapp campaign recipients", {
      campaignId,
      candidates: dueJobs.length,
      started,
    });
  }

  return {
    candidates: dueJobs.length,
    started,
  };
}

function startDueRecipientRescueLoop() {
  const interval = setInterval(() => {
    resumeDueWhatsappCampaignRecipients(undefined, 1).catch((error) => {
      logger.error("whatsapp due recipient rescue failed", { error: String(error) });
    });
  }, WHATSAPP_DISPATCH_RESCUE_INTERVAL_MS);

  interval.unref?.();
  return interval;
}

export function startWhatsappDispatchWorker() {
  const rescueInterval = startDueRecipientRescueLoop();

  if (!queueEnabled || !connection) {
    logger.info("whatsapp dispatch worker running in local timer mode without Redis");
    return {
      async close() {
        clearInterval(rescueInterval);
        localTimers.forEach((timer) => clearTimeout(timer));
        localTimers.clear();
        localScheduledRecipientIds.clear();
        directDispatchRecipientIds.clear();
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

  worker.on("error", (error) => {
    logger.error("whatsapp dispatch worker error", { error: String(error) });
  });

  return {
    async close() {
      clearInterval(rescueInterval);
      await worker.close();
      directDispatchRecipientIds.clear();
    },
  };
}
