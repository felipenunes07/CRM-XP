import type { AgendaItem, DashboardMetrics, InsightTag } from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { listCustomers } from "./customerService.js";

function getInsightTags(row: Record<string, unknown>) {
  return Array.isArray(row.insight_tags)
    ? row.insight_tags.map((tag: unknown) => String(tag) as InsightTag)
    : [];
}

function getLabels(row: Record<string, unknown>) {
  if (!Array.isArray(row.labels)) {
    return [];
  }

  return row.labels
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const label = entry as Record<string, unknown>;
      return {
        id: String(label.id ?? ""),
        name: String(label.name ?? ""),
        color: String(label.color ?? "#2956d7"),
      };
    })
    .filter((entry): entry is AgendaItem["labels"][number] => Boolean(entry?.id && entry.name));
}

function buildAgendaReason(row: Record<string, unknown>, tags: InsightTag[]) {
  const daysSince =
    row.days_since_last_purchase === null || row.days_since_last_purchase === undefined
      ? null
      : Number(row.days_since_last_purchase);

  if (tags.includes("risco_churn")) {
    return `Queda forte de frequencia e cliente fora da zona ativa${daysSince !== null ? ` ha ${daysSince} dias` : ""}.`;
  }

  if (tags.includes("reativacao")) {
    return `Cliente inativo com historico relevante${daysSince !== null ? ` e ${daysSince} dias sem comprar` : ""}.`;
  }

  if (tags.includes("compra_prevista_vencida")) {
    return "A data prevista de recompra passou e vale contato agora.";
  }

  if (tags.includes("alto_valor")) {
    return "Cliente de alto valor que merece acompanhamento proximo.";
  }

  if (String(row.status) === "ATTENTION") {
    return `Cliente em atencao${daysSince !== null ? ` com ${daysSince} dias desde a ultima compra` : ""}.`;
  }

  return "Cliente estrategico para contato comercial.";
}

function buildAgendaSuggestedAction(tags: InsightTag[], status: string) {
  if (tags.includes("risco_churn")) {
    return "Fazer contato de recuperacao com proposta personalizada.";
  }

  if (tags.includes("reativacao")) {
    return "Retomar conversa e investigar por que parou de comprar.";
  }

  if (tags.includes("compra_prevista_vencida")) {
    return "Fazer follow-up objetivo com proposta de recompra.";
  }

  if (status === "ATTENTION") {
    return "Fazer follow-up antes de o cliente virar inativo.";
  }

  return "Manter relacionamento e estimular nova compra.";
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const totals = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total_customers,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_count,
        COUNT(*) FILTER (WHERE status = 'ATTENTION')::int AS attention_count,
        COUNT(*) FILTER (WHERE status = 'INACTIVE')::int AS inactive_count,
        AVG(avg_ticket)::numeric(14,2) AS average_ticket,
        AVG(avg_days_between_orders)::numeric(14,2) AS average_frequency_days
      FROM customer_snapshot
    `,
  );

  const buckets = await pool.query(
    `
      SELECT label, count
      FROM (
        SELECT '0-14' AS label, COUNT(*)::int AS count FROM customer_snapshot WHERE COALESCE(days_since_last_purchase, 0) BETWEEN 0 AND 14
        UNION ALL
        SELECT '15-29', COUNT(*)::int FROM customer_snapshot WHERE days_since_last_purchase BETWEEN 15 AND 29
        UNION ALL
        SELECT '30-59', COUNT(*)::int FROM customer_snapshot WHERE days_since_last_purchase BETWEEN 30 AND 59
        UNION ALL
        SELECT '60-89', COUNT(*)::int FROM customer_snapshot WHERE days_since_last_purchase BETWEEN 60 AND 89
        UNION ALL
        SELECT '90-179', COUNT(*)::int FROM customer_snapshot WHERE days_since_last_purchase BETWEEN 90 AND 179
        UNION ALL
        SELECT '180+', COUNT(*)::int FROM customer_snapshot WHERE days_since_last_purchase >= 180
      ) bucket_data
    `,
  );

  const lastSync = await pool.query(
    `
      SELECT MAX(finished_at) AS last_sync_at
      FROM (
        SELECT finished_at FROM import_runs WHERE status = 'COMPLETED'
        UNION ALL
        SELECT finished_at FROM sync_runs WHERE status = 'COMPLETED'
      ) AS sync_data
    `,
  );

  const topCustomers = await listCustomers({ sortBy: "faturamento", limit: 8 });
  const agenda = await getAgendaItems(12);
  const row = totals.rows[0];

  return {
    totalCustomers: Number(row?.total_customers ?? 0),
    statusCounts: {
      ACTIVE: Number(row?.active_count ?? 0),
      ATTENTION: Number(row?.attention_count ?? 0),
      INACTIVE: Number(row?.inactive_count ?? 0),
    },
    inactivityBuckets: buckets.rows.map((bucket) => ({
      label: String(bucket.label),
      count: Number(bucket.count ?? 0),
    })),
    averageTicket: Number(row?.average_ticket ?? 0),
    averageFrequencyDays: Number(row?.average_frequency_days ?? 0),
    lastSyncAt: lastSync.rows[0]?.last_sync_at ? new Date(String(lastSync.rows[0].last_sync_at)).toISOString() : null,
    topCustomers,
    dailyAgendaCount: agenda.length,
  };
}

export async function getAgendaItems(limit = 25): Promise<AgendaItem[]> {
  const result = await pool.query(
    `
      SELECT
        customer_id,
        customer_code,
        display_name,
        last_purchase_at,
        days_since_last_purchase,
        total_orders,
        total_spent,
        avg_ticket,
        status,
        priority_score,
        value_score,
        primary_insight,
        insight_tags,
        last_attendant,
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('id', cl.id, 'name', cl.name, 'color', cl.color)
            ORDER BY cl.name
          )
          FROM customer_label_assignments cla
          JOIN customer_labels cl ON cl.id = cla.label_id
          WHERE cla.customer_id = customer_snapshot.customer_id
        ), '[]'::jsonb) AS labels
      FROM customer_snapshot
      ORDER BY priority_score DESC, total_spent DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row) => {
    const tags = getInsightTags(row);
    const status = String(row.status);

    return {
      id: String(row.customer_id),
      customerCode: String(row.customer_code ?? ""),
      displayName: String(row.display_name),
      lastPurchaseAt: row.last_purchase_at ? new Date(String(row.last_purchase_at)).toISOString() : null,
      daysSinceLastPurchase:
        row.days_since_last_purchase === null || row.days_since_last_purchase === undefined
          ? null
          : Number(row.days_since_last_purchase),
      totalOrders: Number(row.total_orders ?? 0),
      totalSpent: Number(row.total_spent ?? 0),
      avgTicket: Number(row.avg_ticket ?? 0),
      status: status as AgendaItem["status"],
      priorityScore: Number(row.priority_score ?? 0),
      valueScore: Number(row.value_score ?? 0),
      primaryInsight: row.primary_insight ? (String(row.primary_insight) as InsightTag) : null,
      insightTags: tags,
      lastAttendant: row.last_attendant ? String(row.last_attendant) : null,
      labels: getLabels(row),
      reason: buildAgendaReason(row, tags),
      suggestedAction: buildAgendaSuggestedAction(tags, status),
    };
  });
}
