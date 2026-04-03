import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

export function LabelsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");

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
    },
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newLabel.trim()) {
      return;
    }

    createMutation.mutate(newLabel.trim());
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Rotulos</p>
            <h2>Crie e apague rotulos do sistema</h2>
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
                  <span
                    className="tag"
                    style={{ background: `${label.color}14`, color: label.color, borderColor: `${label.color}33` }}
                  >
                    {label.name}
                  </span>
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => deleteMutation.mutate(label.id)}
                    disabled={deleteMutation.isPending}
                  >
                    Apagar
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-state">Nenhum rotulo criado ainda.</div>
            )}
          </div>
        ) : null}

        <p className="panel-subcopy">
          Quando voce apaga um rotulo aqui, ele sai do sistema inteiro e deixa de ficar aplicado nos clientes.
        </p>
      </section>
    </div>
  );
}
