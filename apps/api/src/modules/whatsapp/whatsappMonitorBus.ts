import { EventEmitter } from "events";
import { Redis } from "ioredis";
import { env } from "../../lib/env.js";
import { redis } from "../../db/client.js";
import { logger } from "../../lib/logger.js";

export interface MonitorStreamMessage {
  dealId: string;
  messageId: string;
  direction: "INBOUND" | "OUTBOUND";
  fromMe: boolean;
  senderName: string | null;
  content: string;
  createdAt: string; // ISO
}

const REDIS_CHANNEL = "wa-monitor-message";

// Local EventEmitter for in-process broadcast
const localEmitter = new EventEmitter();
localEmitter.setMaxListeners(0); // Allow unlimited listeners for active screens

let subRedis: Redis | null = null;
let isRedisSubscribed = false;

// Setup Redis subscriber if REDIS_URL is provided
if (env.REDIS_URL) {
  try {
    subRedis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    subRedis.on("message", (channel, message) => {
      if (channel === REDIS_CHANNEL) {
        try {
          const parsed = JSON.parse(message) as MonitorStreamMessage;
          localEmitter.emit(REDIS_CHANNEL, parsed);
        } catch (err: any) {
          logger.error("Failed to parse Redis pub/sub message", { error: err.message, message });
        }
      }
    });

    subRedis.on("error", (err) => {
      logger.error("Redis subscriber connection error", { error: err.message });
    });
  } catch (err: any) {
    logger.error("Failed to initialize Redis subscriber client", { error: err.message });
  }
}

async function ensureRedisSubscription() {
  if (!subRedis || isRedisSubscribed) return;

  try {
    await subRedis.connect();
    await subRedis.subscribe(REDIS_CHANNEL);
    isRedisSubscribed = true;
    logger.info(`Subscribed to Redis pub/sub channel: ${REDIS_CHANNEL}`);
  } catch (err: any) {
    logger.error("Failed to subscribe to Redis channel", { error: err.message });
  }
}

export function publishMonitorMessage(msg: MonitorStreamMessage): void {
  if (env.REDIS_URL) {
    // Publish using the main shared Redis client (which supports standard commands)
    (redis as Redis).publish(REDIS_CHANNEL, JSON.stringify(msg)).catch((err: any) => {
      logger.error("Failed to publish monitor message to Redis", { error: err.message });
    });
  } else {
    // In-memory fallback
    localEmitter.emit(REDIS_CHANNEL, msg);
  }
}

export function subscribeMonitorMessages(handler: (msg: MonitorStreamMessage) => void): () => void {
  // If Redis is active, ensure we have established the subscriber connection
  if (env.REDIS_URL) {
    ensureRedisSubscription().catch(() => undefined);
  }

  localEmitter.on(REDIS_CHANNEL, handler);
  return () => {
    localEmitter.off(REDIS_CHANNEL, handler);
  };
}

