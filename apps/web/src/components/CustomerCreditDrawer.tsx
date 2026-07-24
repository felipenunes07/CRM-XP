import type { CustomerCreditRow } from "@olist-crm/shared";
import { ExternalLink, MessageCircle, Pencil, User, X } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { customerCreditRiskLabel, getCustomerCreditDeadline } from "../lib/customerCredit";
import { formatCurrency, formatDate, formatDaysSince } from "../lib/format";
import "./customerCreditBank.css";

interface CustomerCreditDrawerProps {
  row: CustomerCreditRow | null;
  onClose: () => void;
  onEdit: (row: CustomerCreditRow) => void;
  chargeUrl: (row: CustomerCreditRow) => string;
}

function dueSummary(row: CustomerCreditRow) {
  const deadline = getCustomerCreditDeadline(row);
  if (deadline.status === "settled") return "Sem saldo aberto";
  if (deadline.status === "unknown") return "Sem prazo cadastrado";
  if (deadline.status === "overdue") return `${deadline.overdueDays} dias em atraso`;
  if (deadline.daysRemaining === 0) return "Vence hoje";
  return `Vence em ${deadline.daysRemaining} dias`;
}

export function CustomerCreditDrawer({ row, onClose, onEdit, chargeUrl }: CustomerCreditDrawerProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!row) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [row, onClose]);

  if (!row) return null;

  const hasDebt = row.debtAmount > 0;
  const heroValue = hasDebt ? row.debtAmount : row.creditBalanceAmount;
  const heroLabel = hasDebt ? "Saldo devedor" : row.creditBalanceAmount > 0 ? "Saldo a favor" : "Saldo";
  const heroColor = hasDebt ? "var(--bf-danger)" : row.creditBalanceAmount > 0 ? "var(--bf-success)" : "var(--bf-navy)";
  const usage = row.creditLimit > 0 ? (row.debtAmount / row.creditLimit) * 100 : null;

  return (
    <div className="bankfin bankfin-drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="bankfin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Financeiro de ${row.customerDisplayName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="bankfin-drawer-head">
          <div>
            <h3>{row.customerDisplayName}</h3>
            <p>
              {row.customerCode || "Sem código"} · {customerCreditRiskLabel(row.riskLevel)}
            </p>
          </div>
          <button type="button" className="bankfin-btn-icon" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="bankfin-drawer-body">
          <div className="bankfin-drawer-hero">
            <span>{heroLabel}</span>
            <strong style={{ color: heroColor }}>{formatCurrency(heroValue)}</strong>
            <small>{dueSummary(row)}</small>
          </div>

          <div className="bankfin-drawer-grid">
            <div>
              <span>Limite de crédito</span>
              <strong>{row.creditLimit > 0 ? formatCurrency(row.creditLimit) : "Sem limite"}</strong>
            </div>
            <div>
              <span>Prazo de pagamento</span>
              <strong>{row.paymentTerm ? `${row.paymentTerm} dias` : "Sem prazo"}</strong>
            </div>
            <div>
              <span>Crédito disponível</span>
              <strong style={{ color: row.availableCreditAmount < 0 ? "var(--bf-danger)" : undefined }}>
                {formatCurrency(row.availableCreditAmount)}
              </strong>
            </div>
            <div>
              <span>Uso do limite</span>
              <strong style={{ color: usage !== null && usage > 100 ? "var(--bf-danger)" : undefined }}>
                {usage === null ? "—" : `${usage.toFixed(0)}%`}
              </strong>
            </div>
            <div>
              <span>Último pedido</span>
              <strong>{formatDate(row.lastOrderDate)}</strong>
            </div>
            <div>
              <span>Último pagamento</span>
              <strong>{formatDate(row.lastPaymentDate)}</strong>
            </div>
            <div>
              <span>Sem comprar há</span>
              <strong>{formatDaysSince(row.daysSinceLastOrder)}</strong>
            </div>
            <div>
              <span>Sem pagar há</span>
              <strong>{formatDaysSince(row.daysSinceLastPayment)}</strong>
            </div>
          </div>

          {row.observation ? <p className="bankfin-drawer-note">{row.observation}</p> : null}

          {row.flags.length ? (
            <div className="bankfin-drawer-flags">
              {row.flags.map((flag) => (
                <span key={flag} className="bankfin-flag">
                  {flag}
                </span>
              ))}
            </div>
          ) : null}

          {row.manualOverrideUpdatedAt ? (
            <p className="bankfin-drawer-note">
              Limite/prazo ajustado manualmente
              {row.manualOverrideUpdatedByName ? ` por ${row.manualOverrideUpdatedByName}` : ""} em{" "}
              {formatDate(row.manualOverrideUpdatedAt)}.
            </p>
          ) : null}
        </div>

        <footer className="bankfin-drawer-foot">
          {hasDebt ? (
            <a className="bankfin-btn-primary" href={chargeUrl(row)} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={15} />
              Cobrar no WhatsApp
            </a>
          ) : (
            <span />
          )}
          <button type="button" className="bankfin-btn-ghost" onClick={() => onEdit(row)}>
            <Pencil size={15} />
            Editar limite e prazo
          </button>
          {row.customerId ? (
            <>
              <button
                type="button"
                className="bankfin-btn-ghost"
                style={{ gridColumn: "1 / -1" }}
                onClick={() => navigate(`/clientes/financeiro/${row.customerId}`)}
              >
                <ExternalLink size={15} />
                Abrir dossiê financeiro completo
              </button>
              <button
                type="button"
                className="bankfin-btn-ghost"
                style={{ gridColumn: "1 / -1" }}
                onClick={() => navigate(`/clientes/${row.customerId}`)}
              >
                <User size={15} />
                Abrir ficha do cliente
              </button>
            </>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}
