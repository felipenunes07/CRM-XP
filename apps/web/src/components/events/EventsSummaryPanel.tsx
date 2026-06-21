import type { CSSProperties, ElementType } from "react";
import type { EventsMetrics } from "@olist-crm/shared";
import { AlertTriangle, Gauge, HelpCircle, MessageSquareWarning, ShoppingCart, TimerReset } from "lucide-react";

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
      className="wa-metric-card"
      onClick={onClick}
      disabled={disabled}
      style={{ "--metric-color": color } as CSSProperties}
    >
      <div className="wa-metric-icon">
        <Icon size={22} />
      </div>
      <div className="wa-metric-content">
        <span className="wa-metric-title">{title}</span>
        <span className="wa-metric-value">{value}</span>
        <span className="wa-metric-subtitle">{subtitle}</span>
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

  const { summary, operationalEfficiency } = metrics;
  const highRiskCount = (summary.bySeverity?.CRITICAL || 0) + (summary.bySeverity?.HIGH || 0);
  const complaintCount = summary.complaintsCount + summary.negativeFeedbacks + summary.riskEvents;
  const salesCount = summary.opportunitiesCount;
  const pendingCount = summary.actionRequiredEvents;
  const bottleneckCount = operationalEfficiency.bottleneckAgents?.length ?? 0;
  const topBottleneck = operationalEfficiency.bottleneckAgents?.[0] ?? null;
  const bottleneckPatch = topBottleneck?.agentId
    ? { agentId: topBottleneck.agentId, resolved: "false" }
    : { resolved: "false" };

  return (
    <div className="wa-metrics-grid" aria-label="Atalhos de revisao">
      <MetricCard
        title="Criticos e altos"
        value={highRiskCount}
        subtitle="Abrir riscos abertos"
        icon={AlertTriangle}
        color="#ef4444"
        disabled={highRiskCount === 0}
        onClick={() => onSelectScope?.({ severity: "CRITICAL,HIGH", resolved: "false" })}
      />
      <MetricCard
        title="Reclamacoes"
        value={complaintCount}
        subtitle="Clientes irritados ou risco"
        icon={MessageSquareWarning}
        color="#f97316"
        disabled={complaintCount === 0}
        onClick={() => onSelectScope?.({ eventType: "COMPLAINT,NEGATIVE_FEEDBACK,CHURN_RISK,RISK,ESCALATION" })}
      />
      <MetricCard
        title="Oportunidades"
        value={salesCount}
        subtitle={`${summary.questionCount} duvidas informativas`}
        icon={ShoppingCart}
        color="#2563eb"
        disabled={salesCount === 0}
        onClick={() => onSelectScope?.({ eventType: "SALES_OPPORTUNITY" })}
      />
      <MetricCard
        title="Pendencias reais"
        value={pendingCount}
        subtitle="Exclui duvidas comuns"
        icon={TimerReset}
        color="#7c3aed"
        disabled={pendingCount === 0}
        onClick={() => onSelectScope?.({
          eventType: "RISK,ESCALATION,COMPLAINT,NEGATIVE_FEEDBACK,CHURN_RISK,SALES_OPPORTUNITY",
          resolved: "false",
        })}
      />
      <MetricCard
        title="Gargalos"
        value={bottleneckCount}
        subtitle={metrics.executiveSummary?.bottleneckAgentText || "Abrir maior fila pendente"}
        icon={bottleneckCount > 0 ? Gauge : HelpCircle}
        color="#0f766e"
        disabled={bottleneckCount === 0}
        onClick={() => onSelectScope?.(bottleneckPatch)}
      />
    </div>
  );
}
