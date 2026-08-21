import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("../../db/client.js", () => ({
  pool: { query: queryMock },
  redis: { get: vi.fn(), set: vi.fn() },
}));
vi.mock("../whatsapp/whatsappAvatarCache.js", () => ({
  executiveSellerAvatarPublicUrl: () => null,
}));

import { getExecutiveDashboardMetrics } from "./executiveDashboardService.js";

// Sem isto as chamadas de um teste vazam para o seguinte e a contagem mente.
beforeEach(() => {
  queryMock.mockClear();
});

/**
 * A TV so conta venda da Olist com situacao "Enviado". O que importa aqui e que
 * o filtro chegue no SQL e que ele nunca derrube o historico, que vem de outras
 * fontes com status 'VALID'.
 */
describe("relatório executivo conta apenas venda enviada", () => {
  it("filtra por 'enviado' em todas as consultas de pedidos", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });

    await getExecutiveDashboardMetrics({ year: 2026, month: 8 }).catch(() => undefined);

    const sqls = queryMock.mock.calls.map((call) => String(call[0]));
    // historical_attendants monta a LISTA DE NOMES das vendedoras, nao conta
    // venda. Se fosse filtrado, quem nao tem pedido enviado sumiria do ranking
    // em vez de aparecer zerada.
    const consultasDePedidos = sqls.filter(
      (sql) => /FROM orders/i.test(sql) && !sql.includes("historical_attendants"),
    );

    expect(consultasDePedidos.length).toBeGreaterThanOrEqual(5);
    for (const sql of consultasDePedidos) {
      expect(sql).toMatch(/LOWER\(COALESCE\(status, ''\)\) = 'enviado'/);
    }
  });

  it("preserva o histórico de outras fontes, que nunca tem status 'enviado'", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });

    await getExecutiveDashboardMetrics({ year: 2026, month: 7 }).catch(() => undefined);

    const comFiltro = queryMock.mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => sql.includes("'enviado'"));

    expect(comFiltro.length).toBeGreaterThan(0);
    for (const sql of comFiltro) {
      // Sem esta excecao, Dropbox (2023-2025) e Supabase zerariam: eles gravam 'VALID'.
      expect(sql).toMatch(/source_system <> 'olist_v2' OR/);
    }
  });
});

/**
 * A XP vende telas, baterias e dock de carga. O nome do produto e o modelo do
 * aparelho, sem a palavra "tela", entao qualquer regra baseada em descricao ou
 * em catalogo deixa venda escapar. A regra agora e por exclusao.
 */
describe("classificação de produto da TV", () => {
  it("trata como tela tudo que não for bateria nem dock", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });

    // Periodo proprio: o servico cacheia por periodo e a consulta nao sairia.
    await getExecutiveDashboardMetrics({ year: 2026, month: 6 }).catch(() => undefined);

    const comCategoria = queryMock.mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => sql.includes("AS category"));

    expect(comCategoria.length).toBe(3); // resumo, vendedores e série diária
    for (const sql of comCategoria) {
      expect(sql).toMatch(/THEN 'DOCK'/);
      expect(sql).toMatch(/THEN 'BATTERY'/);
      expect(sql).toMatch(/ELSE 'SCREEN'/);
      // Nenhuma venda pode mais cair num balde que some da contagem de telas.
      expect(sql).not.toMatch(/ELSE 'OTHER'/);
    }
  });

  it("não depende mais do catálogo de estoque para reconhecer uma tela", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });

    await getExecutiveDashboardMetrics({ year: 2026, month: 5 }).catch(() => undefined);

    for (const call of queryMock.mock.calls) {
      // SKU fora do inventário fazia a peça sumir das telas.
      expect(String(call[0])).not.toMatch(/active_catalog|in_catalog/);
    }
  });
});
