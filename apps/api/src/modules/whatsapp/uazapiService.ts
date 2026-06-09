import { logger } from "../../lib/logger.js";
import { OUTBOUND_VIDEO_FILE_NAME, OUTBOUND_VIDEO_MIME_TYPE, assertSupportedOutboundVideo } from "./whatsappMedia.js";

export interface UazapiInstanceConfig {
  baseUrl: string;
  token: string;
}

export interface UazapiCarouselSlide {
  text: string;
  image: string;
  buttons: { id: string; text: string; type: string }[];
}

/**
 * Uazapi accepts group chat IDs as-is, while user JIDs are converted to phone numbers.
 * E.g. "5511999999999@s.whatsapp.net" → "5511999999999"
 */
function formatUazapiDestination(jid: string): string {
  const trimmed = jid.trim();
  if (trimmed.endsWith("@g.us")) {
    return trimmed;
  }

  const [num] = trimmed.split("@");
  return (num ?? trimmed).replace(/\D/g, "");
}

export async function sendUazapiTextMessage(
  config: UazapiInstanceConfig,
  destinationJid: string,
  messageText: string,
) {
  return requestUazapi(config, "/send/text", "POST", {
    number: formatUazapiDestination(destinationJid),
    text: messageText,
  });
}

export async function sendUazapiImageMessage(
  config: UazapiInstanceConfig,
  destinationJid: string,
  imageUrl: string,
  caption?: string,
) {
  return requestUazapi(config, "/send/image", "POST", {
    number: formatUazapiDestination(destinationJid),
    image: imageUrl,
    text: caption ?? "",
    caption: caption ?? "",
  });
}

export async function sendUazapiCarouselMessage(
  config: UazapiInstanceConfig,
  destinationJid: string,
  carouselSlides: UazapiCarouselSlide[],
) {
  return requestUazapi(config, "/send/carousel", "POST", {
    number: formatUazapiDestination(destinationJid),
    carousel: carouselSlides.map((slide) => ({
      text: slide.text,
      image: slide.image,
      buttons: slide.buttons.map((btn) => ({
        id: btn.id,
        text: btn.text,
        type: btn.type,
      })),
    })),
    mentions: "all",
  });
}

export async function sendUazapiVideoMessage(
  config: UazapiInstanceConfig,
  destinationJid: string,
  videoUrl: string,
  caption?: string,
) {
  assertSupportedOutboundVideo(videoUrl);

  return requestUazapi(config, "/send/media", "POST", {
    number: formatUazapiDestination(destinationJid),
    text: caption ?? "",
    file: videoUrl,
    type: "video",
    mimetype: OUTBOUND_VIDEO_MIME_TYPE,
    filename: OUTBOUND_VIDEO_FILE_NAME,
    caption: caption ?? "",
  });
}

export async function requestUazapi(
  config: UazapiInstanceConfig,
  path: string,
  method: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}${path}`;

  logger.info("UazAPI request", { url, method });

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      token: config.token,
    },
    body: body ? JSON.stringify(body) : undefined,
    // 30s era insuficiente para enviar vídeo (o upload do base64 + processamento
    // no provedor passava disso e abortava com "operation was aborted due to timeout").
    signal: AbortSignal.timeout(120000),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const message = extractUazapiErrorMessage(payload, response.status);

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

function extractUazapiErrorMessage(payload: Record<string, unknown>, status: number) {
  const messages = collectProviderMessages(payload);
  const specificMessages = messages.filter((message) => !/^bad request$/i.test(message));
  const selected = specificMessages.length ? specificMessages : messages;
  const unique = Array.from(new Set(selected));
  return unique.slice(0, 3).join("; ") || `UazAPI respondeu com status ${status}`;
}
