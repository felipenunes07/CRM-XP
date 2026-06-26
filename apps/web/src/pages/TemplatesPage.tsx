import type { MessageTemplate } from "@olist-crm/shared";
import { FormEvent, useState } from "react";
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

const EMPTY_FORM = { category: "follow_up" as MessageTemplate["category"], title: "", content: "" };

export function TemplatesPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<MessageTemplate["category"] | "todas">("todas");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, input: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function startEdit(template: MessageTemplate) {
    setEditingId(template.id);
    setForm({ category: template.category, title: template.title, content: template.content });
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
    <div className="page-stack">
      {/* Form */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Comunicação / Templates</p>
            <h2 className="premium-header-title">{editingId ? "Editar template" : "Novo template"}</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "640px" }}>
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
            <label className="input-label">
              Mensagem
              <span style={{ marginLeft: "0.5rem", fontWeight: 400, opacity: 0.6, fontSize: "0.8rem" }}>
                Use /titulo para acionar no chat de mensagens
              </span>
            </label>
            <textarea
              className="input-field"
              rows={5}
              placeholder="Digite a mensagem pronta..."
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              style={{ resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="submit" className="btn-primary" disabled={isSaving || !form.title.trim() || !form.content.trim()}>
              {isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar template"}
            </button>
            {editingId ? (
              <button type="button" className="btn-secondary" onClick={cancelEdit}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </section>

      {/* List */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Templates salvos</h3>
            <p className="panel-subcopy">{templates.length} template{templates.length !== 1 ? "s" : ""} cadastrado{templates.length !== 1 ? "s" : ""}</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`filter-chip ${filterCategory === "todas" ? "active" : ""}`}
              onClick={() => setFilterCategory("todas")}
            >
              Todas
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`filter-chip ${filterCategory === c.value ? "active" : ""}`}
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
                <span className="badge" style={{ marginTop: "0.15rem", whiteSpace: "nowrap" }}>
                  {categoryLabel(template.category)}
                </span>
                <div>
                  <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>{template.title}</p>
                  <p style={{ opacity: 0.7, fontSize: "0.875rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{template.content}</p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => startEdit(template)}>
                    Editar
                  </button>
                  {deleteConfirm === template.id ? (
                    <>
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(template.id)}
                      >
                        Confirmar
                      </button>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setDeleteConfirm(null)}>
                        Não
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setDeleteConfirm(template.id)}>
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
  );
}
