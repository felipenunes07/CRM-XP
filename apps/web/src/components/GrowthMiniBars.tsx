export type GrowthTone = "up" | "down" | "flat";

const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${MONTH_NAMES[Number(monthNumber) - 1] ?? monthNumber}/${(year ?? "").slice(2)}`;
}

export function formatPieces(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 });
}

export const TONE_COLORS: Record<GrowthTone, string> = { up: "#2f9d67", down: "#d9534f", flat: "#64748b" };

// Mini grafico de barras com um mes por barra.
export function MiniBars({ values, months, tone }: { values: number[]; months: string[]; tone: GrowthTone }) {
  const width = 104;
  const height = 30;
  const max = Math.max(...values, 1);
  const slot = width / Math.max(values.length, 1);
  const barWidth = Math.max(slot - 2, 2);
  const title = values.map((value, index) => `${monthLabel(months[index] ?? "")}: ${formatPieces(value)}`).join("\n");

  return (
    <svg className={`growth-minibars tone-${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={title}>
      <title>{title}</title>
      {values.map((value, index) => {
        const barHeight = value > 0 ? Math.max((value / max) * (height - 2), 2) : 1;
        return (
          <rect
            key={months[index] ?? index}
            x={index * slot + 1}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1.5}
            className={index === values.length - 1 ? "is-last" : ""}
          />
        );
      })}
    </svg>
  );
}

