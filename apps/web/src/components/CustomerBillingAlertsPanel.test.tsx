import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BillingAlertReport, BillingCustomerResult } from "../lib/api";
import { CustomerBillingAlertsView } from "./CustomerBillingAlertsPanel";

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
  });

  it("esconde o envio de quem nao gerencia o financeiro e mostra a previa", () => {
    const html = render({ canSend: false, preview: ["💰 *Cobrança — 25/09/2026*"] });
    expect(html).not.toContain("Enviar agora ao grupo");
    expect(html).toContain("Cobrança — 25/09/2026");
  });
});
