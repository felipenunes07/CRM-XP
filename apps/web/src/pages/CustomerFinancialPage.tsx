import type {
  CustomerCreditDetailResponse,
  CustomerCreditOverviewResponse,
  CustomerCreditRow,
} from "@olist-crm/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Pencil, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CustomerBillingAlertsPanel } from "../components/CustomerBillingAlertsPanel";
import { EditCustomerCreditModal } from "../components/EditCustomerCreditModal";
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
  customerFinancialCategory,
  customerCreditHeadlineClassName,
  customerCreditHeadlineLabel,
  customerCreditPrimaryLabel,
  customerCreditVisibleFlags,
} from "../lib/customerCredit";
import { exportCustomerFinancialWorkbook } from "../lib/customerFinancialExport";

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
  showBillingAlerts?: boolean;
  /** Abre a edicao de credito/prazo (so para quem tem "Gestao financeira"). */
  onEditCredit?: (row: CustomerCreditRow) => void;
}

const NO_SELLER_FILTER = "__NO_SELLER__";

function filterCreditRows(rows: CustomerCreditRow[], search: string, seller: string, category: string) {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    const rowCategory = customerFinancialCategory(row);
    if (seller === NO_SELLER_FILTER && row.assignedSeller) return false;
    if (seller && seller !== NO_SELLER_FILTER && row.assignedSeller !== seller) return false;
    if (category && rowCategory.label !== category) return false;
    if (!needle) return true;

    const haystack = [
      row.customerDisplayName,
      row.sourceDisplayName,
      row.customerCode,
      row.assignedSeller,
      row.lastOrderSeller,
      rowCategory.label,
      rowCategory.action,
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
  return "Sem crédito";
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
              <small>
                {row.customerCode || "Sem codigo"} · {row.assignedSeller || "Não atribuída"}
              </small>
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
  showBillingAlerts = false,
  onEditCredit,
}: CustomerFinancialPageViewProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [sellerFilter, setSellerFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const linkedRows = overview?.linkedRows ?? [];
  const sellers = useMemo(
    () => [...new Set(linkedRows.map((row) => row.assignedSeller).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "pt-BR")),
    [linkedRows],
  );
  const categories = useMemo(
    () => [...new Set(linkedRows.map((row) => customerFinancialCategory(row).label))].sort((left, right) => left.localeCompare(right, "pt-BR")),
    [linkedRows],
  );
  const filteredRows = useMemo(
    () => filterCreditRows(linkedRows, search, sellerFilter, categoryFilter),
    [linkedRows, search, sellerFilter, categoryFilter],
  );
  const selectedRow = linkedRows.find((row) => row.customerId === selectedCustomerId) ?? null;
  const creditRow = detail?.row ?? selectedRow;
  const orders = detail?.orders ?? [];
  // Venda mais recente da aba OUT (vem ordenada da mais nova) e quem fez.
  const lastSale = orders.find((order) => order.orderDate && order.totalAmount > 0) ?? null;
  const lastSaleSeller = lastSale?.seller && lastSale.seller.toLowerCase() !== "resumo" ? lastSale.seller : null;
  const payments = detail?.payments ?? [];
  const snapshot = detail?.snapshot ?? overview?.snapshot ?? null;
  const orderTotal = orders.reduce((sum, order) => sum + order.totalAmount, 0);
  const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const usage = creditRow ? usagePercent(creditRow) : null;
  const daysSinceLastPayment =
    creditRow?.daysSinceLastPayment ?? calculateDaysSince(creditRow?.lastPaymentDate ?? null);

  const handleExport = async () => {
    if (isExporting || !filteredRows.length) return;

    setIsExporting(true);
    setExportError(false);
    try {
      await exportCustomerFinancialWorkbook({ rows: filteredRows, snapshot, search });
    } catch (error) {
      console.error("Falha ao exportar o financeiro para Excel:", error);
      setExportError(true);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="page-stack customer-financial-page bankfin">
      <section className="panel customer-financial-command-panel">
        <div className="panel-header customer-financial-header">
          <div>
            <p className="eyebrow">Clientes / Financeiro</p>
            <h2 className="premium-header-title">Financeiro por cliente</h2>
            <p className="panel-subcopy">
              Todos os clientes cadastrados aparecem aqui, inclusive os que ainda não possuem crédito informado.
            </p>
          </div>

          <div className="customer-financial-snapshot">
            <strong>{snapshot?.sourceFileName ?? "Sem snapshot financeiro"}</strong>
            <span>
              {snapshot
                ? `Arquivo ${formatDateTime(snapshot.sourceFileUpdatedAt)} | Importado ${formatDateTime(snapshot.importedAt)}`
                : "Atualize o financeiro para carregar os saldos."}
            </span>
            <div className="customer-financial-snapshot-actions">
              <button
                type="button"
                className="primary-button small"
                onClick={() => void handleExport()}
                disabled={isExporting || isOverviewLoading || !filteredRows.length}
                title={`Exportar ${formatNumber(filteredRows.length)} cliente(s) do filtro atual`}
              >
                <Download size={14} />
                {isExporting ? "Gerando Excel..." : "Exportar Excel"}
              </button>
              {canRefreshCredit ? (
                <button type="button" className="ghost-button small" onClick={onRefresh} disabled={isRefreshing}>
                  <RefreshCw size={14} />
                  {isRefreshing ? "Atualizando..." : "Atualizar agora"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {refreshError ? <div className="inline-error">Nao foi possivel atualizar o arquivo agora.</div> : null}
        {exportError ? <div className="inline-error">Nao foi possivel gerar o Excel. Tente novamente.</div> : null}
      </section>

      {showBillingAlerts ? <CustomerBillingAlertsPanel onSelectCustomer={onSelectCustomer} /> : null}

      <div className="customer-financial-workspace">
        <aside className="panel customer-financial-selector-panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Selecao</p>
              <h3>Todos os clientes</h3>
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

          <div className="customer-financial-filter-grid">
            <label>
              Vendedora responsável
              <select value={sellerFilter} onChange={(event) => setSellerFilter(event.target.value)}>
                <option value="">Todas</option>
                {sellers.map((seller) => (
                  <option key={seller} value={seller}>{seller}</option>
                ))}
                <option value={NO_SELLER_FILTER}>Não atribuída</option>
              </select>
            </label>
            <label>
              Categoria financeira
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">Todas</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
          </div>

          {isOverviewLoading ? <div className="page-loading">Carregando clientes...</div> : null}
          {isOverviewError ? <div className="page-error">Falha ao carregar o snapshot financeiro.</div> : null}
          {!isOverviewLoading && !isOverviewError ? (
            <>
              <div className="customer-financial-list-meta">
                {formatNumber(filteredRows.length)} de {formatNumber(linkedRows.length)} clientes cadastrados
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
                    <span className={`tag credit-badge ${customerFinancialCategory(creditRow).className}`}>
                      {customerFinancialCategory(creditRow).label}
                    </span>
                    {onEditCredit ? (
                      <button type="button" className="primary-button small" onClick={() => onEditCredit(creditRow)}>
                        <Pencil size={14} />
                        Editar crédito
                      </button>
                    ) : null}
                    <Link className="ghost-button small" to={`/clientes/financeiro/${creditRow.customerId}`}>
                      <ExternalLink size={14} />
                      Abrir dossiê financeiro
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
                  <FinancialMetric
                    label="Última venda"
                    value={formatDate(lastSale?.orderDate ?? creditRow.lastOrderDate)}
                    helper={
                      lastSale
                        ? [lastSaleSeller ? `por ${lastSaleSeller}` : null, formatDaysSince(calculateDaysSince(lastSale.orderDate))].filter(Boolean).join(" · ")
                        : [creditRow.lastOrderSeller ? `por ${creditRow.lastOrderSeller}` : null, formatDaysSince(creditRow.daysSinceLastOrder)].filter(Boolean).join(" · ")
                    }
                  />
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
                <CustomerCreditLedgerSections
                  orders={orders}
                  payments={payments}
                  totalOrders={detail?.totalOrders ?? orders.length}
                  totalPayments={detail?.totalPayments ?? payments.length}
                  debtAmount={creditRow.debtAmount}
                  paymentTerm={creditRow.paymentTerm}
                />
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
  const canEditCredit = user?.role === "ADMIN" || Boolean(user?.permissions?.includes("finance.manage"));
  const [editingCreditRow, setEditingCreditRow] = useState<CustomerCreditRow | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["customer-credit-overview"],
    queryFn: () => api.customerCreditOverview(token!),
    enabled: Boolean(token),
    // A visao agrega a planilha financeira inteira. Ela ja e invalidada apos
    // importacoes/edicoes e possui o botao "Atualizar agora"; polling a cada
    // 30 segundos multiplicava a mesma consulta para cada usuario com a tela aberta.
    staleTime: 5 * 60_000,
    refetchInterval: false,
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
    <>
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
      showBillingAlerts
      onEditCredit={canEditCredit ? setEditingCreditRow : undefined}
    />
    <EditCustomerCreditModal
      row={editingCreditRow}
      isOpen={Boolean(editingCreditRow)}
      onClose={() => setEditingCreditRow(null)}
    />
    </>
  );
}
