import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
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
  FileImage,
  Grid3X3,
  List,
  Menu,
  MoreVertical,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

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

function attachmentName(message: WhatsappMonitorMessage) {
  const directName = message.metadata.fileName ?? message.metadata.filename ?? message.metadata.mediaName;
  return typeof directName === "string" ? directName : null;
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
  const fileName = attachmentName(message);
  const direction = message.direction.toLocaleLowerCase("pt-BR");
  const senderLabel = message.senderName || message.senderJid || "Participante";

  return (
    <div className={`wa-message-row ${direction} ${showSender ? "with-sender" : ""}`}>
      {showSender ? (
        <AgentAvatar name={senderLabel} imageUrl={message.senderProfilePictureUrl} />
      ) : null}
      <div className="wa-message-stack">
        {showSender ? <span className="wa-message-sender">{senderLabel}</span> : null}
        <div className={`wa-bubble ${direction} ${message.risk ? "has-risk" : ""}`}>
          <p>{message.content}</p>
          {fileName ? (
            <div className="wa-attachment">
              <FileImage size={18} />
              <div>
                <strong>{fileName}</strong>
                <span>Arquivo enviado</span>
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

export function MessagesPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [activeAgentId, setActiveAgentId] = useState<string>("all");
  const [agentSearch, setAgentSearch] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const profileRefreshRequestedRef = useRef(false);

  const conversationsQuery = useQuery({
    queryKey: ["whatsapp-monitor-conversations", activeAgentId, conversationSearch],
    queryFn: () =>
      api.whatsappMonitorConversations(token!, {
        instanceId: activeAgentId === "all" ? undefined : activeAgentId,
        search: conversationSearch || undefined,
      }),
    enabled: Boolean(token),
  });

  const agents = conversationsQuery.data?.agents ?? [];
  const conversations = conversationsQuery.data?.conversations ?? [];
  const activeAgent = activeAgentId === "all" ? null : agents.find((agent) => agent.id === activeAgentId) ?? null;

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
    if (!conversations.length) {
      setSelectedConversationId(null);
      return;
    }

    setSelectedConversationId((current) => {
      if (current && conversations.some((conversation) => conversation.id === current)) {
        return current;
      }

      return conversations[0]?.id ?? null;
    });
  }, [conversations]);

  useEffect(() => {
    setChatMenuOpen(false);
  }, [selectedConversationId]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const conversationDetailQuery = useQuery({
    queryKey: ["whatsapp-monitor-conversation", selectedConversationId],
    queryFn: () => api.whatsappMonitorConversation(token!, selectedConversationId!),
    enabled: Boolean(token && selectedConversationId),
  });

  const readStateMutation = useMutation({
    mutationFn: ({ id, unread }: { id: string; unread: boolean }) =>
      api.setWhatsappMonitorReadState(token!, id, { unread }),
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

  const detail = conversationDetailQuery.data;
  const currentConversation = detail ?? selectedConversation;
  const messages = detail?.messages ?? [];
  const totalRisks = conversations.filter((conversation) => conversation.risk).length;

  if (conversationsQuery.isLoading) {
    return <div className="page-loading">Carregando monitoramento de WhatsApp...</div>;
  }

  if (conversationsQuery.isError) {
    return <div className="page-error">Nao foi possivel carregar as conversas monitoradas.</div>;
  }

  return (
    <div className="whatsapp-monitor-page">
      <div className="wa-filter-strip">
        {["Nome do contato", "Telefone do contato", "Periodo", "Grupo", "Status"].map((label) => (
          <button key={label} type="button" className="wa-filter-button">
            {label}
            <ChevronDown size={18} />
          </button>
        ))}
        <button type="button" className="wa-filter-button">
          <Plus size={18} />
          Filtros
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
                <small>{conversations.length} conversas monitoradas</small>
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
            <span>{conversations.length}</span>
          </div>
          <SearchBox value={conversationSearch} onChange={setConversationSearch} placeholder="Pesquisar" />

          <div className="wa-list">
            {conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === selectedConversationId}
                onClick={() => setSelectedConversationId(conversation.id)}
              />
            ))}

            {!conversations.length ? <div className="wa-empty-list">Nenhuma conversa encontrada.</div> : null}
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

              <div className="wa-chat-body">
                {conversationDetailQuery.isLoading ? (
                  <div className="wa-empty-chat">Carregando conversa...</div>
                ) : messages.length ? (
                  messages.map((message) => (
                    <ChatMessageBubble
                      key={message.id}
                      message={message}
                      showSender={currentConversation.isGroup && message.direction === "INBOUND"}
                    />
                  ))
                ) : (
                  <div className="wa-empty-chat">Nenhuma mensagem registrada para esta conversa.</div>
                )}
              </div>

              <div className="wa-chat-footer">
                <div>
                  <strong>Retencao em nuvem ativa</strong>
                  <span>Ultima atividade: {formatDateTime(detail?.lastMessageAt ?? currentConversation.lastMessageAt)}</span>
                </div>
                <span className={`wa-risk-chip ${totalRisks ? "moderate" : "neutral"}`}>
                  <ShieldCheck size={14} />
                  {totalRisks} alertas no recorte
                </span>
              </div>
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
