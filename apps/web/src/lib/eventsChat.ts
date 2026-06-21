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
