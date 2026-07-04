import { logger } from "../../lib/logger.js";
import { OUTBOUND_VIDEO_FILE_NAME, OUTBOUND_VIDEO_MIME_TYPE, resolveOutboundVideoPayload } from "./whatsappMedia.js";

export interface UazapiInstanceConfig {
  baseUrl: string;
  token: string;
}

export interface UazapiCarouselSlide {
  text: string;
  image: string;
  buttons: { id: string; text: string; type: string }[];
}

export interface UazapiMenuData {
  menuType: "button" | "list" | "poll";
  choices: string[];
  footerText?: string | null;
  listButton?: string | null;
  selectableCount?: number | null;
  imageButton?: string | null;
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

export async function sendUazapiMenuMessage(
  config: UazapiInstanceConfig,
  destinationJid: string,
  messageText: string,
  menu: UazapiMenuData,
) {
  const body: Record<string, unknown> = {
    number: formatUazapiDestination(destinationJid),
    type: menu.menuType,
    text: messageText,
    choices: menu.choices,
  };

  if (menu.footerText?.trim()) {
    body.footerText = menu.footerText.trim();
  }
  if (menu.menuType === "list" && menu.listButton?.trim()) {
    body.listButton = menu.listButton.trim();
  }
  if (menu.menuType === "poll" && menu.selectableCount) {
    body.selectableCount = menu.selectableCount;
  }
  if (menu.menuType === "button" && menu.imageButton?.trim()) {
    body.imageButton = menu.imageButton.trim();
  }

  return requestUazapi(config, "/send/menu", "POST", body);
}

export async function sendUazapiVideoMessage(
  config: UazapiInstanceConfig,
  destinationJid: string,
  videoUrl: string,
  caption?: string,
) {
  const filePayload = await resolveOutboundVideoPayload(videoUrl);

  return requestUazapi(config, "/send/media", "POST", {
    number: formatUazapiDestination(destinationJid),
    text: caption ?? "",
    file: filePayload,
    type: "video",
    mimetype: OUTBOUND_VIDEO_MIME_TYPE,
    filename: OUTBOUND_VIDEO_FILE_NAME,
    caption: caption ?? "",
  });
}

/**
 * Aponta o webhook da instância uazapi para o CRM, para que as respostas dos
 * clientes cheguem em /api/webhooks/uazapi. Sem isso, mensagens recebidas em
 * instâncias uazapi nunca entram no CRM (mini chat e badge "Respondeu" ficam
 * sem dados). uazapi mudou o shape desse endpoint entre versões, então tenta
 * os formatos conhecidos até um aceitar.
 */
export async function configureUazapiWebhook(config: UazapiInstanceConfig, webhookUrl: string) {
  const attempts: Array<{ path: string; method: string; body: Record<string, unknown> }> = [
    {
      path: "/webhook",
      method: "POST",
      body: {
        enabled: true,
        url: webhookUrl,
        events: ["messages"],
        excludeMessages: [],
      },
    },
    {
      path: "/webhook",
      method: "PUT",
      body: {
        enabled: true,
        url: webhookUrl,
        events: ["messages"],
      },
    },
    {
      path: "/instance/updateWebhook",
      method: "POST",
      body: {
        enabled: true,
        url: webhookUrl,
        events: ["messages"],
      },
    },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const result = await requestUazapi(config, attempt.path, attempt.method, attempt.body);
      logger.info("uazapi webhook configured", { path: attempt.path, webhookUrl });
      return { configured: true, via: attempt.path, result };
    } catch (error) {
      lastError = error;
    }
  }

  logger.warn("uazapi webhook configuration failed on all known endpoints", {
    webhookUrl,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  return { configured: false, error: lastError instanceof Error ? lastError.message : String(lastError) };
}

export async function requestUazapi(
  config: UazapiInstanceConfig,
  path: string,
  method: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}${path}`;

  // Em TODOS os envios (/send/*) desligamos a marcação de leitura para NÃO dar
  // "visto"/tique azul nas mensagens do cliente ao disparar ou responder
  // automaticamente — o financeiro usa esse número e não pode marcar como lida.
  // São dois flags da uazapi: readchat (marca a conversa como lida) e
  // readmessages (marca as últimas recebidas como lidas).
  //
  // CRÍTICO: readchat/readmessages=false NÃO bastam. A instância tem um
  // msg_delay (1-3s) que "humaniza" o envio simulando um humano — e simular
  // humano inclui ABRIR/LER o chat antes de digitar. Esse comportamento é da
  // instância e ignora o readchat do envio: por isso o disparo puro (sem
  // resposta automática) ainda marcava as mensagens do cliente como lidas.
  // Forçamos delay:0 em cada envio para pular a humanização por mensagem — o
  // espaçamento anti-ban já é feito pelo CRM (min/max_delay_seconds entre
  // destinatários), então o delay interno da uazapi é redundante. Se um body
  // explicitar delay/readchat/readmessages, o valor do body vence.
  let finalBody = body;
  if (body && typeof body === "object" && !Array.isArray(body) && path.startsWith("/send/")) {
    finalBody = { readchat: false, readmessages: false, delay: 0, ...(body as Record<string, unknown>) };
  }

  logger.info("UazAPI request", { url, method });

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      token: config.token,
    },
    body: finalBody ? JSON.stringify(finalBody) : undefined,
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
