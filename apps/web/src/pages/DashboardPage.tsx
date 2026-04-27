import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Target, Users, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import type { AgendaItem, PortfolioTrendPoint, TrendRangeSelection } from "@olist-crm/shared";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { InfoHint } from "../components/InfoHint";
import { StatCard } from "../components/StatCard";
import { CustomerTable } from "../components/CustomerTable";
import { PeriodSelector } from "../components/PeriodSelector";
import { SalesPerformancePanel } from "../components/SalesPerformancePanel";
import { TrendRangeAnalysisPanel } from "../components/TrendRangeAnalysisPanel";
import { useAuth } from "../hooks/useAuth";
import { useUiLanguage } from "../i18n";
import { api } from "../lib/api";
import { formatDate, formatNumber, formatCurrency, getFormattingLocale } from "../lib/format";
import { isTrendRangeVisible, resolveTrendRangeSelection } from "./dashboardPage.helpers";

type TrendPeriod = '90d' | '6m' | '1y' | 'max';
const DAY_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_TREND_START_YEAR = 2023;

interface PeriodOption {
  value: TrendPeriod;
  label: string;
  days: number;
}

function getDashboardTrendMaxDays(referenceDate = new Date()) {
  const startUtc = Date.UTC(DASHBOARD_TREND_START_YEAR, 0, 1);
  const todayUtc = Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  return Math.max(1, Math.floor((todayUtc - startUtc) / DAY_MS) + 1);
}

const periodOptions: PeriodOption[] = [
  { value: '90d', label: '90 dias', days: 90 },
  { value: '6m', label: '6 meses', days: 180 },
  { value: '1y', label: '1 ano', days: 365 },
  { value: 'max', label: 'Período Máximo', days: 730 },
];

const resolvedPeriodOptions = periodOptions.map((option) =>
  option.value === "max" ? { ...option, days: getDashboardTrendMaxDays() } : option,
);

const bucketFilters = {
  "0-14": { minDaysInactive: 0, maxDaysInactive: 14 },
  "15-30": { minDaysInactive: 15, maxDaysInactive: 30 },
  "31-59": { minDaysInactive: 31, maxDaysInactive: 59 },
  "60-89": { minDaysInactive: 60, maxDaysInactive: 89 },
  "90-179": { minDaysInactive: 90, maxDaysInactive: 179 },
  "180+": { minDaysInactive: 180 },
} as const;

type BucketLabel = keyof typeof bucketFilters;
type ChartView = "inactivity" | "trend" | "screensSold";
type TrendDisplayMode = "count" | "percent";

const trendSeries = [
  {
    shareKey: "activeShare",
    countKey: "activeCount",
    label: "Ativos",
    emoji: "🟢",
    color: "#2f9d67",
    gradientId: "trend-active-fill",
    fillOpacityStart: 0.14,
    fillOpacityEnd: 0.03,
  },
  {
    shareKey: "attentionShare",
    countKey: "attentionCount",
    label: "Atencao",
    emoji: "🟡",
    color: "#d09a29",
    gradientId: "trend-attention-fill",
    fillOpacityStart: 0.12,
    fillOpacityEnd: 0.025,
  },
  {
    shareKey: "inactiveShare",
    countKey: "inactiveCount",
    label: "Inativos",
    emoji: "🔴",
    color: "#d9534f",
    gradientId: "trend-inactive-fill",
    fillOpacityStart: 0.045,
    fillOpacityEnd: 0.008,
  },
] as const;

const totalCustomersTrendLine = {
  countKey: "totalCustomers",
  label: "Total de clientes",
  color: "#2956d7",
} as const;

interface ChartAnnotation {
  id?: string;
  date: string;
  label: string;
  description: string;
}

interface HoveredAnnotationState {
  annotation: ChartAnnotation;
  mouseX: number;
  mouseY: number;
}

const FULL_SCREEN_ANNOTATION_TOOLTIP_WIDTH = 280;
const FULL_SCREEN_ANNOTATION_TOOLTIP_HEIGHT = 170;
const FULL_SCREEN_ANNOTATION_TOOLTIP_GAP = 18;
const FULL_SCREEN_ANNOTATION_TOOLTIP_MARGIN = 16;

type TrendShareKey = (typeof trendSeries)[number]["shareKey"];
type TrendCompositionPoint = PortfolioTrendPoint & Record<TrendShareKey, number> & { growth30d?: number; growthPercent30d?: number; slope?: number; growthDaily?: number; annotation?: ChartAnnotation; dailyItemsSold?: number; weeklyItemsSold?: number };

const chartViewCopy = {
  inactivity: {
    eyebrow: "Faixas de inatividade",
    title: "Onde esta o risco de parada",
    description:
      "Clique em uma barra para filtrar a tabela abaixo. Os status comerciais seguem os cortes: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias.",
    toggleLabel: "Risco de parada",
    toggleHelper: "Veja as faixas de dias sem compra e filtre a lista.",
  },
  trend: {
    eyebrow: "Composicao da carteira",
    title: "Composicao diaria da base",
    description:
      "Acompanhe a quantidade diaria de clientes em cada status. O tooltip continua mostrando a participacao percentual de cada grupo no dia.",
    toggleLabel: "Evolucao da base",
    toggleHelper: "Compare a quantidade diaria de ativos, atencao e inativos.",
  },
  screensSold: {
    eyebrow: "Desempenho de vendas",
    title: "Quantidade de itens (telas) vendidas",
    description:
      "Acompanhe o volume mensal de itens vendidos. As linhas comparam o desempenho do ano atual com os anos anteriores.",
    toggleLabel: "Telas vendidas",
    toggleHelper: "Compare o volume mensal (2024 a 2026).",
  },
} as const;

function extractTrendParts(value: string) {
  const dailyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dailyMatch) {
    return null;
  }

  return {
    year: dailyMatch[1],
    month: Number(dailyMatch[2]),
    day: Number(dailyMatch[3]),
  };
}

function formatTrendAxisLabel(value: string) {
  const parts = extractTrendParts(value);
  if (!parts) {
    return "--";
  }

  const safeMonth = Math.max(1, Math.min(12, parts.month ?? 1));

  return `${String(parts.day ?? 0).padStart(2, "0")}/${String(safeMonth).padStart(2, "0")}`;
}

function formatTrendTooltipLabel(value: string) {
  const parts = extractTrendParts(value);
  if (!parts) {
    return "--";
  }

  return formatDate(value);
}

function getFullScreenAnnotationTooltipPosition(mouseX: number, mouseY: number) {
  const viewportWidth = typeof window === "undefined" ? mouseX + FULL_SCREEN_ANNOTATION_TOOLTIP_WIDTH : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? mouseY + FULL_SCREEN_ANNOTATION_TOOLTIP_HEIGHT : window.innerHeight;
  const shouldRenderToLeft =
    mouseX > viewportWidth - (FULL_SCREEN_ANNOTATION_TOOLTIP_WIDTH + FULL_SCREEN_ANNOTATION_TOOLTIP_GAP + FULL_SCREEN_ANNOTATION_TOOLTIP_MARGIN);

  const left = shouldRenderToLeft
    ? Math.max(FULL_SCREEN_ANNOTATION_TOOLTIP_MARGIN, mouseX - FULL_SCREEN_ANNOTATION_TOOLTIP_WIDTH - FULL_SCREEN_ANNOTATION_TOOLTIP_GAP)
    : Math.min(
      mouseX + FULL_SCREEN_ANNOTATION_TOOLTIP_GAP,
      viewportWidth - FULL_SCREEN_ANNOTATION_TOOLTIP_WIDTH - FULL_SCREEN_ANNOTATION_TOOLTIP_MARGIN,
    );

  const top = Math.max(
    FULL_SCREEN_ANNOTATION_TOOLTIP_MARGIN,
    Math.min(mouseY - 26, viewportHeight - FULL_SCREEN_ANNOTATION_TOOLTIP_HEIGHT - FULL_SCREEN_ANNOTATION_TOOLTIP_MARGIN),
  );

  return { left, top };
}

function formatDecimal(value: number, fractionDigits = 1) {
  return new Intl.NumberFormat(getFormattingLocale(), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatTrendPercent(value: number, fractionDigits = 1) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

  return `${formatDecimal(safeValue, fractionDigits)}%`;
}

function calculateSlope(data: number[]) {
  const n = data.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const val = data[i] ?? 0;
    sumX += i;
    sumY += val;
    sumXY += i * val;
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

function normalizeTrendPoint(point: PortfolioTrendPoint): TrendCompositionPoint {
  const totalFromStatuses = point.activeCount + point.attentionCount + point.inactiveCount;
  const total = totalFromStatuses || point.totalCustomers;

  if (!total) {
    return {
      ...point,
      activeShare: 0,
      attentionShare: 0,
      inactiveShare: 0,
    };
  }

  return {
    ...point,
    activeShare: (point.activeCount / total) * 100,
    attentionShare: (point.attentionCount / total) * 100,
    inactiveShare: (point.inactiveCount / total) * 100,
  };
}

function bucketColor(label: string, selected: boolean) {
  if (selected) {
    return "#5f8cff";
  }

  if (label === "0-14" || label === "15-30") {
    return "#a8c1ff";
  }

  if (label === "31-59" || label === "60-89") {
    return "#5f8cff";
  }

  return "#2956d7";
}

function getAgendaPreviewItems(items: AgendaItem[] | undefined) {
  return (items ?? []).slice(0, 6);
}

function bucketTooltipNote(label: string) {
  if (label === "0-14") {
    return "Todos nesta faixa seguem no status Ativo.";
  }

  if (label === "15-30") {
    return "Todos nesta faixa seguem no status Ativo.";
  }

  if (label === "31-59") {
    return "Todos nesta faixa ja estao em Atencao.";
  }

  if (label === "60-89") {
    return "Todos nesta faixa ja estao em Atencao.";
  }

  return "Todos nesta faixa ja estao Inativos.";
}

const AnnotationModal = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  date,
  initialData
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (label: string, description: string) => void;
  onDelete?: () => void;
  date: string;
  initialData?: any
}) => {
  const [label, setLabel] = useState(initialData?.label ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");

  useEffect(() => {
    setLabel(initialData?.label ?? "");
    setDescription(initialData?.description ?? "");
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      backdropFilter: "blur(4px)"
    }}>
      <div className="panel" style={{
        width: "100%",
        maxWidth: "500px",
        margin: "1rem",
        padding: "1.5rem",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h3 style={{ margin: 0 }}>{initialData ? "Editar Marco" : "Novo Marco"} - {date}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "#64748b" }}>&times;</button>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#1e293b", marginBottom: "0.5rem" }}>Título</label>
          <input
            type="text"
            autoFocus
            className="form-input"
            style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "1rem" }}
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Ex: Campanha de Reativação"
          />
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#1e293b", marginBottom: "0.5rem" }}>Descrição</label>
          <textarea
            className="form-input"
            style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "1rem", minHeight: "120px", resize: "vertical" }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descreva o que houve neste dia..."
          />
        </div>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", alignItems: "center" }}>
          {initialData && (
            <button
              onClick={onDelete}
              style={{ padding: "0.75rem 1.25rem", borderRadius: "8px", border: "1px solid #fee2e2", backgroundColor: "#fef2f2", color: "#ef4444", fontWeight: 600, cursor: "pointer", marginRight: "auto" }}
            >
              Excluir
            </button>
          )}
          <button
            onClick={onClose}
            style={{ padding: "0.75rem 1.25rem", borderRadius: "8px", border: "1px solid #e2e8f0", backgroundColor: "#f8f9fa", color: "#64748b", fontWeight: 600, cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(label, description)}
            disabled={!label.trim()}
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: label.trim() ? "#2956d7" : "#cbd5e1",
              color: "white",
              fontWeight: 600,
              cursor: label.trim() ? "pointer" : "not-allowed",
              transition: "all 0.2s"
            }}
          >
            Salvar Marco
          </button>
        </div>
      </div>
    </div>
  );
};

function InactivityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  const { tx } = useUiLanguage();

  if (!active || !payload?.length || !label) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <strong>{tx(`${label} dias sem compra`, `${label}天未购买`)}</strong>
      <div className="chart-tooltip-count">
        <strong>{formatNumber(payload[0]?.value ?? 0)}</strong>
        <span>{tx("clientes nessa faixa", "该区间客户数")}</span>
      </div>
      <p>
        {label === "0-14" || label === "15-30"
          ? tx("Todos nesta faixa seguem no status Ativo.", "这个区间的客户都处于活跃状态。")
          : label === "31-59" || label === "60-89"
            ? tx("Todos nesta faixa ja estao em Atencao.", "这个区间的客户都已经处于关注状态。")
            : tx("Todos nesta faixa ja estao Inativos.", "这个区间的客户都已经处于沉默状态。")}
      </p>
    </div>
  );
}

function SalesTrendTooltip({ active, payload, label, tx }: any) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  if (data.weeklyItemsSold === undefined) return null;

  return (
    <div className="chart-tooltip" style={{ minWidth: "220px", padding: "1rem" }}>
      <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "0.5rem", marginBottom: "0.5rem" }}>
        <strong style={{ fontSize: "0.95rem" }}>{formatTrendTooltipLabel(label)}</strong>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.1rem" }}>📦</span>
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b" }}>
            {tx("Itens Vendidos (Semana)", "Items Sold (Week)")}
          </span>
        </div>
        <strong style={{ fontSize: "1rem", color: "#1e293b" }}>{formatNumber(data.weeklyItemsSold)}</strong>
      </div>
      {data.trafficSpend !== undefined && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.1rem" }}>💰</span>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b" }}>
              {tx("Investimento em Tráfego", "Traffic Investment")}
            </span>
          </div>
          <strong style={{ fontSize: "1rem", color: "#10b981" }}>{formatCurrency(data.trafficSpend)}</strong>
        </div>
      )}
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
  mode = "count",
  isFullScreen = false,
}: {
  active?: boolean;
  payload?: Array<{ color?: string; dataKey?: string; value?: number; payload?: TrendCompositionPoint }>;
  label?: string;
  mode?: TrendDisplayMode;
  isFullScreen?: boolean;
}) {
  const { tx } = useUiLanguage();

  if (!active || !payload?.length || !label) {
    return null;
  }

  const point = payload[0]?.payload;
  const trafficSpend = point?.trafficSpend ?? 0;

  return (
    <div
      className="chart-tooltip trend-tooltip"
      style={isFullScreen ? {
        width: "280px",
        maxWidth: "calc(100vw - 4rem)",
        boxSizing: "border-box",
        padding: "1rem",
        borderRadius: "12px",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
      } : {}}
    >
      <strong style={isFullScreen ? { fontSize: "1.1rem", marginBottom: "0.75rem", display: "block" } : {}}>{formatTrendTooltipLabel(label)}</strong>
      {!isFullScreen && point?.annotation && (
        <div
          style={{
            marginTop: "0.8rem",
            marginBottom: "0.8rem",
            padding: "0.8rem",
            backgroundColor: "rgba(41, 86, 215, 0.05)",
            borderRadius: "8px",
            borderLeft: "4px solid #2956d7"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "1.2rem" }}>📌</span>
            <strong style={{ fontSize: isFullScreen ? "1.1rem" : "0.95rem", color: "#1e293b" }}>{point.annotation.label}</strong>
          </div>
          <p style={{ margin: 0, fontSize: isFullScreen ? "0.95rem" : "0.8rem", color: "#64748b", lineHeight: "1.4" }}>
            {point.annotation.description}
          </p>
        </div>
      )}
      {point ? (
        <div className="chart-tooltip-count" style={isFullScreen ? { marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #f1f5f9" } : {}}>
          <strong style={isFullScreen ? { fontSize: "1.4rem", color: "#2956d7" } : {}}>{formatNumber(point.totalCustomers)}</strong>
          <span style={isFullScreen ? { fontSize: "0.88rem" } : {}}>{tx("clientes na base nesse dia", "当天客户池中的客户")}</span>
        </div>
      ) : null}



      <div className="trend-tooltip-list">
        {mode === "count" && (
          <div className="trend-tooltip-item" style={{ display: "block", padding: isFullScreen ? "0.4rem 0" : "0.4rem 0" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.9rem",
                width: "100%",
              }}
            >
              <span className="trend-tooltip-label">
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: isFullScreen ? "1rem" : "0.85rem",
                    height: isFullScreen ? "0.25rem" : "0.2rem",
                    borderRadius: "999px",
                    backgroundColor: totalCustomersTrendLine.color,
                    marginRight: "0.45rem",
                    verticalAlign: "middle",
                  }}
                />
                {tx("Total de clientes", "å®¢æˆ·æ€»æ•°")}
              </span>
              <strong style={isFullScreen ? { fontSize: "1.1rem" } : {}}>{formatNumber(point?.totalCustomers ?? 0)} {tx("clientes", "customers")}</strong>
            </div>
            {point?.slope !== undefined && (
              (() => {
                const slope = point.slope;
                const slopeColor = slope > 2.5 ? "#059669" : slope > 1.5 ? "#10b981" : slope >= 1.0 ? "#34d399" : slope > 0.2 ? "#6ee7b7" : slope > -0.2 ? "#94a3b8" : slope > -0.5 ? "#f87171" : slope > -1.5 ? "#ef4444" : "#dc2626";

                return (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      marginTop: "0.4rem",
                      borderTop: "1px solid rgba(41, 86, 215, 0.08)",
                      paddingTop: "0.4rem",
                      gap: "0.15rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: isFullScreen ? "1rem" : "0.9rem", color: slopeColor }}>
                      <span style={{ fontWeight: 600, opacity: 0.9 }}>{tx("Inclinação da Reta:", "Line Slope:")}</span>
                      <strong>
                        {slope > 0 ? "+" : ""}
                        {formatDecimal(slope, 2)}
                      </strong>
                      <span style={{ fontSize: isFullScreen ? "0.85rem" : "0.75rem", opacity: 0.8 }}>{tx("clientes/dia", "clients/day")}</span>
                    </div>
                    <div style={{ fontSize: "0.7rem", fontWeight: 500, color: slopeColor }}>
                      {slope > 4.0
                        ? tx("Crescimento Explosivo", "Explosive Growth")
                        : slope > 2.5
                          ? tx("Crescimento Exponencial", "Exponential Growth")
                          : slope > 1.5
                            ? tx("Crescimento Acelerado", "Accelerated Growth")
                            : slope >= 1.0
                              ? tx("Crescimento Constante", "Steady Growth")
                              : slope > 0.2
                                ? tx("Crescimento Leve", "Slight Growth")
                                : slope > -0.2
                                  ? tx("Base Estabilizada", "Stabilized Base")
                                  : slope > -0.5
                                    ? tx("Retração Leve", "Slight Contraction")
                                    : slope > -1.5
                                      ? tx("Queda em Curso", "Ongoing Decline")
                                      : tx("Queda Crítica", "Critical Decline")}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}
        {trendSeries.map((line) => {
          const entry = payload.find((payloadItem) => payloadItem.dataKey === line.countKey);
          const customerCount = point?.[line.countKey] ?? entry?.value ?? 0;
          const share = point?.[line.shareKey] ?? 0;
          return (
            <div key={line.countKey} className="trend-tooltip-item">
              <span className="trend-tooltip-label">
                <span className="trend-tooltip-emoji" style={{ fontSize: isFullScreen ? "1.3rem" : "1.1rem", marginRight: "0.25rem" }}>{line.emoji}</span>
                {line.label === "Ativos" ? tx("Ativos", "活跃") : line.label === "Atencao" ? tx("Atencao", "关注") : tx("Inativos", "沉默")}
              </span>
              <div className="trend-tooltip-metric">
                {mode === "percent" ? (
                  <>
                    <strong>{formatTrendPercent(share)}</strong>
                    <span style={isFullScreen ? { fontSize: "0.9rem" } : {}}>{formatNumber(customerCount)} {tx("clientes", "customers")}</span>
                  </>
                ) : (
                  <>
                    <strong>{formatNumber(customerCount)} {tx("clientes", "customers")}</strong>
                    <span style={isFullScreen ? { fontSize: "0.9rem" } : {}}>{formatTrendPercent(share)} {tx("da base", "share of base")}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FullScreenAnnotationReferenceDot({
  cx,
  cy,
  annotation,
  isHovered = false,
  onHover,
  onLeave,
  onSelect,
}: {
  cx?: number;
  cy?: number;
  annotation: ChartAnnotation;
  isHovered?: boolean;
  onHover: (annotation: ChartAnnotation, event: ReactMouseEvent<SVGRectElement>) => void;
  onLeave: () => void;
  onSelect: (annotation: ChartAnnotation) => void;
}) {
  if (typeof cx !== "number" || typeof cy !== "number") {
    return null;
  }

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={isHovered ? 14 : 11}
        fill="rgba(41, 86, 215, 0.14)"
        opacity={isHovered ? 1 : 0.45}
        pointerEvents="none"
      />
      <circle cx={cx} cy={cy} r={8} fill="#fff" stroke="#2956d7" strokeWidth={3} pointerEvents="none" />
      <text
        x={cx}
        y={cy - 20}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="24"
        pointerEvents="none"
      >
        📌
      </text>
      <rect
        x={cx - 24}
        y={cy - 36}
        width={48}
        height={58}
        rx={20}
        fill="transparent"
        style={{ cursor: "pointer" }}
        onMouseEnter={(event) => onHover(annotation, event)}
        onMouseMove={(event) => onHover(annotation, event)}
        onMouseLeave={onLeave}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(annotation);
        }}
      />
    </g>
  );
}

function formatShare(value: number, total: number) {
  if (!total) {
    return "0% da base";
  }

  return `${((value / total) * 100).toFixed(1).replace(".", ",")}% da base`;
}

export function DashboardPage() {
  const { token } = useAuth();
  const { tx } = useUiLanguage();

  const [selectedPeriod, setSelectedPeriod] = useState<TrendPeriod>("max");
  const [selectedPrefix, setSelectedPrefix] = useState<string | undefined>(undefined);

  const trendDays = resolvedPeriodOptions.find((opt) => opt.value === selectedPeriod)?.days ?? getDashboardTrendMaxDays();

  const dashboardQuery = useQuery({
    queryKey: ["dashboard", trendDays, selectedPrefix],
    queryFn: () => api.dashboard(token!, trendDays, selectedPrefix),
    enabled: Boolean(token),
  });

  const [selectedBucket, setSelectedBucket] = useState<BucketLabel | null>(null);
  const [chartView, setChartView] = useState<ChartView>("inactivity");
  const [screensSoldPeriodMode, setScreensSoldPeriodMode] = useState<"comparative" | "continuous">("comparative");
  const [selectedSaleMonth, setSelectedSaleMonth] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [rankingPeriod, setRankingPeriod] = useState<"month" | "today">("month");
  const [trendDisplayMode, setTrendDisplayMode] = useState<TrendDisplayMode>("count");
  const [selectedTrendRange, setSelectedTrendRange] = useState<TrendRangeSelection | null>(null);
  const [trendRangeDraft, setTrendRangeDraft] = useState<{ anchorDate: string; currentDate: string } | null>(null);
  const [userAnnotations, setUserAnnotations] = useState<ChartAnnotation[]>([]);
  const [isAnnotationModalOpen, setIsAnnotationModalOpen] = useState(false);
  const [editingAnnotation, setEditingAnnotation] = useState<{ date: string; existing?: ChartAnnotation } | null>(null);
  const [isTrendFullScreen, setIsTrendFullScreen] = useState(false);
  const [showSalesInTrend, setShowSalesInTrend] = useState(false);
  const [salesBaseline, setSalesBaseline] = useState<number | null>(null);
  const [hoveredFullScreenAnnotation, setHoveredFullScreenAnnotation] = useState<HoveredAnnotationState | null>(null);
  const [fsBottomChartHeight, setFsBottomChartHeight] = useState(240);
  const [isDraggingFsResize, setIsDraggingFsResize] = useState(false);

  const suppressNextTrendClickRef = useRef(false);
  const fsContainerRef = useRef<HTMLDivElement>(null);

  const annotationsQuery = useQuery({
    queryKey: ["chart-annotations"],
    queryFn: async () => {
      const response = await api.getChartAnnotations(token!);
      return response;
    },
    enabled: Boolean(token),
  });

  const agendaQuery = useQuery({
    queryKey: ["dashboard-agenda-preview"],
    queryFn: () => api.agenda(token!, 6, 0),
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

  const priorityCustomersQuery = useQuery({
    queryKey: ["dashboard-priority-customers"],
    queryFn: () =>
      api.customers(token!, {
        sortBy: "priority",
        limit: 120,
      }),
    enabled: Boolean(token && !selectedBucket && !selectedSaleMonth),
  });

  const salesCustomersQuery = useQuery({
    queryKey: ["dashboard-sales-customers", selectedSaleMonth, selectedPrefix],
    queryFn: () =>
      api.customers(token!, {
        purchasedInYearMonth: selectedSaleMonth!,
        customerPrefix: selectedPrefix,
        sortBy: "priority",
        limit: 120,
      }),
    enabled: Boolean(token && selectedSaleMonth && chartView === "screensSold"),
  });

  const trendRangeAnalysisQuery = useQuery({
    queryKey: [
      "dashboard-trend-range-analysis",
      selectedTrendRange?.startDate,
      selectedTrendRange?.endDate,
    ],
    queryFn: () =>
      api.dashboardTrendRangeAnalysis(
        token!,
        selectedTrendRange!.startDate,
        selectedTrendRange!.endDate,
      ),
    enabled: Boolean(token && selectedTrendRange),
  });

  const businessDaysInMonth = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let count = 0;
    const date = new Date(year, month, 1);
    while (date.getMonth() === month) {
      const day = date.getDay();
      if (day !== 0 && day !== 6) count++;
      date.setDate(date.getDate() + 1);
    }
    return count;
  }, []);

  const itemsSoldData = useMemo(() => {
    const monthNames = [tx("Jan", "1月"), tx("Fev", "2月"), tx("Mar", "3月"), tx("Abr", "4月"), tx("Mai", "5月"), tx("Jun", "6月"), tx("Jul", "7月"), tx("Ago", "8月"), tx("Set", "9月"), tx("Out", "10月"), tx("Nov", "11月"), tx("Dez", "12月")];
    const trend = dashboardQuery.data?.itemsSoldTrend;
    if (!trend) return [];

    if (screensSoldPeriodMode === "continuous") {
      return trend.map(m => {
        const monthName = monthNames[m.month - 1];
        return {
          month: `${monthName}/${String(m.year).slice(2)}`,
          rawDate: `${m.year}-${String(m.month).padStart(2, '0')}`,
          totalItems: m.totalItems,
          clItems: m.clItems,
          khItems: m.khItems,
          ljItems: m.ljItems,
          otherItems: m.otherItems,
          meta: m.targetAmount
        };
      });
    }

    const currentYear = new Date().getFullYear();
    const chartYears = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear];

    return monthNames.map((monthName, idx) => {
      const monthNum = idx + 1;
      const point: any = { month: monthName };
      chartYears.forEach(year => {
        const dataForYearAndMonth = trend?.find(m => m.year === year && m.month === monthNum);
        if (dataForYearAndMonth) {
          point[`year${year}`] = dataForYearAndMonth.totalItems;
          if (year === currentYear && dataForYearAndMonth.targetAmount) {
            point.meta = dataForYearAndMonth.targetAmount;
          }
        }
      });
      return point;
    });
  }, [dashboardQuery.data?.itemsSoldTrend, screensSoldPeriodMode, tx]);

  useEffect(() => {
    if (annotationsQuery.data) {
      setUserAnnotations(annotationsQuery.data);
    }
  }, [annotationsQuery.data]);

  useEffect(() => {
    if (!isTrendFullScreen) {
      setHoveredFullScreenAnnotation(null);
    }
  }, [isTrendFullScreen]);

  useEffect(() => {
    if (!isDraggingFsResize || !fsContainerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = fsContainerRef.current!.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY - 120; // legend and bottom padding
      setFsBottomChartHeight(Math.max(100, Math.min(newHeight, containerRect.height - 250)));
    };

    const handleMouseUp = () => {
      setIsDraggingFsResize(false);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingFsResize]);

  useEffect(() => {
    sessionStorage.setItem("dashboard-trend-display-mode", trendDisplayMode);
  }, [trendDisplayMode]);

  useEffect(() => {
    const availableTrendDates = dashboardQuery.data?.portfolioTrend?.map((point) => point.date) ?? [];
    if (selectedTrendRange && availableTrendDates.length && !isTrendRangeVisible(selectedTrendRange, availableTrendDates)) {
      setSelectedTrendRange(null);
    }
  }, [dashboardQuery.data?.portfolioTrend, selectedTrendRange]);

  const handleChartClick = (data: any) => {
    if (suppressNextTrendClickRef.current) {
      suppressNextTrendClickRef.current = false;
      return;
    }
    if (!data || !data.activeLabel) return;
    const date = data.activeLabel;
    const existing = userAnnotations.find(a => a.date === date);
    setEditingAnnotation({ date, existing });
    setIsAnnotationModalOpen(true);
  };

  const handleTrendMouseDown = (state: { activeLabel?: string } | undefined) => {
    const label = state?.activeLabel;
    if (!label) {
      return;
    }

    setTrendRangeDraft({ anchorDate: label, currentDate: label });
  };

  const handleTrendMouseMove = (state: { activeLabel?: string } | undefined) => {
    const label = state?.activeLabel;
    if (!trendRangeDraft || !label) {
      return;
    }

    setTrendRangeDraft((current) =>
      current
        ? {
          ...current,
          currentDate: label,
        }
        : current,
    );
  };

  const finalizeTrendRangeSelection = (fallbackLabel?: string, shouldSuppressClick = false) => {
    if (!trendRangeDraft) {
      return;
    }

    const resolvedRange = resolveTrendRangeSelection(
      trendRangeDraft.anchorDate,
      fallbackLabel ?? trendRangeDraft.currentDate,
    );

    if (resolvedRange) {
      setSelectedTrendRange(resolvedRange);
      if (shouldSuppressClick) {
        suppressNextTrendClickRef.current = true;
      }
    }

    setTrendRangeDraft(null);
  };

  const clearTrendRangeSelection = () => {
    setTrendRangeDraft(null);
    setSelectedTrendRange(null);
  };

  const handleSaveAnnotation = async (label: string, description: string) => {
    if (!editingAnnotation) return;

    try {
      await api.saveChartAnnotation(token!, {
        id: editingAnnotation.existing?.id,
        date: editingAnnotation.date,
        label,
        description
      });
      annotationsQuery.refetch();
      setIsAnnotationModalOpen(false);
    } catch (error) {
      alert("Erro ao salvar anotação.");
    }
  };

  const handleDeleteAnnotation = async () => {
    if (!editingAnnotation?.existing?.id) return;

    if (window.confirm("Deseja remover este marco?")) {
      try {
        await api.deleteChartAnnotation(token!, editingAnnotation.existing.id);
        annotationsQuery.refetch();
        setIsAnnotationModalOpen(false);
      } catch (error) {
        alert("Erro ao remover anotação.");
      }
    }
  };

  const handleFullScreenAnnotationHover = (
    annotation: ChartAnnotation,
    event: ReactMouseEvent<SVGRectElement>,
  ) => {
    setHoveredFullScreenAnnotation({
      annotation,
      mouseX: event.clientX,
      mouseY: event.clientY,
    });
  };

  const handleFullScreenAnnotationLeave = () => {
    setHoveredFullScreenAnnotation(null);
  };

  const handleSelectAnnotation = (annotation: ChartAnnotation) => {
    setEditingAnnotation({ date: annotation.date, existing: annotation });
    setIsAnnotationModalOpen(true);
  };

  const handleFsResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingFsResize(true);
  };



  if (dashboardQuery.isLoading) {
    return <div className="page-loading">{tx("Carregando dashboard...", "正在加载仪表盘...")}</div>;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return <div className="page-error">{tx("Nao foi possivel carregar o dashboard.", "无法加载仪表盘。")}</div>;
  }

  const metrics = dashboardQuery.data;
  const localizedChartViewCopy = {
    inactivity: {
      eyebrow: tx("Faixas de inatividade", "沉默区间"),
      title: tx("Onde esta o risco de parada", "停购风险分布"),
      description: tx(
        "Clique em uma barra para filtrar a tabela abaixo. Os status comerciais seguem os cortes: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias.",
        "点击柱状条可筛选下方表格。客户状态规则为：30天内为活跃，31到89天为关注，90天及以上为沉默。",
      ),
      toggleLabel: tx("Risco de parada", "停购风险"),
      toggleHelper: tx("Veja as faixas de dias sem compra e filtre a lista.", "查看未购买天数区间并筛选列表。"),
    },
    trend: {
      eyebrow: tx("Composicao da carteira", "客户池构成"),
      title: tx("Composicao diaria da base", "客户池每日构成"),
      description: tx(
        "Acompanhe a quantidade diaria de clientes em cada status. O tooltip continua mostrando a participacao percentual de cada grupo no dia.",
        "每一天都按客户池总量折算为100%，用于观察活跃客户是否增加，或沉默客户是否累积。",
      ),
      toggleLabel: tx("Evolucao da base", "客户池走势"),
      toggleHelper: tx("Compare a quantidade diaria de ativos, atencao e inativos.", "比较活跃、关注和沉默客户的每日占比。"),
    },
    screensSold: {
      eyebrow: tx("Desempenho de vendas", "销售表现"),
      title: tx("Quantidade de itens (telas) vendidas", "已售项目数量（屏）"),
      description: tx(
        "Acompanhe o volume mensal de itens vendidos. As linhas comparam o desempenho do ano atual com os anos anteriores.",
        "跟踪每月售出数量，并将当前年份与往年表现进行对比。",
      ),
      toggleLabel: tx("Telas vendidas", "已售数量"),
      toggleHelper: tx("Compare o volume mensal (2024 a 2026).", "比较每月销量（2024 至 2026）。"),
    },
  } as const;
  const activeChartCopy = localizedChartViewCopy[chartView];
  const trendData = metrics.portfolioTrend.map(normalizeTrendPoint).map((point, index, array) => {
    const referenceIndex30 = Math.max(0, index - 30);
    const referencePoint30 = array[referenceIndex30];
    const growth30d = referencePoint30 ? point.totalCustomers - referencePoint30.totalCustomers : 0;
    const growthPercent30d = (referencePoint30 && referencePoint30.totalCustomers > 0) ? (growth30d / referencePoint30.totalCustomers) * 100 : 0;

    const windowSize = 14;
    const startIndex = Math.max(0, index - (windowSize - 1));
    const windowValues = array.slice(startIndex, index + 1).map(p => p.totalCustomers);
    const slope = calculateSlope(windowValues);

    const annotation = userAnnotations.find(a => point.date.startsWith(a.date));

    const isEndOfWeek = (array.length - 1 - index) % 7 === 0;
    let weeklyItemsSold = undefined;
    if (isEndOfWeek) {
      const startIndex = Math.max(0, index - 6);
      weeklyItemsSold = array.slice(startIndex, index + 1).reduce((sum, p) => sum + (p.dailyItemsSold ?? 0), 0);
    }

    return { ...point, growth30d, growthPercent30d, slope, annotation, weeklyItemsSold };
  });

  const weeklyTrendData = trendData.filter((_, index, array) => (array.length - 1 - index) % 7 === 0);
  const finalTrendData = isTrendFullScreen ? weeklyTrendData : trendData;

  const trendRangePreview = resolveTrendRangeSelection(
    trendRangeDraft?.anchorDate,
    trendRangeDraft?.currentDate,
  );
  const activeTrendRange = selectedTrendRange ?? trendRangePreview;

  const isTrendPercentMode = trendDisplayMode === "percent";
  const trendDescription = isTrendPercentMode
    ? tx(
      "Veja a participacao percentual diaria de ativos, atencao e inativos. Troque para quantidade quando quiser enxergar os clientes reais.",
      "See the daily percentage share of active, attention, and inactive customers. Switch back to counts whenever you want the real totals.",
    )
    : tx(
      "Acompanhe a quantidade diaria de clientes em cada status. O tooltip continua mostrando a participacao percentual de cada grupo no dia.",
      "Track the daily customer count in each status. The tooltip still shows each group's percentage share for the day.",
    );
  const chartDescription = chartView === "trend" ? trendDescription : activeChartCopy.description;
  const trendModeOptions: Array<{ value: TrendDisplayMode; label: string; helper: string }> = [
    { value: "count", label: tx("Quantidade", "Count"), helper: tx("Clientes reais", "Real customers") },
    { value: "percent", label: "%", helper: tx("Participacao", "Share") },
  ];
  
  const isSalesTableActive = chartView === "screensSold" && Boolean(selectedSaleMonth);
  const tableCustomers = isSalesTableActive 
    ? (salesCustomersQuery.data ?? []) 
    : selectedBucket ? (filteredCustomersQuery.data ?? []) : (priorityCustomersQuery.data ?? []);
  const tableQueryLoading = isSalesTableActive
    ? salesCustomersQuery.isLoading
    : selectedBucket ? filteredCustomersQuery.isLoading : priorityCustomersQuery.isLoading;
  const tableQueryError = isSalesTableActive
    ? salesCustomersQuery.isError
    : selectedBucket ? filteredCustomersQuery.isError : priorityCustomersQuery.isError;
  const fullScreenAnnotationTooltipPosition = hoveredFullScreenAnnotation
    ? getFullScreenAnnotationTooltipPosition(hoveredFullScreenAnnotation.mouseX, hoveredFullScreenAnnotation.mouseY)
    : null;

  const currentYear = new Date().getFullYear();
  const chartYears = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear];



  async function handleSync() {
    try {
      setIsSyncing(true);
      await api.syncData(token!, "direct");
      window.location.reload();
    } catch (err) {
      alert(tx("Falha na sincronizacao: ", "同步失败：") + String(err));
    } finally {
      setIsSyncing(false);
    }
  }

  function handleChangeChartView(nextView: ChartView) {
    setChartView(nextView);
    if (nextView === "trend") {
      setSelectedBucket(null);
    }
  }

  async function handleSetTarget() {
    const userInput = window.prompt(tx("Meta de telas (mensal):", "月度屏数目标："), String(metrics.currentMonthTarget || ""));
    if (userInput === null) return;

    const val = parseInt(userInput.replace(/\D/g, ''), 10);
    if (isNaN(val)) {
      alert(tx("Valor invalido", "数值无效"));
      return;
    }

    try {
      const d = new Date();
      await api.saveMonthlyTarget(token!, d.getFullYear(), d.getMonth() + 1, val);
      dashboardQuery.refetch();
    } catch (err) {
      alert(tx("Erro ao salvar: ", "保存失败：") + String(err));
    }
  }

  const targetAmount = metrics.currentMonthTarget ?? 0;
  const dailyGoal = targetAmount > 0 ? Math.ceil(targetAmount / businessDaysInMonth) : 0;
  const itemsSold = metrics.currentMonthItemsSold;
  const targetPercent = targetAmount > 0 ? Math.round((itemsSold / targetAmount) * 100) : 0;
  const isTargetHit = targetAmount > 0 && itemsSold >= targetAmount;
  const targetRemaining = Math.max(0, targetAmount - itemsSold);
  const targetExceededBy = Math.max(0, itemsSold - targetAmount);
  const targetProgress = Math.min(100, targetPercent);
  const progressRadius = 28;
  const progressCircumference = 2 * Math.PI * progressRadius;
  const monthlyGoalCardClassName = [
    "stat-card",
    "monthly-goal-card",
    isTargetHit ? "is-complete" : "",
    targetAmount === 0 ? "is-empty" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const monthlyGoalHighlight =
    targetAmount === 0
      ? tx("Sem meta", "未设置目标")
      : isTargetHit
        ? targetExceededBy > 0
          ? tx(`+${formatNumber(targetExceededBy)} acima`, `超出 ${formatNumber(targetExceededBy)}`)
          : tx("Meta batida", "已达成目标")
        : tx(`${targetPercent}% do alvo`, `完成目标 ${targetPercent}%`);
  const monthlyGoalStatus =
    targetAmount === 0
      ? tx("Defina sua meta no menu Metas para acompanhar o ritmo do mes.", "请先在目标页面设置本月目标，以便跟踪当前节奏。")
      : isTargetHit
        ? targetExceededBy > 0
          ? tx(`Voce ja passou ${formatNumber(targetExceededBy)} telas do alvo.`, `已超出目标 ${formatNumber(targetExceededBy)} 屏。`)
          : tx("Objetivo concluido neste mes.", "本月目标已完成。")
        : tx(`Faltam ${formatNumber(targetRemaining)} para a meta`, `距离目标还差 ${formatNumber(targetRemaining)}`);
  const monthlyGoalMetaLabel = targetAmount > 0 ? tx(`Alvo ${formatNumber(targetAmount)}`, `目标 ${formatNumber(targetAmount)}`) : tx("Meta pendente", "待设置目标");

  return (
    <div className="page-stack">
      <section className="dashboard-hero-premium">
        <div className="hero-premium-bg">
          <div className="hero-premium-gradient"></div>
        </div>
        <div className="hero-premium-content">
          <div className="hero-premium-copy">
            <div className="premium-badge">{tx("Operacao comercial", "销售运营")}</div>
            <h2 className="premium-title">{tx("Saude da carteira de clientes XP", "XP 客户池健康度")}</h2>
            <p className="premium-subtitle">{tx("Use esta tela para decidir quem puxar agora, acompanhar faixas de risco e manter a base atualizada.", "用这块面板判断现在该联系谁、跟踪风险区间，并保持客户库最新。")}</p>
            <div className="premium-actions">
              <Link className="premium-button primary" to="/agenda">
                {tx("Abrir agenda do dia", "打开今日日程")}
              </Link>
              <button className="premium-button ghost" type="button" disabled={isSyncing} onClick={handleSync}>
                {isSyncing ? tx("Sincronizando...", "同步中...") : tx("Sincronizar Agora", "立即同步")}
              </button>
            </div>
          </div>

          <div className="hero-premium-stats">
            <div className="premium-stat-card">
              <div className="premium-stat-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="premium-stat-info">
                <span>{tx("Ultima sincronizacao", "最近同步")}</span>
                <strong>
                  {metrics.lastSyncAt ? new Date(metrics.lastSyncAt).toLocaleString(getFormattingLocale()) : tx("Pendente...", "待处理...")}
                </strong>
              </div>
            </div>

            <div className="premium-stat-card interactive" onClick={handleSetTarget} title={tx("Clique para editar a meta", "点击编辑目标")}>
              <div className={`premium-stat-icon ${isTargetHit ? 'accent-success' : 'accent-blue'}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="premium-stat-info">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{tx("Meta do mes", "本月目标")}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <strong>{formatNumber(itemsSold)} / {targetAmount > 0 ? formatNumber(targetAmount) : tx("Definir", "设置")}</strong>
                  {targetAmount > 0 && (
                    <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', marginTop: '2px' }}>
                      <div style={{ width: `${Math.min(100, targetPercent)}%`, height: '100%', background: isTargetHit ? '#10b981' : '#3b82f6', transition: 'width 0.3s ease' }}></div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="premium-stat-card">
              <div className="premium-stat-icon accent-purple">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="premium-stat-info">
                <span>{tx("Tempo medio de compra", "平均购买周期")}</span>
                <strong>{metrics.averageFrequencyDays.toFixed(1)} <small>{tx("dias", "天")}</small></strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard title={tx("Total de clientes", "客户总数")} value={formatNumber(metrics.totalCustomers)} helper={tx("Base comercial consolidada", "已汇总的销售客户池")} />
        <StatCard
          title={tx("Clientes ativos", "活跃客户")}
          value={formatNumber(metrics.statusCounts.ACTIVE)}
          badge={formatShare(metrics.statusCounts.ACTIVE, metrics.totalCustomers)}
          helper={tx("Clientes dentro da zona ativa", "处于活跃区间的客户")}
          tone="success"
        />
        <StatCard
          title={tx("Clientes em atencao", "关注客户")}
          value={formatNumber(metrics.statusCounts.ATTENTION)}
          badge={formatShare(metrics.statusCounts.ATTENTION, metrics.totalCustomers)}
          helper={tx("Clientes pedindo monitoramento", "需要持续跟进的客户")}
          tone="warning"
        />
        <StatCard
          title={tx("Clientes inativos", "沉默客户")}
          value={formatNumber(metrics.statusCounts.INACTIVE)}
          badge={formatShare(metrics.statusCounts.INACTIVE, metrics.totalCustomers)}
          helper={tx("Clientes fora da zona ativa", "已离开活跃区间的客户")}
          tone="danger"
        />
        <StatCard
          title="Peças de Hoje"
          value={`${formatNumber(metrics.todayItemsSold)} itens`}
          badge={dailyGoal > 0 ? `${Math.round((metrics.todayItemsSold / dailyGoal) * 100)}% da meta` : undefined}
          helper={dailyGoal > 0 ? `Meta diária: ${formatNumber(dailyGoal)} itens (Meta mensal / ${businessDaysInMonth} dias úteis).` : "Total de itens vendidos hoje."}
          tone={rankingPeriod === 'today' ? 'success' : 'primary'}
          onClick={() => setRankingPeriod(prev => prev === 'today' ? 'month' : 'today')}
        />
        <article className={monthlyGoalCardClassName}>
          <div className="monthly-goal-card__header">
            <div className="monthly-goal-card__copy">
              <p className="monthly-goal-card__eyebrow">Meta mensal</p>
              <strong className="monthly-goal-card__value">
                {targetAmount > 0 ? `${formatNumber(itemsSold)} telas` : "Sem meta"}
              </strong>
              <div className="monthly-goal-card__meta-row">
                <span className="monthly-goal-card__pill">
                  <span className="monthly-goal-card__pill-dot" />
                  {monthlyGoalMetaLabel}
                </span>
                <span className="monthly-goal-card__highlight">{monthlyGoalHighlight}</span>
              </div>
            </div>

            <div className="monthly-goal-card__progress" aria-hidden="true">
              <svg
                className="monthly-goal-card__progress-ring"
                width="72"
                height="72"
                viewBox="0 0 72 72"
              >
                <circle
                  cx="36"
                  cy="36"
                  r={progressRadius}
                  className="monthly-goal-card__progress-track"
                />
                <circle
                  cx="36"
                  cy="36"
                  r={progressRadius}
                  className="monthly-goal-card__progress-fill"
                  strokeDasharray={progressCircumference}
                  strokeDashoffset={progressCircumference - (targetProgress / 100) * progressCircumference}
                />
              </svg>
              <div className="monthly-goal-card__progress-core" />
              <div className="monthly-goal-card__progress-label">
                <strong>{targetAmount > 0 ? `${targetPercent}%` : "--"}</strong>
                <span>meta</span>
              </div>
            </div>
          </div>

          <span
            className={[
              "monthly-goal-card__status",
              isTargetHit ? "is-complete" : "",
              targetAmount === 0 ? "is-empty" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {monthlyGoalStatus}
          </span>
        </article>
      </section>

      <section className="grid-two dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{activeChartCopy.eyebrow}</p>
              {chartView === "inactivity" ? (
                <h3 className="header-with-info">
                  {activeChartCopy.title}
                  <InfoHint text={tx("As barras mostram dias sem compra. Regra de status atual: Ativo ate 30 dias, Atencao de 31 a 89 dias e Inativo a partir de 90 dias.", "柱状条展示未购买天数。当前状态规则：30天内为活跃，31到89天为关注，90天及以上为沉默。")} />
                </h3>
              ) : (
                <h3>{activeChartCopy.title}</h3>
              )}
            </div>
          </div>
          <p className="panel-subcopy">{chartDescription}</p>
          <div className="chart-switcher" role="tablist" aria-label={tx("Alternar visualizacao dos graficos do dashboard", "切换仪表盘图表视图")}>
            {(Object.entries(localizedChartViewCopy) as Array<[ChartView, (typeof localizedChartViewCopy)[ChartView]]>).map(([view, copy]) => (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={chartView === view}
                aria-pressed={chartView === view}
                className={`chart-switch-button ${chartView === view ? "active" : ""}`}
                onClick={() => handleChangeChartView(view)}
              >
                <strong>{copy.toggleLabel}</strong>
                <span>{copy.toggleHelper}</span>
              </button>
            ))}
          </div>

          {chartView === "inactivity" ? (
            <>
              <div className="status-guide-grid">
                <div className="status-guide-card is-active">
                  <strong>{tx("Ativo", "活跃")}</strong>
                  <span>{tx("Ate 30 dias sem comprar", "距离上次购买不超过 30 天")}</span>
                </div>
                <div className="status-guide-card is-attention">
                  <strong>{tx("Atencao", "关注")}</strong>
                  <span>{tx("De 31 a 89 dias sem comprar", "距离上次购买 31 到 89 天")}</span>
                </div>
                <div className="status-guide-card is-inactive">
                  <strong>{tx("Inativo", "沉默")}</strong>
                  <span>{tx("90 dias ou mais sem comprar", "距离上次购买 90 天及以上")}</span>
                </div>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={420}>
                  <BarChart
                    data={metrics.inactivityBuckets}
                    onClick={(state) => {
                      const label = (state as { activeLabel?: string } | undefined)?.activeLabel;
                      if (!label || !(label in bucketFilters)) {
                        return;
                      }
                      setSelectedBucket((current) => (current === label ? null : (label as BucketLabel)));
                    }}
                    margin={{ top: 32, right: 8, left: 0, bottom: 0 }}
                  >
                    <XAxis dataKey="label" stroke="#5f6f95" />
                    <Tooltip content={<InactivityTooltip />} cursor={{ fill: "rgba(41, 86, 215, 0.04)" }} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]} cursor="pointer">
                      <LabelList
                        dataKey="count"
                        position="top"
                        offset={10}
                        formatter={(value: number) => formatNumber(value)}
                        className="chart-bar-label"
                      />
                      {metrics.inactivityBuckets.map((bucket) => (
                        <Cell key={bucket.label} fill={bucketColor(bucket.label, selectedBucket === bucket.label)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {selectedBucket ? (
                <div className="inline-actions">
                  <span className="tag">{tx("Filtro ativo:", "当前筛选：")} {selectedBucket}</span>
                  <button className="ghost-button" type="button" onClick={() => setSelectedBucket(null)}>
                    {tx("Limpar filtro", "清除筛选")}
                  </button>
                </div>
              ) : null}
            </>
          ) : chartView === "trend" ? (
            <>
              <div className="trend-chart-toolbar">
                <PeriodSelector value={selectedPeriod} onChange={setSelectedPeriod} />
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div
                    className="customers-view-switcher"
                    role="tablist"
                    aria-label={tx("Alternar leitura do grafico de evolucao da base", "Switch trend chart mode")}
                  >
                    {trendModeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="tab"
                        aria-selected={trendDisplayMode === option.value}
                        aria-pressed={trendDisplayMode === option.value}
                        className={`chart-switch-button ${trendDisplayMode === option.value ? "active" : ""}`}
                        onClick={() => setTrendDisplayMode(option.value)}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.helper}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => setIsTrendFullScreen(true)}
                    title={tx("Ver em tela cheia", "Full screen view")}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", cursor: "pointer", color: "#64748b", transition: "all 0.2s" }}
                  >
                    <span style={{ fontSize: "1.2rem" }}>⛶</span>
                  </button>
                </div>
              </div>
              <div className="trend-chart-wrap">
                {selectedTrendRange && (
                  <div className="trend-range-selection-bar">
                    <span>
                      {tx("Periodo selecionado:", "Selected range:")}{" "}
                      <strong>{formatDate(selectedTrendRange.startDate)}</strong> {tx("ate", "to")}{" "}
                      <strong>{formatDate(selectedTrendRange.endDate)}</strong>
                    </span>
                    <button className="ghost-button" type="button" onClick={clearTrendRangeSelection}>
                      {tx("Limpar faixa", "Clear range")}
                    </button>
                  </div>
                )}
                {trendData.length ? (
                  <ResponsiveContainer width="100%" height={420}>
                    <ComposedChart
                      data={trendData}
                      margin={{ top: 28, right: 18, left: 10, bottom: 4 }}
                      onClick={handleChartClick}
                      onMouseDown={handleTrendMouseDown}
                      onMouseMove={handleTrendMouseMove}
                      onMouseUp={(state) => finalizeTrendRangeSelection(state?.activeLabel, true)}
                      onMouseLeave={() => finalizeTrendRangeSelection()}
                      style={{ cursor: "pointer" }}
                    >
                      <defs>
                        {trendSeries.map((series) => (
                          <linearGradient key={series.gradientId} id={series.gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={series.color} stopOpacity={series.fillOpacityStart} />
                            <stop offset="100%" stopColor={series.color} stopOpacity={series.fillOpacityEnd} />
                          </linearGradient>
                        ))}
                      </defs>
                      {activeTrendRange ? (
                        <ReferenceArea
                          x1={activeTrendRange.startDate}
                          x2={activeTrendRange.endDate}
                          fill="#dbeafe"
                          fillOpacity={0.65}
                          strokeOpacity={0}
                        />
                      ) : null}
                      {userAnnotations.map((ann) => (
                        <ReferenceLine
                          key={`line-${ann.date}`}
                          x={ann.date}
                          stroke="#94a3b8"
                          strokeDasharray="4 2"
                          strokeWidth={2}
                          opacity={0.6}
                        />
                      ))}
                      {userAnnotations.map((ann) => {
                        const point = trendData.find(d => d.date === ann.date);
                        const yValue = point ? (point as any)[totalCustomersTrendLine.countKey] : undefined;
                        if (yValue === undefined) return null;

                        return (
                          <ReferenceDot
                            key={`dot-${ann.date}`}
                            x={ann.date}
                            y={yValue}
                            r={6}
                            fill="#fff"
                            stroke="#2956d7"
                            strokeWidth={2}
                            label={{
                              position: "top",
                              value: "📌",
                              fontSize: 18,
                              offset: 8,
                            }}
                          />
                        );
                      })}
                      <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => formatTrendAxisLabel(String(value))}
                        stroke="#5f6f95"
                        minTickGap={24}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        domain={isTrendPercentMode ? [0, 100] : [0, "auto"]}
                        ticks={isTrendPercentMode ? [0, 25, 50, 75, 100] : undefined}
                        tickFormatter={(value) =>
                          isTrendPercentMode
                            ? formatTrendPercent(Number(value), 0)
                            : formatNumber(Number(value))
                        }
                        stroke="#5f6f95"
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        width={isTrendPercentMode ? 56 : 72}
                      />
                      <Tooltip
                        content={<TrendTooltip mode={trendDisplayMode} isFullScreen={isTrendFullScreen} />}
                        cursor={{ stroke: "rgba(41, 86, 215, 0.3)", strokeWidth: 1 }}
                        offset={24}
                      />
                      {trendSeries.map((series) => (
                        <Area
                          key={series.shareKey}
                          type="monotone"
                          dataKey={isTrendPercentMode ? series.shareKey : series.countKey}
                          stroke="none"
                          fill={`url(#${series.gradientId})`}
                          dot={false}
                          legendType="none"
                        />
                      ))}
                      {trendSeries.map((series) => (
                        <Line
                          key={`${series.shareKey}-line`}
                          type="monotone"
                          dataKey={isTrendPercentMode ? series.shareKey : series.countKey}
                          name={series.label}
                          stroke={series.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: series.color, strokeWidth: 0 }}
                        />
                      ))}
                      {!isTrendPercentMode ? (
                        <Line
                          type="monotone"
                          dataKey={totalCustomersTrendLine.countKey}
                          name={tx("Total de clientes", "å®¢æˆ·æ€»æ•°")}
                          stroke={totalCustomersTrendLine.color}
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 5, fill: totalCustomersTrendLine.color, strokeWidth: 0 }}
                        />
                      ) : null}
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">{tx("Sem historico suficiente para montar a evolucao diaria da base.", "历史数据不足，无法生成客户池每日走势。")}</div>
                )}
              </div>
              <div className="trend-legend" aria-label={tx("Legenda do grafico de evolucao da base", "客户池走势图例")}>
                {trendSeries.map((series) => (
                  <span key={series.shareKey} className="trend-legend-item">
                    <span className="trend-legend-emoji" style={{ fontSize: "1.1rem", marginRight: "0.2rem" }}>{series.emoji}</span>
                    {series.label === "Ativos" ? tx("Ativos", "活跃") : series.label === "Atencao" ? tx("Atencao", "关注") : tx("Inativos", "沉默")}
                  </span>
                ))}
                {!isTrendPercentMode ? (
                  <span className="trend-legend-item">
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        width: "0.95rem",
                        height: "0.2rem",
                        borderRadius: "999px",
                        backgroundColor: totalCustomersTrendLine.color,
                        marginRight: "0.4rem",
                        verticalAlign: "middle",
                      }}
                    />
                    {tx("Total de clientes", "Total customers")}
                  </span>
                ) : null}
              </div>
            </>
            ) : chartView === "screensSold" ? (
            <>
              <div className="trend-chart-toolbar" style={{ marginTop: "1rem" }}>
                <div 
                  className="customers-view-switcher" 
                  role="tablist" 
                  aria-label={tx("Filtrar por categoria de cliente", "Filter by customer category")}
                >
                  {[
                    { value: undefined, label: tx("Total", "全部") },
                    { value: "CL", label: "CL" },
                    { value: "KH", label: "KH" },
                    { value: "LJ", label: "LJ" }
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      role="tab"
                      aria-selected={selectedPrefix === option.value}
                      className={`chart-switch-button ${selectedPrefix === option.value ? "active" : ""}`}
                      onClick={() => {
                        setSelectedPrefix(option.value);
                        setSelectedSaleMonth(null); // Reset selected month when category changes
                      }}
                    >
                      <strong>{option.label}</strong>
                    </button>
                  ))}
                </div>
                
                <div 
                  className="customers-view-switcher" 
                  role="tablist" 
                  style={{ marginLeft: "auto" }}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={screensSoldPeriodMode === "comparative"}
                    className={`chart-switch-button ${screensSoldPeriodMode === "comparative" ? "active" : ""}`}
                    onClick={() => {
                      setScreensSoldPeriodMode("comparative");
                      setSelectedSaleMonth(null); // Reset when switching view
                    }}
                  >
                    <strong>{tx("Comparativo Anual", "Annual Comparison")}</strong>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={screensSoldPeriodMode === "continuous"}
                    className={`chart-switch-button ${screensSoldPeriodMode === "continuous" ? "active" : ""}`}
                    onClick={() => {
                      setScreensSoldPeriodMode("continuous");
                      setSelectedSaleMonth(null); // Reset when switching view
                    }}
                  >
                    <strong>{tx("Todo o Período", "Whole Period")}</strong>
                  </button>
                </div>
              </div>
              <div className="trend-chart-wrap" style={{ marginTop: "1rem" }}>
                <ResponsiveContainer width="100%" height={420}>
                  {screensSoldPeriodMode === "continuous" ? (
                    <BarChart 
                      data={itemsSoldData} 
                      margin={{ top: 12, right: 18, left: 10, bottom: 20 }}
                      onClick={(data) => {
                        if (data && data.activePayload && data.activePayload[0]) {
                          setSelectedSaleMonth(data.activePayload[0].payload.rawDate);
                        }
                      }}
                    >
                      <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                      <XAxis 
                        dataKey="month" 
                        stroke="#5f6f95" 
                        tickLine={false} 
                        axisLine={false}
                        minTickGap={20}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis stroke="#5f6f95" tickLine={false} axisLine={false} width={65} tickFormatter={(val) => new Intl.NumberFormat(getFormattingLocale()).format(val)} />
                      <Tooltip
                        cursor={{ fill: "rgba(41, 86, 215, 0.05)" }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload || !payload.length) return null;
                          const data = payload[0].payload;
                          return (
                            <div className="chart-tooltip">
                              <strong>{label}</strong>
                              <div style={{ marginTop: "0.5rem" }}>
                                {payload.map((entry: any) => (
                                  <div key={entry.name} style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem", marginBottom: "0.25rem" }}>
                                    <span style={{ color: entry.color, fontWeight: 500 }}>{entry.name}</span>
                                    <strong>{tx(`${formatNumber(entry.value)} telas`, `${formatNumber(entry.value)} 屏`)}</strong>
                                  </div>
                                ))}
                                {selectedPrefix === undefined && (
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem", marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid #f1f5f9" }}>
                                    <span style={{ color: "#334155", fontWeight: 700 }}>Total</span>
                                    <strong>{tx(`${formatNumber(data.totalItems)} telas`, `${formatNumber(data.totalItems)} 屏`)}</strong>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }}
                      />
                      {selectedPrefix === undefined && <Bar dataKey="clItems" name="CL" stackId="a" fill="#2956d7" radius={[0, 0, 4, 4]} />}
                      {selectedPrefix === undefined && <Bar dataKey="khItems" name="KH" stackId="a" fill="#5f8cff" />}
                      {selectedPrefix === undefined && <Bar dataKey="ljItems" name="LJ" stackId="a" fill="#a8c1ff" />}
                      {selectedPrefix === undefined && <Bar dataKey="otherItems" name="Outros" stackId="a" fill="#e2e8f0" radius={[4, 4, 0, 0]} />}
                      {selectedPrefix !== undefined && <Bar dataKey="totalItems" name={selectedPrefix} fill="#2956d7" radius={[4, 4, 4, 4]} />}
                    </BarChart>
                  ) : (
                    <ComposedChart 
                      data={itemsSoldData} 
                      margin={{ top: 12, right: 18, left: 10, bottom: 4 }}
                      onClick={(data) => {
                         // In comparative view, it's harder to get the exact rawDate because X is just month number and lines are years.
                         // But if they click a point, activePayload has it.
                         // For now, let's keep it simple: we only support filtering table easily in continuous mode, or we construct the rawDate here if they click a specific year's line.
                         if (data && data.activePayload && data.activePayload[0] && data.activeTooltipIndex !== undefined) {
                            // Find the active payload they specifically clicked? Hard in ComposedChart line without custom logic.
                            // Let's just set the month, but we need the year. Default to currentYear if clicking comparative?
                            // Actually, it's safer to only enable the click-to-filter in continuous mode to avoid confusion, or we do our best here.
                            // I will just use the active tooltip month and currentYear for simplicity, but continuous mode is much better for this.
                            const monthStr = String(data.activeTooltipIndex + 1).padStart(2, "0");
                            setSelectedSaleMonth(`${currentYear}-${monthStr}`);
                         }
                      }}
                    >
                      <CartesianGrid stroke="rgba(41, 86, 215, 0.08)" vertical={false} />
                      <XAxis dataKey="month" stroke="#5f6f95" tickLine={false} axisLine={false} />
                      <YAxis stroke="#5f6f95" tickLine={false} axisLine={false} width={65} tickFormatter={(val) => new Intl.NumberFormat(getFormattingLocale()).format(val)} />
                      <Tooltip
                        cursor={{ stroke: "rgba(41, 86, 215, 0.3)", strokeWidth: 1 }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload || !payload.length) return null;
                          return (
                            <div className="chart-tooltip">
                              <strong>{label}</strong>
                              <div style={{ marginTop: "0.5rem" }}>
                                {payload.map((entry: any) => (
                                  <div key={entry.name} style={{ display: "flex", justifyContent: "space-between", gap: "1.5rem", marginBottom: "0.25rem" }}>
                                    <span style={{ color: entry.color, fontWeight: 500 }}>{entry.name}</span>
                                    <strong>{tx(`${formatNumber(entry.value)} telas`, `${formatNumber(entry.value)} 屏`)}</strong>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Line type="monotone" dataKey={`year${chartYears[0]}`} name={String(chartYears[0])} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="3 3" dot={{ r: 2 }} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey={`year${chartYears[1]}`} name={String(chartYears[1])} stroke="#a8c1ff" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey={`year${chartYears[2]}`} name={String(chartYears[2])} stroke="#5f8cff" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey={`year${chartYears[3]}`} name={String(chartYears[3])} stroke="#2956d7" strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      {!selectedPrefix && (
                        <Line type="monotone" dataKey="meta" name={tx("Meta (Atual)", "当前目标")} stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                      )}
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="trend-legend" aria-label={tx("Legenda do grafico de telas vendidas", "销量图例")}>
                {screensSoldPeriodMode === "continuous" && selectedPrefix === undefined ? (
                  <>
                    <span className="trend-legend-item">
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#2956d7", marginRight: "0.4rem" }}></span>
                      CL
                    </span>
                    <span className="trend-legend-item">
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#5f8cff", marginRight: "0.4rem" }}></span>
                      KH
                    </span>
                    <span className="trend-legend-item">
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#a8c1ff", marginRight: "0.4rem" }}></span>
                      LJ
                    </span>
                    <span className="trend-legend-item">
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#e2e8f0", marginRight: "0.4rem" }}></span>
                      Outros
                    </span>
                  </>
                ) : screensSoldPeriodMode === "continuous" && selectedPrefix !== undefined ? (
                  <>
                    <span className="trend-legend-item">
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#2956d7", marginRight: "0.4rem" }}></span>
                      {selectedPrefix}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="trend-legend-item">
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#e2e8f0", marginRight: "0.4rem" }}></span>
                      {chartYears[0]}
                    </span>
                    <span className="trend-legend-item">
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#a8c1ff", marginRight: "0.4rem" }}></span>
                      {chartYears[1]}
                    </span>
                    <span className="trend-legend-item">
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#5f8cff", marginRight: "0.4rem" }}></span>
                      {chartYears[2]}
                    </span>
                    <span className="trend-legend-item">
                      <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#2956d7", marginRight: "0.4rem" }}></span>
                      {chartYears[3]}
                    </span>
                    {!selectedPrefix && (
                      <span className="trend-legend-item">
                        <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#10b981", border: "2px dashed #ffffff", marginRight: "0.4rem" }}></span>
                        {tx("Meta (Atual)", "当前目标")}
                      </span>
                    )}
                  </>
                )}
              </div>
            </>
          ) : null}
        </article>

        <SalesPerformancePanel
          salesPerformance={rankingPeriod === 'today' ? metrics.todaySalesPerformance : metrics.salesPerformance}
          reactivationLeaderboard={metrics.reactivationLeaderboard}
          newCustomerLeaderboard={metrics.newCustomerLeaderboard}
          prospectingLeaderboard={metrics.prospectingLeaderboard}
          isLoading={dashboardQuery.isLoading}
          rankingPeriod={rankingPeriod}
          onResetRanking={() => setRankingPeriod('month')}
        />
      </section>

      {chartView === "trend" && selectedTrendRange ? (
        <TrendRangeAnalysisPanel
          analysis={trendRangeAnalysisQuery.data}
          isLoading={trendRangeAnalysisQuery.isLoading}
          isError={trendRangeAnalysisQuery.isError}
          onClearSelection={clearTrendRangeSelection}
        />
      ) : (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">
                {isSalesTableActive 
                  ? tx("Clientes que compraram no mês", "Customers who bought in the month")
                  : selectedBucket ? tx("Clientes filtrados pelo grafico", "按图表筛选的客户") : tx("Fila por prioridade", "优先级队列")}
              </p>
              <h3>
                {isSalesTableActive
                  ? tx(`Clientes com compras em ${selectedSaleMonth!.split("-").reverse().join("/")}`, `Purchased in ${selectedSaleMonth}`)
                  : selectedBucket ? tx(`Clientes na faixa ${selectedBucket}`, `区间 ${selectedBucket} 的客户`) : tx("Clientes para o time abordar agora", "团队当前优先联系的客户")}
              </h3>
              <p className="panel-subcopy">
                {isSalesTableActive
                  ? tx(`Exibindo clientes ${selectedPrefix ? `da categoria ${selectedPrefix} ` : ""}que compraram no mês selecionado no gráfico.`, `Showing customers who bought in the selected month.`)
                  : selectedBucket
                    ? tx("A selecao do grafico mostra apenas clientes da faixa escolhida.", "图表筛选后，这里只显示所选区间内的客户。")
                    : tx("Ordenacao base por prioridade comercial; a tabela tambem permite ordenar por coluna e ajustar larguras.", "列表默认按商业优先级排序，表格也支持按列排序和调整列宽。")}
              </p>
            </div>
          </div>

          {tableQueryLoading ? <div className="page-loading">{tx("Carregando clientes priorizados...", "正在加载优先客户...")}</div> : null}
          {tableQueryError ? <div className="page-error">{tx("Nao foi possivel carregar essa lista de clientes.", "无法加载该客户列表。")}</div> : null}
          {!tableQueryLoading && !tableQueryError ? <CustomerTable customers={tableCustomers} /> : null}
        </section>
      )}

      <AnnotationModal
        isOpen={isAnnotationModalOpen}
        onClose={() => setIsAnnotationModalOpen(false)}
        date={editingAnnotation?.date ?? ""}
        initialData={editingAnnotation?.existing}
        onSave={handleSaveAnnotation}
        onDelete={handleDeleteAnnotation}
      />

      {isTrendFullScreen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.98)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          padding: "1rem",
          animation: "fadeIn 0.3s ease-out",
          color: "white"
        }}>
          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .fs-chart-card {
              background: white;
              border-radius: 20px;
              padding: 2.5rem;
              height: 100%;
              display: flex;
              flex-direction: column;
              position: relative;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
              color: #1e293b;
              user-select: ${isDraggingFsResize ? 'none' : 'auto'};
            }
            .fs-resize-divider {
              height: 24px;
              margin: -12px 0;
              cursor: row-resize;
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 100;
              position: relative;
              transition: all 0.2s;
            }
            .fs-resize-divider:hover .divider-handle {
              background-color: #3b82f6;
              width: 80px;
              height: 6px;
            }
            .divider-handle {
              width: 60px;
              height: 4px;
              background-color: ${isDraggingFsResize ? "#3b82f6" : "#e2e8f0"};
              border-radius: 999px;
              transition: all 0.2s;
            }
          `}</style>

          <div className="fs-chart-card fullscreen-trend-chart-card" style={{ padding: "0.5rem" }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.5rem",
              paddingRight: "4rem"
            }}>

              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                backgroundColor: "#f8fafc",
                padding: "0.4rem",
                borderRadius: "12px",
                border: "1px solid #e2e8f0"
              }}>
                <button
                  onClick={() => setShowSalesInTrend(false)}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    backgroundColor: !showSalesInTrend ? "white" : "transparent",
                    color: !showSalesInTrend ? "#2563eb" : "#64748b",
                    boxShadow: !showSalesInTrend ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
                  }}
                >
                  {tx("Base Clientes", "Customer Base")}
                </button>
                <button
                  onClick={() => setShowSalesInTrend(true)}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "8px",
                    border: "none",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    backgroundColor: showSalesInTrend ? "white" : "transparent",
                    color: showSalesInTrend ? "#2563eb" : "#64748b",
                    boxShadow: showSalesInTrend ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
                  }}
                >
                  {tx("Vendas (Itens)", "Sales (Items)")}
                </button>
              </div>

              <button
                onClick={() => setIsTrendFullScreen(false)}
                style={{
                  position: "absolute",
                  top: "1.5rem",
                  right: "1.5rem",
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.2rem",
                  cursor: "pointer",
                  color: "#64748b",
                  transition: "all 0.2s",
                  zIndex: 10,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "#fee2e2";
                  e.currentTarget.style.color = "#ef4444";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "white";
                  e.currentTarget.style.color = "#64748b";
                }}
              >
                ✕
              </button>
            </div>
            {selectedTrendRange && (
              <div className="trend-range-selection-bar fullscreen" style={{ marginBottom: "0.75rem" }}>
                <span>
                  {tx("Periodo selecionado:", "Selected range:")}{" "}
                  <strong>{formatDate(selectedTrendRange.startDate)}</strong> {tx("ate", "to")}{" "}
                  <strong>{formatDate(selectedTrendRange.endDate)}</strong>
                </span>
                <button className="ghost-button" type="button" onClick={clearTrendRangeSelection}>
                  {tx("Limpar faixa", "Clear range")}
                </button>
              </div>
            )}
            <div ref={fsContainerRef} style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    syncId="fs-charts"
                    data={finalTrendData}
                    margin={{ top: 15, right: 20, left: 0, bottom: 0 }}
                    onClick={handleChartClick}
                    onMouseDown={handleTrendMouseDown}
                    onMouseMove={handleTrendMouseMove}
                    onMouseUp={(state) => finalizeTrendRangeSelection(state?.activeLabel, true)}
                    onMouseLeave={() => finalizeTrendRangeSelection()}
                  >
                    <defs>
                      {trendSeries.map((series) => (
                        <linearGradient key={series.gradientId} id={`fs-${series.gradientId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={series.color} stopOpacity={series.fillOpacityStart} />
                          <stop offset="100%" stopColor={series.color} stopOpacity={series.fillOpacityEnd} />
                        </linearGradient>
                      ))}
                    </defs>
                    {activeTrendRange ? (
                      <ReferenceArea
                        yAxisId="customers"
                        x1={activeTrendRange.startDate}
                        x2={activeTrendRange.endDate}
                        fill="#dbeafe"
                        fillOpacity={0.65}
                        strokeOpacity={0}
                      />
                    ) : null}
                    {userAnnotations.map((ann) => {
                      // Find the closest date in the finalTrendData to show the vertical line
                      const closestPoint = finalTrendData.reduce((prev, curr) => {
                        return Math.abs(new Date(curr.date).getTime() - new Date(ann.date).getTime()) < 
                               Math.abs(new Date(prev.date).getTime() - new Date(ann.date).getTime()) ? curr : prev;
                      });
                      
                      return (
                        <ReferenceLine
                          yAxisId="customers"
                          key={`fs-line-${ann.date}`}
                          x={closestPoint.date}
                          stroke="#94a3b8"
                          strokeDasharray="4 2"
                          strokeWidth={2}
                          opacity={0.6}
                        />
                      );
                    })}
                    {userAnnotations.map((ann) => {
                      const closestPoint = finalTrendData.reduce((prev, curr) => {
                        return Math.abs(new Date(curr.date).getTime() - new Date(ann.date).getTime()) < 
                               Math.abs(new Date(prev.date).getTime() - new Date(ann.date).getTime()) ? curr : prev;
                      });
                      
                      const yValue = (closestPoint as any)[totalCustomersTrendLine.countKey];
                      if (yValue === undefined) return null;
 
                      return (
                        <ReferenceDot
                          yAxisId="customers"
                          key={`fs-dot-${ann.date}`}
                          x={closestPoint.date}
                          y={yValue}
                          r={8}
                          fill="#fff"
                          stroke="#2956d7"
                          strokeWidth={3}
                          label={{ position: "top", value: "📌", fontSize: 24, offset: 12 }}
                        />
                      );
                    })}
                    {userAnnotations.map((ann) => {
                      const closestPoint = finalTrendData.reduce((prev, curr) => {
                        return Math.abs(new Date(curr.date).getTime() - new Date(ann.date).getTime()) < 
                               Math.abs(new Date(prev.date).getTime() - new Date(ann.date).getTime()) ? curr : prev;
                      });
 
                      const yValue = (closestPoint as any)[totalCustomersTrendLine.countKey];
                      if (yValue === undefined) return null;
 
                      return (
                        <ReferenceDot
                          yAxisId="customers"
                          key={`fs-hover-dot-${ann.date}`}
                          x={closestPoint.date}
                          y={yValue}
                          r={8}
                          shape={(props: any) => (
                            <FullScreenAnnotationReferenceDot
                              {...props}
                              annotation={ann}
                              isHovered={hoveredFullScreenAnnotation?.annotation.date === ann.date}
                              onHover={handleFullScreenAnnotationHover}
                              onLeave={handleFullScreenAnnotationLeave}
                              onSelect={handleSelectAnnotation}
                            />
                          )}
                        />
                      );
                    })}
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tickFormatter={formatTrendAxisLabel}
                      minTickGap={40}
                      style={{ fontSize: "0.85rem" }}
                      padding={{ left: 0, right: 0 }}
                    />
                    <YAxis
                      yAxisId="customers"
                      orientation="left"
                      domain={trendDisplayMode === "percent" ? [0, 100] : [0, "auto"]}
                      ticks={trendDisplayMode === "percent" ? [0, 25, 50, 75, 100] : undefined}
                      stroke="#94a3b8"
                      tickFormatter={(val) => trendDisplayMode === "percent" ? `${val}%` : formatNumber(val)}
                      style={{ fontSize: "0.85rem" }}
                      width={40}
                    />
                    <YAxis
                      yAxisId="sales-ghost"
                      orientation="right"
                      width={0}
                      tick={false}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="spend-ghost"
                      orientation="right"
                      width={0}
                      tick={false}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      content={<TrendTooltip mode={trendDisplayMode} isFullScreen={isTrendFullScreen} />}
                      offset={24}
                      position={{ x: 110, y: 0 }}
                      allowEscapeViewBox={{ x: true, y: true }}
                      wrapperStyle={{ zIndex: 20, pointerEvents: "none" }}
                    />
                    {trendSeries.map((series) => (
                      <Area
                        key={series.shareKey}
                        yAxisId="customers"
                        type="monotone"
                        dataKey={trendDisplayMode === "percent" ? series.shareKey : series.countKey}
                        stroke="none"
                        fill={`url(#fs-${series.gradientId})`}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                    {trendSeries.map((series) => (
                      <Line
                        key={`${series.shareKey}-line`}
                        yAxisId="customers"
                        type="monotone"
                        dataKey={trendDisplayMode === "percent" ? series.shareKey : series.countKey}
                        name={series.label}
                        stroke={series.color}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5, fill: series.color, strokeWidth: 0 }}
                        isAnimationActive={false}
                      />
                    ))}
                    {trendDisplayMode !== "percent" ? (
                      <Line
                        yAxisId="customers"
                        type="monotone"
                        dataKey={totalCustomersTrendLine.countKey}
                        name={tx("Total de clientes", "å®¢æˆ·æ€»æ•°")}
                        stroke={totalCustomersTrendLine.color}
                        strokeWidth={4}
                        dot={false}
                        activeDot={{ r: 6, fill: totalCustomersTrendLine.color, strokeWidth: 0 }}
                      />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
 
              {showSalesInTrend && (
                <>
                  <div className="fs-resize-divider" onMouseDown={handleFsResizeMouseDown}>
                    <div className="divider-handle" />
                  </div>
                  <div style={{ height: `${fsBottomChartHeight}px`, minHeight: 0, marginTop: "0.5rem" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      syncId="fs-charts"
                      data={finalTrendData}
                      margin={{ top: 0, right: 20, left: 0, bottom: 10 }}
                      barCategoryGap={0}
                      onClick={(state) => {
                        if (state && state.chartY !== undefined) {
                          // Calibrate the scale based on max sales + 10% Recharts padding
                          const maxSales = Math.max(...finalTrendData.map(d => d.weeklyItemsSold ?? 0), 10);
                          const chartHeight = 200 - 10 - 20; // Container height - bottom margin - internal padding
                          const relativeY = 1 - (state.chartY / chartHeight);
                          // Approximate conversion from pixel to data value
                          const estimatedValue = Math.max(0, Math.round(maxSales * 1.15 * relativeY));
                          setSalesBaseline(estimatedValue);
                        }
                      }}
                      onDoubleClick={() => setSalesBaseline(null)}
                    >
                      <XAxis
                        dataKey="date"
                        stroke="#cbd5e1"
                        tickFormatter={formatTrendAxisLabel}
                        minTickGap={40}
                        style={{ fontSize: "0.85rem" }}
                        padding={{ left: 0, right: 0 }}
                      />
                      <YAxis
                        yAxisId="customers-ghost"
                        orientation="left"
                        width={40}
                        tick={false}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="sales"
                        orientation="right"
                        width={0}
                        tick={false}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="spend"
                        orientation="right"
                        width={0}
                        tick={false}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={<SalesTrendTooltip tx={tx} />}
                        offset={24}
                        position={{ y: -100 }}
                        allowEscapeViewBox={{ x: false, y: true }}
                        wrapperStyle={{ zIndex: 100, pointerEvents: "none" }}
                      />
                      <Bar
                        yAxisId="sales"
                        dataKey="weeklyItemsSold"
                        fill="#bac9e2"
                        radius={0}
                      />
                      <Line
                        yAxisId="spend"
                        type="stepAfter"
                        dataKey="trafficSpend"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, fill: "#10b981", strokeWidth: 0 }}
                        name={tx("Investimento em Tráfego", "Traffic Investment")}
                      />
                      {salesBaseline !== null && (
                        <ReferenceLine
                          yAxisId="sales"
                          y={salesBaseline}
                          stroke="#ef4444"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{ 
                            value: `Meta: ${formatNumber(salesBaseline)}`, 
                            position: "insideRight", 
                            fill: "#ef4444", 
                            fontSize: 12,
                            fontWeight: 700,
                            offset: 10
                          }}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>

            <div className="trend-legend" style={{ marginTop: "2rem", borderTop: "1px solid #f1f5f9", paddingTop: "1.5rem", display: "flex", gap: "2rem", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "1.5rem" }}>
                {trendSeries.map((series) => (
                  <span key={series.shareKey} className="trend-legend-item" style={{ fontSize: "1rem" }}>
                    <span className="trend-legend-color" style={{ backgroundColor: series.color, width: 14, height: 14 }}></span>
                    {series.label}
                  </span>
                ))}
              </div>
              {showSalesInTrend && (
                <div style={{ marginLeft: "auto", display: "flex", gap: "1.5rem" }}>
                  <span className="trend-legend-item" style={{ fontSize: "1rem" }}>
                    <span className="trend-legend-color" style={{ backgroundColor: "#becbe3", width: 14, height: 14, borderRadius: "2px" }}></span>
                    {tx("Itens Vendidos (Barras Semanais)", "Items Sold (Weekly Bars)")}
                  </span>
                </div>
              )}
            </div>

            {hoveredFullScreenAnnotation && fullScreenAnnotationTooltipPosition ? (
              <div
                className="full-screen-annotation-tooltip"
                style={{
                  left: `${fullScreenAnnotationTooltipPosition.left}px`,
                  top: `${fullScreenAnnotationTooltipPosition.top}px`,
                }}
              >
                <span className="full-screen-annotation-tooltip-eyebrow">{tx("Marco fixado", "Pinned marker")}</span>
                <strong>{hoveredFullScreenAnnotation.annotation.label}</strong>
                <span className="full-screen-annotation-tooltip-date">
                  {formatTrendTooltipLabel(hoveredFullScreenAnnotation.annotation.date)}
                </span>
                <p>{hoveredFullScreenAnnotation.annotation.description}</p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
