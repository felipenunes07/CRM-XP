import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { formatEvolutionSendTextTarget } from "./whatsappMonitorCore.js";

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
  let mimeTypeStr = "";
  if (mediaBase64.startsWith("data:")) {
    const match = mediaBase64.match(/^data:([^;]+);base64,/);
    if (match && match[1]) {
      mimeTypeStr = match[1];
    }
  }
  if (!mimeTypeStr) {
    if (mediaType === "video") {
      mimeTypeStr = "video/mp4";
    } else if (mediaType === "image") {
      mimeTypeStr = "image/png";
    } else if (mediaType === "audio") {
      mimeTypeStr = "audio/mp3";
    } else {
      mimeTypeStr = "application/octet-stream";
    }
  }

  const defaultFileName = fileName || (mediaType === "video" ? "video.mp4" : mediaType === "image" ? "image.png" : "file");

  // Evolution's `media` field accepts EITHER a public URL OR raw base64 — but
  // NOT a data URL. A value like "data:video/mp4;base64,AAAA..." must have its
  // "data:...;base64," prefix removed, otherwise Evolution fails to decode it
  // and responds with "Bad Request". Plain http(s) URLs are passed through.
  let mediaPayload = mediaBase64;
  if (mediaBase64.startsWith("data:")) {
    const commaIdx = mediaBase64.indexOf(",");
    if (commaIdx !== -1) {
      mediaPayload = mediaBase64.slice(commaIdx + 1);
    }
  }

  const payload: any = {
    number: formatEvolutionSendTextTarget(destinationJid),
    mediatype: mediaType,
    mimetype: mimeTypeStr,
    media: mediaPayload,
    fileName: defaultFileName,
    caption: caption ?? "",
  };

  return requestEvolution(instance.evolutionBaseUrl, instance.evolutionApiKey, `/message/sendMedia/${encodeURIComponent(instance.instanceName)}`, "POST", payload);
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
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : `Evolution API respondeu com status ${response.status}`;

    throw Object.assign(new Error(message), {
      responsePayload: payload,
      statusCode: response.status,
    });
  }

  return payload;
}
