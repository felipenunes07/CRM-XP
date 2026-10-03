import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ExternalLink, Flame } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import type { CustomerGrowthMetric } from "../lib/api";
import { summarizeGrowth } from "../lib/customerGrowth";
import type { GrowthSummary } from "../lib/customerGrowth";
import { useUiLanguage } from "../i18n";
import { MiniBars, TONE_COLORS, formatPieces, monthLabel } from "../components/GrowthMiniBars";
import type { GrowthTone } from "../components/GrowthMiniBars";
import { GrowthInsightsView } from "../components/GrowthInsightsView";
import "./customerGrowth.css";

type SortMode = "pct" | "volume";
type Tone = GrowthTone;

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
];

const LIST_LIMIT = 15;
const STREAK_MIN = 3;

// Grafico mes a mes aberto ao clicar no cliente.
function MonthlyChart({ row, months, tone, metricLabel }: { row: GrowthRow; months: string[]; tone: Tone; metricLabel: string }) {
  const { tx } = useUiLanguage();
  const data = row.values.map((value, index) => ({ month: monthLabel(months[index] ?? ""), value }));
  const color = TONE_COLORS[tone];

  return (
    <div className="growth-chart">
      <div className="growth-chart-header">
        <span>
          {metricLabel} · {tx("pecas por mes", "每月件数")}
        </span>
        <Link to={`/clientes/${row.customerId}`}>
          {tx("Abrir ficha do cliente", "打开客户档案")}
          <ExternalLink size={13} />
        </Link>
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(100,116,139,0.18)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(41,86,215,0.06)" }}
            formatter={(value: number) => [formatPieces(value), tx("Pecas", "件数")]}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={42}>
            {data.map((entry, index) => (
              <Cell key={entry.month} fill={color} fillOpacity={index === data.length - 1 ? 1 : 0.55} />
            ))}
            <LabelList dataKey="value" position="top" fontSize={11} formatter={(value: number) => (value > 0 ? formatPieces(value) : "")} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
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
  metricLabel,
  emptyText,
  openId,
  onToggle,
}: {
  title: string;
  tone: Tone;
  rows: GrowthRow[];
  months: string[];
  metricLabel: string;
  emptyText: string;
  openId: string | null;
  onToggle: (customerId: string) => void;
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
            const isOpen = openId === row.customerId;
            return (
              <li key={row.customerId} className={isOpen ? "is-open" : ""}>
                <button type="button" className="growth-row" onClick={() => onToggle(row.customerId)} aria-expanded={isOpen}>
                  <span className="growth-row-name">
                    <strong>{row.displayName}</strong>
                    <span>
                      {row.customerCode}
                      {streak >= 2
                        ? ` · ${tone === "up" ? tx(`${streak} meses subindo`, `连续 ${streak} 个月上升`) : tx(`${streak} meses caindo`, `连续 ${streak} 个月下降`)}`
                        : ""}
                    </span>
                  </span>
                  <MiniBars values={row.values} months={months} tone={tone} />
                  <span className="growth-row-avg">
                    <span>
                      {formatPieces(row.summary.previousAvg)} → <strong>{formatPieces(row.summary.recentAvg)}</strong>
                    </span>
                    <small>{tx("pecas/mes", "件/月")}</small>
                  </span>
                  <ChangeBadge summary={row.summary} />
                  <ChevronDown size={16} className="growth-row-chevron" />
                </button>
                {isOpen ? <MonthlyChart row={row} months={months} tone={tone} metricLabel={metricLabel} /> : null}
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<"customers" | "insights">("customers");

  const growthQuery = useQuery({
    queryKey: ["customer-growth", monthCount],
    queryFn: () => api.customerGrowth(token!, monthCount),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });

  const months = growthQuery.data?.months ?? [];
  const metricOption = METRIC_OPTIONS.find((option) => option.value === metric);
  const metricLabel = tx(metricOption?.labelPt ?? "", metricOption?.labelZh ?? "");

  function toggleOpen(customerId: string) {
    setOpenId((current) => (current === customerId ? null : customerId));
  }

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

    // Em "% de crescimento", clientes novos (sem base de comparacao) ficam depois dos que cresceram.
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

  const openStreaker = streakers.slice(0, 12).find((row) => row.customerId === openId);

  return (
    <div className="page-stack customer-growth-page">
      <section className="panel">
        <div className="growth-hero">
          <div>
            <p className="eyebrow">{tx("Clientes", "客户")}</p>
            <h2 className="growth-title">{tx("Quem esta crescendo e quem esta caindo", "谁在增长，谁在下滑")}</h2>
            <p className="growth-helper">
              {tx(
                "Compara a media de pecas por mes da metade mais recente do periodo com a metade anterior, a partir do primeiro mes em que o cliente comprou o produto. O mes atual fica de fora. Clique no cliente para ver o grafico mes a mes.",
                "从客户首次购买该产品的月份起，比较近期与之前的月均件数。当前月份未计入。点击客户查看每月图表。",
              )}
            </p>
          </div>
          <div className="growth-hero-actions">
            <div className="growth-tabs" role="tablist" aria-label={tx("Visao", "视图")}>
              <button type="button" role="tab" aria-selected={view === "customers"} className={view === "customers" ? "is-active" : ""} onClick={() => setView("customers")}>
                {tx("Clientes", "客户")}
              </button>
              <button type="button" role="tab" aria-selected={view === "insights"} className={view === "insights" ? "is-active" : ""} onClick={() => setView("insights")}>
                {tx("Insights", "洞察")}
              </button>
            </div>
            {view === "customers" ? (
          <input
            className="growth-search"
            placeholder={tx("Buscar cliente ou codigo", "搜索客户或编号")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
            ) : null}
          </div>
        </div>

        <div className="growth-controls">
          {view === "customers" ? (
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
          ) : <span />}
          <div className="growth-toggles">
            <div className="growth-chips compact" role="group" aria-label={tx("Periodo", "期间")}>
              {[6, 12].map((value) => (
                <button key={value} type="button" className={monthCount === value ? "is-active" : ""} onClick={() => setMonthCount(value)}>
                  {tx(`${value} meses`, `${value} 个月`)}
                </button>
              ))}
            </div>
            {view === "customers" ? (
            <div className="growth-chips compact" role="group" aria-label={tx("Ordenar", "排序")}>
              <span className="growth-chips-label">{tx("Ordenar por", "排序")}</span>
              <button
                type="button"
                className={sortMode === "pct" ? "is-active" : ""}
                onClick={() => setSortMode("pct")}
                title={tx("Quem mais cresceu ou caiu em porcentagem, mesmo sendo cliente pequeno.", "按百分比排序，小客户也会靠前。")}
              >
                {tx("% de crescimento", "增长 %")}
              </button>
              <button
                type="button"
                className={sortMode === "volume" ? "is-active" : ""}
                onClick={() => setSortMode("volume")}
                title={tx("Quem mais ganhou ou perdeu pecas por mes, em quantidade.", "按每月增减件数排序。")}
              >
                {tx("Quantidade de pecas", "件数变化")}
              </button>
            </div>
            ) : null}
          </div>
        </div>
      </section>

      {growthQuery.isLoading ? <div className="page-loading">{tx("Calculando crescimento...", "正在计算增长...")}</div> : null}
      {growthQuery.isError ? <div className="page-error">{tx("Nao foi possivel carregar a analise.", "无法加载分析。")}</div> : null}

      {growthQuery.data && view === "insights" ? <GrowthInsightsView data={growthQuery.data} /> : null}

      {growthQuery.data && view === "customers" ? (
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
                  {tx("Crescendo mes a mes", "逐月增长")} · {metricLabel}
                </h3>
                <span>{streakers.length}</span>
              </header>
              <div className="growth-streak-grid">
                {streakers.slice(0, 12).map((row) => (
                  <button
                    key={row.customerId}
                    type="button"
                    className={`growth-streak-card ${openId === row.customerId ? "is-open" : ""}`}
                    onClick={() => toggleOpen(row.customerId)}
                  >
                    <span className="growth-streak-name">
                      <strong>{row.displayName}</strong>
                      <span>{row.customerCode}</span>
                    </span>
                    <MiniBars values={row.values} months={months} tone="up" />
                    <small>
                      {tx(`${row.summary.upStreak} meses seguidos subindo`, `连续 ${row.summary.upStreak} 个月上升`)} ·{" "}
                      {formatPieces(row.values[row.values.length - 1] ?? 0)} {tx("no ultimo mes", "上月")}
                    </small>
                  </button>
                ))}
              </div>
              {openStreaker ? (
                <div className="growth-streak-chart">
                  <strong>{openStreaker.displayName}</strong>
                  <MonthlyChart row={openStreaker} months={months} tone="up" metricLabel={metricLabel} />
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="growth-columns">
            <GrowthList
              title={tx("Em alta", "上升")}
              tone="up"
              rows={growing}
              months={months}
              metricLabel={metricLabel}
              emptyText={tx("Nenhum cliente em alta nesse produto.", "该产品没有上升的客户。")}
              openId={openId}
              onToggle={toggleOpen}
            />
            <GrowthList
              title={tx("Em queda", "下降")}
              tone="down"
              rows={falling}
              months={months}
              metricLabel={metricLabel}
              emptyText={tx("Nenhum cliente em queda nesse produto.", "该产品没有下降的客户。")}
              openId={openId}
              onToggle={toggleOpen}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
