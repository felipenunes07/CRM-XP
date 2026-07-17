import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, API_REQUEST_TIMEOUT_MS } from "./api";

describe("api request timeouts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts requests that never resolve", async () => {
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = api.me("token-1");
    const assertion = expect(pending).rejects.toThrow("Tempo limite excedido ao conectar com a API");

    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);

    await assertion;
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("sends all message intelligence filters to metrics and intelligence endpoints", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await api.getEventsMetrics("token-1", {
      dateFrom: "2026-06-13",
      dateTo: "2026-06-20",
      eventType: "COMPLAINT",
      severity: "HIGH",
      resolved: false,
      search: "estoque",
      isGroup: true,
    } as any);

    await api.getEventsIntelligence("token-1", {
      dateFrom: "2026-06-13",
      dateTo: "2026-06-20",
      eventType: "COMPLAINT",
      severity: "HIGH",
      resolved: false,
      search: "estoque",
      isGroup: true,
    } as any);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/events/metrics?dateFrom=2026-06-13&dateTo=2026-06-20&eventType=COMPLAINT&severity=HIGH&resolved=false&search=estoque&isGroup=true",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/events/intelligence?dateFrom=2026-06-13&dateTo=2026-06-20&eventType=COMPLAINT&severity=HIGH&resolved=false&search=estoque&isGroup=true",
      expect.any(Object),
    );
  });

  it("can trigger the manual message intelligence AI batch", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "SUCCEEDED", eventCount: 3 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await api.runEventsAiBatch("token-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/events/ai-batch/run",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forwards monitor cancellation and requests lightweight agents", async () => {
    let callCount = 0;
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise<Response>((_resolve, reject) => {
          const rejectAsAborted = () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          };
          if (init?.signal?.aborted) {
            rejectAsAborted();
            return;
          }
          init?.signal?.addEventListener("abort", rejectAsAborted);
        });
      }
      return Promise.resolve(new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    controller.abort();
    const conversationsRequest = api.whatsappMonitorConversations(
      "token-1",
      { group: "contacts", limit: 25 },
      { signal: controller.signal },
    );

    await expect(conversationsRequest).rejects.toMatchObject({ name: "AbortError" });
    await api.whatsappMonitorAgents("token-1", { includeStats: false, signal: new AbortController().signal });
    await api.whatsappMonitorConversation(
      "token-1",
      "deal-1",
      { limit: 20 },
      { signal: new AbortController().signal },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/whatsapp-monitor/conversations?group=contacts&limit=25",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/whatsapp-monitor/agents?includeStats=false",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/whatsapp-monitor/conversations/deal-1?limit=20",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
