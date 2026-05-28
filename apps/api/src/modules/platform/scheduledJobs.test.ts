import { afterEach, describe, expect, it, vi } from "vitest";
import { startRecurringJob } from "./scheduledJobs.js";

describe("startRecurringJob", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs once immediately and then repeats on the configured interval", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(undefined);

    const job = startRecurringJob({ intervalMs: 60_000, run });
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);

    await job.close();
  });

  it("reports async failures and keeps future executions alive", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce(undefined);

    const job = startRecurringJob({ intervalMs: 60_000, run, onError });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(expect.any(Error));

    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);

    await job.close();
  });
});
