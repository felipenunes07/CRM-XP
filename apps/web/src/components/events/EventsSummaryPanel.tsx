import type { EventsMetrics } from "@olist-crm/shared";
import type { ElementType } from "react";
import {
  AlertTriangle,
  CircleHelp,
  Clock,
  FilterX,
  Inbox,
  Target,
  TrendingUp,
  UsersRound,
} from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ElementType;
  trend?: {
    value: number;
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
  const executive = metrics.executiveSummary;
  const actionableEvents = summary.actionRequiredEvents ?? summary.unresolvedEvents;
  const sentiment = summary.averageSentiment ?? 0;

  return (
    <div className="wa-metrics-grid">
      <MetricCard
        title="Acao Necessaria"
        value={actionableEvents}
        subtitle="Pendencias reais no periodo"
        icon={Inbox}
        color="#3b82f6"
      />
      <MetricCard
        title="Alertas Criticos"
        value={(summary.bySeverity?.CRITICAL || 0) + (summary.bySeverity?.HIGH || 0)}
        subtitle="Risco alto ou escalacao"
        icon={AlertTriangle}
        color="#ef4444"
      />
      <MetricCard
        title="Oportunidades"
        value={summary.opportunitiesCount ?? executive?.opportunitiesCount ?? 0}
        subtitle={`${executive?.unansweredOpportunitiesCount ?? 0} sem resposta ha mais de 2h`}
        icon={Target}
        color="#2563eb"
      />
      <MetricCard
        title="Duvidas"
        value={summary.questionCount ?? executive?.questionCount ?? 0}
        subtitle="Perguntas que pedem retorno"
        icon={CircleHelp}
        color="#7c3aed"
      />
      <MetricCard
        title="Ruido Filtrado"
        value={summary.filteredNoiseCount ?? executive?.filteredNoiseCount ?? 0}
        subtitle="Saudacoes, respostas curtas e listas"
        icon={FilterX}
        color="#64748b"
      />
      <MetricCard
        title="Sentimento Medio"
        value={sentiment.toFixed(1)}
        subtitle={sentiment > 0.3 ? "Predominantemente positivo" : sentiment < -0.3 ? "Atencao necessaria" : "Neutro"}
        icon={TrendingUp}
        color="#10b981"
      />
      <MetricCard
        title="Resolucao Media"
        value={`${(operationalEfficiency.averageResolutionTimeHours ?? 0).toFixed(1)}h`}
        subtitle="Tempo de encerramento"
        icon={Clock}
        color="#8b5cf6"
      />
      <MetricCard
        title="Gargalos"
        value={operationalEfficiency.bottleneckAgents?.length ?? 0}
        subtitle="Agentes com fila acionavel"
        icon={UsersRound}
        color="#f59e0b"
      />
    </div>
  );
}
