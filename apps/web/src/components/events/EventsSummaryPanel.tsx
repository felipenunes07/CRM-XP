import type { ElementType } from "react";
import type { EventsMetrics } from "@olist-crm/shared";
import { AlertTriangle, Gauge, MessageSquare, TrendingUp, Clock } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ElementType;
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
        title="Eventos unicos"
        value={summary.totalEvents}
        subtitle={`${summary.totalEvents - summary.unresolvedEvents} resolvidos`}
        icon={MessageSquare}
        color="#3b82f6"
      />
      <MetricCard
        title="Alertas criticos"
        value={(summary.bySeverity?.CRITICAL || 0) + (summary.bySeverity?.HIGH || 0)}
        subtitle="Risco alto detectado"
        icon={AlertTriangle}
        color="#ef4444"
      />
      <MetricCard
        title="Sentimento medio"
        value={Number(summary.averageSentiment ?? 0).toFixed(1)}
        subtitle={Number(summary.averageSentiment ?? 0) > 0.3 ? "Predominantemente positivo" : Number(summary.averageSentiment ?? 0) < -0.3 ? "Atencao necessaria" : "Neutro"}
        icon={TrendingUp}
        color="#10b981"
      />
      <MetricCard
        title="Resolucao media"
        value={`${Number(operationalEfficiency.averageResolutionTimeHours ?? 0).toFixed(1)}h`}
        subtitle="Tempo de encerramento"
        icon={Clock}
        color="#8b5cf6"
      />
      <MetricCard
        title="Gargalos"
        value={operationalEfficiency.bottleneckAgents?.length ?? 0}
        subtitle="Agentes com pendencias"
        icon={Gauge}
        color="#f59e0b"
      />
    </div>
  );
}
