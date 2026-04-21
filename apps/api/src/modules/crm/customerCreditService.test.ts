import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { afterEach, describe, expect, it } from "vitest";
import {
  deriveCustomerCreditOperationalState,
  findLatestCustomerCreditWorkbookInDirectory,
  parseCustomerCreditWorkbook,
} from "./customerCreditService.js";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "customer-credit-"));
  tempDirs.push(dir);
  return dir;
}

async function createWorkbook(filePath: string, rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "RESUMO");
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

describe("findLatestCustomerCreditWorkbookInDirectory", () => {
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

    const file = await findLatestCustomerCreditWorkbookInDirectory(dir, "SALDO VENDAS");

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
