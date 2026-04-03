import { redis } from "../../db/client.js";

export class OlistRateLimiter {
  private tokens = 30;
  private capacity = 30;
  private refillPerSecond = 0.5;
  private lastRefill = Date.now();
  private active = 0;
  private concurrency = 7;

  constructor(private readonly resourceKey: string) {}

  private refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    if (elapsedSeconds <= 0) {
      return;
    }

    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = now;
  }

  async acquire() {
    while (true) {
      this.refill();
      if (this.tokens >= 1 && this.active < this.concurrency) {
        this.tokens -= 1;
        this.active += 1;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
  }

  release() {
    this.active = Math.max(0, this.active - 1);
  }

  async registerLimitHeader(limitHeader: string | null) {
    const limit = Number(limitHeader);
    if (!Number.isFinite(limit) || limit <= 0) {
      return;
    }

    this.capacity = limit;
    this.tokens = Math.min(this.tokens, this.capacity);
    this.refillPerSecond = limit / 60;
    this.concurrency = Math.max(1, Math.floor(limit / 4));
    await redis.set(
      `ratelimit:${this.resourceKey}`,
      JSON.stringify({
        limit,
        refillPerSecond: this.refillPerSecond,
        concurrency: this.concurrency,
        updatedAt: new Date().toISOString(),
      }),
    );
  }
}
