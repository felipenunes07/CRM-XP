import { describe, expect, it } from "vitest";
import {
  normalizeOlistWebhookBody,
  parseOlistWebhook,
  shouldProcessOrderEvent,
} from "./olistWebhookService.js";

const orderEvent = {
  versao: "1.0.0",
  cnpj: "48404755000188",
  tipo: "inclusao_pedido",
  dados: {
    id: 918273,
    numero: 4512,
    data: "18/08/2026",
    codigoSituacao: "aberto",
    descricaoSituacao: "Em aberto",
    idContato: 55,
    cliente: { nome: "Cliente Teste" },
  },
};

describe("parseOlistWebhook", () => {
  it("accepts an order creation event and returns the order id to sync", () => {
    expect(parseOlistWebhook(orderEvent)).toEqual({
      accepted: true,
      orderId: "918273",
      tipo: "inclusao_pedido",
    });
  });

  it("accepts an order update event", () => {
    const parsed = parseOlistWebhook({ ...orderEvent, tipo: "atualizacao_pedido" });
    expect(parsed).toMatchObject({ accepted: true, tipo: "atualizacao_pedido" });
  });

  it("accepts the situacao_pedido event sent by the API do ERP integration", () => {
    // Formato da aba Notificacoes: sem dados.id, o pedido vem em idVendaTiny.
    const parsed = parseOlistWebhook({
      versao: "1.0.0",
      cnpj: "48404755000188",
      idEcommerce: "770011",
      tipo: "situacao_pedido",
      dados: {
        idPedidoEcommerce: "X123",
        idVendaTiny: 918273,
        situacao: "3",
        descricaoSituacao: "Preparando envio",
      },
    });

    expect(parsed).toEqual({ accepted: true, orderId: "918273", tipo: "situacao_pedido" });
  });

  it("rejects the id 0 used for smoke tests instead of calling the Olist API", () => {
    expect(parseOlistWebhook({ tipo: "inclusao_pedido", dados: { id: 0 } })).toEqual({
      accepted: false,
      reason: "missing-order-id",
    });
  });

  it("ignores webhook types that do not touch sales, without treating them as errors", () => {
    const parsed = parseOlistWebhook({ ...orderEvent, tipo: "atualizacao_estoque" });
    expect(parsed).toEqual({ accepted: false, reason: "ignored-type:atualizacao_estoque" });
  });

  it("rejects a payload with no order id", () => {
    const parsed = parseOlistWebhook({ tipo: "inclusao_pedido", dados: { numero: 10 } });
    expect(parsed).toEqual({ accepted: false, reason: "missing-order-id" });
  });
});

describe("normalizeOlistWebhookBody", () => {
  it("unwraps a form-encoded payload sent as a JSON string", () => {
    const body = { payload: JSON.stringify(orderEvent) };
    expect(normalizeOlistWebhookBody(body)).toEqual(orderEvent);
  });

  it("parses a raw JSON string body", () => {
    expect(normalizeOlistWebhookBody(JSON.stringify(orderEvent))).toEqual(orderEvent);
  });

  it("passes a plain JSON body through untouched", () => {
    expect(normalizeOlistWebhookBody(orderEvent)).toBe(orderEvent);
  });
});

describe("shouldProcessOrderEvent", () => {
  it("collapses the retries Olist sends for the same order", () => {
    const now = Date.now();
    expect(shouldProcessOrderEvent("555001", now)).toBe(true);
    expect(shouldProcessOrderEvent("555001", now + 1_000)).toBe(false);
  });

  it("processes the same order again once the dedupe window has passed", () => {
    const now = Date.now();
    expect(shouldProcessOrderEvent("555002", now)).toBe(true);
    expect(shouldProcessOrderEvent("555002", now + 11_000)).toBe(true);
  });

  it("never blocks a different order", () => {
    const now = Date.now();
    expect(shouldProcessOrderEvent("555003", now)).toBe(true);
    expect(shouldProcessOrderEvent("555004", now)).toBe(true);
  });
});
