import { type FormEvent, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MessageTemplate,
  WhatsappMonitorAgent,
  WhatsappMonitorConversation,
  WhatsappMonitorConversationDetail,
  WhatsappMonitorConversationsResponse,
  WhatsappMonitorMessage,
} from "@olist-crm/shared";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Contact,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Menu,
  MoreVertical,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api, API_BASE_URL } from "../lib/api";
import { healthInfo } from "../lib/whatsappHealth";
import { buildMessageTimelineItems, isNearChatTop } from "./messagesPage.helpers";
import { PhoneLoadingScreen } from "../components/PhoneLoadingScreen";

const brokenWhatsappAvatarUrls = new Set<string>();

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function riskTone(message: WhatsappMonitorMessage | WhatsappMonitorConversation) {
  if (!message.risk) {
    return "";
  }

  return message.risk.severity.toLocaleLowerCase("pt-BR");
}

function attachmentName(message: WhatsappMonitorMessage) {
  const directName = message.metadata.fileName ?? message.metadata.filename ?? message.metadata.mediaName;
  return typeof directName === "string" ? directName : null;
}

type GroupFilter = "all" | "groups" | "contacts";
type PeriodFilter = "all" | "today" | "yesterday" | "7d" | "30d";
type StatusFilter = "all" | "unread" | "risk";
type AgentInteractionFilter = "all" | "sent";

interface ConversationFilterState {
  search: string;
  contactName: string;
  contactPhone: string;
  period: PeriodFilter;
  status: StatusFilter;
  group: GroupFilter;
  agentInteraction: AgentInteractionFilter;
}

// Shared by the live query AND the hover-prefetch so a prefetched page lands on
// the exact cache key the click will read — making the click feel instant.
function conversationsQueryKey(agentId: string, f: ConversationFilterState) {
  return [
    "whatsapp-monitor-conversations",
    agentId,
    f.search,
    f.contactName,
    f.contactPhone,
    f.period,
    f.status,
    f.group,
    f.agentInteraction,
  ] as const;
}

function buildConversationFilters(agentId: string, f: ConversationFilterState) {
  const instanceId = agentId === "all" ? undefined : agentId;
  return {
    instanceId,
    search: f.search || undefined,
    contactName: f.contactName || undefined,
    contactPhone: f.contactPhone || undefined,
    period: f.period === "all" ? undefined : f.period,
    status: f.status === "all" ? undefined : f.status,
    group: f.group === "all" ? undefined : f.group,
    agentInteraction: instanceId && f.agentInteraction === "sent" ? ("sent" as const) : undefined,
  };
}

function metadataString(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function metadataRecord(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mediaLabel(mediaType: string | null) {
  if (mediaType === "image") return "Imagem recebida";
  if (mediaType === "audio") return "Audio recebido";
  if (mediaType === "video") return "Video recebido";
  if (mediaType === "document") return "Documento recebido";
  return "Arquivo recebido";
}

function defaultMimeType(mediaType: string | null) {
  if (mediaType === "image") return "image/jpeg";
  if (mediaType === "audio") return "audio/ogg; codecs=opus";
  if (mediaType === "video") return "video/mp4";
  return "application/octet-stream";
}

function buildMediaSrc(mediaType: string | null, mimeType: string | null, mediaUrl: string | null, mediaBase64: string | null) {
  if (!mediaBase64) {
    return mediaUrl;
  }

  // Remove any whitespace, newlines, carriage returns, or tabs from the base64 string
  const cleanBase64 = mediaBase64.replace(/\s/g, "");

  if (cleanBase64.startsWith("data:")) {
    return cleanBase64;
  }

  let finalMimeType = mimeType ?? defaultMimeType(mediaType);
  if (finalMimeType === "audio/ogg") {
    finalMimeType = "audio/ogg; codecs=opus";
  }

  return `data:${finalMimeType};base64,${cleanBase64}`;
}

function messageMedia(message: WhatsappMonitorMessage) {
  const mediaType = metadataString(message.metadata, ["mediaType", "mediatype"]);
  if (!mediaType) {
    return null;
  }

  const mimeType = metadataString(message.metadata, ["mimeType", "mimetype"]);
  const mediaUrl = metadataString(message.metadata, ["mediaUrl", "url"]);
  const mediaBase64 = metadataString(message.metadata, ["mediaBase64", "base64", "media"]);
  const fileName = metadataString(message.metadata, ["fileName", "filename", "mediaName"]);

  return {
    mediaType,
    mimeType,
    mediaUrl,
    mediaBase64,
    fileName,
    src: buildMediaSrc(mediaType, mimeType, mediaUrl, mediaBase64),
  };
}

function messageContact(message: WhatsappMonitorMessage) {
  const contact = metadataRecord(message.metadata, "contact");
  if (!contact) {
    return null;
  }

  const displayName = metadataString(contact, ["displayName", "fullName", "name"]);
  const phoneNumber = metadataString(contact, ["phoneNumber", "phone", "waid", "jid"]);

  if (!displayName && !phoneNumber) {
    return null;
  }

  return { displayName, phoneNumber };
}

function isMediaPlaceholder(content: string) {
  if (/^\[Contato\]$/i.test(content.trim())) {
    return true;
  }

  return /^\[(Imagem|Video|Vídeo|Audio|Áudio|Sticker|Documento)\]$/i.test(content.trim());
}

const CONVERSATION_REFRESH_MS = 120000; // 2 min (SSE fallback)
const CHAT_REFRESH_MS = 60000;          // 1 min (SSE fallback)
const MONITOR_DATA_STALE_MS = 2 * 60 * 1000;
const AGENTS_REFRESH_MS = 60 * 1000;
const TEMPLATES_STALE_MS = 10 * 60 * 1000;
const QUERY_CACHE_MS = 30 * 60 * 1000;
const UNKNOWN_CONVERSATION_INVALIDATE_MS = 10 * 1000;

function conversationSortValue(conversation: WhatsappMonitorConversation) {
  const parsed = Date.parse(conversation.lastMessageAt ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortConversationsByActivity(
  a: WhatsappMonitorConversation,
  b: WhatsappMonitorConversation,
) {
  const dateDiff = conversationSortValue(b) - conversationSortValue(a);
  return dateDiff || b.id.localeCompare(a.id);
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="whatsapp-search">
      <Search size={18} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function AgentAvatar({
  name,
  alert,
  imageUrl,
  group,
}: {
  name: string;
  alert?: boolean;
  imageUrl?: string | null;
  group?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(() => Boolean(imageUrl && brokenWhatsappAvatarUrls.has(imageUrl)));

  useEffect(() => {
    setImageFailed(Boolean(imageUrl && brokenWhatsappAvatarUrls.has(imageUrl)));
  }, [imageUrl]);

  const visibleImageUrl = imageUrl && !imageFailed ? imageUrl : undefined;

  return (
    <span className="wa-avatar">
      {visibleImageUrl ? (
        <img
          src={visibleImageUrl}
          alt=""
          loading="lazy"
          onError={(event) => {
            if (imageUrl) {
              brokenWhatsappAvatarUrls.add(imageUrl);
            }
            event.currentTarget.style.display = "none";
            setImageFailed(true);
          }}
        />
      ) : null}
      <span className="wa-avatar-fallback">{group ? <Users size={18} /> : initials(name) || "WA"}</span>
      {alert ? <span className="wa-avatar-dot" /> : null}
    </span>
  );
}

const AgentRow = memo(function AgentRow({
  agent,
  active,
  onSelect,
}: {
  agent: WhatsappMonitorAgent;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const health = agent.provider === "EVOLUTION" ? healthInfo(agent) : null;

  return (
    <button
      type="button"
      className={`wa-list-row ${active ? "active" : ""} ${health?.down ? "is-down" : ""}`}
      onClick={() => onSelect(agent.id)}
    >
      <AgentAvatar
        name={agent.displayLabel}
        imageUrl={agent.profilePictureUrl}
        alert={agent.riskCount > 0}
      />
      <span className="wa-list-copy">
        <strong>{agent.displayLabel}</strong>
        <small>{health?.down ? health.label : agent.phoneNumber || agent.instanceName}</small>
      </span>
      {health ? (
        <span className={`wa-status-dot wa-health-${health.tone}`} title={health.title} />
      ) : (
        <span
          className={`wa-status-dot wa-status-${agent.status.toLocaleLowerCase("pt-BR")}`}
          title="Status da conexão"
        />
      )}
    </button>
  );
});

const ConversationRow = memo(function ConversationRow({
  conversation,
  active,
  onSelect,
  onPrefetch,
}: {
  conversation: WhatsappMonitorConversation;
  active: boolean;
  onSelect: (id: string) => void;
  onPrefetch?: (id: string) => void;
}) {
  const hoverTimer = useRef<number | null>(null);

  const startHover = () => {
    if (!onPrefetch || hoverTimer.current !== null) {
      return;
    }
    // Wait for the pointer to rest so sweeping the mouse over the list doesn't
    // fire a burst of prefetches.
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      onPrefetch(conversation.id);
    }, 140);
  };

  const endHover = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  useEffect(() => endHover, []);

  return (
    <button
      type="button"
      className={`wa-list-row conversation ${active ? "active" : ""} ${conversation.isUnread ? "unread" : ""}`}
      onClick={() => onSelect(conversation.id)}
      onMouseEnter={startHover}
      onMouseLeave={endHover}
      onFocus={() => onPrefetch?.(conversation.id)}
    >
      <AgentAvatar
        name={conversation.contactName}
        imageUrl={conversation.profilePictureUrl}
        group={conversation.isGroup}
        alert={Boolean(conversation.risk)}
      />
      <span className="wa-list-copy">
        <strong>{conversation.contactName}</strong>
        <small>{conversation.lastMessage || "Sem mensagens registradas"}</small>
      </span>
      <span className="wa-list-meta">
        <time>{formatTime(conversation.lastMessageAt)}</time>
        {conversation.unreadCount > 0 ? (
          <span className="wa-unread-badge">{conversation.unreadCount}</span>
        ) : conversation.risk ? (
          <AlertTriangle size={14} className={`risk-icon ${riskTone(conversation)}`} />
        ) : (
          <CheckCheck size={14} />
        )}
      </span>
    </button>
  );
});

const ChatMessageBubble = memo(function ChatMessageBubble({ message, showSender, onImageClick }: { message: WhatsappMonitorMessage; showSender: boolean; onImageClick?: (url: string) => void }) {
  const media = messageMedia(message);
  const contact = messageContact(message);
  const fileName = media?.fileName ?? attachmentName(message);
  const direction = message.direction.toLocaleLowerCase("pt-BR");
  const senderLabel = message.senderName || message.senderJid || "Participante";
  const showText = Boolean(message.content.trim()) && !((media || contact) && isMediaPlaceholder(message.content));
  const hasVisualMedia = Boolean(media?.src && ["image", "audio", "video"].includes(media.mediaType));
  const AttachmentIcon = media?.mediaType === "audio" ? FileAudio : media?.mediaType === "video" ? FileVideo : media?.mediaType === "document" ? FileText : FileImage;

  return (
    <div className={`wa-message-row ${direction} ${showSender ? "with-sender" : ""}`}>
      {showSender ? (
        <AgentAvatar name={senderLabel} imageUrl={message.senderProfilePictureUrl} />
      ) : null}
      <div className="wa-message-stack">
        {showSender ? <span className="wa-message-sender">{senderLabel}</span> : null}
        <div className={`wa-bubble ${direction} ${message.risk ? "has-risk" : ""}`}>
          {showText ? <p>{message.content}</p> : null}
          {contact ? (
            <div className="wa-contact-card">
              <Contact size={19} />
              <div>
                <strong>{contact.displayName ?? "Contato recebido"}</strong>
                {contact.phoneNumber ? <span>{contact.phoneNumber}</span> : null}
              </div>
            </div>
          ) : null}
          {media?.mediaType === "image" && media.src ? (
            <img
              className="wa-media-image"
              src={media.src}
              alt={fileName ?? "Imagem recebida"}
              loading="lazy"
              onClick={() => onImageClick?.(media.src!)}
            />
          ) : null}
          {media?.mediaType === "audio" && media.src ? (
            <audio className="wa-media-audio" controls preload="metadata" src={media.src} />
          ) : null}
          {media?.mediaType === "video" && media.src ? (
            <video className="wa-media-video" controls preload="metadata" src={media.src} />
          ) : null}
          {(fileName || media) && !hasVisualMedia && media?.src ? (
            <a className="wa-attachment" href={media.src} download={fileName ?? mediaLabel(media.mediaType)}>
              <AttachmentIcon size={18} />
              <div>
                <strong>{fileName ?? mediaLabel(media.mediaType)}</strong>
                <span>{mediaLabel(media.mediaType)}</span>
              </div>
            </a>
          ) : null}
          {(fileName || media) && !hasVisualMedia && !media?.src ? (
            <div className="wa-attachment">
              <AttachmentIcon size={18} />
              <div>
                <strong>{fileName ?? mediaLabel(media?.mediaType ?? null)}</strong>
                <span>{mediaLabel(media?.mediaType ?? null)}</span>
              </div>
            </div>
          ) : null}
          <time>{formatTime(message.createdAt)}</time>
        </div>
        {message.risk ? (
          <div className="wa-risk-row">
            <span className={`wa-risk-chip ${riskTone(message)}`}>
              <AlertTriangle size={14} />
              {message.risk.label}
            </span>
            <span className="wa-risk-chip neutral">
              <ShieldCheck size={14} />
              {message.risk.severity === "HIGH" ? "Alto" : message.risk.severity === "MODERATE" ? "Moderado" : "Baixo"}
            </span>
            <span className="wa-risk-chip neutral">
              <Check size={14} />
              Novo evento
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
});

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result.split(",")[1] ?? "");
      } else {
        resolve("");
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function detectMediaType(file: File): "image" | "video" | "audio" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

function ConversationSkeletonRow() {
  return (
    <div className="conversation-skeleton-row">
      <div className="conversation-skeleton-avatar"></div>
      <div className="conversation-skeleton-copy">
        <div className="conversation-skeleton-line title"></div>
        <div className="conversation-skeleton-line subtitle"></div>
      </div>
      <div className="conversation-skeleton-line time"></div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: "1rem" }}>
      <div className="chat-skeleton-bubble inbound" style={{ width: "45%" }}>
        <div className="chat-skeleton-line" style={{ width: "80%" }}></div>
        <div className="chat-skeleton-line" style={{ width: "60%" }}></div>
      </div>
      <div className="chat-skeleton-bubble outbound" style={{ width: "50%" }}>
        <div className="chat-skeleton-line" style={{ width: "90%" }}></div>
        <div className="chat-skeleton-line" style={{ width: "70%" }}></div>
      </div>
      <div className="chat-skeleton-bubble inbound" style={{ width: "60%" }}>
        <div className="chat-skeleton-line" style={{ width: "85%" }}></div>
        <div className="chat-skeleton-line" style={{ width: "95%" }}></div>
        <div className="chat-skeleton-line" style={{ width: "40%" }}></div>
      </div>
    </div>
  );
}

export function MessagesPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const urlDealId = searchParams.get("dealId");

  const [activeAgentId, setActiveAgentIdRaw] = useState<string>("all");
  const [showInitialLoader, setShowInitialLoader] = useState(true);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  // When switching agents, clear the selected conversation so no chat is pre-selected.
  // Clicking the already-active agent toggles back to "all" (every conversation),
  // since the explicit "Todos os agentes" row was removed.
  // Stable identity so memoized AgentRow children don't re-render on every keystroke.
  const setActiveAgentId = useCallback((id: string) => {
    setActiveAgentIdRaw((current) => (current === id ? "all" : id));
    setSelectedConversationId(null);
  }, []);
  const [agentSearch, setAgentSearch] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [debouncedConversationSearch, setDebouncedConversationSearch] = useState("");
  const [contactNameFilter, setContactNameFilter] = useState("");
  const [contactPhoneFilter, setContactPhoneFilter] = useState("");
  const [debouncedContactNameFilter, setDebouncedContactNameFilter] = useState("");
  const [debouncedContactPhoneFilter, setDebouncedContactPhoneFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [agentInteractionFilter, setAgentInteractionFilter] = useState<AgentInteractionFilter>("all");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(urlDealId);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [activeTemplateIndex, setActiveTemplateIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  // PERF: invalidating the whole conversation list on every SSE message forced
  // a refetch of every loaded page per incoming message. Instead we patch the
  // cached list in place (bump preview + unread, move to top) and only fall
  // back to a debounced invalidate when the conversation isn't cached yet.
  const listInvalidateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!token) return;

    const base = API_BASE_URL.replace(/\/+$/, "");
    const es = new EventSource(`${base}/api/whatsapp-monitor/stream?token=${encodeURIComponent(token)}`);
    let listRefreshPending = false;
    let detailRefreshPending = false;
    const isPageHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    const refreshPendingOnVisibility = () => {
      if (isPageHidden()) {
        return;
      }
      if (listRefreshPending) {
        listRefreshPending = false;
        void queryClient.invalidateQueries({
          queryKey: ["whatsapp-monitor-conversations"],
          refetchType: "active",
        });
      }
      if (detailRefreshPending) {
        detailRefreshPending = false;
        const selectedId = selectedConversationIdRef.current;
        if (selectedId) {
          void queryClient.invalidateQueries({
            queryKey: ["whatsapp-monitor-conversation", selectedId],
            refetchType: "active",
          });
        }
      }
    };
    document.addEventListener("visibilitychange", refreshPendingOnVisibility);

    const scheduleListInvalidate = () => {
      if (isPageHidden()) {
        listRefreshPending = true;
        void queryClient.invalidateQueries({
          queryKey: ["whatsapp-monitor-conversations"],
          refetchType: "none",
        });
        return;
      }
      if (listInvalidateTimerRef.current !== null) {
        return;
      }
      listInvalidateTimerRef.current = window.setTimeout(() => {
        listInvalidateTimerRef.current = null;
        if (isPageHidden()) {
          listRefreshPending = true;
          void queryClient.invalidateQueries({
            queryKey: ["whatsapp-monitor-conversations"],
            refetchType: "none",
          });
          return;
        }
        void queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"], refetchType: "active" });
      }, UNKNOWN_CONVERSATION_INVALIDATE_MS);
    };

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          dealId: string;
          messageId: string;
          direction: "INBOUND" | "OUTBOUND";
          fromMe: boolean;
          senderName: string | null;
          content: string;
          createdAt: string;
        };

        if (msg.dealId === selectedConversationIdRef.current) {
          const pageHidden = isPageHidden();
          if (pageHidden) {
            detailRefreshPending = true;
          }
          void queryClient.invalidateQueries({
            queryKey: ["whatsapp-monitor-conversation", msg.dealId],
            refetchType: pageHidden ? "none" : "active",
          });
        }

        let patchedExisting = false;
        queryClient.setQueriesData({ queryKey: ["whatsapp-monitor-conversations"] }, (old: any) => {
          if (!old?.pages?.length) {
            return old;
          }

          let target: WhatsappMonitorConversation | null = null;
          for (const page of old.pages) {
            const match = page.conversations.find((c: WhatsappMonitorConversation) => c.id === msg.dealId);
            if (match) {
              target = match;
              break;
            }
          }

          if (!target) {
            return old;
          }

          patchedExisting = true;
          const isSelected = msg.dealId === selectedConversationIdRef.current;
          const updated: WhatsappMonitorConversation = {
            ...target,
            lastMessage: msg.content || target.lastMessage,
            lastMessageAt: msg.createdAt,
            ...(msg.direction === "INBOUND" && !isSelected
              ? { unreadCount: target.unreadCount + 1, isUnread: true }
              : {}),
          };

          const pages = old.pages.map((page: WhatsappMonitorConversationsResponse, index: number) => {
            const remaining = page.conversations.filter((c) => c.id !== msg.dealId);
            return index === 0
              ? { ...page, conversations: [updated, ...remaining].sort(sortConversationsByActivity) }
              : { ...page, conversations: remaining };
          });

          return { ...old, pages };
        });

        if (!patchedExisting) {
          scheduleListInvalidate();
        }
      } catch (err) {
        console.error("Error parsing SSE data", err);
      }
    };

    es.onerror = () => {
      // EventSource reconecta sozinho
    };

    return () => {
      document.removeEventListener("visibilitychange", refreshPendingOnVisibility);
      es.close();
      if (listInvalidateTimerRef.current !== null) {
        window.clearTimeout(listInvalidateTimerRef.current);
        listInvalidateTimerRef.current = null;
      }
    };
  }, [token, queryClient]);

  const showShortcuts = replyText.startsWith("/");
  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => api.messageTemplates(token!),
    enabled: Boolean(token && selectedConversationId && showShortcuts),
    staleTime: TEMPLATES_STALE_MS,
    gcTime: QUERY_CACHE_MS,
  });

  const templates = templatesQuery.data ?? [];
  const shortcutSearch = showShortcuts ? replyText.slice(1).toLowerCase() : "";

  const filteredTemplates = useMemo(() => {
    if (!showShortcuts) return [];
    if (!shortcutSearch) return templates;
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(shortcutSearch) ||
        t.content.toLowerCase().includes(shortcutSearch) ||
        (t.category && t.category.toLowerCase().includes(shortcutSearch))
    );
  }, [showShortcuts, shortcutSearch, templates]);

  useEffect(() => {
    setActiveTemplateIndex(0);
  }, [filteredTemplates.length]);

  const selectTemplate = (content: string) => {
    setReplyText(content);
    setActiveTemplateIndex(0);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const lastScrolledConversationRef = useRef<string | null>(null);
  const conversationSyncSinceRef = useRef<string | null>(null);
  const conversationsEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  // Set when we load OLDER messages so the scroll-to-bottom effect doesn't yank
  // the user back down after a prepend.
  const skipBottomScrollRef = useRef(false);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedConversationSearch(conversationSearch);
    }, 400);
    return () => clearTimeout(handler);
  }, [conversationSearch]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedContactNameFilter(contactNameFilter);
      setDebouncedContactPhoneFilter(contactPhoneFilter);
    }, 400);
    return () => clearTimeout(handler);
  }, [contactNameFilter, contactPhoneFilter]);

  const agentsQuery = useQuery({
    queryKey: ["whatsapp-monitor-agents"],
    queryFn: ({ signal }) => api.whatsappMonitorAgents(token!, { includeStats: false, signal }),
    enabled: Boolean(token),
    refetchOnWindowFocus: false,
    staleTime: AGENTS_REFRESH_MS,
    gcTime: QUERY_CACHE_MS,
    // Mantém a bolinha de status da conexão fresca na aba mais usada.
    refetchInterval: AGENTS_REFRESH_MS,
  });

  const filterState = useMemo<ConversationFilterState>(
    () => ({
      search: debouncedConversationSearch,
      contactName: debouncedContactNameFilter,
      contactPhone: debouncedContactPhoneFilter,
      period: periodFilter,
      status: statusFilter,
      group: groupFilter,
      agentInteraction: agentInteractionFilter,
    }),
    [
      debouncedConversationSearch,
      debouncedContactNameFilter,
      debouncedContactPhoneFilter,
      periodFilter,
      statusFilter,
      groupFilter,
      agentInteractionFilter,
    ],
  );

  const conversationQueryKey = useMemo(
    () => conversationsQueryKey(activeAgentId, filterState),
    [activeAgentId, filterState],
  );

  const conversationFilters = useMemo(
    () => buildConversationFilters(activeAgentId, filterState),
    [activeAgentId, filterState],
  );

  const conversationsQuery = useInfiniteQuery({
    queryKey: conversationQueryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.whatsappMonitorConversations(token!, {
        ...conversationFilters,
        limit: 25,
        cursor: pageParam ?? undefined,
      }, { signal }),
    getNextPageParam: (lastPage) => lastPage.pageInfo.hasNextPage ? (lastPage.pageInfo.nextCursor ?? undefined) : undefined,
    enabled: Boolean(token),
    // NOTE: no keepPreviousData here. It kept the previous agent's (or a stale
    // prefetched) list on screen while the new one loaded, which could surface
    // stale conversations after switching agents. A brief skeleton avoids ever
    // showing the wrong agent's list while the requested one loads.
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    staleTime: MONITOR_DATA_STALE_MS,
    gcTime: QUERY_CACHE_MS,
  });

  useEffect(() => {
    conversationSyncSinceRef.current = null;
  }, [conversationQueryKey]);

  useEffect(() => {
    if (conversationsQuery.dataUpdatedAt && !conversationSyncSinceRef.current) {
      conversationSyncSinceRef.current = new Date(Math.max(conversationsQuery.dataUpdatedAt - 1000, 0)).toISOString();
    }
  }, [conversationsQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!token || !conversationsQuery.data) {
      return;
    }

    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      const updatedSince = conversationSyncSinceRef.current;
      if (!updatedSince) {
        return;
      }

      const requestStartedAt = new Date(Date.now() - 1000).toISOString();
      api.whatsappMonitorConversations(token, {
        ...conversationFilters,
        limit: 100,
        updatedSince,
      }).then((updatedPage) => {
        conversationSyncSinceRef.current = requestStartedAt;

        if (!updatedPage.conversations.length) {
          return;
        }

        queryClient.setQueryData(conversationQueryKey, (old: any) => {
          if (!old?.pages?.length) {
            return { pages: [updatedPage], pageParams: [null] };
          }

          const promotedIds = new Set(updatedPage.conversations.map((conversation) => conversation.id));
          const pages = old.pages.map((page: WhatsappMonitorConversationsResponse) => ({
            ...page,
            conversations: page.conversations.filter((conversation) => !promotedIds.has(conversation.id)),
          }));
          const firstPage = pages[0] ?? updatedPage;
          const seen = new Set<string>();
          const promotedConversations = [...updatedPage.conversations].sort(sortConversationsByActivity);
          const mergedFirstPage = [...promotedConversations, ...firstPage.conversations]
            .sort(sortConversationsByActivity)
            .filter((conversation) => {
              if (seen.has(conversation.id)) {
                return false;
              }
              seen.add(conversation.id);
              return true;
            });

          return {
            ...old,
            pages: [
              {
                ...firstPage,
                conversations: mergedFirstPage,
              },
              ...pages.slice(1),
            ],
          };
        });

        if (updatedPage.pageInfo.hasNextPage) {
          queryClient.invalidateQueries({ queryKey: conversationQueryKey });
        }
      }).catch(() => undefined);
    }, CONVERSATION_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [conversationFilters, conversationQueryKey, conversationsQuery.data, queryClient, token]);

  const agents = agentsQuery.data ?? [];
  const conversations = useMemo(() => {
    const flat = conversationsQuery.data?.pages.flatMap((page) => page.conversations) ?? [];
    // Safety net for the SQL dedup: with row-based cursor pagination a contact
    // that owns multiple linked deals (LID/PN) can resurface on a later page.
    // Collapse by canonical remoteJid (fallback to id) so the UI never shows a
    // chat twice regardless of how pages line up.
    const seen = new Set<string>();
    const deduped: WhatsappMonitorConversation[] = [];
    for (const conversation of flat) {
      const key = (conversation.remoteJid ?? conversation.id).toLocaleLowerCase("pt-BR");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(conversation);
    }
    return deduped;
  }, [conversationsQuery.data]);

  // Auto-load older conversations when the end of the list scrolls into view.
  const {
    hasNextPage: hasMoreConversations,
    isFetchingNextPage: isFetchingMoreConversations,
    fetchNextPage: fetchMoreConversations,
  } = conversationsQuery;

  useEffect(() => {
    const sentinel = conversationsEndRef.current;
    if (!sentinel || !hasMoreConversations || isFetchingMoreConversations) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void fetchMoreConversations();
      }
    }, { rootMargin: "240px" });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [conversations.length, fetchMoreConversations, hasMoreConversations, isFetchingMoreConversations]);
  const activeAgent = activeAgentId === "all" ? null : agents.find((agent) => agent.id === activeAgentId) ?? null;
  // The agent selection only narrows which conversations appear in the LIST.
  // When a conversation is opened we always show the FULL customer thread, not
  // just the selected agent's slice — otherwise a customer who talked to several
  // agents would show only a fragment under each one (the rest looks "missing").
  // The backend still supports instance-scoped detail reads; we just don't ask
  // for them here.
  const detailInstanceId: string | undefined = undefined;


  // Hover-prefetch: warm the chat detail when the pointer rests on a row.
  const prefetchConversationDetail = useCallback(
    (conversationId: string) => {
      if (!token) {
        return;
      }
      void queryClient.prefetchInfiniteQuery({
        queryKey: ["whatsapp-monitor-conversation", conversationId, detailInstanceId ?? "all"],
        queryFn: ({ pageParam, signal }) =>
          api.whatsappMonitorConversation(token, conversationId, {
            instanceId: detailInstanceId,
            limit: 20,
            before: (pageParam as string | null) ?? undefined,
          }, { signal }),
        initialPageParam: null as string | null,
        getNextPageParam: (lastPage: WhatsappMonitorConversationDetail) =>
          lastPage.pageInfo.hasPreviousPage ? (lastPage.pageInfo.previousCursor ?? undefined) : undefined,
        staleTime: MONITOR_DATA_STALE_MS,
        gcTime: QUERY_CACHE_MS,
      });
    },
    [token, queryClient, detailInstanceId],
  );

  useEffect(() => {
    if (activeAgentId === "all") {
      setAgentInteractionFilter("all");
    }
  }, [activeAgentId]);

  const filteredConversations = useMemo(() => {
    let result = conversations;

    if (groupFilter === "groups") {
      return result.filter((conversation) => conversation.isGroup);
    }

    if (groupFilter === "contacts") {
      return result.filter((conversation) => !conversation.isGroup);
    }

    return result;
  }, [conversations, groupFilter]);

  const visibleAgents = useMemo(() => {
    const normalized = agentSearch.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) {
      return agents;
    }

    return agents.filter((agent) =>
      `${agent.displayLabel} ${agent.phoneNumber ?? ""} ${agent.instanceName}`.toLocaleLowerCase("pt-BR").includes(normalized),
    );
  }, [agents, agentSearch]);

  useEffect(() => {
    if (!filteredConversations.length) {
      setSelectedConversationId(null);
      return;
    }

    // Only clear if the currently selected conversation is no longer in the list
    // Do NOT auto-select the first conversation — the user should choose
    setSelectedConversationId((current) => {
      if (current && filteredConversations.some((conversation) => conversation.id === current)) {
        return current;
      }

      return null;
    });
  }, [filteredConversations]);

  useEffect(() => {
    setChatMenuOpen(false);
  }, [selectedConversationId]);

  const selectedConversation = filteredConversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const conversationDetailQueryKey = useMemo(
    () => ["whatsapp-monitor-conversation", selectedConversationId, detailInstanceId ?? "all"] as const,
    [detailInstanceId, selectedConversationId],
  );

  const conversationDetailQuery = useInfiniteQuery({
    queryKey: conversationDetailQueryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.whatsappMonitorConversation(token!, selectedConversationId!, {
        instanceId: detailInstanceId,
        limit: 20,
        before: pageParam ?? undefined,
      }, { signal }),
    getNextPageParam: (lastPage) => lastPage.pageInfo.hasPreviousPage ? (lastPage.pageInfo.previousCursor ?? undefined) : undefined,
    enabled: Boolean(token && selectedConversationId),
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    staleTime: MONITOR_DATA_STALE_MS,
    gcTime: QUERY_CACHE_MS,
  });

  const readStateMutation = useMutation({
    mutationFn: ({ id, unread }: { id: string; unread: boolean }) =>
      api.setWhatsappMonitorReadState(token!, id, { unread }),
    onMutate: async ({ id, unread }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ["whatsapp-monitor-conversations"] });

      // Snapshot the previous values
      const previousQueries = queryClient.getQueriesData({ queryKey: ["whatsapp-monitor-conversations"] });

      // Optimistically update to the new value in all matching conversation queries
      queryClient.setQueriesData({ queryKey: ["whatsapp-monitor-conversations"] }, (old: any) => {
        if (!old) return old;
        if (old.pages) {
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              conversations: page.conversations.map((c: any) =>
                c.id === id ? { ...c, isUnread: unread, unreadCount: unread ? Math.max(1, c.unreadCount) : 0 } : c
              ),
            })),
          };
        }
        if (!old.conversations) return old;
        return {
          ...old,
          conversations: old.conversations.map((c: any) => 
            c.id === id ? { ...c, isUnread: unread, unreadCount: unread ? Math.max(1, c.unreadCount) : 0 } : c
          )
        };
      });

      return { previousQueries };
    },
    onError: (err, variables, context: any) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, data]: any) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSuccess: (updated) => {
      const applyReadState = (conversation: any) =>
        conversation.id === updated.id ? { ...conversation, ...updated } : conversation;

      queryClient.setQueriesData({ queryKey: ["whatsapp-monitor-conversations"] }, (old: any) => {
        if (!old) return old;
        if (old.pages) {
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              conversations: page.conversations.map(applyReadState),
            })),
          };
        }
        if (!old.conversations) return old;
        return {
          ...old,
          conversations: old.conversations.map(applyReadState),
        };
      });
      queryClient.setQueriesData({ queryKey: ["whatsapp-monitor-conversation", updated.id] }, (old: any) => {
        if (!old?.pages) {
          return old ? { ...old, ...updated } : old;
        }

        return {
          ...old,
          pages: old.pages.map((page: any) => (page.id === updated.id ? { ...page, ...updated } : page)),
        };
      });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
    },
  });

  const sendReplyMutation = useMutation({
    mutationFn: ({ id, messageText }: { id: string; messageText: string }) =>
      api.sendWhatsappMonitorReply(token!, id, { messageText }),
    onSuccess: (updated) => {
      setReplyText("");
      queryClient.setQueryData(conversationDetailQueryKey, {
        pages: [updated],
        pageParams: [null],
      });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
    },
  });

  const sendMediaMutation = useMutation({
    mutationFn: ({
      id,
      mediaBase64,
      mediaType,
      fileName,
    }: {
      id: string;
      mediaBase64: string;
      mediaType: "image" | "video" | "audio" | "document";
      fileName?: string;
    }) => api.sendWhatsappMonitorMediaReply(token!, id, { mediaBase64, mediaType, fileName }),
    onSuccess: (updated) => {
      queryClient.setQueryData(conversationDetailQueryKey, {
        pages: [updated],
        pageParams: [null],
      });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
    },
  });

  // Only use detail data when it actually belongs to the selected conversation
  // to prevent stale messages from a previous chat from appearing
  const detailPages = conversationDetailQuery.data?.pages ?? [];
  const detail = detailPages[0];
  const detailMatchesSelection = detail && selectedConversationId && detail.id === selectedConversationId;
  const currentConversation = detailMatchesSelection ? detail : selectedConversation;
  // Memoized so typing in the reply box (which re-renders MessagesPage on every
  // keystroke) doesn't rebuild the message array and re-render every bubble.
  const messages = useMemo(
    () => (detailMatchesSelection ? [...detailPages].reverse().flatMap((page) => page.messages) : []),
    [detailMatchesSelection, detailPages],
  );
  const timelineItems = useMemo(() => buildMessageTimelineItems(messages), [messages]);
  const lastMessageId = messages.at(-1)?.id ?? null;
  const hasTopFilters =
    Boolean(contactNameFilter.trim()) ||
    Boolean(contactPhoneFilter.trim()) ||
    periodFilter !== "all" ||
    groupFilter !== "all" ||
    agentInteractionFilter !== "all" ||
    statusFilter !== "all";

  useEffect(() => {
    const newestCursor = detail?.pageInfo.nextCursor;
    if (!token || !selectedConversationId || !detailMatchesSelection || !newestCursor) {
      return;
    }

    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      api.whatsappMonitorConversation(token, selectedConversationId, {
        instanceId: detailInstanceId,
        after: newestCursor,
        limit: 100,
      }).then((updated) => {
        if (!updated.messages.length) {
          return;
        }

        queryClient.setQueryData(conversationDetailQueryKey, (old: any) => {
          if (!old?.pages?.length) {
            return { pages: [updated], pageParams: [null] };
          }

          const [latestPage, ...olderPages] = old.pages;
          const knownIds = new Set(latestPage.messages.map((message: WhatsappMonitorMessage) => message.id));
          const freshMessages = updated.messages.filter((message) => !knownIds.has(message.id));
          if (!freshMessages.length) {
            return old;
          }

          return {
            ...old,
            pages: [
              {
                ...latestPage,
                ...updated,
                messages: [...latestPage.messages, ...freshMessages],
                pageInfo: {
                  ...latestPage.pageInfo,
                  nextCursor: updated.pageInfo.nextCursor ?? latestPage.pageInfo.nextCursor,
                },
              },
              ...olderPages,
            ],
          };
        });
        queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
      }).catch(() => undefined);
    }, CHAT_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [conversationDetailQueryKey, detail?.pageInfo.nextCursor, detailInstanceId, detailMatchesSelection, queryClient, selectedConversationId, token]);

  // Fetch the preceding page as the user approaches the top. Capturing the
  // current dimensions lets the layout effect restore the same visible
  // message after older rows are prepended.
  const loadOlderMessages = useCallback(() => {
    const element = chatBodyRef.current;
    if (
      !element ||
      !conversationDetailQuery.hasNextPage ||
      conversationDetailQuery.isFetchingNextPage ||
      chatScrollAnchorRef.current
    ) {
      return;
    }

    chatScrollAnchorRef.current = { scrollHeight: element.scrollHeight, scrollTop: element.scrollTop };
    skipBottomScrollRef.current = true;
    void conversationDetailQuery.fetchNextPage();
  }, [
    conversationDetailQuery.fetchNextPage,
    conversationDetailQuery.hasNextPage,
    conversationDetailQuery.isFetchingNextPage,
  ]);

  // After older messages are prepended, restore the visual position so the
  // chat doesn't jump to the top of the newly loaded page.
  useLayoutEffect(() => {
    const element = chatBodyRef.current;
    const anchor = chatScrollAnchorRef.current;
    if (!element || !anchor || conversationDetailQuery.isFetchingNextPage) {
      return;
    }

    element.scrollTop = element.scrollHeight - anchor.scrollHeight + anchor.scrollTop;
    chatScrollAnchorRef.current = null;
  }, [conversationDetailQuery.isFetchingNextPage, messages.length]);

  useEffect(() => {
    chatScrollAnchorRef.current = null;
    skipBottomScrollRef.current = false;
  }, [selectedConversationId]);

  useEffect(() => {
    const element = chatBodyRef.current;
    if (!element || !selectedConversationId) {
      return;
    }

    // Never auto-scroll to the bottom right after loading OLDER messages.
    if (skipBottomScrollRef.current) {
      skipBottomScrollRef.current = false;
      return;
    }

    const changedConversation = lastScrolledConversationRef.current !== selectedConversationId;
    if (!changedConversation && !stickToBottomRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: changedConversation ? "auto" : "smooth",
      });
      lastScrolledConversationRef.current = selectedConversationId;
    });
  }, [lastMessageId, messages.length, selectedConversationId]);

  const lastReadHandledIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedConversation?.isUnread || readStateMutation.isPending) {
      // If it becomes read from the server, we can allow marking it read again if it ever becomes unread
      if (selectedConversation && !selectedConversation.isUnread) {
        lastReadHandledIdRef.current = null;
      }
      return;
    }

    // Prevent redundant calls for the same "unread session" of this conversation
    if (lastReadHandledIdRef.current === selectedConversation.id) {
      return;
    }

    lastReadHandledIdRef.current = selectedConversation.id;
    readStateMutation.mutate({ id: selectedConversation.id, unread: false });
  }, [readStateMutation.isPending, selectedConversation?.id, selectedConversation?.isUnread]);

  // Stable identity so memoized ConversationRow children don't re-render on every keystroke.
  const openConversation = useCallback((id: string) => {
    setSelectedConversationId(id);
  }, []);

  function handleSendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = replyText.trim();
    if (!currentConversation || !text || sendReplyMutation.isPending) {
      return;
    }

    sendReplyMutation.mutate({ id: currentConversation.id, messageText: text });
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !currentConversation || sendMediaMutation.isPending) {
      return;
    }

    try {
      const base64 = await readFileAsBase64(file);
      sendMediaMutation.mutate({
        id: currentConversation.id,
        mediaBase64: base64,
        mediaType: detectMediaType(file),
        fileName: file.name,
      });
    } catch (error) {
      console.error("Failed to read file", error);
    } finally {
      event.target.value = "";
    }
  }

  const commonEmojis = ["😊", "😂", "👍", "🙏", "❤️", "🔥", "🚀", "✅", "⚠️", "❌"];

  if (agentsQuery.isError || conversationsQuery.isError) {
    return <div className="page-error">Nao foi possivel carregar as conversas monitoradas.</div>;
  }

  if (showInitialLoader) {
    // The conversation list is the only data needed to reveal the page shell.
    // Agent health can finish independently without holding the whole screen at
    // 98% when that secondary request is slower or being refreshed.
    const isFetching = conversationsQuery.isLoading;
    return (
      <PhoneLoadingScreen
        isLoading={isFetching}
        onFinished={() => setShowInitialLoader(false)}
      />
    );
  }

  return (
    <div className="whatsapp-monitor-page">
      <div className="wa-filter-strip">
        <label className="wa-filter-field">
          <Search size={16} />
          <input
            value={contactNameFilter}
            onChange={(event) => setContactNameFilter(event.target.value)}
            placeholder="Nome do contato"
          />
        </label>
        <label className="wa-filter-field phone">
          <input
            value={contactPhoneFilter}
            onChange={(event) => setContactPhoneFilter(event.target.value)}
            placeholder="Telefone do contato"
          />
        </label>
        <label className="wa-filter-select">
          <select
            aria-label="Filtrar periodo"
            value={periodFilter}
            onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}
          >
            <option value="all">Periodo: todos</option>
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="7d">Ultimos 7 dias</option>
            <option value="30d">Ultimos 30 dias</option>
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </label>
        <div className="wa-filter-segment" role="group" aria-label="Filtrar grupos">
          <button
            type="button"
            className={groupFilter === "all" ? "active" : ""}
            aria-pressed={groupFilter === "all"}
            onClick={() => setGroupFilter("all")}
          >
            Todos
          </button>
          <button
            type="button"
            className={groupFilter === "groups" ? "active" : ""}
            aria-pressed={groupFilter === "groups"}
            onClick={() => setGroupFilter("groups")}
          >
            Grupos
          </button>
          <button
            type="button"
            className={groupFilter === "contacts" ? "active" : ""}
            aria-pressed={groupFilter === "contacts"}
            onClick={() => setGroupFilter("contacts")}
          >
            Privados
          </button>
        </div>
        <label className="wa-filter-select">
          <select
            aria-label="Filtrar status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">Status: todos</option>
            <option value="unread">Nao lidas</option>
            <option value="risk">Com alerta</option>
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </label>
        <label className="wa-filter-select">
          <select
            aria-label="Filtrar interacoes do usuario"
            value={agentInteractionFilter}
            disabled={activeAgentId === "all"}
            onChange={(event) => setAgentInteractionFilter(event.target.value as AgentInteractionFilter)}
          >
            <option value="all">Usuario: todas as conversas</option>
            <option value="sent">Somente mensagens do usuario</option>
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </label>
        <button
          type="button"
          className="wa-filter-button"
          disabled={!hasTopFilters}
          onClick={() => {
            setContactNameFilter("");
            setContactPhoneFilter("");
            setPeriodFilter("all");
            setGroupFilter("all");
            setStatusFilter("all");
            setAgentInteractionFilter("all");
          }}
        >
          <X size={18} />
          Limpar
        </button>
      </div>

      <section className="wa-monitor-shell">
        <aside className="wa-column agents">
          <div className="wa-column-heading">
            <strong>Agentes</strong>
            <span>{agents.length}</span>
          </div>
          <SearchBox value={agentSearch} onChange={setAgentSearch} placeholder="Pesquisar" />

          <div className="wa-list">
            {visibleAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                active={agent.id === activeAgentId}
                onSelect={setActiveAgentId}
              />
            ))}

            {!visibleAgents.length ? <div className="wa-empty-list">Nenhum agente encontrado.</div> : null}
          </div>
        </aside>

        <aside className="wa-column conversations">
          <div className="wa-column-heading">
            <strong>Conversas</strong>
            <span>{filteredConversations.length}</span>
          </div>
          <SearchBox value={conversationSearch} onChange={setConversationSearch} placeholder="Pesquisar" />

          <div className="wa-list">
            {conversationsQuery.isLoading || (conversationsQuery.isFetching && !filteredConversations.length) ? (
              <>
                <ConversationSkeletonRow />
                <ConversationSkeletonRow />
                <ConversationSkeletonRow />
                <ConversationSkeletonRow />
                <ConversationSkeletonRow />
              </>
            ) : (
              <>
                {filteredConversations.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === selectedConversationId}
                    onSelect={openConversation}
                    onPrefetch={prefetchConversationDetail}
                  />
                ))}

                {conversationsQuery.hasNextPage ? (
                  <div className="wa-load-more-row" ref={conversationsEndRef}>
                    <button
                      type="button"
                      className="wa-load-more-button"
                      disabled={conversationsQuery.isFetchingNextPage}
                      onClick={() => void conversationsQuery.fetchNextPage()}
                    >
                      {conversationsQuery.isFetchingNextPage ? "Carregando..." : "Carregar conversas antigas"}
                    </button>
                  </div>
                ) : null}

                {!filteredConversations.length ? <div className="wa-empty-list">Nenhuma conversa encontrada.</div> : null}
              </>
            )}
          </div>
        </aside>

        <main className="wa-chat-panel">
          {currentConversation ? (
            <>
              <div className="wa-chat-header">
                <div className="wa-chat-contact">
                  <AgentAvatar
                    name={currentConversation.contactName}
                    imageUrl={currentConversation.profilePictureUrl}
                    group={currentConversation.isGroup}
                    alert={Boolean(currentConversation.risk)}
                  />
                  <div>
                    <strong>{currentConversation.contactName}</strong>
                    <span>
                      {currentConversation.eventCount} eventos - {currentConversation.unreadCount} nao lidas -{" "}
                      {activeAgent?.displayLabel || currentConversation.agentName || "Todos"}
                    </span>
                  </div>
                </div>
                <div className="wa-chat-tools">
                  <span className="wa-chat-status">{currentConversation.stageName || "Monitorado"}</span>
                  <button type="button" className="wa-icon-button" title="Conversa anterior">
                    <ChevronLeft size={20} />
                  </button>
                  <button type="button" className="wa-icon-button" title="Proxima conversa">
                    <ChevronRight size={20} />
                  </button>
                  <button type="button" className="wa-icon-button" title="Pesquisar na conversa">
                    <Search size={20} />
                  </button>
                  <div className="wa-menu-anchor">
                    <button
                      type="button"
                      className="wa-icon-button"
                      title="Mais opcoes"
                      onClick={() => setChatMenuOpen((open) => !open)}
                    >
                      <MoreVertical size={20} />
                    </button>
                    {chatMenuOpen ? (
                      <div className="wa-chat-menu">
                        <button
                          type="button"
                          disabled={readStateMutation.isPending}
                          onClick={() => {
                            readStateMutation.mutate({ id: currentConversation.id, unread: false });
                            setChatMenuOpen(false);
                          }}
                        >
                          Marcar como lida
                        </button>
                        <button
                          type="button"
                          disabled={readStateMutation.isPending}
                          onClick={() => {
                            readStateMutation.mutate({ id: currentConversation.id, unread: true });
                            setChatMenuOpen(false);
                          }}
                        >
                          Marcar como nao lida
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div
                className="wa-chat-body"
                ref={chatBodyRef}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
                  stickToBottomRef.current = distanceFromBottom < 160;
                  if (isNearChatTop(element.scrollTop)) {
                    loadOlderMessages();
                  }
                }}
              >
                {conversationDetailQuery.isLoading ? (
                  <ChatSkeleton />
                ) : timelineItems.length ? (
                  <>
                    {conversationDetailQuery.hasNextPage ? (
                      <div className="wa-load-more-row chat">
                        <button
                          type="button"
                          className="wa-load-more-button"
                          disabled={conversationDetailQuery.isFetchingNextPage}
                          onClick={loadOlderMessages}
                        >
                          {conversationDetailQuery.isFetchingNextPage ? "Carregando..." : "Carregar mensagens antigas"}
                        </button>
                      </div>
                    ) : null}
                    {timelineItems.map((item) => (
                      item.type === "date" ? (
                        <div key={item.key} className="wa-date-separator">
                          <span>{item.label}</span>
                        </div>
                      ) : (
                        <ChatMessageBubble
                          key={item.key}
                          message={item.message}
                          showSender={currentConversation.isGroup && item.message.direction === "INBOUND"}
                          onImageClick={setZoomedImageUrl}
                        />
                      )
                    ))}
                  </>
                ) : (
                  <div className="wa-empty-chat">Nenhuma mensagem registrada para esta conversa.</div>
                )}
              </div>

              <form className="wa-reply-composer" onSubmit={handleSendReply}>
                {showShortcuts && filteredTemplates.length > 0 ? (
                  <div className="wa-shortcuts-dropdown">
                    <div className="wa-shortcuts-header">
                      <span>Respostas Rápidas</span>
                      <small>Use as setas ↑↓ e Enter para selecionar</small>
                    </div>
                    <div className="wa-shortcuts-list">
                      {filteredTemplates.map((template, index) => (
                        <button
                          key={template.id}
                          type="button"
                          className={`wa-shortcut-item ${index === activeTemplateIndex ? "active" : ""}`}
                          onClick={() => selectTemplate(template.content)}
                          onMouseEnter={() => setActiveTemplateIndex(index)}
                        >
                          <div className="wa-shortcut-info">
                            <span className="wa-shortcut-trigger">/{template.title.toLowerCase().replace(/\s+/g, "")}</span>
                            <span className="wa-shortcut-title">{template.title}</span>
                          </div>
                          <span className="wa-shortcut-preview">{template.content}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="wa-reply-bar">
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                  />
                  <button
                    type="button"
                    className="wa-icon-button"
                    title="Anexar arquivo"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sendMediaMutation.isPending}
                  >
                    <Paperclip size={20} />
                  </button>
                  <div className="wa-menu-anchor">
                    <button
                      type="button"
                      className="wa-icon-button"
                      title="Emoji"
                      onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
                    >
                      <Smile size={20} />
                    </button>
                    {emojiPickerOpen ? (
                      <div className="wa-emoji-picker">
                        {commonEmojis.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              setReplyText((prev) => prev + emoji);
                              setEmojiPickerOpen(false);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    onKeyDown={(event) => {
                      if (showShortcuts && filteredTemplates.length > 0) {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setActiveTemplateIndex((prev) => (prev + 1) % filteredTemplates.length);
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setActiveTemplateIndex((prev) => (prev - 1 + filteredTemplates.length) % filteredTemplates.length);
                        } else if (event.key === "Enter") {
                          event.preventDefault();
                          const template = filteredTemplates[activeTemplateIndex];
                          if (template) {
                            selectTemplate(template.content);
                          }
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          setReplyText("");
                        }
                      } else
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Responder pelo WhatsApp (digite / para atalhos)"
                    rows={1}
                  />
                  <button
                    type="submit"
                    className="wa-send-button"
                    title="Enviar resposta"
                    disabled={!replyText.trim() || sendReplyMutation.isPending}
                  >
                    <Send size={20} />
                  </button>
                </div>
                {sendReplyMutation.isError ? (
                  <span className="wa-reply-error">Nao foi possivel enviar pela Evolution. Confira a instancia.</span>
                ) : null}
              </form>
            </>
          ) : (
            <div className="wa-empty-chat">
              <Menu size={28} />
              <strong>Selecione uma conversa</strong>
              <span>Ao escolher um agente, as conversas aparecem ao lado para abrir no formato de WhatsApp.</span>
            </div>
          )}
        </main>
      </section>

      {zoomedImageUrl ? (
        <div className="wa-image-zoom-overlay" onClick={() => setZoomedImageUrl(null)}>
          <button
            type="button"
            className="wa-image-zoom-close"
            onClick={() => setZoomedImageUrl(null)}
            aria-label="Fechar visualização"
          >
            <X size={24} />
          </button>
          <img
            src={zoomedImageUrl}
            alt="Imagem expandida"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
