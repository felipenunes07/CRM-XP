import { Pool } from "pg";
import { Redis } from "ioredis";
import { env } from "../lib/env.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

class MemoryRedis {
  private store = new Map<string, string>();
  private timeouts = new Map<string, NodeJS.Timeout>();

  async ping() {
    return "PONG";
  }

  async set(key: string, value: string, mode?: string, duration?: number) {
    const existing = this.timeouts.get(key);
    if (existing) {
      clearTimeout(existing);
      this.timeouts.delete(key);
    }

    this.store.set(key, value);

    if (typeof duration === "number") {
      const ms = mode === "EX" ? duration * 1000 : duration;
      const timeout = setTimeout(() => {
        this.store.delete(key);
        this.timeouts.delete(key);
      }, ms);
      if (timeout.unref) {
        timeout.unref();
      }
      this.timeouts.set(key, timeout);
    }
    return "OK";
  }

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async del(key: string) {
    const existing = this.timeouts.get(key);
    if (existing) {
      clearTimeout(existing);
      this.timeouts.delete(key);
    }
    this.store.delete(key);
    return 1;
  }

  async quit() {
    for (const t of this.timeouts.values()) {
      clearTimeout(t);
    }
    this.timeouts.clear();
    return "OK";
  }
}

export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    })
  : new MemoryRedis();
