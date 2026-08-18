import { describe, expect, it, vi } from "vitest";
import {
  extractOrderAttendantName,
  getOlistTodayDateKey,
  isOlistOrderSnapshotUnchanged,
  resolveOrderAttendantName,
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
