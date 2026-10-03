import { useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BatteryCharging, Lightbulb, PlugZap, Repeat, UserX } from "lucide-react";
import type { CustomerGrowthMetric, CustomerGrowthResponse } from "../lib/api";
import { computeGrowthInsights } from "../lib/customerGrowthInsights";
import type { InsightList, ProductInsight } from "../lib/customerGrowthInsights";
import { useUiLanguage } from "../i18n";
import { MiniBars, formatPieces, monthLabel } from "./GrowthMiniBars";
import type { GrowthTone } from "./GrowthMiniBars";

const PRODUCT_LABELS: Record<CustomerGrowthMetric, { pt: string; zh: string }> = {
  pieces: { pt: "Todas as pecas", zh: "全部件数" },
  screenXp: { pt: "Tela XP", zh: "XP 屏幕" },
  screenDe: { pt: "Tela DE", zh: "DE 屏幕" },
  screenVv: { pt: "Tela VV", zh: "VV 屏幕" },
  battery: { pt: "Bateria", zh: "电池" },
  dock: { pt: "Dock de carga", zh: "充电底座" },
};

function productTone(product: ProductInsight): GrowthTone {
  if (product.summary.trend === "up" || product.summary.trend === "new") return "up";
  if (product.summary.trend === "down" || product.summary.trend === "stopped") return "down";
  return "flat";
}

function formatPct(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
}

function ProductCard({ product, months }: { product: ProductInsight; months: string[] }) {
  const { tx } = useUiLanguage();
  const label = PRODUCT_LABELS[product.metric];
  const tone = productTone(product);
  const lastMonth = product.monthlyTotals[product.monthlyTotals.length - 1] ?? 0;

  return (
    <article className={`growth-product-card tone-${tone}`}>
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

function InsightCard({
  icon,
  title,
  description,
  list,
  tone,
  emptyText,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  list: InsightList;
  tone: GrowthTone | "idea";
  emptyText: string;
}) {
  const { tx } = useUiLanguage();
  return (
    <section className={`panel growth-insight-card tone-${tone}`}>
      <header className="growth-list-header">
        <h3>
          {icon}
          {title}
        </h3>
        <span>{list.total}</span>
      </header>
      <p className="growth-insight-description">{description}</p>
      {list.customers.length ? (
        <ul>
          {list.customers.map((customer) => (
            <li key={customer.customerId}>
              <Link to={`/clientes/${customer.customerId}`}>
                <strong>{customer.displayName}</strong>
                <span>{customer.customerCode}</span>
              </Link>
              <small>{customer.detail}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="growth-empty">{emptyText}</p>
      )}
      {list.total > list.customers.length ? (
        <p className="growth-insight-more">{tx(`+ ${list.total - list.customers.length} outros clientes`, `另有 ${list.total - list.customers.length} 位客户`)}</p>
      ) : null}
    </section>
  );
}

export function GrowthInsightsView({ data }: { data: CustomerGrowthResponse }) {
  const { tx } = useUiLanguage();
  const insights = useMemo(() => computeGrowthInsights(data), [data]);
  const months = data.months;

  // Frases curtas com o que mais chama atencao no periodo.
  const highlights = useMemo(() => {
    const lines: string[] = [];
    const products = insights.products.filter((product) => product.metric !== "pieces" && product.summary.changePct !== null);
    const best = [...products].sort((left, right) => (right.summary.changePct ?? 0) - (left.summary.changePct ?? 0))[0];
    const worst = [...products].sort((left, right) => (left.summary.changePct ?? 0) - (right.summary.changePct ?? 0))[0];
    const total = insights.products.find((product) => product.metric === "pieces");

    if (total?.summary.changePct !== null && total?.summary.changePct !== undefined) {
      lines.push(
        tx(
          `O volume total ${total.summary.changePct >= 0 ? "subiu" : "caiu"} ${formatPct(total.summary.changePct)}: de ${formatPieces(total.summary.previousAvg)} para ${formatPieces(total.summary.recentAvg)} pecas por mes.`,
          `总件数变化 ${formatPct(total.summary.changePct)}。`,
        ),
      );
    }
    if (best && (best.summary.changePct ?? 0) > 0) {
      lines.push(
        tx(
          `${PRODUCT_LABELS[best.metric].pt} e o produto que mais cresce (${formatPct(best.summary.changePct)}), com ${best.recentBuyers} clientes comprando por mes.`,
          `${PRODUCT_LABELS[best.metric].zh} 增长最快 (${formatPct(best.summary.changePct)})。`,
        ),
      );
    }
    if (worst && (worst.summary.changePct ?? 0) < 0) {
      lines.push(
        tx(
          `${PRODUCT_LABELS[worst.metric].pt} e o que mais cai (${formatPct(worst.summary.changePct)}). ${worst.fallingCount} clientes compraram menos.`,
          `${PRODUCT_LABELS[worst.metric].zh} 下降最多 (${formatPct(worst.summary.changePct)})。`,
        ),
      );
    }
    if (insights.bigFalling.total) {
      lines.push(
        tx(
          `${insights.bigFalling.total} dos 50 maiores clientes estao comprando menos e juntos deixaram de levar ${formatPieces(Math.abs(insights.bigFalling.lostPerMonth))} pecas por mes.`,
          `前 50 大客户中有 ${insights.bigFalling.total} 位在下降。`,
        ),
      );
    }
    if (insights.wentQuiet.total) {
      lines.push(
        tx(
          `${insights.wentQuiet.total} clientes compravam e nao compraram nada nos ultimos 2 meses.`,
          `${insights.wentQuiet.total} 位客户最近 2 个月没有购买。`,
        ),
      );
    }
    if (insights.screensWithoutBattery.total) {
      lines.push(
        tx(
          `${insights.screensWithoutBattery.total} clientes compram 10+ telas por mes e nunca levaram bateria no periodo: oportunidade de venda.`,
          `${insights.screensWithoutBattery.total} 位客户每月购买 10+ 屏幕但从未购买电池。`,
        ),
      );
    }
    lines.push(
      tx(
        `Os 10 maiores clientes concentram ${insights.top10Share.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% das pecas vendidas (${insights.activeCustomers} clientes compraram no periodo).`,
        `前 10 大客户占 ${insights.top10Share.toFixed(0)}% 的件数。`,
      ),
    );
    return lines;
  }, [insights, tx]);

  return (
    <div className="growth-insights">
      <section className="panel growth-highlights">
        <header className="growth-list-header">
          <h3>
            <Lightbulb size={18} />
            {tx("Principais pontos", "要点")}
          </h3>
        </header>
        <ul>
          {highlights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <div className="growth-product-grid">
        {insights.products.map((product) => (
          <ProductCard key={product.metric} product={product} months={months} />
        ))}
      </div>

      <div className="growth-insight-grid">
        <InsightCard
          icon={<AlertTriangle size={18} />}
          title={tx("Clientes grandes caindo", "大客户下降")}
          description={tx("Entre os 50 que mais compram, quem esta levando menos pecas. Prioridade de contato.", "购买最多的 50 位客户中正在下降的。")}
          list={insights.bigFalling}
          tone="down"
          emptyText={tx("Nenhum cliente grande em queda.", "没有下降的大客户。")}
        />
        <InsightCard
          icon={<UserX size={18} />}
          title={tx("Sumiram nos ultimos 2 meses", "最近 2 个月未购买")}
          description={tx("Compravam no periodo e nao fizeram pedido nos 2 ultimos meses fechados.", "之前购买但最近 2 个月没有下单。")}
          list={insights.wentQuiet}
          tone="down"
          emptyText={tx("Ninguem sumiu.", "没有流失客户。")}
        />
        <InsightCard
          icon={<BatteryCharging size={18} />}
          title={tx("Compram tela, nunca bateria", "买屏幕但不买电池")}
          description={tx("Compram 10 ou mais telas por mes e nao levaram bateria no periodo.", "每月购买 10+ 屏幕但期间未买电池。")}
          list={insights.screensWithoutBattery}
          tone="idea"
          emptyText={tx("Todos que compram tela ja levaram bateria.", "都买过电池。")}
        />
        <InsightCard
          icon={<PlugZap size={18} />}
          title={tx("Compram tela, nunca dock", "买屏幕但不买充电底座")}
          description={tx("Compram 10 ou mais telas por mes e nao levaram dock de carga no periodo.", "每月购买 10+ 屏幕但期间未买充电底座。")}
          list={insights.screensWithoutDock}
          tone="idea"
          emptyText={tx("Todos que compram tela ja levaram dock.", "都买过充电底座。")}
        />
        <InsightCard
          icon={<Repeat size={18} />}
          title={tx("Trocando XP por DE", "从 XP 转向 DE")}
          description={tx("Estao comprando menos tela XP e mais tela DE.", "XP 屏幕减少，DE 屏幕增加。")}
          list={insights.xpToDe}
          tone="flat"
          emptyText={tx("Nenhum cliente trocando de fabrica.", "没有客户转换工厂。")}
        />
      </div>
    </div>
  );
}
