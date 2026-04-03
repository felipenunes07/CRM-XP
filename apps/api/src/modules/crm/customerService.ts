import type {
  CustomerLabel,
  CustomerDetail,
  CustomerListItem,
  InsightTag,
  SegmentDefinition,
  SegmentResult,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";

type FilterLike = CustomerFilters & Partial<SegmentDefinition>;

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
    lastPurchaseAt: row.last_purchase_at ? new Date(String(row.last_purchase_at)).toISOString() : null,
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
  };
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
}

function buildWhere(filters: FilterLike) {
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

  return { whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function sortSql(sortBy?: CustomerFilters["sortBy"]) {
  switch (sortBy) {
    case "faturamento":
      return "s.total_spent DESC, s.priority_score DESC";
    case "recencia":
      return "s.days_since_last_purchase DESC NULLS LAST, s.priority_score DESC";
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
        s.last_purchase_at,
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

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail | null> {
  const snapshotResult = await pool.query(
    `
      SELECT
        s.customer_id,
        s.customer_code,
        s.display_name,
        s.last_purchase_at,
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
        s.total_orders,
        s.avg_days_between_orders,
        s.purchase_frequency_90d,
        s.frequency_drop_ratio,
        s.predicted_next_purchase_at,
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
        order_date,
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
    predictedNextPurchaseAt: row.predicted_next_purchase_at
      ? new Date(String(row.predicted_next_purchase_at)).toISOString()
      : null,
    internalNotes: String(row.internal_notes ?? ""),
    recentOrders: ordersResult.rows.map((order) => ({
      id: String(order.id),
      orderNumber: String(order.order_number),
      orderDate: new Date(String(order.order_date)).toISOString(),
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
  let potentialRecoveredPieces = 0;

  if (customerIds.length) {
    const piecesResult = await pool.query(
      `
        WITH customer_piece_stats AS (
          SELECT
            o.customer_id,
            COALESCE(SUM(oi.quantity), 0)::numeric(14,2) AS total_quantity,
            COUNT(DISTINCT o.id)::numeric(14,2) AS total_orders
          FROM orders o
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.customer_id = ANY($1::uuid[])
          GROUP BY o.customer_id
        )
        SELECT COALESCE(SUM(total_quantity / NULLIF(total_orders, 0)), 0)::numeric(14,2) AS potential_recovered_pieces
        FROM customer_piece_stats
      `,
      [customerIds],
    );

    potentialRecoveredPieces = Number(piecesResult.rows[0]?.potential_recovered_pieces ?? 0);
  }

  const potentialRecoveredRevenue = customers.reduce((sum, customer) => sum + customer.avgTicket, 0);

  return {
    summary: {
      totalCustomers: customers.length,
      averagePriorityScore: customers.length
        ? customers.reduce((sum, customer) => sum + customer.priorityScore, 0) / customers.length
        : 0,
      potentialRecoveredRevenue,
      potentialRecoveredPieces,
    },
    customers,
  };
}

export async function listCustomerLabels(): Promise<CustomerLabel[]> {
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

function normalizeLabelName(value: string) {
  return value.trim().toLowerCase();
}

function labelColorForName(labelName: string) {
  const normalized = normalizeLabelName(labelName);

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

export async function deleteCustomerLabel(labelId: string): Promise<boolean> {
  const result = await pool.query("DELETE FROM customer_labels WHERE id = $1", [labelId]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateCustomerLabels(
  customerId: string,
  input: { labels: string[]; internalNotes: string },
): Promise<CustomerDetail | null> {
  const cleanedLabels = Array.from(
    new Set(
      input.labels
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  );

  await pool.query("BEGIN");

  try {
    await pool.query(
      `
        UPDATE customers
        SET internal_notes = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [customerId, input.internalNotes.trim()],
    );

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

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  return getCustomerDetail(customerId);
}
