import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { supplierPriceSchema } from "../../db/supplierPriceSchema.js";

vi.mock("../../db/client.js", async () => {
  const { Pool } = await import("pg");
  const connectionString = process.env.SUPPLIER_PRICE_TEST_DATABASE_URL;
  if (connectionString && new URL(connectionString).pathname !== "/supplier_prices_test") throw new Error("Use only the isolated supplier_prices_test database.");
  return { pool: new Pool({ connectionString, max: 4 }) };
});
import { pool } from "../../db/client.js";
import { downloadPriceSnapshot, getPriceSnapshot, getSupplierProductHistory, importPriceSnapshot, listPriceSnapshots, listPriceSuppliers, syncDuePriceSuppliers, syncPriceSupplier } from "./supplierPriceService.js";

function file(price: number, name = "FRONTAL A01") {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Código", "Produto", "Preço mínimo"], ["A01", name, price]]), "Produtos");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe.skipIf(!process.env.SUPPLIER_PRICE_TEST_DATABASE_URL)("Histórico em PostgreSQL real", () => {
  beforeAll(async () => {
    await pool.query("DROP TABLE IF EXISTS supplier_price_snapshots; DROP TABLE IF EXISTS price_suppliers;");
    await pool.query(supplierPriceSchema);
  });
  afterAll(async () => { vi.unstubAllGlobals(); await pool.end(); });

  it("persiste versões, preço por produto e bytes originais após novas leituras", async () => {
    const bytes = file(33);
    const first = await importPriceSnapshot("uuf", "primeira.xlsx", bytes.toString("base64"), "test-user");
    const second = await importPriceSnapshot("uuf", "segunda.xlsx", file(35, "FRONTAL A01 NOVA DESCRIÇÃO").toString("base64"));
    expect((await listPriceSnapshots("uuf")).map((row) => row.id)).toEqual([second.id, first.id]);
    expect((await getPriceSnapshot("uuf", first.id)).items[0]?.price).toBe(33);
    expect((await getPriceSnapshot("uuf", second.id)).items[0]?.price).toBe(35);
    expect((await getSupplierProductHistory("uuf", "A01", "")).map((row) => row.price)).toEqual([33, 35]);
    expect((await downloadPriceSnapshot("uuf", first.id)).base64).toBe(bytes.toString("base64"));
    expect((await listPriceSuppliers()).find((row) => row.id === "uuf")?.latestSnapshotId).toBe(second.id);
    await expect(getPriceSnapshot("fff", first.id)).rejects.toMatchObject({ statusCode: 404 });
    await pool.query(supplierPriceSchema);
    expect(await listPriceSnapshots("uuf")).toHaveLength(2);
  });

  it("recusa arquivo inválido sem alterar as tabelas válidas", async () => {
    await expect(importPriceSnapshot("uuf", "invalido.xlsx", Buffer.from("<html>login</html>").toString("base64"))).rejects.toMatchObject({ statusCode: 400 });
    expect(await listPriceSnapshots("uuf")).toHaveLength(2);
    await expect(importPriceSnapshot("unknown", "valido.xlsx", file(50).toString("base64"))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("grava coleta, respeita intervalo semanal e preserva captura anterior em falha", async () => {
    const product = { id: 1, name: "A01 C/A", sku: "FFF1", categories: [{ name: "SAMSUNG" }], prices: { price: "3800", currency_code: "BRL", currency_minor_unit: 2 } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([product]), { headers: { "x-wp-totalpages": "1" } }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await syncPriceSupplier("fff");
    expect((await getPriceSnapshot("fff", first!.id)).items[0]).toMatchObject({ name: "FRONTAL SAMSUNG A01 COM ARO", price: 38 });
    await syncDuePriceSuppliers();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await listPriceSnapshots("fff")).toHaveLength(1);
    fetchMock.mockResolvedValue(new Response("indisponível", { status: 503 }));
    await expect(syncPriceSupplier("fff")).rejects.toMatchObject({ statusCode: 502 });
    expect(await listPriceSnapshots("fff")).toHaveLength(1);
    const supplier = (await listPriceSuppliers()).find((row) => row.id === "fff")!;
    expect(supplier.latestSnapshotId).toBe(first!.id);
    expect(supplier.lastError).toContain("503");
  });

  it("impede coletas simultâneas e mantém fontes pendentes fora da agenda", async () => {
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext('supplier-prices:fff'))");
      await expect(syncPriceSupplier("fff")).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('supplier-prices:fff'))"); client.release();
    }
    const suppliers = await listPriceSuppliers();
    expect(suppliers.filter((row) => row.autoSync).map((row) => row.id)).toEqual(["fff"]);
    expect((await pool.query("SELECT relrowsecurity FROM pg_class WHERE relname IN ('price_suppliers','supplier_price_snapshots')")).rows.every((row) => row.relrowsecurity)).toBe(true);
  });
});
