import type {
  CustomerCreditOperationalState,
  CustomerCreditRiskLevel,
  CustomerCreditRow,
} from "@olist-crm/shared";

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

export function isOverdueCreditRow(row: CustomerCreditRow) {
  return row.hasOverduePayment || row.hasSeverelyOverduePayment || row.hasNoPayment;
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
