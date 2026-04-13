import { env } from "../../lib/env.js";

function ensureEvolutionConfigured() {
  if (!env.EVOLUTION_API_BASE_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE_NAME) {
    throw new Error("Evolution API nao configurada. Defina EVOLUTION_API_BASE_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE_NAME.");
  }
}

function buildEvolutionUrl(path: string) {
  return `${env.EVOLUTION_API_BASE_URL.replace(/\/+$/, "")}${path}`;
}

export async function sendWhatsappTextMessage(destinationJid: string, messageText: string) {
  ensureEvolutionConfigured();

  const response = await fetch(buildEvolutionUrl(`/message/sendText/${encodeURIComponent(env.EVOLUTION_INSTANCE_NAME)}`), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: env.EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      number: destinationJid,
      text: messageText,
      linkPreview: true,
    }),
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
