function toSafeNumber(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }

  return value;
}

export function formatCurrency(value: number | null | undefined) {
  const safeValue = toSafeNumber(value);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(safeValue);
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(toSafeNumber(value));
}

export function formatDate(value: string | null) {
  if (!value) {
    return "Sem registro";
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDaysSince(value: number | null) {
  if (value === null || value === undefined) {
    return "Sem base";
  }

  if (value === 0) {
    return "Hoje";
  }

  if (value === 1) {
    return "1 dia";
  }

  return `${value} dias`;
}

export function formatPercent(value: number | null | undefined) {
  const safeValue = toSafeNumber(value);

  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeValue * 100)}%`;
}

export function statusLabel(status: "ACTIVE" | "ATTENTION" | "INACTIVE") {
  if (status === "ACTIVE") return "Ativo";
  if (status === "ATTENTION") return "Atenção";
  return "Inativo";
}
