import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  configureInstanceWebhook: vi.fn(),
}));

vi.mock("../../db/client.js", () => ({
  pool: { query: mocks.poolQuery },
}));

vi.mock("../../lib/env.js", () => ({
  env: { PUBLIC_URL: "https://crm.example" },
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("./evolutionService.js", () => ({
  configureInstanceWebhook: mocks.configureInstanceWebhook,
}));

import { runWhatsappWebhookWatchdog } from "./whatsappWebhookWatchdog.js";

describe("WhatsApp webhook watchdog", () => {
  beforeEach(() => {
    mocks.poolQuery.mockReset();
    mocks.configureInstanceWebhook.mockReset();
    vi.unstubAllGlobals();
  });

  it("does not inspect or reconfigure the Lili send-only instance", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "lili-id",
          instance_name: "Lili",
          display_label: "Lili Assistente",
          assigned_user_name: null,
          evolution_base_url: "https://evolution.example",
          evolution_api_key: "secret",
        },
      ],
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWhatsappWebhookWatchdog();

    expect(result).toEqual({
      checked: 0,
      disconnected: [],
      webhookRepaired: [],
      failed: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.configureInstanceWebhook).not.toHaveBeenCalled();
  });

  it("continues checking operational Evolution instances", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "amanda-id",
            instance_name: "Amanda",
            display_label: "Amanda",
            assigned_user_name: "Amanda",
            evolution_base_url: "https://evolution.example",
            evolution_api_key: "secret",
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ instance: { state: "open" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          url: "https://crm.example/api/webhooks/evolution",
          events: ["MESSAGES_UPSERT"],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWhatsappWebhookWatchdog();

    expect(result.checked).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.configureInstanceWebhook).not.toHaveBeenCalled();
  });
});
