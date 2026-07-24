import type { CustomerCreditOrderEntry, CustomerCreditPaymentEntry } from "@olist-crm/shared";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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

const HEIGHT = 300;
const PAD = { top: 20, right: 104, bottom: 34, left: 84 };

function toDayKey(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1]! : null;
}

/** R$ 1,2 mi / R$ 850 mil — eixo legível sem números gigantes. */
function compactCurrency(value: number) {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `R$ ${(Number.isInteger(millions) ? millions : Number(millions.toFixed(1)))
      .toString()
      .replace(".", ",")} mi`;
  }
  if (value >= 1_000) return `R$ ${Math.round(value / 1_000)} mil`;
  return `R$ ${Math.round(value)}`;
}

/** Escala com marcas redondas (0, 50 mil, 100 mil...) em vez de 226 mil, 170 mil. */
function niceScale(max: number, targetTicks = 4) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const rawStep = max / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceStep =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) *
    magnitude;
  const top = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let value = 0; value <= top + niceStep / 1000; value += niceStep) ticks.push(value);
  return { top, ticks };
}

function shortDate(day: string) {
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
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

/** Saldo devedor é uma escada: fica parado até o próximo movimento. */
function stepPath(coords: Array<[number, number]>) {
  if (!coords.length) return "";
  let path = `M ${coords[0]![0].toFixed(2)} ${coords[0]![1].toFixed(2)}`;
  for (let index = 1; index < coords.length; index += 1) {
    const [x, y] = coords[index]!;
    const previousY = coords[index - 1]![1];
    path += ` L ${x.toFixed(2)} ${previousY.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return path;
}

function daysBetween(from: string, to: string) {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
}

/** Largura real do container: o SVG é desenhado em pixels, sem esticar nada. */
function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(880);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

export function CustomerCreditBalanceChart({
  orders,
  payments,
  currentDebt,
  creditLimit,
}: CustomerCreditBalanceChartProps) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const { ref, width } = useMeasuredWidth();
  const plotW = Math.max(160, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const model = useMemo(() => {
    const series = buildSeries(orders, payments, currentDebt);
    if (series.length < 2) return null;

    const peak = Math.max(...series.map((point) => point.balance));
    const scale = niceScale(Math.max(peak, creditLimit) * 1.08);
    const first = series[0]!.date;
    const last = series[series.length - 1]!.date;
    const spanMs = Math.max(1, Date.parse(last) - Date.parse(first));

    const x = (date: string) => PAD.left + ((Date.parse(date) - Date.parse(first)) / spanMs) * plotW;
    const y = (value: number) => PAD.top + plotH - (value / scale.top) * plotH;

    let daysOver = 0;
    if (creditLimit > 0) {
      for (let index = 1; index < series.length; index += 1) {
        if (series[index - 1]!.balance > creditLimit) {
          daysOver += daysBetween(series[index - 1]!.date, series[index]!.date);
        }
      }
    }

    const coords = series.map((point) => [x(point.date), y(point.balance)] as [number, number]);
    const linePath = stepPath(coords);
    const baseline = PAD.top + plotH;
    const areaPath = `${linePath} L ${coords[coords.length - 1]![0].toFixed(2)} ${baseline} L ${coords[0]![0].toFixed(
      2,
    )} ${baseline} Z`;

    // Marcas do eixo X: um rótulo por mês, afinado conforme a largura disponível.
    const monthStarts: string[] = [];
    let lastMonth = "";
    for (const point of series) {
      const month = point.date.slice(0, 7);
      if (month !== lastMonth) {
        lastMonth = month;
        monthStarts.push(point.date);
      }
    }
    const maxLabels = Math.max(3, Math.floor(plotW / 92));
    const stride = Math.ceil(monthStarts.length / maxLabels);
    const monthTicks = monthStarts.filter((_, index) => index % stride === 0);

    const totalDays = daysBetween(first, last);

    return {
      series,
      coords,
      scale,
      peak,
      first,
      last,
      totalDays,
      daysOver,
      overRatio: totalDays > 0 ? daysOver / totalDays : 0,
      limitY: creditLimit > 0 ? y(creditLimit) : null,
      monthTicks,
      x,
      y,
      linePath,
      areaPath,
      baseline,
    };
  }, [orders, payments, currentDebt, creditLimit, plotW, plotH]);

  const verdictTone = !model
    ? "success"
    : model.overRatio >= 0.5
      ? "danger"
      : model.overRatio > 0
        ? "warning"
        : "success";

  return (
    <section className="bankfin-card bankfin-chart-card" aria-label="Evolução da dívida contra o limite">
      <div className="bankfin-card-head">
        <h4>Dívida ao longo do tempo</h4>
        {model ? (
          <span>
            {formatDate(model.first)} → {formatDate(model.last)}
          </span>
        ) : null}
      </div>

      {model ? (
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
            <strong className={currentDebt > creditLimit ? "is-over" : "is-ok"}>
              {formatCurrency(currentDebt)}
            </strong>
            <small>{currentDebt > creditLimit ? "acima do limite" : "dentro do limite"}</small>
          </div>
          <p className={`bankfin-chart-verdict tone-${verdictTone}`}>
            {model.overRatio >= 0.5
              ? "Passa mais tempo acima do limite do que dentro dele."
              : model.overRatio > 0
                ? "Estoura o limite às vezes, mas volta para a faixa."
                : "Sempre se manteve dentro do limite no período."}
          </p>
        </div>
      ) : null}

      <div className="bankfin-chart-plot" ref={ref}>
        {!model ? (
          <p className="bankfin-ledger-empty">
            Ainda não há movimentos suficientes no snapshot para montar a linha do tempo deste cliente.
          </p>
        ) : (
          <>
            <svg
              className="bankfin-chart-svg"
              width={width}
              height={HEIGHT}
              viewBox={`0 0 ${width} ${HEIGHT}`}
              role="img"
              aria-label="Linha do saldo devedor comparada ao limite de crédito"
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2956d7" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#2956d7" stopOpacity="0.01" />
                </linearGradient>
                <linearGradient id={`over-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c53a35" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#c53a35" stopOpacity="0.05" />
                </linearGradient>
                {model.limitY !== null ? (
                  <clipPath id={`clip-${uid}`}>
                    <rect x={0} y={0} width={width} height={Math.max(model.limitY, 0)} />
                  </clipPath>
                ) : null}
              </defs>

              {model.scale.ticks.map((value, index) => (
                <g key={value}>
                  <line
                    x1={PAD.left}
                    x2={PAD.left + plotW}
                    y1={model.y(value)}
                    y2={model.y(value)}
                    className={index === 0 ? "bankfin-chart-grid base" : "bankfin-chart-grid"}
                  />
                  <text
                    x={PAD.left - 12}
                    y={model.y(value) + 4}
                    className="bankfin-chart-axis"
                    textAnchor="end"
                  >
                    {compactCurrency(value)}
                  </text>
                </g>
              ))}

              <path d={model.areaPath} fill={`url(#fill-${uid})`} />
              {model.limitY !== null ? (
                <path d={model.areaPath} fill={`url(#over-${uid})`} clipPath={`url(#clip-${uid})`} />
              ) : null}

              <path d={model.linePath} className="bankfin-chart-line" />
              {model.limitY !== null ? (
                <path d={model.linePath} className="bankfin-chart-line over" clipPath={`url(#clip-${uid})`} />
              ) : null}

              {/* Linha do limite + rótulo na margem direita, longe da curva */}
              {model.limitY !== null ? (
                <>
                  <line
                    x1={PAD.left}
                    x2={PAD.left + plotW}
                    y1={model.limitY}
                    y2={model.limitY}
                    className="bankfin-chart-limit"
                  />
                  <text x={PAD.left + plotW + 10} y={model.limitY - 7} className="bankfin-chart-limit-label">
                    Limite
                  </text>
                  <text x={PAD.left + plotW + 10} y={model.limitY + 12} className="bankfin-chart-limit-value">
                    {compactCurrency(creditLimit)}
                  </text>
                </>
              ) : null}

              {model.monthTicks.map((day) => (
                <text
                  key={day}
                  x={model.x(day)}
                  y={HEIGHT - 12}
                  className="bankfin-chart-axis"
                  textAnchor="middle"
                >
                  {shortDate(day)}
                </text>
              ))}

              {hover !== null && model.series[hover] ? (
                <>
                  <line
                    x1={model.x(model.series[hover]!.date)}
                    x2={model.x(model.series[hover]!.date)}
                    y1={PAD.top}
                    y2={model.baseline}
                    className="bankfin-chart-cursor"
                  />
                  <circle
                    cx={model.x(model.series[hover]!.date)}
                    cy={model.y(model.series[hover]!.balance)}
                    r={4.5}
                    className={
                      model.series[hover]!.balance > creditLimit
                        ? "bankfin-chart-dot over"
                        : "bankfin-chart-dot"
                    }
                  />
                </>
              ) : null}

              <rect
                x={PAD.left}
                y={PAD.top}
                width={plotW}
                height={plotH}
                fill="transparent"
                onMouseMove={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const ratio = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
                  const targetMs =
                    Date.parse(model.first) +
                    ratio * (Date.parse(model.last) - Date.parse(model.first));
                  let nearest = 0;
                  let bestDistance = Infinity;
                  model.series.forEach((point, index) => {
                    const distance = Math.abs(Date.parse(point.date) - targetMs);
                    if (distance < bestDistance) {
                      bestDistance = distance;
                      nearest = index;
                    }
                  });
                  setHover(nearest);
                }}
              />
            </svg>

            {hover !== null && model.series[hover] ? (
              <div
                className="bankfin-chart-tip"
                style={{
                  left: `${(model.x(model.series[hover]!.date) / Math.max(width, 1)) * 100}%`,
                  top: `${(model.y(model.series[hover]!.balance) / HEIGHT) * 100}%`,
                }}
              >
                <strong>{formatCurrency(model.series[hover]!.balance)}</strong>
                <span>{formatDate(model.series[hover]!.date)}</span>
                {creditLimit > 0 ? (
                  <em className={model.series[hover]!.balance > creditLimit ? "over" : ""}>
                    {model.series[hover]!.balance > creditLimit
                      ? `${formatCurrency(model.series[hover]!.balance - creditLimit)} acima do limite`
                      : `${formatCurrency(creditLimit - model.series[hover]!.balance)} de folga`}
                  </em>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      <p className="bankfin-chart-note">
        Reconstruído a partir dos pedidos e pagamentos carregados. Carregue mais movimentos para estender o
        período.
      </p>
    </section>
  );
}
