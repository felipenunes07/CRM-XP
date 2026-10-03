import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  BatteryCharging,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  PlugZap,
  Repeat,
  TrendingDown,
  TrendingUp,
  UserX,
  Users,
  X,
} from "lucide-react";
import type { CustomerGrowthMetric, CustomerGrowthResponse } from "../lib/api";
import { computeGrowthInsights } from "../lib/customerGrowthInsights";
import type { InsightList, ProductInsight } from "../lib/customerGrowthInsights";
import { useUiLanguage } from "../i18n";
import { MiniBars, TONE_COLORS, formatPieces, monthLabel } from "./GrowthMiniBars";
import type { GrowthTone } from "./GrowthMiniBars";

const PRODUCT_LABELS: Record<CustomerGrowthMetric, { pt: string; zh: string }> = {
  pieces: { pt: "Todas as pecas", zh: "全部件数" },
  screenXp: { pt: "Tela XP", zh: "XP 屏幕" },
  screenDe: { pt: "Tela DE", zh: "DE 屏幕" },
  screenVv: { pt: "Tela VV", zh: "VV 屏幕" },
  battery: { pt: "Bateria", zh: "电池" },
  dock: { pt: "Dock de carga", zh: "充电底座" },
};

// Quantos clientes cada lista mostra antes de expandir.
const LIST_PREVIEW = 6;

type InsightKey = "bigFalling" | "wentQuiet" | "screensWithoutBattery" | "screensWithoutDock" | "xpToDe";

function productTone(product: ProductInsight): GrowthTone {
  if (product.summary.trend === "up" || product.summary.trend === "new") return "up";
  if (product.summary.trend === "down" || product.summary.trend === "stopped") return "down";
  return "flat";
}

function formatPct(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
}

function ProductCard({
  product,
  months,
  isOpen,
  onToggle,
}: {
  product: ProductInsight;
  months: string[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { tx } = useUiLanguage();
  const label = PRODUCT_LABELS[product.metric];
  const tone = productTone(product);
  const lastMonth = product.monthlyTotals[product.monthlyTotals.length - 1] ?? 0;

  return (
    <article className={`growth-product-card tone-${tone} ${isOpen ? "is-open" : ""}`}>
      <div
        role="button"
        tabIndex={0}
        className="growth-product-hit"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={isOpen}
        title={isOpen ? tx("Fechar grafico", "关闭图表") : tx("Ver mes a mes", "查看每月")}
      >
        <header>
          <strong>{tx(label.pt, label.zh)}</strong>
          <span className={`growth-badge tone-${tone}`}>{formatPct(product.summary.changePct)}</span>
        </header>
        <MiniBars values={product.monthlyTotals} months={months} tone={tone} />
        <dl>
          <div>
            <dt>{tx(`Pecas em ${monthLabel(months[months.length - 1] ?? "")}`, "上月件数")}</dt>
            <dd>{formatPieces(lastMonth)}</dd>
          </div>
          <div>
            <dt>{tx("Media pecas/mes", "月均件数")}</dt>
            <dd>
              {formatPieces(product.summary.previousAvg)} → {formatPieces(product.summary.recentAvg)}
            </dd>
          </div>
          <div>
            <dt title={tx("Media de clientes que compraram por mes (metade anterior → metade recente)", "每月平均购买客户数")}>
              {tx("Clientes por mes", "每月客户")}
            </dt>
            <dd>
              {product.previousBuyers} → {product.recentBuyers}
              <small className="growth-product-sub">
                {tx(`${product.monthlyBuyers[product.monthlyBuyers.length - 1] ?? 0} em ${monthLabel(months[months.length - 1] ?? "")}`, "上月")}
              </small>
            </dd>
          </div>
          <div>
            <dt>{tx("Subindo / caindo", "上升 / 下降")}</dt>
            <dd>
              <span className="growth-up-text">{product.growingCount}</span> / <span className="growth-down-text">{product.fallingCount}</span>
            </dd>
          </div>
        </dl>
        <span className="growth-product-cta">
          {isOpen ? tx("Fechar grafico", "关闭图表") : tx("Ver mes a mes", "查看每月")}
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </div>
      {product.topGrower ? (
        <p className="growth-product-note">
          {tx("Destaque:", "亮点：")}{" "}
          <Link to={`/clientes/${product.topGrower.customerId}`}>{product.topGrower.displayName}</Link> ({product.topGrower.detail})
        </p>
      ) : null}
      {product.topLoser ? (
        <p className="growth-product-note">
          {tx("Maior queda:", "最大下降：")}{" "}
          <Link to={`/clientes/${product.topLoser.customerId}`}>{product.topLoser.displayName}</Link> ({product.topLoser.detail})
        </p>
      ) : null}
    </article>
  );
}

// Grafico aberto ao clicar num produto: pecas por mes (barras) e clientes por mes (linha).
function ProductChart({ product, months, onClose }: { product: ProductInsight; months: string[]; onClose: () => void }) {
  const { tx } = useUiLanguage();
  const label = PRODUCT_LABELS[product.metric];
  const tone = productTone(product);
  const data = months.map((month, index) => ({
    month: monthLabel(month),
    pieces: product.monthlyTotals[index] ?? 0,
    buyers: product.monthlyBuyers[index] ?? 0,
  }));

  return (
    <section className="panel growth-product-chart">
      <header className="growth-list-header">
        <h3>
          {tx(label.pt, label.zh)} · {tx("mes a mes", "每月")}
        </h3>
        <button type="button" className="growth-close" onClick={onClose} aria-label={tx("Fechar grafico", "关闭图表")}>
          <X size={16} />
        </button>
      </header>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(100,116,139,0.18)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis yAxisId="pieces" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value: number) => formatPieces(value)} />
          <YAxis yAxisId="buyers" orientation="right" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(41,86,215,0.06)" }}
            formatter={(value: number, name: string) => [formatPieces(value), name]}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="pieces" dataKey="pieces" name={tx("Pecas", "件数")} radius={[6, 6, 0, 0]} maxBarSize={48}>
            {data.map((entry, index) => (
              <Cell key={entry.month} fill={TONE_COLORS[tone]} fillOpacity={index === data.length - 1 ? 1 : 0.55} />
            ))}
          </Bar>
          <Line yAxisId="buyers" type="monotone" dataKey="buyers" name={tx("Clientes", "客户")} stroke="#2956d7" strokeWidth={2.5} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}

function InsightCard({
  id,
  icon,
  title,
  description,
  list,
  tone,
  emptyText,
  months,
  expanded,
  flash,
  onToggleExpanded,
  compareLabels,
}: {
  id: InsightKey;
  icon: ReactNode;
  title: string;
  description: string;
  list: InsightList;
  tone: GrowthTone | "idea";
  emptyText: string;
  months: string[];
  expanded: boolean;
  flash: boolean;
  onToggleExpanded: () => void;
  compareLabels?: [string, string];
}) {
  const { tx } = useUiLanguage();
  const visible = expanded ? list.customers : list.customers.slice(0, LIST_PREVIEW);
  const hidden = list.total - LIST_PREVIEW;
  const barTone: GrowthTone = tone === "idea" ? "flat" : tone;

  return (
    <section id={`growth-insight-${id}`} className={`panel growth-insight-card tone-${tone} ${flash ? "is-flash" : ""}`}>
      <header className="growth-list-header">
        <h3>
          {icon}
          {title}
        </h3>
        <span>{list.total}</span>
      </header>
      <p className="growth-insight-description">{description}</p>
      {compareLabels ? (
        <p className="growth-insight-legend">
          <i className="tone-down" /> {compareLabels[0]} <i className="tone-up" /> {compareLabels[1]}
        </p>
      ) : null}
      {visible.length ? (
        <ul className={expanded ? "is-expanded" : ""}>
          {visible.map((customer) => (
            <li key={customer.customerId}>
              <Link to={`/clientes/${customer.customerId}`} title={tx("Abrir ficha do cliente", "打开客户档案")}>
                <strong>{customer.displayName}</strong>
                <span>{customer.customerCode}</span>
              </Link>
              <span className="growth-insight-bars">
                {customer.compareValues ? (
                  <>
                    <MiniBars values={customer.values} months={months} tone="down" />
                    <MiniBars values={customer.compareValues} months={months} tone="up" />
                  </>
                ) : (
                  <MiniBars values={customer.values} months={months} tone={barTone} />
                )}
              </span>
              <small>{customer.detail}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="growth-empty">{emptyText}</p>
      )}
      {hidden > 0 ? (
        <button type="button" className="growth-more" onClick={onToggleExpanded} aria-expanded={expanded}>
          {expanded ? tx("Mostrar menos", "收起") : tx(`+ ${hidden} outros clientes`, `另有 ${hidden} 位客户`)}
        </button>
      ) : null}
    </section>
  );
}

interface Highlight {
  key: string;
  tone: GrowthTone | "idea";
  icon: ReactNode;
  value: string;
  text: string;
  action: string;
  target?: InsightKey;
  product?: CustomerGrowthMetric;
}

export function GrowthInsightsView({ data }: { data: CustomerGrowthResponse }) {
  const { tx } = useUiLanguage();
  const insights = useMemo(() => computeGrowthInsights(data), [data]);
  const months = data.months;
  const [openProduct, setOpenProduct] = useState<CustomerGrowthMetric | null>(null);
  const [expandedLists, setExpandedLists] = useState<Set<InsightKey>>(() => new Set());
  const [flashList, setFlashList] = useState<InsightKey | null>(null);
  const flashTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
  }, []);

  function toggleList(key: InsightKey) {
    setExpandedLists((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Leva ate a lista do ponto clicado, abre ela inteira e da um destaque rapido.
  function goToList(key: InsightKey) {
    setExpandedLists((current) => new Set(current).add(key));
    setFlashList(key);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashList(null), 1600);
    window.requestAnimationFrame(() => {
      document.getElementById(`growth-insight-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function goToProduct(metric: CustomerGrowthMetric) {
    setOpenProduct(metric);
    window.requestAnimationFrame(() => {
      document.getElementById("growth-product-chart")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // Pontos principais do periodo, cada um levando para a lista ou grafico que explica o numero.
  const highlights = useMemo<Highlight[]>(() => {
    const items: Highlight[] = [];
    const products = insights.products.filter((product) => product.metric !== "pieces" && product.summary.changePct !== null);
    const best = [...products].sort((left, right) => (right.summary.changePct ?? 0) - (left.summary.changePct ?? 0))[0];
    const worst = [...products].sort((left, right) => (left.summary.changePct ?? 0) - (right.summary.changePct ?? 0))[0];
    const total = insights.products.find((product) => product.metric === "pieces");

    if (total && total.summary.changePct !== null) {
      const up = total.summary.changePct >= 0;
      items.push({
        key: "total",
        tone: up ? "up" : "down",
        icon: up ? <TrendingUp size={18} /> : <TrendingDown size={18} />,
        value: formatPct(total.summary.changePct),
        text: tx(
          `Volume total: de ${formatPieces(total.summary.previousAvg)} para ${formatPieces(total.summary.recentAvg)} pecas por mes, com ${total.recentBuyers} clientes comprando por mes.`,
          `总件数变化 ${formatPct(total.summary.changePct)}。`,
        ),
        action: tx("Ver mes a mes", "查看每月"),
        product: "pieces",
      });
    }
    if (best && (best.summary.changePct ?? 0) > 0) {
      items.push({
        key: "best",
        tone: "up",
        icon: <TrendingUp size={18} />,
        value: formatPct(best.summary.changePct),
        text: tx(
          `${PRODUCT_LABELS[best.metric].pt} e o produto que mais cresce: ${best.recentBuyers} clientes por mes, ${best.growingCount} comprando mais.`,
          `${PRODUCT_LABELS[best.metric].zh} 增长最快。`,
        ),
        action: tx("Ver produto", "查看产品"),
        product: best.metric,
      });
    }
    if (worst && (worst.summary.changePct ?? 0) < 0) {
      items.push({
        key: "worst",
        tone: "down",
        icon: <TrendingDown size={18} />,
        value: formatPct(worst.summary.changePct),
        text: tx(
          `${PRODUCT_LABELS[worst.metric].pt} e o que mais cai: ${worst.fallingCount} clientes compraram menos.`,
          `${PRODUCT_LABELS[worst.metric].zh} 下降最多。`,
        ),
        action: tx("Ver produto", "查看产品"),
        product: worst.metric,
      });
    }
    if (insights.bigFalling.total) {
      items.push({
        key: "bigFalling",
        tone: "down",
        icon: <AlertTriangle size={18} />,
        value: String(insights.bigFalling.total),
        text: tx(
          `dos 50 maiores clientes estao comprando menos: juntos deixaram de levar ${formatPieces(Math.abs(insights.bigFalling.lostPerMonth))} pecas por mes.`,
          `前 50 大客户中有 ${insights.bigFalling.total} 位在下降。`,
        ),
        action: tx("Ver quem ligar", "查看客户"),
        target: "bigFalling",
      });
    }
    if (insights.wentQuiet.total) {
      items.push({
        key: "wentQuiet",
        tone: "down",
        icon: <UserX size={18} />,
        value: String(insights.wentQuiet.total),
        text: tx("clientes compravam e nao fizeram pedido nos ultimos 2 meses.", "位客户最近 2 个月没有购买。"),
        action: tx("Ver lista", "查看列表"),
        target: "wentQuiet",
      });
    }
    if (insights.screensWithoutBattery.total) {
      items.push({
        key: "battery",
        tone: "idea",
        icon: <BatteryCharging size={18} />,
        value: String(insights.screensWithoutBattery.total),
        text: tx("clientes compram 10+ telas por mes e nunca levaram bateria: oportunidade de venda.", "位客户每月购买 10+ 屏幕但从未购买电池。"),
        action: tx("Ver oportunidades", "查看机会"),
        target: "screensWithoutBattery",
      });
    }
    if (insights.screensWithoutDock.total) {
      items.push({
        key: "dock",
        tone: "idea",
        icon: <PlugZap size={18} />,
        value: String(insights.screensWithoutDock.total),
        text: tx("clientes compram 10+ telas por mes e nunca levaram dock de carga.", "位客户每月购买 10+ 屏幕但从未购买充电底座。"),
        action: tx("Ver oportunidades", "查看机会"),
        target: "screensWithoutDock",
      });
    }
    items.push({
      key: "top10",
      tone: "flat",
      icon: <Users size={18} />,
      value: `${insights.top10Share.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`,
      text: tx(
        `das pecas vendidas vem dos 10 maiores clientes (${insights.activeCustomers} clientes compraram no periodo).`,
        `前 10 大客户占比。`,
      ),
      action: tx("Ver grandes caindo", "查看大客户"),
      target: "bigFalling",
    });
    return items;
  }, [insights, tx]);

  const openProductInsight = insights.products.find((product) => product.metric === openProduct);

  function card(key: InsightKey, props: Omit<Parameters<typeof InsightCard>[0], "id" | "list" | "months" | "expanded" | "flash" | "onToggleExpanded">) {
    return (
      <InsightCard
        id={key}
        list={insights[key]}
        months={months}
        expanded={expandedLists.has(key)}
        flash={flashList === key}
        onToggleExpanded={() => toggleList(key)}
        {...props}
      />
    );
  }

  return (
    <div className="growth-insights">
      <section className="panel growth-highlights">
        <header className="growth-list-header">
          <h3>
            <Lightbulb size={18} />
            {tx("Principais pontos", "要点")}
          </h3>
          <span className="growth-highlights-hint">{tx("Clique para ver os clientes", "点击查看客户")}</span>
        </header>
        <div className="growth-highlight-grid">
          {highlights.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`growth-highlight tone-${item.tone}`}
              onClick={() => (item.target ? goToList(item.target) : item.product ? goToProduct(item.product) : undefined)}
            >
              <span className="growth-highlight-icon">{item.icon}</span>
              <span className="growth-highlight-body">
                <strong>{item.value}</strong>
                <span>{item.text}</span>
              </span>
              <span className="growth-highlight-action">
                {item.action}
                <ChevronRight size={14} />
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="growth-product-grid">
        {insights.products.map((product) => (
          <ProductCard
            key={product.metric}
            product={product}
            months={months}
            isOpen={openProduct === product.metric}
            onToggle={() => setOpenProduct((current) => (current === product.metric ? null : product.metric))}
          />
        ))}
      </div>

      {openProductInsight ? (
        <div id="growth-product-chart">
          <ProductChart product={openProductInsight} months={months} onClose={() => setOpenProduct(null)} />
        </div>
      ) : null}

      <div className="growth-insight-grid">
        {card("bigFalling", {
          icon: <AlertTriangle size={18} />,
          title: tx("Clientes grandes caindo", "大客户下降"),
          description: tx("Entre os 50 que mais compram, quem esta levando menos pecas. Prioridade de contato.", "购买最多的 50 位客户中正在下降的。"),
          tone: "down",
          emptyText: tx("Nenhum cliente grande em queda.", "没有下降的大客户。"),
        })}
        {card("wentQuiet", {
          icon: <UserX size={18} />,
          title: tx("Sumiram nos ultimos 2 meses", "最近 2 个月未购买"),
          description: tx("Compravam no periodo e nao fizeram pedido nos 2 ultimos meses fechados.", "之前购买但最近 2 个月没有下单。"),
          tone: "down",
          emptyText: tx("Ninguem sumiu.", "没有流失客户。"),
        })}
        {card("screensWithoutBattery", {
          icon: <BatteryCharging size={18} />,
          title: tx("Compram tela, nunca bateria", "买屏幕但不买电池"),
          description: tx("Compram 10 ou mais telas por mes e nao levaram bateria no periodo. Grafico: telas por mes.", "每月购买 10+ 屏幕但期间未买电池。"),
          tone: "idea",
          emptyText: tx("Todos que compram tela ja levaram bateria.", "都买过电池。"),
        })}
        {card("screensWithoutDock", {
          icon: <PlugZap size={18} />,
          title: tx("Compram tela, nunca dock", "买屏幕但不买充电底座"),
          description: tx("Compram 10 ou mais telas por mes e nao levaram dock de carga no periodo. Grafico: telas por mes.", "每月购买 10+ 屏幕但期间未买充电底座。"),
          tone: "idea",
          emptyText: tx("Todos que compram tela ja levaram dock.", "都买过充电底座。"),
        })}
        {card("xpToDe", {
          icon: <Repeat size={18} />,
          title: tx("Trocando XP por DE", "从 XP 转向 DE"),
          description: tx(
            "XP caiu e a tela DE subiu o bastante para cobrir pelo menos 20% da queda (e o cliente leva 5+ DE por mes). Quem so caiu em XP fica em Clientes grandes caindo.",
            "XP 下降且 DE 增长覆盖至少 20% 的下降。",
          ),
          tone: "flat",
          emptyText: tx("Nenhum cliente trocando XP por DE de verdade nesse periodo.", "没有客户转换工厂。"),
          compareLabels: [tx("Tela XP", "XP 屏幕"), tx("Tela DE", "DE 屏幕")],
        })}
      </div>
    </div>
  );
}
