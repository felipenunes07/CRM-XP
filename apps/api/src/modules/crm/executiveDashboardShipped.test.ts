import { describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("../../db/client.js", () => ({
  pool: { query: queryMock },
  redis: { get: vi.fn(), set: vi.fn() },
}));
vi.mock("../whatsapp/whatsappAvatarCache.js", () => ({
  executiveSellerAvatarPublicUrl: () => null,
}));

import { getExecutiveDashboardMetrics } from "./executiveDashboardService.js";

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
