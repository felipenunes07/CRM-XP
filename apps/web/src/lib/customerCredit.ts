import type {
  CustomerCreditOrderEntry,
  CustomerCreditPaymentEntry,
  CustomerCreditOperationalState,
  CustomerCreditRiskLevel,
  CustomerCreditRow,
} from "@olist-crm/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseCreditDate(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function calendarDayDiff(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export type CustomerCreditDeadlineStatus = {
  status: "settled" | "unknown" | "on_time" | "due_soon" | "overdue";
  dueDate: string | null;
  daysSinceOrder: number | null;
  daysRemaining: number | null;
  overdueDays: number;
};

export function getCustomerCreditDeadline(
  row: CustomerCreditRow,
  today = new Date(),
): CustomerCreditDeadlineStatus {
  if (row.debtAmount <= 0) {
    return {
      status: "settled",
      dueDate: null,
      daysSinceOrder: null,
      daysRemaining: null,
      overdueDays: 0,
    };
  }

  const orderDate = parseCreditDate(row.lastOrderDate);
  if (!orderDate || !row.paymentTerm || row.paymentTerm <= 0) {
    return {
      status: "unknown",
      dueDate: null,
      daysSinceOrder: orderDate ? Math.max(0, calendarDayDiff(orderDate, today)) : null,
      daysRemaining: null,
      overdueDays: 0,
    };
  }

  const dueDate = new Date(orderDate.getTime() + row.paymentTerm * DAY_MS);
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const daysRemaining = calendarDayDiff(todayUtc, dueDate);
  const overdueDays = Math.max(0, -daysRemaining);

  return {
    status: overdueDays > 0 ? "overdue" : daysRemaining <= 7 ? "due_soon" : "on_time",
    dueDate: dueDate.toISOString().slice(0, 10),
    daysSinceOrder: Math.max(0, calendarDayDiff(orderDate, todayUtc)),
    daysRemaining,
    overdueDays,
  };
}

export type CustomerPaymentBehavior = {
  averageDays: number | null;
  sampleSize: number;
  onTimeRate: number | null;
};

export function estimateCustomerPaymentBehavior(
  orders: CustomerCreditOrderEntry[],
  payments: CustomerCreditPaymentEntry[],
  paymentTerm: number | null,
): CustomerPaymentBehavior {
  const orderDates = orders
    .map((order) => parseCreditDate(order.orderDate))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => left.getTime() - right.getTime());

  const findPrecedingOrder = (paymentDate: Date) => {
    let low = 0;
    let high = orderDates.length - 1;
    let match: Date | null = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const candidate = orderDates[middle]!;
      if (candidate.getTime() <= paymentDate.getTime()) {
        match = candidate;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return match;
  };

  const intervals = payments
    .map((payment) => {
      const paymentDate = parseCreditDate(payment.paymentDate);
      if (!paymentDate) return null;
      const precedingOrder = findPrecedingOrder(paymentDate);
      if (!precedingOrder) return null;
      const days = calendarDayDiff(precedingOrder, paymentDate);
      return days >= 0 && days <= 365 ? days : null;
    })
    .filter((days): days is number => days !== null);

  if (!intervals.length) {
    return { averageDays: null, sampleSize: 0, onTimeRate: null };
  }

  const averageDays = Math.round(intervals.reduce((sum, days) => sum + days, 0) / intervals.length);
  const onTimeRate =
    paymentTerm && paymentTerm > 0
      ? intervals.filter((days) => days <= paymentTerm).length / intervals.length
      : null;

  return { averageDays, sampleSize: intervals.length, onTimeRate };
}

export function getCustomerFinancialAssessment(
  row: CustomerCreditRow,
  behavior: CustomerPaymentBehavior,
) {
  const deadline = getCustomerCreditDeadline(row);

  if (row.hasOverCredit || row.operationalState === "OVER_CREDIT") {
    return {
      tone: "danger" as const,
      label: "Risco alto",
      summary: "Cliente ultrapassou o limite de crédito e precisa de revisão imediata.",
    };
  }

  if (deadline.status === "overdue" || row.hasSeverelyOverduePayment || row.hasOverduePayment) {
    return {
      tone: "danger" as const,
      label: "Pagamento atrasado",
      summary: "Há saldo em aberto acima do prazo estimado. Priorize a cobrança.",
    };
  }

  if (
    behavior.averageDays !== null &&
    row.paymentTerm !== null &&
    behavior.averageDays > row.paymentTerm
  ) {
    return {
      tone: "warning" as const,
      label: "Costuma pagar depois do prazo",
      summary: `Média estimada de ${behavior.averageDays} dias para um prazo de ${row.paymentTerm} dias.`,
    };
  }

  if (deadline.status === "due_soon") {
    return {
      tone: "warning" as const,
      label: "Vencimento próximo",
      summary: "O prazo estimado está próximo. Acompanhe antes de virar atraso.",
    };
  }

  if (behavior.averageDays !== null && row.paymentTerm !== null) {
    return {
      tone: "success" as const,
      label: "Histórico saudável",
      summary: `Média estimada de ${behavior.averageDays} dias, dentro do prazo de ${row.paymentTerm} dias.`,
    };
  }

  return {
    tone: "neutral" as const,
    label: "Histórico insuficiente",
    summary: "Ainda não há pares suficientes de pedidos e pagamentos para avaliar o comportamento.",
  };
}

export function customerCreditRiskLabel(value: CustomerCreditRiskLevel) {
  if (value === "CRITICO") return "Crítico";
  if (value === "ATENCAO") return "Atenção";
  if (value === "MONITORAR") return "Monitorar";
  return "OK";
}

export function customerCreditRiskClassName(value: CustomerCreditRiskLevel) {
  if (value === "CRITICO") return "credit-badge-danger";
  if (value === "ATENCAO") return "credit-badge-warning";
  if (value === "MONITORAR") return "credit-badge-monitor";
  return "credit-badge-ok";
}

export function customerCreditStateLabel(value: CustomerCreditOperationalState) {
  if (value === "OWES") return "Devendo";
  if (value === "HAS_CREDIT_BALANCE") return "Saldo a favor";
  if (value === "UNUSED_CREDIT") return "Crédito sem uso";
  if (value === "OVER_CREDIT") return "Ultrapassou crédito";
  return "Quitado";
}

export function customerCreditStateClassName(value: CustomerCreditOperationalState) {
  if (value === "OWES") return "credit-badge-warning";
  if (value === "HAS_CREDIT_BALANCE") return "credit-badge-info";
  if (value === "UNUSED_CREDIT") return "credit-badge-success";
  if (value === "OVER_CREDIT") return "credit-badge-danger";
  return "credit-badge-ok";
}

/**
 * Pílula de status operacional usada na célula do cliente (1 etiqueta por linha,
 * em vez das flags cruas). Reflete a situação mais importante daquela linha.
 */
export function customerCreditStatusBadge(row: CustomerCreditRow): { label: string; className: string } {
  if (row.hasOverCredit) return { label: "Acima do limite", className: "credit-badge-danger" };
  if (isOverdueCreditRow(row)) return { label: "Vencido", className: "credit-badge-warning" };
  if (row.operationalState === "UNUSED_CREDIT") return { label: "Crédito livre", className: "credit-badge-success" };
  if (row.creditBalanceAmount > 0) return { label: "Saldo a favor", className: "credit-badge-info" };
  if (row.debtAmount > 0) return { label: "Em aberto", className: "credit-badge-monitor" };
  return { label: "Quitado", className: "credit-badge-ok" };
}

/** Linha precisa de cobrança ativa hoje (excesso, vencido ou sem pagamento com dívida). */
export function creditNeedsCharge(row: CustomerCreditRow) {
  if (row.debtAmount <= 0) return false;
  return row.hasOverCredit || isOverdueCreditRow(row) || row.hasNoPayment;
}

export function isOverdueCreditRow(row: CustomerCreditRow) {
  // Only customers with active debt can be considered "overdue"
  if (row.debtAmount <= 0) {
    return false;
  }

  // Flag-based detection from Excel
  const isFlagged = row.hasOverduePayment || row.hasSeverelyOverduePayment || row.hasNoPayment;
  if (isFlagged) {
    return true;
  }

  return getCustomerCreditDeadline(row).status === "overdue";
}

export function customerCreditPrimaryLabel(row: CustomerCreditRow) {
  if (row.debtAmount > 0) {
    return "Em aberto";
  }

  if (row.creditBalanceAmount > 0) {
    return "Saldo a favor";
  }

  return "Sem saldo";
}

export function customerCreditHeadlineLabel(row: CustomerCreditRow) {
  if (row.operationalState === "OVER_CREDIT") {
    return "Ultrapassou o limite";
  }

  if (row.debtAmount > 0 && row.withinCreditLimit) {
    return "Dentro do credito";
  }

  if (row.debtAmount > 0 && row.creditLimit <= 0) {
    return "Devendo sem limite";
  }

  if (row.operationalState === "UNUSED_CREDIT") {
    return "Credito livre para vender";
  }

  if (row.operationalState === "HAS_CREDIT_BALANCE") {
    return "Saldo a favor";
  }

  return "Sem pendencia";
}

export function customerCreditHeadlineClassName(row: CustomerCreditRow) {
  if (row.operationalState === "OVER_CREDIT") {
    return "credit-badge-danger";
  }

  if (row.debtAmount > 0) {
    return row.withinCreditLimit ? "credit-badge-info" : "credit-badge-warning";
  }

  if (row.operationalState === "UNUSED_CREDIT") {
    return "credit-badge-success";
  }

  if (row.operationalState === "HAS_CREDIT_BALANCE") {
    return "credit-badge-info";
  }

  return "credit-badge-ok";
}

export function customerCreditVisibleFlags(row: CustomerCreditRow) {
  return row.flags.filter((flag) => {
    if (flag === "Ultrapassou Credito" || flag === "Ultrapassou Crédito") {
      return row.hasOverCredit;
    }

    return true;
  });
}
