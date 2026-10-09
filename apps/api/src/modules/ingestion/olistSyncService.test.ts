import { describe, expect, it, vi } from "vitest";
import {
  extractOrderAttendantName,
  getOlistOrderTotal,
  getOlistTodayDateKey,
  isOlistOrderSnapshotUnchanged,
  resolveOrderAttendantName,
  shouldCheckOlistCreditFallback,
} from "./olistSyncService.js";

describe("Olist current-day safety scan", () => {
  it("uses the Sao Paulo calendar day even around the UTC day boundary", () => {
    expect(getOlistTodayDateKey(new Date("2026-08-19T01:30:00.000Z"))).toBe("2026-08-18");
  });

  it("detects changed order lines so a stale snapshot is replaced", () => {
    const existing = [{ fingerprint: "old", order_status: "Enviado", attendant_name: "Suelen" }];
    const incoming = [{ fingerprint: "new", orderStatus: "Enviado", attendantName: "Suelen" }];
    expect(isOlistOrderSnapshotUnchanged(existing, incoming)).toBe(false);
  });

  it("keeps an identical order snapshot without rewriting it", () => {
    const existing = [{ fingerprint: "same", order_status: "Enviado", attendant_name: "Suelen" }];
    const incoming = [{ fingerprint: "same", orderStatus: "Enviado", attendantName: "Suelen" }];
    expect(isOlistOrderSnapshotUnchanged(existing, incoming)).toBe(true);
  });

  it("uses the order grand total and falls back to the item lines", () => {
    const order = {
      total_pedido: "1.250,50",
      itens: [{ item: { quantidade: "2", valor_unitario: "500" } }],
    };
    expect(getOlistOrderTotal(order as never)).toBe(1250.5);
    expect(getOlistOrderTotal({ ...order, total_pedido: undefined } as never)).toBe(1000);
  });

  it("checks a new proposal from today as a webhook contingency", () => {
    expect(shouldCheckOlistCreditFallback({
      orderStatus: "Em aberto",
      orderDate: "09/10/2026",
      wasKnown: false,
    }, "2026-10-09")).toBe(true);
  });

  it("does not flood the group with unknown historical proposals", () => {
    expect(shouldCheckOlistCreditFallback({
      orderStatus: "Proposta comercial",
      orderDate: "08/10/2026",
      wasKnown: false,
    }, "2026-10-09")).toBe(false);
  });

  it("rechecks a known order that changed into a proposal", () => {
    expect(shouldCheckOlistCreditFallback({
      orderStatus: "Orcamento",
      orderDate: "01/09/2026",
      wasKnown: true,
    }, "2026-10-09")).toBe(true);
  });

  it("ignores non-proposal statuses in the fallback", () => {
    expect(shouldCheckOlistCreditFallback({
      orderStatus: "Preparando envio",
      orderDate: "09/10/2026",
      wasKnown: true,
    }, "2026-10-09")).toBe(false);
  });
});

describe("olistSyncService attendant fallback", () => {
  it("extracts the attendant directly from the raw order payload when Olist sends it", () => {
    expect(
      extractOrderAttendantName({
        id: 1,
        numero: "39500",
        data_pedido: "27/04/2026",
        cliente: {
          codigo: "CL903",
          nome: "CL903 - Leopoldo",
        },
        itens: [],
        situacao: "Enviado",
        nome_vendedor: "Amanda",
      } as never),
    ).toBe("Amanda");
  });

  it("falls back to the contact seller before using the historical attendant", async () => {
    const fromContact = await resolveOrderAttendantName(
      {
        id: 1,
        numero: "39500",
        data_pedido: "27/04/2026",
        cliente: {
          codigo: "CL903",
          nome: "CL903 - Leopoldo",
        },
        itens: [],
        situacao: "Enviado",
      } as never,
      {
        findContactAttendantByCustomer: vi.fn().mockResolvedValue("Suelen"),
        getHistoricalAttendantByCustomerCode: vi.fn().mockResolvedValue("Amanda"),
      },
    );

    expect(fromContact).toBe("Suelen");

    const fromHistory = await resolveOrderAttendantName(
      {
        id: 1,
        numero: "39500",
        data_pedido: "27/04/2026",
        cliente: {
          codigo: "CL903",
          nome: "CL903 - Leopoldo",
        },
        itens: [],
        situacao: "Enviado",
      } as never,
      {
        findContactAttendantByCustomer: vi.fn().mockResolvedValue(null),
        getHistoricalAttendantByCustomerCode: vi.fn().mockResolvedValue("Amanda"),
      },
    );

    expect(fromHistory).toBe("Amanda");
  });
});
