import { useState, useEffect, useRef } from "react";
import { X, Send, Loader, MessageCircle, Phone, Clock } from "lucide-react";
import { formatDateTime } from "../lib/format";

export interface MiniChatMessage {
  id: string;
  content: string;
  direction: "INBOUND" | "OUTBOUND";
  timestamp: string;
  status?: "sent" | "delivered" | "read" | "failed";
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
                return (
                  <div
                    key={message.id}
                    style={{
                      display: "flex",
                      justifyContent: isOutbound ? "flex-end" : "flex-start",
                      animation: "fadeInUp 0.2s ease-out",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "75%",
                        background: isOutbound ? "#d9fdd3" : "#ffffff",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
                      }}
                    >
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
