import { useState } from "react";
import type {
  NewCustomerLeaderboardEntry,
  ProspectingLeaderboardEntry,
  ReactivationLeaderboardEntry,
  SalesPerformanceEntry,
} from "@olist-crm/shared";
import { useUiLanguage } from "../i18n";
import { formatCurrency, formatNumber } from "../lib/format";

interface SalesPerformancePanelProps {
  salesPerformance: SalesPerformanceEntry[];
  reactivationLeaderboard: ReactivationLeaderboardEntry[];
  newCustomerLeaderboard: NewCustomerLeaderboardEntry[];
  prospectingLeaderboard: ProspectingLeaderboardEntry[];
  isLoading?: boolean;
  rankingPeriod?: "month" | "today";
  onResetRanking?: () => void;
}

type RankingTab = "sales" | "reactivation" | "newCustomers" | "prospecting";

interface RankingMetric {
  value: number;
  label: string;
  formatter?: (value: number) => string;
}

interface RankingViewEntry {
  attendant: string;
  metrics: [RankingMetric, RankingMetric, RankingMetric];
}

const ALWAYS_HIDDEN_ATTENDANTS = new Set(["iza"]);
const MONTHLY_HIDDEN_ATTENDANTS = new Set(["sem atendente"]);

function sortSalesPerformanceEntries(entries: SalesPerformanceEntry[], rankingPeriod: "month" | "today") {
  return [...entries].sort((left, right) => {
    if (rankingPeriod === "today") {
      return (
        right.totalItems - left.totalItems ||
        right.totalOrders - left.totalOrders ||
        right.totalRevenue - left.totalRevenue ||
        left.attendant.localeCompare(right.attendant, "pt-BR")
      );
    }

    return (
      right.totalOrders - left.totalOrders ||
      right.totalRevenue - left.totalRevenue ||
      right.totalItems - left.totalItems ||
      left.attendant.localeCompare(right.attendant, "pt-BR")
    );
  });
}

export function SalesPerformancePanel({
  salesPerformance,
  reactivationLeaderboard,
  newCustomerLeaderboard,
  prospectingLeaderboard,
  isLoading,
  rankingPeriod = "month",
  onResetRanking,
}: SalesPerformancePanelProps) {
  const { tx } = useUiLanguage();
  const [activeTab, setActiveTab] = useState<RankingTab>("sales");
  const isToday = rankingPeriod === "today";
  const orderedSalesPerformance = sortSalesPerformanceEntries(salesPerformance, rankingPeriod);
  const hiddenAttendants = isToday
    ? ALWAYS_HIDDEN_ATTENDANTS
    : new Set([...ALWAYS_HIDDEN_ATTENDANTS, ...MONTHLY_HIDDEN_ATTENDANTS]);

  const rankingViews: Record<
    RankingTab,
    {
      label: string;
      description: string;
      emptyMessage: string;
      entries: RankingViewEntry[];
    }
  > = {
    sales: {
      label: tx("Vendas", "Sales"),
      description: isToday
        ? tx("Peças vendidas hoje por vendedora, com conferência direta do total diário.", "Items sold today by each seller, aligned with the daily total.")
        : tx("Desempenho corporativo com base nas vendas do periodo.", "Team performance based on sales in the selected period."),
      emptyMessage: isToday
        ? tx("Nenhuma peça registrada hoje.", "No items registered today.")
        : tx("Nenhuma venda registrada neste mes.", "No sales registered this month."),
      entries: orderedSalesPerformance.map((entry) => ({
        attendant: entry.attendant,
        metrics: isToday
          ? [
              { value: entry.totalItems, label: tx("pecas", "items") },
              { value: entry.totalOrders, label: tx("vendas", "sales") },
              { value: entry.uniqueCustomers, label: tx("clientes", "customers") },
            ]
          : [
              { value: entry.totalOrders, label: tx("vendas", "sales") },
              { value: entry.totalItems, label: tx("pecas", "items") },
              { value: entry.uniqueCustomers, label: tx("clientes", "customers") },
            ],
      })),
    },
    reactivation: {
      label: tx("Reativacao", "Reactivation"),
      description: tx(
        "Veja quem mais recuperou clientes inativos no mes atual.",
        "See who recovered the most inactive customers this month.",
      ),
      emptyMessage: tx(
        "Nenhuma reativacao registrada neste mes.",
        "No reactivations registered this month.",
      ),
      entries: [...reactivationLeaderboard]
        .sort((a, b) => b.recoveredRevenue - a.recoveredRevenue)
        .map((entry) => ({
          attendant: entry.attendant,
          metrics: [
            { value: entry.recoveredRevenue, label: tx("faturamento", "revenue"), formatter: formatCurrency },
            { value: entry.recoveredCustomers, label: tx("clientes reativados", "reactivated customers") },
            { value: entry.recoveredItems, label: tx("pecas", "items") },
          ],
        })),
    },
    newCustomers: {
      label: tx("Clientes novos", "New customers"),
      description: tx(
        "Mostra as vendedoras que mais trouxeram clientes novos no mes.",
        "Shows which sellers brought the most new customers this month.",
      ),
      emptyMessage: tx(
        "Nenhum cliente novo registrado neste mes.",
        "No new customers registered this month.",
      ),
      entries: newCustomerLeaderboard.map((entry) => ({
        attendant: entry.attendant,
        metrics: [
          { value: entry.newCustomers, label: tx("clientes novos", "new customers") },
          { value: entry.totalItems, label: tx("pecas iniciais", "first items") },
          { value: entry.totalRevenue, label: tx("faturamento", "revenue"), formatter: formatCurrency },
        ],
      })),
    },
    prospecting: {
      label: tx("Prospeccao", "Prospecting"),
      description: tx(
        "Acompanhe quem mais abordou leads e fez prospeccao no mes.",
        "Track who contacted the most leads this month.",
      ),
      emptyMessage: tx(
        "Nenhuma prospeccao registrada neste mes.",
        "No prospecting activity registered this month.",
      ),
      entries: prospectingLeaderboard.map((entry) => ({
        attendant: entry.attendant,
        metrics: [
          { value: entry.contactedLeads, label: tx("leads contatados", "contacted leads") },
          { value: entry.firstContacts, label: tx("primeiros contatos", "first contacts") },
          { value: entry.contactAttempts, label: tx("tentativas", "attempts") },
        ],
      })),
    },
  };

  const currentView = rankingViews[activeTab];
  const filteredEntries = currentView.entries.filter((entry) => !hiddenAttendants.has(entry.attendant.toLowerCase()));

  if (isLoading) {
    return (
      <article className="panel insight-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{isToday ? tx("Peças de hoje", "Today's items") : tx("Performance do mes", "Month performance")}</p>
            <h3>{isToday ? tx("Ranking de Peças de Hoje", "Today's items ranking") : tx("Ranking Mensal", "Monthly ranking")}</h3>
          </div>
        </div>
        <div className="page-loading">{tx("Carregando performance...", "Loading performance...")}</div>
      </article>
    );
  }

  return (
    <article className="panel insight-panel">
      <div className="panel-header" style={{ alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div>
              <p className="eyebrow">{isToday ? tx("Peças de hoje", "Today's items") : tx("Performance do mes", "Month performance")}</p>
              <h3>{isToday ? tx("Ranking de Peças de Hoje", "Today's items ranking") : tx("Ranking Mensal", "Monthly ranking")}</h3>
            </div>
            {isToday && onResetRanking && (
              <button 
                onClick={onResetRanking}
                className="reset-filter-pill"
                title={tx("Voltar para ranking mensal", "Back to monthly ranking")}
              >
                {tx("Voltar para Mensal", "Back to Monthly")}
              </button>
            )}
          </div>
          <p className="panel-subcopy" style={{ marginTop: '0.4rem' }}>{currentView.description}</p>
        </div>
        <div className="ranking-tabs-container">
          <div className="ranking-tabs" role="tablist" aria-label={tx("Abas do ranking mensal", "Monthly ranking tabs")}>
            {Object.entries(rankingViews).map(([key, view]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                className={`ranking-tab ${activeTab === key ? "active" : ""}`}
                onClick={() => setActiveTab(key as RankingTab)}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!filteredEntries.length ? (
        <div className="empty-state">{currentView.emptyMessage}</div>
      ) : (
        <RankingList entries={filteredEntries} topPerformerLabel={tx("Top Performer", "Top performer")} />
      )}
    </article>
  );
}

function RankingList({
  entries,
  topPerformerLabel,
}: {
  entries: RankingViewEntry[];
  topPerformerLabel: string;
}) {
  const maxMetricValue = Math.max(...entries.map((entry) => entry.metrics[0].value));

  return (
    <div className="ranking-balanced-list">
      {entries.map((entry, index) => {
        const isTop3 = index < 3;
        const posClass = isTop3 ? `pos-${index + 1}` : "";
        const pct = maxMetricValue > 0 ? (entry.metrics[0].value / maxMetricValue) * 100 : 0;

        return (
          <div key={entry.attendant} className={`ranking-card ${posClass}`}>
            <div className="ranking-badge">{index + 1}</div>

            <div className="ranking-content">
              <div className="ranking-header">
                <span className="ranking-name">{entry.attendant}</span>
                {index === 0 ? <span className="ranking-tag">{topPerformerLabel}</span> : null}
              </div>

              <div className="ranking-metrics">
                {entry.metrics.map((metric) => (
                  <div key={`${entry.attendant}-${metric.label}`} className="ranking-metric">
                    <strong>{metric.formatter ? metric.formatter(metric.value) : formatNumber(metric.value)}</strong>
                    <span>{metric.label}</span>
                  </div>
                ))}
              </div>

              <div className="ranking-bar-bg">
                <div className="ranking-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
