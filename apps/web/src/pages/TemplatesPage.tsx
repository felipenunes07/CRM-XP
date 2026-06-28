import type { MessageTemplate } from "@olist-crm/shared";
import { FormEvent, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

const CATEGORIES: { value: MessageTemplate["category"]; label: string }[] = [
  { value: "reativacao", label: "Reativação" },
  { value: "follow_up", label: "Follow-up" },
  { value: "promocao", label: "Promoção" },
  { value: "credito", label: "Crédito" },
];

function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

const EMPTY_FORM = {
  category: "follow_up" as MessageTemplate["category"],
  title: "",
  content: "",
  messageType: "TEXT" as MessageTemplate["messageType"],
  mediaUrl: null as string | null,
};

export function TemplatesPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<MessageTemplate["category"] | "todas">("todas");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => api.messageTemplates(token!),
    enabled: Boolean(token),
  });

  const createMutation = useMutation({
    mutationFn: (input: typeof EMPTY_FORM) => api.createMessageTemplate(token!, input),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: typeof EMPTY_FORM }) =>
      api.updateMessageTemplate(token!, id, input),
    onSuccess: () => {
      setEditingId(null);
      setForm(EMPTY_FORM);
      void queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMessageTemplate(token!, id),
    onSuccess: () => {
      setDeleteConfirm(null);
      void queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
  });

  const needsMedia = form.messageType !== "TEXT";

  const getDisplayMediaUrl = (url: string | null) => {
    if (!url) return "";
    if (window.location.hostname === "localhost" && url.includes("/media/campaign-")) {
      try {
        const parsed = new URL(url);
        return `http://localhost:4000${parsed.pathname}`;
      } catch {
        if (url.startsWith("/")) {
          return `http://localhost:4000${url}`;
        }
        return url;
      }
    }
    return url;
  };

  const handleFile = async (file: File) => {
    const isImage = form.messageType === "IMAGE";
    
    if (isImage) {
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        alert("Arquivo muito grande! O tamanho máximo permitido para imagem é 10MB.");
        return;
      }
      const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
      if (!validTypes.includes(file.type)) {
        alert("Tipo de arquivo inválido! Formatos aceitos: JPG, PNG, GIF, WEBP.");
        return;
      }
    } else {
      const maxSize = 16 * 1024 * 1024; // 16MB
      if (file.size > maxSize) {
        alert("Arquivo muito grande! O tamanho máximo permitido para vídeo é 16MB.");
        return;
      }
      if (file.type !== "video/mp4" && !file.name.endsWith(".mp4")) {
        alert("Tipo de arquivo inválido! O vídeo deve ser no formato MP4.");
        return;
      }
    }

    setUploadingMedia(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
        reader.readAsDataURL(file);
      });

      if (isImage) {
        const { url } = await api.uploadCampaignImage(token!, {
          fileBase64: base64,
          fileName: file.name,
        });
        setForm((prev) => ({ ...prev, mediaUrl: url }));
      } else {
        const { url } = await api.uploadCampaignVideo(token!, {
          fileBase64: base64,
          fileName: file.name,
        });
        setForm((prev) => ({ ...prev, mediaUrl: url }));
      }
    } catch (err: any) {
      console.error("Upload falhou:", err);
      alert("Erro ao enviar arquivo para o servidor. Tente novamente.");
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFile(e.dataTransfer.files[0]);
    }
  };

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    if (needsMedia && !form.mediaUrl?.trim()) return;
    if (!needsMedia && !form.content.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, input: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function startEdit(template: MessageTemplate) {
    setEditingId(template.id);
    setForm({
      category: template.category,
      title: template.title,
      content: template.content,
      messageType: template.messageType,
      mediaUrl: template.mediaUrl,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  const templates = templatesQuery.data ?? [];
  const filtered = filterCategory === "todas" ? templates : templates.filter((t) => t.category === filterCategory);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="page-stack liquid-page-stack">
      <style>{`
        .liquid-page-stack {
          --accent: #10b981 !important;
          --accent-2: #059669 !important;
          --accent-3: #a7f3d0 !important;
          position: relative;
          background: radial-gradient(circle at 12% 15%, rgba(16, 185, 129, 0.08) 0%, transparent 45%),
                      radial-gradient(circle at 88% 85%, rgba(5, 150, 105, 0.08) 0%, transparent 45%),
                      #f8fafc;
          min-height: calc(100vh - 100px);
          padding: 1.5rem;
        }
        .liquid-panel {
          position: relative;
          background: rgba(255, 255, 255, 0.65) !important;
          backdrop-filter: blur(20px) saturate(140%) !important;
          -webkit-backdrop-filter: blur(20px) saturate(140%) !important;
          border: 1px solid rgba(255, 255, 255, 0.5) !important;
          box-shadow: 0 10px 40px -10px rgba(15, 23, 42, 0.06),
                      inset 0 1px 0 0 rgba(255, 255, 255, 0.4) !important;
          border-radius: 16px;
          transition: all 0.2s ease-in-out;
        }
        .liquid-panel:hover {
          background: rgba(255, 255, 255, 0.72) !important;
          box-shadow: 0 12px 48px -8px rgba(15, 23, 42, 0.09),
                      inset 0 1px 0 0 rgba(255, 255, 255, 0.5) !important;
        }
        .templates-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.5rem;
          align-items: flex-start;
        }
        @media (min-width: 1024px) {
          .templates-grid {
            grid-template-columns: 4fr 5fr;
          }
        }
        .page-filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          min-height: 34px;
          padding: 0 0.85rem;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 8px;
          background: #ffffff;
          color: #475569;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease-in-out;
        }
        .page-filter-chip:hover {
          background: #f8fafc;
          border-color: rgba(0, 0, 0, 0.15);
          color: #0f172a;
        }
        .page-filter-chip.active {
          background: #059669;
          border-color: #059669;
          color: #ffffff;
          font-weight: 700;
        }
        .premium-header-title,
        .premium-title {
          background: linear-gradient(135deg, #0f172a 0%, #059669 100%) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
        }
        
        .page-btn-primary {
          background: linear-gradient(135deg, #10b981, #059669);
          color: #ffffff;
          border: 0;
          border-radius: 999px;
          padding: 0.65rem 1.25rem;
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          cursor: pointer;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
          transition: all 0.16s ease;
        }
        .page-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.3);
        }
        .page-btn-primary:disabled {
          cursor: not-allowed;
          opacity: 0.55;
          background: #cbd5e1;
          color: #64748b;
          box-shadow: none;
        }
        
        .page-btn-secondary {
          background: #ffffff;
          color: #475569;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 999px;
          padding: 0.65rem 1.25rem;
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          cursor: pointer;
          font-weight: 700;
          transition: all 0.16s ease;
        }
        .page-btn-secondary:hover:not(:disabled) {
          background: #f8fafc;
          border-color: rgba(0, 0, 0, 0.15);
          color: #0f172a;
          transform: translateY(-1px);
        }
        .page-btn-secondary:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        
        .page-btn-danger {
          background: #ffffff;
          color: #dc2626;
          border: 1px solid rgba(220, 38, 38, 0.2);
          border-radius: 999px;
          padding: 0.65rem 1.25rem;
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          cursor: pointer;
          font-weight: 700;
          transition: all 0.16s ease;
        }
        .page-btn-danger:hover:not(:disabled) {
          background: #fef2f2;
          border-color: #dc2626;
          transform: translateY(-1px);
        }
        .page-btn-danger:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        
        .page-btn-sm {
          padding: 0.4rem 0.8rem;
          font-size: 0.78rem;
          min-height: auto;
        }
        
        /* ── Simulated WhatsApp Previews ── */
        .tmpl-wa-chat {
          background: #efeae2;
          background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png');
          background-size: repeat;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          border: 1px solid #e1d9d1;
          display: flex;
          flex-direction: column;
          width: 100%;
          max-width: 480px;
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);
          margin-top: 0.35rem;
        }
        .tmpl-wa-bubble {
          background: #d9fdd3;
          align-self: flex-end;
          padding: 0.45rem 0.6rem 0.3rem 0.6rem;
          border-radius: 8px 0 8px 8px;
          box-shadow: 0 1px 1px rgba(0,0,0,0.12);
          max-width: 90%;
          word-break: break-word;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .tmpl-wa-bubble.has-media {
          padding: 0.3rem;
          border-radius: 8px;
        }
        .tmpl-wa-media {
          max-width: 100%;
          max-height: 180px;
          border-radius: 6px;
          object-fit: cover;
          display: block;
        }
        .tmpl-wa-text {
          font-size: 0.82rem;
          color: #111b21;
          line-height: 1.45;
          white-space: pre-wrap;
          padding: 0.2rem 0.3rem;
        }
        .tmpl-wa-time-container {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.2rem;
          margin-top: 0.1rem;
          padding-right: 0.2rem;
        }
        .tmpl-wa-time {
          font-size: 0.62rem;
          color: #667781;
          font-weight: 550;
        }
        .tmpl-wa-checks {
          font-size: 0.72rem;
          color: #53bdeb;
          font-weight: 700;
          line-height: 1;
        }
        
        .badge.reativacao { background: #ecfdf5; color: #047857; }
        .badge.follow_up { background: #fef3c7; color: #b45309; }
        .badge.promocao { background: #eff6ff; color: #1d4ed8; }
        .badge.credito { background: #fdf2f8; color: #be185d; }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div className="templates-grid">
        {/* Form */}
        <section className="panel liquid-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Comunicação / Templates</p>
              <h2 className="premium-header-title">{editingId ? "Editar template" : "Novo template"}</h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label className="input-label">Categoria</label>
              <select
                className="input-field"
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as MessageTemplate["category"] }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label">Título</label>
              <input
                className="input-field"
                type="text"
                placeholder="Ex: Cobrança amigável"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="input-label">Tipo de mensagem</label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              {(["TEXT", "IMAGE", "VIDEO"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`page-filter-chip ${form.messageType === t ? "active" : ""}`}
                  onClick={() => setForm((prev) => ({ ...prev, messageType: t, mediaUrl: null }))}
                >
                  {t === "TEXT" ? "Texto" : t === "IMAGE" ? "Imagem" : "Vídeo"}
                </button>
              ))}
            </div>
          </div>

          {needsMedia ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <label className="input-label">
                {form.messageType === "IMAGE" ? "Arquivo de Imagem" : "Arquivo de Vídeo"}
              </label>
              
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                style={{
                  border: dragActive 
                    ? "2px solid #10b981" 
                    : uploadingMedia 
                      ? "2px solid #059669" 
                      : "2px dashed #cbd5e1",
                  background: dragActive 
                    ? "rgba(16, 185, 129, 0.04)" 
                    : uploadingMedia 
                      ? "#f0fdf4" 
                      : form.mediaUrl 
                        ? "#f8fafc" 
                        : "#ffffff",
                  borderRadius: "12px",
                  padding: "1.5rem",
                  textAlign: "center",
                  cursor: uploadingMedia ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease-in-out",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.75rem",
                  minHeight: "130px"
                }}
                onClick={() => {
                  if (!uploadingMedia) {
                    document.getElementById("media-file-input")?.click();
                  }
                }}
              >
                <input
                  id="media-file-input"
                  type="file"
                  accept={form.messageType === "IMAGE" ? "image/jpeg,image/jpg,image/png,image/gif,image/webp" : "video/mp4"}
                  style={{ display: "none" }}
                  disabled={uploadingMedia}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      await handleFile(file);
                    }
                    e.target.value = "";
                  }}
                />

                {uploadingMedia ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", color: "#10b981" }}>
                    <div style={{
                      width: "24px",
                      height: "24px",
                      border: "3px solid #10b981",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite"
                    }} />
                    <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>Enviando arquivo...</span>
                  </div>
                ) : form.mediaUrl ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", width: "100%" }}>
                    {form.messageType === "IMAGE" ? (
                      <img 
                        src={getDisplayMediaUrl(form.mediaUrl)} 
                        alt="Prévia" 
                        style={{ maxWidth: "160px", maxHeight: "100px", borderRadius: "6px", objectFit: "contain", border: "1px solid #e2e8f0" }} 
                      />
                    ) : (
                      <video 
                        src={getDisplayMediaUrl(form.mediaUrl)} 
                        style={{ maxWidth: "160px", maxHeight: "100px", borderRadius: "6px", border: "1px solid #e2e8f0" }} 
                        controls
                      />
                    )}
                    <span style={{ fontSize: "0.78rem", color: "#64748b", wordBreak: "break-all", maxWidth: "90%" }}>
                      Arquivo carregado com sucesso!
                    </span>
                    <button
                      type="button"
                      className="page-btn-secondary page-btn-sm"
                      style={{ padding: "0.25rem 0.6rem", fontSize: "0.72rem" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setForm((prev) => ({ ...prev, mediaUrl: null }));
                      }}
                    >
                      Remover arquivo
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
                    <span style={{ fontSize: "1.5rem" }}>📁</span>
                    <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#1e293b" }}>
                      Arraste e solte o arquivo aqui
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                      ou clique para selecionar do computador (máx {form.messageType === "IMAGE" ? "10MB" : "16MB"})
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "0.5rem 0" }}>
                <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600 }}>OU USE UMA URL</span>
                <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
              </div>

              <div>
                <label className="input-label" style={{ fontSize: "0.75rem" }}>
                  Link público da {form.messageType === "IMAGE" ? "imagem" : "vídeo"} (https://...)
                </label>
                <input
                  className="input-field"
                  type="text"
                  placeholder="https://..."
                  value={form.mediaUrl ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, mediaUrl: e.target.value || null }))}
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className="input-label">
              {needsMedia ? "Legenda (opcional)" : "Mensagem"}
              <span style={{ marginLeft: "0.5rem", fontWeight: 400, opacity: 0.6, fontSize: "0.8rem" }}>
                Use /titulo para acionar no chat de mensagens
              </span>
            </label>
            <textarea
              className="input-field"
              rows={needsMedia ? 3 : 5}
              placeholder={needsMedia ? "Texto que acompanha a mídia..." : "Digite a mensagem pronta..."}
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Live Preview of the template being edited/created */}
          <div style={{ marginTop: "1.2rem", borderTop: "1px dashed #e2e8f0", paddingTop: "1.2rem" }}>
            <label className="input-label" style={{ marginBottom: "0.6rem", display: "block" }}>
              Visualização em Tempo Real (WhatsApp)
            </label>
            <div className="tmpl-wa-chat">
              {needsMedia && form.mediaUrl ? (
                <div className="tmpl-wa-bubble has-media">
                  {form.messageType === "IMAGE" ? (
                    <img src={getDisplayMediaUrl(form.mediaUrl)} alt="Mídia" className="tmpl-wa-media" />
                  ) : (
                    <video src={getDisplayMediaUrl(form.mediaUrl)} className="tmpl-wa-media" controls />
                  )}
                  {form.content && (
                    <div className="tmpl-wa-text">{form.content}</div>
                  )}
                  <div className="tmpl-wa-time-container">
                    <span className="tmpl-wa-time">09:00</span>
                    <span className="tmpl-wa-checks">✓✓</span>
                  </div>
                </div>
              ) : (
                <div className="tmpl-wa-bubble">
                  <div className="tmpl-wa-text">{form.content || "Digite sua legenda/mensagem..."}</div>
                  <div className="tmpl-wa-time-container">
                    <span className="tmpl-wa-time">09:00</span>
                    <span className="tmpl-wa-checks">✓✓</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="submit"
              className="page-btn-primary"
              disabled={isSaving || !form.title.trim() || (needsMedia ? !form.mediaUrl?.trim() : !form.content.trim())}
            >
              {isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar template"}
            </button>
            {editingId ? (
              <button type="button" className="page-btn-secondary" onClick={cancelEdit}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {/* List */}
      <section className="panel liquid-panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Templates salvos</h3>
            <p className="panel-subcopy">{templates.length} template{templates.length !== 1 ? "s" : ""} cadastrado{templates.length !== 1 ? "s" : ""}</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className={`page-filter-chip ${filterCategory === "todas" ? "active" : ""}`}
              onClick={() => setFilterCategory("todas")}
            >
              Todas
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`page-filter-chip ${filterCategory === c.value ? "active" : ""}`}
                onClick={() => setFilterCategory(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {templatesQuery.isLoading ? (
          <div className="page-loading">Carregando templates...</div>
        ) : filtered.length === 0 ? (
          <div className="panel-empty">Nenhum template encontrado.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {filtered.map((template) => (
              <div
                key={template.id}
                className="panel-row"
                style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "1rem", alignItems: "start" }}
              >
                <span className={`badge ${template.category}`} style={{ marginTop: "0.15rem", whiteSpace: "nowrap" }}>
                  {categoryLabel(template.category)}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", width: "100%", minWidth: 0 }}>
                  <p style={{ fontWeight: 700, margin: 0, fontSize: "0.92rem", color: "#1e293b" }}>{template.title}</p>
                  
                  {/* WhatsApp Chat Preview */}
                  <div className="tmpl-wa-chat">
                    {template.mediaUrl ? (
                      <div className="tmpl-wa-bubble has-media">
                        {template.messageType === "IMAGE" ? (
                          <img src={getDisplayMediaUrl(template.mediaUrl)} alt="Mídia" className="tmpl-wa-media" />
                        ) : (
                          <video src={getDisplayMediaUrl(template.mediaUrl)} className="tmpl-wa-media" controls />
                        )}
                        {template.content && (
                          <div className="tmpl-wa-text">{template.content}</div>
                        )}
                        <div className="tmpl-wa-time-container">
                          <span className="tmpl-wa-time">09:00</span>
                          <span className="tmpl-wa-checks">✓✓</span>
                        </div>
                      </div>
                    ) : (
                      <div className="tmpl-wa-bubble">
                        <div className="tmpl-wa-text">{template.content}</div>
                        <div className="tmpl-wa-time-container">
                          <span className="tmpl-wa-time">09:00</span>
                          <span className="tmpl-wa-checks">✓✓</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  <button type="button" className="page-btn-secondary page-btn-sm" onClick={() => startEdit(template)}>
                    Editar
                  </button>
                  {deleteConfirm === template.id ? (
                    <>
                      <button
                        type="button"
                        className="page-btn-danger page-btn-sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(template.id)}
                      >
                        Confirmar
                      </button>
                      <button type="button" className="page-btn-secondary page-btn-sm" onClick={() => setDeleteConfirm(null)}>
                        Não
                      </button>
                    </>
                  ) : (
                    <button type="button" className="page-btn-secondary page-btn-sm" onClick={() => setDeleteConfirm(template.id)}>
                      Apagar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
