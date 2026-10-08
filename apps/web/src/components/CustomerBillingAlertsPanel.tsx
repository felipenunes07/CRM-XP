import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Eye, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api, type BillingAlertReport, type BillingCustomerResult } from "../lib/api";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";
import "./customerBillingAlerts.css";

type BillingGroupKey = "overLimit" | "overCredit" | "overdue" | "noCredit" | "nearLimit" | "missingPaymentTerm";

const GROUPS: Array<{ key: BillingGroupKey; label: string; tone: string; hint: string }> = [
  { key: "overLimit", label: "Estourou o limite", tone: "danger", hint: "Deve mais que o crédito e o crédito interno." },
  { key: "overCredit", label: "Acima do crédito", tone: "warning", hint: "Passou do crédito, mas ainda dentro do crédito interno." },
  { key: "overdue", label: "Prazo vencido", tone: "danger", hint: "Pedidos com saldo em aberto depois de data do pedido + prazo. Os pagamentos abatem os pedidos mais antigos." },
  { key: "noCredit", label: "Sem crédito", tone: "warning", hint: "Devendo sem nenhum crédito liberado na planilha (CREDITO e CREDITO INTERNO vazios), qualquer valor (do maior para o menor). Cobrar o valor todo; próximo pedido só com pagamento." },
  { key: "nearLimit", label: "Perto do limite", tone: "attention", hint: "Usando 80% ou mais do crédito. Avisar antes do próximo pedido." },
  {
    key: "missingPaymentTerm",
    label: "Sem prazo e sem crédito",
    tone: "neutral",
    hint: "Devendo sem PRAZO e sem nenhum crédito liberado — é necessário preencher as duas informações.",
  },
];

export function billingRowsForGroup(report: BillingAlertReport, key: BillingGroupKey) {
  const rows = report[key] ?? [];
  return key === "missingPaymentTerm"
    ? rows.filter((customer) => customer.limitLevel === "NO_LIMIT")
    : rows;
}

function limitText(customer: BillingCustomerResult) {
  const parts: string[] = [];
  if (customer.creditLimit) parts.push(`Crédito ${formatCurrency(customer.creditLimit)}`);
  if (customer.internalCreditLimit) parts.push(`Interno ${formatCurrency(customer.internalCreditLimit)}`);
  return parts.join(" · ") || "Sem limite";
}

export type BillingSort = "amount" | "recentSale";
export type BillingSalePeriod = "all" | "7" | "30";

export interface BillingRowFilters {
  sort: BillingSort;
  seller: string;
  period: BillingSalePeriod;
  today: string;
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * Filtra por vendedora da ultima venda e por quao recente ela foi, e ordena por
 * valor (padrao do relatorio) ou pela venda mais recente — para ver quem esta
 * liberando venda agora para cliente sem credito / acima do limite.
 */
export function filterAndSortBillingRows(rows: BillingCustomerResult[], filters: BillingRowFilters) {
  const filtered = rows.filter((customer) => {
    const sale = customer.lastSale;
    if (filters.seller && (sale?.seller ?? "") !== filters.seller) return false;
    if (filters.period !== "all") {
      if (!sale?.orderDate) return false;
      if (daysBetween(sale.orderDate, filters.today) > Number(filters.period)) return false;
    }
    return true;
  });
  if (filters.sort === "recentSale") {
    return [...filtered].sort((left, right) =>
      String(right.lastSale?.orderDate ?? "").localeCompare(String(left.lastSale?.orderDate ?? "")),
    );
  }
  return filtered;
}

function LastSaleCell({ customer }: { customer: BillingCustomerResult }) {
  const sale = customer.lastSale;
  if (!sale?.orderDate) return <td className="billing-last-sale">—</td>;
  return (
    <td className="billing-last-sale">
      <strong>{formatDate(sale.orderDate)}</strong> {sale.seller ? <span className="billing-seller">{sale.seller}</span> : null}
      <span className="billing-sub">
        Pedido {sale.orderNumber || "s/ nº"} · {formatCurrency(sale.totalAmount)}
      </span>
    </td>
  );
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
          <td>
            {customer.hasOverdue
              ? `Vencido ${formatCurrency(customer.overdueAmount)}`
              : group === "noCredit"
                ? "Cobrar o valor todo"
                : "Em dia"}
          </td>
        </>
      )}
      <LastSaleCell customer={customer} />
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
  const [sort, setSort] = useState<BillingSort>("amount");
  const [sellerFilter, setSellerFilter] = useState("");
  const [period, setPeriod] = useState<BillingSalePeriod>("all");

  const sellers = useMemo(() => {
    if (!report) return [];
    const names = new Set<string>();
    for (const entry of GROUPS) {
      for (const customer of billingRowsForGroup(report, entry.key)) {
        if (customer.lastSale?.seller) names.add(customer.lastSale.seller);
      }
    }
    return [...names].sort((left, right) => left.localeCompare(right, "pt-BR"));
  }, [report]);

  if (isLoading) return <div className="page-loading">Calculando cobrança...</div>;
  if (isError) return <div className="page-error">Falha ao calcular a cobrança.</div>;
  if (!report) return null;

  const group = GROUPS.find((entry) => entry.key === activeGroup)!;
  const allRows = billingRowsForGroup(report, activeGroup);
  const rows = filterAndSortBillingRows(allRows, { sort, seller: sellerFilter, period, today: report.today });
  const isFiltered = Boolean(sellerFilter) || period !== "all";

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
            <strong>{formatNumber(billingRowsForGroup(report, entry.key).length)}</strong>
            {entry.label}
          </button>
        ))}
      </div>

      <p className="billing-hint">{group.hint}</p>

      <div className="billing-filters">
        <label>
          Ordenar
          <select value={sort} onChange={(event) => setSort(event.target.value as BillingSort)}>
            <option value="amount">Maior valor</option>
            <option value="recentSale">Venda mais recente</option>
          </select>
        </label>
        <label>
          Quem vendeu
          <select value={sellerFilter} onChange={(event) => setSellerFilter(event.target.value)}>
            <option value="">Todas</option>
            {sellers.map((seller) => (
              <option key={seller} value={seller}>
                {seller}
              </option>
            ))}
          </select>
        </label>
        <label>
          Última venda
          <select value={period} onChange={(event) => setPeriod(event.target.value as BillingSalePeriod)}>
            <option value="all">Qualquer data</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
          </select>
        </label>
        {isFiltered ? (
          <span className="billing-filter-count">
            {formatNumber(rows.length)} de {formatNumber(allRows.length)} clientes
          </span>
        ) : null}
      </div>

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
                <th>Última venda</th>
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
        <div className="billing-empty">
          {isFiltered ? "Nenhum cliente com esse filtro." : "Nenhum cliente nessa situação."}
        </div>
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
