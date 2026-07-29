import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  configureInstanceWebhook: vi.fn(),
  sendWhatsappInstanceTextMessage: vi.fn(),
  sendUazapiTextMessage: vi.fn(),
}));

vi.mock("../../db/client.js", () => ({
  pool: { query: mocks.poolQuery },
}));

vi.mock("../../lib/env.js", () => ({
  env: {
    PUBLIC_URL: "https://crm.example",
    WHATSAPP_DISCONNECT_ALERT_ENABLED: true,
    WHATSAPP_DISCONNECT_ALERT_GROUP_JID: "120363000000000@g.us",
    WHATSAPP_DISCONNECT_ALERT_INSTANCE_ID: "",
    WHATSAPP_DISCONNECT_ALERT_TIMEZONE: "America/Sao_Paulo",
    OFFBOARDING_ALERT_GROUP_JID: "",
  },
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
  sendWhatsappInstanceTextMessage: mocks.sendWhatsappInstanceTextMessage,
}));

vi.mock("./uazapiService.js", () => ({
  sendUazapiTextMessage: mocks.sendUazapiTextMessage,
}));

import {
  handleEvolutionConnectionUpdate,
  runWhatsappWebhookWatchdog,
} from "./whatsappWebhookWatchdog.js";

describe("WhatsApp webhook watchdog", () => {
  beforeEach(() => {
    mocks.poolQuery.mockReset();
    mocks.configureInstanceWebhook.mockReset();
    mocks.sendWhatsappInstanceTextMessage.mockReset();
    mocks.sendUazapiTextMessage.mockReset();
    vi.unstubAllGlobals();
  });

  it("does not inspect or reconfigure the Lili send-only instance", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "lili-id",
          instance_name: "Lili",
          messages_enabled: false,
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
      alertsSent: [],
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
          messages_enabled: true,
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
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runWhatsappWebhookWatchdog();

    expect(result.checked).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.configureInstanceWebhook).not.toHaveBeenCalled();
  });

  it("sends one group alert when a connection changes to close", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "amanda-id",
          instance_name: "Amanda",
          display_label: "Amanda",
          phone_number: "5511999999999",
        }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // grava DOWN
      .mockResolvedValueOnce({ rows: [{ key: "claimed" }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          id: "sender-id",
          provider: "UAZAPI",
          instance_name: "Lili",
          uazapi_base_url: "https://uazapi.example",
          uazapi_token: "token",
        }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // marca SENT
    mocks.sendUazapiTextMessage.mockResolvedValueOnce({ id: "message-1" });

    const result = await handleEvolutionConnectionUpdate("Amanda", "close");

    expect(result).toEqual({ processed: true, alertSent: true });
    expect(mocks.sendUazapiTextMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendUazapiTextMessage.mock.calls[0]?.[1]).toBe("120363000000000@g.us");
    expect(mocks.sendUazapiTextMessage.mock.calls[0]?.[2]).toContain("WhatsApp desconectado");
    expect(mocks.sendUazapiTextMessage.mock.calls[0]?.[2]).toContain("Amanda");
    expect(mocks.sendUazapiTextMessage.mock.calls[0]?.[2]).toContain("+55 (11) 99999-9999");
    expect(mocks.sendUazapiTextMessage.mock.calls[0]?.[2]).not.toContain("Usuários");
  });

  it("does not repeat an alert while the same disconnect incident is active", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "amanda-id",
          instance_name: "Amanda",
          display_label: "Amanda",
          phone_number: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await handleEvolutionConnectionUpdate("Amanda", "close");

    expect(result).toEqual({ processed: true, alertSent: false });
    expect(mocks.sendUazapiTextMessage).not.toHaveBeenCalled();
    expect(mocks.sendWhatsappInstanceTextMessage).not.toHaveBeenCalled();
  });

  it("clears the incident marker after the number reconnects", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "amanda-id",
          instance_name: "Amanda",
          display_label: "Amanda",
          phone_number: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await handleEvolutionConnectionUpdate("Amanda", "open");

    expect(result).toEqual({ processed: true, alertSent: false });
    expect(String(mocks.poolQuery.mock.calls[2]?.[0])).toContain("DELETE FROM sync_cursors");
  });

  it("does not alert during the temporary connecting state", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{
        id: "amanda-id",
        instance_name: "Amanda",
        display_label: "Amanda",
        phone_number: null,
      }],
    });

    const result = await handleEvolutionConnectionUpdate("Amanda", "connecting");

    expect(result).toEqual({ processed: true, alertSent: false });
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
    expect(mocks.sendUazapiTextMessage).not.toHaveBeenCalled();
  });
});
