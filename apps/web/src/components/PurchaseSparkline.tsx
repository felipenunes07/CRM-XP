import { useMemo } from "react";
import type { WhatsappGroupPurchasePoint } from "@olist-crm/shared";

interface PurchaseSparklineProps {
  /** Série esparsa de peças/mês vinda da API (só meses com compra). */
  trend?: WhatsappGroupPurchasePoint[];
  /** Texto auxiliar (ex.: "Nunca comprou") exibido quando não há histórico. */
  emptyHint?: string;
}

const MONTHS = 12;

function buildWindow(trend: WhatsappGroupPurchasePoint[] | undefined) {
  // Normaliza a série esparsa em uma janela fixa dos últimos 12 meses,
  // preenchendo com 0 os meses sem compra, em ordem cronológica crescente.
  const byMonth = new Map<string, number>();
  for (const point of trend ?? []) {
    byMonth.set(point.month, (byMonth.get(point.month) ?? 0) + (point.pieces || 0));
  }

  const now = new Date();
  const slots: Array<{ month: string; label: string; pieces: number }> = [];
  for (let i = MONTHS - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    slots.push({
      month: key,
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      pieces: byMonth.get(key) ?? 0,
    });
  }
  return slots;
}

export function PurchaseSparkline({ trend, emptyHint }: PurchaseSparklineProps) {
  const slots = useMemo(() => buildWindow(trend), [trend]);

  const total = slots.reduce((sum, s) => sum + s.pieces, 0);
  const activeMonths = slots.filter((s) => s.pieces > 0).length;
  const max = Math.max(...slots.map((s) => s.pieces), 1);
  const lastValue = slots[slots.length - 1]?.pieces ?? 0;

  if (total === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>
          Sem compras (12m)
        </span>
        {emptyHint && (
          <span style={{ fontSize: "0.72rem", color: "#cbd5e1" }}>{emptyHint}</span>
        )}
      </div>
    );
  }

  // Média de peças por mês considerando apenas os meses ativos (representa
  // melhor o porte de quem compra em rajadas do que dividir por 12 fixo).
  const avgPerActiveMonth = Math.round(total / Math.max(activeMonths, 1));

  // Cor por intensidade: quem compra mais aparece mais "quente".
  const barColor = (pieces: number) => {
    if (pieces === 0) return "#e2e8f0";
    const ratio = pieces / max;
    if (ratio >= 0.66) return "#059669";
    if (ratio >= 0.33) return "#34d399";
    return "#a7f3d0";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "168px" }}>
      {/* Linha de números-resumo */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
        <strong style={{ fontSize: "1.05rem", color: "#065f46", fontWeight: 800, lineHeight: 1 }}>
          {avgPerActiveMonth}
        </strong>
        <span style={{ fontSize: "0.72rem", color: "#475569", fontWeight: 600 }}>pç/mês (méd.)</span>
      </div>

      {/* Mini-gráfico de barras: peças por mês nos últimos 12 meses */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "2px",
          height: "34px",
        }}
      >
        {slots.map((slot) => (
          <div
            key={slot.month}
            title={`${slot.label}: ${slot.pieces} pç`}
            style={{
              flex: 1,
              height: `${Math.max((slot.pieces / max) * 100, slot.pieces > 0 ? 8 : 3)}%`,
              minHeight: "2px",
              background: barColor(slot.pieces),
              borderRadius: "2px 2px 0 0",
              transition: "height 0.2s ease",
            }}
          />
        ))}
      </div>

      {/* Rodapé: total na janela e último mês */}
      <div style={{ display: "flex", gap: "10px", fontSize: "0.7rem", color: "#64748b" }}>
        <span>
          Total 12m: <strong style={{ color: "#334155" }}>{total} pç</strong>
        </span>
        <span>
          Últ. mês: <strong style={{ color: lastValue > 0 ? "#059669" : "#94a3b8" }}>{lastValue}</strong>
        </span>
      </div>
    </div>
  );
}
