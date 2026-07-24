import type { CustomerCreditOrderEntry, CustomerCreditPaymentEntry } from "@olist-crm/shared";
import { useId, useMemo, useState } from "react";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import "./customerCreditBank.css";
import "./customerCreditDossie.css";

interface CustomerCreditBalanceChartProps {
  orders: CustomerCreditOrderEntry[];
  payments: CustomerCreditPaymentEntry[];
  /** Saldo devedor de hoje: a série é reconstruída de trás para frente a partir dele. */
  currentDebt: number;
  creditLimit: number;
}

type Point = { date: string; balance: number };

const WIDTH = 760;
const HEIGHT = 230;
const PAD = { top: 14, right: 16, bottom: 26, left: 78 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

function toDayKey(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1]! : null;
}

/**
 * Reconstroi o saldo devedor dia a dia. Como so conhecemos o saldo de hoje,
 * o saldo inicial da janela e o residuo: saldoHoje - (pedidos - pagamentos).
 */
export function buildSeries(
  orders: CustomerCreditOrderEntry[],
  payments: CustomerCreditPaymentEntry[],
  currentDebt: number,
): Point[] {
  const deltaByDay = new Map<string, number>();

  for (const order of orders) {
    const day = toDayKey(order.orderDate);
    if (!day) continue;
    deltaByDay.set(day, (deltaByDay.get(day) ?? 0) + order.totalAmount);
  }
  for (const payment of payments) {
    const day = toDayKey(payment.paymentDate);
    if (!day) continue;
    deltaByDay.set(day, (deltaByDay.get(day) ?? 0) - payment.amount);
  }

  const days = [...deltaByDay.keys()].sort();
  if (days.length < 2) return [];

  const totalDelta = days.reduce((sum, day) => sum + (deltaByDay.get(day) ?? 0), 0);
  let balance = currentDebt - totalDelta;

  const points: Point[] = [{ date: days[0]!, balance: Math.max(balance, 0) }];
  for (const day of days) {
    balance += deltaByDay.get(day) ?? 0;
    points.push({ date: day, balance: Math.max(balance, 0) });
  }

  return points;
}

function daysBetween(from: string, to: string) {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
}

export function CustomerCreditBalanceChart({
  orders,
  payments,
  currentDebt,
  creditLimit,
}: CustomerCreditBalanceChartProps) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const series = buildSeries(orders, payments, currentDebt);
    if (series.length < 2) return null;

    const peak = Math.max(...series.map((point) => point.balance));
    const max = Math.max(peak, creditLimit) * 1.12 || 1;
    const first = series[0]!.date;
    const last = series[series.length - 1]!.date;
    const spanMs = Math.max(1, Date.parse(last) - Date.parse(first));

    const x = (date: string) => PAD.left + ((Date.parse(date) - Date.parse(first)) / spanMs) * PLOT_W;
    const y = (value: number) => PAD.top + PLOT_H - (value / max) * PLOT_H;

    // Tempo acima do limite: soma dos intervalos em que o saldo passou do limite.
    let daysOver = 0;
    if (creditLimit > 0) {
      for (let index = 1; index < series.length; index += 1) {
        if (series[index - 1]!.balance > creditLimit) {
          daysOver += daysBetween(series[index - 1]!.date, series[index]!.date);
        }
      }
    }

    const totalDays = daysBetween(first, last);
    const line = series.map((point) => `${x(point.date)},${y(point.balance)}`).join(" ");
    const area = `${PAD.left},${PAD.top + PLOT_H} ${line} ${x(last)},${PAD.top + PLOT_H}`;

    return {
      series,
      max,
      peak,
      first,
      last,
      totalDays,
      daysOver,
      overRatio: totalDays > 0 ? daysOver / totalDays : 0,
      limitY: creditLimit > 0 ? y(creditLimit) : null,
      x,
      y,
      line,
      area,
    };
  }, [orders, payments, currentDebt, creditLimit]);

  if (!model) {
    return (
      <section className="bankfin-card">
        <div className="bankfin-card-head">
          <h4>Dívida ao longo do tempo</h4>
        </div>
        <p className="bankfin-ledger-empty">
          Ainda não há movimentos suficientes no snapshot para montar a linha do tempo deste cliente.
        </p>
      </section>
    );
  }

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((step) => model.max * step);
  const hovered = hover === null ? null : model.series[hover] ?? null;
  const verdictTone = model.overRatio >= 0.5 ? "danger" : model.overRatio > 0 ? "warning" : "success";
  const verdict =
    model.overRatio >= 0.5
      ? "Passa mais tempo acima do limite do que dentro dele."
      : model.overRatio > 0
        ? "Estoura o limite às vezes, mas volta para a faixa."
        : "Sempre se manteve dentro do limite no período.";

  return (
    <section className="bankfin-card bankfin-chart-card" aria-label="Evolução da dívida contra o limite">
      <div className="bankfin-card-head">
        <h4>Dívida ao longo do tempo</h4>
        <span>
          {formatDate(model.first)} → {formatDate(model.last)}
        </span>
      </div>

      <div className="bankfin-chart-stats">
        <div className={`tone-${verdictTone}`}>
          <span>Tempo acima do limite</span>
          <strong>{Math.round(model.overRatio * 100)}%</strong>
          <small>
            {formatNumber(model.daysOver)} de {formatNumber(model.totalDays)} dias
          </small>
        </div>
        <div>
          <span>Pico da dívida</span>
          <strong>{formatCurrency(model.peak)}</strong>
          <small>
            {creditLimit > 0 ? `${Math.round((model.peak / creditLimit) * 100)}% do limite` : "sem limite"}
          </small>
        </div>
        <div>
          <span>Hoje</span>
          <strong style={{ color: currentDebt > creditLimit ? "var(--bf-danger)" : "var(--bf-success)" }}>
            {formatCurrency(currentDebt)}
          </strong>
          <small>{currentDebt > creditLimit ? "acima do limite" : "dentro do limite"}</small>
        </div>
        <p className={`bankfin-chart-verdict tone-${verdictTone}`}>{verdict}</p>
      </div>

      <svg
        className="bankfin-chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Linha do saldo devedor comparada ao limite de crédito"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {model.limitY !== null ? (
            <clipPath id={`over-${clipId}`}>
              <rect x={0} y={0} width={WIDTH} height={model.limitY} />
            </clipPath>
          ) : null}
        </defs>

        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={model.y(value)}
              y2={model.y(value)}
              className="bankfin-chart-grid"
            />
            <text x={PAD.left - 8} y={model.y(value) + 4} className="bankfin-chart-axis" textAnchor="end">
              {formatCurrency(value)}
            </text>
          </g>
        ))}

        <polygon points={model.area} className="bankfin-chart-area" />
        {model.limitY !== null ? (
          <polygon points={model.area} className="bankfin-chart-area over" clipPath={`url(#over-${clipId})`} />
        ) : null}

        <polyline points={model.line} className="bankfin-chart-line" />

        {model.limitY !== null ? (
          <>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={model.limitY}
              y2={model.limitY}
              className="bankfin-chart-limit"
            />
            <text x={WIDTH - PAD.right} y={model.limitY - 6} className="bankfin-chart-limit-label" textAnchor="end">
              Limite {formatCurrency(creditLimit)}
            </text>
          </>
        ) : null}

        <text x={PAD.left} y={HEIGHT - 6} className="bankfin-chart-axis">
          {formatDate(model.first)}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} className="bankfin-chart-axis" textAnchor="end">
          {formatDate(model.last)}
        </text>

        {hovered ? (
          <>
            <line
              x1={model.x(hovered.date)}
              x2={model.x(hovered.date)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              className="bankfin-chart-cursor"
            />
            <circle
              cx={model.x(hovered.date)}
              cy={model.y(hovered.balance)}
              r={4}
              className={hovered.balance > creditLimit ? "bankfin-chart-dot over" : "bankfin-chart-dot"}
            />
          </>
        ) : null}

        {model.series.map((point, index) => (
          <rect
            key={`${point.date}-${index}`}
            x={model.x(point.date) - 4}
            y={PAD.top}
            width={8}
            height={PLOT_H}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          >
            <title>{`${formatDate(point.date)} · ${formatCurrency(point.balance)}`}</title>
          </rect>
        ))}
      </svg>

      <p className="bankfin-chart-note">
        {hovered
          ? `${formatDate(hovered.date)} · saldo de ${formatCurrency(hovered.balance)}`
          : "Reconstruído a partir dos pedidos e pagamentos carregados. Carregue mais movimentos para estender o período."}
      </p>
    </section>
  );
}
