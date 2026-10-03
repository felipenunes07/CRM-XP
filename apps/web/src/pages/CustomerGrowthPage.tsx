import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Flame } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import type { CustomerGrowthMetric } from "../lib/api";
import { summarizeGrowth } from "../lib/customerGrowth";
import type { GrowthSummary } from "../lib/customerGrowth";
import { formatCurrency } from "../lib/format";
import { useUiLanguage } from "../i18n";
import "./customerGrowth.css";

type SortMode = "pct" | "volume";

interface GrowthRow {
  customerId: string;
  customerCode: string;
  displayName: string;
  values: number[];
  summary: GrowthSummary;
}

const METRIC_OPTIONS: Array<{ value: CustomerGrowthMetric; labelPt: string; labelZh: string }> = [
  { value: "pieces", labelPt: "Todas as pecas", labelZh: "全部件数" },
  { value: "screenXp", labelPt: "Tela XP", labelZh: "XP 屏幕" },
  { value: "screenDe", labelPt: "Tela DE", labelZh: "DE 屏幕" },
  { value: "screenVv", labelPt: "Tela VV", labelZh: "VV 屏幕" },
  { value: "battery", labelPt: "Bateria", labelZh: "电池" },
  { value: "dock", labelPt: "Dock de carga", labelZh: "充电底座" },
  { value: "revenue", labelPt: "Faturamento", labelZh: "营业额" },
];

const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const LIST_LIMIT = 15;
const STREAK_MIN = 3;

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${MONTH_NAMES[Number(monthNumber) - 1] ?? monthNumber}/${(year ?? "").slice(2)}`;
}

function formatValue(value: number, metric: CustomerGrowthMetric) {
  if (metric === "revenue") {
    return formatCurrency(value);
  }
  return value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 });
}

function Sparkline({ values, months, metric, tone }: { values: number[]; months: string[]; metric: CustomerGrowthMetric; tone: string }) {
  const width = 104;
  const height = 30;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => [index * step, height - 3 - (value / max) * (height - 6)] as const);
  const last = points[points.length - 1];
  const title = values.map((value, index) => `${monthLabel(months[index] ?? "")}: ${formatValue(value, metric)}`).join("\n");

  return (
    <svg className={`growth-sparkline tone-${tone}`} width={width} height={height} viewBox={`-2 0 ${width + 4} ${height}`} role="img" aria-label={title}>
      <title>{title}</title>
      <polyline points={points.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {last ? <circle cx={last[0]} cy={last[1]} r="3" /> : null}
    </svg>
  );
}

function ChangeBadge({ summary }: { summary: GrowthSummary }) {
  const { tx } = useUiLanguage();
  if (summary.trend === "new") {
    return <span className="growth-badge tone-up">{tx("Novo", "新")}</span>;
  }
  if (summary.trend === "stopped") {
    return <span className="growth-badge tone-down">{tx("Parou", "停止")}</span>;
  }
  const pct = summary.changePct ?? 0;
  const tone = summary.trend === "up" ? "up" : summary.trend === "down" ? "down" : "flat";
  return (
    <span className={`growth-badge tone-${tone}`}>
      {pct > 0 ? "+" : ""}
      {pct.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
    </span>
  );
}

function GrowthList({
  title,
  tone,
  rows,
  months,
  metric,
  emptyText,
}: {
  title: string;
  tone: "up" | "down";
  rows: GrowthRow[];
  months: string[];
  metric: CustomerGrowthMetric;
  emptyText: string;
}) {
  const { tx } = useUiLanguage();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, LIST_LIMIT);
  const Icon = tone === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <section className={`panel growth-list tone-${tone}`}>
      <header className="growth-list-header">
        <h3>
          <Icon size={18} />
          {title}
        </h3>
        <span>{rows.length}</span>
      </header>

      {visible.length ? (
        <ol>
          {visible.map((row) => {
            const streak = tone === "up" ? row.summary.upStreak : row.summary.downStreak;
            return (
              <li key={row.customerId}>
                <Link to={`/clientes/${row.customerId}`} className="growth-row-name">
                  <strong>{row.displayName}</strong>
                  <span>
                    {row.customerCode}
                    {streak >= 2
                      ? ` · ${tone === "up" ? tx(`${streak} meses subindo`, `连续 ${streak} 个月上升`) : tx(`${streak} meses caindo`, `连续 ${streak} 个月下降`)}`
                      : ""}
                  </span>
                </Link>
                <Sparkline values={row.values} months={months} metric={metric} tone={tone} />
                <div className="growth-row-avg">
                  <span>
                    {formatValue(row.summary.previousAvg, metric)} → <strong>{formatValue(row.summary.recentAvg, metric)}</strong>
                  </span>
                  <small>{tx("media/mes", "月均")}</small>
                </div>
                <ChangeBadge summary={row.summary} />
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="growth-empty">{emptyText}</p>
      )}

      {rows.length > LIST_LIMIT ? (
        <button type="button" className="growth-more" onClick={() => setExpanded((current) => !current)}>
          {expanded ? tx("Mostrar menos", "收起") : tx(`Ver todos (${rows.length})`, `查看全部 (${rows.length})`)}
        </button>
      ) : null}
    </section>
  );
}

export function CustomerGrowthPage() {
  const { token } = useAuth();
  const { tx } = useUiLanguage();
  const [metric, setMetric] = useState<CustomerGrowthMetric>("pieces");
  const [monthCount, setMonthCount] = useState(6);
  const [sortMode, setSortMode] = useState<SortMode>("pct");
  const [search, setSearch] = useState("");

  const growthQuery = useQuery({
    queryKey: ["customer-growth", monthCount],
    queryFn: () => api.customerGrowth(token!, monthCount),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });

  const months = growthQuery.data?.months ?? [];
  const half = Math.floor(months.length / 2);

  const rows = useMemo<GrowthRow[]>(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (growthQuery.data?.customers ?? [])
      .filter((customer) => !term || `${customer.displayName} ${customer.customerCode}`.toLocaleLowerCase("pt-BR").includes(term))
      .map((customer) => {
        const values = customer.series[metric] ?? [];
        return { ...customer, values, summary: summarizeGrowth(values) };
      })
      .filter((row) => row.values.some((value) => value > 0));
  }, [growthQuery.data, metric, search]);

  const { growing, falling, streakers, stableCount } = useMemo(() => {
    const byPct = (direction: 1 | -1) => (left: GrowthRow, right: GrowthRow) => {
      const leftPct = left.summary.changePct ?? direction * Number.POSITIVE_INFINITY;
      const rightPct = right.summary.changePct ?? direction * Number.POSITIVE_INFINITY;
      return direction * (rightPct - leftPct) || direction * (right.summary.delta - left.summary.delta);
    };
    const byVolume = (direction: 1 | -1) => (left: GrowthRow, right: GrowthRow) =>
      direction * (right.summary.delta - left.summary.delta);

    const up = rows.filter((row) => row.summary.trend === "up" || row.summary.trend === "new");
    const down = rows.filter((row) => row.summary.trend === "down" || row.summary.trend === "stopped");

    // Em "% de variacao", clientes novos (sem base de comparacao) ficam depois dos que cresceram.
    const upSorted =
      sortMode === "pct"
        ? [...up.filter((row) => row.summary.trend === "up").sort(byPct(1)), ...up.filter((row) => row.summary.trend === "new").sort(byVolume(1))]
        : up.sort(byVolume(1));
    const downSorted = sortMode === "pct" ? down.sort(byPct(-1)) : down.sort(byVolume(-1));

    return {
      growing: upSorted,
      falling: downSorted,
      streakers: rows
        .filter((row) => row.summary.upStreak >= STREAK_MIN)
        .sort((left, right) => right.summary.upStreak - left.summary.upStreak || right.summary.delta - left.summary.delta),
      stableCount: rows.filter((row) => row.summary.trend === "stable").length,
    };
  }, [rows, sortMode]);

  const metricLabel = METRIC_OPTIONS.find((option) => option.value === metric);
  const periodHelper =
    months.length > 0
      ? tx(
          `Media de ${monthLabel(months[months.length - half] ?? "")} a ${monthLabel(months[months.length - 1] ?? "")} comparada com ${monthLabel(months[0] ?? "")} a ${monthLabel(months[months.length - half - 1] ?? "")}. O mes atual fica de fora por ainda estar em andamento.`,
          `比较最近 ${half} 个月与之前 ${half} 个月的月均值。当前月份未计入。`,
        )
      : "";

  return (
    <div className="page-stack customer-growth-page">
      <section className="panel">
        <div className="growth-hero">
          <div>
            <p className="eyebrow">{tx("Clientes", "客户")}</p>
            <h2 className="growth-title">{tx("Quem esta crescendo e quem esta caindo", "谁在增长，谁在下滑")}</h2>
            <p className="growth-helper">{periodHelper}</p>
          </div>
          <input
            className="growth-search"
            placeholder={tx("Buscar cliente ou codigo", "搜索客户或编号")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="growth-controls">
          <div className="growth-chips" role="group" aria-label={tx("Produto", "产品")}>
            {METRIC_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={metric === option.value ? "is-active" : ""}
                onClick={() => setMetric(option.value)}
              >
                {tx(option.labelPt, option.labelZh)}
              </button>
            ))}
          </div>
          <div className="growth-toggles">
            <div className="growth-chips compact" role="group" aria-label={tx("Periodo", "期间")}>
              {[6, 12].map((value) => (
                <button key={value} type="button" className={monthCount === value ? "is-active" : ""} onClick={() => setMonthCount(value)}>
                  {tx(`${value} meses`, `${value} 个月`)}
                </button>
              ))}
            </div>
            <div className="growth-chips compact" role="group" aria-label={tx("Ordenar", "排序")}>
              <button type="button" className={sortMode === "pct" ? "is-active" : ""} onClick={() => setSortMode("pct")}>
                {tx("% de variacao", "变化 %")}
              </button>
              <button type="button" className={sortMode === "volume" ? "is-active" : ""} onClick={() => setSortMode("volume")}>
                {metric === "revenue" ? tx("Valor ganho", "增加金额") : tx("Pecas ganhas", "增加件数")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {growthQuery.isLoading ? <div className="page-loading">{tx("Calculando crescimento...", "正在计算增长...")}</div> : null}
      {growthQuery.isError ? <div className="page-error">{tx("Nao foi possivel carregar a analise.", "无法加载分析。")}</div> : null}

      {growthQuery.data ? (
        <>
          <div className="growth-kpis">
            <div className="growth-kpi tone-up">
              <span>{tx("Em alta", "上升")}</span>
              <strong>{growing.length}</strong>
            </div>
            <div className="growth-kpi tone-down">
              <span>{tx("Em queda", "下降")}</span>
              <strong>{falling.length}</strong>
            </div>
            <div className="growth-kpi">
              <span>{tx("Estaveis", "稳定")}</span>
              <strong>{stableCount}</strong>
            </div>
            <div className="growth-kpi tone-streak">
              <span>{tx(`Subindo ${STREAK_MIN}+ meses seguidos`, `连续上升 ${STREAK_MIN}+ 个月`)}</span>
              <strong>{streakers.length}</strong>
            </div>
          </div>

          {streakers.length ? (
            <section className="panel growth-streaks">
              <header className="growth-list-header">
                <h3>
                  <Flame size={18} />
                  {tx("Crescendo mes a mes", "逐月增长")} · {tx(metricLabel?.labelPt ?? "", metricLabel?.labelZh ?? "")}
                </h3>
                <span>{streakers.length}</span>
              </header>
              <div className="growth-streak-grid">
                {streakers.slice(0, 12).map((row) => (
                  <Link key={row.customerId} to={`/clientes/${row.customerId}`} className="growth-streak-card">
                    <div>
                      <strong>{row.displayName}</strong>
                      <span>{row.customerCode}</span>
                    </div>
                    <Sparkline values={row.values} months={months} metric={metric} tone="up" />
                    <small>
                      {tx(`${row.summary.upStreak} meses seguidos subindo`, `连续 ${row.summary.upStreak} 个月上升`)} ·{" "}
                      {formatValue(row.values[row.values.length - 1] ?? 0, metric)} {tx("no ultimo mes", "上月")}
                    </small>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="growth-columns">
            <GrowthList
              title={tx("Em alta", "上升")}
              tone="up"
              rows={growing}
              months={months}
              metric={metric}
              emptyText={tx("Nenhum cliente em alta nesse produto.", "该产品没有上升的客户。")}
            />
            <GrowthList
              title={tx("Em queda", "下降")}
              tone="down"
              rows={falling}
              months={months}
              metric={metric}
              emptyText={tx("Nenhum cliente em queda nesse produto.", "该产品没有下降的客户。")}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
