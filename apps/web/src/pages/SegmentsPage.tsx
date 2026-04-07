import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SavedSegment, SegmentDefinition } from "@olist-crm/shared";
import { CustomerTable } from "../components/CustomerTable";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";

const initialDefinition: SegmentDefinition = {
  status: ["INACTIVE"],
  minDaysInactive: 90,
  minTotalSpent: 0,
};

function sanitizeSegmentDefinition(definition: SegmentDefinition): SegmentDefinition {
  const { frequencyDropRatio: _frequencyDropRatio, ...cleanDefinition } = definition;
  return cleanDefinition;
}

function summarizeSegment(segment: SavedSegment) {
  const parts: string[] = [];

  if (segment.definition.status?.length) {
    const status = segment.definition.status[0];
    parts.push(status === "ACTIVE" ? "Ativos" : status === "ATTENTION" ? "Atencao" : "Inativos");
  }

  if (segment.definition.minDaysInactive !== undefined) {
    parts.push(`${segment.definition.minDaysInactive}+ dias`);
  }

  if (segment.definition.labels?.length) {
    parts.push(`Rotulo: ${segment.definition.labels[0]}`);
  }

  return parts.length ? parts.join(" | ") : "Filtro dinamico salvo";
}

export function SegmentsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [definition, setDefinition] = useState<SegmentDefinition>(() => sanitizeSegmentDefinition(initialDefinition));
  const [segmentName, setSegmentName] = useState("");
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [segmentMessage, setSegmentMessage] = useState("");

  const labelsQuery = useQuery({
    queryKey: ["customer-labels"],
    queryFn: () => api.customerLabels(token!),
    enabled: Boolean(token),
  });

  const savedSegmentsQuery = useQuery({
    queryKey: ["saved-segments"],
    queryFn: () => api.savedSegments(token!),
    enabled: Boolean(token),
  });

  const previewMutation = useMutation({
    mutationFn: (input: SegmentDefinition) => api.previewSegment(token!, input),
  });

  const saveSegmentMutation = useMutation({
    mutationFn: (input: { name: string; definition: SegmentDefinition }) =>
      activeSegmentId ? api.updateSavedSegment(token!, activeSegmentId, input) : api.createSavedSegment(token!, input),
    onSuccess: (savedSegment) => {
      setActiveSegmentId(savedSegment.id);
      setSegmentName(savedSegment.name);
      setSegmentMessage(activeSegmentId ? "Publico atualizado com sucesso." : "Publico salvo com sucesso.");
      void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
    },
  });

  const duplicateSegmentMutation = useMutation({
    mutationFn: (input: { name: string; definition: SegmentDefinition }) => api.createSavedSegment(token!, input),
    onSuccess: (savedSegment) => {
      setActiveSegmentId(savedSegment.id);
      setSegmentName(savedSegment.name);
      setSegmentMessage("Publico duplicado com sucesso.");
      void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
    },
  });

  const deleteSegmentMutation = useMutation({
    mutationFn: (id: string) => api.deleteSavedSegment(token!, id),
    onSuccess: () => {
      setActiveSegmentId(null);
      setSegmentName("");
      setSegmentMessage("Publico excluido.");
      void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleanDefinition = sanitizeSegmentDefinition(definition);
    setDefinition(cleanDefinition);
    previewMutation.mutate(cleanDefinition);
    setSegmentMessage("");
  }

  function openSavedSegment(segment: SavedSegment) {
    const cleanDefinition = sanitizeSegmentDefinition(segment.definition);
    setDefinition(cleanDefinition);
    setSegmentName(segment.name);
    setActiveSegmentId(segment.id);
    setSegmentMessage("");
    previewMutation.mutate(cleanDefinition);
  }

  function handleSaveSegment() {
    const cleanedName = segmentName.trim();
    if (!cleanedName) {
      setSegmentMessage("Dê um nome ao publico antes de salvar.");
      return;
    }

    saveSegmentMutation.mutate({
      name: cleanedName,
      definition: sanitizeSegmentDefinition(definition),
    });
  }

  function handleDuplicateSegment() {
    const baseName = segmentName.trim() || "Publico acionavel";
    duplicateSegmentMutation.mutate({
      name: `${baseName} copia`,
      definition: sanitizeSegmentDefinition(definition),
    });
  }

  function handleDeleteSegment() {
    if (!activeSegmentId) {
      return;
    }

    deleteSegmentMutation.mutate(activeSegmentId);
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

          <div className="filters-grid filters-grid-four segment-filters-grid">
            <label className="full-span">
              Nome do publico
              <input
                value={segmentName}
                onChange={(event) => {
                  setSegmentName(event.target.value);
                  setSegmentMessage("");
                }}
                placeholder="Ex: Reativacao premium do mes"
              />
            </label>

            <label className="segment-filter-half">
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

            <label className="segment-filter-half">
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

            <label className="segment-filter-half">
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

            <label className="segment-filter-half">
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

            <label className="segment-filter-half">
              Com rotulo
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

            <label className="segment-filter-half">
              Excluir rotulo
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

          <div className="inline-actions segment-actions-bar">
            <button className="primary-button" type="submit">
              Pre-visualizar segmento
            </button>
            <button className="ghost-button" type="button" onClick={handleSaveSegment} disabled={saveSegmentMutation.isPending}>
              {saveSegmentMutation.isPending ? "Salvando..." : activeSegmentId ? "Atualizar publico" : "Salvar publico"}
            </button>
            <button className="ghost-button" type="button" onClick={handleDuplicateSegment} disabled={duplicateSegmentMutation.isPending}>
              {duplicateSegmentMutation.isPending ? "Duplicando..." : "Duplicar"}
            </button>
            {activeSegmentId ? (
              <button className="ghost-button danger" type="button" onClick={handleDeleteSegment} disabled={deleteSegmentMutation.isPending}>
                {deleteSegmentMutation.isPending ? "Excluindo..." : "Excluir"}
              </button>
            ) : null}
            {segmentMessage ? <span className="save-ok">{segmentMessage}</span> : null}
          </div>
        </form>

        <article className="panel segment-summary-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Resumo</p>
              <h3>Resultado esperado</h3>
              <p className="panel-subcopy">A previa aparece aqui para você decidir se esse publico vale salvar e acionar.</p>
            </div>
          </div>

          {previewMutation.data ? (
            <>
              <div className="detail-grid segment-summary-grid">
                <div>
                  <span>Clientes</span>
                  <strong>{formatNumber(previewMutation.data.summary.totalCustomers)}</strong>
                </div>
                <div>
                  <span>Prioridade media</span>
                  <strong>{Number(previewMutation.data.summary.averagePriorityScore ?? 0).toFixed(1)}</strong>
                </div>
                <div>
                  <span>Faturamento</span>
                  <strong>{formatCurrency(previewMutation.data.summary.potentialRecoveredRevenue ?? 0)}</strong>
                </div>
                <div>
                  <span>Media de pecas/pedido</span>
                  <strong>{formatNumber(previewMutation.data.summary.potentialRecoveredPieces ?? 0)}</strong>
                </div>
              </div>
              <div className="detail-grid segment-summary-grid" style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#2563eb' }}>Potencial mensal se recuperarmos</span>
                </div>
                <div>
                  <span>Faturamento/mes</span>
                  <strong style={{ color: '#2563eb' }}>{formatCurrency(previewMutation.data.summary.monthlyPotentialRevenue ?? 0)}</strong>
                </div>
                <div>
                  <span>Pecas/mes</span>
                  <strong style={{ color: '#2563eb' }}>{formatNumber(previewMutation.data.summary.monthlyPotentialPieces ?? 0)}</strong>
                </div>
              </div>
              <p className="panel-subcopy segment-summary-note">
                A primeira linha mostra dados historicos: media de pecas por pedido e soma dos tickets medios de cada cliente.
                A segunda linha projeta o potencial mensal caso consigamos recuperar esses clientes, baseado no historico de 
                compras (frequencia e valor) de cada um.
              </p>
            </>
          ) : (
            <div className="empty-state">
              Gere a previa para ver quantos clientes entram no publico, qual a prioridade media e o potencial estimado.
            </div>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Biblioteca compartilhada</p>
            <h3>Publicos salvos</h3>
            <p className="panel-subcopy">Guarde filtros que funcionam bem para a equipe reaproveitar depois.</p>
          </div>
        </div>

        {savedSegmentsQuery.isLoading ? <div className="page-loading">Carregando publicos...</div> : null}
        {savedSegmentsQuery.isError ? <div className="page-error">Nao foi possivel carregar os publicos salvos.</div> : null}
        {!savedSegmentsQuery.isLoading && !savedSegmentsQuery.isError ? (
          savedSegmentsQuery.data?.length ? (
            <div className="saved-segment-list">
              {savedSegmentsQuery.data.map((segment) => (
                <button
                  key={segment.id}
                  type="button"
                  className={`saved-segment-card ${segment.id === activeSegmentId ? "is-active" : ""}`}
                  onClick={() => openSavedSegment(segment)}
                >
                  <strong>{segment.name}</strong>
                  <span>{summarizeSegment(segment)}</span>
                </button>
              ))}
            </div>
          ) : null
        ) : null}
        {!savedSegmentsQuery.isLoading && !savedSegmentsQuery.isError && !savedSegmentsQuery.data?.length ? (
          <div className="empty-state">Nenhum publico salvo ainda. Monte um filtro e salve para a equipe reaproveitar.</div>
        ) : null}
      </section>

      {previewMutation.data ? <CustomerTable customers={previewMutation.data.customers} /> : null}
    </div>
  );
}
