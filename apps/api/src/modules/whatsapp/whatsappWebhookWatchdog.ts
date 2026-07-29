import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { configureInstanceWebhook, sendWhatsappInstanceTextMessage } from "./evolutionService.js";
import { sendUazapiTextMessage } from "./uazapiService.js";
import { isWhatsappMessageIngestionExcludedInstance } from "./whatsappInstancePolicy.js";

interface WatchdogInstance {
  id: string;
  instanceName: string;
  displayLabel: string;
  phoneNumber: string | null;
  messagesEnabled: boolean;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
}

interface WatchdogResult {
  checked: number;
  disconnected: string[];
  alertsSent: string[];
  webhookRepaired: string[];
  failed: string[];
}

interface ConnectionStateInstance {
  id: string;
  instanceName: string;
  displayLabel: string;
  phoneNumber: string | null;
}

const DISCONNECT_ALERT_CURSOR_PREFIX = "whatsapp_disconnect_alert:";
const STALE_ALERT_CLAIM_MINUTES = 5;

function expectedWebhookUrl() {
  const baseUrl = (env.PUBLIC_URL || "https://xpcrm-crm-backend.f0dgeg.easypanel.host").replace(/\/+$/, "");
  return `${baseUrl}/api/webhooks/evolution`;
}

async function requestEvolutionJson(
  instance: WatchdogInstance,
  path: string,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${instance.evolutionBaseUrl.replace(/\/+$/, "")}${path}`, {
      headers: { apikey: instance.evolutionApiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    return (await response.json().catch(() => null)) as Record<string, unknown> | null;
  } finally {
    clearTimeout(timeout);
  }
}

function readConnectionState(payload: Record<string, unknown> | null): string {
  if (!payload) {
    return "unknown";
  }
  const instance = payload.instance as Record<string, unknown> | undefined;
  return String(instance?.state ?? payload.state ?? "unknown");
}

function webhookConfigIsHealthy(payload: Record<string, unknown> | null): boolean {
  if (!payload) {
    return false;
  }
  // Evolution v2 returns the config flat; some versions nest it under `webhook`.
  const config = (payload.webhook as Record<string, unknown> | undefined) ?? payload;
  const enabled = config.enabled === true;
  const url = String(config.url ?? "");
  const events = Array.isArray(config.events) ? config.events.map(String) : [];
  return (
    enabled &&
    url === expectedWebhookUrl() &&
    events.includes("MESSAGES_UPSERT") &&
    events.includes("CONNECTION_UPDATE")
  );
}

function disconnectAlertCursorKey(instanceId: string) {
  return `${DISCONNECT_ALERT_CURSOR_PREFIX}${instanceId}`;
}

function formatAlertPhone(value: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return value?.trim() ?? "";
}

function buildDisconnectAlertMessage(instance: ConnectionStateInstance) {
  const formattedPhone = formatAlertPhone(instance.phoneNumber);
  const phone = formattedPhone ? ` — ${formattedPhone}` : "";
  return [
    "🚨 *WhatsApp desconectado*",
    `*${instance.displayLabel || instance.instanceName}${phone}*`,
  ].join("\n");
}

async function claimDisconnectAlert(instanceId: string): Promise<string | null> {
  const claimToken = `PENDING:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const claimed = await pool.query(
    `
      INSERT INTO sync_cursors (key, cursor_value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET cursor_value = EXCLUDED.cursor_value, updated_at = NOW()
      WHERE sync_cursors.cursor_value LIKE 'PENDING:%'
        AND sync_cursors.updated_at < NOW() - ($3::int * INTERVAL '1 minute')
      RETURNING key
    `,
    [disconnectAlertCursorKey(instanceId), claimToken, STALE_ALERT_CLAIM_MINUTES],
  );
  return claimed.rowCount ? claimToken : null;
}

async function completeDisconnectAlert(instanceId: string, claimToken: string) {
  await pool.query(
    `
      UPDATE sync_cursors
      SET cursor_value = $3, updated_at = NOW()
      WHERE key = $1 AND cursor_value = $2
    `,
    [disconnectAlertCursorKey(instanceId), claimToken, `SENT:${new Date().toISOString()}`],
  );
}

async function releaseDisconnectAlertClaim(instanceId: string, claimToken: string) {
  await pool.query(
    "DELETE FROM sync_cursors WHERE key = $1 AND cursor_value = $2",
    [disconnectAlertCursorKey(instanceId), claimToken],
  );
}

async function clearDisconnectAlert(instanceId: string) {
  await pool.query("DELETE FROM sync_cursors WHERE key = $1", [disconnectAlertCursorKey(instanceId)]);
}

async function sendDisconnectAlert(
  disconnectedInstance: ConnectionStateInstance,
): Promise<boolean> {
  if (!env.WHATSAPP_DISCONNECT_ALERT_ENABLED) {
    return false;
  }

  const groupJid = (
    env.WHATSAPP_DISCONNECT_ALERT_GROUP_JID || "120363025402961504@g.us"
  ).trim();
  if (!groupJid) {
    logger.warn("whatsapp disconnect alert has no destination group configured", {
      instanceName: disconnectedInstance.instanceName,
    });
    return false;
  }

  const claimToken = await claimDisconnectAlert(disconnectedInstance.id);
  if (!claimToken) {
    return false;
  }

  try {
    const preferredSenderId = (env.WHATSAPP_DISCONNECT_ALERT_INSTANCE_ID || "").trim();
    const candidates = await pool.query(
      `
        SELECT id, provider, instance_name, display_label,
               evolution_base_url, evolution_api_key, uazapi_base_url, uazapi_token
        FROM whatsapp_instances
        WHERE status = 'ACTIVE'
          AND id <> $1
          AND COALESCE(last_health_status, 'OK') NOT LIKE 'DOWN:%'
          AND COALESCE(last_health_status, 'OK') <> 'CHECK_FAILED'
          AND (
            (
              COALESCE(provider, 'EVOLUTION') = 'UAZAPI'
              AND COALESCE(uazapi_base_url, '') <> ''
              AND COALESCE(uazapi_token, '') <> ''
            )
            OR (
              COALESCE(provider, 'EVOLUTION') = 'EVOLUTION'
              AND COALESCE(evolution_base_url, '') <> ''
              AND COALESCE(evolution_api_key, '') <> ''
            )
          )
        ORDER BY
          (id::text = $2) DESC,
          (COALESCE(provider, 'EVOLUTION') = 'UAZAPI') DESC,
          is_default DESC,
          created_at ASC
      `,
      [disconnectedInstance.id, preferredSenderId],
    );

    const message = buildDisconnectAlertMessage(disconnectedInstance);
    let lastError: unknown = null;

    for (const candidate of candidates.rows) {
      try {
        if (String(candidate.provider ?? "EVOLUTION") === "UAZAPI") {
          await sendUazapiTextMessage(
            {
              baseUrl: String(candidate.uazapi_base_url),
              token: String(candidate.uazapi_token),
            },
            groupJid,
            message,
          );
        } else {
          await sendWhatsappInstanceTextMessage(
            {
              instanceName: String(candidate.instance_name),
              evolutionBaseUrl: String(candidate.evolution_base_url),
              evolutionApiKey: String(candidate.evolution_api_key),
            },
            groupJid,
            message,
          );
        }

        await completeDisconnectAlert(disconnectedInstance.id, claimToken);
        logger.info("whatsapp disconnect alert sent", {
          disconnectedInstance: disconnectedInstance.instanceName,
          senderInstance: String(candidate.instance_name),
          destination: groupJid,
        });
        return true;
      } catch (error) {
        lastError = error;
        logger.warn("whatsapp disconnect alert sender failed; trying next instance", {
          disconnectedInstance: disconnectedInstance.instanceName,
          senderInstance: String(candidate.instance_name),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw lastError ?? new Error("Nenhuma outra instancia conectada disponivel para enviar o alerta.");
  } catch (error) {
    await releaseDisconnectAlertClaim(disconnectedInstance.id, claimToken).catch(() => undefined);
    logger.error("whatsapp disconnect alert was not sent; it will retry", {
      instanceName: disconnectedInstance.instanceName,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function recordHealthStatus(instance: ConnectionStateInstance, status: string) {
  try {
    await pool.query(
      "UPDATE whatsapp_instances SET last_health_check_at = NOW(), last_health_status = $2 WHERE id = $1",
      [instance.id, status.slice(0, 20)],
    );
    if (status === "OK") {
      await clearDisconnectAlert(instance.id);
    }
  } catch (error) {
    logger.warn("whatsapp watchdog failed to record health status", {
      instanceId: instance.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Fast path used by Evolution's CONNECTION_UPDATE webhook. The minute-by-minute
 * watchdog remains as a fallback when the provider does not deliver the event.
 */
export async function handleEvolutionConnectionUpdate(
  instanceName: string,
  state: string,
): Promise<{ processed: boolean; alertSent: boolean }> {
  const normalizedState = state.trim().toLowerCase();
  if (!instanceName || !normalizedState) {
    return { processed: false, alertSent: false };
  }

  const lookup = await pool.query(
    `
      SELECT id, instance_name, display_label, phone_number
      FROM whatsapp_instances
      WHERE LOWER(instance_name) = LOWER($1)
        AND status = 'ACTIVE'
        AND COALESCE(provider, 'EVOLUTION') = 'EVOLUTION'
      LIMIT 1
    `,
    [instanceName],
  );
  const row = lookup.rows[0];
  if (!row) {
    return { processed: false, alertSent: false };
  }

  const instance: ConnectionStateInstance = {
    id: String(row.id),
    instanceName: String(row.instance_name),
    displayLabel: String(row.display_label ?? row.instance_name),
    phoneNumber: row.phone_number ? String(row.phone_number) : null,
  };

  if (normalizedState === "open") {
    await recordHealthStatus(instance, "OK");
    return { processed: true, alertSent: false };
  }

  // "connecting" is emitted during normal QR reconnection and startup. Alerting
  // here would create a false alarm exactly while someone is repairing a line.
  const disconnectedStates = new Set(["close", "closed", "disconnected", "logout", "logged_out"]);
  if (!disconnectedStates.has(normalizedState)) {
    logger.info("whatsapp connection update has no terminal state; watchdog will confirm", {
      instanceName,
      state: normalizedState,
    });
    return { processed: true, alertSent: false };
  }

  await recordHealthStatus(instance, `DOWN:${normalizedState}`);
  const alertSent = await sendDisconnectAlert(instance);
  return { processed: true, alertSent };
}

/**
 * Periodically verifies every active Evolution instance and self-heals the
 * webhook configuration. Message ingestion (heatmap, activity report, monitor)
 * depends entirely on Evolution delivering MESSAGES_UPSERT/SEND_MESSAGE
 * webhooks — if the config is lost on the Evolution side (key rotation,
 * instance recreation, server restore) the whole pipeline silently stops.
 */
export async function runWhatsappWebhookWatchdog(): Promise<WatchdogResult> {
  const result: WatchdogResult = {
    checked: 0,
    disconnected: [],
    alertsSent: [],
    webhookRepaired: [],
    failed: [],
  };

  const rows = await pool.query(
    `
    SELECT id, instance_name, display_label, phone_number, messages_enabled,
           evolution_base_url, evolution_api_key
    FROM whatsapp_instances
    WHERE status = 'ACTIVE'
      AND COALESCE(provider, 'EVOLUTION') = 'EVOLUTION'
      AND COALESCE(evolution_base_url, '') <> ''
      AND COALESCE(evolution_api_key, '') <> ''
    `,
  );

  for (const row of rows.rows) {
    const instance: WatchdogInstance = {
      id: String(row.id),
      instanceName: String(row.instance_name),
      displayLabel: String(row.display_label ?? row.instance_name),
      phoneNumber: row.phone_number ? String(row.phone_number) : null,
      messagesEnabled: row.messages_enabled !== false,
      evolutionBaseUrl: String(row.evolution_base_url),
      evolutionApiKey: String(row.evolution_api_key),
    };

    if (isWhatsappMessageIngestionExcludedInstance(instance)) {
      logger.info("whatsapp webhook watchdog skipped send-only instance", {
        instanceName: instance.instanceName,
      });
      continue;
    }

    result.checked += 1;

    try {
      const statePayload = await requestEvolutionJson(
        instance,
        `/instance/connectionState/${encodeURIComponent(instance.instanceName)}`,
      );
      const state = readConnectionState(statePayload);

      if (state !== "open") {
        // Disconnected from WhatsApp (logged out / QR expired). Cannot be fixed
        // automatically — requires re-scanning the QR code in Evolution Manager.
        result.disconnected.push(instance.instanceName);
        logger.error("whatsapp instance disconnected — message ingestion stopped", {
          instanceName: instance.instanceName,
          state,
          action: "Reconecte a instancia escaneando o QR code no Evolution Manager.",
        });
        await recordHealthStatus(instance, `DOWN:${state}`);
        if (await sendDisconnectAlert(instance)) {
          result.alertsSent.push(instance.instanceName);
        }
        continue;
      }

      const webhookPayload = await requestEvolutionJson(
        instance,
        `/webhook/find/${encodeURIComponent(instance.instanceName)}`,
      ).catch(() => null);

      if (!webhookConfigIsHealthy(webhookPayload)) {
        logger.warn("whatsapp webhook config missing or wrong — reapplying", {
          instanceName: instance.instanceName,
          expectedUrl: expectedWebhookUrl(),
          found: webhookPayload,
        });
        await configureInstanceWebhook(instance);
        result.webhookRepaired.push(instance.instanceName);
      }

      await recordHealthStatus(instance, "OK");
    } catch (error) {
      result.failed.push(instance.instanceName);
      logger.error("whatsapp watchdog check failed", {
        instanceName: instance.instanceName,
        error: error instanceof Error ? error.message : String(error),
      });
      await recordHealthStatus(instance, "CHECK_FAILED");
    }
  }

  if (result.disconnected.length || result.webhookRepaired.length || result.failed.length) {
    logger.warn("whatsapp webhook watchdog finished with issues", { ...result });
  } else {
    logger.info("whatsapp webhook watchdog finished", { checked: result.checked });
  }

  return result;
}
