import { Pool } from "pg";
import { Redis } from "ioredis";
import { env } from "../lib/env.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

class MemoryRedis {
  private store = new Map<string, string>();

  async ping() {
    return "PONG";
  }

  async set(key: string, value: string) {
    this.store.set(key, value);
    return "OK";
  }

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async del(key: string) {
    this.store.delete(key);
    return 1;
  }

  async quit() {
    return "OK";
  }
}

export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    })
  : new MemoryRedis();
