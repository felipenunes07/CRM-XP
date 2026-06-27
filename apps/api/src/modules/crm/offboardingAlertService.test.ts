import { beforeEach, describe, expect, it, vi } from "vitest";

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_JID = "120363425564890886@g.us";

const queryMock = vi.fn();
const connectMock = vi.fn();
const clientQueryMock = vi.fn();
const releaseMock = vi.fn();
const sendUazapiTextMessageMock = vi.fn();

vi.mock("../../db/client.js", () => ({
  pool: {
    query: queryMock,
    connect: connectMock,
  },
}));

vi.mock("../../lib/env.js", () => ({
  env: {
    OFFBOARDING_ALERT_ENABLED: false,
    OFFBOARDING_ALERT_GROUP_JID: GROUP_JID,
    OFFBOARDING_ALERT_HOUR: 8,
    OFFBOARDING_ALERT_INSTANCE_ID: "",
    OFFBOARDING_ALERT_TIMEZONE: "America/Sao_Paulo",
  },
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../whatsapp/evolutionService.js", () => ({
  sendWhatsappInstanceTextMessage: vi.fn(),
  sendWhatsappTextMessage: vi.fn(),
}));

vi.mock("../whatsapp/uazapiService.js", () => ({
  sendUazapiTextMessage: sendUazapiTextMessageMock,
}));

const { sendOffboardingForCustomers } = await import("./offboardingAlertService.js");

describe("sendOffboardingForCustomers", () => {
  beforeEach(() => {
    queryMock.mockReset();
    connectMock.mockReset();
    clientQueryMock.mockReset();
    releaseMock.mockReset();
    sendUazapiTextMessageMock.mockReset();

    const claimedKeys = new Set<string>();

    connectMock.mockResolvedValue({
      query: clientQueryMock,
      release: releaseMock,
    });

    clientQueryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM sync_cursors") && sql.includes("updated_at >")) {
        const keys = (params?.[0] as string[]) ?? [];
        return { rows: keys.filter((key) => claimedKeys.has(key)).map((key) => ({ key })) };
      }
      if (sql.includes("INSERT INTO sync_cursors")) {
        for (const key of ((params?.[0] as string[]) ?? [])) {
          claimedKeys.add(key);
        }
      }
      return { rows: [] };
    });

    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM customers c") && sql.includes("c.id = ANY")) {
        return {
          rows: [
            {
              customer_id: CUSTOMER_ID,
              customer_code: "CL001",
              display_name: "Cliente Teste",
              last_purchase_at: "2026-03-20",
              days_since_last_purchase: 90,
              total_pieces: 180,
              total_orders: 3,
              months_active: 2,
            },
          ],
        };
      }

      if (sql.includes("FROM whatsapp_instances")) {
        return {
          rows: [
            {
              provider: "UAZAPI",
              uazapi_base_url: "https://uazapi.example.test",
              uazapi_token: "token",
            },
          ],
        };
      }

      return { rows: [] };
    });
  });

  it("blocks an immediate duplicate manual send for the same customer and group", async () => {
    const first = await sendOffboardingForCustomers([CUSTOMER_ID]);
    const second = await sendOffboardingForCustomers([CUSTOMER_ID]);

    expect(first.sent).toBe(true);
    expect(second.sent).toBe(false);
    expect(sendUazapiTextMessageMock).toHaveBeenCalledTimes(2);
  });
});
