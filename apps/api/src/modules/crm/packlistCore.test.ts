import { describe, expect, it } from "vitest";
import XLSX from "xlsx";
import { parsePacklistWorkbook, projectPacklistSupply, type PacklistLot } from "./packlistCore.js";

function workbook(rows: unknown[][]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = Array.from({ length: 12 }, () => ({ hidden: true }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "PACKLIST");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function fixture(): unknown[][] {
  return [
    ["", "", "", "", "", "", "", "", "RECEIVED", "", "NOT FINISHED", "NOT FINISHED"],
    ["", "", "", "", "", "", "", "", "2 CAIXAS 01/06", "8 CAIXAS 29/09", "165 CAIXAS 26/10"],
    ["Fornecedor", "SKU", "Produto", "", "", "", "TOTAL", "EM ESTOQUE", "OLD-1", "LOT-2", "LOT-3", ""],
    ["", "0428-1", "Tela", "", "", "", 99999, 1000, 100, 714, 20, 99999],
    ["", "SKU", "Produto", "", "", "", "", "", 999, 999, 999],
    ["", "", "", "", "", "", "", "", 999, 999, 999],
  ];
}

describe("Packlist import", () => {
  it("uses SKU × lot quantities, including hidden columns, without using stock, totals, received lots or blank headers", () => {
    const data = parsePacklistWorkbook(workbook(fixture()), "2026-11-06T21:04:00Z");
    expect(data.receivedLots).toBe(1);
    expect(data.lots).toHaveLength(2);
    expect(data.lots[0]).toMatchObject({ id: "LOT-2", status: "IN_TRANSIT", departureDate: "2026-09-29", arrivalDate: "2026-11-28", inferredYear: true, quantities: { "0428-1": 714 } });
    expect(data.lots[1]).toMatchObject({ status: "INCOMPLETE", arrivalDate: "2026-12-25", quantities: { "0428-1": 20 } });
  });

  it("infers December as the previous year when the source was saved in January", () => {
    const rows = fixture(); rows[1]![9] = "8 CAIXAS 20/12";
    expect(parsePacklistWorkbook(workbook(rows), "2027-01-05T12:00:00Z").lots[0]?.departureDate).toBe("2026-12-20");
  });

  it("preserves an explicit year and recognizes missing departure dates", () => {
    const rows = fixture(); rows[1]![9] = "8 CAIXAS 29/09/2025"; rows[1]![10] = "165 CAIXAS";
    const data = parsePacklistWorkbook(workbook(rows), "2026-11-06T12:00:00Z");
    expect(data.lots[0]).toMatchObject({ departureDate: "2025-09-29", inferredYear: false });
    expect(data.lots[1]?.arrivalDate).toBeNull();
  });

  it("retains an undated pending lot inside the shipment range instead of silently dropping it", () => {
    const rows = fixture(); rows[1]![9] = "";
    rows[3]![6] = { t: "n", v: 0, f: 'SUMIFS(H4:L4,$H$1:$L$1,"<>"&$I$1)' };
    expect(parsePacklistWorkbook(workbook(rows), "2026-11-06T12:00:00Z").lots[0]).toMatchObject({ id: "LOT-2", arrivalDate: null, quantities: { "0428-1": 714 } });
  });

  it.each(["invalid date", "invalid quantity", "duplicate SKU", "duplicate lot", "unknown status", "changed header"])("rejects %s rather than publishing a misleading snapshot", (scenario) => {
    const rows = fixture();
    if (scenario === "invalid date") rows[1]![9] = "8 CAIXAS 31/02/2026";
    if (scenario === "invalid quantity") rows[3]![9] = "#N/A";
    if (scenario === "duplicate SKU") rows.push([...rows[3]!]);
    if (scenario === "duplicate lot") rows[2]![10] = "LOT-2";
    if (scenario === "unknown status") rows[0]![9] = "RECEBIDO?";
    if (scenario === "changed header") rows[2]![1] = "Código";
    expect(() => parsePacklistWorkbook(workbook(rows), "2026-11-06T12:00:00Z")).toThrow();
  });
});

const lot = (arrivalDate: string | null, quantity: number, status: PacklistLot["status"] = "IN_TRANSIT"): PacklistLot => ({
  id: "LOT", arrivalDate, departureDate: "2026-09-15", inferredYear: true, status, quantities: { A: quantity },
});
const project = (stockUnits: number, lots: PacklistLot[], sales90 = 90) => projectPacklistSupply({ stockUnits, sales90, lots, skus: ["A"], today: "2026-11-01" });

describe("stock and CRM sales projection", () => {
  it("does not recommend duplicating an on-time shipment that covers demand", () => {
    expect(project(20, [lot("2026-11-11", 60)])).toMatchObject({ suggestedBuyUnits: 0, urgentAir: false, stockoutAt: null, scheduledUnits: 60 });
  });

  it("detects a gap before arrival even when the total incoming quantity is sufficient", () => {
    expect(project(10, [lot("2026-12-01", 100)])).toMatchObject({ suggestedBuyUnits: 20, stockoutAt: "2026-11-11", urgentAir: true });
  });

  it("identifies both no-incoming purchases and insufficient incoming quantities", () => {
    expect(project(10, [])).toMatchObject({ incomingUnits: 0, suggestedBuyUnits: 50 });
    expect(project(20, [lot("2026-11-11", 10)])).toMatchObject({ incomingUnits: 10, suggestedBuyUnits: 30 });
  });

  it("excludes late, incomplete, undated and beyond-horizon quantities from coverage", () => {
    const result = project(20, [lot("2026-10-31", 100), lot("2026-11-10", 100, "INCOMPLETE"), lot(null, 100), lot("2027-01-10", 100)]);
    expect(result).toMatchObject({ suggestedBuyUnits: 40, scheduledUnits: 0, overdueUnits: 100, incompleteUnits: 100, undatedUnits: 100, incomingUnits: 400 });
  });

  it("handles same-day shipments, exact arrival boundaries, zero demand and negative stock", () => {
    expect(project(0, [lot("2026-11-01", 60)])).toMatchObject({ suggestedBuyUnits: 0, stockoutAt: null });
    expect(project(10, [lot("2026-11-11", 50)])).toMatchObject({ suggestedBuyUnits: 0, stockoutAt: null });
    expect(project(0, [], 0)).toMatchObject({ suggestedBuyUnits: 0, urgentAir: false });
    expect(project(-5, [])).toMatchObject({ suggestedBuyUnits: 60, stockoutAt: "2026-11-01" });
  });

  it("keeps SKUs isolated and does not count a shipment twice for repeated lookup keys", () => {
    const result = projectPacklistSupply({ stockUnits: 0, sales90: 90, lots: [lot("2026-11-01", 60)], skus: ["B"], today: "2026-11-01" });
    expect(result).toMatchObject({ incomingUnits: 0, suggestedBuyUnits: 60 });
    expect(projectPacklistSupply({ stockUnits: 0, sales90: 90, lots: [lot("2026-11-01", 30)], skus: ["A", "A"], today: "2026-11-01" }).incomingUnits).toBe(30);
  });
});
