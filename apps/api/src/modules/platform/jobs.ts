import { Redis } from "ioredis";
import { Queue, Worker } from "bullmq";
import { env, historicalFiles } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { importHistoryFile } from "../ingestion/historyImporter.js";
import { syncOlistIncremental } from "../ingestion/olistSyncService.js";

const queueEnabled = Boolean(env.REDIS_URL);

const connection = queueEnabled
  ? new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    })
  : null;

const queue = queueEnabled && connection
  ? new Queue("crm-jobs", {
      connection,
      defaultJobOptions: {
        removeOnComplete: 20,
        removeOnFail: 20,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    })
  : null;

export async function enqueueHistoryImportJob(files = historicalFiles) {
  if (!queue) {
    for (const file of files) {
      await importHistoryFile(file);
    }
    return { id: `direct-history-${Date.now()}` };
  }

  return queue.add("history-import", { files });
}

export async function enqueueOlistSyncJob() {
  if (!queue) {
    await syncOlistIncremental();
    return { id: `direct-olist-${Date.now()}` };
  }

  return queue.add("olist-sync", {});
}

export function startWorkerProcessing() {
  if (!queueEnabled || !connection) {
    logger.info("worker running in local-direct mode without Redis");
    return {
      async close() {
        return;
      },
    };
  }

  const worker = new Worker(
    "crm-jobs",
    async (job) => {
      if (job.name === "history-import") {
        const { files } = job.data as { files: string[] };
        for (const file of files) {
          await importHistoryFile(file);
        }
        return { imported: files.length };
      }

      if (job.name === "olist-sync") {
        return syncOlistIncremental();
      }

      throw new Error(`Unknown job: ${job.name}`);
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => {
    logger.info("job completed", { id: job.id, name: job.name });
  });

  worker.on("failed", (job, error) => {
    logger.error("job failed", {
      id: job?.id,
      name: job?.name,
      error: String(error),
    });
  });

  return worker;
}
