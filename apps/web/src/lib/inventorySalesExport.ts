import type { InventorySalesReportItem } from "@olist-crm/shared";

export interface InventorySalesExportGroup {
  label: string;
  units: number;
  revenue: number;
  stockUnits: number;
  lastSaleAt: string | null;
  skuCount: number;
}

export const INVENTORY_SALES_EXPORT_HEADERS = [
  "Grupo",
  "Peças vendidas",
  "Faturamento",
  "Preço médio",
  "Estoque hoje",
  "Última venda",
  "SKUs",
] as const;

export function buildInventorySalesExportRows(groups: InventorySalesExportGroup[]) {
  return groups.map((group) => [
    group.label,
    group.units,
    group.revenue,
    group.units > 0 ? group.revenue / group.units : null,
    group.stockUnits,
    group.lastSaleAt ?? "",
    group.skuCount,
  ]);
}

function localDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(value);
}

export async function buildInventorySalesWorkbook({
  groups,
  items,
  months,
  groupLabel,
  dateFrom,
  dateTo,
  filters,
}: {
  groups: InventorySalesExportGroup[];
  items: InventorySalesReportItem[];
  months: string[];
  groupLabel: string;
  dateFrom: string;
  dateTo: string;
  filters: Array<[string, string]>;
}) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    [groupLabel, ...INVENTORY_SALES_EXPORT_HEADERS.slice(1)],
    ...buildInventorySalesExportRows(groups),
  ]);

  sheet["!autofilter"] = { ref: `A1:G${Math.max(groups.length + 1, 1)}` };
  sheet["!cols"] = [
    { wch: 34 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 15 },
    { wch: 16 },
    { wch: 10 },
  ];

  for (let rowIndex = 2; rowIndex <= groups.length + 1; rowIndex += 1) {
    const revenueCell = sheet[`C${rowIndex}`];
    const averagePriceCell = sheet[`D${rowIndex}`];
    if (revenueCell) revenueCell.z = 'R$ #,##0.00;[Red]-R$ #,##0.00';
    if (averagePriceCell) averagePriceCell.z = 'R$ #,##0.00;[Red]-R$ #,##0.00';
  }
  XLSX.utils.book_append_sheet(workbook, sheet, "Vendas");

  const detailRows = [...items].sort((a, b) => b.totalUnits - a.totalUnits).map((item) => [
    item.sku, item.modelLabel, item.brand, item.factory, item.category, item.family,
    item.quality ?? "", item.color ?? "", item.totalUnits, item.totalRevenue,
    item.totalUnits > 0 ? item.totalRevenue / item.totalUnits : null,
    item.stockUnits, item.lastSaleAt ?? "", ...item.monthlyUnits, ...item.monthlyRevenue,
  ]);
  const detailSheet = XLSX.utils.aoa_to_sheet([
    ["SKU", "Modelo", "Marca", "Fábrica", "Tipo", "Família", "Qualidade", "Cor", "Peças vendidas", "Faturamento", "Preço médio", "Estoque hoje", "Última venda", ...months.map((month) => `Peças ${month}`), ...months.map((month) => `Faturamento ${month}`)],
    ...detailRows,
  ]);
  const lastColumn = XLSX.utils.encode_col(12 + months.length * 2);
  detailSheet["!autofilter"] = { ref: `A1:${lastColumn}${detailRows.length + 1}` };
  detailSheet["!cols"] = [{ wch: 18 }, { wch: 40 }, ...Array.from({ length: 11 }, () => ({ wch: 18 }))];
  for (let rowIndex = 2; rowIndex <= detailRows.length + 1; rowIndex += 1) {
    for (const columnIndex of [9, 10, ...months.map((_, index) => 13 + months.length + index)]) {
      const cell = detailSheet[`${XLSX.utils.encode_col(columnIndex)}${rowIndex}`];
      if (cell) cell.z = 'R$ #,##0.00;[Red]-R$ #,##0.00';
    }
  }
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Detalhes por SKU");

  const infoSheet = XLSX.utils.aoa_to_sheet([
    ["Relatório", `Vendas por ${groupLabel.toLowerCase()}`],
    ["Período", `${dateFrom} a ${dateTo}`],
    ["Gerado em", localDateTime(new Date())],
    ["Linhas exportadas", groups.length],
    ["SKUs detalhados", items.length],
    [],
    ["Filtros aplicados", "Valor"],
    ...filters,
  ]);
  infoSheet["!cols"] = [{ wch: 24 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(workbook, infoSheet, "Informações");

  return workbook;
}

export async function exportInventorySalesWorkbook(options: Parameters<typeof buildInventorySalesWorkbook>[0]) {
  const XLSX = await import("xlsx");
  const workbook = await buildInventorySalesWorkbook(options);
  XLSX.writeFile(workbook, `vendas_por_${options.groupLabel.toLowerCase()}_${options.dateFrom}_a_${options.dateTo}.xlsx`, {
    compression: true,
  });
}
