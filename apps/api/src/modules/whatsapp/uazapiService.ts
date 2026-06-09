import { logger } from "../../lib/logger.js";

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
 * Normalize a JID into the value UazAPI expects in the `number` field.
 * - Group JIDs (e.g. "120363...@g.us") MUST be kept intact: stripping the
 *   "@g.us" suffix turns a group id into a bogus phone number and UazAPI
 *   rejects the request with "Bad Request".
 * - Personal JIDs (e.g. "5511999999999@s.whatsapp.net") become the bare
 *   phone number digits.
 */
function stripJidToNumber(jid: string): string {
  const trimmed = (jid ?? "").trim();
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
    number: stripJidToNumber(destinationJid),
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
    number: stripJidToNumber(destinationJid),
    image: imageUrl,
    caption: caption ?? "",
  });
}

export async function sendUazapiCarouselMessage(
  config: UazapiInstanceConfig,
  destinationJid: string,
  carouselSlides: UazapiCarouselSlide[],
) {
  return requestUazapi(config, "/send/carousel", "POST", {
    number: stripJidToNumber(destinationJid),
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
  return requestUazapi(config, "/send/media", "POST", {
    number: stripJidToNumber(destinationJid),
    file: videoUrl,
    type: "video",
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
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : `UazAPI respondeu com status ${response.status}`;

    throw Object.assign(new Error(message), {
      responsePayload: payload,
      statusCode: response.status,
    });
  }

  return payload;
}
