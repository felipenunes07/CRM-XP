import { pool } from "../../db/client.js";
import { normalizeProductModel } from "./conversationAi.js";

// Reclamacoes por produto: consultas da pagina /reclamacoes-produto.
// A tabela product_complaints e historico permanente (fora da retencao de 30
// dias da Inteligencia), alimentada pela analise de conversas da IA.

export interface ProductComplaintsFilters {
  model?: string;
  /** true = match exato do modelo normalizado (drill-down); false/ausente = busca ILIKE */
  exact?: boolean;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface BuiltFilters {
  where: string;
  params: unknown[];
}

function buildFilters(filters: ProductComplaintsFilters): BuiltFilters {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const model = filters.model ? normalizeProductModel(filters.model) : "";
  if (model && filters.exact) {
    params.push(model);
    conditions.push(`pc.model_normalized = $${params.length}`);
  } else if (model) {
    params.push(`%${model}%`);
    conditions.push(`pc.model_normalized ILIKE $${params.length}`);
  }
  if (filters.category) {
    params.push(filters.category);
    conditions.push(`pc.category = $${params.length}`);
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`pc.window_date >= $${params.length}::date`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    conditions.push(`pc.window_date <= $${params.length}::date`);
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

// Cliente distinto = deal quando existe; senao a propria conversa. Assim um
// mesmo lojista reclamando 5x conta como 1 cliente, que e o que separa
// "problema do cliente" de "problema do produto".
const CLIENT_KEY_SQL = "COALESCE(pc.deal_id::text, pc.conversation_key)";

export async function listProductComplaints(
  filters: ProductComplaintsFilters,
  pagination: { page: number; pageSize: number },
) {
  const { where, params } = buildFilters(filters);
  const offset = (pagination.page - 1) * pagination.pageSize;

  const listResult = await pool.query(`
    SELECT
      pc.id,
      pc.window_date,
      pc.deal_id,
      pc.is_group,
      pc.chat_name,
      pc.agent_name,
      pc.customer_name,
      pc.model_raw,
      pc.model_normalized,
      pc.category,
      pc.severity,
      pc.detail,
      pc.quote,
      pc.source,
      pc.occurred_at,
      COUNT(*) OVER()::int AS total_count
    FROM product_complaints pc
    ${where}
    ORDER BY pc.window_date DESC, pc.occurred_at DESC NULLS LAST
    LIMIT ${pagination.pageSize} OFFSET ${offset}
  `, params);

  const total = Number(listResult.rows[0]?.total_count ?? 0);

  return {
    items: listResult.rows.map((row) => ({
      id: String(row.id),
      windowDate: String(row.window_date instanceof Date ? row.window_date.toISOString().slice(0, 10) : row.window_date),
      dealId: row.deal_id ? String(row.deal_id) : null,
      isGroup: Boolean(row.is_group),
      chatName: row.chat_name ? String(row.chat_name) : null,
      agentName: row.agent_name ? String(row.agent_name) : null,
      customerName: row.customer_name ? String(row.customer_name) : null,
      modelRaw: String(row.model_raw),
      modelNormalized: String(row.model_normalized),
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

/** Ultimos 12 meses (YYYY-MM), do mais antigo ao atual. */
function lastTwelveMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/**
 * Relatorio por modelo (visual "Vendas por modelo" do estoque): uma linha por
 * modelo com totais, clientes distintos, quebra por categoria, pior atencao e
 * serie mensal de 12 meses para o sparkline.
 */
export async function getProductComplaintsModelReport(
  filters: Omit<ProductComplaintsFilters, "model" | "exact">,
) {
  const { where, params } = buildFilters(filters);

  const [modelsResult, monthlyResult] = await Promise.all([
    pool.query(`
      SELECT
        pc.model_normalized AS model,
        COUNT(*)::int AS total,
        COUNT(DISTINCT ${CLIENT_KEY_SQL})::int AS distinct_clients,
        COUNT(*) FILTER (WHERE pc.category = 'reclamacao')::int AS complaints,
        COUNT(*) FILTER (WHERE pc.category = 'defeito')::int AS defects,
        MIN(pc.window_date)::text AS first_date,
        MAX(pc.window_date)::text AS last_date,
        (ARRAY['none','low','medium','high','critical'])[
          MAX(COALESCE(ARRAY_POSITION(ARRAY['none','low','medium','high','critical'], pc.severity), 1))
        ] AS worst_severity
      FROM product_complaints pc
      ${where}
      GROUP BY 1
      ORDER BY COUNT(*) DESC, MAX(pc.window_date) DESC
    `, params),
    pool.query(`
      SELECT
        pc.model_normalized AS model,
        TO_CHAR(DATE_TRUNC('month', pc.window_date), 'YYYY-MM') AS month,
        COUNT(*)::int AS total
      FROM product_complaints pc
      ${where}
      GROUP BY 1, 2
    `, params),
  ]);

  const months = lastTwelveMonths();
  const monthIndex = new Map(months.map((month, index) => [month, index]));
  const monthlyByModel = new Map<string, number[]>();
  for (const row of monthlyResult.rows) {
    const model = String(row.model);
    const index = monthIndex.get(String(row.month));
    if (index === undefined) continue;
    const series = monthlyByModel.get(model) ?? months.map(() => 0);
    series[index] = Number(row.total ?? 0);
    monthlyByModel.set(model, series);
  }

  return {
    months,
    models: modelsResult.rows.map((row) => ({
      model: String(row.model),
      total: Number(row.total ?? 0),
      distinctClients: Number(row.distinct_clients ?? 0),
      complaints: Number(row.complaints ?? 0),
      defects: Number(row.defects ?? 0),
      firstDate: String(row.first_date),
      lastDate: String(row.last_date),
      worstSeverity: String(row.worst_severity ?? "none"),
      monthly: monthlyByModel.get(String(row.model)) ?? months.map(() => 0),
    })),
  };
}

export async function getProductComplaintsOverview(filters: ProductComplaintsFilters) {
  const { where, params } = buildFilters(filters);

  const [summaryResult, monthlyResult, topModelsResult, topClientsResult] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT ${CLIENT_KEY_SQL})::int AS distinct_clients,
        COUNT(DISTINCT pc.model_normalized)::int AS distinct_models,
        COUNT(*) FILTER (WHERE pc.category = 'reclamacao')::int AS complaints,
        COUNT(*) FILTER (WHERE pc.category = 'defeito')::int AS defects,
        MAX(pc.window_date)::text AS last_date
      FROM product_complaints pc
      ${where}
    `, params),
    pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', pc.window_date), 'YYYY-MM') AS month,
        COUNT(*)::int AS total,
        COUNT(DISTINCT ${CLIENT_KEY_SQL})::int AS distinct_clients
      FROM product_complaints pc
      ${where}
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 12
    `, params),
    pool.query(`
      SELECT
        pc.model_normalized AS model,
        COUNT(*)::int AS total,
        COUNT(DISTINCT ${CLIENT_KEY_SQL})::int AS distinct_clients,
        MAX(pc.window_date)::text AS last_date
      FROM product_complaints pc
      ${where}
      GROUP BY 1
      ORDER BY COUNT(*) DESC, MAX(pc.window_date) DESC
      LIMIT 15
    `, params),
    pool.query(`
      SELECT
        COALESCE(pc.customer_name, pc.chat_name, 'Sem nome') AS client,
        COUNT(*)::int AS total,
        COUNT(DISTINCT pc.model_normalized)::int AS distinct_models,
        MAX(pc.window_date)::text AS last_date
      FROM product_complaints pc
      ${where}
      GROUP BY 1
      ORDER BY COUNT(*) DESC, MAX(pc.window_date) DESC
      LIMIT 10
    `, params),
  ]);

  const summaryRow = summaryResult.rows[0] ?? {};

  return {
    summary: {
      total: Number(summaryRow.total ?? 0),
      distinctClients: Number(summaryRow.distinct_clients ?? 0),
      distinctModels: Number(summaryRow.distinct_models ?? 0),
      complaints: Number(summaryRow.complaints ?? 0),
      defects: Number(summaryRow.defects ?? 0),
      lastDate: summaryRow.last_date ? String(summaryRow.last_date) : null,
    },
    monthly: monthlyResult.rows
      .map((row) => ({
        month: String(row.month),
        total: Number(row.total ?? 0),
        distinctClients: Number(row.distinct_clients ?? 0),
      }))
      .reverse(),
    topModels: topModelsResult.rows.map((row) => ({
      model: String(row.model),
      total: Number(row.total ?? 0),
      distinctClients: Number(row.distinct_clients ?? 0),
      lastDate: String(row.last_date),
    })),
    topClients: topClientsResult.rows.map((row) => ({
      client: String(row.client),
      total: Number(row.total ?? 0),
      distinctModels: Number(row.distinct_models ?? 0),
      lastDate: String(row.last_date),
    })),
  };
}
