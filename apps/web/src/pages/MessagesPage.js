import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Contact, FileAudio, FileImage, FileText, FileVideo, Menu, MoreVertical, Paperclip, Search, Send, ShieldCheck, Smile, Sparkles, Users, X, } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
function initials(name) {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
}
function formatTime(value) {
    if (!value) {
        return "--:--";
    }
    return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}
function formatDateTime(value) {
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
function riskTone(message) {
    if (!message.risk) {
        return "";
    }
    return message.risk.severity.toLocaleLowerCase("pt-BR");
}
function suggestedReplyFromMessages(messages) {
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
function attachmentName(message) {
    const directName = message.metadata.fileName ?? message.metadata.filename ?? message.metadata.mediaName;
    return typeof directName === "string" ? directName : null;
}
function metadataString(metadata, keys) {
    for (const key of keys) {
        const value = metadata[key];
        if (typeof value === "string" && value.trim()) {
            return value;
        }
    }
    return null;
}
function metadataRecord(metadata, key) {
    const value = metadata[key];
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function mediaLabel(mediaType) {
    if (mediaType === "image")
        return "Imagem recebida";
    if (mediaType === "audio")
        return "Audio recebido";
    if (mediaType === "video")
        return "Video recebido";
    if (mediaType === "document")
        return "Documento recebido";
    return "Arquivo recebido";
}
function defaultMimeType(mediaType) {
    if (mediaType === "image")
        return "image/jpeg";
    if (mediaType === "audio")
        return "audio/ogg";
    if (mediaType === "video")
        return "video/mp4";
    return "application/octet-stream";
}
function buildMediaSrc(mediaType, mimeType, mediaUrl, mediaBase64) {
    if (!mediaBase64) {
        return mediaUrl;
    }
    if (mediaBase64.startsWith("data:")) {
        return mediaBase64;
    }
    return `data:${mimeType ?? defaultMimeType(mediaType)};base64,${mediaBase64}`;
}
function messageMedia(message) {
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
function messageContact(message) {
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
function isMediaPlaceholder(content) {
    if (/^\[Contato\]$/i.test(content.trim())) {
        return true;
    }
    return /^\[(Imagem|Video|Vídeo|Audio|Áudio|Sticker|Documento)\]$/i.test(content.trim());
}
const CONVERSATION_REFRESH_MS = 3000;
const CHAT_REFRESH_MS = 2000;
function SearchBox({ value, onChange, placeholder, }) {
    return (_jsxs("label", { className: "whatsapp-search", children: [_jsx(Search, { size: 18 }), _jsx("input", { value: value, onChange: (event) => onChange(event.target.value), placeholder: placeholder })] }));
}
function AgentAvatar({ name, alert, imageUrl, group, }) {
    return (_jsxs("span", { className: "wa-avatar", children: [imageUrl ? (_jsx("img", { src: imageUrl, alt: "", loading: "lazy", onError: (event) => {
                    event.currentTarget.style.display = "none";
                } })) : null, _jsx("span", { className: "wa-avatar-fallback", children: group ? _jsx(Users, { size: 18 }) : initials(name) || "WA" }), alert ? _jsx("span", { className: "wa-avatar-dot" }) : null] }));
}
function AgentRow({ agent, active, onClick, }) {
    return (_jsxs("button", { type: "button", className: `wa-list-row ${active ? "active" : ""}`, onClick: onClick, children: [_jsx(AgentAvatar, { name: agent.displayLabel, imageUrl: agent.profilePictureUrl, alert: agent.riskCount > 0 }), _jsxs("span", { className: "wa-list-copy", children: [_jsx("strong", { children: agent.displayLabel }), _jsx("small", { children: agent.phoneNumber || agent.instanceName })] }), _jsx("span", { className: `wa-status-dot wa-status-${agent.status.toLocaleLowerCase("pt-BR")}` })] }));
}
function ConversationRow({ conversation, active, onClick, }) {
    return (_jsxs("button", { type: "button", className: `wa-list-row conversation ${active ? "active" : ""} ${conversation.isUnread ? "unread" : ""}`, onClick: onClick, children: [_jsx(AgentAvatar, { name: conversation.contactName, imageUrl: conversation.profilePictureUrl, group: conversation.isGroup, alert: Boolean(conversation.risk) }), _jsxs("span", { className: "wa-list-copy", children: [_jsx("strong", { children: conversation.contactName }), _jsx("small", { children: conversation.lastMessage || "Sem mensagens registradas" })] }), _jsxs("span", { className: "wa-list-meta", children: [_jsx("time", { children: formatTime(conversation.lastMessageAt) }), conversation.unreadCount > 0 ? (_jsx("span", { className: "wa-unread-badge", children: conversation.unreadCount })) : conversation.risk ? (_jsx(AlertTriangle, { size: 14, className: `risk-icon ${riskTone(conversation)}` })) : (_jsx(CheckCheck, { size: 14 }))] })] }));
}
function ChatMessageBubble({ message, showSender }) {
    const media = messageMedia(message);
    const contact = messageContact(message);
    const fileName = media?.fileName ?? attachmentName(message);
    const direction = message.direction.toLocaleLowerCase("pt-BR");
    const senderLabel = message.senderName || message.senderJid || "Participante";
    const showText = Boolean(message.content.trim()) && !((media || contact) && isMediaPlaceholder(message.content));
    const hasVisualMedia = Boolean(media?.src && ["image", "audio", "video"].includes(media.mediaType));
    const AttachmentIcon = media?.mediaType === "audio" ? FileAudio : media?.mediaType === "video" ? FileVideo : media?.mediaType === "document" ? FileText : FileImage;
    return (_jsxs("div", { className: `wa-message-row ${direction} ${showSender ? "with-sender" : ""}`, children: [showSender ? (_jsx(AgentAvatar, { name: senderLabel, imageUrl: message.senderProfilePictureUrl })) : null, _jsxs("div", { className: "wa-message-stack", children: [showSender ? _jsx("span", { className: "wa-message-sender", children: senderLabel }) : null, _jsxs("div", { className: `wa-bubble ${direction} ${message.risk ? "has-risk" : ""}`, children: [showText ? _jsx("p", { children: message.content }) : null, contact ? (_jsxs("div", { className: "wa-contact-card", children: [_jsx(Contact, { size: 19 }), _jsxs("div", { children: [_jsx("strong", { children: contact.displayName ?? "Contato recebido" }), contact.phoneNumber ? _jsx("span", { children: contact.phoneNumber }) : null] })] })) : null, media?.mediaType === "image" && media.src ? (_jsx("img", { className: "wa-media-image", src: media.src, alt: fileName ?? "Imagem recebida", loading: "lazy" })) : null, media?.mediaType === "audio" && media.src ? (_jsx("audio", { className: "wa-media-audio", controls: true, preload: "metadata", src: media.src })) : null, media?.mediaType === "video" && media.src ? (_jsx("video", { className: "wa-media-video", controls: true, preload: "metadata", src: media.src })) : null, (fileName || media) && !hasVisualMedia && media?.src ? (_jsxs("a", { className: "wa-attachment", href: media.src, download: fileName ?? mediaLabel(media.mediaType), children: [_jsx(AttachmentIcon, { size: 18 }), _jsxs("div", { children: [_jsx("strong", { children: fileName ?? mediaLabel(media.mediaType) }), _jsx("span", { children: mediaLabel(media.mediaType) })] })] })) : null, (fileName || media) && !hasVisualMedia && !media?.src ? (_jsxs("div", { className: "wa-attachment", children: [_jsx(AttachmentIcon, { size: 18 }), _jsxs("div", { children: [_jsx("strong", { children: fileName ?? mediaLabel(media?.mediaType ?? null) }), _jsx("span", { children: mediaLabel(media?.mediaType ?? null) })] })] })) : null, _jsx("time", { children: formatTime(message.createdAt) })] }), message.risk ? (_jsxs("div", { className: "wa-risk-row", children: [_jsxs("span", { className: `wa-risk-chip ${riskTone(message)}`, children: [_jsx(AlertTriangle, { size: 14 }), message.risk.label] }), _jsxs("span", { className: "wa-risk-chip neutral", children: [_jsx(ShieldCheck, { size: 14 }), message.risk.severity === "HIGH" ? "Alto" : message.risk.severity === "MODERATE" ? "Moderado" : "Baixo"] }), _jsxs("span", { className: "wa-risk-chip neutral", children: [_jsx(Check, { size: 14 }), "Novo evento"] })] })) : null] })] }));
}
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result === "string") {
                resolve(result.split(",")[1] ?? "");
            }
            else {
                resolve("");
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
function detectMediaType(file) {
    if (file.type.startsWith("image/"))
        return "image";
    if (file.type.startsWith("video/"))
        return "video";
    if (file.type.startsWith("audio/"))
        return "audio";
    return "document";
}
export function MessagesPage() {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const urlDealId = searchParams.get("dealId");
    const [activeAgentId, setActiveAgentIdRaw] = useState("all");
    // When switching agents, clear the selected conversation so no chat is pre-selected
    const setActiveAgentId = (id) => {
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
    const [periodFilter, setPeriodFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [groupFilter, setGroupFilter] = useState("all");
    const [selectedConversationId, setSelectedConversationId] = useState(urlDealId);
    const [chatMenuOpen, setChatMenuOpen] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [activeTemplateIndex, setActiveTemplateIndex] = useState(0);
    const textareaRef = useRef(null);
    const templatesQuery = useQuery({
        queryKey: ["message-templates"],
        queryFn: () => api.messageTemplates(token),
        enabled: Boolean(token),
    });
    const templates = templatesQuery.data ?? [];
    const showShortcuts = replyText.startsWith("/");
    const shortcutSearch = showShortcuts ? replyText.slice(1).toLowerCase() : "";
    const filteredTemplates = useMemo(() => {
        if (!showShortcuts)
            return [];
        if (!shortcutSearch)
            return templates;
        return templates.filter((t) => t.title.toLowerCase().includes(shortcutSearch) ||
            t.content.toLowerCase().includes(shortcutSearch) ||
            (t.category && t.category.toLowerCase().includes(shortcutSearch)));
    }, [showShortcuts, shortcutSearch, templates]);
    useEffect(() => {
        setActiveTemplateIndex(0);
    }, [filteredTemplates.length]);
    const selectTemplate = (content) => {
        setReplyText(content);
        setActiveTemplateIndex(0);
        setTimeout(() => {
            textareaRef.current?.focus();
        }, 0);
    };
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const fileInputRef = useRef(null);
    const chatBodyRef = useRef(null);
    const stickToBottomRef = useRef(true);
    const lastScrolledConversationRef = useRef(null);
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
        queryFn: () => api.whatsappMonitorConversations(token, {
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
        refetchOnWindowFocus: true,
        staleTime: 1000,
        placeholderData: (previousData) => previousData,
    });
    const agents = conversationsQuery.data?.agents ?? [];
    const conversations = conversationsQuery.data?.conversations ?? [];
    const activeAgent = activeAgentId === "all" ? null : agents.find((agent) => agent.id === activeAgentId) ?? null;
    const filteredConversations = useMemo(() => {
        let result = conversations;
        if (activeAgent) {
            result = result.filter((conversation) => conversation.whatsappInstanceId === activeAgent.id ||
                conversation.instanceName === activeAgent.instanceName ||
                conversation.agentName === activeAgent.displayLabel);
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
        return agents.filter((agent) => `${agent.displayLabel} ${agent.phoneNumber ?? ""} ${agent.instanceName}`.toLocaleLowerCase("pt-BR").includes(normalized));
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
    const prevSelectedConversationIdRef = useRef(null);
    useEffect(() => {
        const prev = prevSelectedConversationIdRef.current;
        prevSelectedConversationIdRef.current = selectedConversationId;
        if (prev && prev !== selectedConversationId) {
            queryClient.removeQueries({ queryKey: ["whatsapp-monitor-conversation", prev] });
        }
    }, [selectedConversationId, queryClient]);
    const conversationDetailQuery = useQuery({
        queryKey: ["whatsapp-monitor-conversation", selectedConversationId],
        queryFn: () => api.whatsappMonitorConversation(token, selectedConversationId),
        enabled: Boolean(token && selectedConversationId),
        refetchInterval: selectedConversationId ? CHAT_REFRESH_MS : false,
        refetchIntervalInBackground: false,
        refetchOnMount: "always",
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
        staleTime: 1000,
    });
    const readStateMutation = useMutation({
        mutationFn: ({ id, unread }) => api.setWhatsappMonitorReadState(token, id, { unread }),
        onMutate: async ({ id, unread }) => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: ["whatsapp-monitor-conversations"] });
            // Snapshot the previous values
            const previousQueries = queryClient.getQueriesData({ queryKey: ["whatsapp-monitor-conversations"] });
            // Optimistically update to the new value in all matching conversation queries
            queryClient.setQueriesData({ queryKey: ["whatsapp-monitor-conversations"] }, (old) => {
                if (!old || !old.conversations)
                    return old;
                return {
                    ...old,
                    conversations: old.conversations.map((c) => c.id === id ? { ...c, isUnread: unread, unreadCount: unread ? Math.max(1, c.unreadCount) : 0 } : c)
                };
            });
            return { previousQueries };
        },
        onError: (err, variables, context) => {
            if (context?.previousQueries) {
                context.previousQueries.forEach(([queryKey, data]) => {
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
        mutationFn: ({ id, messageText }) => api.sendWhatsappMonitorReply(token, id, { messageText }),
        onSuccess: (updated) => {
            setReplyText("");
            queryClient.setQueryData(["whatsapp-monitor-conversation", updated.id], updated);
            queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
        },
    });
    const sendMediaMutation = useMutation({
        mutationFn: ({ id, mediaBase64, mediaType, fileName, }) => api.sendWhatsappMonitorMediaReply(token, id, { mediaBase64, mediaType, fileName }),
        onSuccess: (updated) => {
            queryClient.setQueryData(["whatsapp-monitor-conversation", updated.id], updated);
            queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
        },
    });
    const refreshProfilesMutation = useMutation({
        mutationFn: () => api.refreshWhatsappMonitorProfiles(token),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversations"] });
            queryClient.invalidateQueries({ queryKey: ["whatsapp-monitor-conversation"] });
        },
    });
    useEffect(() => {
        if (!token ||
            !conversations.length ||
            profileRefreshRequestedRef.current ||
            refreshProfilesMutation.isPending ||
            refreshProfilesMutation.isSuccess) {
            return;
        }
        const hasMissingProfiles = conversations.some((conversation) => {
            const looksNumeric = conversation.isGroup &&
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
    const lastMessageId = messages.at(-1)?.id ?? null;
    const totalRisks = filteredConversations.filter((conversation) => conversation.risk).length;
    const suggestedReply = useMemo(() => suggestedReplyFromMessages(messages), [messages]);
    const hasTopFilters = Boolean(contactNameFilter.trim()) ||
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
    const lastReadHandledIdRef = useRef(null);
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
    function openConversation(conversation) {
        setSelectedConversationId(conversation.id);
    }
    function handleSendReply(event) {
        event.preventDefault();
        const text = replyText.trim();
        if (!currentConversation || !text || sendReplyMutation.isPending) {
            return;
        }
        sendReplyMutation.mutate({ id: currentConversation.id, messageText: text });
    }
    async function handleFileSelect(event) {
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
        }
        catch (error) {
            console.error("Failed to read file", error);
        }
        finally {
            event.target.value = "";
        }
    }
    const commonEmojis = ["😊", "😂", "👍", "🙏", "❤️", "🔥", "🚀", "✅", "⚠️", "❌"];
    if (conversationsQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando monitoramento de WhatsApp..." });
    }
    if (conversationsQuery.isError) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel carregar as conversas monitoradas." });
    }
    return (_jsxs("div", { className: "whatsapp-monitor-page", children: [_jsxs("div", { className: "wa-filter-strip", children: [_jsxs("label", { className: "wa-filter-field", children: [_jsx(Search, { size: 16 }), _jsx("input", { value: contactNameFilter, onChange: (event) => setContactNameFilter(event.target.value), placeholder: "Nome do contato" })] }), _jsx("label", { className: "wa-filter-field phone", children: _jsx("input", { value: contactPhoneFilter, onChange: (event) => setContactPhoneFilter(event.target.value), placeholder: "Telefone do contato" }) }), _jsxs("label", { className: "wa-filter-select", children: [_jsxs("select", { "aria-label": "Filtrar periodo", value: periodFilter, onChange: (event) => setPeriodFilter(event.target.value), children: [_jsx("option", { value: "all", children: "Periodo: todos" }), _jsx("option", { value: "today", children: "Hoje" }), _jsx("option", { value: "yesterday", children: "Ontem" }), _jsx("option", { value: "7d", children: "Ultimos 7 dias" }), _jsx("option", { value: "30d", children: "Ultimos 30 dias" })] }), _jsx(ChevronDown, { size: 18, "aria-hidden": "true" })] }), _jsxs("label", { className: "wa-filter-select", children: [_jsxs("select", { "aria-label": "Filtrar grupos", value: groupFilter, onChange: (event) => setGroupFilter(event.target.value), children: [_jsx("option", { value: "all", children: "Grupo: todos" }), _jsx("option", { value: "groups", children: "Somente grupos" }), _jsx("option", { value: "contacts", children: "Sem grupo" })] }), _jsx(ChevronDown, { size: 18, "aria-hidden": "true" })] }), _jsxs("label", { className: "wa-filter-select", children: [_jsxs("select", { "aria-label": "Filtrar status", value: statusFilter, onChange: (event) => setStatusFilter(event.target.value), children: [_jsx("option", { value: "all", children: "Status: todos" }), _jsx("option", { value: "unread", children: "Nao lidas" }), _jsx("option", { value: "risk", children: "Com alerta" })] }), _jsx(ChevronDown, { size: 18, "aria-hidden": "true" })] }), _jsxs("button", { type: "button", className: "wa-filter-button", disabled: !hasTopFilters, onClick: () => {
                            setContactNameFilter("");
                            setContactPhoneFilter("");
                            setPeriodFilter("all");
                            setGroupFilter("all");
                            setStatusFilter("all");
                        }, children: [_jsx(X, { size: 18 }), "Limpar"] })] }), _jsxs("section", { className: "wa-monitor-shell", children: [_jsxs("aside", { className: "wa-column agents", children: [_jsxs("div", { className: "wa-column-heading", children: [_jsx("strong", { children: "Agentes" }), _jsx("span", { children: agents.length })] }), _jsx(SearchBox, { value: agentSearch, onChange: setAgentSearch, placeholder: "Pesquisar" }), _jsxs("div", { className: "wa-list", children: [_jsxs("button", { type: "button", className: `wa-list-row all-agents ${activeAgentId === "all" ? "active" : ""}`, onClick: () => setActiveAgentId("all"), children: [_jsx("span", { className: "wa-avatar synthetic", children: _jsx(Sparkles, { size: 18 }) }), _jsxs("span", { className: "wa-list-copy", children: [_jsx("strong", { children: "Todos os agentes" }), _jsxs("small", { children: [filteredConversations.length, " conversas no filtro"] })] })] }), visibleAgents.map((agent) => (_jsx(AgentRow, { agent: agent, active: agent.id === activeAgentId, onClick: () => setActiveAgentId(agent.id) }, agent.id))), !visibleAgents.length ? _jsx("div", { className: "wa-empty-list", children: "Nenhum agente encontrado." }) : null] })] }), _jsxs("aside", { className: "wa-column conversations", children: [_jsxs("div", { className: "wa-column-heading", children: [_jsx("strong", { children: "Conversas" }), _jsx("span", { children: filteredConversations.length })] }), _jsx(SearchBox, { value: conversationSearch, onChange: setConversationSearch, placeholder: "Pesquisar" }), _jsxs("div", { className: "wa-list", children: [filteredConversations.map((conversation) => (_jsx(ConversationRow, { conversation: conversation, active: conversation.id === selectedConversationId, onClick: () => openConversation(conversation) }, conversation.id))), !filteredConversations.length ? _jsx("div", { className: "wa-empty-list", children: "Nenhuma conversa encontrada." }) : null] })] }), _jsx("main", { className: "wa-chat-panel", children: currentConversation ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "wa-chat-header", children: [_jsxs("div", { className: "wa-chat-contact", children: [_jsx(AgentAvatar, { name: currentConversation.contactName, imageUrl: currentConversation.profilePictureUrl, group: currentConversation.isGroup, alert: Boolean(currentConversation.risk) }), _jsxs("div", { children: [_jsx("strong", { children: currentConversation.contactName }), _jsxs("span", { children: [currentConversation.eventCount, " eventos - ", currentConversation.unreadCount, " nao lidas -", " ", activeAgent?.displayLabel || currentConversation.agentName || "Todos"] })] })] }), _jsxs("div", { className: "wa-chat-tools", children: [_jsx("span", { className: "wa-chat-status", children: currentConversation.stageName || "Monitorado" }), _jsx("button", { type: "button", className: "wa-icon-button", title: "Conversa anterior", children: _jsx(ChevronLeft, { size: 20 }) }), _jsx("button", { type: "button", className: "wa-icon-button", title: "Proxima conversa", children: _jsx(ChevronRight, { size: 20 }) }), _jsx("button", { type: "button", className: "wa-icon-button", title: "Pesquisar na conversa", children: _jsx(Search, { size: 20 }) }), _jsxs("div", { className: "wa-menu-anchor", children: [_jsx("button", { type: "button", className: "wa-icon-button", title: "Mais opcoes", onClick: () => setChatMenuOpen((open) => !open), children: _jsx(MoreVertical, { size: 20 }) }), chatMenuOpen ? (_jsxs("div", { className: "wa-chat-menu", children: [_jsx("button", { type: "button", disabled: readStateMutation.isPending, onClick: () => {
                                                                        readStateMutation.mutate({ id: currentConversation.id, unread: false });
                                                                        setChatMenuOpen(false);
                                                                    }, children: "Marcar como lida" }), _jsx("button", { type: "button", disabled: readStateMutation.isPending, onClick: () => {
                                                                        readStateMutation.mutate({ id: currentConversation.id, unread: true });
                                                                        setChatMenuOpen(false);
                                                                    }, children: "Marcar como nao lida" })] })) : null] })] })] }), _jsx("div", { className: "wa-chat-body", ref: chatBodyRef, onScroll: (event) => {
                                        const element = event.currentTarget;
                                        const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
                                        stickToBottomRef.current = distanceFromBottom < 160;
                                    }, children: conversationDetailQuery.isLoading ? (_jsx("div", { className: "wa-empty-chat", children: "Carregando conversa..." })) : messages.length ? (messages.map((message) => (_jsx(ChatMessageBubble, { message: message, showSender: currentConversation.isGroup && message.direction === "INBOUND" }, message.id)))) : (_jsx("div", { className: "wa-empty-chat", children: "Nenhuma mensagem registrada para esta conversa." })) }), _jsxs("form", { className: "wa-reply-composer", onSubmit: handleSendReply, children: [showShortcuts && filteredTemplates.length > 0 ? (_jsxs("div", { className: "wa-shortcuts-dropdown", children: [_jsxs("div", { className: "wa-shortcuts-header", children: [_jsx("span", { children: "Respostas R\u00E1pidas" }), _jsx("small", { children: "Use as setas \u2191\u2193 e Enter para selecionar" })] }), _jsx("div", { className: "wa-shortcuts-list", children: filteredTemplates.map((template, index) => (_jsxs("button", { type: "button", className: `wa-shortcut-item ${index === activeTemplateIndex ? "active" : ""}`, onClick: () => selectTemplate(template.content), onMouseEnter: () => setActiveTemplateIndex(index), children: [_jsxs("div", { className: "wa-shortcut-info", children: [_jsxs("span", { className: "wa-shortcut-trigger", children: ["/", template.title.toLowerCase().replace(/\s+/g, "")] }), _jsx("span", { className: "wa-shortcut-title", children: template.title })] }), _jsx("span", { className: "wa-shortcut-preview", children: template.content })] }, template.id))) })] })) : null, _jsxs("div", { className: "wa-reply-bar", children: [_jsx("input", { type: "file", ref: fileInputRef, style: { display: "none" }, onChange: handleFileSelect }), _jsx("button", { type: "button", className: "wa-icon-button", title: "Anexar arquivo", onClick: () => fileInputRef.current?.click(), disabled: sendMediaMutation.isPending, children: _jsx(Paperclip, { size: 20 }) }), _jsxs("div", { className: "wa-menu-anchor", children: [_jsx("button", { type: "button", className: "wa-icon-button", title: "Emoji", onClick: () => setEmojiPickerOpen(!emojiPickerOpen), children: _jsx(Smile, { size: 20 }) }), emojiPickerOpen ? (_jsx("div", { className: "wa-emoji-picker", children: commonEmojis.map((emoji) => (_jsx("button", { type: "button", onClick: () => {
                                                                    setReplyText((prev) => prev + emoji);
                                                                    setEmojiPickerOpen(false);
                                                                }, children: emoji }, emoji))) })) : null] }), _jsx("textarea", { ref: textareaRef, value: replyText, onChange: (event) => setReplyText(event.target.value), onKeyDown: (event) => {
                                                        if (showShortcuts && filteredTemplates.length > 0) {
                                                            if (event.key === "ArrowDown") {
                                                                event.preventDefault();
                                                                setActiveTemplateIndex((prev) => (prev + 1) % filteredTemplates.length);
                                                            }
                                                            else if (event.key === "ArrowUp") {
                                                                event.preventDefault();
                                                                setActiveTemplateIndex((prev) => (prev - 1 + filteredTemplates.length) % filteredTemplates.length);
                                                            }
                                                            else if (event.key === "Enter") {
                                                                event.preventDefault();
                                                                const template = filteredTemplates[activeTemplateIndex];
                                                                if (template) {
                                                                    selectTemplate(template.content);
                                                                }
                                                            }
                                                            else if (event.key === "Escape") {
                                                                event.preventDefault();
                                                                setReplyText("");
                                                            }
                                                        }
                                                        else if (event.key === "Enter" && !event.shiftKey) {
                                                            event.preventDefault();
                                                            event.currentTarget.form?.requestSubmit();
                                                        }
                                                    }, placeholder: "Responder pelo WhatsApp (digite / para atalhos)", rows: 1 }), _jsx("button", { type: "submit", className: "wa-send-button", title: "Enviar resposta", disabled: !replyText.trim() || sendReplyMutation.isPending, children: _jsx(Send, { size: 20 }) })] }), sendReplyMutation.isError ? (_jsx("span", { className: "wa-reply-error", children: "Nao foi possivel enviar pela Evolution. Confira a instancia." })) : null] })] })) : (_jsxs("div", { className: "wa-empty-chat", children: [_jsx(Menu, { size: 28 }), _jsx("strong", { children: "Selecione uma conversa" }), _jsx("span", { children: "Ao escolher um agente, as conversas aparecem ao lado para abrir no formato de WhatsApp." })] })) })] })] }));
}
