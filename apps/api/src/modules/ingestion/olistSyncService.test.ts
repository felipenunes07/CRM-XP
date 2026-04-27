import { describe, expect, it, vi } from "vitest";
import { extractOrderAttendantName, resolveOrderAttendantName } from "./olistSyncService.js";

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
