import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { SegmentDefinition } from "@olist-crm/shared";
import { CustomerTable } from "../components/CustomerTable";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";

const initialDefinition: SegmentDefinition = {
  status: ["INACTIVE"],
  minDaysInactive: 90,
  minTotalSpent: 0,
};

export function SegmentsPage() {
  const { token } = useAuth();
  const [definition, setDefinition] = useState<SegmentDefinition>(initialDefinition);
  const labelsQuery = useQuery({
    queryKey: ["customer-labels"],
    queryFn: () => api.customerLabels(token!),
    enabled: Boolean(token),
  });

  const previewMutation = useMutation({
    mutationFn: (input: SegmentDefinition) => api.previewSegment(token!, input),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    previewMutation.mutate(definition);
  }

  return (
    <div className="page-stack">
      <section className="grid-two">
        <form className="panel" onSubmit={handleSubmit}>
          <div className="panel-header">
            <div>
              <p className="eyebrow">Segmentacao inteligente</p>
              <h2>Monte um publico acionavel</h2>
            </div>
          </div>

          <div className="filters-grid filters-grid-four">
            <label>
              Status
              <select
                value={definition.status?.[0] ?? ""}
                onChange={(event) =>
                  setDefinition((current) => ({
                    ...current,
                    status: event.target.value ? [event.target.value as "ACTIVE" | "ATTENTION" | "INACTIVE"] : undefined,
                  }))
                }
              >
                <option value="">Todos</option>
                <option value="ACTIVE">Ativos</option>
                <option value="ATTENTION">Atencao</option>
                <option value="INACTIVE">Inativos</option>
              </select>
            </label>

            <label>
              Minimo de dias inativo
              <input
                type="number"
                value={definition.minDaysInactive ?? ""}
                onChange={(event) =>
                  setDefinition((current) => ({
                    ...current,
                    minDaysInactive: event.target.value ? Number(event.target.value) : undefined,
                  }))
                }
              />
            </label>

            <label>
              Ticket minimo
              <input
                type="number"
                value={definition.minAvgTicket ?? ""}
                onChange={(event) =>
                  setDefinition((current) => ({
                    ...current,
                    minAvgTicket: event.target.value ? Number(event.target.value) : undefined,
                  }))
                }
              />
            </label>

            <label>
              Total gasto minimo
              <input
                type="number"
                value={definition.minTotalSpent ?? ""}
                onChange={(event) =>
                  setDefinition((current) => ({
                    ...current,
                    minTotalSpent: event.target.value ? Number(event.target.value) : undefined,
                  }))
                }
              />
            </label>

            <label>
              Queda minima de frequencia
              <input
                type="number"
                step="0.1"
                value={definition.frequencyDropRatio ?? ""}
                onChange={(event) =>
                  setDefinition((current) => ({
                    ...current,
                    frequencyDropRatio: event.target.value ? Number(event.target.value) : undefined,
                  }))
                }
              />
            </label>

            <label>
              Com rótulo
              <select
                value={definition.labels?.[0] ?? ""}
                onChange={(event) =>
                  setDefinition((current) => ({
                    ...current,
                    labels: event.target.value ? [event.target.value] : undefined,
                  }))
                }
              >
                <option value="">Todos</option>
                {labelsQuery.data?.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Excluir rótulo
              <select
                value={definition.excludeLabels?.[0] ?? ""}
                onChange={(event) =>
                  setDefinition((current) => ({
                    ...current,
                    excludeLabels: event.target.value ? [event.target.value] : undefined,
                  }))
                }
              >
                <option value="">Nenhum</option>
                {labelsQuery.data?.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button className="primary-button" type="submit">
            Pre-visualizar segmento
          </button>
        </form>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Resumo</p>
              <h3>Resultado esperado</h3>
            </div>
          </div>
          {previewMutation.data ? (
            <div className="detail-grid">
              <div>
                <span>Clientes</span>
                <strong>{formatNumber(previewMutation.data.summary.totalCustomers)}</strong>
              </div>
              <div>
                <span>Prioridade media</span>
                <strong>{Number(previewMutation.data.summary.averagePriorityScore ?? 0).toFixed(1)}</strong>
              </div>
              <div>
                <span>Potencial de faturamento</span>
                <strong>{formatCurrency(previewMutation.data.summary.potentialRecoveredRevenue ?? 0)}</strong>
              </div>
              <div>
                <span>Pecas potenciais</span>
                <strong>{formatNumber(previewMutation.data.summary.potentialRecoveredPieces ?? 0)}</strong>
              </div>
            </div>
          ) : (
            <p className="muted-copy">Monte o filtro e gere a previa para ver a populacao do segmento.</p>
          )}

          {previewMutation.data ? (
            <p className="panel-subcopy">
              O potencial de faturamento mostra quanto a empresa pode voltar a movimentar se conseguir reativar esse
              publico, usando como base o ticket medio historico de cada cliente do segmento. As pecas potenciais usam
              a media de pecas por pedido desse mesmo publico.
            </p>
          ) : null}
        </article>
      </section>

      {previewMutation.data ? <CustomerTable customers={previewMutation.data.customers} /> : null}
    </div>
  );
}
