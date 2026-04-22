import type { SalesPerformanceEntry } from "@olist-crm/shared";
import { formatNumber } from "../lib/format";
import { useUiLanguage } from "../i18n";

interface SalesPerformancePanelProps {
  salesPerformance: SalesPerformanceEntry[];
  isLoading?: boolean;
}

export function SalesPerformancePanel({ salesPerformance, isLoading }: SalesPerformancePanelProps) {
  const { tx } = useUiLanguage();

  if (isLoading) {
    return (
      <article className="panel insight-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{tx("Performance do mes", "本月表现")}</p>
            <h3>{tx("Ranking Mensal", "月度排名")}</h3>
          </div>
        </div>
        <div className="page-loading">{tx("Carregando performance...", "正在加载表现数据...")}</div>
      </article>
    );
  }

  const filteredSalesPerformance = salesPerformance.filter((entry) => {
    const name = entry.attendant.toLowerCase();
    return name !== "iza" && name !== "sem atendente";
  });

  if (!filteredSalesPerformance.length) {
    return (
      <article className="panel insight-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{tx("Performance do mes", "本月表现")}</p>
            <h3>{tx("Ranking Mensal", "月度排名")}</h3>
          </div>
        </div>
        <div className="empty-state">{tx("Nenhuma venda registrada neste mes.", "本月暂无销售记录。")}</div>
      </article>
    );
  }

  const maxOrders = Math.max(...filteredSalesPerformance.map((entry) => entry.totalOrders));

  return (
    <article className="panel insight-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{tx("Performance do mes", "本月表现")}</p>
          <h3>{tx("Ranking Mensal", "月度排名")}</h3>
          <p className="panel-subcopy">
            {tx("Desempenho corporativo com base nas vendas do periodo.", "基于当前周期销售数据的团队表现。")}
          </p>
        </div>
      </div>

      <div className="ranking-balanced-list">
        {filteredSalesPerformance.map((entry, index) => {
          const isTop3 = index < 3;
          const posClass = isTop3 ? `pos-${index + 1}` : "";
          const pct = maxOrders > 0 ? (entry.totalOrders / maxOrders) * 100 : 0;

          return (
            <div key={entry.attendant} className={`ranking-card ${posClass}`}>
              <div className="ranking-badge">{index + 1}</div>

              <div className="ranking-content">
                <div className="ranking-header">
                  <span className="ranking-name">{entry.attendant}</span>
                  {index === 0 && <span className="ranking-tag">{tx("Top Performer", "最佳表现")}</span>}
                </div>

                <div className="ranking-metrics">
                  <div className="ranking-metric">
                    <strong>{formatNumber(entry.totalOrders)}</strong>
                    <span>{tx("vendas", "销售")}</span>
                  </div>
                  <div className="ranking-metric">
                    <strong>{formatNumber(entry.totalItems)}</strong>
                    <span>{tx("pecas", "件数")}</span>
                  </div>
                  <div className="ranking-metric">
                    <strong>{formatNumber(entry.uniqueCustomers)}</strong>
                    <span>{tx("clientes", "客户")}</span>
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
