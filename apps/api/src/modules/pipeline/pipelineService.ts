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
import { configureInstanceSettings, configureInstanceWebhook, deleteEvolutionInstance } from "../whatsapp/evolutionService.js";
import { logger } from "../../lib/logger.js";
import { env } from "../../lib/env.js";

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
    provider: (String(row.provider ?? "EVOLUTION")) as WhatsappInstanceItem["provider"],
    status: String(row.status ?? "ACTIVE") as WhatsappInstanceItem["status"],
    isDefault: Boolean(row.is_default),
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    assignedUserName: row.assigned_user_name ? String(row.assigned_user_name) : null,
    lastHealthStatus: row.last_health_status ? String(row.last_health_status) : null,
    lastHealthCheckAt: row.last_health_check_at ? new Date(String(row.last_health_check_at)).toISOString() : null,
  };
}

export async function listWhatsappInstances(): Promise<WhatsappInstanceItem[]> {
  await syncEvolutionInstancesForSelection();
  // Renova fotos vazias/expiradas usando as credenciais de cada instância — é o
  // que garante a foto real do WhatsApp mesmo quando o env Evolution global não
  // cobre essas instâncias.
  await refreshActiveInstanceAvatars();
  const result = await pool.query("SELECT * FROM whatsapp_instances ORDER BY is_default DESC, display_label ASC");
  return result.rows.map(mapInstanceRow);
}

function collectEvolutionInstancePayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.flatMap(collectEvolutionInstancePayload);
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["instances", "data", "response", "result"]) {
      const nested = record[key];
      if (Array.isArray(nested)) {
        return collectEvolutionInstancePayload(nested);
      }
    }
    return [record];
  }
  return [];
}

function pickEvolutionString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readEvolutionInstanceName(record: Record<string, unknown>) {
  const nested = record.instance && typeof record.instance === "object" ? (record.instance as Record<string, unknown>) : {};
  return pickEvolutionString({ ...record, ...nested }, ["instanceName", "name", "instance", "id"]);
}

function phoneFromEvolutionJid(value: string | null) {
  if (!value) return null;
  const [phone] = value.split("@");
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits || null;
}

/**
 * Busca a foto de perfil do PRÓPRIO número conectado da instância, direto na
 * Evolution, usando as credenciais DA INSTÂNCIA (não o env global — cada
 * instância pode apontar para um servidor Evolution diferente). Devolve uma URL
 * fresca, garantindo a imagem real.
 */
async function fetchEvolutionOwnProfilePicture(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  phoneDigits: string,
): Promise<string | null> {
  try {
    const base = baseUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: phoneDigits }),
    });
    if (!res.ok) return null;
    const payload = await res.json().catch(() => null);
    if (!payload || typeof payload !== "object") return null;
    return pickEvolutionString(payload as Record<string, unknown>, [
      "profilePictureUrl",
      "profilePicUrl",
      "pictureUrl",
      "url",
    ]);
  } catch {
    return null;
  }
}

/**
 * Foto do CDN do WhatsApp carrega um `oe=<hex unix>` de expiração. Considera
 * "precisa renovar" quando está vazia ou já expirada (ou prestes a expirar).
 */
function instanceAvatarNeedsRefresh(url: string | null): boolean {
  if (!url) return true;
  const match = url.match(/[?&]oe=([0-9a-fA-F]+)/);
  if (!match) return false;
  const expSeconds = parseInt(match[1] as string, 16);
  if (!Number.isFinite(expSeconds)) return false;
  return expSeconds * 1000 < Date.now() + 60_000;
}

/**
 * Renova a foto de perfil das instâncias Evolution ativas cuja URL está vazia ou
 * expirada, usando as credenciais de cada instância. Roda a cada listagem para
 * que a tela de seleção de remetentes sempre mostre a foto real do WhatsApp.
 */
async function refreshActiveInstanceAvatars() {
  let result;
  try {
    result = await pool.query(
      `
      SELECT id, instance_name, phone_number, evolution_base_url, evolution_api_key, profile_picture_url
      FROM whatsapp_instances
      WHERE status = 'ACTIVE' AND (provider = 'EVOLUTION' OR provider IS NULL)
      `,
    );
  } catch (error) {
    logger.warn("Falha ao listar instâncias para renovar avatar", { error: String(error) });
    return;
  }

  await Promise.all(
    (result.rows ?? []).map(async (row) => {
      const stored = row.profile_picture_url ? String(row.profile_picture_url) : null;
      if (!instanceAvatarNeedsRefresh(stored)) {
        return;
      }

      const baseUrl = (row.evolution_base_url && String(row.evolution_base_url)) || env.EVOLUTION_API_BASE_URL;
      const apiKey = (row.evolution_api_key && String(row.evolution_api_key)) || env.EVOLUTION_API_KEY;
      const phone = row.phone_number ? String(row.phone_number).replace(/\D/g, "") : "";
      if (!baseUrl || !apiKey || !phone) {
        return;
      }

      const fresh = await fetchEvolutionOwnProfilePicture(baseUrl, apiKey, String(row.instance_name), phone);
      if (fresh) {
        await pool.query(
          "UPDATE whatsapp_instances SET profile_picture_url = $2, updated_at = NOW() WHERE id = $1",
          [row.id, fresh],
        );
        logger.info("avatar de instância renovado", { instanceName: String(row.instance_name) });
      } else {
        logger.warn("Evolution não retornou foto para a instância", {
          instanceName: String(row.instance_name),
          phone,
          hadStored: Boolean(stored),
        });
      }
    }),
  );
}

async function syncEvolutionInstancesForSelection() {
  if (!env.EVOLUTION_API_BASE_URL || !env.EVOLUTION_API_KEY) {
    return;
  }

  try {
    const response = await fetch(`${env.EVOLUTION_API_BASE_URL.replace(/\/+$/, "")}/instance/fetchInstances`, {
      headers: { apikey: env.EVOLUTION_API_KEY },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Evolution API respondeu com status ${response.status}`);
    }

    const instances = collectEvolutionInstancePayload(payload);
    for (const raw of instances) {
      const nested = raw.instance && typeof raw.instance === "object" ? (raw.instance as Record<string, unknown>) : {};
      const source = { ...raw, ...nested };
      const instanceName = readEvolutionInstanceName(raw);
      if (!instanceName) {
        continue;
      }

      const displayLabel = pickEvolutionString(source, ["displayName", "profileName", "name"]) ?? instanceName;
      const ownerJid = pickEvolutionString(source, ["ownerJid", "owner", "wuid", "number"]);
      const phoneNumber = phoneFromEvolutionJid(ownerJid);
      // A foto de perfil vem no próprio payload de fetchInstances e é gerada na
      // hora (URL fresca do CDN do WhatsApp). Capturamos e sobrescrevemos sempre
      // que vier, porque a URL antiga EXPIRA (param oe=) e o <img> quebra.
      let profilePictureUrl = pickEvolutionString(source, [
        "profilePicUrl",
        "profilePictureUrl",
        "pictureUrl",
        "profilePic",
        "picture",
        "avatar",
      ]);

      // Fallback: payload sem foto → busca direta o avatar do número conectado.
      if (!profilePictureUrl && phoneNumber) {
        profilePictureUrl = await fetchEvolutionOwnProfilePicture(
          env.EVOLUTION_API_BASE_URL,
          env.EVOLUTION_API_KEY,
          instanceName,
          phoneNumber,
        );
      }

      await pool.query(
        `
        INSERT INTO whatsapp_instances (
          instance_name,
          display_label,
          phone_number,
          evolution_base_url,
          evolution_api_key,
          profile_picture_url,
          status,
          last_health_status,
          last_health_check_at,
          is_default
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 'OK', NOW(), false)
        ON CONFLICT (instance_name) DO UPDATE SET
          display_label = COALESCE(NULLIF(whatsapp_instances.display_label, ''), EXCLUDED.display_label),
          phone_number = COALESCE(NULLIF(whatsapp_instances.phone_number, ''), EXCLUDED.phone_number),
          evolution_base_url = EXCLUDED.evolution_base_url,
          evolution_api_key = EXCLUDED.evolution_api_key,
          profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, whatsapp_instances.profile_picture_url),
          status = CASE WHEN whatsapp_instances.status = 'DISCONNECTED' THEN 'ACTIVE' ELSE whatsapp_instances.status END,
          last_health_status = 'OK',
          last_health_check_at = NOW(),
          updated_at = NOW()
        `,
        [instanceName, displayLabel, phoneNumber, env.EVOLUTION_API_BASE_URL, env.EVOLUTION_API_KEY, profilePictureUrl],
      );
    }
  } catch (error) {
    logger.warn("Nao foi possivel sincronizar instancias da Evolution para selecao", { error: String(error) });
  }
}

export interface CreateInstanceInput {
  provider?: "EVOLUTION" | "UAZAPI";
  instanceName: string;
  displayLabel: string;
  phoneNumber?: string;
  evolutionBaseUrl?: string;
  evolutionApiKey?: string;
  uazapiBaseUrl?: string;
  uazapiToken?: string;
  isDefault?: boolean;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
}

export async function createWhatsappInstance(input: CreateInstanceInput): Promise<WhatsappInstanceItem> {
  if (input.isDefault) {
    await pool.query("UPDATE whatsapp_instances SET is_default = false WHERE is_default = true");
  }

  const provider = input.provider ?? "EVOLUTION";

  const result = await pool.query(
    `
    INSERT INTO whatsapp_instances (
      instance_name, display_label, phone_number, evolution_base_url, evolution_api_key,
      provider, uazapi_base_url, uazapi_token,
      is_default, assigned_user_id, assigned_user_name
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
    `,
    [
      input.instanceName,
      input.displayLabel,
      input.phoneNumber ?? null,
      input.evolutionBaseUrl ?? "",
      input.evolutionApiKey ?? "",
      provider,
      input.uazapiBaseUrl ?? null,
      input.uazapiToken ?? null,
      input.isDefault ?? false,
      input.assignedUserId ?? null,
      input.assignedUserName ?? null,
    ],
  );

  const instance = mapInstanceRow(result.rows[0]);

  // Only configure Evolution API for EVOLUTION provider instances
  if (provider === "EVOLUTION" && input.evolutionBaseUrl && input.evolutionApiKey) {
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
    }
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
  const result = await pool.query(
    "SELECT instance_name, evolution_base_url, evolution_api_key FROM whatsapp_instances WHERE id = $1",
    [id],
  );
  
  const row = result.rows[0];
  if (row) {
    const instanceName = String(row.instance_name);
    const evolutionBaseUrl = String(row.evolution_base_url);
    const evolutionApiKey = String(row.evolution_api_key);
    
    logger.info("Deleting WhatsApp connection", { id, instanceName });
    
    // 1. Delete the instance from Evolution API to stop webhooks
    await deleteEvolutionInstance({
      instanceName,
      evolutionBaseUrl,
      evolutionApiKey,
    });
    
    // 2. Delete the database row from whatsapp_instances
    await pool.query("DELETE FROM whatsapp_instances WHERE id = $1", [id]);
    
    // 3. Clean up associated incoming messages
    await pool.query("DELETE FROM whatsapp_incoming_messages WHERE LOWER(instance_name) = LOWER($1)", [instanceName]);
    
    // 4. Clean up associated chat profiles and participant profiles
    await pool.query("DELETE FROM whatsapp_chat_profiles WHERE LOWER(instance_name) = LOWER($1)", [instanceName]);
    await pool.query("DELETE FROM whatsapp_participant_profiles WHERE LOWER(instance_name) = LOWER($1)", [instanceName]);
    
    // 5. Clean up associated deal activities
    await pool.query(
      `
      DELETE FROM deal_activities 
      WHERE activity_type IN ('WHATSAPP_SENT', 'WHATSAPP_RECEIVED')
        AND LOWER(metadata ->> 'instance') = LOWER($1)
      `,
      [instanceName],
    );
    
    // 6. Clean up empty auto-created pipeline deals that now have no activities
    await pool.query(
      `
      DELETE FROM deals 
      WHERE whatsapp_instance_id IS NULL 
        AND whatsapp_jid IS NOT NULL 
        AND NOT EXISTS (
          SELECT 1 FROM deal_activities WHERE deal_id = deals.id
        )
      `
    );
    
    logger.info("WhatsApp connection and all associated chats, messages, and profiles successfully removed", { instanceName });
  }
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
