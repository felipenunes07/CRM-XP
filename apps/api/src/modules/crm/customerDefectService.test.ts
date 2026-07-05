import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCustomerDefectOverviewSummary,
  buildCustomerDefectRows,
  findCustomerDefectWorkbooks,
  getCustomerDefectPurchasePeriod,
  getCustomerDefectYearPeriods,
  parseCustomerDefectWorkbook,
  parseCustomerDefectWorkbooks,
  shouldRunCustomerDefectSync,
  sortCustomerDefectRows,
  type ParsedCustomerDefectAggregate,
  type ResolvedCustomerDefectRow,
} from "./customerDefectService.js";

const tempDirs: string[] = [];

async function writeWorkbook(rows: Array<Record<string, unknown>>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-defects-test-"));
  tempDirs.push(tempDir);
  const filePath = path.join(tempDir, "defeitos.xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "DEFEITOS");
  XLSX.writeFile(workbook, filePath);
  return filePath;
}

async function writeWorkbookFromRows(fileName: string, rows: unknown[][]) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-defects-test-"));
  tempDirs.push(tempDir);
  const filePath = path.join(tempDir, fileName);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "DEFEITOS");
  XLSX.writeFile(workbook, filePath);
  return filePath;
}

describe("customerDefectService", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("parses valid OK defect rows and aggregates by customer over the real workbook period", async () => {
    const filePath = await writeWorkbook([
      {
        COD: "DEF - CL542 45971",
        OK: "OK",
        CL: "CL542",
        DATA: "2025-11-10",
        "UND.": -1,
        "Descrição": "SM-A31 WF LCD | PRETO",
        SKU: "0578-1",
        Valor: 51,
        Total: -51,
        Cliente: "Vini Cell",
        STAUS: "OK",
      },
      {
        COD: "DEF - CL542 46207",
        OK: "OK",
        CL: " cl542 ",
        DATA: "2026-07-04",
        "UND.": "-2",
        "Descrição": "MT-E6 PLUS WF ORI | PRETO",
        SKU: "0668-1",
        Valor: 51,
        Total: "-102",
        Cliente: "Vini Cell",
        STAUS: "OK",
      },
      {
        COD: "DEF - CL999 46207",
        OK: "",
        CL: "CL999",
        DATA: "2026-07-04",
        "UND.": -9,
        SKU: "0999-1",
        Total: -900,
        Cliente: "Ignored Blank Status",
        STAUS: "",
      },
      {
        COD: "DEF - CL888 46207",
        OK: "OK",
        CL: "",
        DATA: "2026-07-04",
        "UND.": -4,
        SKU: "0888-1",
        Total: -400,
        Cliente: "Ignored Blank Code",
        STAUS: "OK",
      },
    ]);

    const parsed = await parseCustomerDefectWorkbook(filePath, filePath);
    const cl542 = parsed.rowsByCode.get("CL542");

    expect(parsed.period).toEqual({ startDate: "2025-11-10", endDate: "2026-07-04" });
    expect(parsed.totalValidRows).toBe(2);
    expect(parsed.rowsByCode.size).toBe(1);
    expect(cl542?.sourceDisplayName).toBe("Vini Cell");
    expect(cl542?.returnedPieces).toBe(3);
    expect(cl542?.returnedAmount).toBe(153);
    expect(cl542?.defectSkuCount).toBe(2);
    expect(cl542?.firstDefectDate).toBe("2025-11-10");
    expect(cl542?.lastDefectDate).toBe("2026-07-04");
  });

  it("counts only negative defect movements as returned pieces and keeps positive movements as replacements", async () => {
    const filePath = await writeWorkbookFromRows("defeitos-2026.xlsx", [
      ["COD", "OK", "CL", "DATA", "UND.", "Descrição", "SKU", "Valor", "Total", "Cliente", "Nota", "Vendedor", "Recusadas", "STAUS"],
      ["DEF - CL542 45971", "OK", "CL542", "11/10/25", -2, "SM-A31 WF LCD | PRETO", "0578-1", 51, -102, "Vini Cell", "", "", "", "OK"],
      ["DEF - CL542 45971", "OK", "CL542", "11/10/25", 1, "SM-A31 WF LCD | PRETO", "0578-1", 51, 51, "Vini Cell", "", "", "", "OK"],
    ]);

    const parsed = await parseCustomerDefectWorkbook(filePath, filePath);
    const cl542 = parsed.rowsByCode.get("CL542") as (ParsedCustomerDefectAggregate & { replacementPieces?: number }) | undefined;

    expect(parsed.totalValidRows).toBe(2);
    expect(cl542?.returnedPieces).toBe(2);
    expect(cl542?.returnedAmount).toBe(102);
    expect(cl542?.replacementPieces).toBe(1);
  });

  it("parses the 2023-2024 legacy defect layout without OK and CL headers", async () => {
    const filePath = await writeWorkbookFromRows("defeitos-2023-2024.xlsx", [
      ["CL127", "DATA", "UND.", "Descrição", "DIF", "Valor", "Total", "Cliente/客户"],
      ["KH19", "5/17/23", -1, "MT-ONE VISION WF ORI BLACK", "0484-3", 135, -135, "KORAI 604"],
      ["KH19", "5/17/23", 1, "MT-ONE VISION WF ORI BLACK", "0484-3", 135, 135, "KORAI 604"],
    ]);

    const parsed = await parseCustomerDefectWorkbook(filePath, filePath);
    const kh19 = parsed.rowsByCode.get("KH19") as (ParsedCustomerDefectAggregate & { replacementPieces?: number }) | undefined;

    expect(parsed.period).toEqual({ startDate: "2023-05-17", endDate: "2023-05-17" });
    expect(parsed.totalValidRows).toBe(2);
    expect(kh19?.sourceDisplayName).toBe("KORAI 604");
    expect(kh19?.returnedPieces).toBe(1);
    expect(kh19?.replacementPieces).toBe(1);
    expect(kh19?.defectSkuCount).toBe(1);
  });

  it("consolidates multiple annual defect workbooks into one snapshot period", async () => {
    const legacyFilePath = await writeWorkbookFromRows("defeitos-2023-2024.xlsx", [
      ["CL127", "DATA", "UND.", "Descrição", "DIF", "Valor", "Total", "Cliente/客户"],
      ["KH19", "5/17/23", -1, "MT-ONE VISION WF ORI BLACK", "0484-3", 135, -135, "KORAI 604"],
    ]);
    const currentFilePath = await writeWorkbookFromRows("defeitos-2026.xlsx", [
      ["COD", "OK", "CL", "DATA", "UND.", "Descrição", "SKU", "Valor", "Total", "Cliente", "Nota", "Vendedor", "Recusadas", "STAUS"],
      ["DEF - KH19 46207", "OK", "KH19", "7/4/26", -2, "SM-A31 WF LCD | PRETO", "0578-1", 51, -102, "KORAI 604", "", "", "", "OK"],
    ]);

    const parsed = await parseCustomerDefectWorkbooks([
      {
        fullPath: legacyFilePath,
        sourcePath: legacyFilePath,
        fileName: path.basename(legacyFilePath),
        fileSizeBytes: 1,
        fileUpdatedAt: "2025-02-17T15:39:09.000Z",
      },
      {
        fullPath: currentFilePath,
        sourcePath: currentFilePath,
        fileName: path.basename(currentFilePath),
        fileSizeBytes: 1,
        fileUpdatedAt: "2026-07-04T13:03:36.000Z",
      },
    ]);
    const kh19 = parsed.rowsByCode.get("KH19");

    expect(parsed.period).toEqual({ startDate: "2023-05-17", endDate: "2026-07-04" });
    expect(parsed.totalValidRows).toBe(2);
    expect(parsed.sourceFiles).toHaveLength(2);
    expect(kh19?.returnedPieces).toBe(3);
  });

  it("discovers current and Antigos defect workbooks while ignoring unrelated xlsx files", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "crm-defects-test-"));
    tempDirs.push(tempDir);
    const antigosDir = path.join(tempDir, "Antigos");
    await fs.mkdir(antigosDir);

    await Promise.all([
      fs.writeFile(path.join(tempDir, "坏品表 PLANILHA DEFEITOS 2026.xlsx"), ""),
      fs.writeFile(path.join(tempDir, "Import propostas comerciais.xlsx"), ""),
      fs.writeFile(path.join(antigosDir, "坏品表 PLANILHA DEFEITOS 2025.xlsx"), ""),
      fs.writeFile(path.join(antigosDir, "坏品表 PLANILHA DEFEITOS 2023-2024.xlsx"), ""),
    ]);

    const candidates = await findCustomerDefectWorkbooks(tempDir);

    expect(candidates.map((candidate) => candidate.fileName).sort()).toEqual([
      "坏品表 PLANILHA DEFEITOS 2023-2024.xlsx",
      "坏品表 PLANILHA DEFEITOS 2025.xlsx",
      "坏品表 PLANILHA DEFEITOS 2026.xlsx",
    ]);
  });

  it("uses the full first defect year as the purchase base period", () => {
    expect(getCustomerDefectPurchasePeriod({ startDate: "2023-05-17", endDate: "2026-07-04" })).toEqual({
      startDate: "2023-01-01",
      endDate: "2026-07-04",
    });
    expect(getCustomerDefectYearPeriods({ startDate: "2023-05-17", endDate: "2026-07-04" })).toEqual([
      { year: 2023, startDate: "2023-01-01", endDate: "2023-12-31" },
      { year: 2024, startDate: "2024-01-01", endDate: "2024-12-31" },
      { year: 2025, startDate: "2025-01-01", endDate: "2025-12-31" },
      { year: 2026, startDate: "2026-01-01", endDate: "2026-07-04" },
    ]);
  });

  it("sorts by return rate before returned pieces and revenue", () => {
    const rows: ParsedCustomerDefectAggregate[] = [
      {
        customerCode: "CL100",
        sourceDisplayName: "High revenue",
        returnedPieces: 20,
        replacementPieces: 0,
        returnedAmount: 200,
        defectSkuCount: 2,
        firstDefectDate: "2026-01-01",
        lastDefectDate: "2026-01-02",
        rawRows: [],
        purchasedPieces: 1000,
        revenue: 50000,
        orderCount: 10,
        returnRate: 0.02,
      },
      {
        customerCode: "CL200",
        sourceDisplayName: "Highest rate",
        returnedPieces: 3,
        replacementPieces: 0,
        returnedAmount: 90,
        defectSkuCount: 1,
        firstDefectDate: "2026-01-01",
        lastDefectDate: "2026-01-01",
        rawRows: [],
        purchasedPieces: 10,
        revenue: 300,
        orderCount: 1,
        returnRate: 0.3,
      },
      {
        customerCode: "CL300",
        sourceDisplayName: "Same rate more pieces",
        returnedPieces: 5,
        replacementPieces: 0,
        returnedAmount: 150,
        defectSkuCount: 1,
        firstDefectDate: "2026-01-01",
        lastDefectDate: "2026-01-01",
        rawRows: [],
        purchasedPieces: 20,
        revenue: 800,
        orderCount: 2,
        returnRate: 0.25,
      },
      {
        customerCode: "CL400",
        sourceDisplayName: "Same rate fewer pieces",
        returnedPieces: 2,
        replacementPieces: 0,
        returnedAmount: 60,
        defectSkuCount: 1,
        firstDefectDate: "2026-01-01",
        lastDefectDate: "2026-01-01",
        rawRows: [],
        purchasedPieces: 8,
        revenue: 900,
        orderCount: 2,
        returnRate: 0.25,
      },
    ];

    expect(sortCustomerDefectRows(rows).map((row) => row.customerCode)).toEqual(["CL200", "CL300", "CL400", "CL100"]);
  });

  it("builds return-rate rows by crossing parsed defects with same-period purchases", () => {
    const parsedRows: ParsedCustomerDefectAggregate[] = [
      {
        customerCode: "CL542",
        sourceDisplayName: "Vini Cell",
        returnedPieces: 3,
        replacementPieces: 1,
        returnedAmount: 153,
        defectSkuCount: 2,
        firstDefectDate: "2025-11-10",
        lastDefectDate: "2026-07-04",
        rawRows: [],
        purchasedPieces: 0,
        revenue: 0,
        orderCount: 0,
        returnRate: null,
      },
      {
        customerCode: "CL999",
        sourceDisplayName: "Sem compra",
        returnedPieces: 1,
        replacementPieces: 0,
        returnedAmount: 20,
        defectSkuCount: 1,
        firstDefectDate: "2026-01-02",
        lastDefectDate: "2026-01-02",
        rawRows: [],
        purchasedPieces: 0,
        revenue: 0,
        orderCount: 0,
        returnRate: null,
      },
    ];

    const rows = buildCustomerDefectRows(
      parsedRows,
      new Map([["CL542", { id: "customer-1", displayName: "Vini Cell CRM" }]]),
      new Map([["CL542", { purchasedPieces: 30, revenue: 3000, orderCount: 4 }]]),
    );

    expect(rows).toMatchObject([
      {
        customerId: "customer-1",
        customerCode: "CL542",
        customerDisplayName: "Vini Cell CRM",
        matched: true,
        purchasedPieces: 30,
        revenue: 3000,
        orderCount: 4,
        returnedPieces: 3,
        replacementPieces: 1,
        returnRate: 0.1,
      },
      {
        customerId: null,
        customerCode: "CL999",
        customerDisplayName: "Sem compra",
        matched: false,
        purchasedPieces: 0,
        returnRate: null,
      },
    ]);
  });

  it("builds summary totals and highlights customers above the overall return rate", () => {
    const rows: ResolvedCustomerDefectRow[] = [
      {
        customerCode: "CL100",
        sourceDisplayName: "Cliente 100",
        returnedPieces: 10,
        replacementPieces: 2,
        returnedAmount: 500,
        defectSkuCount: 2,
        firstDefectDate: "2026-01-01",
        lastDefectDate: "2026-01-10",
        rawRows: [],
        purchasedPieces: 100,
        revenue: 10000,
        orderCount: 5,
        returnRate: 0.1,
        customerId: "customer-100",
        customerDisplayName: "Cliente 100",
        matched: true,
        yearlyBreakdown: [],
      },
      {
        customerCode: "CL200",
        sourceDisplayName: "Cliente 200",
        returnedPieces: 2,
        replacementPieces: 0,
        returnedAmount: 120,
        defectSkuCount: 1,
        firstDefectDate: "2026-01-02",
        lastDefectDate: "2026-01-02",
        rawRows: [],
        purchasedPieces: 100,
        revenue: 8000,
        orderCount: 3,
        returnRate: 0.02,
        customerId: "customer-200",
        customerDisplayName: "Cliente 200",
        matched: true,
        yearlyBreakdown: [],
      },
      {
        customerCode: "CL999",
        sourceDisplayName: "Sem compra",
        returnedPieces: 1,
        replacementPieces: 0,
        returnedAmount: 50,
        defectSkuCount: 1,
        firstDefectDate: "2026-01-03",
        lastDefectDate: "2026-01-03",
        rawRows: [],
        purchasedPieces: 0,
        revenue: 0,
        orderCount: 0,
        returnRate: null,
        customerId: null,
        customerDisplayName: "Sem compra",
        matched: false,
        yearlyBreakdown: [],
      },
    ];
    const summary = buildCustomerDefectOverviewSummary(rows);

    expect(summary).toEqual({
      totalCustomers: 3,
      matchedCustomers: 2,
      unmatchedCustomers: 1,
      totalRevenue: 18000,
      totalPurchasedPieces: 200,
      totalReturnedPieces: 13,
      totalReplacementPieces: 2,
      totalReturnedAmount: 670,
      overallReturnRate: 0.065,
      highReturnCustomers: 1,
      zeroPurchaseReturnCustomers: 1,
    });
  });

  it("runs the daily defect sync once per date after the configured hour", () => {
    expect(
      shouldRunCustomerDefectSync({ dateKey: "2026-07-04", hour: 4 }, null, 5),
    ).toBe(false);
    expect(
      shouldRunCustomerDefectSync({ dateKey: "2026-07-04", hour: 5 }, "2026-07-04", 5),
    ).toBe(false);
    expect(
      shouldRunCustomerDefectSync({ dateKey: "2026-07-04", hour: 6 }, "2026-07-03", 5),
    ).toBe(true);
  });
});
