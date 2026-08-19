import { EventEmitter } from "events";
import { Redis } from "ioredis";
import { env } from "../../lib/env.js";
import { redis } from "../../db/client.js";
import { logger } from "../../lib/logger.js";

export interface ExecutiveDashboardUpdate {
  /** Quem provocou a atualizacao (webhook da Olist, sync agendada, NOTIFY do Supabase...). */
  reason: string;
  source: "olist_v2" | "supabase_2026" | "olist_webhook";
  /** Linhas de venda realmente gravadas. Zero significa "nada mudou". */
  recordsInserted: number;
  /** Pedido especifico, quando a atualizacao veio do webhook. */
  orderId?: string | null;
  updatedAt: string; // ISO
}

const REDIS_CHANNEL = "executive-dashboard-updated";

// A TV assina o SSE na API, mas quem roda a sync pode ser o container worker.
// O Redis carrega o evento entre os processos; sem REDIS_URL caimos no
// EventEmitter local, que ja resolve o deploy de processo unico.
const localEmitter = new EventEmitter();
localEmitter.setMaxListeners(0);

let subRedis: Redis | null = null;
let isRedisSubscribed = false;

if (env.REDIS_URL) {
  try {
    subRedis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    subRedis.on("message", (channel, message) => {
      if (channel !== REDIS_CHANNEL) return;
      try {
        localEmitter.emit(REDIS_CHANNEL, JSON.parse(message) as ExecutiveDashboardUpdate);
      } catch (error) {
        logger.error("failed to parse executive dashboard pub/sub message", {
          error: String(error),
          message,
        });
      }
    });

    subRedis.on("error", (error) => {
      logger.error("executive dashboard redis subscriber error", { error: String(error) });
    });
  } catch (error) {
    logger.error("failed to initialize executive dashboard redis subscriber", {
      error: String(error),
    });
  }
}

async function ensureRedisSubscription() {
  if (!subRedis || isRedisSubscribed) return;

  try {
    await subRedis.connect();
    await subRedis.subscribe(REDIS_CHANNEL);
    isRedisSubscribed = true;
    logger.info("subscribed to executive dashboard channel", { channel: REDIS_CHANNEL });
  } catch (error) {
    logger.error("failed to subscribe to executive dashboard channel", { error: String(error) });
  }
}

export function publishExecutiveDashboardUpdate(update: ExecutiveDashboardUpdate): void {
  if (env.REDIS_URL) {
    (redis as Redis).publish(REDIS_CHANNEL, JSON.stringify(update)).catch((error) => {
      logger.error("failed to publish executive dashboard update", { error: String(error) });
    });
    return;
  }

  localEmitter.emit(REDIS_CHANNEL, update);
}

export function subscribeExecutiveDashboardUpdates(
  handler: (update: ExecutiveDashboardUpdate) => void,
): () => void {
  if (env.REDIS_URL) {
    ensureRedisSubscription().catch(() => undefined);
  }

  localEmitter.on(REDIS_CHANNEL, handler);
  return () => {
    localEmitter.off(REDIS_CHANNEL, handler);
  };
}
