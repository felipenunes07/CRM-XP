import type { SalesPerformanceEntry } from "@olist-crm/shared";
import { formatNumber } from "../lib/format";

interface SalesPerformancePanelProps {
  salesPerformance: SalesPerformanceEntry[];
  isLoading?: boolean;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function SalesPerformancePanel({ salesPerformance, isLoading }: SalesPerformancePanelProps) {
  if (isLoading) {
    return (
      <article className="panel insight-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Performance do mês</p>
            <h3>Vendas por atendente</h3>
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
            <h3>Vendas por atendente</h3>
          </div>
        </div>
        <div className="empty-state">Nenhuma venda registrada neste mês.</div>
      </article>
    );
  }

  return (
    <article className="panel insight-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Performance do mês</p>
          <h3>Ranking Mensal</h3>
          <p className="panel-subcopy">Vendas, peças e clientes atendidos do mês atual.</p>
        </div>
      </div>

      <div className="sales-performance-list">
        {salesPerformance.map((entry, index) => (
          <div key={entry.attendant} className="sales-performance-entry">
            <div className="sales-performance-rank">#{index + 1}</div>
            <div className="sales-performance-info">
              <strong>{entry.attendant}</strong>
              <div className="sales-performance-metrics">
                <div className="sales-metric">
                  <span className="sales-metric-value">{formatNumber(entry.totalOrders)}</span>
                  <span className="sales-metric-label">vendas</span>
                </div>
                <span className="separator">•</span>
                <div className="sales-metric">
                  <span className="sales-metric-value">{formatNumber(entry.totalItems)}</span>
                  <span className="sales-metric-label">peças</span>
                </div>
                <span className="separator">•</span>
                <div className="sales-metric">
                  <span className="sales-metric-value">{formatNumber(entry.uniqueCustomers)}</span>
                  <span className="sales-metric-label">clientes</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
