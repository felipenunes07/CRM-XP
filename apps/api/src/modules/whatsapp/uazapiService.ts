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
 * Strip JID suffix to get a plain phone number for UazAPI.
 * E.g. "5511999999999@s.whatsapp.net" → "5511999999999"
 */
function stripJidToNumber(jid: string): string {
  const [num] = jid.split("@");
  return (num ?? jid).replace(/\D/g, "");
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
  assertSupportedOutboundVideo(videoUrl);

  return requestUazapi(config, "/send/media", "POST", {
    number: stripJidToNumber(destinationJid),
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
    signal: AbortSignal.timeout(30000),
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
