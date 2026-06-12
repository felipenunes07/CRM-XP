import { pool } from "../../db/client.js";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { configureInstanceWebhook } from "./evolutionService.js";

interface WatchdogInstance {
  id: string;
  instanceName: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
}

interface WatchdogResult {
  checked: number;
  disconnected: string[];
  webhookRepaired: string[];
  failed: string[];
}

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
  return enabled && url === expectedWebhookUrl() && events.includes("MESSAGES_UPSERT");
}

async function recordHealthStatus(instanceId: string, status: string) {
  try {
    await pool.query(
      "UPDATE whatsapp_instances SET last_health_check_at = NOW(), last_health_status = $2 WHERE id = $1",
      [instanceId, status.slice(0, 20)],
    );
  } catch (error) {
    logger.warn("whatsapp watchdog failed to record health status", {
      instanceId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Periodically verifies every active Evolution instance and self-heals the
 * webhook configuration. Message ingestion (heatmap, activity report, monitor)
 * depends entirely on Evolution delivering MESSAGES_UPSERT/SEND_MESSAGE
 * webhooks — if the config is lost on the Evolution side (key rotation,
 * instance recreation, server restore) the whole pipeline silently stops.
 */
export async function runWhatsappWebhookWatchdog(): Promise<WatchdogResult> {
  const result: WatchdogResult = { checked: 0, disconnected: [], webhookRepaired: [], failed: [] };

  const rows = await pool.query(
    `
    SELECT id, instance_name, evolution_base_url, evolution_api_key
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
      evolutionBaseUrl: String(row.evolution_base_url),
      evolutionApiKey: String(row.evolution_api_key),
    };
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
        await recordHealthStatus(instance.id, `DOWN:${state}`);
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

      await recordHealthStatus(instance.id, "OK");
    } catch (error) {
      result.failed.push(instance.instanceName);
      logger.error("whatsapp watchdog check failed", {
        instanceName: instance.instanceName,
        error: error instanceof Error ? error.message : String(error),
      });
      await recordHealthStatus(instance.id, "CHECK_FAILED");
    }
  }

  if (result.disconnected.length || result.webhookRepaired.length || result.failed.length) {
    logger.warn("whatsapp webhook watchdog finished with issues", { ...result });
  } else {
    logger.info("whatsapp webhook watchdog finished", { checked: result.checked });
  }

  return result;
}
