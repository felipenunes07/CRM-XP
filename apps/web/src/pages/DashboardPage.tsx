import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Link } from "react-router-dom";
import type { AgendaItem } from "@olist-crm/shared";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { InfoHint } from "../components/InfoHint";
import { StatCard } from "../components/StatCard";
import { CustomerTable } from "../components/CustomerTable";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatNumber } from "../lib/format";

const bucketFilters = {
  "0-14": { minDaysInactive: 0, maxDaysInactive: 14 },
  "15-29": { minDaysInactive: 15, maxDaysInactive: 29 },
  "30-59": { minDaysInactive: 30, maxDaysInactive: 59 },
  "60-89": { minDaysInactive: 60, maxDaysInactive: 89 },
  "90-179": { minDaysInactive: 90, maxDaysInactive: 179 },
  "180+": { minDaysInactive: 180 },
} as const;

type BucketLabel = keyof typeof bucketFilters;

function bucketColor(label: string, selected: boolean) {
  if (selected) {
    return "#5f8cff";
  }

  if (label === "0-14" || label === "15-29") {
    return "#a8c1ff";
  }

  if (label === "30-59" || label === "60-89") {
    return "#5f8cff";
  }

  return "#2956d7";
}

function getAgendaPreviewItems(items: AgendaItem[] | undefined) {
  return (items ?? []).slice(0, 6);
}

function bucketTooltipNote(label: string) {
  if (label === "0-14") {
    return "Todos nesta faixa seguem no status Ativo.";
  }

  if (label === "15-29") {
    return "Todos nesta faixa seguem no status Ativo.";
  }

  if (label === "30-59") {
    return "Faixa de transicao: no dia 30 ainda pode estar Ativo; de 31 a 59 entra em Atencao.";
  }

  if (label === "60-89") {
    return "Todos nesta faixa ja estao em Atencao.";
  }

  return "Todos nesta faixa ja estao Inativos.";
}

function InactivityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <strong>{label} dias sem compra</strong>
      <div className="chart-tooltip-count">
        <strong>{formatNumber(payload[0]?.value ?? 0)}</strong>
        <span>clientes nessa faixa</span>
      </div>
      <p>{bucketTooltipNote(label)}</p>
    </div>
  );
}

export function DashboardPage() {
  const { token } = useAuth();
  const [selectedBucket, setSelectedBucket] = useState<BucketLabel | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboard(token!),
    enabled: Boolean(token),
  });

  const agendaQuery = useQuery({
    queryKey: ["dashboard-agenda-preview"],
    queryFn: () => api.agenda(token!, 12),
    enabled: Boolean(token),
  });

  const filteredCustomersQuery = useQuery({
    queryKey: ["dashboard-bucket-customers", selectedBucket],
    queryFn: () =>
      api.customers(token!, {
        ...(selectedBucket ? bucketFilters[selectedBucket] : {}),
        sortBy: "priority",
        limit: 120,
      }),
    enabled: Boolean(token && selectedBucket),
  });

  const priorityCustomersQuery = useQuery({
    queryKey: ["dashboard-priority-customers"],
    queryFn: () =>
      api.customers(token!, {
        sortBy: "priority",
        limit: 120,
      }),
    enabled: Boolean(token && !selectedBucket),
  });

  if (dashboardQuery.isLoading) {
    return <div className="page-loading">Carregando dashboard...</div>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return <div className="page-error">Nao foi possivel carregar o dashboard.</div>;
  }

  const metrics = dashboardQuery.data;
  const agendaItems = getAgendaPreviewItems(agendaQuery.data);
  const tableCustomers = selectedBucket ? (filteredCustomersQuery.data ?? []) : (priorityCustomersQuery.data ?? []);
  const tableQueryLoading = selectedBucket ? filteredCustomersQuery.isLoading : priorityCustomersQuery.isLoading;
  const tableQueryError = selectedBucket ? filteredCustomersQuery.isError : priorityCustomersQuery.isError;

  async function handleSync() {
    try {
      setIsSyncing(true);
      await api.syncData(token!, "direct");
      window.location.reload();
    } catch (err) {
      alert("Falha na sincronizacao: " + String(err));
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="hero-panel dashboard-hero">
        <div className="hero-copy">
          <p className="eyebrow">Operacao comercial</p>
          <h2>Prioridades de contato e saude da carteira</h2>
          <p>Use esta tela para decidir quem puxar agora, acompanhar faixas de risco e manter a base atualizada.</p>
          <div className="hero-actions">
            <Link className="primary-button" to="/agenda">
              Abrir agenda do dia
            </Link>
            <button className="ghost-button" type="button" disabled={isSyncing} onClick={handleSync}>
              {isSyncing ? "Sincronizando..." : "Sincronizar Agora"}
            </button>
          </div>
        </div>

        <div className="hero-meta">
          <div className="hero-meta-item">
            <span>Ultima sincronizacao</span>
            <strong>
              {metrics.lastSyncAt ? new Date(metrics.lastSyncAt).toLocaleString("pt-BR") : "Sincronizacao pendente"}
            </strong>
          </div>
          <div className="hero-meta-item">
            <span>Frequencia media</span>
            <strong>{metrics.averageFrequencyDays.toFixed(1)} dias</strong>
          </div>
          <div className="hero-meta-item">
            <span>Agenda de hoje</span>
            <strong>{metrics.dailyAgendaCount} clientes</strong>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard title="Total de clientes" value={formatNumber(metrics.totalCustomers)} helper="Base comercial consolidada" />
        <StatCard title="Clientes ativos" value={formatNumber(metrics.statusCounts.ACTIVE)} tone="success" />
        <StatCard title="Clientes em atencao" value={formatNumber(metrics.statusCounts.ATTENTION)} tone="warning" />
        <StatCard title="Clientes inativos" value={formatNumber(metrics.statusCounts.INACTIVE)} tone="danger" />
        <StatCard title="Frequencia media" value={`${metrics.averageFrequencyDays.toFixed(1)} dias`} helper="Intervalo medio entre pedidos" />
      </section>

      <section className="grid-two dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Faixas de inatividade</p>
              <h3 className="header-with-info">
                Onde esta o risco de parada
                <InfoHint text="As barras mostram dias sem compra. Regra de status atual: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias." />
              </h3>
            </div>
          </div>
          <p className="panel-subcopy">
            Clique em uma barra para filtrar a tabela abaixo. Os status comerciais seguem os cortes: Ativo ate 30 dias,
            Atencao de 31 a 89 dias e Inativo a partir de 90 dias.
          </p>
          <div className="status-guide-grid">
            <div className="status-guide-card is-active">
              <strong>Ativo</strong>
              <span>Ate 30 dias sem comprar</span>
            </div>
            <div className="status-guide-card is-attention">
              <strong>Atencao</strong>
              <span>De 31 a 89 dias sem comprar</span>
            </div>
            <div className="status-guide-card is-inactive">
              <strong>Inativo</strong>
              <span>90 dias ou mais sem comprar</span>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={metrics.inactivityBuckets}
                onClick={(state) => {
                  const label = (state as { activeLabel?: string } | undefined)?.activeLabel;
                  if (!label || !(label in bucketFilters)) {
                    return;
                  }
                  setSelectedBucket((current) => (current === label ? null : (label as BucketLabel)));
                }}
                margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
              >
                <XAxis dataKey="label" stroke="#5f6f95" />
                <Tooltip content={<InactivityTooltip />} cursor={{ fill: "rgba(41, 86, 215, 0.04)" }} />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} cursor="pointer">
                  {metrics.inactivityBuckets.map((bucket) => (
                    <Cell key={bucket.label} fill={bucketColor(bucket.label, selectedBucket === bucket.label)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {selectedBucket ? (
            <div className="inline-actions">
              <span className="tag">Filtro ativo: {selectedBucket}</span>
              <button className="ghost-button" type="button" onClick={() => setSelectedBucket(null)}>
                Limpar filtro
              </button>
            </div>
          ) : null}
        </article>

        <article className="panel insight-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Agenda de hoje</p>
              <h3>{metrics.dailyAgendaCount} clientes pedem contato agora</h3>
              <p className="panel-subcopy">Fila pronta para a vendedora agir sem sair da tela inicial.</p>
            </div>
            <Link className="ghost-button" to="/agenda">
              Ver agenda completa
            </Link>
          </div>

          {agendaQuery.isLoading ? <div className="page-loading">Montando fila de contato...</div> : null}
          {agendaQuery.isError ? <div className="page-error">Nao foi possivel carregar a agenda de hoje.</div> : null}
          {!agendaQuery.isLoading && !agendaQuery.isError ? (
            agendaItems.length ? (
              <div className="stack-list agenda-scroll-list">
                {agendaItems.map((customer) => (
                  <ContactQueueCard key={customer.id} item={customer} compact />
                ))}
              </div>
            ) : (
              <div className="empty-state">Nenhum cliente precisa de contato imediato neste momento.</div>
            )
          ) : null}
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{selectedBucket ? "Clientes filtrados pelo grafico" : "Fila por prioridade"}</p>
            <h3>{selectedBucket ? `Clientes na faixa ${selectedBucket}` : "Clientes para o time abordar agora"}</h3>
            <p className="panel-subcopy">
              {selectedBucket
                ? "A selecao do grafico mostra apenas clientes da faixa escolhida."
                : "Ordenacao base por prioridade comercial; a tabela tambem permite ordenar por coluna e ajustar larguras."}
            </p>
          </div>
        </div>

        {tableQueryLoading ? <div className="page-loading">Carregando clientes priorizados...</div> : null}
        {tableQueryError ? <div className="page-error">Nao foi possivel carregar essa lista de clientes.</div> : null}
        {!tableQueryLoading && !tableQueryError ? <CustomerTable customers={tableCustomers} /> : null}
      </section>
    </div>
  );
}
