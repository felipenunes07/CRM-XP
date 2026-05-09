import { env } from "../../lib/env.js";
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
  const baseUrl = (env.PUBLIC_URL || "https://headline-delays-strengths-hazards.trycloudflare.com").replace(/\/+$/, "");
  const webhookUrl = `${baseUrl}/api/webhooks/evolution`;

  return requestEvolution(instance.evolutionBaseUrl, instance.evolutionApiKey, `/webhook/instance/set/${encodeURIComponent(instance.instanceName)}`, "POST", {
    enabled: true,
    url: webhookUrl,
    webhook_by_events: false,
    webhook_base64: false,
    events: [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "SEND_MESSAGE",
      "CONNECTION_UPDATE",
    ],
  });
}

export async function configureInstanceSettings(instance: {
  instanceName: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
}) {
  return requestEvolution(instance.evolutionBaseUrl, instance.evolutionApiKey, `/settings/instance/set/${encodeURIComponent(instance.instanceName)}`, "POST", {
    reject_call: false,
    msg_call: "",
    groups_ignore: false,
    always_online: true,
    read_messages: true,
    read_status: true,
    sync_full_history: false,
  });
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
