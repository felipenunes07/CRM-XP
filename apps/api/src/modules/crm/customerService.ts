import {
  AMBASSADOR_LABEL_COLOR,
  AMBASSADOR_LABEL_NAME,
} from "@olist-crm/shared";
import type {
  CustomerDocInsightListItem,
  CustomerDocInsightsResponse,
  CustomerLabel,
  CustomerDetail,
  CustomerListItem,
  InsightTag,
  SegmentDefinition,
  SegmentResult,
  TopProduct,
} from "@olist-crm/shared";
import { HttpError } from "../../lib/httpError.js";
import { pool } from "../../db/client.js";

export type FilterLike = CustomerFilters & Partial<SegmentDefinition>;

function normalizeLabelName(value: string) {
  return value.trim().toLowerCase();
}

export const AMBASSADOR_LABEL_NORMALIZED_NAME = normalizeLabelName(AMBASSADOR_LABEL_NAME);
const DOC_ITEM_DESCRIPTION_FILTER = "%DOC DE CARGA%";

function mapInsightTags(value: unknown): InsightTag[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry) as InsightTag);
}

function mapLabels(value: unknown): CustomerLabel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const row = entry as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        color: String(row.color ?? "#2956d7"),
      } satisfies CustomerLabel;
    })
    .filter((entry): entry is CustomerLabel => Boolean(entry?.id && entry.name));
}

function mapCustomerRow(row: Record<string, unknown>): CustomerListItem {
  return {
    id: String(row.customer_id),
    customerCode: String(row.customer_code ?? ""),
    displayName: String(row.display_name),
    lastPurchaseAt: row.last_purchase_at ? String(row.last_purchase_at) : null,
    daysSinceLastPurchase:
      row.days_since_last_purchase === null || row.days_since_last_purchase === undefined
        ? null
        : Number(row.days_since_last_purchase),
    totalOrders: Number(row.total_orders ?? 0),
    totalSpent: Number(row.total_spent ?? 0),
    avgTicket: Number(row.avg_ticket ?? 0),
    status: String(row.status) as CustomerListItem["status"],
    priorityScore: Number(row.priority_score ?? 0),
    valueScore: Number(row.value_score ?? 0),
    primaryInsight: row.primary_insight ? (String(row.primary_insight) as InsightTag) : null,
    insightTags: mapInsightTags(row.insight_tags),
    lastAttendant: row.last_attendant ? String(row.last_attendant) : null,
    labels: mapLabels(row.labels),
    isAmbassador: Boolean(row.is_ambassador),
    ambassadorAssignedAt: row.ambassador_assigned_at ? String(row.ambassador_assigned_at) : null,
    avgDaysBetweenOrders:
      row.avg_days_between_orders === null ||
      row.avg_days_between_orders === undefined ||
      row.avg_days_between_orders === ""
        ? null
        : Number(row.avg_days_between_orders),
  };
}

function mapCustomerDocInsightRow(row: Record<string, unknown>): CustomerDocInsightListItem {
  return {
    id: String(row.customer_id),
    customerCode: String(row.customer_code ?? ""),
    displayName: String(row.display_name ?? ""),
    status: String(row.status ?? "INACTIVE") as CustomerDocInsightListItem["status"],
    docQuantity: Number(row.doc_quantity ?? 0),
    docOrderCount: Number(row.doc_order_count ?? 0),
    docRevenue: Number(row.doc_revenue ?? 0),
    lastDocPurchaseAt: row.last_doc_purchase_at ? String(row.last_doc_purchase_at) : null,
  };
}

export function compareCustomerDocInsights(left: CustomerDocInsightListItem, right: CustomerDocInsightListItem) {
  if (right.docQuantity !== left.docQuantity) {
    return right.docQuantity - left.docQuantity;
  }

  if (right.docOrderCount !== left.docOrderCount) {
    return right.docOrderCount - left.docOrderCount;
  }

  if (right.docRevenue !== left.docRevenue) {
    return right.docRevenue - left.docRevenue;
  }

  return left.displayName.localeCompare(right.displayName, "pt-BR");
}

export function sortCustomerDocInsights(items: CustomerDocInsightListItem[]) {
  return [...items].sort(compareCustomerDocInsights);
}

export interface CustomerFilters {
  search?: string;
  status?: CustomerListItem["status"][];
  minDaysInactive?: number;
  maxDaysInactive?: number;
  minAvgTicket?: number;
  minTotalSpent?: number;
  minFrequencyDrop?: number;
  sortBy?: "priority" | "faturamento" | "recencia";
  limit?: number;
  labels?: string[];
  excludeLabels?: string[];
  isAmbassador?: boolean;
}

export function buildWhere(filters: FilterLike) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  const push = (sqlFactory: (index: number) => string, value: unknown) => {
    params.push(value);
    clauses.push(sqlFactory(params.length));
  };

  if (filters.search) {
    const searchValue = `%${filters.search}%`;
    params.push(searchValue);
    const first = params.length;
    params.push(searchValue);
    const second = params.length;
    clauses.push(`(s.display_name ILIKE $${first} OR s.customer_code ILIKE $${second})`);
  }

  if (filters.status?.length) {
    push((index) => `s.status = ANY($${index})`, filters.status);
  }
  if (filters.minDaysInactive !== undefined) {
    push((index) => `COALESCE(s.days_since_last_purchase, 9999) >= $${index}`, filters.minDaysInactive);
  }
  if (filters.maxDaysInactive !== undefined) {
    push((index) => `COALESCE(s.days_since_last_purchase, 0) <= $${index}`, filters.maxDaysInactive);
  }
  if (filters.minAvgTicket !== undefined) {
    push((index) => `s.avg_ticket >= $${index}`, filters.minAvgTicket);
  }
  if (filters.minTotalSpent !== undefined) {
    push((index) => `s.total_spent >= $${index}`, filters.minTotalSpent);
  }
  if (filters.minFrequencyDrop !== undefined) {
    push((index) => `s.frequency_drop_ratio >= $${index}`, filters.minFrequencyDrop);
  }
  if (filters.frequencyDropRatio !== undefined) {
    push((index) => `s.frequency_drop_ratio >= $${index}`, filters.frequencyDropRatio);
  }
  if (filters.newCustomersWithinDays !== undefined) {
    push((index) => `COALESCE(s.days_since_last_purchase, 9999) <= $${index}`, filters.newCustomersWithinDays);
    push((index) => `s.total_orders <= $${index}`, 2);
  }
  if (filters.stoppedTopCustomers) {
    clauses.push("s.value_score >= 70 AND s.status <> 'ACTIVE'");
  }

  if (filters.labels?.length) {
    push(
      (index) => `
        EXISTS (
          SELECT 1
          FROM customer_label_assignments cla
          JOIN customer_labels cl ON cl.id = cla.label_id
          WHERE cla.customer_id = s.customer_id
            AND cl.name = ANY($${index})
        )
      `,
      filters.labels,
    );
  }

  if (filters.excludeLabels?.length) {
    push(
      (index) => `
        NOT EXISTS (
          SELECT 1
          FROM customer_label_assignments cla
          JOIN customer_labels cl ON cl.id = cla.label_id
          WHERE cla.customer_id = s.customer_id
            AND cl.name = ANY($${index})
        )
      `,
      filters.excludeLabels,
    );
  }

  if (filters.isAmbassador === true) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM customer_label_assignments cla
        JOIN customer_labels cl ON cl.id = cla.label_id
        WHERE cla.customer_id = s.customer_id
          AND cl.normalized_name = '${AMBASSADOR_LABEL_NORMALIZED_NAME}'
      )
    `);
  }

  return { whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function sortSql(sortBy?: CustomerFilters["sortBy"]) {
  switch (sortBy) {
    case "faturamento":
      return "s.total_spent DESC, s.priority_score DESC";
    case "recencia":
      return "s.days_since_last_purchase DESC NULLS LAST, s.priority_score DESC";
    case "avgDaysBetweenOrders":
      return "s.avg_days_between_orders DESC NULLS LAST, s.priority_score DESC";
    case "priority":
    default:
      return "s.priority_score DESC, s.total_spent DESC";
  }
}

export async function listCustomers(filters: CustomerFilters = {}) {
  const { whereSql, params } = buildWhere(filters);
  const limitSql =
    typeof filters.limit === "number" && Number.isFinite(filters.limit) && filters.limit > 0
      ? `LIMIT ${Math.floor(filters.limit)}`
      : "";
  const result = await pool.query(
    `
      SELECT
        s.customer_id,
        s.customer_code,
        s.display_name,
        s.last_purchase_at::date::text AS last_purchase_at,
        s.days_since_last_purchase,
        s.total_orders,
        s.total_spent,
        s.avg_ticket,
        s.status,
        s.priority_score,
        s.value_score,
        s.primary_insight,
        s.insight_tags,
        s.last_attendant,
        s.avg_days_between_orders,
        EXISTS (
          SELECT 1
          FROM customer_label_assignments cla
          JOIN customer_labels cl ON cl.id = cla.label_id
          WHERE cla.customer_id = s.customer_id
            AND cl.normalized_name = '${AMBASSADOR_LABEL_NORMALIZED_NAME}'
        ) AS is_ambassador,
        (
          SELECT cla.created_at::text
          FROM customer_label_assignments cla
          JOIN customer_labels cl ON cl.id = cla.label_id
          WHERE cla.customer_id = s.customer_id
            AND cl.normalized_name = '${AMBASSADOR_LABEL_NORMALIZED_NAME}'
          ORDER BY cla.created_at ASC
          LIMIT 1
        ) AS ambassador_assigned_at,
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('id', cl.id, 'name', cl.name, 'color', cl.color)
            ORDER BY cl.name
          )
          FROM customer_label_assignments cla
          JOIN customer_labels cl ON cl.id = cla.label_id
          WHERE cla.customer_id = s.customer_id
        ), '[]'::jsonb) AS labels
      FROM customer_snapshot s
      ${whereSql}
      ORDER BY ${sortSql(filters.sortBy)}
      ${limitSql}
    `,
    params,
  );

  return result.rows.map((row) => mapCustomerRow(row));
}

export async function getCustomerDocInsights(limit = 120): Promise<CustomerDocInsightsResponse> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 120) : 120;
  const cteSql = `
    WITH doc_customer_totals AS (
      SELECT
        o.customer_id,
        c.customer_code,
        COALESCE(NULLIF(s.display_name, ''), c.display_name) AS display_name,
        COALESCE(s.status, 'INACTIVE') AS status,
        COALESCE(SUM(oi.quantity), 0)::numeric(14,2) AS doc_quantity,
        COUNT(DISTINCT o.id)::int AS doc_order_count,
        COALESCE(SUM(oi.line_total), 0)::numeric(14,2) AS doc_revenue,
        MAX(o.order_date)::date::text AS last_doc_purchase_at
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN customers c ON c.id = o.customer_id
      LEFT JOIN customer_snapshot s ON s.customer_id = o.customer_id
      WHERE oi.item_description ILIKE $1
      GROUP BY
        o.customer_id,
        c.customer_code,
        COALESCE(NULLIF(s.display_name, ''), c.display_name),
        COALESCE(s.status, 'INACTIVE')
    )
  `;

  const [summaryResult, rankingResult] = await Promise.all([
    pool.query(
      `
        ${cteSql}
        SELECT
          COUNT(*)::int AS customers_with_doc,
          COALESCE(SUM(doc_order_count), 0)::int AS doc_orders,
          COALESCE(SUM(doc_quantity), 0)::numeric(14,2) AS doc_quantity,
          COALESCE(SUM(doc_revenue), 0)::numeric(14,2) AS doc_revenue
        FROM doc_customer_totals
      `,
      [DOC_ITEM_DESCRIPTION_FILTER],
    ),
    pool.query(
      `
        ${cteSql}
        SELECT
          customer_id,
          customer_code,
          display_name,
          status,
          doc_quantity,
          doc_order_count,
          doc_revenue,
          last_doc_purchase_at
        FROM doc_customer_totals
        ORDER BY doc_quantity DESC, doc_order_count DESC, doc_revenue DESC, display_name ASC
        LIMIT $2
      `,
      [DOC_ITEM_DESCRIPTION_FILTER, safeLimit],
    ),
  ]);

  const summary = summaryResult.rows[0] ?? {};

  return {
    summary: {
      customersWithDoc: Number(summary.customers_with_doc ?? 0),
      docOrders: Number(summary.doc_orders ?? 0),
      docQuantity: Number(summary.doc_quantity ?? 0),
      docRevenue: Number(summary.doc_revenue ?? 0),
    },
    ranking: sortCustomerDocInsights(rankingResult.rows.map((row) => mapCustomerDocInsightRow(row))),
  };
}

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail | null> {
  const snapshotResult = await pool.query(
    `
      SELECT
        s.customer_id,
        s.customer_code,
        s.display_name,
        s.last_purchase_at::date::text AS last_purchase_at,
        s.days_since_last_purchase,
        s.total_spent,
        s.avg_ticket,
        s.status,
        s.priority_score,
        s.value_score,
        s.primary_insight,
        s.insight_tags,
        s.last_attendant,
        c.internal_notes,
        EXISTS (
          SELECT 1
          FROM customer_label_assignments cla
          JOIN customer_labels cl ON cl.id = cla.label_id
          WHERE cla.customer_id = s.customer_id
            AND cl.normalized_name = '${AMBASSADOR_LABEL_NORMALIZED_NAME}'
        ) AS is_ambassador,
        (
          SELECT cla.created_at::text
          FROM customer_label_assignments cla
          JOIN customer_labels cl ON cl.id = cla.label_id
          WHERE cla.customer_id = s.customer_id
            AND cl.normalized_name = '${AMBASSADOR_LABEL_NORMALIZED_NAME}'
          ORDER BY cla.created_at ASC
          LIMIT 1
        ) AS ambassador_assigned_at,
        s.total_orders,
        s.avg_days_between_orders,
        s.purchase_frequency_90d,
        s.frequency_drop_ratio,
        s.predicted_next_purchase_at::date::text AS predicted_next_purchase_at,
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object('id', cl.id, 'name', cl.name, 'color', cl.color)
            ORDER BY cl.name
          )
          FROM customer_label_assignments cla
          JOIN customer_labels cl ON cl.id = cla.label_id
          WHERE cla.customer_id = s.customer_id
        ), '[]'::jsonb) AS labels
      FROM customer_snapshot s
      JOIN customers c ON c.id = s.customer_id
      WHERE s.customer_id = $1
    `,
    [customerId],
  );

  const row = snapshotResult.rows[0];
  if (!row) {
    return null;
  }

  const ordersResult = await pool.query(
    `
      SELECT
        id,
        order_number,
        order_date::text AS order_date,
        source_system,
        total_amount,
        status,
        item_count
      FROM orders
      WHERE customer_id = $1
      ORDER BY order_date DESC
      LIMIT 20
    `,
    [customerId],
  );

  const topProductsResult = await pool.query(
    `
      SELECT
        MAX(NULLIF(oi.sku, '')) AS sku,
        MAX(COALESCE(NULLIF(oi.item_description, ''), 'Produto sem descricao')) AS item_description,
        COALESCE(SUM(oi.quantity), 0)::numeric(14,2) AS total_quantity,
        COUNT(DISTINCT o.id)::int AS order_count,
        MAX(o.order_date)::date::text AS last_bought_at
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.customer_id = $1
      GROUP BY COALESCE(
        NULLIF(oi.sku, ''),
        CONCAT('__desc__', COALESCE(NULLIF(oi.item_description, ''), 'sem-descricao'))
      )
      ORDER BY total_quantity DESC, order_count DESC, item_description ASC
      LIMIT 10
    `,
    [customerId],
  );

  const base = mapCustomerRow(row);
  return {
    ...base,
    totalOrders: Number(row.total_orders ?? 0),
    avgDaysBetweenOrders:
      row.avg_days_between_orders === null || row.avg_days_between_orders === undefined
        ? null
        : Number(row.avg_days_between_orders),
    purchaseFrequency90d: Number(row.purchase_frequency_90d ?? 0),
    frequencyDropRatio: Number(row.frequency_drop_ratio ?? 0),
    predictedNextPurchaseAt: row.predicted_next_purchase_at ? String(row.predicted_next_purchase_at) : null,
    internalNotes: String(row.internal_notes ?? ""),
    topProducts: topProductsResult.rows.map(
      (product) =>
        ({
          sku: product.sku ? String(product.sku) : null,
          itemDescription: String(product.item_description ?? ""),
          totalQuantity: Number(product.total_quantity ?? 0),
          orderCount: Number(product.order_count ?? 0),
          lastBoughtAt: product.last_bought_at ? String(product.last_bought_at) : null,
        }) satisfies TopProduct,
    ),
    recentOrders: ordersResult.rows.map((order) => ({
      id: String(order.id),
      orderNumber: String(order.order_number),
      orderDate: String(order.order_date),
      sourceSystem: String(order.source_system) as CustomerDetail["recentOrders"][number]["sourceSystem"],
      totalAmount: Number(order.total_amount ?? 0),
      status: String(order.status),
      itemCount: Number(order.item_count ?? 0),
    })),
  };
}

export async function previewSegment(definition: SegmentDefinition): Promise<SegmentResult> {
  const customers = await listCustomers({
    status: definition.status,
    minDaysInactive: definition.minDaysInactive,
    maxDaysInactive: definition.maxDaysInactive,
    minAvgTicket: definition.minAvgTicket,
    minTotalSpent: definition.minTotalSpent,
    minFrequencyDrop: definition.frequencyDropRatio,
    labels: definition.labels,
    excludeLabels: definition.excludeLabels,
    sortBy: "priority",
  });

  const customerIds = customers.map((customer) => customer.id);
  let avgPiecesPerOrder = 0;
  let monthlyPotentialRevenue = 0;
  let monthlyPotentialPieces = 0;

  if (customerIds.length) {
    try {
      const statsResult = await pool.query(
        `
          WITH order_item_totals AS (
            SELECT
              order_id,
              COALESCE(SUM(quantity), 0)::numeric(14,2) AS pieces
            FROM order_items
            GROUP BY order_id
          ),
          customer_piece_stats AS (
            SELECT
              o.customer_id,
              COALESCE(SUM(COALESCE(order_item_totals.pieces, 0)), 0)::numeric(14,2) AS total_quantity,
              COUNT(DISTINCT o.id)::numeric(14,2) AS total_orders,
              COALESCE(SUM(o.total_amount), 0)::numeric(14,2) AS total_revenue,
              GREATEST(
                EXTRACT(EPOCH FROM (MAX(o.order_date)::timestamp - MIN(o.order_date)::timestamp)) / 86400.0,
                0
              ) AS days_active
            FROM orders o
            LEFT JOIN order_item_totals ON order_item_totals.order_id = o.id
            WHERE o.customer_id = ANY($1::uuid[])
            GROUP BY o.customer_id
          ),
          customer_monthly_stats AS (
            SELECT
              customer_id,
              total_quantity / NULLIF(total_orders, 0) AS avg_pieces_per_order,
              CASE 
                WHEN days_active > 30 THEN (total_orders / (days_active / 30.0))
                ELSE total_orders
              END AS avg_orders_per_month,
              CASE 
                WHEN days_active > 30 THEN (total_revenue / (days_active / 30.0))
                ELSE total_revenue
              END AS avg_revenue_per_month
            FROM customer_piece_stats
            WHERE total_orders > 0
          )
          SELECT 
            COALESCE(SUM(avg_pieces_per_order), 0)::numeric(14,2) AS total_avg_pieces_per_order,
            COALESCE(SUM(avg_orders_per_month * avg_pieces_per_order), 0)::numeric(14,2) AS monthly_potential_pieces,
            COALESCE(SUM(avg_revenue_per_month), 0)::numeric(14,2) AS monthly_potential_revenue
          FROM customer_monthly_stats
        `,
        [customerIds],
      );

      const stats = statsResult.rows[0];
      avgPiecesPerOrder = Number(stats?.total_avg_pieces_per_order ?? 0);
      monthlyPotentialPieces = Number(stats?.monthly_potential_pieces ?? 0);
      monthlyPotentialRevenue = Number(stats?.monthly_potential_revenue ?? 0);
    } catch (err: any) {
      console.error("ERRO AO GERAR PREVIEW:", err.message, err);
      throw err;
    }
  }

  const potentialRecoveredRevenue = customers.reduce((sum, customer) => sum + customer.avgTicket, 0);

  return {
    summary: {
      totalCustomers: customers.length,
      averagePriorityScore: customers.length
        ? customers.reduce((sum, customer) => sum + customer.priorityScore, 0) / customers.length
        : 0,
      potentialRecoveredRevenue,
      potentialRecoveredPieces: avgPiecesPerOrder,
      monthlyPotentialRevenue,
      monthlyPotentialPieces,
    },
    customers,
  };
}

export async function listCustomerLabels(): Promise<CustomerLabel[]> {
  await ensureAmbassadorLabel();

  const result = await pool.query(
    `
      SELECT id, name, color
      FROM customer_labels
      ORDER BY name
    `,
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    color: String(row.color ?? "#2956d7"),
  }));
}

function labelColorForName(labelName: string) {
  const normalized = normalizeLabelName(labelName);

  if (normalized === AMBASSADOR_LABEL_NORMALIZED_NAME || normalized.includes("embaix")) {
    return AMBASSADOR_LABEL_COLOR;
  }

  if (normalized.includes("negra") || normalized.includes("bloque")) {
    return "#b42318";
  }

  if (normalized.includes("credito") || normalized.includes("dev")) {
    return "#d97706";
  }

  if (normalized.includes("bom") || normalized.includes("vip") || normalized.includes("reativ")) {
    return "#2956d7";
  }

  return "#5f8cff";
}

export async function ensureAmbassadorLabel(): Promise<CustomerLabel> {
  const result = await pool.query(
    `
      INSERT INTO customer_labels (name, normalized_name, color, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (normalized_name) DO UPDATE
      SET name = EXCLUDED.name, color = EXCLUDED.color, updated_at = NOW()
      RETURNING id, name, color
    `,
    [AMBASSADOR_LABEL_NAME, AMBASSADOR_LABEL_NORMALIZED_NAME, AMBASSADOR_LABEL_COLOR],
  );

  const row = result.rows[0];
  return {
    id: String(row.id),
    name: String(row.name),
    color: String(row.color ?? AMBASSADOR_LABEL_COLOR),
  };
}

export async function createCustomerLabel(name: string): Promise<CustomerLabel> {
  const cleanedName = name.trim();
  const normalizedName = normalizeLabelName(cleanedName);

  const result = await pool.query(
    `
      INSERT INTO customer_labels (name, normalized_name, color, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (normalized_name) DO UPDATE
      SET name = EXCLUDED.name, updated_at = NOW()
      RETURNING id, name, color
    `,
    [cleanedName, normalizedName, labelColorForName(cleanedName)],
  );

  const row = result.rows[0];
  return {
    id: String(row.id),
    name: String(row.name),
    color: String(row.color ?? "#2956d7"),
  };
}

export async function updateCustomerLabel(labelId: string, color: string): Promise<CustomerLabel | null> {
  const result = await pool.query(
    `
      UPDATE customer_labels
      SET color = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, color
    `,
    [color, labelId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: String(row.id),
    name: String(row.name),
    color: String(row.color ?? "#2956d7"),
  };
}

export async function deleteCustomerLabel(labelId: string): Promise<boolean> {
  const protectedLabelResult = await pool.query(
    `
      SELECT normalized_name
      FROM customer_labels
      WHERE id = $1
    `,
    [labelId],
  );

  if (protectedLabelResult.rows[0]?.normalized_name === AMBASSADOR_LABEL_NORMALIZED_NAME) {
    throw new HttpError(400, "O rotulo Embaixador e reservado e nao pode ser apagado.");
  }

  const result = await pool.query("DELETE FROM customer_labels WHERE id = $1", [labelId]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateCustomerAmbassador(customerId: string, isAmbassador: boolean): Promise<CustomerDetail | null> {
  const existingCustomer = await getCustomerDetail(customerId);
  if (!existingCustomer) {
    return null;
  }

  const label = await ensureAmbassadorLabel();

  if (isAmbassador) {
    await pool.query(
      `
        INSERT INTO customer_label_assignments (customer_id, label_id, created_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (customer_id, label_id) DO NOTHING
      `,
      [customerId, label.id],
    );
  } else {
    await pool.query(
      `
        DELETE FROM customer_label_assignments
        WHERE customer_id = $1
          AND label_id = $2
      `,
      [customerId, label.id],
    );
  }

  return getCustomerDetail(customerId);
}

export async function updateCustomerLabels(
  customerId: string,
  input: { labels?: string[]; internalNotes?: string },
): Promise<CustomerDetail | null> {
  const hasLabels = Array.isArray(input.labels);
  const hasInternalNotes = typeof input.internalNotes === "string";

  if (!hasLabels && !hasInternalNotes) {
    return getCustomerDetail(customerId);
  }

  const cleanedLabels = hasLabels
    ? Array.from(
        new Set(
          (input.labels ?? [])
            .map((label) => label.trim())
            .filter(Boolean),
        ),
      )
    : [];

  await pool.query("BEGIN");

  try {
    if (hasInternalNotes) {
      await pool.query(
        `
          UPDATE customers
          SET internal_notes = $2, updated_at = NOW()
          WHERE id = $1
        `,
        [customerId, input.internalNotes?.trim() ?? ""],
      );
    }

    if (hasLabels) {
      if (cleanedLabels.length) {
        for (const labelName of cleanedLabels) {
          await pool.query(
            `
              INSERT INTO customer_labels (name, normalized_name, color, created_at, updated_at)
              VALUES ($1, $2, $3, NOW(), NOW())
              ON CONFLICT (normalized_name) DO UPDATE
              SET name = EXCLUDED.name, updated_at = NOW()
            `,
            [labelName, normalizeLabelName(labelName), labelColorForName(labelName)],
          );
        }
      }

      await pool.query(
        `
          DELETE FROM customer_label_assignments
          WHERE customer_id = $1
            AND label_id NOT IN (
              SELECT id
              FROM customer_labels
              WHERE normalized_name = ANY($2::text[])
            )
        `,
        [customerId, cleanedLabels.map((label) => normalizeLabelName(label))],
      );

      if (!cleanedLabels.length) {
        await pool.query("DELETE FROM customer_label_assignments WHERE customer_id = $1", [customerId]);
      } else {
        await pool.query(
          `
            INSERT INTO customer_label_assignments (customer_id, label_id, created_at)
            SELECT $1, cl.id, NOW()
            FROM customer_labels cl
            WHERE cl.normalized_name = ANY($2::text[])
            ON CONFLICT (customer_id, label_id) DO NOTHING
          `,
          [customerId, cleanedLabels.map((label) => normalizeLabelName(label))],
        );
      }
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  return getCustomerDetail(customerId);
}
