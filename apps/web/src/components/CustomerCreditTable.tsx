import type { CustomerCreditRow } from "@olist-crm/shared";
import { Link } from "react-router-dom";
import { formatCurrency, formatDate, calculateDaysSince } from "../lib/format";
import {
  customerCreditRiskClassName,
  customerCreditRiskLabel,
  customerCreditVisibleFlags,
} from "../lib/customerCredit";

interface CustomerCreditTableProps {
  rows: CustomerCreditRow[];
  emptyMessage: string;
  linkedOnly?: boolean;
  /** Habilita as caixas de selecao para montar um publico de disparo. */
  selectable?: boolean;
  selectedCodes?: ReadonlySet<string>;
  onToggleRow?: (customerCode: string) => void;
  onToggleAll?: (checked: boolean) => void;
}

function creditUsagePercent(row: CustomerCreditRow) {
  if (row.creditLimit <= 0) {
    return row.debtAmount > 0 ? 100 : 0;
  }
  return Math.min((row.debtAmount / row.creditLimit) * 100, 120);
}

function usageBarColor(row: CustomerCreditRow) {
  if (row.hasOverCredit) return "danger";
  if (row.creditLimit <= 0 && row.debtAmount > 0) return "danger";
  const pct = creditUsagePercent(row);
  if (pct > 80) return "warning";
  if (pct > 0) return "info";
  return "success";
}

function prazoLabel(days: number | null, term: number | null) {
  if (days === null || days === undefined) return "—";
  const daysStr = days === 0 ? "Hoje" : `${days}d`;
  if (term) return `${daysStr} / ${term}d`;
  return daysStr;
}

function prazoTone(days: number | null, term: number | null) {
  if (days === null || days === undefined) return "";
  if (term && days > term) return "credit-prazo-danger";
  if (days > 90) return "credit-prazo-danger";
  if (days > 30) return "credit-prazo-warning";
  return "";
}

type SuggestedAction = {
  label: string;
  tone: "danger" | "success" | "warning" | "info" | "muted";
  hint: string;
};

function suggestAction(row: CustomerCreditRow): SuggestedAction {
  if (row.hasOverCredit) {
    return { label: "Cobrar", tone: "danger", hint: "Ultrapassou o limite — prioridade de cobranca" };
  }
  if (row.debtAmount > 0 && (row.hasOverduePayment || row.hasSeverelyOverduePayment)) {
    return { label: "Cobrar", tone: "danger", hint: "Pagamento vencido — acionar cobranca" };
  }
  if (row.debtAmount > 0 && row.hasNoPayment) {
    return { label: "Cobrar", tone: "danger", hint: "Nunca pagou — verificar situacao" };
  }
  if (row.operationalState === "UNUSED_CREDIT") {
    return { label: "Vender", tone: "success", hint: "Credito disponivel — oportunidade de venda" };
  }
  if (row.debtAmount > 0 && row.withinCreditLimit) {
    return { label: "Acompanhar", tone: "info", hint: "Dentro do limite — monitorar prazo" };
  }
  if (row.debtAmount > 0 && row.creditLimit <= 0) {
    return { label: "Verificar", tone: "warning", hint: "Devendo sem limite — avaliar credito" };
  }
  if (row.creditBalanceAmount > 0) {
    return { label: "Vender", tone: "success", hint: "Saldo a favor — oportunidade de recompra" };
  }
  return { label: "—", tone: "muted", hint: "Sem acao necessaria" };
}

function rowClassName(row: CustomerCreditRow) {
  if (row.hasOverCredit) return "credit-row-danger";
  if (row.debtAmount > 0 && (row.hasOverduePayment || row.hasSeverelyOverduePayment)) return "credit-row-warn";
  if (row.operationalState === "UNUSED_CREDIT") return "credit-row-opportunity";
  return "";
}

export function CustomerCreditTable({
  rows,
  emptyMessage,
  linkedOnly = true,
  selectable = false,
  selectedCodes,
  onToggleRow,
  onToggleAll,
}: CustomerCreditTableProps) {
  if (!rows.length) {
    return (
      <div className="panel table-panel empty-panel">
        <div className="empty-state">{emptyMessage}</div>
      </div>
    );
  }

  const selected = selectedCodes ?? new Set<string>();
  const selectableCodes = rows.filter((row) => row.customerId).map((row) => row.customerCode);
  const allSelected = selectableCodes.length > 0 && selectableCodes.every((code) => selected.has(code));

  return (
    <div className="panel table-panel">
      <div className="table-scroll">
        <table className="data-table credit-table-v2">
          <thead>
            <tr>
              {selectable ? (
                <th className="credit-select-col">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos os clientes visiveis"
                    checked={allSelected}
                    onChange={(event) => onToggleAll?.(event.target.checked)}
                  />
                </th>
              ) : null}
              <th>Cliente</th>
              <th>Em aberto</th>
              <th>Crédito</th>
              <th>Vencimento</th>
              <th>Risco</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const flags = customerCreditVisibleFlags(row);
              const pct = creditUsagePercent(row);
              const barColor = usageBarColor(row);
              const hasBalance = row.creditBalanceAmount > 0;
              const action = suggestAction(row);
              const actualDays = calculateDaysSince(row.lastPaymentDate);

              const isSelected = selected.has(row.customerCode);

              return (
                <tr key={row.id} className={`${rowClassName(row)} ${isSelected ? "credit-row-selected" : ""}`}>
                  {selectable ? (
                    <td className="credit-select-col">
                      {row.customerId ? (
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${row.customerDisplayName}`}
                          checked={isSelected}
                          onChange={() => onToggleRow?.(row.customerCode)}
                        />
                      ) : null}
                    </td>
                  ) : null}

                  {/* Cliente */}
                  <td>
                    <div className="credit-cell-client">
                      {row.customerId ? (
                        <Link className="credit-cell-client-link" to={`/clientes/${row.customerId}`}>
                          <strong>{row.customerDisplayName}</strong>
                          <span>{row.customerCode}</span>
                        </Link>
                      ) : (
                        <div className="credit-cell-client-link">
                          <strong>{row.sourceDisplayName ?? row.customerDisplayName}</strong>
                          <span>{row.customerCode}</span>
                        </div>
                      )}
                      {flags.length > 0 ? (
                        <div className="credit-cell-flags">
                          {flags.slice(0, 2).map((flag) => (
                            <span key={`${row.id}-${flag}`} className="credit-flag-dot" title={flag}>
                              {flag}
                            </span>
                          ))}
                          {flags.length > 2 ? (
                            <span className="credit-flag-more" title={flags.slice(2).join(", ")}>
                              +{flags.length - 2}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </td>

                  {/* Dívida / Saldo */}
                  <td>
                    <div className="credit-cell-amount">
                      {row.debtAmount > 0 ? (
                        <>
                          <strong className="credit-amount-debt">{formatCurrency(row.debtAmount)}</strong>
                          <span>Em aberto</span>
                        </>
                      ) : hasBalance ? (
                        <>
                          <strong className="credit-amount-positive">{formatCurrency(row.creditBalanceAmount)}</strong>
                          <span>Saldo a favor</span>
                        </>
                      ) : (
                        <>
                          <strong>R$ 0,00</strong>
                          <span>Sem saldo</span>
                        </>
                      )}
                    </div>
                  </td>

                  {/* Crédito: limite + uso + disponivel num lugar so */}
                  <td>
                    {row.creditLimit > 0 ? (
                      <div className="credit-cell-credit">
                        <strong>{formatCurrency(row.creditLimit)}</strong>
                        <div className="credit-usage-track">
                          <div
                            className={`credit-usage-fill ${barColor}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className={row.availableCreditAmount < 0 ? "credit-amount-debt" : "credit-amount-positive"}>
                          {formatCurrency(row.availableCreditAmount)} {row.availableCreditAmount < 0 ? "excesso" : "livre"}
                        </span>
                      </div>
                    ) : (
                      <span className="credit-usage-nolimit">{row.debtAmount > 0 ? "Sem limite" : "—"}</span>
                    )}
                  </td>

                  {/* Vencimento (dias sem pagar) */}
                  <td>
                    <div className="credit-cell-prazo">
                      <strong className={prazoTone(actualDays, row.paymentTerm)}>
                        {prazoLabel(actualDays, row.paymentTerm)}
                      </strong>
                      {row.paymentTerm && actualDays !== null && (
                        <div className="credit-usage-track" style={{ height: "4px", margin: "4px 0" }}>
                          <div
                            className={`credit-usage-fill ${
                              actualDays > row.paymentTerm
                                ? "danger"
                                : actualDays > row.paymentTerm * 0.8
                                  ? "warning"
                                  : "success"
                            }`}
                            style={{ width: `${Math.min((actualDays / row.paymentTerm) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                      {row.lastPaymentDate ? (
                        <span>{formatDate(row.lastPaymentDate)}</span>
                      ) : (
                        <span>Sem pagamento</span>
                      )}
                    </div>
                  </td>

                  {/* Risco */}
                  <td>
                    <span className={`credit-risk-pill ${customerCreditRiskClassName(row.riskLevel)}`}>
                      {customerCreditRiskLabel(row.riskLevel)}
                    </span>
                  </td>

                  {/* Acao: sugestao + abrir */}
                  <td>
                    <div className="credit-cell-action-merged">
                      <span className={`credit-action-pill tone-${action.tone}`} title={action.hint}>
                        {action.label}
                      </span>
                      {linkedOnly && row.customerId ? (
                        <Link className="ghost-button small" to={`/clientes/${row.customerId}`}>
                          Abrir
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
