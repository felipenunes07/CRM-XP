import { useState, useEffect, useRef } from "react";
import { X, Send, Loader, MessageCircle, Phone, Clock } from "lucide-react";
import { formatDateTime } from "../lib/format";

export interface MiniChatMessage {
  id: string;
  content: string;
  direction: "INBOUND" | "OUTBOUND";
  timestamp: string;
  status?: "sent" | "delivered" | "read" | "failed";
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  media?: {
    type: string;
    src: string;
    fileName?: string | null;
  };
  highlight?: {
    severity: "CRITICAL" | "HIGH" | "MODERATE" | "LOW";
    label: string;
    reason?: string | null;
  };
}

function MessageMedia({ media }: { media: NonNullable<MiniChatMessage["media"]> }) {
  if (media.type === "audio") {
    return (
      <audio
        controls
        preload="metadata"
        src={media.src}
        style={{ width: "230px", maxWidth: "100%", height: "38px", marginBottom: "4px" }}
      />
    );
  }

  if (media.type === "image") {
    return (
      <img
        src={media.src}
        alt={media.fileName ?? "Imagem"}
        style={{ maxWidth: "100%", maxHeight: "220px", borderRadius: "8px", marginBottom: "4px", display: "block" }}
      />
    );
  }

  if (media.type === "video") {
    return (
      <video
        controls
        preload="metadata"
        src={media.src}
        style={{ maxWidth: "100%", maxHeight: "220px", borderRadius: "8px", marginBottom: "4px", display: "block" }}
      />
    );
  }

  return (
    <a
      href={media.src}
      download={media.fileName ?? "arquivo"}
      style={{ display: "inline-block", fontSize: "0.8rem", color: "#2563eb", marginBottom: "4px" }}
    >
      {media.fileName ?? "Baixar arquivo"}
    </a>
  );
}

function highlightTone(severity: NonNullable<MiniChatMessage["highlight"]>["severity"] | undefined) {
  if (severity === "CRITICAL") {
    return {
      border: "#dc2626",
      background: "#fff1f2",
      text: "#991b1b",
      label: "CRITICO",
    };
  }

  if (severity === "HIGH") {
    return {
      border: "#ef4444",
      background: "#fff7ed",
      text: "#b91c1c",
      label: "ALTO",
    };
  }

  if (severity === "MODERATE") {
    return {
      border: "#f59e0b",
      background: "#fffbeb",
      text: "#92400e",
      label: "MODERADO",
    };
  }

  return {
    border: "#64748b",
    background: "#f8fafc",
    text: "#334155",
    label: "BAIXO",
  };
}

function SenderAvatar({
  name,
  avatarUrl,
  isOutbound,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  isOutbound: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name?.trim() || (isOutbound ? "E" : "C")).charAt(0).toUpperCase();

  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt=""
        onError={() => setFailed(true)}
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
          border: "2px solid #ffffff",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontSize: "0.85rem",
        fontWeight: 700,
        color: "#ffffff",
        background: isOutbound
          ? "linear-gradient(135deg, #10b981, #047857)"
          : "linear-gradient(135deg, #f59e0b, #d97706)",
        flexShrink: 0,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.2)",
        border: "2px solid #ffffff",
      }}
    >
      {initial}
    </div>
  );
}

interface MiniChatDrawerProps {
  open: boolean;
  onClose: () => void;
  recipientId: string;
  customerName: string;
  customerPhone: string;
  jid: string;
  messages: MiniChatMessage[];
  onSendMessage?: (message: string) => Promise<void>;
  loading?: boolean;
}

export function MiniChatDrawer({
  open,
  onClose,
  customerName,
  customerPhone,
  jid,
  messages,
  onSendMessage,
  loading = false,
}: MiniChatDrawerProps) {
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  const handleSend = async () => {
    if (!messageText.trim() || !onSendMessage || sending) return;

    setSending(true);
    try {
      await onSendMessage(messageText);
      setMessageText("");
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      alert("Erro ao enviar mensagem. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.4)",
          zIndex: 9998,
          animation: "fadeIn 0.2s ease-out",
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(100%, 480px)",
          background: "#ffffff",
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.15)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          animation: "slideInRight 0.3s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #e4e4e7",
            background: "#075e54",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #25d366, #128c7e)",
                display: "grid",
                placeItems: "center",
                fontSize: "1.2rem",
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              {(customerName || "C").charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1rem",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {customerName || "Cliente"}
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", opacity: 0.9 }}>
                <Phone size={12} />
                <span style={{ fontFamily: "monospace" }}>{customerPhone || jid}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.15)",
              border: "none",
              borderRadius: "8px",
              padding: "8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.25)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)")}
          >
            <X size={20} />
          </button>
        </div>

        {/* Messages Area */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.5rem",
            background: "#e5ddd5",
            backgroundImage:
              "url('data:image/svg+xml,%3Csvg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h100v100H0z\" fill=\"%23e5ddd5\"/%3E%3Cpath d=\"M20 20l5 5-5 5m20-10l5 5-5 5\" stroke=\"%23d1c7b8\" stroke-width=\"0.5\" fill=\"none\" opacity=\"0.3\"/%3E%3C/svg%3E')",
            backgroundSize: "100px 100px",
          }}
        >
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", padding: "3rem 0", color: "#64748b" }}>
              <Loader size={32} className="spin" />
              <span style={{ fontSize: "0.9rem" }}>Carregando conversas...</span>
            </div>
          ) : messages.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "1rem",
                padding: "3rem 1rem",
                color: "#64748b",
                textAlign: "center",
              }}
            >
              <MessageCircle size={48} style={{ opacity: 0.3 }} />
              <div>
                <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#475569" }}>Nenhuma mensagem ainda</h4>
                <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem" }}>
                  Envie a primeira mensagem para iniciar a conversa com este cliente.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {messages.map((message) => {
                const isOutbound = message.direction === "OUTBOUND";
                const tone = highlightTone(message.highlight?.severity);
                return (
                  <div
                    key={message.id}
                    style={{
                      display: "flex",
                      justifyContent: isOutbound ? "flex-end" : "flex-start",
                      alignItems: "flex-end",
                      gap: "8px",
                      animation: "fadeInUp 0.2s ease-out",
                    }}
                  >
                    {!isOutbound && (
                      <SenderAvatar name={message.senderName} avatarUrl={message.senderAvatarUrl} isOutbound={false} />
                    )}
                    <div
                      style={{
                        maxWidth: "72%",
                        background: message.highlight ? tone.background : isOutbound ? "#d9fdd3" : "#ffffff",
                        padding: "8px 12px",
                        borderRadius: isOutbound ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                        border: message.highlight ? `2px solid ${tone.border}` : "1px solid transparent",
                        boxShadow: message.highlight
                          ? `0 0 0 3px ${tone.border}18, 0 6px 18px rgba(15, 23, 42, 0.16)`
                          : "0 1px 2px rgba(0, 0, 0, 0.1)",
                      }}
                    >
                      {message.highlight && (
                        <div
                          style={{
                            display: "grid",
                            gap: "3px",
                            marginBottom: "8px",
                            paddingBottom: "7px",
                            borderBottom: `1px solid ${tone.border}40`,
                          }}
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              width: "fit-content",
                              alignItems: "center",
                              gap: "5px",
                              padding: "2px 7px",
                              borderRadius: "999px",
                              background: "#ffffff",
                              color: tone.text,
                              border: `1px solid ${tone.border}55`,
                              fontSize: "0.64rem",
                              fontWeight: 800,
                              letterSpacing: 0,
                            }}
                          >
                            Mensagem capturada - {tone.label}
                          </span>
                          <strong style={{ color: tone.text, fontSize: "0.78rem" }}>{message.highlight.label}</strong>
                          {message.highlight.reason && (
                            <small style={{ color: "#64748b", fontSize: "0.72rem", lineHeight: 1.35 }}>
                              {message.highlight.reason}
                            </small>
                          )}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                        <span
                          style={{
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            color: isOutbound ? "#047857" : "#b45309",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "200px",
                          }}
                        >
                          {message.senderName?.trim() || (isOutbound ? "Equipe" : "Cliente")}
                        </span>
                        <span
                          style={{
                            fontSize: "0.6rem",
                            fontWeight: 700,
                            letterSpacing: 0,
                            padding: "1px 7px",
                            borderRadius: "999px",
                            background: isOutbound ? "#d1fae5" : "#ffedd5",
                            color: isOutbound ? "#047857" : "#b45309",
                            flexShrink: 0,
                          }}
                        >
                          {isOutbound ? "EQUIPE" : "CLIENTE"}
                        </span>
                      </div>
                      {message.media && <MessageMedia media={message.media} />}
                      {(!message.media || !/^\[(Audio|Áudio|Imagem|Video|Vídeo|Documento|Arquivo)/iu.test(message.content.trim())) && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.9rem",
                            color: "#1a1a1a",
                            lineHeight: 1.45,
                            wordWrap: "break-word",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {message.content}
                        </p>
                      )}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: "4px",
                          marginTop: "4px",
                          fontSize: "0.7rem",
                          color: "#667781",
                        }}
                      >
                        <Clock size={10} />
                        {formatDateTime(message.timestamp)}
                      </div>
                    </div>
                    {isOutbound && (
                      <SenderAvatar name={message.senderName} avatarUrl={message.senderAvatarUrl} isOutbound={true} />
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        {onSendMessage && (
          <div
            style={{
              padding: "1rem 1.5rem",
              borderTop: "1px solid #e4e4e7",
              background: "#f8fafc",
              display: "flex",
              gap: "12px",
              alignItems: "flex-end",
            }}
          >
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite sua mensagem..."
              rows={2}
              disabled={sending}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #e4e4e7",
                fontSize: "0.9rem",
                fontFamily: "inherit",
                resize: "none",
                outline: "none",
                transition: "border 0.2s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e4e4e7")}
            />
            <button
              onClick={handleSend}
              disabled={!messageText.trim() || sending}
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "none",
                background: messageText.trim() && !sending ? "#10b981" : "#e4e4e7",
                color: messageText.trim() && !sending ? "#ffffff" : "#a1a1aa",
                cursor: messageText.trim() && !sending ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.875rem",
                fontWeight: 600,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (messageText.trim() && !sending) {
                  e.currentTarget.style.background = "#059669";
                }
              }}
              onMouseLeave={(e) => {
                if (messageText.trim() && !sending) {
                  e.currentTarget.style.background = "#10b981";
                }
              }}
            >
              {sending ? (
                <>
                  <Loader size={16} className="spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Enviar
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeInUp {
          from { 
            opacity: 0; 
            transform: translateY(10px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
