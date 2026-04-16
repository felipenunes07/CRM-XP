import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mergeMetaAdsMonthlySpend, readMetaAdsInvoiceSummary } from "./metaAdsService.js";

describe("metaAdsService helpers", () => {
  it("parses invoice summary csv by month and ignores invalid rows", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "meta-ads-"));
    const filePath = path.join(dir, "invoice.csv");

    await writeFile(
      filePath,
      [
        "Data;ID da transação;Descrição da transação;Forma de pagamento;Valor;Moeda",
        "13/04/2026;1;Pagamento de Anúncios da Meta;Cartao;424,34;BRL",
        "10/04/2026;2;Pagamento de Anúncios da Meta;Cartao;1.138,60;BRL",
        "05/03/2026;3;Pagamento de Anúncios da Meta;Cartao;59,90;BRL",
        "cabecalho repetido;;;;;",
        "01/01/2025;4;Outra cobrança;Cartao;999,99;BRL",
      ].join("\n"),
      "utf8",
    );

    await expect(readMetaAdsInvoiceSummary(filePath, "2026-03-01", "2026-04-30")).resolves.toEqual([
      { month: "2026-03", spend: 59.9, currency: "BRL" },
      { month: "2026-04", spend: 1562.94, currency: "BRL" },
    ]);
  });

  it("prefers api months and uses invoice months only as backfill", () => {
    expect(
      mergeMetaAdsMonthlySpend(
        [
          { month: "2023-01", spend: 133.16, currency: "BRL" },
          { month: "2026-02", spend: 4327.78, currency: "BRL" },
        ],
        [
          { month: "2026-02", spend: 2706.49, currency: "BRL" },
          { month: "2026-03", spend: 3536.74, currency: "BRL" },
        ],
      ),
    ).toEqual([
      { month: "2023-01", spend: 133.16, currency: "BRL" },
      { month: "2026-02", spend: 2706.49, currency: "BRL" },
      { month: "2026-03", spend: 3536.74, currency: "BRL" },
    ]);
  });
});
