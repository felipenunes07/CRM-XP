import type { EventSeverity, WhatsappMonitorMessage } from "@olist-crm/shared";
import type { MiniChatMessage } from "../components/MiniChatDrawer";

export interface EventConversationSeed {
  dealId: string;
  eventId?: string;
  messageId?: string;
  content: string;
  detectedAt: string;
  contactName: string;
  contactPhone?: string;
  agentName?: string | null;
  isGroup?: boolean;
  severity?: EventSeverity;
  label?: string;
  reason?: string | null;
}

export interface BuildEventChatMessagesInput {
  seed: EventConversationSeed;
  monitorMessages: WhatsappMonitorMessage[];
}

function metadataString(metadata: Record<string, unknown> | undefined, keys: string[]) {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function defaultMimeType(mediaType: string | null) {
  if (mediaType === "image") return "image/jpeg";
  if (mediaType === "audio") return "audio/ogg; codecs=opus";
  if (mediaType === "video") return "video/mp4";
  return "application/octet-stream";
}

/**
 * Extrai a midia (audio/imagem/video) do metadata da mensagem do monitor —
 * mesmo formato usado pela pagina /mensagens (mediaBase64 por ~30d, depois
 * degrada para mediaUrl).
 */
function messageMedia(metadata: Record<string, unknown> | undefined): MiniChatMessage["media"] {
  const mediaType = metadataString(metadata, ["mediaType", "mediatype"]);
  if (!mediaType) return undefined;

  const mimeType = metadataString(metadata, ["mimeType", "mimetype"]);
  const mediaUrl = metadataString(metadata, ["mediaUrl", "url"]);
  const mediaBase64 = metadataString(metadata, ["mediaBase64", "base64", "media"]);
  const fileName = metadataString(metadata, ["fileName", "filename", "mediaName"]);

  let src = mediaUrl;
  if (mediaBase64) {
    const cleanBase64 = mediaBase64.replace(/\s/g, "");
    if (cleanBase64.startsWith("data:")) {
      src = cleanBase64;
    } else {
      let finalMimeType = mimeType ?? defaultMimeType(mediaType);
      if (finalMimeType === "audio/ogg") {
        finalMimeType = "audio/ogg; codecs=opus";
      }
      src = `data:${finalMimeType};base64,${cleanBase64}`;
    }
  }

  if (!src) return undefined;
  return { type: mediaType, src, fileName };
}

function normalizeComparableText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function isSameCapturedMessage(message: WhatsappMonitorMessage, seed: EventConversationSeed) {
  if (seed.messageId && message.id === seed.messageId) {
    return true;
  }

  const sameContent = normalizeComparableText(message.content) === normalizeComparableText(seed.content);
  if (!sameContent) {
    return false;
  }

  const messageTime = new Date(message.createdAt).getTime();
  const eventTime = new Date(seed.detectedAt).getTime();
  return Number.isFinite(messageTime) && Number.isFinite(eventTime) && Math.abs(messageTime - eventTime) <= 5 * 60 * 1000;
}

function highlightForSeed(seed: EventConversationSeed): MiniChatMessage["highlight"] {
  if (!seed.severity && !seed.label && !seed.reason) {
    return undefined;
  }

  return {
    severity: seed.severity ?? "LOW",
    label: seed.label ?? "Evento capturado",
    reason: seed.reason ?? null,
  };
}

function fallbackMessage(seed: EventConversationSeed): MiniChatMessage {
  return {
    id: `event-${seed.eventId ?? seed.messageId ?? seed.dealId}-${seed.detectedAt}`,
    content: seed.content,
    direction: "INBOUND",
    timestamp: seed.detectedAt,
    senderName: seed.contactName,
    highlight: highlightForSeed(seed),
  };
}

export function buildEventChatMessages({ seed, monitorMessages }: BuildEventChatMessagesInput): MiniChatMessage[] {
  const highlight = highlightForSeed(seed);
  let capturedFound = false;

  const mappedMessages = [...monitorMessages]
    .filter((message) => message.direction !== "SYSTEM" && message.content.trim())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((message) => {
      const isCaptured = isSameCapturedMessage(message, seed);
      capturedFound = capturedFound || isCaptured;

      return {
        id: message.id,
        content: message.content,
        direction: message.direction === "OUTBOUND" ? "OUTBOUND" as const : "INBOUND" as const,
        timestamp: message.createdAt,
        senderName: message.senderName,
        senderAvatarUrl: message.senderProfilePictureUrl,
        media: messageMedia(message.metadata),
        highlight: isCaptured ? highlight : undefined,
      };
    });

  if (mappedMessages.length === 0) {
    return [fallbackMessage(seed)];
  }

  if (!capturedFound && highlight) {
    return [...mappedMessages, fallbackMessage(seed)]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  return mappedMessages;
}
