import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MessageTemplate } from "@olist-crm/shared";
import { Copy, PencilLine, Trash2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

const emptyTemplate: Pick<MessageTemplate, "category" | "title" | "content"> = {
  category: "reativacao",
  title: "",
  content: "",
};

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => undefined);
}

export function MessagesPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(emptyTemplate);
  const [editingId, setEditingId] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => api.messageTemplates(token!),
    enabled: Boolean(token),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Pick<MessageTemplate, "category" | "title" | "content">) => {
      if (editingId) {
        return api.updateMessageTemplate(token!, editingId, payload);
      }
      return api.createMessageTemplate(token!, payload);
    },
    onSuccess: async () => {
      setDraft(emptyTemplate);
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMessageTemplate(token!, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["message-templates"] });
    },
  });

  const grouped = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate(draft);
  }

  return (
    <div className="page-stack">
      <section className="grid-two">
        <form className="panel" onSubmit={handleSubmit}>
          <div className="panel-header">
            <div>
              <p className="eyebrow">Biblioteca de mensagens</p>
              <h2>{editingId ? "Editar template" : "Criar template"}</h2>
            </div>
          </div>

          <div className="filters-grid">
            <label>
              Categoria
              <select
                value={draft.category}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, category: event.target.value as MessageTemplate["category"] }))
                }
              >
                <option value="reativacao">Reativação</option>
                <option value="follow_up">Follow-up</option>
                <option value="promocao">Promoção</option>
              </select>
            </label>

            <label className="full-span">
              Título
              <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
            </label>

            <label className="full-span">
              Conteúdo
              <textarea
                rows={6}
                value={draft.content}
                onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
              />
            </label>
          </div>

          <div className="inline-actions">
            <button className="primary-button" type="submit">
              {editingId ? "Salvar alterações" : "Criar template"}
            </button>
            {editingId ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyTemplate);
                }}
              >
                Cancelar edição
              </button>
            ) : null}
          </div>
        </form>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Prévia</p>
              <h3>Como o texto vai sair para o time</h3>
            </div>
          </div>
          <div className="message-preview">{draft.content || "Escreva um template para visualizar aqui."}</div>
        </article>
      </section>

      <section className="message-grid">
        {grouped.map((template) => (
          <article key={template.id} className="panel message-card">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{template.category}</p>
                <h3>{template.title}</h3>
              </div>
            </div>
            <p>{template.content}</p>
            <div className="inline-actions">
              <button className="ghost-button" type="button" onClick={() => copyText(template.content)}>
                <Copy size={16} />
                Copiar
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setEditingId(template.id);
                  setDraft({
                    category: template.category,
                    title: template.title,
                    content: template.content,
                  });
                }}
              >
                <PencilLine size={16} />
                Editar
              </button>
              <button className="ghost-button danger" type="button" onClick={() => deleteMutation.mutate(template.id)}>
                <Trash2 size={16} />
                Excluir
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
