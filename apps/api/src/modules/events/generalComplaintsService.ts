import { pool } from "../../db/client.js";

// Reclamacoes GERAIS (nao ligadas a produto): atendimento, vendedora, prazo,
// cobranca. Historico permanente (fora da retencao de 30 dias), alimentada
// pela mesma analise diaria de conversas da IA que gera product_complaints.

export interface GeneralComplaintsFilters {
  category?: string;
  agentName?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface BuiltFilters {
  where: string;
  params: unknown[];
}

function buildFilters(filters: GeneralComplaintsFilters): BuiltFilters {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.category) {
    params.push(filters.category);
    conditions.push(`gc.category = $${params.length}`);
  }
  if (filters.agentName) {
    params.push(filters.agentName);
    conditions.push(`gc.agent_name = $${params.length}`);
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`gc.window_date >= $${params.length}::date`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    conditions.push(`gc.window_date <= $${params.length}::date`);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

const CLIENT_KEY_SQL = "COALESCE(gc.deal_id::text, gc.conversation_key)";

export async function listGeneralComplaints(
  filters: GeneralComplaintsFilters,
  pagination: { page: number; pageSize: number },
) {
  const { where, params } = buildFilters(filters);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const listResult = await pool.query(`
    SELECT
      gc.id,
      gc.window_date,
      gc.conversation_key,
      gc.deal_id,
      gc.is_group,
      gc.chat_name,
      gc.customer_name,
      gc.agent_name,
      gc.category,
      gc.severity,
      gc.detail,
      gc.quote,
      gc.source,
      gc.occurred_at,
      COUNT(*) OVER()::int AS total_count
    FROM general_complaints gc
    ${where}
    ORDER BY gc.window_date DESC, gc.occurred_at DESC NULLS LAST
    LIMIT ${pagination.pageSize} OFFSET ${offset}
  `, params);

  const total = Number(listResult.rows[0]?.total_count ?? 0);

  return {
    items: listResult.rows.map((row) => ({
      id: String(row.id),
      windowDate: String(row.window_date instanceof Date ? row.window_date.toISOString().slice(0, 10) : row.window_date),
      conversationKey: String(row.conversation_key),
      dealId: row.deal_id ? String(row.deal_id) : null,
      isGroup: Boolean(row.is_group),
      chatName: row.chat_name ? String(row.chat_name) : null,
      customerName: row.customer_name ? String(row.customer_name) : null,
      agentName: row.agent_name ? String(row.agent_name) : null,
      category: String(row.category),
      severity: String(row.severity),
      detail: String(row.detail ?? ""),
      quote: row.quote ? String(row.quote) : null,
      source: String(row.source),
      occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
    })),
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  };
}

/**
 * Ranking por vendedora: quem tem mais reclamacoes gerais, para identificar
 * se o problema e de atendimento de uma pessoa especifica ou geral da equipe.
 */
export async function getGeneralComplaintsOverview(filters: GeneralComplaintsFilters) {
  const { where, params } = buildFilters(filters);

  const [summaryResult, agentRankingResult, categoryResult, monthlyResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT ${CLIENT_KEY_SQL})::int AS distinct_clients,
        COUNT(DISTINCT gc.agent_name) FILTER (WHERE gc.agent_name IS NOT NULL)::int AS distinct_agents,
        MAX(gc.window_date)::text AS last_date
      FROM general_complaints gc
      ${where}
    `, params),
    pool.query(`
      SELECT
        COALESCE(gc.agent_name, 'Não identificado') AS agent,
        COUNT(*)::int AS total,
        COUNT(DISTINCT ${CLIENT_KEY_SQL})::int AS distinct_clients,
        MAX(gc.window_date)::text AS last_date
      FROM general_complaints gc
      ${where}
      GROUP BY 1
      ORDER BY COUNT(*) DESC, MAX(gc.window_date) DESC
      LIMIT 15
    `, params),
    pool.query(`
      SELECT gc.category AS category, COUNT(*)::int AS total
      FROM general_complaints gc
      ${where}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `, params),
    pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', gc.window_date), 'YYYY-MM') AS month,
        COUNT(*)::int AS total
      FROM general_complaints gc
      ${where}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 12
    `, params),
  ]);

  const summaryRow = summaryResult.rows[0] ?? {};

  return {
    summary: {
      total: Number(summaryRow.total ?? 0),
      distinctClients: Number(summaryRow.distinct_clients ?? 0),
      distinctAgents: Number(summaryRow.distinct_agents ?? 0),
      lastDate: summaryRow.last_date ? String(summaryRow.last_date) : null,
    },
    agentRanking: agentRankingResult.rows.map((row) => ({
      agent: String(row.agent),
      total: Number(row.total ?? 0),
      distinctClients: Number(row.distinct_clients ?? 0),
      lastDate: String(row.last_date),
    })),
    byCategory: categoryResult.rows.map((row) => ({
      category: String(row.category),
      total: Number(row.total ?? 0),
    })),
    monthly: monthlyResult.rows
      .map((row) => ({ month: String(row.month), total: Number(row.total ?? 0) }))
      .reverse(),
  };
}
