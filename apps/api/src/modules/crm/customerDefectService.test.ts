import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCustomerDefectOverviewSummary,
  buildCustomerDefectRows,
  parseCustomerDefectWorkbook,
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

  it("sorts by return rate before returned pieces and revenue", () => {
    const rows: ParsedCustomerDefectAggregate[] = [
      {
        customerCode: "CL100",
        sourceDisplayName: "High revenue",
        returnedPieces: 20,
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
      },
      {
        customerCode: "CL200",
        sourceDisplayName: "Cliente 200",
        returnedPieces: 2,
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
      },
      {
        customerCode: "CL999",
        sourceDisplayName: "Sem compra",
        returnedPieces: 1,
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
      totalReturnedAmount: 670,
      overallReturnRate: 0.065,
      highReturnCustomers: 1,
      zeroPurchaseReturnCustomers: 1,
    });
  });
});
