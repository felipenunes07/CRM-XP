import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  handleOlistWebhookMock,
  isValidOlistWebhookTokenMock,
  subscribeExecutiveDashboardUpdatesMock,
} = vi.hoisted(() => ({
  handleOlistWebhookMock: vi.fn(),
  isValidOlistWebhookTokenMock: vi.fn(),
  subscribeExecutiveDashboardUpdatesMock: vi.fn(),
}));

vi.mock("./modules/platform/authMiddleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  requirePermission: () => (_request: unknown, _response: unknown, next: () => void) => next(),
  requireRole: () => (_request: unknown, _response: unknown, next: () => void) => next(),
}));

vi.mock("./modules/ingestion/olistWebhookService.js", () => ({
  handleOlistWebhook: handleOlistWebhookMock,
  isValidOlistWebhookToken: isValidOlistWebhookTokenMock,
}));

vi.mock("./modules/crm/executiveDashboardBus.js", () => ({
  subscribeExecutiveDashboardUpdates: subscribeExecutiveDashboardUpdatesMock,
}));

import { createApp } from "./app.js";

describe("POST /api/webhooks/olist", () => {
  afterEach(() => {
    handleOlistWebhookMock.mockReset();
    isValidOlistWebhookTokenMock.mockReset();
  });

  it("refuses a call that does not carry the shared secret", async () => {
    isValidOlistWebhookTokenMock.mockReturnValue(false);

    const response = await request(createApp())
      .post("/api/webhooks/olist")
      .send({ tipo: "inclusao_pedido", dados: { id: 1 } });

    expect(response.status).toBe(401);
    expect(handleOlistWebhookMock).not.toHaveBeenCalled();
  });

  it("accepts a valid order notification without any login", async () => {
    isValidOlistWebhookTokenMock.mockReturnValue(true);
    handleOlistWebhookMock.mockResolvedValue({ received: true, processed: true, orderId: "918273" });

    const response = await request(createApp())
      .post("/api/webhooks/olist?token=segredo")
      .send({ tipo: "inclusao_pedido", dados: { id: 918273 } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ received: true, processed: true, orderId: "918273" });
    expect(isValidOlistWebhookTokenMock).toHaveBeenCalledWith("segredo");
  });

  it("still answers 200 when processing blows up, so Olist does not retry 10 times", async () => {
    isValidOlistWebhookTokenMock.mockReturnValue(true);
    handleOlistWebhookMock.mockRejectedValue(new Error("boom"));

    const response = await request(createApp())
      .post("/api/webhooks/olist?token=segredo")
      .send({ tipo: "inclusao_pedido", dados: { id: 42 } });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ received: true, processed: false });
  });

  it("reads a form-encoded body, not only JSON", async () => {
    isValidOlistWebhookTokenMock.mockReturnValue(true);
    handleOlistWebhookMock.mockResolvedValue({ received: true, processed: true });

    const response = await request(createApp())
      .post("/api/webhooks/olist?token=segredo")
      .type("form")
      .send({ payload: JSON.stringify({ tipo: "inclusao_pedido", dados: { id: 7 } }) });

    expect(response.status).toBe(200);
    expect(handleOlistWebhookMock).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.stringContaining("inclusao_pedido") }),
    );
  });
});

describe("GET /api/dashboard/executive/stream", () => {
  afterEach(() => {
    subscribeExecutiveDashboardUpdatesMock.mockReset();
  });

  it("opens a public SSE channel and pushes updates to the TV", async () => {
    let publish: ((update: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    subscribeExecutiveDashboardUpdatesMock.mockImplementation((handler: (update: unknown) => void) => {
      publish = handler;
      return unsubscribe;
    });

    const server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;

    const chunks: string[] = [];
    const received = await new Promise<string>((resolve, reject) => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/api/dashboard/executive/stream" },
        (response) => {
          expect(response.statusCode).toBe(200);
          expect(response.headers["content-type"]).toContain("text/event-stream");
          expect(response.headers["x-accel-buffering"]).toBe("no");

          response.setEncoding("utf8");
          response.on("data", (chunk: string) => {
            chunks.push(chunk);
            const body = chunks.join("");
            if (body.includes("olist-webhook")) {
              req.destroy();
              resolve(body);
            }
          });

          // Assim que o canal abre, simulamos a venda chegando pelo webhook.
          setTimeout(() => publish?.({
            reason: "olist-webhook:inclusao_pedido",
            source: "olist_webhook",
            recordsInserted: 3,
            updatedAt: "2026-08-18T21:00:00.000Z",
          }), 20);
        },
      );
      req.on("error", (error) => {
        if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") reject(error);
      });
    });

    expect(received).toContain("event: ready");
    expect(received).toContain(`"recordsInserted":3`);

    // O 'close' da request chega de forma assincrona depois do destroy do
    // cliente, entao esperamos o cleanup em vez de assumir a ordem.
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalled());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
