import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import {
  deriveCustomerCreditOperationalState,
  findLatestCustomerCreditWorkbook,
  parseCustomerCreditWorkbook,
  resolveParsedCreditOrders,
  resolveParsedCreditPayments,
} from "./customerCreditService.js";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "customer-credit-"));
  tempDirs.push(dir);
  return dir;
}

async function createWorkbook(filePath: string, rows: unknown[][], extraSheets: Record<string, unknown[][]> = {}) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "RESUMO");
  Object.entries(extraSheets).forEach(([name, sheetRows]) => {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheetRows), name);
  });
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["x"]]), "Painel");
  XLSX.writeFile(workbook, filePath);
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    }),
  );
});

describe("findLatestCustomerCreditWorkbook", () => {
  it("ignores other reports and picks the newest SALDO VENDAS workbook", async () => {
    const dir = await createTempDir();
    const reportPath = path.join(dir, "Relatorio de venda do produto 14.04.2026.xlsx");
    const saldoOldPath = path.join(dir, "SALDO VENDAS - 10.04.xlsx");
    const saldoNewPath = path.join(dir, "SALDO VENDAS - 11.04.xlsx");

    await fs.writeFile(reportPath, "report");
    await fs.writeFile(saldoOldPath, "old");
    await fs.writeFile(saldoNewPath, "new");

    await fs.utimes(reportPath, new Date("2026-04-14T12:00:00.000Z"), new Date("2026-04-14T12:00:00.000Z"));
    await fs.utimes(saldoOldPath, new Date("2026-04-10T12:00:00.000Z"), new Date("2026-04-10T12:00:00.000Z"));
    await fs.utimes(saldoNewPath, new Date("2026-04-11T12:00:00.000Z"), new Date("2026-04-11T12:00:00.000Z"));

    const file = await findLatestCustomerCreditWorkbook(dir, "SALDO VENDAS");

    expect(file?.fileName).toBe("SALDO VENDAS - 11.04.xlsx");
  });
});

describe("parseCustomerCreditWorkbook", () => {
  it("derives debt, available credit and real over-credit state from RESUMO", async () => {
    const dir = await createTempDir();
    const workbookPath = path.join(dir, "SALDO VENDAS - 14.04.xlsx");

    await createWorkbook(workbookPath, [
      [
        "COD",
        "å®¢æˆ·",
        " Devedor/æœªä»˜ ",
        " CREDITO ",
        "OBS",
        " Grau de risco ",
        "Ãšltima data de pedido",
        "Ãšltima data de pagamento",
        "Dias desde Ãºltimo pedido",
        "Dias desde Ãºltimo pagamento",
        "PontuaÃ§Ã£o de Risco",
        "Ultrapassou CrÃ©dito",
        "Pagamento Vencido",
        "Pagamento Muito Vencido (diferenÃ§a > 20)",
        "Nunca pagou",
        "Nunca pediu",
        " Sem crÃ©dito e dÃ­vida >1000 ",
        "CrÃ©dito negativo",
        "Deve alÃ©m do crÃ©dito",
        "Pagamento anterior ao pedido >20 dias",
      ],
      [
        "CL001",
        "Loja 1",
        "-R$ 120.50",
        "R$ 5000.00",
        "Pagamento Vencido",
        "AtenÃ§Ã£o",
        "4/10/26",
        "4/01/26",
        "4",
        "13",
        "7",
        "",
        "Pagamento Vencido",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
      [
        "CL002",
        "Loja 2",
        "-R$ 50.00",
        "R$ 2000.00",
        "Ultrapassou CrÃ©dito, Sem Pagamento",
        "CrÃ­tico",
        "4/12/26",
        "",
        "2",
        "",
        "9",
        "Ultrapassou CrÃ©dito",
        "",
        "",
        "Sem Pagamento",
        "",
        "",
        "",
        "",
        "",
      ],
      [
        "CL003",
        "Loja 3",
        "-R$ 2500.00",
        "R$ 2000.00",
        "Pagamento Muito Vencido",
        "CrÃ­tico",
        "4/11/26",
        "4/01/26",
        "3",
        "13",
        "10",
        "Ultrapassou CrÃ©dito",
        "",
        "Pagamento Muito Vencido (diferenÃ§a > 20)",
        "",
        "",
        "",
        "",
        "Deve alÃ©m do crÃ©dito",
        "",
      ],
    ]);

    const parsed = await parseCustomerCreditWorkbook(workbookPath);

    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      customerCode: "CL001",
      balanceAmount: -120.5,
      debtAmount: 120.5,
      creditBalanceAmount: 0,
      creditLimit: 5000,
      availableCreditAmount: 4879.5,
      withinCreditLimit: true,
      riskLevel: "ATENCAO",
      operationalState: "OWES",
      hasOverCredit: false,
      hasOverduePayment: true,
      lastOrderDate: "2026-04-10",
      lastPaymentDate: "2026-04-01",
      riskScore: 7,
    });

    expect(parsed.rows[1]).toMatchObject({
      customerCode: "CL002",
      balanceAmount: -50,
      debtAmount: 50,
      creditLimit: 2000,
      availableCreditAmount: 1950,
      withinCreditLimit: true,
      operationalState: "OWES",
      hasOverCredit: false,
      hasNoPayment: true,
    });
    expect(parsed.rows[1]?.flags).not.toContain("Ultrapassou Credito");

    expect(parsed.rows[2]).toMatchObject({
      customerCode: "CL003",
      balanceAmount: -2500,
      debtAmount: 2500,
      creditLimit: 2000,
      availableCreditAmount: -500,
      withinCreditLimit: false,
      operationalState: "OVER_CREDIT",
      hasOverCredit: true,
      hasSeverelyOverduePayment: true,
    });
  });

  it("parses grouped orders and payments from OUT and PAG sheets", async () => {
    const dir = await createTempDir();
    const workbookPath = path.join(dir, "SALDO VENDAS - 15.04.xlsx");

    await createWorkbook(
      workbookPath,
      [
        [
          "COD",
          "Ã¥Â®Â¢Ã¦Ë†Â·",
          " Devedor/Ã¦Å“ÂªÃ¤Â»Ëœ ",
          " CREDITO ",
          "OBS",
          " Grau de risco ",
        ],
        ["CL475", "Fast Phone", "-R$ 6,193.17", "R$ 25,000.00", "Cliente Inativo", "Monitorar"],
      ],
      {
        OUT: [
          [
            "DATE COD",
            "COD",
            "DATA",
            "N",
            "DESCRIÇÃO",
            "SKU",
            " VALOR ",
            " TOTAL ",
            "单号",
            "VENDEDOR",
            "CLIENTE/客户",
            "OBS",
            "DOC",
            "COMISSÃO",
            "👌",
            " PREÇO ",
            " +/- ",
            "REDUZIR",
            "Modelo",
          ],
          [
            "46080 37732",
            "CL475",
            "2/27/26",
            "10",
            "MI-NOTE 13 4G OLED | PRETO",
            "0514-1",
            "R$ 143.00",
            "R$ 1,430.00",
            "37732",
            "Thais",
            "Fast Phone",
            "",
            "EXPOR",
            "",
            "OK",
            "R$ 141.00",
            "R$ 2.00",
            "",
            "MI-NOTE 13 4G OLED | PRETO",
          ],
          [
            "46080 37732",
            "CL475",
            "2/27/26",
            "5",
            "REALME C35 PREMIER ORI | PRETO",
            "0433-1",
            "R$ 41.00",
            "R$ 205.00",
            "37732",
            "Thais",
            "Fast Phone",
            "",
            "EXPOR",
            "",
            "OK",
            "R$ 39.00",
            "R$ 2.00",
            "",
            "REALME C35 PREMIER ORI | PRETO",
          ],
        ],
        PAG: [
          [
            "CODIGO",
            "N",
            "Cliente/客户",
            "COD",
            "Data/日期",
            " Valor/已付 ",
            "TIPO",
            "单子发群",
            "OBS",
            "MINI",
          ],
          [
            "46151 89055CL47510000现金",
            "89055",
            "Fast Phone",
            "CL475",
            "5/9/26",
            "R$ 10,000.00",
            "现金",
            "5/8/26",
            "PP7",
            "",
          ],
          [
            "46154 89205CL4757217坏品抵账表",
            "89205",
            "Fast Phone",
            "CL475",
            "5/12/26",
            "R$ 7,217.00",
            "坏品抵账表",
            "5/12/26",
            "",
            "",
          ],
        ],
      },
    );

    const parsed = await parseCustomerCreditWorkbook(workbookPath);

    expect((parsed as any).orders).toEqual([
      expect.objectContaining({
        customerCode: "CL475",
        customerDisplayName: "Fast Phone",
        orderNumber: "37732",
        orderDate: "2026-02-27",
        totalAmount: 1635,
        units: 15,
        seller: "Thais",
        status: "OK",
        lineCount: 2,
      }),
    ]);
    expect((parsed as any).payments).toEqual([
      expect.objectContaining({
        customerCode: "CL475",
        customerDisplayName: "Fast Phone",
        paymentNumber: "89055",
        paymentDate: "2026-05-09",
        amount: 10000,
        paymentType: "DINHEIRO",
        observation: "PP7",
      }),
      expect.objectContaining({
        customerCode: "CL475",
        customerDisplayName: "Fast Phone",
        paymentNumber: "89205",
        paymentDate: "2026-05-12",
        amount: 7217,
        paymentType: "TROCAS",
      }),
    ]);
  });
});

describe("deriveCustomerCreditOperationalState", () => {
  it("treats negative balance as debt and only marks over-credit when debt exceeds the limit", () => {
    expect(
      deriveCustomerCreditOperationalState({
        balanceAmount: -323063.4,
        creditLimit: 500000,
        hasOverCredit: false,
      }),
    ).toBe("OWES");

    expect(
      deriveCustomerCreditOperationalState({
        balanceAmount: -510000,
        creditLimit: 500000,
        hasOverCredit: true,
      }),
    ).toBe("OVER_CREDIT");

    expect(
      deriveCustomerCreditOperationalState({
        balanceAmount: 200,
        creditLimit: 5000,
        hasOverCredit: false,
      }),
    ).toBe("UNUSED_CREDIT");
  });
});

describe("resolveParsedCreditDetails", () => {
  it("links parsed orders and payments to CRM customers by customer code", () => {
    const matches = new Map([["CL475", { id: "customer-1", displayName: "Fast Phone CRM" }]]);

    const orders = resolveParsedCreditOrders(
      [
        {
          customerCode: "CL475",
          customerDisplayName: "Fast Phone",
          orderKey: "CL475|2026-02-27|37732",
          orderNumber: "37732",
          orderDate: "2026-02-27",
          totalAmount: 1635,
          units: 15,
          seller: "Thais",
          doc: "EXPOR",
          status: "OK",
          lineCount: 2,
          rawPayload: {},
        },
      ],
      matches,
    );

    const payments = resolveParsedCreditPayments(
      [
        {
          customerCode: "CL475",
          customerDisplayName: "Fast Phone",
          paymentKey: "CL475|2026-05-12|89205|7217.00|TROCAS",
          paymentNumber: "89205",
          paymentDate: "2026-05-12",
          amount: 7217,
          paymentType: "TROCAS",
          observation: "",
          rawPayload: {},
        },
      ],
      matches,
    );

    expect(orders[0]).toMatchObject({
      customerId: "customer-1",
      customerDisplayName: "Fast Phone CRM",
      sourceDisplayName: "Fast Phone",
    });
    expect(payments[0]).toMatchObject({
      customerId: "customer-1",
      customerDisplayName: "Fast Phone CRM",
      sourceDisplayName: "Fast Phone",
    });
  });
});
