import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/client.js", () => ({
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

import { OlistRateLimiter } from "./rateLimiter.js";

describe("OlistRateLimiter", () => {
  it("keeps half of the account quota free for n8n and other integrations", async () => {
    const limiter = new OlistRateLimiter("test") as unknown as {
      registerLimitHeader: (value: string | null) => Promise<void>;
      capacity: number;
      refillPerSecond: number;
      concurrency: number;
    };

    // Plano da conta: 120 req/min (header x-limit-api).
    await limiter.registerLimitHeader("120");

    expect(limiter.capacity).toBe(60);
    expect(limiter.refillPerSecond).toBe(1);
    expect(limiter.concurrency).toBe(15);
  });

  it("still allows one request per cycle on the smallest plan", async () => {
    const limiter = new OlistRateLimiter("test") as unknown as {
      registerLimitHeader: (value: string | null) => Promise<void>;
      capacity: number;
      concurrency: number;
    };

    await limiter.registerLimitHeader("1");

    expect(limiter.capacity).toBeGreaterThanOrEqual(1);
    expect(limiter.concurrency).toBeGreaterThanOrEqual(1);
  });

  it("ignores a missing or invalid limit header instead of throttling to zero", async () => {
    const limiter = new OlistRateLimiter("test") as unknown as {
      registerLimitHeader: (value: string | null) => Promise<void>;
      capacity: number;
    };

    await limiter.registerLimitHeader(null);
    await limiter.registerLimitHeader("nao-e-numero");

    expect(limiter.capacity).toBe(30); // valor inicial conservador
  });
});
