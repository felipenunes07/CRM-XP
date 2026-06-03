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
});
