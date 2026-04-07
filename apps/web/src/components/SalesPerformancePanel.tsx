import type { SalesPerformanceEntry } from "@olist-crm/shared";
import { formatNumber } from "../lib/format";

interface SalesPerformancePanelProps {
  salesPerformance: SalesPerformanceEntry[];
  isLoading?: boolean;
}

export function SalesPerformancePanel({ salesPerformance, isLoading }: SalesPerformancePanelProps) {
  if (isLoading) {
    return (
      <article className="panel insight-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Performance do mês</p>
            <h3>Ranking Mensal</h3>
          </div>
        </div>
        <div className="page-loading">Carregando performance...</div>
      </article>
    );
  }

  if (!salesPerformance.length) {
    return (
      <article className="panel insight-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Performance do mês</p>
            <h3>Ranking Mensal</h3>
          </div>
        </div>
        <div className="empty-state">Nenhuma venda registrada neste mês.</div>
      </article>
    );
  }

  const maxOrders = Math.max(...salesPerformance.map((e) => e.totalOrders));

  return (
    <article className="panel insight-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Performance do mês</p>
          <h3>Ranking Mensal</h3>
          <p className="panel-subcopy">Desempenho corporativo com base nas vendas do período.</p>
        </div>
      </div>

      <div className="ranking-balanced-list">
        {salesPerformance.map((entry, index) => {
          const isTop3 = index < 3;
          const posClass = isTop3 ? `pos-${index + 1}` : "";
          const pct = maxOrders > 0 ? (entry.totalOrders / maxOrders) * 100 : 0;

          return (
            <div key={entry.attendant} className={`ranking-card ${posClass}`}>
              <div className="ranking-badge">
                {index + 1}
              </div>

              <div className="ranking-content">
                <div className="ranking-header">
                  <span className="ranking-name">{entry.attendant}</span>
                  {index === 0 && <span className="ranking-tag">Top Performer</span>}
                </div>

                <div className="ranking-metrics">
                  <div className="ranking-metric">
                    <strong>{formatNumber(entry.totalOrders)}</strong>
                    <span>vendas</span>
                  </div>
                  <div className="ranking-metric">
                    <strong>{formatNumber(entry.totalItems)}</strong>
                    <span>peças</span>
                  </div>
                  <div className="ranking-metric">
                    <strong>{formatNumber(entry.uniqueCustomers)}</strong>
                    <span>clientes</span>
                  </div>
                </div>

                <div className="ranking-bar-bg">
                  <div className="ranking-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
