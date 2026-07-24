import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { formatEvolutionSendTextTarget } from "./whatsappMonitorCore.js";
import { getOutboundMediaFileName, getOutboundMediaMimeType, resolveOutboundVideoPayload } from "./whatsappMedia.js";

export interface EvolutionInstanceConfig {
  instanceName: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
}

export interface EvolutionMessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

export function ensureEvolutionConfigured() {
  if (!env.EVOLUTION_API_BASE_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE_NAME) {
    throw new Error("Evolution API nao configurada. Defina EVOLUTION_API_BASE_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME.");
  }
}

function buildEvolutionUrl(path: string) {
  return `${env.EVOLUTION_API_BASE_URL.replace(/\/+$/, "")}${path}`;
}

export async function sendWhatsappTextMessage(destinationJid: string, messageText: string) {
  ensureEvolutionConfigured();

  return sendWhatsappInstanceTextMessage(
    {
      instanceName: env.EVOLUTION_INSTANCE_NAME,
      evolutionBaseUrl: env.EVOLUTION_API_BASE_URL,
      evolutionApiKey: env.EVOLUTION_API_KEY,
    },
    destinationJid,
    messageText,
  );
}

export async function sendWhatsappInstanceTextMessage(
  instance: EvolutionInstanceConfig,
  destinationJid: string,
  messageText: string,
) {
  return requestEvolution(instance.evolutionBaseUrl, instance.evolutionApiKey, `/message/sendText/${encodeURIComponent(instance.instanceName)}`, "POST", {
    number: formatEvolutionSendTextTarget(destinationJid),
    text: messageText,
    linkPreview: true,
  });
}

export async function sendWhatsappInstanceMediaMessage(
  instance: EvolutionInstanceConfig,
  destinationJid: string,
  mediaBase64: string,
  mediaType: "image" | "video" | "audio" | "document",
  fileName?: string,
  caption?: string,
) {
  const resolvedMedia = mediaType === "video" ? await resolveOutboundVideoPayload(mediaBase64) : mediaBase64;
  const mimeTypeStr = getOutboundMediaMimeType(resolvedMedia, mediaType);
  const defaultFileName = getOutboundMediaFileName(mediaType, fileName);
  const number = formatEvolutionSendTextTarget(destinationJid);

  // Evolution's `media` field accepts EITHER a public URL OR raw base64 — but
  // NOT a data URL. A value like "data:video/mp4;base64,AAAA..." must have its
  // "data:...;base64," prefix removed, otherwise Evolution responds "Bad Request".
  // Plain http(s) URLs are passed through unchanged.
  let mediaPayloadValue = resolvedMedia;
  if (resolvedMedia.startsWith("data:")) {
    const commaIdx = resolvedMedia.indexOf(",");
    if (commaIdx !== -1) {
      mediaPayloadValue = resolvedMedia.slice(commaIdx + 1);
    }
  }

  const payload = {
    number,
    mediatype: mediaType,
    mimetype: mimeTypeStr,
    media: mediaPayloadValue,
    fileName: defaultFileName,
    caption: caption ?? "",
  };

  try {
    return await requestEvolution(instance.evolutionBaseUrl, instance.evolutionApiKey, `/message/sendMedia/${encodeURIComponent(instance.instanceName)}`, "POST", payload);
  } catch (error) {
    if (!shouldRetryEvolutionLegacyMediaPayload(error)) {
      throw error;
    }

    logger.warn("Evolution sendMedia v2 payload rejected; retrying legacy mediaMessage payload", {
      instanceName: instance.instanceName,
      statusCode: (error as { statusCode?: unknown }).statusCode,
      error: error instanceof Error ? error.message : String(error),
    });

    return requestEvolution(instance.evolutionBaseUrl, instance.evolutionApiKey, `/message/sendMedia/${encodeURIComponent(instance.instanceName)}`, "POST", {
      number,
      mediaMessage: {
        mediaType,
        mimetype: mimeTypeStr,
        fileName: defaultFileName,
        caption: caption ?? "",
        media: mediaPayloadValue,
      },
      options: {
        delay: 0,
        presence: "composing",
      },
    });
  }
}

export async function markWhatsappMessagesAsRead(instance: EvolutionInstanceConfig, readMessages: EvolutionMessageKey[]) {
  if (!readMessages.length) {
    return null;
  }

  return requestEvolution(instance.evolutionBaseUrl, instance.evolutionApiKey, `/chat/markMessageAsRead/${encodeURIComponent(instance.instanceName)}`, "POST", {
    readMessages,
  });
}

export async function markWhatsappChatAsUnread(instance: EvolutionInstanceConfig, chat: string, lastMessage: EvolutionMessageKey | null) {
  if (!lastMessage) {
    return null;
  }

  return requestEvolution(instance.evolutionBaseUrl, instance.evolutionApiKey, `/chat/markChatUnread/${encodeURIComponent(instance.instanceName)}`, "POST", {
    lastMessage: [lastMessage],
    chat,
  });
}

export async function configureInstanceWebhook(instance: {
  instanceName: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
}) {
  const baseUrl = (env.PUBLIC_URL || "https://xpcrm-crm-backend.f0dgeg.easypanel.host").replace(/\/+$/, "");
  const webhookUrl = `${baseUrl}/api/webhooks/evolution`;

  return requestEvolution(instance.evolutionBaseUrl, instance.evolutionApiKey, `/webhook/set/${encodeURIComponent(instance.instanceName)}`, "POST", {
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: ["MESSAGES_UPSERT", "SEND_MESSAGE"],
    },
  });
}

export async function disableInstanceWebhook(instance: {
  instanceName: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
}) {
  const baseUrl = (env.PUBLIC_URL || "https://xpcrm-crm-backend.f0dgeg.easypanel.host").replace(/\/+$/, "");
  const webhookUrl = `${baseUrl}/api/webhooks/evolution`;

  return requestEvolution(instance.evolutionBaseUrl, instance.evolutionApiKey, `/webhook/set/${encodeURIComponent(instance.instanceName)}`, "POST", {
    webhook: {
      enabled: false,
      url: webhookUrl,
      byEvents: false,
      base64: true,
      events: [],
    },
  });
}

export async function configureInstanceSettings(instance: {
  instanceName: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
}) {
  return requestEvolution(instance.evolutionBaseUrl, instance.evolutionApiKey, `/settings/set/${encodeURIComponent(instance.instanceName)}`, "POST", {
    rejectCall: false,
    groupsIgnore: false,
    alwaysOnline: false,
    readMessages: false,
    readStatus: false,
    syncFullHistory: false,
  });
}

export async function deleteEvolutionInstance(instance: {
  instanceName: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
}) {
  try {
    return await requestEvolution(
      instance.evolutionBaseUrl,
      instance.evolutionApiKey,
      `/instance/delete/${encodeURIComponent(instance.instanceName)}`,
      "DELETE"
    );
  } catch (error) {
    logger.warn("Failed to delete instance from Evolution API, it might not exist", {
      instanceName: instance.instanceName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface EvolutionConnectResult {
  /** Connection state reported by Evolution: "open", "connecting", "close", ... */
  state: string;
  /** Data-URL ready QR image (when a new scan is required). */
  base64: string | null;
  /** Numeric pairing code (alternative to scanning the QR). */
  pairingCode: string | null;
  /** Raw QR payload string. */
  code: string | null;
}

function pickEvolutionField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Reads the live WhatsApp connection state of an instance straight from
 * Evolution. Returns one of Evolution's states ("open" = connected) or
 * "unknown" when the shape is unexpected.
 */
export async function fetchEvolutionConnectionState(instance: {
  instanceName: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
}): Promise<string> {
  const payload = await requestEvolution(
    instance.evolutionBaseUrl,
    instance.evolutionApiKey,
    `/instance/connectionState/${encodeURIComponent(instance.instanceName)}`,
    "GET",
  );
  const nested = (payload.instance as Record<string, unknown> | undefined) ?? undefined;
  return String(nested?.state ?? payload.state ?? "unknown");
}

/**
 * Triggers a (re)connection on Evolution and returns the QR code / pairing code
 * needed to re-pair the WhatsApp session. When Evolution reports the session as
 * already open it returns no QR (state = "open").
 */
export async function connectEvolutionInstance(instance: {
  instanceName: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
}): Promise<EvolutionConnectResult> {
  const payload = await requestEvolution(
    instance.evolutionBaseUrl,
    instance.evolutionApiKey,
    `/instance/connect/${encodeURIComponent(instance.instanceName)}`,
    "GET",
  );

  // Different Evolution versions return the QR either flat or nested under `qrcode`.
  const nested = (payload.qrcode as Record<string, unknown> | undefined) ?? payload;

  const base64Raw = pickEvolutionField(nested, ["base64"]) ?? pickEvolutionField(payload, ["base64"]);
  const base64 = base64Raw
    ? base64Raw.startsWith("data:")
      ? base64Raw
      : `data:image/png;base64,${base64Raw}`
    : null;

  const code = pickEvolutionField(nested, ["code"]) ?? pickEvolutionField(payload, ["code"]);
  const pairingCode = pickEvolutionField(nested, ["pairingCode"]) ?? pickEvolutionField(payload, ["pairingCode"]);
  const state =
    pickEvolutionField(payload, ["state"]) ??
    pickEvolutionField(nested, ["state"]) ??
    (base64 || code || pairingCode ? "connecting" : "unknown");

  return { state, base64, pairingCode, code };
}

async function requestEvolution(baseUrl: string, apiKey: string, path: string, method: string, body?: any) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      apikey: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const message = extractEvolutionErrorMessage(payload, response.status);

    throw Object.assign(new Error(message), {
      responsePayload: payload,
      statusCode: response.status,
    });
  }

  return payload;
}

function collectProviderMessages(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectProviderMessages(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      ...collectProviderMessages(record.message),
      ...collectProviderMessages(record.error),
      ...collectProviderMessages(record.details),
      ...collectProviderMessages(record.response),
    ];
  }

  return [];
}

function extractEvolutionErrorMessage(payload: Record<string, unknown>, status: number) {
  const messages = collectProviderMessages(payload);
  const specificMessages = messages.filter((message) => !/^bad request$/i.test(message));
  const selected = specificMessages.length ? specificMessages : messages;
  const unique = Array.from(new Set(selected));
  return unique.slice(0, 3).join("; ") || `Evolution API respondeu com status ${status}`;
}

function shouldRetryEvolutionLegacyMediaPayload(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const statusCode = Number((error as { statusCode?: unknown }).statusCode);
  if (statusCode !== 400) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/session|sessao|not found|not.*group|not.*participant|forbidden|unauthorized|permission|permiss/i.test(message)) {
    return false;
  }

  return (
    /^bad request$/i.test(message) ||
    /mediaMessage|required property|requires property|property.*media|mediatype|mimetype|fileName/i.test(message)
  );
}
