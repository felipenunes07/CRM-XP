import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MessageTemplate,
  WhatsappMonitorAgent,
  WhatsappMonitorConversation,
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
  Grid3X3,
  List,
  Menu,
  MoreVertical,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { buildMessageTimelineItems } from "./messagesPage.helpers";

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

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Sem atividade";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
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

function suggestedReplyFromMessages(messages: WhatsappMonitorMessage[]) {
  const lastInbound = [...messages].reverse().find((message) => message.direction === "INBOUND");
  const text = lastInbound?.content.toLocaleLowerCase("pt-BR") ?? "";

  if (!lastInbound) {
    return null;
  }

  if (text.includes("bom dia") || text.includes("boa tarde") || text.includes("boa noite") || text.includes("ola") || text.includes("oi")) {
    return "Ola! Como posso te ajudar hoje?";
  }

  if (text.includes("prazo") || text.includes("entrega") || text.includes("chegar")) {
    return "Vou conferir o prazo de entrega e ja te retorno.";
  }

  if (text.includes("valor") || text.includes("preco") || text.includes("orcamento") || text.includes("quanto")) {
    return "Vou revisar os valores e te envio a melhor condicao.";
  }

  if (text.includes("pix") || text.includes("pagamento") || text.includes("boleto") || text.includes("pago")) {
    return "Vou verificar o status do pagamento e ja te confirmo.";
  }

  if (text.includes("arquivo") || text.includes("pdf") || text.includes("documento") || text.includes("comprovante")) {
    return "Recebi o documento. Vou analisar e te retorno.";
  }

  if (text.includes("obrigado") || text.includes("valeu") || text.includes("show") || text.includes("perfeito")) {
    return "Disponha! Qualquer coisa estou por aqui.";
  }

  return "Obrigado pelo retorno. Vou verificar e ja te respondo.";
}

function attachmentName(message: WhatsappMonitorMessage) {
  const directName = message.metadata.fileName ?? message.metadata.filename ?? message.metadata.mediaName;
  return typeof directName === "string" ? directName : null;
}

type GroupFilter = "all" | "groups" | "contacts";
type PeriodFilter = "all" | "today" | "yesterday" | "7d" | "30d";
type StatusFilter = "all" | "unread" | "risk";

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

const CONVERSATION_REFRESH_MS = 10000;
const CHAT_REFRESH_MS = 5000;

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
  return (
    <span className="wa-avatar">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span className="wa-avatar-fallback">{group ? <Users size={18} /> : initials(name) || "WA"}</span>
      {alert ? <span className="wa-avatar-dot" /> : null}
    </span>
  );
}

function AgentRow({
  agent,
  active,
  onClick,
}: {
  agent: WhatsappMonitorAgent;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`wa-list-row ${active ? "active" : ""}`} onClick={onClick}>
      <AgentAvatar
        name={agent.displayLabel}
        imageUrl={agent.profilePictureUrl}
        alert={agent.riskCount > 0}
      />
      <span className="wa-list-copy">
        <strong>{agent.displayLabel}</strong>
        <small>{agent.phoneNumber || agent.instanceName}</small>
      </span>
      <span className={`wa-status-dot wa-status-${agent.status.toLocaleLowerCase("pt-BR")}`} />
    </button>
  );
}

function ConversationRow({
  conversation,
  active,
  onClick,
}: {
  conversation: WhatsappMonitorConversation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`wa-list-row conversation ${active ? "active" : ""} ${conversation.isUnread ? "unread" : ""}`}
      onClick={onClick}
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
}

function ChatMessageBubble({ message, showSender }: { message: WhatsappMonitorMessage; showSender: boolean }) {
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
            <img className="wa-media-image" src={media.src} alt={fileName ?? "Imagem recebida"} loading="lazy" />
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
}

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

export function MessagesPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const urlDealId = searchParams.get("dealId");

  const [activeAgentId, setActiveAgentIdRaw] = useState<string>("all");

  // When switching agents, clear the selected conversation so no chat is pre-selected
  const setActiveAgentId = (id: string) => {
    setActiveAgentIdRaw(id);
    setSelectedConversationId(null);
  };
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
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(urlDealId);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [activeTemplateIndex, setActiveTemplateIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => api.messageTemplates(token!),
    enabled: Boolean(token),
  });

  const templates = templatesQuery.data ?? [];
  const showShortcuts = replyText.startsWith("/");
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
  const profileRefreshRequestedRef = useRef(false);

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

  const conversationsQuery = useQuery({
    queryKey: [
      "whatsapp-monitor-conversations",
      activeAgentId,
      debouncedConversationSearch,
      debouncedContactNameFilter,
      debouncedContactPhoneFilter,
      periodFilter,
      statusFilter,
    ],
    queryFn: () =>
      api.whatsappMonitorConversations(token!, {
        instanceId: activeAgentId === "all" ? undefined : activeAgentId,
        search: debouncedConversationSearch || undefined,
        contactName: debouncedContactNameFilter || undefined,
        contactPhone: debouncedContactPhoneFilter || undefined,
        period: periodFilter === "all" ? undefined : periodFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
      }),
    enabled: Boolean(token),
    refetchInterval: CONVERSATION_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    staleTime: 5000,
    placeholderData: (previousData) => previousData,
  });

  const agents = conversationsQuery.data?.agents ?? [];
  const conversations = conversationsQuery.data?.conversations ?? [];
  const activeAgent = activeAgentId === "all" ? null : agents.find((agent) => agent.id === activeAgentId) ?? null;

  const filteredConversations = useMemo(() => {
    let result = conversations;

    if (activeAgent) {
      result = result.filter(
        (conversation) =>
          conversation.whatsappInstanceId === activeAgent.id ||
          conversation.instanceName === activeAgent.instanceName ||
          conversation.agentName === activeAgent.displayLabel
      );
    }

    if (groupFilter === "groups") {
      return result.filter((conversation) => conversation.isGroup);
    }

    if (groupFilter === "contacts") {
      return result.filter((conversation) => !conversation.isGroup);
    }

    return result;
  }, [conversations, groupFilter, activeAgent]);

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
  // When selectedConversationId changes, remove the old cached conversation detail
  // so stale messages from a different chat are never shown
  const prevSelectedConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSelectedConversationIdRef.current;
    prevSelectedConversationIdRef.current = selectedConversationId;
    if (prev && prev !== selectedConversationId) {
      queryClient.removeQueries({ queryKey: ["whatsapp-monitor-conversation", prev] });
    }
  }, [selectedConversationId, queryClient]);

  const conversationDetailQuery = useQuery({
    queryKey: ["whatsapp-monitor-conversation", selectedConversationId],
    queryFn: () => api.whatsappMonitorConversation(token!, selectedConversationId!),
    enabled: Boolean(token && selectedConversationId),
    refetchInterval: selectedConversationId ? CHAT_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    staleTime: 3000,
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
        if (!old || !old.conversations) return old;
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
      queryClient.setQueryData(["whatsapp-monitor-conversation", updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
    },
  });

  const sendReplyMutation = useMutation({
    mutationFn: ({ id, messageText }: { id: string; messageText: string }) =>
      api.sendWhatsappMonitorReply(token!, id, { messageText }),
    onSuccess: (updated) => {
      setReplyText("");
      queryClient.setQueryData(["whatsapp-monitor-conversation", updated.id], updated);
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
      queryClient.setQueryData(["whatsapp-monitor-conversation", updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
    },
  });

  const refreshProfilesMutation = useMutation({
    mutationFn: () => api.refreshWhatsappMonitorProfiles(token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversation"] });
    },
  });

  useEffect(() => {
    if (
      !token ||
      !conversations.length ||
      profileRefreshRequestedRef.current ||
      refreshProfilesMutation.isPending ||
      refreshProfilesMutation.isSuccess
    ) {
      return;
    }

    const hasMissingProfiles = conversations.some((conversation) => {
      const looksNumeric =
        conversation.isGroup &&
        (/^Grupo\s+\d+$/i.test(conversation.contactName) || /^\[GRUPO\]\s+\d+/i.test(conversation.contactName));

      return !conversation.profilePictureUrl || looksNumeric;
    });

    if (hasMissingProfiles) {
      profileRefreshRequestedRef.current = true;
      refreshProfilesMutation.mutate();
    }
  }, [conversations, refreshProfilesMutation, token]);

  // Only use detail data when it actually belongs to the selected conversation
  // to prevent stale messages from a previous chat from appearing
  const detail = conversationDetailQuery.data;
  const detailMatchesSelection = detail && selectedConversationId && detail.id === selectedConversationId;
  const currentConversation = detailMatchesSelection ? detail : selectedConversation;
  const messages = detailMatchesSelection ? (detail?.messages ?? []) : [];
  const timelineItems = useMemo(() => buildMessageTimelineItems(messages), [messages]);
  const lastMessageId = messages.at(-1)?.id ?? null;
  const totalRisks = filteredConversations.filter((conversation) => conversation.risk).length;
  const suggestedReply = useMemo(() => suggestedReplyFromMessages(messages), [messages]);
  const hasTopFilters =
    Boolean(contactNameFilter.trim()) ||
    Boolean(contactPhoneFilter.trim()) ||
    periodFilter !== "all" ||
    groupFilter !== "all" ||
    statusFilter !== "all";

  useEffect(() => {
    const element = chatBodyRef.current;
    if (!element || !selectedConversationId) {
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

  function openConversation(conversation: WhatsappMonitorConversation) {
    setSelectedConversationId(conversation.id);
  }

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

  if (conversationsQuery.isLoading) {
    return <div className="page-loading">Carregando monitoramento de WhatsApp...</div>;
  }

  if (conversationsQuery.isError) {
    return <div className="page-error">Nao foi possivel carregar as conversas monitoradas.</div>;
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
        <label className="wa-filter-select">
          <select
            aria-label="Filtrar grupos"
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value as GroupFilter)}
          >
            <option value="all">Grupo: todos</option>
            <option value="groups">Somente grupos</option>
            <option value="contacts">Sem grupo</option>
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </label>
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
            <button
              type="button"
              className={`wa-list-row all-agents ${activeAgentId === "all" ? "active" : ""}`}
              onClick={() => setActiveAgentId("all")}
            >
              <span className="wa-avatar synthetic">
                <Sparkles size={18} />
              </span>
              <span className="wa-list-copy">
                <strong>Todos os agentes</strong>
                <small>{filteredConversations.length} conversas no filtro</small>
              </span>
            </button>

            {visibleAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                active={agent.id === activeAgentId}
                onClick={() => setActiveAgentId(agent.id)}
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
            {filteredConversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === selectedConversationId}
                onClick={() => openConversation(conversation)}
              />
            ))}

            {!filteredConversations.length ? <div className="wa-empty-list">Nenhuma conversa encontrada.</div> : null}
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
                }}
              >
                {conversationDetailQuery.isLoading ? (
                  <div className="wa-empty-chat">Carregando conversa...</div>
                ) : timelineItems.length ? (
                  timelineItems.map((item) => (
                    item.type === "date" ? (
                      <div key={item.key} className="wa-date-separator">
                        <span>{item.label}</span>
                      </div>
                    ) : (
                      <ChatMessageBubble
                        key={item.key}
                        message={item.message}
                        showSender={currentConversation.isGroup && item.message.direction === "INBOUND"}
                      />
                    )
                  ))
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
    </div>
  );
}
