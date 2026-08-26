import type { CustomerCreditRow, CustomerCreditSnapshotMeta } from "@olist-crm/shared";
import {
  customerCreditHeadlineLabel,
  customerCreditRiskLabel,
  customerCreditVisibleFlags,
} from "./customerCredit";

export const CUSTOMER_FINANCIAL_EXPORT_HEADERS = [
  "Código",
  "Cliente",
  "Nome no arquivo",
  "Situação",
  "Risco",
  "Saldo devedor",
  "Saldo a favor",
  "Limite de crédito",
  "Crédito disponível",
  "Uso do limite",
  "Dentro do limite",
  "Prazo (dias)",
  "Último pedido",
  "Dias sem pedido",
  "Último pagamento",
  "Dias sem pagamento",
  "Observação",
  "Flags de atenção",
] as const;

type CustomerFinancialExportCell = string | number;

function formatExportDate(value: string | null) {
  if (!value) return "";

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateOnly) return value;

  return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
}

function formatExportDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export function buildCustomerFinancialExportRows(rows: CustomerCreditRow[]): CustomerFinancialExportCell[][] {
  return rows.map((row) => [
    row.customerCode,
    row.customerDisplayName,
    row.sourceDisplayName ?? "",
    customerCreditHeadlineLabel(row),
    customerCreditRiskLabel(row.riskLevel),
    row.debtAmount,
    row.creditBalanceAmount,
    row.creditLimit,
    row.availableCreditAmount,
    row.creditLimit > 0 ? row.debtAmount / row.creditLimit : "",
    row.withinCreditLimit ? "Sim" : "Não",
    row.paymentTerm ?? "",
    formatExportDate(row.lastOrderDate),
    row.daysSinceLastOrder ?? "",
    formatExportDate(row.lastPaymentDate),
    row.daysSinceLastPayment ?? "",
    row.observation,
    customerCreditVisibleFlags(row).join("; "),
  ]);
}

function localDateStamp(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function exportCustomerFinancialWorkbook({
  rows,
  snapshot,
  search,
}: {
  rows: CustomerCreditRow[];
  snapshot: CustomerCreditSnapshotMeta | null;
  search: string;
}) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    [...CUSTOMER_FINANCIAL_EXPORT_HEADERS],
    ...buildCustomerFinancialExportRows(rows),
  ]);

  sheet["!autofilter"] = { ref: `A1:R${Math.max(rows.length + 1, 1)}` };
  sheet["!cols"] = [
    { wch: 14 },
    { wch: 32 },
    { wch: 32 },
    { wch: 22 },
    { wch: 14 },
    { wch: 17 },
    { wch: 16 },
    { wch: 18 },
    { wch: 20 },
    { wch: 15 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 42 },
    { wch: 42 },
  ];

  for (let rowIndex = 2; rowIndex <= rows.length + 1; rowIndex += 1) {
    for (const column of ["F", "G", "H", "I"]) {
      const cell = sheet[`${column}${rowIndex}`];
      if (cell) cell.z = 'R$ #,##0.00;[Red]-R$ #,##0.00';
    }

    const usageCell = sheet[`J${rowIndex}`];
    if (usageCell) usageCell.z = "0%";
  }

  XLSX.utils.book_append_sheet(workbook, sheet, "Clientes");

  const generatedAt = new Date();
  const infoSheet = XLSX.utils.aoa_to_sheet([
    ["Relatório", "Financeiro por cliente"],
    ["Gerado em", formatExportDateTime(generatedAt.toISOString())],
    ["Clientes exportados", rows.length],
    ["Busca aplicada", search.trim() || "Nenhuma"],
    ["Arquivo de origem", snapshot?.sourceFileName ?? "Sem snapshot"],
    ["Arquivo atualizado em", snapshot ? formatExportDateTime(snapshot.sourceFileUpdatedAt) : ""],
    ["Importado no CRM em", snapshot ? formatExportDateTime(snapshot.importedAt) : ""],
  ]);
  infoSheet["!cols"] = [{ wch: 24 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(workbook, infoSheet, "Informações");

  XLSX.writeFile(workbook, `financeiro_clientes_${localDateStamp(generatedAt)}.xlsx`, {
    compression: true,
  });
}
