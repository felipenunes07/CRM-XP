import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Eye, Send } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api, type BillingAlertReport, type BillingCustomerResult } from "../lib/api";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import "./customerBillingAlerts.css";

type BillingGroupKey = "overLimit" | "overCredit" | "overdue" | "nearLimit" | "missingPaymentTerm";

const GROUPS: Array<{ key: BillingGroupKey; label: string; tone: string; hint: string }> = [
  { key: "overLimit", label: "Estourou o limite", tone: "danger", hint: "Deve mais que o crédito e o crédito interno." },
  { key: "overCredit", label: "Acima do crédito", tone: "warning", hint: "Passou do crédito, mas ainda dentro do crédito interno." },
  { key: "overdue", label: "Prazo vencido", tone: "danger", hint: "Pedidos com saldo em aberto depois de data do pedido + prazo. Os pagamentos abatem os pedidos mais antigos." },
  { key: "nearLimit", label: "Perto do limite", tone: "attention", hint: "Usando 80% ou mais do crédito. Avisar antes do próximo pedido." },
  { key: "missingPaymentTerm", label: "Sem prazo", tone: "neutral", hint: "Devendo sem PRAZO na coluna I do RESUMO — não entram na cobrança por prazo até preencher." },
];

function limitText(customer: BillingCustomerResult) {
  const parts: string[] = [];
  if (customer.creditLimit) parts.push(`Crédito ${formatCurrency(customer.creditLimit)}`);
  if (customer.internalCreditLimit) parts.push(`Interno ${formatCurrency(customer.internalCreditLimit)}`);
  return parts.join(" · ") || "Sem limite";
}

function BillingRow({
  group,
  customer,
  onSelectCustomer,
}: {
  group: BillingGroupKey;
  customer: BillingCustomerResult;
  onSelectCustomer: (customerId: string) => void;
}) {
  const overdueOrders = customer.pendingOrders.filter((order) => order.overdue);
  const oldest = overdueOrders[0];
  const usage = customer.limitUsage === null ? null : Math.round(customer.limitUsage * 100);

  return (
    <tr>
      <td>
        {customer.customerId ? (
          <button type="button" className="billing-link" onClick={() => onSelectCustomer(customer.customerId!)}>
            <strong>{customer.customerCode}</strong> {customer.displayName}
          </button>
        ) : (
          <span>
            <strong>{customer.customerCode}</strong> {customer.displayName}
          </span>
        )}
        {customer.status ? <span className="billing-status">{customer.status}</span> : null}
      </td>
      <td className="is-right is-money">{formatCurrency(customer.debtAmount)}</td>
      {group === "overdue" ? (
        <>
          <td className="is-right is-money">{formatCurrency(customer.overdueAmount)}</td>
          <td>
            {customer.oldestOverdueDays} dia(s) · {formatNumber(overdueOrders.length)} pedido(s)
            {oldest ? (
              <span className="billing-sub">
                Mais antigo: {oldest.orderNumber || "s/ nº"} de {formatDate(oldest.orderDate)}, venceu {formatDate(oldest.dueDate)}
                {oldest.pendingAmount < oldest.totalAmount ? ` (falta ${formatCurrency(oldest.pendingAmount)})` : ""}
              </span>
            ) : null}
          </td>
          <td>{customer.paymentTerm} dias</td>
        </>
      ) : group === "missingPaymentTerm" ? (
        <>
          <td>{limitText(customer)}</td>
          <td>{formatNumber(customer.pendingOrders.length)} pedido(s) em aberto</td>
        </>
      ) : (
        <>
          <td className="is-right">{usage === null ? "—" : `${usage}%`}</td>
          <td>{limitText(customer)}</td>
          <td>{customer.hasOverdue ? `Vencido ${formatCurrency(customer.overdueAmount)}` : "Em dia"}</td>
        </>
      )}
    </tr>
  );
}

export function CustomerBillingAlertsView({
  report,
  isLoading,
  isError,
  canSend,
  preview,
  isPreviewing,
  isSending,
  sendResult,
  onPreview,
  onSend,
  onSelectCustomer,
}: {
  report: BillingAlertReport | null;
  isLoading: boolean;
  isError: boolean;
  canSend: boolean;
  preview: string[] | null;
  isPreviewing: boolean;
  isSending: boolean;
  sendResult: string | null;
  onPreview: () => void;
  onSend: () => void;
  onSelectCustomer: (customerId: string) => void;
}) {
  const [activeGroup, setActiveGroup] = useState<BillingGroupKey>("overLimit");

  if (isLoading) return <div className="page-loading">Calculando cobrança...</div>;
  if (isError) return <div className="page-error">Falha ao calcular a cobrança.</div>;
  if (!report) return null;

  const group = GROUPS.find((entry) => entry.key === activeGroup)!;
  const rows = report[activeGroup];

  return (
    <section className="panel billing-alerts-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Cobrança · {formatDate(report.today)}</p>
          <h3>
            <AlertTriangle size={18} /> Quem cobrar hoje
          </h3>
          <p className="panel-subcopy">
            Mesmo relatório que vai para o grupo do financeiro às 9h. Durante o dia, novos alertas são enviados assim que a
            planilha de saldo é atualizada.
          </p>
        </div>
        <div className="billing-actions">
          <button type="button" className="ghost-button small" onClick={onPreview} disabled={isPreviewing}>
            <Eye size={14} />
            {isPreviewing ? "Montando..." : "Ver mensagem"}
          </button>
          {canSend ? (
            <button type="button" className="primary-button small" onClick={onSend} disabled={isSending}>
              <Send size={14} />
              {isSending ? "Enviando..." : "Enviar agora ao grupo"}
            </button>
          ) : null}
        </div>
      </div>

      {sendResult ? <div className="billing-send-result">{sendResult}</div> : null}

      <div className="billing-chip-row" role="tablist">
        {GROUPS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={entry.key === activeGroup}
            className={`billing-chip ${entry.tone} ${entry.key === activeGroup ? "active" : ""}`}
            onClick={() => setActiveGroup(entry.key)}
          >
            <strong>{formatNumber(report[entry.key].length)}</strong>
            {entry.label}
          </button>
        ))}
      </div>

      <p className="billing-hint">{group.hint}</p>

      {rows.length ? (
        <div className="billing-table-wrap">
          <table className="billing-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="is-right">Deve</th>
                {activeGroup === "overdue" ? (
                  <>
                    <th className="is-right">Vencido</th>
                    <th>Atraso</th>
                    <th>Prazo</th>
                  </>
                ) : activeGroup === "missingPaymentTerm" ? (
                  <>
                    <th>Limite</th>
                    <th>Pedidos</th>
                  </>
                ) : (
                  <>
                    <th className="is-right">Uso</th>
                    <th>Limite</th>
                    <th>Prazo</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <BillingRow
                  key={customer.customerCode}
                  group={activeGroup}
                  customer={customer}
                  onSelectCustomer={onSelectCustomer}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="billing-empty">Nenhum cliente nessa situação.</div>
      )}

      {report.unmatchedEntries?.length ? (
        <div className="billing-unmatched">
          <strong>
            {formatNumber(report.unmatchedEntries.length)} lançamento(s) recente(s) com código que não existe no RESUMO
          </strong>
          <span>Não contam para nenhum cliente — nem aqui nem na planilha. Corrigir o COD na aba OUT/PAG.</span>
          <ul>
            {report.unmatchedEntries.map((entry) => (
              <li key={`${entry.source}-${entry.entryKey}`}>
                {entry.source === "PAG" ? "Pagamento" : "Pedido"} <strong>{entry.customerCode}</strong> de{" "}
                {formatDate(entry.entryDate)}
                {entry.reference ? ` (${entry.reference})` : ""}: {formatCurrency(entry.amount)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview ? (
        <div className="billing-preview">
          <span className="label-block-title">Mensagem para o grupo ({preview.length} parte(s))</span>
          {preview.map((message, index) => (
            <pre key={index}>{message}</pre>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function CustomerBillingAlertsPanel({ onSelectCustomer }: { onSelectCustomer: (customerId: string) => void }) {
  const { token, user } = useAuth();
  const canSend = user?.role === "ADMIN" || Boolean(user?.permissions?.includes("finance.manage"));
  const [preview, setPreview] = useState<string[] | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const reportQuery = useQuery({
    queryKey: ["customer-billing-alerts"],
    queryFn: () => api.customerBillingAlerts(token!),
    enabled: Boolean(token),
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  const previewMutation = useMutation({
    mutationFn: () => api.previewCustomerBillingAlerts(token!),
    onSuccess: (payload) => setPreview(payload.messages),
  });

  const sendMutation = useMutation({
    mutationFn: () => api.sendCustomerBillingAlerts(token!),
    onSuccess: (payload) =>
      setSendResult(
        payload.sent
          ? `Enviado ao grupo do financeiro (${payload.messages} mensagem(ns)).`
          : `Não enviado: ${payload.reason ?? "motivo desconhecido"}.`,
      ),
    onError: () => setSendResult("Falha ao enviar para o grupo."),
  });

  return (
    <CustomerBillingAlertsView
      report={reportQuery.data?.report ?? null}
      isLoading={reportQuery.isLoading}
      isError={reportQuery.isError}
      canSend={canSend}
      preview={preview}
      isPreviewing={previewMutation.isPending}
      isSending={sendMutation.isPending}
      sendResult={sendResult}
      onPreview={() => previewMutation.mutate()}
      onSend={() => {
        if (window.confirm("Enviar agora o relatório de cobrança para o grupo do financeiro?")) {
          sendMutation.mutate();
        }
      }}
      onSelectCustomer={onSelectCustomer}
    />
  );
}
