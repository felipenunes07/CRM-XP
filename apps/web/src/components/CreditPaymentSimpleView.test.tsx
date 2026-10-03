import type { CustomerCreditRow } from "@olist-crm/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { BillingAlertReport, BillingCustomerResult } from "../lib/api";
import {
  buildCreditSimpleRows,
  cardMembership,
  CreditPaymentSimpleView,
  filterCreditSimpleRows,
} from "./CreditPaymentSimpleView";

function creditRow(code: string, name: string, debtAmount: number, creditLimit = 0): CustomerCreditRow {
  return {
    id: `row-${code}`,
    customerId: `cust-${code}`,
    customerCode: code,
    customerDisplayName: name,
    sourceDisplayName: name,
    matched: true,
    balanceAmount: -debtAmount,
    debtAmount,
    creditBalanceAmount: 0,
    creditLimit,
    availableCreditAmount: creditLimit - debtAmount,
    withinCreditLimit: debtAmount <= creditLimit,
    operationalState: "OWES",
    riskLevel: "OK",
    observation: "",
    lastOrderDate: null,
    lastPaymentDate: null,
    daysSinceLastOrder: null,
    daysSinceLastPayment: null,
    paymentTerm: 30,
    riskScore: null,
    flags: [],
    hasOverCredit: false,
    hasOverduePayment: false,
    hasSeverelyOverduePayment: false,
    hasNoPayment: false,
    hasNoOrder: false,
    hasNegativeCredit: false,
    hasDebtWithoutCredit: false,
  } as CustomerCreditRow;
}

function billing(code: string, overrides: Partial<BillingCustomerResult>): BillingCustomerResult {
  return {
    customerCode: code,
    customerId: `cust-${code}`,
    displayName: code,
    status: null,
    debtAmount: 0,
    creditLimit: null,
    internalCreditLimit: null,
    paymentTerm: 30,
    limitLevel: "OK",
    limitUsage: null,
    pendingOrders: [],
    overdueAmount: 0,
    oldestOverdueDays: null,
    hasOverdue: false,
    missingPaymentTerm: false,
    lastSale: null,
    ...overrides,
  };
}

const leomar = billing("CL034", {
  limitLevel: "OVER_LIMIT",
  limitUsage: 2.11,
  hasOverdue: true,
  overdueAmount: 238_634,
  oldestOverdueDays: 34,
  lastSale: { orderNumber: "43300", orderDate: "2026-10-01", totalAmount: 67_145, seller: "Suelen" },
});
const techCell = billing("CL1214", {
  limitLevel: "NO_LIMIT",
  lastSale: { orderNumber: "43400", orderDate: "2026-10-02", totalAmount: 5_021, seller: "Amanda" },
});
const lenom = billing("CL002", {
  limitLevel: "NO_LIMIT",
  lastSale: { orderNumber: "30000", orderDate: "2024-10-09", totalAmount: 1_000, seller: "Thais" },
});

const report: BillingAlertReport = {
  today: "2026-10-02",
  overLimit: [leomar],
  overCredit: [],
  overdue: [leomar],
  nearLimit: [],
  noCredit: [lenom, techCell],
  missingPaymentTerm: [],
  ignored: [],
  unmatchedEntries: [],
};

const rows = [
  creditRow("CL034", "Leomar", 633_413, 300_000),
  creditRow("CL1214", "Tech Cell", 465),
  creditRow("CL002", "Lenom", 129_071),
  creditRow("CL500", "Em dia", 5_000, 50_000),
  creditRow("CL600", "Nao deve", 0, 10_000),
];

describe("aba Credito & Pagamento simples", () => {
  const all = buildCreditSimpleRows(rows, report);
  const membership = cardMembership(report);
  const base = { card: "all" as const, search: "", seller: "", period: "all" as const, sort: "debt" as const, today: "2026-10-02" };

  it("lista so quem deve, da maior divida para a menor", () => {
    expect(filterCreditSimpleRows(all, membership, base).map(({ row }) => row.customerCode)).toEqual(["CL034", "CL002", "CL500", "CL1214"]);
  });

  it("cards filtram pelo mesmo calculo da cobranca", () => {
    expect(filterCreditSimpleRows(all, membership, { ...base, card: "overdue" }).map(({ row }) => row.customerCode)).toEqual(["CL034"]);
    expect(filterCreditSimpleRows(all, membership, { ...base, card: "noCredit" }).map(({ row }) => row.customerCode)).toEqual(["CL002", "CL1214"]);
  });

  it("busca, quem vendeu e venda recente: ve quem liberou sem credito agora", () => {
    expect(filterCreditSimpleRows(all, membership, { ...base, search: "tech" }).map(({ row }) => row.customerCode)).toEqual(["CL1214"]);
    expect(filterCreditSimpleRows(all, membership, { ...base, seller: "Amanda" }).map(({ row }) => row.customerCode)).toEqual(["CL1214"]);
    expect(
      filterCreditSimpleRows(all, membership, { ...base, card: "noCredit", period: "7", sort: "recentSale" }).map(({ row }) => row.customerCode),
    ).toEqual(["CL1214"]);
  });

  it("mostra cards, filtros, situacao, ultima venda e editar credito", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CreditPaymentSimpleView
          rows={rows}
          report={report}
          isReportLoading={false}
          snapshot={null}
          selectedCodes={new Set()}
          onToggleRow={() => undefined}
          onSetSelection={() => undefined}
          onExport={() => undefined}
          isExporting={false}
          exportError={false}
          onEditCredit={() => undefined}
          canRefresh
          isRefreshing={false}
          onRefresh={() => undefined}
        />
      </MemoryRouter>,
    );
    for (const text of ["Todos devendo", "Estourou o limite", "Vencido", "Sem crédito", "Passou do crédito", "Perto do limite"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Quem vendeu: todas");
    expect(html).toContain("Baixar Excel");
    expect(html).toContain("Leomar");
    expect(html).toContain("Suelen");
    expect(html).toContain("há 34 dia(s)");
    expect(html).toContain("Editar");
    expect(html).not.toContain("Nao deve");
  });

  it("quem deve sem prazo cadastrado nao aparece como em dia", () => {
    const semPrazo = billing("CL700", { limitLevel: "OK", missingPaymentTerm: true, paymentTerm: null });
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CreditPaymentSimpleView
          rows={[creditRow("CL700", "Sem Prazo Ltda", 1_000, 50_000)]}
          report={{ ...report, overLimit: [], overdue: [], noCredit: [], missingPaymentTerm: [semPrazo] }}
          isReportLoading={false}
          snapshot={null}
          selectedCodes={new Set()}
          onToggleRow={() => undefined}
          onSetSelection={() => undefined}
          onExport={() => undefined}
          isExporting={false}
          exportError={false}
          canRefresh={false}
          isRefreshing={false}
          onRefresh={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Sem prazo");
    expect(html).not.toContain("Em dia");
  });
});
