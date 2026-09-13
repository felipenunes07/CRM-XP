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

export async function exportInventorySalesWorkbook({
  groups,
  groupLabel,
  dateFrom,
  dateTo,
  filters,
}: {
  groups: InventorySalesExportGroup[];
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

  const infoSheet = XLSX.utils.aoa_to_sheet([
    ["Relatório", `Vendas por ${groupLabel.toLowerCase()}`],
    ["Período", `${dateFrom} a ${dateTo}`],
    ["Gerado em", localDateTime(new Date())],
    ["Linhas exportadas", groups.length],
    [],
    ["Filtros aplicados", "Valor"],
    ...filters,
  ]);
  infoSheet["!cols"] = [{ wch: 24 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(workbook, infoSheet, "Informações");

  XLSX.writeFile(workbook, `vendas_por_${groupLabel.toLowerCase()}_${dateFrom}_a_${dateTo}.xlsx`, {
    compression: true,
  });
}
