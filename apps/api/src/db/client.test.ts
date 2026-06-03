import { beforeEach, describe, expect, it, vi } from "vitest";

const poolMock = vi.hoisted(() => vi.fn(() => ({ end: vi.fn(), query: vi.fn() })));

vi.mock("pg", () => ({
  Pool: poolMock,
}));

vi.mock("ioredis", () => ({
  Redis: vi.fn(),
}));

vi.mock("../lib/env.js", () => ({
  env: {
    DATABASE_URL: "postgresql://user:pass@example.test:5432/crm",
    REDIS_URL: "",
  },
}));

describe("database client", () => {
  beforeEach(() => {
    vi.resetModules();
    poolMock.mockClear();
  });

  it("configures defensive connection and query timeouts", async () => {
    await import("./client.js");

    expect(poolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: "postgresql://user:pass@example.test:5432/crm",
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
        query_timeout: 20_000,
        statement_timeout: 20_000,
      }),
    );
  });
});
