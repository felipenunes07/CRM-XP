import type { CustomerCreditRow } from "@olist-crm/shared";
import { ExternalLink, MessageCircle, MoreHorizontal, PanelRightOpen, Pencil, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerCreditDrawer } from "./CustomerCreditDrawer";
import { CustomerCreditLimitCell } from "./CustomerCreditLimitCell";
import { EditCustomerCreditModal } from "./EditCustomerCreditModal";
import { formatCurrency, formatDate } from "../lib/format";
import { customerCreditRiskLabel, getCustomerCreditDeadline } from "../lib/customerCredit";
import "./customerCreditBank.css";

interface CustomerCreditTableProps {
  rows: CustomerCreditRow[];
  emptyMessage: string;
  linkedOnly?: boolean;
  selectable?: boolean;
  selectedCodes?: ReadonlySet<string>;
  onToggleRow?: (customerCode: string) => void;
  onToggleAll?: (checked: boolean) => void;
}

function creditUsagePercent(row: CustomerCreditRow) {
  if (row.creditLimit <= 0) return row.debtAmount > 0 ? 100 : 0;
  return (row.debtAmount / row.creditLimit) * 100;
}

/** Rotulo, tom e barra de progresso do prazo (quanto do prazo ja foi consumido). */
function deadlineInfo(row: CustomerCreditRow) {
  const deadline = getCustomerCreditDeadline(row);
  const term = row.paymentTerm ?? 0;
  const elapsed = deadline.daysSinceOrder ?? 0;
  const progress = term > 0 ? Math.min((elapsed / term) * 100, 100) : null;

  if (deadline.status === "settled") {
    return { label: "Quitado", helper: "", tone: "muted", progress: null };
  }
  if (deadline.status === "unknown") {
    return { label: "Sem prazo", helper: "cadastrar prazo", tone: "muted", progress: null };
  }
  if (deadline.status === "overdue") {
    return {
      label: `${deadline.overdueDays}d em atraso`,
      helper: deadline.dueDate ? `venceu ${formatDate(deadline.dueDate)}` : "",
      tone: "danger",
      progress: 100,
    };
  }
  if (deadline.daysRemaining === 0) {
    return { label: "Vence hoje", helper: "", tone: "warning", progress: 100 };
  }
  return {
    label: `faltam ${deadline.daysRemaining}d`,
    helper: deadline.dueDate ? `vence ${formatDate(deadline.dueDate)}` : "",
    tone: (deadline.daysRemaining ?? 0) <= 7 ? "warning" : "success",
    progress,
  };
}

/** "há 12 dias" — o sinal que mostra se o cliente sumiu do caixa. */
function sinceLabel(days: number | null) {
  if (days === null) return { text: "sem registro", tone: "muted" };
  if (days === 0) return { text: "hoje", tone: "success" };
  if (days === 1) return { text: "há 1 dia", tone: "success" };
  return {
    text: `há ${days} dias`,
    tone: days >= 60 ? "danger" : days >= 30 ? "warning" : "success",
  };
}

/**
 * O snapshot financeiro nao traz telefone: `customerCode` e codigo do cliente.
 * So usamos como numero quando o codigo realmente parece um telefone brasileiro,
 * senao abrimos o WhatsApp com a mensagem pronta e sem destinatario.
 */
function buildWhatsappCollectionUrl(row: CustomerCreditRow) {
  const digits = (row.customerCode ?? "").replace(/\D/g, "");
  const looksLikePhone = digits.length === 10 || digits.length === 11;
  const text = encodeURIComponent(
    `Olá ${row.customerDisplayName}, tudo bem? Passando para falar do saldo em aberto de ${formatCurrency(
      row.debtAmount,
    )}. Podemos enviar a segunda via dos títulos para pagamento hoje?`,
  );

  return looksLikePhone ? `https://wa.me/55${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function CustomerCreditTable({
  rows,
  emptyMessage,
  selectable = false,
  selectedCodes,
  onToggleRow,
  onToggleAll,
}: CustomerCreditTableProps) {
  const navigate = useNavigate();
  const [editingRow, setEditingRow] = useState<CustomerCreditRow | null>(null);
  const [detailRow, setDetailRow] = useState<CustomerCreditRow | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenuId) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [openMenuId]);

  if (!rows.length) {
    return (
      <div className="bankfin-table-wrap">
        <p className="bankfin-empty">{emptyMessage}</p>
      </div>
    );
  }

  const selected = selectedCodes ?? new Set<string>();
  const selectableCodes = rows.filter((row) => row.customerId).map((row) => row.customerCode);
  const allSelected = selectableCodes.length > 0 && selectableCodes.every((code) => selected.has(code));

  return (
    <>
      <div className="bankfin-table-wrap">
        <div className="bankfin-table-scroll">
          <table className="bankfin-table">
            <thead>
              <tr>
                {selectable ? (
                  <th className="bankfin-check-col">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os clientes visíveis"
                      checked={allSelected}
                      onChange={(event) => onToggleAll?.(event.target.checked)}
                    />
                  </th>
                ) : null}
                <th className="col-client">Cliente</th>
                <th className="is-right col-open">Em aberto</th>
                <th className="col-status">Situação</th>
                <th className="col-due">Prazo</th>
                <th className="is-right bankfin-col-limit col-limit">Limite</th>
                <th className="bankfin-col-payment col-payment">Últ. pagamento</th>
                <th className="is-right col-action">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const due = deadlineInfo(row);
                const since = sinceLabel(row.daysSinceLastPayment);
                const isSelected = selected.has(row.customerCode);
                const riskClass = (row.riskLevel || "NORMAL").toLowerCase();

                return (
                  <tr
                    key={row.id}
                    className={isSelected ? "is-selected" : ""}
                    onClick={() => setDetailRow(row)}
                  >
                    {selectable ? (
                      <td className="bankfin-check-col" onClick={(event) => event.stopPropagation()}>
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

                    <td className="bankfin-client">
                      <strong>{row.customerDisplayName}</strong>
                      <span>{row.customerCode || "Sem código"}</span>
                    </td>

                    <td className="is-right">
                      {row.debtAmount > 0 ? (
                        <span className="bankfin-amount is-debt">{formatCurrency(row.debtAmount)}</span>
                      ) : row.creditBalanceAmount > 0 ? (
                        <span className="bankfin-amount is-credit">
                          {formatCurrency(row.creditBalanceAmount)}
                        </span>
                      ) : (
                        <span className="bankfin-amount is-zero">{formatCurrency(0)}</span>
                      )}
                    </td>

                    <td>
                      <span className="bankfin-status">
                        <i className={`bankfin-dot ${riskClass}`} />
                        {customerCreditRiskLabel(row.riskLevel)}
                      </span>
                    </td>

                    <td>
                      <span className={`bankfin-due tone-${due.tone}`}>
                        {due.label}
                        {due.helper ? <small>{due.helper}</small> : null}
                      </span>
                      {due.progress !== null ? (
                        <span className="bankfin-due-track">
                          <i className={`tone-${due.tone}`} style={{ width: `${due.progress}%` }} />
                        </span>
                      ) : null}
                    </td>

                    <td className="is-right bankfin-col-limit">
                      <CustomerCreditLimitCell row={row} />
                    </td>

                    <td className="bankfin-date bankfin-col-payment">
                      {formatDate(row.lastPaymentDate)}
                      <small className={`bankfin-since tone-${since.tone}`}>{since.text}</small>
                    </td>

                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="bankfin-actions">
                        {row.debtAmount > 0 ? (
                          <a
                            className="bankfin-btn-primary"
                            href={buildWhatsappCollectionUrl(row)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Cobrar no WhatsApp"
                          >
                            <MessageCircle size={14} />
                            Cobrar
                          </a>
                        ) : null}

                        <div
                          className="bankfin-menu-anchor"
                          ref={openMenuId === row.id ? menuRef : undefined}
                        >
                          <button
                            type="button"
                            className="bankfin-btn-icon"
                            aria-label={`Mais ações para ${row.customerDisplayName}`}
                            aria-expanded={openMenuId === row.id}
                            onClick={() => setOpenMenuId(openMenuId === row.id ? null : row.id)}
                          >
                            <MoreHorizontal size={17} />
                          </button>

                          {openMenuId === row.id ? (
                            <div className="bankfin-menu" role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setDetailRow(row);
                                }}
                              >
                                <PanelRightOpen size={15} />
                                Ver detalhes
                              </button>
                              {row.customerId ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setEditingRow(row);
                                  }}
                                >
                                  <Pencil size={15} />
                                  Editar limite e prazo
                                </button>
                              ) : null}
                              {row.customerId ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    navigate(`/clientes/financeiro/${row.customerId}`);
                                  }}
                                >
                                  <ExternalLink size={15} />
                                  Abrir dossiê financeiro
                                </button>
                              ) : null}
                              {row.customerId ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    navigate(`/clientes/${row.customerId}`);
                                  }}
                                >
                                  <User size={15} />
                                  Abrir ficha do cliente
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CustomerCreditDrawer
        row={detailRow}
        onClose={() => setDetailRow(null)}
        onEdit={(row) => {
          setDetailRow(null);
          setEditingRow(row);
        }}
        chargeUrl={buildWhatsappCollectionUrl}
      />

      <EditCustomerCreditModal
        row={editingRow}
        isOpen={Boolean(editingRow)}
        onClose={() => setEditingRow(null)}
      />
    </>
  );
}
