import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BillingAlertReport, BillingCustomerResult } from "../lib/api";
import { CustomerBillingAlertsView, filterAndSortBillingRows } from "./CustomerBillingAlertsPanel";

const leomar: BillingCustomerResult = {
  customerCode: "CL034",
  customerId: "customer-34",
  displayName: "Leomar",
  status: null,
  debtAmount: 600_768,
  creditLimit: 300_000,
  internalCreditLimit: 500_000,
  paymentTerm: 30,
  limitLevel: "OVER_LIMIT",
  limitUsage: 2.0026,
  pendingOrders: [
    {
      orderKey: "CL034|2026-07-20|41470",
      orderNumber: "41470",
      orderDate: "2026-07-20",
      dueDate: "2026-08-19",
      totalAmount: 50_000,
      pendingAmount: 12_000,
      daysOverdue: 37,
      overdue: true,
    },
  ],
  overdueAmount: 12_000,
  oldestOverdueDays: 37,
  hasOverdue: true,
  missingPaymentTerm: false,
};

const report: BillingAlertReport = {
  today: "2026-09-25",
  overLimit: [leomar],
  overCredit: [],
  overdue: [leomar],
  nearLimit: [],
  missingPaymentTerm: [],
  ignored: [],
  unmatchedEntries: [
    { source: "PAG", entryKey: "k1", customerCode: "OEM382", entryDate: "2026-07-30", amount: 60_000, reference: "TRF" },
  ],
};

function render(overrides: Partial<Parameters<typeof CustomerBillingAlertsView>[0]> = {}) {
  return renderToStaticMarkup(
    <CustomerBillingAlertsView
      report={report}
      isLoading={false}
      isError={false}
      canSend
      preview={null}
      isPreviewing={false}
      isSending={false}
      sendResult={null}
      onPreview={() => undefined}
      onSend={() => undefined}
      onSelectCustomer={() => undefined}
      {...overrides}
    />,
  );
}

describe("CustomerBillingAlertsView", () => {
  it("mostra os contadores e quem estourou o limite", () => {
    const html = render();
    expect(html).toContain("Quem cobrar hoje");
    expect(html).toContain("Estourou o limite");
    expect(html).toContain("CL034");
    expect(html).toContain("Leomar");
    expect(html).toContain("200%");
    expect(html).toContain("Enviar agora ao grupo");
    expect(html).toContain("OEM382");
    expect(html).toContain("não existe no RESUMO");
  });

  it("tem a opcao de quem deve e nao tem credito", () => {
    const html = render({
      report: { ...report, noCredit: [{ ...leomar, customerCode: "KH76", displayName: "Ln129", creditLimit: null, internalCreditLimit: null, limitLevel: "NO_LIMIT", limitUsage: null }] },
    });
    expect(html).toContain("Sem crédito");
  });

  it("mostra a coluna de ultima venda com quem vendeu e os filtros", () => {
    const html = render({
      report: { ...report, overLimit: [{ ...leomar, lastSale: { orderNumber: "43300", orderDate: "2026-09-25", totalAmount: 12_000, seller: "Thais" } }] },
    });
    expect(html).toContain("Última venda");
    expect(html).toContain("Thais");
    expect(html).toContain("Venda mais recente");
    expect(html).toContain("Quem vendeu");
    expect(html).toContain("Últimos 7 dias");
  });

  it("esconde o envio de quem nao gerencia o financeiro e mostra a previa", () => {
    const html = render({ canSend: false, preview: ["💰 *Cobrança — 25/09/2026*"] });
    expect(html).not.toContain("Enviar agora ao grupo");
    expect(html).toContain("Cobrança — 25/09/2026");
  });
});

describe("filterAndSortBillingRows", () => {
  const base = { ...leomar };
  const rows = [
    { ...base, customerCode: "A", debtAmount: 900, lastSale: { orderNumber: "1", orderDate: "2026-06-01", totalAmount: 100, seller: "Suelen" } },
    { ...base, customerCode: "B", debtAmount: 500, lastSale: { orderNumber: "2", orderDate: "2026-09-29", totalAmount: 100, seller: "Thais" } },
    { ...base, customerCode: "C", debtAmount: 300, lastSale: { orderNumber: "3", orderDate: "2026-09-20", totalAmount: 100, seller: "Thais" } },
    { ...base, customerCode: "D", debtAmount: 100, lastSale: null },
  ];
  const today = "2026-10-02";

  it("mantem a ordem por valor e ordena pela venda mais recente", () => {
    expect(filterAndSortBillingRows(rows, { sort: "amount", seller: "", period: "all", today }).map((row) => row.customerCode)).toEqual(["A", "B", "C", "D"]);
    expect(filterAndSortBillingRows(rows, { sort: "recentSale", seller: "", period: "all", today }).map((row) => row.customerCode)).toEqual(["B", "C", "A", "D"]);
  });

  it("filtra por quem vendeu e por periodo da ultima venda", () => {
    expect(filterAndSortBillingRows(rows, { sort: "amount", seller: "Thais", period: "all", today }).map((row) => row.customerCode)).toEqual(["B", "C"]);
    expect(filterAndSortBillingRows(rows, { sort: "amount", seller: "", period: "7", today }).map((row) => row.customerCode)).toEqual(["B"]);
    expect(filterAndSortBillingRows(rows, { sort: "amount", seller: "", period: "30", today }).map((row) => row.customerCode)).toEqual(["B", "C"]);
  });
});
