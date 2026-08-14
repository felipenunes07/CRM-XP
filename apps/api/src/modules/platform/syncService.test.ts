import { afterEach, describe, expect, it, vi } from "vitest";
import { PRIMARY_SYNC_INTERVAL_MINUTES, startPrimarySyncScheduler } from "./syncService.js";

describe("startPrimarySyncScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses a 15 minute source synchronization window for the TV dashboard", () => {
    expect(PRIMARY_SYNC_INTERVAL_MINUTES).toBe(15);
  });

  it("runs primary sync immediately and on later checks when the schedule allows it", async () => {
    vi.useFakeTimers();
    const shouldRun = vi.fn().mockResolvedValue(true);
    const runSync = vi.fn().mockResolvedValue(undefined);

    const scheduler = startPrimarySyncScheduler({
      enabled: true,
      reason: "worker-scheduled-periodic-sync",
      checkIntervalMs: 1_000,
      shouldRun,
      runSync,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(runSync).toHaveBeenCalledWith("worker-scheduled-periodic-sync");
    expect(runSync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(runSync).toHaveBeenCalledTimes(2);

    await scheduler.close();
  });

  it("does not run sync checks when disabled", async () => {
    vi.useFakeTimers();
    const shouldRun = vi.fn().mockResolvedValue(true);
    const runSync = vi.fn().mockResolvedValue(undefined);

    const scheduler = startPrimarySyncScheduler({
      enabled: false,
      reason: "worker-scheduled-periodic-sync",
      checkIntervalMs: 1_000,
      shouldRun,
      runSync,
    });

    await vi.advanceTimersByTimeAsync(5_000);

    expect(shouldRun).not.toHaveBeenCalled();
    expect(runSync).not.toHaveBeenCalled();

    await scheduler.close();
  });

  it("skips primary sync when the current time is outside the schedule", async () => {
    vi.useFakeTimers();
    const shouldRun = vi.fn().mockResolvedValue(false);
    const runSync = vi.fn().mockResolvedValue(undefined);

    const scheduler = startPrimarySyncScheduler({
      enabled: true,
      reason: "worker-scheduled-periodic-sync",
      checkIntervalMs: 1_000,
      shouldRun,
      runSync,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(shouldRun).toHaveBeenCalledTimes(1);
    expect(runSync).not.toHaveBeenCalled();

    await scheduler.close();
  });
});
