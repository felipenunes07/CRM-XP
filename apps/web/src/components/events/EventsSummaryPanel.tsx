import type { CSSProperties, ElementType } from "react";
import type { EventsMetrics } from "@olist-crm/shared";
import { AlertTriangle, MessageSquareWarning, ShoppingCart, TimerReset, TrendingUp } from "lucide-react";

export type EventsScopePatch = {
  eventType?: string;
  severity?: string;
  resolved?: string;
  isGroup?: boolean;
  search?: string;
  agentId?: string;
};

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: ElementType;
  color: string;
  onClick?: () => void;
  disabled?: boolean;
}

function MetricCard({ title, value, subtitle, icon: Icon, color, onClick, disabled }: MetricCardProps) {
  return (
    <button
      type="button"
      className="wa-metric-card-v2"
      onClick={onClick}
      disabled={disabled}
      style={{ "--metric-accent": color } as CSSProperties}
    >
      <div className="wa-metric-icon-v2">
        <Icon size={24} />
      </div>
      <div className="wa-metric-body-v2">
        <span className="wa-metric-value-v2">{value}</span>
        <span className="wa-metric-title-v2">{title}</span>
        <span className="wa-metric-sub-v2">{subtitle}</span>
      </div>
    </button>
  );
}

export function EventsSummaryPanel({
  metrics,
  onSelectScope,
}: {
  metrics: EventsMetrics | null;
  onSelectScope?: (patch: EventsScopePatch) => void;
}) {
  if (!metrics) return null;

  const { summary } = metrics;
  const highRiskCount = (summary.bySeverity?.CRITICAL || 0) + (summary.bySeverity?.HIGH || 0);
  const complaintCount = summary.complaintsCount + summary.negativeFeedbacks + summary.riskEvents;
  const salesCount = summary.opportunitiesCount;
  const pendingCount = summary.actionRequiredEvents;
  const resolvedPct = summary.totalEvents > 0 ? Math.round(summary.resolutionRate * 100) : 0;

  return (
    <div className="wa-kpi-strip" aria-label="KPIs do período">
      <MetricCard
        title="Total de Eventos"
        value={summary.totalEvents}
        subtitle={`${summary.unresolvedEvents} sem resolução`}
        icon={TrendingUp}
        color="#475569"
        onClick={() => onSelectScope?.({})}
      />
      <MetricCard
        title="Alertas Críticos"
        value={highRiskCount}
        subtitle="Severidade alta ou crítica"
        icon={AlertTriangle}
        color="#ef4444"
        disabled={highRiskCount === 0}
        onClick={() => onSelectScope?.({ severity: "CRITICAL,HIGH", resolved: "false" })}
      />
      <MetricCard
        title="Reclamações"
        value={complaintCount}
        subtitle="Clientes insatisfeitos"
        icon={MessageSquareWarning}
        color="#f97316"
        disabled={complaintCount === 0}
        onClick={() => onSelectScope?.({ eventType: "COMPLAINT,NEGATIVE_FEEDBACK,CHURN_RISK,RISK,ESCALATION" })}
      />
      <MetricCard
        title="Oportunidades"
        value={salesCount}
        subtitle={`${summary.questionCount} dúvidas informativas`}
        icon={ShoppingCart}
        color="#2563eb"
        disabled={salesCount === 0}
        onClick={() => onSelectScope?.({ eventType: "SALES_OPPORTUNITY" })}
      />
      <MetricCard
        title="Pendências"
        value={pendingCount}
        subtitle={`${resolvedPct}% taxa de resolução`}
        icon={TimerReset}
        color="#7c3aed"
        disabled={pendingCount === 0}
        onClick={() => onSelectScope?.({
          eventType: "RISK,ESCALATION,COMPLAINT,NEGATIVE_FEEDBACK,CHURN_RISK,SALES_OPPORTUNITY",
          resolved: "false",
        })}
      />
    </div>
  );
}
