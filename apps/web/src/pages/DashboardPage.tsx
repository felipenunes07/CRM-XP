import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Link } from "react-router-dom";
import type { AgendaItem } from "@olist-crm/shared";
import { StatCard } from "../components/StatCard";
import { CustomerTable } from "../components/CustomerTable";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, formatNumber } from "../lib/format";

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
  return (items ?? []).slice(0, 12);
}

export function DashboardPage() {
  const { token } = useAuth();
  const [selectedBucket, setSelectedBucket] = useState<BucketLabel | null>(null);

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

  if (dashboardQuery.isLoading) {
    return <div className="page-loading">Carregando dashboard...</div>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return <div className="page-error">Nao foi possivel carregar o dashboard.</div>;
  }

  const metrics = dashboardQuery.data;
  const agendaItems = getAgendaPreviewItems(agendaQuery.data);
  const tableCustomers = selectedBucket ? (filteredCustomersQuery.data ?? []) : metrics.topCustomers;

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Visao geral</p>
          <h2>XP CRM</h2>
          <p>Base comercial centralizada no Supabase com leitura analitica pronta para o time comercial.</p>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard title="Total de clientes" value={formatNumber(metrics.totalCustomers)} helper="Base comercial consolidada" />
        <StatCard title="Clientes ativos" value={formatNumber(metrics.statusCounts.ACTIVE)} tone="success" />
        <StatCard title="Clientes em atencao" value={formatNumber(metrics.statusCounts.ATTENTION)} tone="warning" />
        <StatCard title="Clientes inativos" value={formatNumber(metrics.statusCounts.INACTIVE)} tone="danger" />
        <StatCard title="Ticket medio" value={formatCurrency(metrics.averageTicket)} />
        <StatCard
          title="Frequencia media"
          value={`${metrics.averageFrequencyDays.toFixed(1)} dias`}
          helper={metrics.lastSyncAt ? `Ultima sincronizacao ${new Date(metrics.lastSyncAt).toLocaleString("pt-BR")}` : "Sincronizacao diaria automatica"}
        />
      </section>

      <section className="grid-two dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Faixas de inatividade</p>
              <h3>Onde esta o risco de parada</h3>
            </div>
          </div>
          <p className="panel-subcopy">Clique em uma barra para filtrar a tabela abaixo pelos clientes daquela faixa.</p>
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
              >
                <XAxis dataKey="label" stroke="#5f6f95" />
                <Tooltip />
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
            </div>
            <Link className="ghost-button" to="/agenda">
              Ver agenda completa
            </Link>
          </div>
          <div className="stack-list agenda-scroll-list">
            {agendaItems.map((customer) => (
              <div key={customer.id} className="agenda-card compact">
                <div className="agenda-card-copy">
                  <strong>{customer.displayName}</strong>
                  <p>{customer.reason}</p>
                  <small>
                    Ultima compra: {formatDate(customer.lastPurchaseAt)} | {formatDaysSince(customer.daysSinceLastPurchase)}
                  </small>
                </div>
                <div className="agenda-metric">
                  <span>{customer.priorityScore.toFixed(1)}</span>
                  <ArrowUpRight size={16} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{selectedBucket ? "Clientes filtrados pelo grafico" : "Ranking por faturamento"}</p>
            <h3>{selectedBucket ? `Clientes na faixa ${selectedBucket}` : "Clientes com maior peso na receita"}</h3>
          </div>
        </div>

        {selectedBucket && filteredCustomersQuery.isLoading ? (
          <div className="page-loading">Filtrando clientes da faixa selecionada...</div>
        ) : null}
        {selectedBucket && filteredCustomersQuery.isError ? (
          <div className="page-error">Nao foi possivel carregar os clientes dessa faixa.</div>
        ) : null}
        {!selectedBucket || filteredCustomersQuery.data ? <CustomerTable customers={tableCustomers} /> : null}
      </section>
    </div>
  );
}
