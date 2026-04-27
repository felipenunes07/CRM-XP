import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SalesPerformancePanel } from "./SalesPerformancePanel";

vi.mock("../i18n", () => ({
  useUiLanguage: () => ({
    tx: (pt: string) => pt,
  }),
}));

describe("SalesPerformancePanel", () => {
  const salesPerformance = [
    {
      attendant: "Amanda",
      totalOrders: 8,
      uniqueCustomers: 8,
      totalRevenue: 17286,
      totalItems: 343,
    },
    {
      attendant: "Suelen",
      totalOrders: 13,
      uniqueCustomers: 9,
      totalRevenue: 54871.4,
      totalItems: 968,
    },
    {
      attendant: "Thais",
      totalOrders: 1,
      uniqueCustomers: 1,
      totalRevenue: 4964,
      totalItems: 74,
    },
    {
      attendant: "Tamires",
      totalOrders: 2,
      uniqueCustomers: 2,
      totalRevenue: 1100,
      totalItems: 22,
    },
    {
      attendant: "Lucas",
      totalOrders: 2,
      uniqueCustomers: 2,
      totalRevenue: 2315,
      totalItems: 17,
    },
    {
      attendant: "Sem atendente",
      totalOrders: 8,
      uniqueCustomers: 8,
      totalRevenue: 44424.84,
      totalItems: 740,
    },
  ];

  it("shows today's ranking ordered by pieces and keeps sem atendente visible for reconciliation", () => {
    const markup = renderToStaticMarkup(
      <SalesPerformancePanel
        salesPerformance={salesPerformance}
        reactivationLeaderboard={[]}
        newCustomerLeaderboard={[]}
        prospectingLeaderboard={[]}
        rankingPeriod="today"
      />,
    );

    expect(markup).toContain("Peças de hoje");
    expect(markup).toContain("Ranking de Peças de Hoje");

    const suelenIndex = markup.indexOf("Suelen");
    const semAtendenteIndex = markup.indexOf("Sem atendente");
    const amandaIndex = markup.indexOf("Amanda");
    const thaisIndex = markup.indexOf("Thais");
    const tamiresIndex = markup.indexOf("Tamires");
    const lucasIndex = markup.indexOf("Lucas");

    expect(suelenIndex).toBeGreaterThan(-1);
    expect(semAtendenteIndex).toBeGreaterThan(suelenIndex);
    expect(amandaIndex).toBeGreaterThan(semAtendenteIndex);
    expect(thaisIndex).toBeGreaterThan(amandaIndex);
    expect(tamiresIndex).toBeGreaterThan(thaisIndex);
    expect(lucasIndex).toBeGreaterThan(tamiresIndex);
  });

  it("keeps sem atendente hidden in the monthly ranking", () => {
    const markup = renderToStaticMarkup(
      <SalesPerformancePanel
        salesPerformance={salesPerformance}
        reactivationLeaderboard={[]}
        newCustomerLeaderboard={[]}
        prospectingLeaderboard={[]}
        rankingPeriod="month"
      />,
    );

    expect(markup).toContain("Ranking Mensal");
    expect(markup).not.toContain("Sem atendente");
  });
});
