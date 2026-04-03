import type { CustomerDetail, InsightTag } from "@olist-crm/shared";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { InfoHint } from "../components/InfoHint";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, formatPercent, statusLabel } from "../lib/format";

const insightLabels: Record<InsightTag, string> = {
  alto_valor: "Alto valor",
  reativacao: "Reativacao",
  recorrente: "Recorrente",
  queda_frequencia: "Queda de frequencia",
  risco_churn: "Risco de churn",
  compra_prevista_vencida: "Compra prevista vencida",
  novo_cliente: "Novo cliente",
};

function insightExplanation(tag: InsightTag, customer: CustomerDetail) {
  switch (tag) {
    case "risco_churn":
      return `Considera queda de frequencia a partir de 50% entre os ultimos 90 dias e os 90 dias anteriores, com o cliente ja fora do status ativo. Hoje a queda estimada e ${formatPercent(customer.frequencyDropRatio)}.`;
    case "queda_frequencia":
      return `O ritmo de compra caiu na comparacao entre os ultimos 90 dias e a janela anterior. A queda atual estimada e ${formatPercent(customer.frequencyDropRatio)}.`;
    case "reativacao":
      return "Cliente esta inativo e vale abordagem de retorno, principalmente quando ja teve boa recorrencia ou bom historico de compra.";
    case "recorrente":
      return "Cliente ativo, com intervalo medio de compra curto e sem queda relevante de frequencia.";
    case "alto_valor":
      return "Cliente com gasto total acima da faixa alta da base. Merece prioridade de relacionamento.";
    case "compra_prevista_vencida":
      return "A previsao simples de proxima compra ja passou e ainda nao houve novo pedido.";
    case "novo_cliente":
      return "Cliente recente, com ate 2 pedidos e compra nos ultimos 30 dias.";
    default:
      return "Insight calculado automaticamente com base em recencia, frequencia e valor.";
  }
}

function primaryInsightLabel(customer: CustomerDetail) {
  if (!customer.primaryInsight) {
    return "sem alerta";
  }

  return insightLabels[customer.primaryInsight];
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const detailQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.customer(token!, id!),
    enabled: Boolean(token && id),
  });
  const labelsQuery = useQuery({
    queryKey: ["customer-labels"],
    queryFn: () => api.customerLabels(token!),
    enabled: Boolean(token),
  });

  const customer = detailQuery.data ?? null;
  const knownLabels = useMemo(() => labelsQuery.data?.map((label) => label.name) ?? [], [labelsQuery.data]);
  const availableLabels = useMemo(
    () => knownLabels.filter((labelName) => !selectedLabels.includes(labelName)),
    [knownLabels, selectedLabels],
  );

  useEffect(() => {
    if (!customer) {
      return;
    }

    setSelectedLabels(customer.labels.map((label) => label.name));
    setInternalNotes(customer.internalNotes);
  }, [customer]);

  const saveLabelsMutation = useMutation({
    mutationFn: (input: { labels: string[]; internalNotes: string }) => api.updateCustomerLabels(token!, id!, input),
    onSuccess: (updatedCustomer) => {
      queryClient.setQueryData(["customer", updatedCustomer.id], updatedCustomer);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      setSaveMessage("Classificacao salva com sucesso.");
    },
  });

  if (detailQuery.isLoading) {
    return <div className="page-loading">Carregando ficha do cliente...</div>;
  }

  if (detailQuery.isError || !customer) {
    return <div className="page-error">Nao foi possivel carregar a ficha do cliente.</div>;
  }

  function addExistingLabel(labelName: string) {
    if (selectedLabels.includes(labelName)) {
      return;
    }

    setSelectedLabels((current) => [...current, labelName]);
    setSaveMessage("");
  }

  function addNewLabel() {
    const cleaned = newLabel.trim();
    if (!cleaned || selectedLabels.includes(cleaned)) {
      return;
    }

    setSelectedLabels((current) => [...current, cleaned]);
    setNewLabel("");
    setSaveMessage("");
  }

  function removeLabel(labelName: string) {
    setSelectedLabels((current) => current.filter((item) => item !== labelName));
    setSaveMessage("");
  }

  function handleSave(event: FormEvent) {
    event.preventDefault();
    saveLabelsMutation.mutate({
      labels: selectedLabels,
      internalNotes,
    });
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Ficha do cliente</p>
          <h2>{customer.displayName}</h2>
          <p>
            {customer.customerCode} | {statusLabel(customer.status)} | Insight principal: {primaryInsightLabel(customer)}
          </p>
        </div>
      </section>

      <section className="stats-grid detail-stats-grid">
        <div className="panel metric-tile">
          <span>Ultima compra</span>
          <strong>{formatDate(customer.lastPurchaseAt)}</strong>
        </div>
        <div className="panel metric-tile">
          <span>Tempo desde a ultima compra</span>
          <strong>{formatDaysSince(customer.daysSinceLastPurchase)}</strong>
        </div>
        <div className="panel metric-tile">
          <span>Pedidos com a gente</span>
          <strong>{customer.totalOrders}</strong>
        </div>
        <div className="panel metric-tile">
          <span>Ticket medio</span>
          <strong>{formatCurrency(customer.avgTicket)}</strong>
        </div>
        <div className="panel metric-tile">
          <span>Total gasto</span>
          <strong>{formatCurrency(customer.totalSpent)}</strong>
        </div>
        <div className="panel metric-tile">
          <span>Score de valor</span>
          <strong>{customer.valueScore.toFixed(1)}</strong>
        </div>
        <div className="panel metric-tile">
          <span className="label-with-info">
            Score de prioridade
            <InfoHint text="Pontuacao de prioridade: 40% recencia, 25% valor do cliente, 20% queda de frequencia e 15% compra prevista vencida." />
          </span>
          <strong>{customer.priorityScore.toFixed(1)}</strong>
        </div>
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Sinais analiticos</p>
              <h3>Leitura comercial rapida</h3>
            </div>
          </div>

          <div className="detail-grid">
            <div>
              <span>Frequencia nos ultimos 90 dias</span>
              <strong>{customer.purchaseFrequency90d.toFixed(1)}</strong>
            </div>
            <div>
              <span>Media entre pedidos</span>
              <strong>{customer.avgDaysBetweenOrders?.toFixed(1) ?? "Sem base"}</strong>
            </div>
            <div>
              <span>Queda de frequencia</span>
              <strong>{formatPercent(customer.frequencyDropRatio)}</strong>
            </div>
            <div>
              <span>Proxima compra prevista</span>
              <strong>{formatDate(customer.predictedNextPurchaseAt)}</strong>
            </div>
            <div>
              <span>Atendente mais recente</span>
              <strong>{customer.lastAttendant ?? "Nao informado"}</strong>
            </div>
            <div>
              <span>Status comercial</span>
              <strong>{statusLabel(customer.status)}</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Como ler os insights</p>
              <h3>Explicacao do que o sistema esta vendo</h3>
            </div>
          </div>

          <p className="panel-subcopy">
            Para churn, o sistema compara os ultimos 90 dias com os 90 dias anteriores. Quando a queda de frequencia
            chega em 50% ou mais e o cliente sai da zona ativa, ele entra em risco de churn.
          </p>

          <div className="insight-list">
            {customer.insightTags.length ? (
              customer.insightTags.map((tag) => (
                <article key={tag} className="insight-card">
                  <strong>{insightLabels[tag]}</strong>
                  <p>{insightExplanation(tag, customer)}</p>
                </article>
              ))
            ) : (
              <article className="insight-card">
                <strong>Sem alerta no momento</strong>
                <p>O cliente nao bateu nenhum gatilho especial de prioridade ou risco agora.</p>
              </article>
            )}
          </div>
        </article>
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Classificacao interna</p>
              <h3>Rotulos e observacoes do comercial</h3>
            </div>
          </div>

          <form className="stack-list" onSubmit={handleSave}>
            <div className="label-block">
              <span className="label-block-title">Rotulos atuais</span>
              <p className="panel-subcopy">Clique no x para remover. Depois clique em salvar.</p>
              <div className="tag-row">
                {selectedLabels.length ? (
                  selectedLabels.map((labelName) => (
                    <span key={labelName} className="tag removable-tag">
                      <span>{labelName}</span>
                      <button type="button" className="tag-remove-button" onClick={() => removeLabel(labelName)}>
                        x
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="muted-copy">Nenhum rotulo selecionado.</span>
                )}
              </div>
            </div>

            <div className="label-block">
              <span className="label-block-title">Adicionar rotulo existente</span>
              <div className="tag-row">
                {availableLabels.length ? (
                  availableLabels.map((labelName) => (
                    <button
                      key={labelName}
                      type="button"
                      className="tag-selector"
                      onClick={() => addExistingLabel(labelName)}
                    >
                      + {labelName}
                    </button>
                  ))
                ) : (
                  <span className="muted-copy">Todos os rotulos existentes ja estao aplicados.</span>
                )}
              </div>
            </div>

            <div className="label-block">
              <span className="label-block-title">Criar novo rotulo</span>
              <div className="label-create-row">
                <input
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                  placeholder="Ex: Cliente estrategico"
                />
                <button type="button" className="ghost-button" onClick={addNewLabel}>
                  Adicionar
                </button>
              </div>
            </div>

            <label>
              Observacao interna
              <textarea
                rows={5}
                value={internalNotes}
                onChange={(event) => {
                  setInternalNotes(event.target.value);
                  setSaveMessage("");
                }}
                placeholder="Ex: cliente pede credito, esta bloqueado, e parceiro bom para reativacao, historico sensivel..."
              />
            </label>

            <div className="inline-actions">
              <button type="submit" className="primary-button" disabled={saveLabelsMutation.isPending}>
                {saveLabelsMutation.isPending ? "Salvando..." : "Salvar rotulos e observacao"}
              </button>
              <span className="muted-copy">Para criar ou apagar rótulos do sistema, use a tela Rotulos no menu.</span>
              {saveLabelsMutation.isError ? (
                <span className="inline-error">Nao foi possivel salvar essa classificacao.</span>
              ) : null}
              {saveMessage ? <span className="save-ok">{saveMessage}</span> : null}
            </div>
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Historico recente</p>
              <h3>Pedidos mais recentes</h3>
            </div>
          </div>

          <div className="stack-list">
            {customer.recentOrders.map((order) => (
              <div key={order.id} className="history-card">
                <div>
                  <strong>{order.orderNumber}</strong>
                  <p>{formatDate(order.orderDate)}</p>
                </div>
                <div className="history-card-meta">
                  <span>{order.itemCount} itens</span>
                  <strong>{formatCurrency(order.totalAmount)}</strong>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
