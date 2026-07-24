import type { CustomerCreditRow } from "@olist-crm/shared";
import { ExternalLink, MessageCircle, Pencil, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EditCustomerCreditModal } from "./EditCustomerCreditModal";
import { formatCurrency, formatDaysSince } from "../lib/format";
import {
  customerCreditPrimaryLabel,
  customerCreditRiskLabel,
  customerCreditVisibleFlags,
} from "../lib/customerCredit";

interface CustomerCreditCardListProps {
  rows: CustomerCreditRow[];
  emptyMessage: string;
  linkedOnly?: boolean;
}

function creditUsagePercent(row: CustomerCreditRow) {
  if (row.creditLimit <= 0) {
    return row.debtAmount > 0 ? 100 : 0;
  }

  return (row.debtAmount / row.creditLimit) * 100;
}

function buildWhatsappCollectionUrl(row: CustomerCreditRow) {
  const phone = row.customerCode ? row.customerCode.replace(/\D/g, "") : "";
  const name = row.customerDisplayName;
  const debt = formatCurrency(row.debtAmount);

  const text = encodeURIComponent(
    `Olá ${name}, tudo bem? Entramos em contato referente ao acompanhamento financeiro. Identificamos o saldo em aberto no valor de ${debt}. Podemos enviar a segunda via dos títulos ou PIX para liquidação hoje? Obrigado!`
  );

  return phone ? `https://wa.me/55${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function CustomerCreditCardList({
  rows,
  emptyMessage,
  linkedOnly = true,
}: CustomerCreditCardListProps) {
  const [editingRow, setEditingRow] = useState<CustomerCreditRow | null>(null);

  if (!rows.length) {
    return (
      <div className="panel empty-panel" style={{ padding: "3rem", textAlign: "center" }}>
        <div className="empty-state">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <>
      <div className="customer-credit-monitoring-grid">
        {rows.map((row) => {
          const flags = customerCreditVisibleFlags(row);
          const usageRaw = creditUsagePercent(row);
          const usageClamped = Math.min(usageRaw, 100);
          const primaryAmount = row.debtAmount > 0 ? row.debtAmount : row.creditBalanceAmount;
          const riskClass = (row.riskLevel || "NORMAL").toLowerCase();

          return (
            <article
              key={row.id}
              className={`customer-credit-monitoring-card ${row.hasOverCredit ? "is-over-credit" : ""}`}
            >
              {/* Header Identity & Risk Badge */}
              <div className="customer-credit-monitoring-card-header">
                <div className="customer-credit-card-identity">
                  <h4 className="customer-credit-card-name" title={row.customerDisplayName}>
                    {row.customerDisplayName}
                  </h4>
                  <span className="customer-credit-card-code">
                    Cód: {row.customerCode || "Sem código"} • {row.sourceDisplayName}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span className={`credit-risk-badge ${riskClass}`}>
                    <ShieldAlert size={12} />
                    {customerCreditRiskLabel(row.riskLevel)}
                  </span>
                  {row.customerId && (
                    <button
                      type="button"
                      className="credit-action-btn details"
                      style={{ padding: "0.25rem 0.5rem", height: "26px" }}
                      onClick={() => setEditingRow(row)}
                      title="Editar Limite e Prazo"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Card Body & Amounts */}
              <div className="customer-credit-card-body">
                <div className="credit-main-amount-block">
                  <span className="credit-main-amount-label">{customerCreditPrimaryLabel(row)}</span>
                  <span
                    className={`credit-main-amount-value ${
                      row.debtAmount > 0 ? "danger" : row.creditBalanceAmount > 0 ? "success" : "neutral"
                    }`}
                  >
                    {primaryAmount > 0 ? formatCurrency(primaryAmount) : "R$ 0,00"}
                  </span>
                </div>

                {/* Progress Usage Bar */}
                {row.creditLimit > 0 ? (
                  <div className="credit-usage-container">
                    <div className="credit-usage-header">
                      <span>Uso do limite (R$ {formatCurrency(row.creditLimit)})</span>
                      <span>
                        <strong>{usageRaw.toFixed(0)}%</strong>
                      </span>
                    </div>
                    <div className="credit-usage-track">
                      <div
                        className={`credit-usage-fill ${
                          row.hasOverCredit
                            ? "overflow"
                            : usageRaw >= 80
                              ? "danger"
                              : usageRaw >= 50
                                ? "warning"
                                : ""
                        }`}
                        style={{ width: `${usageClamped}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="credit-usage-header" style={{ fontStyle: "italic", color: "#94a3b8" }}>
                    {row.debtAmount > 0
                      ? "Cliente com saldo devedor sem limite cadastrado."
                      : "Sem limite cadastrado."}
                  </div>
                )}

                {/* Timeline Metadata & Flags */}
                <div className="credit-card-flags">
                  {row.paymentTerm && (
                    <span className="credit-card-flag-pill">Prazo: {row.paymentTerm}d</span>
                  )}
                  {row.daysSinceLastPayment !== null && (
                    <span className={`credit-card-flag-pill ${row.daysSinceLastPayment > 30 ? "alert" : ""}`}>
                      Sem pagto há {formatDaysSince(row.daysSinceLastPayment)}
                    </span>
                  )}
                  {row.hasOverCredit && (
                    <span className="credit-card-flag-pill alert">Excesso de Limite</span>
                  )}
                  {flags.map((flag) => (
                    <span key={`${row.id}-${flag}`} className="credit-card-flag-pill">
                      {flag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Quick Action Footer Buttons */}
              <div className="customer-credit-card-actions">
                {row.debtAmount > 0 ? (
                  <a
                    href={buildWhatsappCollectionUrl(row)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="credit-action-btn whatsapp"
                    title="Cobrar via WhatsApp"
                  >
                    <MessageCircle size={15} />
                    Cobrar WhatsApp
                  </a>
                ) : null}

                {row.customerId && (
                  <button
                    type="button"
                    className="credit-action-btn details"
                    onClick={() => setEditingRow(row)}
                  >
                    <Pencil size={13} />
                    Editar Crédito
                  </button>
                )}

                {linkedOnly && row.customerId ? (
                  <Link className="credit-action-btn details" to={`/clientes/${row.customerId}`}>
                    <ExternalLink size={14} />
                    Ficha
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <EditCustomerCreditModal
        row={editingRow}
        isOpen={Boolean(editingRow)}
        onClose={() => setEditingRow(null)}
      />
    </>
  );
}
