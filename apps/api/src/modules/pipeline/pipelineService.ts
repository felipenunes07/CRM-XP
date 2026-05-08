import type {
  DealActivity,
  DealDetail,
  DealListItem,
  DealPriority,
  DealActivityType,
  PipelineStage,
  PipelineSummary,
  WhatsappInstanceItem,
} from "@olist-crm/shared";
import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import type { JwtUser } from "../platform/authService.js";
import { configureInstanceSettings, configureInstanceWebhook } from "../whatsapp/evolutionService.js";
import { logger } from "../../lib/logger.js";

// ── Stages ────────────────────────────────────────────────────────

export async function listStages(): Promise<PipelineStage[]> {
  const result = await pool.query(`
    SELECT
      ps.*,
      COALESCE(dc.deal_count, 0)::int AS deal_count,
      COALESCE(dc.total_value, 0)::numeric AS total_value
    FROM pipeline_stages ps
    LEFT JOIN (
      SELECT stage_id, COUNT(*)::int AS deal_count, COALESCE(SUM(expected_value), 0) AS total_value
      FROM deals
      GROUP BY stage_id
    ) dc ON dc.stage_id = ps.id
    ORDER BY ps.sort_order ASC
  `);

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    sortOrder: Number(row.sort_order),
    color: String(row.color ?? "#6366f1"),
    isWon: Boolean(row.is_won),
    isLost: Boolean(row.is_lost),
    dealCount: Number(row.deal_count),
    totalValue: Number(row.total_value),
  }));
}

// ── Deals ─────────────────────────────────────────────────────────

function mapDealRow(row: Record<string, unknown>): DealListItem {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    customerId: row.customer_id ? String(row.customer_id) : null,
    customerCode: row.customer_code ? String(row.customer_code) : null,
    customerDisplayName: row.customer_display_name ? String(row.customer_display_name) : null,
    stageId: String(row.stage_id),
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    assignedToName: row.assigned_to_name ? String(row.assigned_to_name) : null,
    whatsappInstanceId: row.whatsapp_instance_id ? String(row.whatsapp_instance_id) : null,
    expectedValue: Number(row.expected_value ?? 0),
    expectedCloseDate: row.expected_close_date ? String(row.expected_close_date) : null,
    priority: (String(row.priority ?? "MEDIUM")) as DealPriority,
    lastActivityAt: new Date(String(row.last_activity_at ?? row.created_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    customerStatus: row.cs_status ? (String(row.cs_status) as DealListItem["customerStatus"]) : null,
  };
}

function mapActivityRow(row: Record<string, unknown>): DealActivity {
  return {
    id: String(row.id),
    dealId: String(row.deal_id),
    activityType: String(row.activity_type) as DealActivityType,
    actorName: row.actor_name ? String(row.actor_name) : null,
    content: row.content ? String(row.content) : null,
    metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {},
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function getPipelineSummary(user: JwtUser, includeClosedDeals = false): Promise<PipelineSummary> {
  const stages = await listStages();

  const closedFilter = includeClosedDeals
    ? ""
    : "WHERE ps.is_won = false AND ps.is_lost = false";

  const userFilter = user.role === "SELLER" ? `${closedFilter ? "AND" : "WHERE"} d.assigned_to_name = $1` : "";
  const params: unknown[] = user.role === "SELLER" ? [user.name] : [];

  const dealsResult = await pool.query(
    `
    SELECT d.*, cs.status AS cs_status
    FROM deals d
    JOIN pipeline_stages ps ON ps.id = d.stage_id
    LEFT JOIN customer_snapshot cs ON cs.customer_id = d.customer_id
    ${closedFilter} ${userFilter}
    ORDER BY d.last_activity_at DESC
    `,
    params,
  );

  const deals = dealsResult.rows.map(mapDealRow);

  const wonDeals = deals.filter((deal) => {
    const stage = stages.find((s) => s.id === deal.stageId);
    return stage?.isWon;
  });

  const lostDeals = deals.filter((deal) => {
    const stage = stages.find((s) => s.id === deal.stageId);
    return stage?.isLost;
  });

  const now = Date.now();
  const avgDealAge = deals.length > 0
    ? deals.reduce((sum, d) => sum + (now - new Date(d.createdAt).getTime()), 0) / deals.length / (1000 * 60 * 60 * 24)
    : 0;

  return {
    totalDeals: deals.length,
    totalValue: deals.reduce((sum, d) => sum + d.expectedValue, 0),
    wonDeals: wonDeals.length,
    wonValue: wonDeals.reduce((sum, d) => sum + d.expectedValue, 0),
    lostDeals: lostDeals.length,
    avgDealAge: Math.round(avgDealAge),
    stages,
    deals,
  };
}

export interface CreateDealInput {
  title: string;
  customerId?: string | null;
  stageId: string;
  expectedValue?: number;
  expectedCloseDate?: string | null;
  priority?: DealPriority;
  notes?: string;
  whatsappInstanceId?: string | null;
  whatsappJid?: string | null;
}

export async function createDeal(input: CreateDealInput, user: JwtUser): Promise<DealDetail> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let customerCode: string | null = null;
    let customerDisplayName: string | null = null;

    if (input.customerId) {
      const customerResult = await client.query(
        "SELECT customer_code, display_name FROM customers WHERE id = $1",
        [input.customerId],
      );

      if (customerResult.rows[0]) {
        customerCode = String(customerResult.rows[0].customer_code ?? "");
        customerDisplayName = String(customerResult.rows[0].display_name ?? "");
      }
    }

    const insertResult = await client.query(
      `
      INSERT INTO deals (
        title, customer_id, customer_code, customer_display_name,
        stage_id, assigned_to, assigned_to_name,
        whatsapp_instance_id, whatsapp_jid,
        expected_value, expected_close_date, priority, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
      `,
      [
        input.title.trim(),
        input.customerId ?? null,
        customerCode,
        customerDisplayName,
        input.stageId,
        user.id,
        user.name,
        input.whatsappInstanceId ?? null,
        input.whatsappJid ?? null,
        input.expectedValue ?? 0,
        input.expectedCloseDate ?? null,
        input.priority ?? "MEDIUM",
        input.notes ?? "",
      ],
    );

    const dealId = String(insertResult.rows[0].id);

    await client.query(
      `
      INSERT INTO deal_activities (deal_id, activity_type, actor_user_id, actor_name, content, metadata)
      VALUES ($1, 'CREATED', $2, $3, $4, '{}'::jsonb)
      `,
      [dealId, user.id, user.name, `Deal criado: ${input.title.trim()}`],
    );

    await client.query("COMMIT");

    return getDealDetail(dealId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDealDetail(dealId: string): Promise<DealDetail> {
  const [dealResult, activitiesResult] = await Promise.all([
    pool.query(
      `
      SELECT d.*, cs.status AS cs_status
      FROM deals d
      LEFT JOIN customer_snapshot cs ON cs.customer_id = d.customer_id
      WHERE d.id = $1
      `,
      [dealId],
    ),
    pool.query(
      "SELECT * FROM deal_activities WHERE deal_id = $1 ORDER BY created_at DESC LIMIT 50",
      [dealId],
    ),
  ]);

  const row = dealResult.rows[0];
  if (!row) {
    throw new HttpError(404, "Deal nao encontrado.");
  }

  const base = mapDealRow(row);

  return {
    ...base,
    notes: String(row.notes ?? ""),
    lostReason: row.lost_reason ? String(row.lost_reason) : null,
    wonAt: row.won_at ? new Date(String(row.won_at)).toISOString() : null,
    lostAt: row.lost_at ? new Date(String(row.lost_at)).toISOString() : null,
    whatsappJid: row.whatsapp_jid ? String(row.whatsapp_jid) : null,
    activities: activitiesResult.rows.map(mapActivityRow),
  };
}

export async function updateDeal(
  dealId: string,
  input: Partial<CreateDealInput> & { lostReason?: string },
  user: JwtUser,
): Promise<DealDetail> {
  const existing = await pool.query("SELECT id FROM deals WHERE id = $1", [dealId]);
  if (!existing.rows[0]) {
    throw new HttpError(404, "Deal nao encontrado.");
  }

  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  let idx = 1;

  function addSet(col: string, val: unknown) {
    params.push(val);
    sets.push(`${col} = $${idx}`);
    idx++;
  }

  if (input.title !== undefined) addSet("title", input.title.trim());
  if (input.expectedValue !== undefined) addSet("expected_value", input.expectedValue);
  if (input.expectedCloseDate !== undefined) addSet("expected_close_date", input.expectedCloseDate);
  if (input.priority !== undefined) addSet("priority", input.priority);
  if (input.notes !== undefined) addSet("notes", input.notes);
  if (input.whatsappInstanceId !== undefined) addSet("whatsapp_instance_id", input.whatsappInstanceId);
  if (input.whatsappJid !== undefined) addSet("whatsapp_jid", input.whatsappJid);
  if (input.lostReason !== undefined) addSet("lost_reason", input.lostReason);

  params.push(dealId);
  await pool.query(`UPDATE deals SET ${sets.join(", ")} WHERE id = $${idx}`, params);

  return getDealDetail(dealId);
}

export async function moveDealStage(dealId: string, newStageId: string, user: JwtUser): Promise<DealDetail> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const dealResult = await client.query("SELECT stage_id FROM deals WHERE id = $1 FOR UPDATE", [dealId]);
    if (!dealResult.rows[0]) {
      throw new HttpError(404, "Deal nao encontrado.");
    }

    const oldStageId = String(dealResult.rows[0].stage_id);

    const [oldStage, newStage] = await Promise.all([
      client.query("SELECT name, is_won, is_lost FROM pipeline_stages WHERE id = $1", [oldStageId]),
      client.query("SELECT name, is_won, is_lost FROM pipeline_stages WHERE id = $1", [newStageId]),
    ]);

    if (!newStage.rows[0]) {
      throw new HttpError(400, "Estagio destino nao encontrado.");
    }

    const wonAt = newStage.rows[0].is_won ? "NOW()" : "NULL";
    const lostAt = newStage.rows[0].is_lost ? "NOW()" : "NULL";

    await client.query(
      `
      UPDATE deals
      SET stage_id = $1, last_activity_at = NOW(), updated_at = NOW(),
          won_at = ${wonAt}, lost_at = ${lostAt}
      WHERE id = $2
      `,
      [newStageId, dealId],
    );

    const oldName = oldStage.rows[0]?.name ?? "?";
    const newName = newStage.rows[0]?.name ?? "?";

    await client.query(
      `
      INSERT INTO deal_activities (deal_id, activity_type, actor_user_id, actor_name, content, metadata)
      VALUES ($1, 'STAGE_CHANGE', $2, $3, $4, $5::jsonb)
      `,
      [
        dealId,
        user.id,
        user.name,
        `Movido de "${oldName}" para "${newName}"`,
        JSON.stringify({ fromStageId: oldStageId, toStageId: newStageId, fromStageName: oldName, toStageName: newName }),
      ],
    );

    await client.query("COMMIT");

    return getDealDetail(dealId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function addDealActivity(
  dealId: string,
  input: { activityType: DealActivityType; content: string },
  user: JwtUser,
): Promise<DealActivity> {
  const existing = await pool.query("SELECT id FROM deals WHERE id = $1", [dealId]);
  if (!existing.rows[0]) {
    throw new HttpError(404, "Deal nao encontrado.");
  }

  const result = await pool.query(
    `
    INSERT INTO deal_activities (deal_id, activity_type, actor_user_id, actor_name, content)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [dealId, input.activityType, user.id, user.name, input.content],
  );

  await pool.query("UPDATE deals SET last_activity_at = NOW() WHERE id = $1", [dealId]);

  return mapActivityRow(result.rows[0]);
}

// ── WhatsApp Instances ────────────────────────────────────────────

function mapInstanceRow(row: Record<string, unknown>): WhatsappInstanceItem {
  return {
    id: String(row.id),
    instanceName: String(row.instance_name),
    displayLabel: String(row.display_label),
    phoneNumber: row.phone_number ? String(row.phone_number) : null,
    profilePictureUrl: row.profile_picture_url ? String(row.profile_picture_url) : null,
    status: String(row.status ?? "ACTIVE") as WhatsappInstanceItem["status"],
    isDefault: Boolean(row.is_default),
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    assignedUserName: row.assigned_user_name ? String(row.assigned_user_name) : null,
    lastHealthStatus: row.last_health_status ? String(row.last_health_status) : null,
    lastHealthCheckAt: row.last_health_check_at ? new Date(String(row.last_health_check_at)).toISOString() : null,
  };
}

export async function listWhatsappInstances(): Promise<WhatsappInstanceItem[]> {
  const result = await pool.query("SELECT * FROM whatsapp_instances ORDER BY is_default DESC, display_label ASC");
  return result.rows.map(mapInstanceRow);
}

export interface CreateInstanceInput {
  instanceName: string;
  displayLabel: string;
  phoneNumber?: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
  isDefault?: boolean;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
}

export async function createWhatsappInstance(input: CreateInstanceInput): Promise<WhatsappInstanceItem> {
  if (input.isDefault) {
    await pool.query("UPDATE whatsapp_instances SET is_default = false WHERE is_default = true");
  }

  const result = await pool.query(
    `
    INSERT INTO whatsapp_instances (
      instance_name, display_label, phone_number, evolution_base_url, evolution_api_key,
      is_default, assigned_user_id, assigned_user_name
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [
      input.instanceName,
      input.displayLabel,
      input.phoneNumber ?? null,
      input.evolutionBaseUrl,
      input.evolutionApiKey,
      input.isDefault ?? false,
      input.assignedUserId ?? null,
      input.assignedUserName ?? null,
    ],
  );

  const instance = mapInstanceRow(result.rows[0]);

  try {
    logger.info("Automating Evolution API configuration for new instance", { instanceName: instance.instanceName });
    await configureInstanceWebhook({
      instanceName: instance.instanceName,
      evolutionBaseUrl: input.evolutionBaseUrl,
      evolutionApiKey: input.evolutionApiKey,
    });
    await configureInstanceSettings({
      instanceName: instance.instanceName,
      evolutionBaseUrl: input.evolutionBaseUrl,
      evolutionApiKey: input.evolutionApiKey,
    });
    logger.info("Evolution API configuration completed", { instanceName: instance.instanceName });
  } catch (error) {
    logger.error("Failed to automate Evolution API configuration", {
      instanceName: instance.instanceName,
      error: String(error),
    });
    // We don't throw here to avoid failing the whole instance creation if the Evolution API is temporarily down
  }

  return instance;
}

export async function configureWhatsappInstance(id: string): Promise<void> {
  const result = await pool.query("SELECT * FROM whatsapp_instances WHERE id = $1", [id]);
  const row = result.rows[0];
  if (!row) {
    throw new HttpError(404, "Instancia nao encontrada.");
  }

  const instance = mapInstanceRow(row);

  logger.info("Manually triggering Evolution API configuration", { instanceName: instance.instanceName });
  await configureInstanceWebhook({
    instanceName: instance.instanceName,
    evolutionBaseUrl: String(row.evolution_base_url),
    evolutionApiKey: String(row.evolution_api_key),
  });
  await configureInstanceSettings({
    instanceName: instance.instanceName,
    evolutionBaseUrl: String(row.evolution_base_url),
    evolutionApiKey: String(row.evolution_api_key),
  });
  logger.info("Manual Evolution API configuration completed", { instanceName: instance.instanceName });
}

export async function deleteWhatsappInstance(id: string): Promise<void> {
  await pool.query("DELETE FROM whatsapp_instances WHERE id = $1", [id]);
}

export async function getInstanceConfig(instanceId: string) {
  const result = await pool.query(
    "SELECT instance_name, evolution_base_url, evolution_api_key FROM whatsapp_instances WHERE id = $1 AND status = 'ACTIVE'",
    [instanceId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    instanceName: String(row.instance_name),
    baseUrl: String(row.evolution_base_url),
    apiKey: String(row.evolution_api_key),
  };
}
