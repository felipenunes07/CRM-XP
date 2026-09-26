/**
 * Ponta a ponta: planilha no MESMO formato da "SALDO VENDAS - 月出单 XP"
 * (cabecalhos com espaco, valores formatados como o SheetJS entrega, linha de
 * HISTORICO, varias linhas por nota, frete separado, COD digitado minusculo)
 * -> parser real do CRM -> motor de cobranca. Casos tirados dos audios do
 * financeiro.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeText, safeNumber } from "../../lib/normalize.js";
import { buildBillingAlertReport, type BillingCustomerInput } from "./billingAlertEngine.js";
import { parseCustomerCreditWorkbook, type ParsedCustomerCreditWorkbook } from "./customerCreditService.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const RESUMO_HEADER = ["COD", "客户", " Devedor/未付 ", " DOC ", " CREDITO ", " CREDITO INTERNO ", "PRAZO", " STATUS "];
const OUT_HEADER = ["DATE COD", "COD", "DATA", "N", "DESCRIÇÃO", " TOTAL ", "单号", "VENDEDOR", "CLIENTE/客户"];
const PAG_HEADER = ["CODIGO", "N", "Cliente/客户", "COD", "Data/日期", " Valor/已付 ", "TIPO", "OBS"];

async function writeWorkbook(sheets: Record<string, unknown[][]>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "billing-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "SALDO VENDAS - 月出单 XP.xlsx");
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  XLSX.writeFile(workbook, filePath);
  return filePath;
}

// Mesma leitura que o billingAlertService faz no banco (raw_payload).
function toBillingCustomers(workbook: ParsedCustomerCreditWorkbook): BillingCustomerInput[] {
  const pick = (raw: Record<string, unknown>, name: string) =>
    Object.entries(raw).find(([key]) => normalizeText(key).toUpperCase() === name)?.[1];

  return workbook.rows.map((row) => ({
    customerCode: row.customerCode,
    customerId: null,
    displayName: row.sourceDisplayName ?? row.customerCode,
    debtAmount: row.debtAmount,
    creditLimit: row.creditLimit,
    internalCreditLimit: safeNumber(pick(row.rawPayload, "CREDITO INTERNO")) || null,
    paymentTerm: row.paymentTerm,
    status: normalizeText(String(pick(row.rawPayload, "STATUS") ?? "")) || null,
  }));
}

describe("cobranca lendo a planilha real", () => {
  it("aplica as regras dos audios do financeiro", async () => {
    const filePath = await writeWorkbook({
      RESUMO: [
        RESUMO_HEADER,
        // Leomar: credito 300k, interno 500k, prazo 30. Deve 600.768.
        ["CL034", "Leomar", " -R$ 600,768.00 ", "EXPOR", " R$ 300,000.00 ", " R$ 500,000.00 ", "30", ""],
        // Exemplo do audio: prazo 20 dias, pedido de 21 dias atras, pagou em parcelas e ficou faltando.
        ["CL010", "W2A", " -R$ 5,000.00 ", "EXPOR", " R$ 50,000.00 ", "", "20", ""],
        // Pagou tudo em varias parcelas (2 de 20k): nada a cobrar.
        ["CL200", "Em dia", " R$ - ", "EXPOR", " R$ 50,000.00 ", "", "20", ""],
        // Calote conhecido: fica fora do alerta.
        ["CL400", "Calote", " -R$ 90,000.00 ", "EXPOR", " R$ 10,000.00 ", "", "10", " GOLPE "],
      ],
      OUT: [
        OUT_HEADER,
        // Historico consolidado: pagamentos abatem ele primeiro.
        ["# HISTÓRICO ...", "CL034", "12/19/25", "100", "", " R$ 500,000.00 ", "0", "Resumo", "Leomar"],
        // Nota 41000 em duas linhas + frete separado.
        ["46204 CL034 41000 | Telas", "CL034", "7/1/26", "10", "TELA A", " R$ 60,000.00 ", "41000", "Thais", "Leomar"],
        ["46204 CL034 41000 | Telas", "CL034", "7/1/26", "5", "TELA B", " R$ 40,000.00 ", "41000", "Thais", "Leomar"],
        ["46204 CL034 FRETE | ", "CL034", "7/1/26", "1", "FRETE", " R$ 768.00 ", "", "Thais", "Leomar"],
        ["46285 CL034 43200 | Telas", "CL034", "9/20/26", "3", "TELA C", " R$ 30,000.00 ", "43200", "Thais", "Leomar"],
        ["46270 CL010 42900 | Telas", "CL010", "9/5/26", "40", "TELA D", " R$ 40,000.00 ", "42900", "Ana", "W2A"],
        ["46250 CL200 42500 | Telas", "CL200", "8/16/26", "40", "TELA E", " R$ 40,000.00 ", "42500", "Ana", "Em dia"],
        ["45658 CL400 30000 | Telas", "CL400", "1/1/25", "90", "TELA F", " R$ 90,000.00 ", "30000", "Ana", "Calote"],
      ],
      PAG: [
        PAG_HEADER,
        ["x", "1", "Leomar", "CL034", "8/1/26", " R$ 30,000.00 ", "转账", ""],
        ["x", "2", "W2A", "CL010", "9/10/26", " R$ 20,000.00 ", "转账", ""],
        ["x", "3", "W2A", "CL010", "9/15/26", " R$ 10,000.00 ", "转账", ""],
        // COD digitado em minusculo: o SUMIFS do Excel conta, o CRM tambem precisa contar.
        ["x", "4", "W2A", "cl010", "9/20/26", " R$ 5,000.00 ", "现金", ""],
        ["x", "5", "Em dia", "CL200", "8/20/26", " R$ 20,000.00 ", "转账", ""],
        ["x", "6", "Em dia", "CL200", "9/1/26", " R$ 20,000.00 ", "转账", ""],
      ],
    });

    const workbook = await parseCustomerCreditWorkbook(filePath);
    const report = buildBillingAlertReport(toBillingCustomers(workbook), workbook.orders, workbook.payments, {
      today: "2026-09-26",
    });

    // Limite: passou do credito E do interno.
    expect(report.overLimit.map((customer) => customer.customerCode)).toEqual(["CL034"]);
    expect(report.overLimit[0]).toMatchObject({ creditLimit: 300_000, internalCreditLimit: 500_000, paymentTerm: 30 });

    // Prazo do CL010: 40k em 05/09, prazo 20 -> venceu 25/09. Pagou 20k + 10k + 5k (este com "cl010").
    const w2a = report.overdue.find((customer) => customer.customerCode === "CL010")!;
    expect(w2a.pendingOrders).toEqual([
      expect.objectContaining({ orderNumber: "42900", dueDate: "2026-09-25", pendingAmount: 5_000, daysOverdue: 1, overdue: true }),
    ]);

    // Leomar: os 30k pagos abatem o HISTORICO (mais antigo) primeiro; a nota
    // 41000 (2 linhas somadas) e o frete do mesmo dia ficam vencidos; a 43200 ainda no prazo.
    const leomar = report.customers.find((customer) => customer.customerCode === "CL034")!;
    expect(leomar.pendingOrders.map((order) => [order.orderNumber, order.pendingAmount, order.overdue])).toEqual([
      ["0", 470_000, true],
      ["41000", 100_000, true],
      ["", 768, true],
      ["43200", 30_000, false],
    ]);
    expect(leomar.pendingOrders.reduce((sum, order) => sum + order.pendingAmount, 0)).toBe(leomar.debtAmount);

    // Quitou em parcelas: nao aparece. Calote: ignorado.
    expect(report.customers.map((customer) => customer.customerCode)).not.toContain("CL200");
    expect(report.ignored.map((customer) => customer.customerCode)).toEqual(["CL400"]);
  });
});
