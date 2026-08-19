import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRIMARY_SYNC_INTERVAL_MINUTES,
  isSupabaseSalesChangeListenerConfigured,
  resolvePrimarySyncSource,
  startPrimarySyncScheduler,
} from "./syncService.js";

describe("startPrimarySyncScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses a 1 minute source synchronization window for the TV dashboard", () => {
    // Sem o webhook da Olist (extensao fora do plano), esta varredura e o que
    // leva a venda ao painel. So e viavel porque a sync incremental pula o
    // pedidos.obter de pedidos que nao mudaram.
    expect(PRIMARY_SYNC_INTERVAL_MINUTES).toBe(1);
  });

  it("uses Olist as the live sales source when Olist and Supabase are configured", () => {
    expect(resolvePrimarySyncSource({ olistConfigured: true, supabaseConfigured: true }))
      .toBe("olist_v2");
  });

  it("keeps Supabase as fallback when Olist is not configured", () => {
    expect(resolvePrimarySyncSource({ olistConfigured: false, supabaseConfigured: true }))
      .toBe("supabase_2026");
  });

  it("enables the internal sales change listener only with a real database connection", () => {
    expect(isSupabaseSalesChangeListenerConfigured("postgresql://server/database")).toBe(true);
    expect(isSupabaseSalesChangeListenerConfigured("")).toBe(false);
    expect(isSupabaseSalesChangeListenerConfigured("postgresql://[YOUR-PASSWORD]@server/database"))
      .toBe(false);
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
