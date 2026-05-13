import type {
  CustomerCreditDetailResponse,
  CustomerCreditOverviewResponse,
  CustomerCreditRow,
} from "@olist-crm/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CustomerCreditLedgerSections } from "../components/CustomerCreditLedgerTables";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import {
  formatCurrency,
  calculateDaysSince,
  formatDate,
  formatDateTime,
  formatDaysSince,
  formatNumber,
} from "../lib/format";
import {
  customerCreditHeadlineClassName,
  customerCreditHeadlineLabel,
  customerCreditPrimaryLabel,
  customerCreditRiskClassName,
  customerCreditRiskLabel,
  customerCreditVisibleFlags,
} from "../lib/customerCredit";

interface CustomerFinancialPageViewProps {
  overview: CustomerCreditOverviewResponse | null;
  detail: CustomerCreditDetailResponse | null;
  selectedCustomerId: string | null;
  search: string;
  isOverviewLoading: boolean;
  isOverviewError: boolean;
  isDetailLoading: boolean;
  isDetailError: boolean;
  canRefreshCredit: boolean;
  isRefreshing: boolean;
  refreshError: boolean;
  onSearchChange: (value: string) => void;
  onSelectCustomer: (customerId: string) => void;
  onRefresh: () => void;
}

function filterCreditRows(rows: CustomerCreditRow[], search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter((row) => {
    const haystack = [
      row.customerDisplayName,
      row.sourceDisplayName,
      row.customerCode,
      row.observation,
      row.flags.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  });
}

function usagePercent(row: CustomerCreditRow) {
  if (row.creditLimit <= 0) return null;
  return Math.min((row.debtAmount / row.creditLimit) * 100, 100);
}

function customerAmountLabel(row: CustomerCreditRow) {
  if (row.debtAmount > 0) return `Devendo ${formatCurrency(row.debtAmount)}`;
  if (row.creditBalanceAmount > 0) return `Saldo ${formatCurrency(row.creditBalanceAmount)}`;
  if (row.availableCreditAmount > 0) return `Livre ${formatCurrency(row.availableCreditAmount)}`;
  return "Sem saldo aberto";
}

function customerFinancialPrimaryLabel(row: CustomerCreditRow) {
  if (row.debtAmount > 0) return "Saldo devedor";
  if (row.creditBalanceAmount > 0) return "Saldo a favor";
  return customerCreditPrimaryLabel(row);
}

function CustomerSelector({
  rows,
  selectedCustomerId,
  onSelectCustomer,
}: {
  rows: CustomerCreditRow[];
  selectedCustomerId: string | null;
  onSelectCustomer: (customerId: string) => void;
}) {
  if (!rows.length) {
    return <div className="customer-financial-empty">Nenhum cliente encontrado nesse filtro.</div>;
  }

  return (
    <div className="customer-financial-list">
      {rows.map((row) => {
        const isSelected = Boolean(row.customerId && row.customerId === selectedCustomerId);

        return (
          <button
            key={row.id}
            type="button"
            className={`customer-financial-list-item ${isSelected ? "active" : ""}`}
            onClick={() => {
              if (row.customerId) {
                onSelectCustomer(row.customerId);
              }
            }}
            disabled={!row.customerId}
          >
            <span>
              <strong>{row.customerDisplayName}</strong>
              <small>{row.customerCode || "Sem codigo"}</small>
            </span>
            <span className={row.debtAmount > 0 ? "amount-danger" : "amount-neutral"}>
              {customerAmountLabel(row)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FinancialMetric({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "neutral" | "danger" | "success" | "warning";
}) {
  return (
    <div className={`customer-financial-metric tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  );
}

export function CustomerFinancialPageView({
  overview,
  detail,
  selectedCustomerId,
  search,
  isOverviewLoading,
  isOverviewError,
  isDetailLoading,
  isDetailError,
  canRefreshCredit,
  isRefreshing,
  refreshError,
  onSearchChange,
  onSelectCustomer,
  onRefresh,
}: CustomerFinancialPageViewProps) {
  const linkedRows = overview?.linkedRows ?? [];
  const filteredRows = useMemo(() => filterCreditRows(linkedRows, search), [linkedRows, search]);
  const selectedRow = linkedRows.find((row) => row.customerId === selectedCustomerId) ?? null;
  const creditRow = detail?.row ?? selectedRow;
  const orders = detail?.orders ?? [];
  const payments = detail?.payments ?? [];
  const snapshot = detail?.snapshot ?? overview?.snapshot ?? null;
  const orderTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const usage = creditRow ? usagePercent(creditRow) : null;
  const daysSinceLastPayment =
    creditRow?.daysSinceLastPayment ?? calculateDaysSince(creditRow?.lastPaymentDate ?? null);

  return (
    <div className="page-stack customer-financial-page">
      <section className="panel customer-financial-command-panel">
        <div className="panel-header customer-financial-header">
          <div>
            <p className="eyebrow">Clientes / Financeiro</p>
            <h2 className="premium-header-title">Financeiro por cliente</h2>
            <p className="panel-subcopy">
              Selecione um cliente vinculado ao saldo diario para ver resumo, pedidos e pagamentos do snapshot.
            </p>
          </div>

          <div className="customer-financial-snapshot">
            <strong>{snapshot?.sourceFileName ?? "Sem snapshot financeiro"}</strong>
            <span>
              {snapshot
                ? `Arquivo ${formatDateTime(snapshot.sourceFileUpdatedAt)} | Importado ${formatDateTime(snapshot.importedAt)}`
                : "Atualize o financeiro para carregar os saldos."}
            </span>
            {canRefreshCredit ? (
              <button type="button" className="ghost-button small" onClick={onRefresh} disabled={isRefreshing}>
                <RefreshCw size={14} />
                {isRefreshing ? "Atualizando..." : "Atualizar agora"}
              </button>
            ) : null}
          </div>
        </div>
        {refreshError ? <div className="inline-error">Nao foi possivel atualizar o arquivo agora.</div> : null}
      </section>

      <div className="customer-financial-workspace">
        <aside className="panel customer-financial-selector-panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Selecao</p>
              <h3>Clientes com financeiro</h3>
            </div>
          </div>

          <label className="customer-financial-search">
            <span>Buscar cliente</span>
            <div className="search-input-wrapper">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Nome, codigo ou observacao"
              />
            </div>
          </label>

          {isOverviewLoading ? <div className="page-loading">Carregando clientes...</div> : null}
          {isOverviewError ? <div className="page-error">Falha ao carregar o snapshot financeiro.</div> : null}
          {!isOverviewLoading && !isOverviewError ? (
            <>
              <div className="customer-financial-list-meta">
                {formatNumber(filteredRows.length)} de {formatNumber(linkedRows.length)} clientes
              </div>
              <CustomerSelector
                rows={filteredRows}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={onSelectCustomer}
              />
            </>
          ) : null}
        </aside>

        <section className="customer-financial-detail-stack">
          {!selectedCustomerId || !creditRow ? (
            <div className="panel customer-financial-empty-detail">
              <h3>Selecione um cliente</h3>
              <p className="panel-subcopy">O resumo financeiro aparece aqui com saldo, limite, pedidos e pagamentos.</p>
            </div>
          ) : (
            <>
              <section className="panel customer-financial-summary-panel">
                <div className="panel-header customer-financial-selected-header">
                  <div>
                    <p className="eyebrow">{creditRow.customerCode}</p>
                    <h3>{creditRow.customerDisplayName}</h3>
                    <p className="panel-subcopy">
                      {creditRow.observation || "Sem observacao relevante nesse snapshot."}
                    </p>
                  </div>
                  <div className="customer-financial-selected-actions">
                    <span className={`tag credit-badge ${customerCreditHeadlineClassName(creditRow)}`}>
                      {customerCreditHeadlineLabel(creditRow)}
                    </span>
                    <span className={`tag credit-badge ${customerCreditRiskClassName(creditRow.riskLevel)}`}>
                      {customerCreditRiskLabel(creditRow.riskLevel)}
                    </span>
                    <Link className="ghost-button small" to={`/clientes/${creditRow.customerId}`}>
                      <ExternalLink size={14} />
                      Abrir ficha
                    </Link>
                  </div>
                </div>

                <div className="customer-financial-metric-grid">
                  <FinancialMetric
                    label={customerFinancialPrimaryLabel(creditRow)}
                    value={formatCurrency(creditRow.debtAmount > 0 ? creditRow.debtAmount : creditRow.creditBalanceAmount)}
                    tone={creditRow.debtAmount > 0 ? "danger" : creditRow.creditBalanceAmount > 0 ? "success" : "neutral"}
                  />
                  <FinancialMetric label="Credito liberado" value={formatCurrency(creditRow.creditLimit)} />
                  <FinancialMetric
                    label="Disponivel"
                    value={formatCurrency(creditRow.availableCreditAmount)}
                    tone={creditRow.availableCreditAmount < 0 ? "danger" : "success"}
                  />
                  <FinancialMetric
                    label="Uso do limite"
                    value={usage === null ? "Sem limite" : `${usage.toFixed(0)}%`}
                    helper={creditRow.paymentTerm ? `Prazo ${creditRow.paymentTerm} dias` : undefined}
                  />
                  <FinancialMetric label="Ultimo pedido" value={formatDate(creditRow.lastOrderDate)} helper={formatDaysSince(creditRow.daysSinceLastOrder)} />
                  <FinancialMetric label="Ultimo pagamento" value={formatDate(creditRow.lastPaymentDate)} helper={formatDaysSince(daysSinceLastPayment)} />
                  <FinancialMetric label="Pedidos no snapshot" value={formatNumber(orders.length)} helper={formatCurrency(orderTotal)} />
                  <FinancialMetric label="Pagamentos no snapshot" value={formatNumber(payments.length)} helper={formatCurrency(paymentTotal)} />
                </div>

                <div className="customer-financial-flags">
                  <span className="label-block-title">Flags de atencao</span>
                  <div className="tag-row">
                    {customerCreditVisibleFlags(creditRow).length ? (
                      customerCreditVisibleFlags(creditRow).map((flag) => (
                        <span key={flag} className="tag customer-credit-flag">
                          {flag}
                        </span>
                      ))
                    ) : (
                      <span className="muted-copy">Sem flags adicionais.</span>
                    )}
                  </div>
                </div>
              </section>

              {isDetailLoading ? <div className="page-loading">Carregando historico financeiro...</div> : null}
              {isDetailError ? <div className="page-error">Falha ao carregar o historico desse cliente.</div> : null}
              {!isDetailLoading && !isDetailError ? (
                <CustomerCreditLedgerSections orders={orders} payments={payments} />
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function CustomerFinancialPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const canRefreshCredit = user?.role === "ADMIN" || user?.role === "MANAGER";

  const overviewQuery = useQuery({
    queryKey: ["customer-credit-overview"],
    queryFn: () => api.customerCreditOverview(token!),
    enabled: Boolean(token),
  });

  const linkedRows = overviewQuery.data?.linkedRows ?? [];

  useEffect(() => {
    if (!linkedRows.length) {
      setSelectedCustomerId(null);
      return;
    }

    if (!selectedCustomerId || !linkedRows.some((row) => row.customerId === selectedCustomerId)) {
      setSelectedCustomerId(linkedRows.find((row) => row.customerId)?.customerId ?? null);
    }
  }, [linkedRows, selectedCustomerId]);

  const detailQuery = useQuery({
    queryKey: ["customer-credit-detail", selectedCustomerId],
    queryFn: () => api.customerCreditDetail(token!, selectedCustomerId!),
    enabled: Boolean(token && selectedCustomerId),
  });

  const refreshCreditMutation = useMutation({
    mutationFn: () => api.refreshCustomerCreditOverview(token!),
    onSuccess: (payload) => {
      queryClient.setQueryData(["customer-credit-overview"], payload);
      void queryClient.invalidateQueries({ queryKey: ["customer-credit-detail"] });
    },
  });

  return (
    <CustomerFinancialPageView
      overview={overviewQuery.data ?? null}
      detail={detailQuery.data ?? null}
      selectedCustomerId={selectedCustomerId}
      search={search}
      isOverviewLoading={overviewQuery.isLoading}
      isOverviewError={overviewQuery.isError}
      isDetailLoading={detailQuery.isLoading}
      isDetailError={detailQuery.isError}
      canRefreshCredit={canRefreshCredit}
      isRefreshing={refreshCreditMutation.isPending}
      refreshError={refreshCreditMutation.isError}
      onSearchChange={setSearch}
      onSelectCustomer={setSelectedCustomerId}
      onRefresh={() => refreshCreditMutation.mutate()}
    />
  );
}
