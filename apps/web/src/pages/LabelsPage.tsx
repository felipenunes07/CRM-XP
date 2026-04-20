import { AMBASSADOR_LABEL_NAME } from "@olist-crm/shared";
import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

export function LabelsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState("");

  const labelsQuery = useQuery({
    queryKey: ["customer-labels"],
    queryFn: () => api.customerLabels(token!),
    enabled: Boolean(token),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createCustomerLabel(token!, name),
    onSuccess: () => {
      setNewLabel("");
      void queryClient.invalidateQueries({ queryKey: ["customer-labels"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCustomerLabel(token!, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customer-labels"] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["ambassadors"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, color }: { id: string; color: string }) => api.updateCustomerLabel(token!, id, color),
    onSuccess: () => {
      setEditingLabelId(null);
      setEditingColor("");
      void queryClient.invalidateQueries({ queryKey: ["customer-labels"] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["ambassadors"] });
    },
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newLabel.trim()) {
      return;
    }

    createMutation.mutate(newLabel.trim());
  }

  function startEditColor(labelId: string, currentColor: string) {
    setEditingLabelId(labelId);
    setEditingColor(currentColor);
  }

  function cancelEdit() {
    setEditingLabelId(null);
    setEditingColor("");
  }

  function saveColor(labelId: string) {
    if (editingColor && /^#[0-9A-Fa-f]{6}$/.test(editingColor)) {
      updateMutation.mutate({ id: labelId, color: editingColor });
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Rotulos</p>
            <h2 className="premium-header-title">Crie e apague rotulos do sistema</h2>
          </div>
        </div>

        <form className="label-create-row" onSubmit={handleCreate}>
          <input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Ex: Lista negra, Nao insistir, Pode reativar"
          />
          <button type="submit" className="primary-button" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Criando..." : "Criar rotulo"}
          </button>
        </form>

        {createMutation.isError ? <div className="inline-error">Nao foi possivel criar esse rotulo.</div> : null}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Biblioteca</p>
            <h3>Rotulos disponiveis</h3>
          </div>
        </div>

        {labelsQuery.isLoading ? <div className="page-loading">Carregando rotulos...</div> : null}
        {labelsQuery.isError ? <div className="page-error">Falha ao carregar os rotulos.</div> : null}

        {labelsQuery.data ? (
          <div className="label-library">
            {labelsQuery.data.length ? (
              labelsQuery.data.map((label) => (
                <div key={label.id} className="label-library-item">
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                    <span
                      className="tag"
                      style={{ background: `${label.color}14`, color: label.color, borderColor: `${label.color}33` }}
                    >
                      {label.name}
                    </span>
                    {editingLabelId === label.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="color"
                          value={editingColor}
                          onChange={(e) => setEditingColor(e.target.value)}
                          style={{ width: "40px", height: "32px", cursor: "pointer", border: "1px solid #ddd", borderRadius: "4px" }}
                        />
                        <input
                          type="text"
                          value={editingColor}
                          onChange={(e) => setEditingColor(e.target.value)}
                          placeholder="#000000"
                          maxLength={7}
                          style={{ width: "90px", padding: "4px 8px", fontSize: "14px", fontFamily: "monospace" }}
                        />
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => saveColor(label.id)}
                          disabled={updateMutation.isPending || !/^#[0-9A-Fa-f]{6}$/.test(editingColor)}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={cancelEdit}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => startEditColor(label.id, label.color)}
                        disabled={updateMutation.isPending}
                      >
                        Alterar cor
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => deleteMutation.mutate(label.id)}
                    disabled={deleteMutation.isPending || label.name === AMBASSADOR_LABEL_NAME}
                  >
                    {label.name === AMBASSADOR_LABEL_NAME ? "Reservado" : "Apagar"}
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state">Nenhum rotulo criado ainda.</div>
            )}
          </div>
        ) : null}

        <p className="panel-subcopy">
          Quando voce apaga um rotulo aqui, ele sai do sistema inteiro e deixa de ficar aplicado nos clientes. O
          rotulo {AMBASSADOR_LABEL_NAME} fica protegido porque alimenta a aba de acompanhamento dos embaixadores.
        </p>
      </section>
    </div>
  );
}
