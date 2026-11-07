import XLSX from "xlsx";
import type { InventoryReplenishment } from "@olist-crm/shared";

export const PACKLIST_LEAD_DAYS = 60;
const DAY_MS = 86_400_000;

export interface PacklistLot {
  id: string;
  status: "IN_TRANSIT" | "INCOMPLETE";
  departureDate: string | null;
  arrivalDate: string | null;
  inferredYear: boolean;
  quantities: Record<string, number>;
}

export interface PacklistData {
  lots: PacklistLot[];
  receivedLots: number;
}

export function saoPauloDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function departure(value: unknown, sourceDate: string): { date: string | null; inferredYear: boolean } {
  const decoded = typeof value === "number" ? XLSX.SSF.parse_date_code(value) : null;
  const match = String(value ?? "").match(/(?:^|\s)(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}|\d{2}))?(?=\s|$)/);
  if (!decoded && !match) return { date: null, inferredYear: false };
  const day = decoded?.d ?? Number(match![1]);
  const month = decoded?.m ?? Number(match![2]);
  const inferredYear = !decoded && !match?.[3];
  let year = decoded?.y ?? (match?.[3] ? Number(match[3]) : Number(sourceDate.slice(0, 4)));
  if (year < 100) year += 2000;
  const makeDate = () => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (inferredYear && makeDate() > sourceDate) year -= 1;
  const date = makeDate();
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Data de saída inválida: ${String(value)}`);
  }
  return { date, inferredYear };
}

export function parsePacklistWorkbook(bytes: Buffer, sourceUpdatedAt: string): PacklistData {
  // Read only PACKLIST: VENDAS is large and sales must come from the CRM.
  const workbook = XLSX.read(bytes, { type: "buffer", sheets: ["PACKLIST"] });
  const sheet = workbook.Sheets.PACKLIST;
  if (!sheet?.["!ref"]) throw new Error("A aba PACKLIST não foi encontrada.");
  const at = (row: number, col: number) => sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  const text = (row: number, col: number) => String(at(row, col)?.v ?? "").trim();
  if (text(2, 1).toUpperCase() !== "SKU" || text(2, 2).toUpperCase() !== "PRODUTO") {
    throw new Error("O cabeçalho do PACKLIST mudou. Esperado SKU em B3 e Produto em C3.");
  }
  const bounds = XLSX.utils.decode_range(sheet["!ref"]);
  const lotRangeEnd = String(sheet.G4?.f ?? "").match(/\bH4:([A-Z]+)4\b/i)?.[1];
  const lastLotColumn = lotRangeEnd ? XLSX.utils.decode_col(lotRangeEnd.toUpperCase()) : null;
  const sourceDate = saoPauloDate(new Date(sourceUpdatedAt));
  const skus = new Map<number, string>();
  const seenSkus = new Set<string>();
  for (let row = 3; row <= bounds.e.r; row += 1) {
    const sku = text(row, 1);
    if (!sku || sku.toUpperCase() === "SKU" || !text(row, 2)) continue;
    if (seenSkus.has(sku)) throw new Error(`SKU duplicado no PACKLIST: ${sku}`);
    seenSkus.add(sku);
    skus.set(row, sku);
  }
  if (!skus.size) throw new Error("O PACKLIST não contém SKUs válidos.");

  const lots: PacklistLot[] = [];
  const seenLots = new Set<string>();
  let receivedLots = 0;
  for (let col = 8; col <= bounds.e.c; col += 1) {
    if (lastLotColumn !== null && col > lastLotColumn) break;
    const status = text(0, col).toUpperCase();
    const shipping = text(1, col);
    const id = text(2, col);
    // Summary columns to the right are not shipments. Empty future lots are ignored.
    if (status === "VENDAS" || /ESTOQUE\s+M[EÊ]S/i.test(shipping)) break;
    if (!id || (lastLotColumn === null && !status && !/CAIXA|\d[/.]\d/i.test(shipping))) continue;
    if (status && status !== "RECEIVED" && status !== "NOT FINISHED") {
      throw new Error(`Situação desconhecida no lote ${id}: ${status}`);
    }
    if (seenLots.has(id)) throw new Error(`Lote duplicado no PACKLIST: ${id}`);
    seenLots.add(id);
    if (status === "RECEIVED") { receivedLots += 1; continue; }
    const date = departure(at(1, col)?.v, sourceDate);
    const quantities: Record<string, number> = {};
    for (const [row, sku] of skus) {
      const cell = at(row, col);
      const raw = cell?.v;
      if (cell?.t === "e" || raw === undefined || raw === null || raw === "" || typeof raw === "boolean") {
        throw new Error(`Quantidade indisponível no lote ${id}, SKU ${sku}. Salve a planilha recalculada.`);
      }
      const quantity = Number(raw);
      if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
        throw new Error(`Quantidade inválida no lote ${id}, SKU ${sku}.`);
      }
      if (quantity > 0) quantities[sku] = quantity;
    }
    lots.push({ id, status: status === "NOT FINISHED" ? "INCOMPLETE" : "IN_TRANSIT", departureDate: date.date,
      arrivalDate: date.date ? addDays(date.date, PACKLIST_LEAD_DAYS) : null, inferredYear: date.inferredYear, quantities });
  }
  if (!seenLots.size) throw new Error("Nenhum lote identificado no PACKLIST.");
  return { lots, receivedLots };
}

export function projectPacklistSupply(input: {
  stockUnits: number; sales90: number; skus: string[]; lots: PacklistLot[]; today?: string;
}): InventoryReplenishment {
  const today = input.today ?? saoPauloDate();
  const horizon = addDays(today, PACKLIST_LEAD_DAYS);
  const dailySales = Math.max(0, input.sales90) / 90;
  const skuSet = new Set(input.skus);
  const arrivals = input.lots.flatMap((lot) => {
    const quantity = [...skuSet].reduce((sum, sku) => sum + (lot.quantities[sku] ?? 0), 0);
    if (!quantity) return [];
    const overdue = lot.arrivalDate !== null && lot.arrivalDate < today;
    return [{ lotId: lot.id, quantity, departureDate: lot.departureDate, arrivalDate: lot.arrivalDate,
      incomplete: lot.status === "INCOMPLETE", overdue, inferredYear: lot.inferredYear }];
  });
  const eligible = arrivals.filter((lot) => !lot.incomplete && !lot.overdue && lot.arrivalDate !== null && lot.departureDate! <= today)
    .sort((a, b) => a.arrivalDate!.localeCompare(b.arrivalDate!));
  let stock = Math.max(0, input.stockUnits);
  let elapsed = 0;
  let shortage = 0;
  let stockoutAt: string | null = null;
  const consume = (days: number) => {
    if (dailySales > 0 && stock < dailySales * (days - elapsed) - 1e-8 && stockoutAt === null) {
      stockoutAt = addDays(today, Math.floor(elapsed + Math.max(0, stock) / dailySales));
    }
    stock -= dailySales * (days - elapsed);
    shortage = Math.max(shortage, -stock);
    elapsed = days;
  };
  for (const lot of eligible) {
    if (lot.arrivalDate! > horizon) break;
    const days = Math.round((Date.parse(lot.arrivalDate!) - Date.parse(today)) / DAY_MS);
    consume(days);
    stock += lot.quantity;
  }
  consume(PACKLIST_LEAD_DAYS);
  const sum = (predicate: (lot: typeof arrivals[number]) => boolean) => arrivals.filter(predicate).reduce((total, lot) => total + lot.quantity, 0);
  const suggestedBuyUnits = Math.max(0, Math.ceil(shortage - 1e-8));
  return {
    leadTimeDays: 60, targetDays: 60, averageDailySales: Number(dailySales.toFixed(3)),
    incomingUnits: sum(() => true),
    scheduledUnits: eligible.filter((lot) => lot.arrivalDate! <= horizon).reduce((total, lot) => total + lot.quantity, 0),
    overdueUnits: sum((lot) => lot.overdue), incompleteUnits: sum((lot) => lot.incomplete),
    undatedUnits: sum((lot) => lot.arrivalDate === null),
    nextArrivalAt: eligible[0]?.arrivalDate ?? null, stockoutAt, suggestedBuyUnits,
    urgentAir: suggestedBuyUnits > 0 && stockoutAt !== null && Date.parse(stockoutAt) < Date.parse(horizon),
    arrivals,
  };
}
