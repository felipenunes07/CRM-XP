import { EventsMetrics } from "@olist-crm/shared";
import { AlertTriangle, MessageSquare, TrendingUp, Clock, Ghost } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: {
    value: number;
    label: string;
    positive?: boolean;
  };
  color?: string;
}

function MetricCard({ title, value, subtitle, icon: Icon, trend, color }: MetricCardProps) {
  return (
    <div className="wa-metric-card">
      <div className="wa-metric-icon" style={{ backgroundColor: color ? `${color}15` : undefined }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div className="wa-metric-content">
        <span className="wa-metric-title">{title}</span>
        <div className="wa-metric-value-row">
          <span className="wa-metric-value">{value}</span>
          {trend && (
            <span className={`wa-metric-trend ${trend.positive ? "positive" : "negative"}`}>
              {trend.positive ? "+" : ""}{trend.value}%
            </span>
          )}
        </div>
        {subtitle && <span className="wa-metric-subtitle">{subtitle}</span>}
      </div>
    </div>
  );
}

export function EventsSummaryPanel({ metrics }: { metrics: EventsMetrics | null }) {
  if (!metrics) return null;

  const { summary, operationalEfficiency } = metrics;

  return (
    <div className="wa-metrics-grid">
      <MetricCard
        title="Total de Eventos"
        value={summary.totalEvents}
        subtitle={`${summary.totalEvents - summary.unresolvedEvents} resolvidos`}
        icon={MessageSquare}
        color="#3b82f6"
      />
      <MetricCard
        title="Alertas Críticos"
        value={(summary.bySeverity?.CRITICAL || 0) + (summary.bySeverity?.HIGH || 0)}
        subtitle="Risco alto detectado"
        icon={AlertTriangle}
        color="#ef4444"
      />
      <MetricCard
        title="Sentimento Médio"
        value={(summary.averageSentiment ?? 0).toFixed(1)}
        subtitle={(summary.averageSentiment ?? 0) > 0.3 ? "Predominantemente positivo" : (summary.averageSentiment ?? 0) < -0.3 ? "Atenção necessária" : "Neutro"}
        icon={TrendingUp}
        color="#10b981"
      />
      <MetricCard
        title="Resolução Média"
        value={`${(operationalEfficiency.averageResolutionTimeHours ?? 0).toFixed(1)}h`}
        subtitle="Tempo de encerramento"
        icon={Clock}
        color="#8b5cf6"
      />
      <MetricCard
        title="Gargalos"
        value={operationalEfficiency.bottleneckAgents?.length ?? 0}
        subtitle="Agentes com pendências"
        icon={Ghost}
        color="#f59e0b"
      />
    </div>
  );
}
