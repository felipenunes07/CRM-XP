import type { CustomerCreditOrderEntry, CustomerCreditPaymentEntry } from "@olist-crm/shared";
import { describe, expect, it } from "vitest";
import { buildSeries } from "./CustomerCreditBalanceChart";

function order(id: string, orderDate: string, totalAmount: number): CustomerCreditOrderEntry {
  return {
    id,
    orderDate,
    orderNumber: id,
    totalAmount,
    units: 1,
    status: "OK",
    seller: null,
  } as unknown as CustomerCreditOrderEntry;
}

function payment(id: string, paymentDate: string, amount: number): CustomerCreditPaymentEntry {
  return {
    id,
    paymentDate,
    paymentNumber: id,
    amount,
    paymentType: "TRF",
    observation: null,
  } as unknown as CustomerCreditPaymentEntry;
}

describe("buildSeries", () => {
  it("termina exatamente no saldo devedor atual", () => {
    const series = buildSeries(
      [order("p1", "2026-01-10", 100_000), order("p2", "2026-02-10", 50_000)],
      [payment("g1", "2026-01-20", 30_000)],
      120_000,
    );

    expect(series.at(-1)?.balance).toBe(120_000);
  });

  it("sobe com pedido e desce com pagamento", () => {
    const series = buildSeries(
      [order("p1", "2026-01-10", 100_000)],
      [payment("g1", "2026-01-20", 40_000)],
      60_000,
    );

    // saldo inicial = 60.000 - (100.000 - 40.000) = 0
    expect(series.map((point) => point.balance)).toEqual([0, 100_000, 60_000]);
    expect(series.map((point) => point.date)).toEqual(["2026-01-10", "2026-01-10", "2026-01-20"]);
  });

  it("soma movimentos do mesmo dia em um ponto so", () => {
    const series = buildSeries(
      [order("p1", "2026-03-01", 10_000), order("p2", "2026-03-01", 5_000)],
      [payment("g1", "2026-03-05", 15_000)],
      0,
    );

    expect(series).toHaveLength(3);
    expect(series[1]?.balance).toBe(15_000);
    expect(series.at(-1)?.balance).toBe(0);
  });

  it("nao devolve serie quando ha menos de dois dias com movimento", () => {
    expect(buildSeries([order("p1", "2026-01-10", 100)], [], 100)).toEqual([]);
    expect(buildSeries([], [], 0)).toEqual([]);
  });

  it("nunca mostra saldo negativo", () => {
    const series = buildSeries(
      [order("p1", "2026-01-10", 1_000)],
      [payment("g1", "2026-01-20", 900_000)],
      0,
    );

    expect(series.every((point) => point.balance >= 0)).toBe(true);
  });
});
