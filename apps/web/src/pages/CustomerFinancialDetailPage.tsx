import type {
  CustomerCreditDetailResponse,
  CustomerCreditRow,
  CustomerCreditSettingsUpdate,
} from "@olist-crm/shared";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, PencilLine, Save, TriangleAlert, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { CustomerCreditBalanceChart } from "../components/CustomerCreditBalanceChart";
import { CustomerCreditLedgerSections } from "../components/CustomerCreditLedgerTables";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import {
  estimateCustomerPaymentBehavior,
  getCustomerCreditDeadline,
  getCustomerFinancialAssessment,
  customerCreditRiskLabel,
  customerCreditVisibleFlags,
} from "../lib/customerCredit";
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from "../lib/format";
import "../components/customerCreditBank.css";
import "../components/customerCreditDossie.css";

interface CustomerFinancialDetailPageViewProps {
  detail: CustomerCreditDetailResponse | null;
  isLoading: boolean;
  isError: boolean;
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  canEditSettings?: boolean;
  isSavingSettings?: boolean;
  settingsSaved?: boolean;
  settingsError?: boolean;
  onUpdateSettings?: (input: CustomerCreditSettingsUpdate) => Promise<void>;
}

function deadlineHeadline(row: CustomerCreditRow) {
  const deadline = getCustomerCreditDeadline(row);
  if (deadline.status === "settled") return "Sem saldo em aberto";
  if (deadline.status === "unknown") return "Sem prazo cadastrado";
  if (deadline.status === "overdue") return `${deadline.overdueDays} dias em atraso`;
  if (deadline.daysRemaining === 0) return "Vence hoje";
  return `Vence em ${deadline.daysRemaining} dias`;
}

/** Edição de limite e prazo: fica escondida até a gestão pedir para editar. */
function CreditSettingsEditor({
  row,
  isSaving,
  isSaved,
  hasError,
  onClose,
  onSave,
}: {
  row: CustomerCreditRow;
  isSaving: boolean;
  isSaved: boolean;
  hasError: boolean;
  onClose: () => void;
  onSave?: (input: CustomerCreditSettingsUpdate) => Promise<void>;
}) {
  const [creditLimit, setCreditLimit] = useState(String(row.creditLimit));
  const [paymentTerm, setPaymentTerm] = useState(row.paymentTerm ? String(row.paymentTerm) : "");

  const parsedCreditLimit = creditLimit.trim() === "" ? null : Number(creditLimit);
  const parsedPaymentTerm = paymentTerm.trim() === "" ? null : Number(paymentTerm);
  const creditLimitChanged =
    parsedCreditLimit === null
      ? row.creditLimitSource === "MANUAL"
      : Number.isFinite(parsedCreditLimit) && parsedCreditLimit !== row.creditLimit;
  const paymentTermChanged =
    (parsedPaymentTerm === null && row.paymentTermSource === "MANUAL") ||
    (Number.isFinite(parsedPaymentTerm) && parsedPaymentTerm !== row.paymentTerm);
  const isValid =
    (parsedCreditLimit === null || (Number.isFinite(parsedCreditLimit) && parsedCreditLimit >= 0)) &&
    (parsedPaymentTerm === null ||
      (Number.isInteger(parsedPaymentTerm) && parsedPaymentTerm >= 1 && parsedPaymentTerm <= 365));
  const hasChanges = creditLimitChanged || paymentTermChanged;

  async function saveChanges() {
    if (!onSave || !hasChanges || !isValid) return;
    const input: CustomerCreditSettingsUpdate = {};
    if (creditLimitChanged) input.creditLimit = parsedCreditLimit;
    if (paymentTermChanged) input.paymentTerm = parsedPaymentTerm;
    try {
      await onSave(input);
      onClose();
    } catch {
      // O estado de erro da mutation apresenta a falha sem gerar rejeição solta na interface.
    }
  }

  return (
    <section className="bankfin-editor" aria-label="Ajustes manuais de crédito">
      <div className="bankfin-field">
        <label htmlFor="dossie-limit">Limite aprovado</label>
        <div className="bankfin-input-wrap">
          <span className="bankfin-input-prefix">R$</span>
          <input
            id="dossie-limit"
            className="has-prefix"
            type="number"
            min="0"
            step="100"
            value={creditLimit}
            onChange={(event) => setCreditLimit(event.target.value)}
            disabled={isSaving}
          />
        </div>
        <small>Atual: {formatCurrency(row.creditLimit)}</small>
      </div>

      <div className="bankfin-field">
        <label htmlFor="dossie-term">Prazo para pagamento (dias)</label>
        <input
          id="dossie-term"
          type="number"
          min="1"
          max="365"
          step="1"
          value={paymentTerm}
          onChange={(event) => setPaymentTerm(event.target.value)}
          disabled={isSaving}
        />
        <small>Atual: {row.paymentTerm ? `${row.paymentTerm} dias` : "sem prazo"}</small>
      </div>

      <div className="bankfin-editor-actions">
        <button type="button" className="bankfin-btn-ghost" onClick={onClose} disabled={isSaving}>
          Cancelar
        </button>
        <button
          type="button"
          className="bankfin-btn-primary"
          disabled={!hasChanges || !isValid || isSaving}
          onClick={() => void saveChanges()}
        >
          <Save size={15} />
          {isSaving ? "Salvando..." : "Salvar alteração"}
        </button>
      </div>

      <p className={`bankfin-editor-msg ${hasError ? "is-error" : isSaved ? "is-ok" : ""}`}>
        {hasError
          ? "Não foi possível salvar."
          : isSaved
            ? "Alteração salva."
            : "Deixe o campo vazio para voltar ao valor da planilha."}
      </p>
    </section>
  );
}

export function CustomerFinancialDetailPageView({
  detail,
  isLoading,
  isError,
  canLoadMore = false,
  isLoadingMore = false,
  onLoadMore,
  canEditSettings = false,
  isSavingSettings = false,
  settingsSaved = false,
  settingsError = false,
  onUpdateSettings,
}: CustomerFinancialDetailPageViewProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) {
    return <div className="page-loading">Carregando dossiê financeiro...</div>;
  }

  if (isError) {
    return (
      <div className="page-error">Não foi possível carregar os pagamentos e pedidos deste cliente.</div>
    );
  }

  if (!detail?.row) {
    return (
      <div className="page-stack bankfin bankfin-dossie">
        <Link className="bankfin-back" to="/clientes?view=creditPayment">
          <ArrowLeft size={16} />
          Voltar para Crédito e pagamentos
        </Link>
        <div className="panel empty-state">Cliente sem registro no snapshot financeiro atual.</div>
      </div>
    );
  }

  const row = detail.row;
  const deadline = getCustomerCreditDeadline(row);
  const behavior = estimateCustomerPaymentBehavior(detail.orders, detail.payments, row.paymentTerm);
  const assessment = getCustomerFinancialAssessment(row, behavior);
  const flags = customerCreditVisibleFlags(row);
  const usagePercent = row.creditLimit > 0 ? (row.debtAmount / row.creditLimit) * 100 : null;
  const dueTone =
    deadline.status === "overdue" ? "danger" : deadline.status === "due_soon" ? "warning" : "success";

  return (
    <div className="page-stack bankfin bankfin-dossie">
      <div className="bankfin-dossie-top">
        <Link className="bankfin-back" to="/clientes?view=creditPayment">
          <ArrowLeft size={16} />
          Crédito e pagamentos
        </Link>
        <span>
          {detail.snapshot
            ? `${detail.snapshot.sourceFileName} · atualizado ${formatDateTime(detail.snapshot.importedAt)}`
            : "Sem identificação do snapshot"}
        </span>
      </div>

      <section className="bankfin-dossie-id">
        <div>
          <h2>{row.customerDisplayName}</h2>
          <p>
            <i className={`bankfin-dot ${(row.riskLevel || "NORMAL").toLowerCase()}`} />
            {row.customerCode} · Risco {customerCreditRiskLabel(row.riskLevel)}
          </p>
        </div>
        <div className="bankfin-dossie-open">
          <span>Em aberto</span>
          <strong style={{ color: row.debtAmount > 0 ? "var(--bf-danger)" : "var(--bf-success)" }}>
            {formatCurrency(row.debtAmount)}
          </strong>
        </div>
      </section>

      <section className="bankfin-strip" aria-label="Resumo de crédito do cliente">
        <div className={`bankfin-strip-cell tone-${dueTone}`}>
          <span>Vencimento</span>
          <strong>{deadline.dueDate ? formatDate(deadline.dueDate) : "—"}</strong>
          <small>{deadlineHeadline(row)}</small>
        </div>
        <div className="bankfin-strip-cell">
          <span>Limite aprovado</span>
          <strong>{formatCurrency(row.creditLimit)}</strong>
          <small>
            {usagePercent === null ? "sem limite definido" : `${Math.round(usagePercent)}% utilizado`}
          </small>
        </div>
        <div className={`bankfin-strip-cell ${row.availableCreditAmount < 0 ? "tone-danger" : "tone-success"}`}>
          <span>Crédito disponível</span>
          <strong>{formatCurrency(row.availableCreditAmount)}</strong>
          <small>{row.availableCreditAmount < 0 ? "acima do limite" : "livre para novas vendas"}</small>
        </div>
        <div className="bankfin-strip-cell">
          <span>Prazo</span>
          <strong>{row.paymentTerm ? `${row.paymentTerm} dias` : "—"}</strong>
          <small>
            {row.creditLimitSource === "MANUAL" || row.paymentTermSource === "MANUAL"
              ? "ajustado pela gestão"
              : "vindo da planilha"}
          </small>
        </div>
        <div className="bankfin-strip-action">
          {canEditSettings ? (
            <button
              type="button"
              className="bankfin-btn-ghost"
              aria-expanded={isEditing}
              onClick={() => setIsEditing((current) => !current)}
            >
              {isEditing ? <X size={15} /> : <PencilLine size={15} />}
              {isEditing ? "Fechar" : "Editar limite e prazo"}
            </button>
          ) : (
            <small style={{ color: "var(--bf-muted)", fontSize: "0.75rem" }}>
              Só gestores editam limite.
            </small>
          )}
        </div>
      </section>

      {isEditing ? (
        <CreditSettingsEditor
          key={`${row.customerId}-${row.creditLimit}-${row.paymentTerm}`}
          row={row}
          isSaving={isSavingSettings}
          isSaved={settingsSaved}
          hasError={settingsError}
          onClose={() => setIsEditing(false)}
          onSave={onUpdateSettings}
        />
      ) : null}

      {assessment.tone === "danger" || assessment.tone === "warning" ? (
        <div className={`bankfin-alert tone-${assessment.tone}`}>
          <TriangleAlert size={17} />
          <span>
            <strong>{assessment.label}.</strong> {assessment.summary}
          </span>
        </div>
      ) : null}

      <CustomerCreditBalanceChart
        orders={detail.orders}
        payments={detail.payments}
        currentDebt={row.debtAmount}
        creditLimit={row.creditLimit}
      />

      {/* As duas tabelas são o centro da página */}
      <CustomerCreditLedgerSections
        orders={detail.orders}
        payments={detail.payments}
        totalOrders={detail.totalOrders}
        totalPayments={detail.totalPayments}
      />

      {canLoadMore ? (
        <div className="bankfin-ledger-foot">
          <button type="button" className="bankfin-btn-ghost" onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Carregando..." : "Carregar mais movimentos"}
          </button>
          <span>Mostramos primeiro os movimentos mais recentes.</span>
        </div>
      ) : null}

      <details className="bankfin-more">
        <summary>
          <ChevronDown size={15} />
          Mais detalhes do cliente
        </summary>
        <div className="bankfin-more-body">
          <div>
            <span>Tempo médio para pagar</span>
            <strong>{behavior.averageDays === null ? "sem base" : `${behavior.averageDays} dias`}</strong>
          </div>
          <div>
            <span>Pagamentos no prazo</span>
            <strong>{behavior.onTimeRate === null ? "sem base" : formatPercent(behavior.onTimeRate)}</strong>
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
            <span>Total de pedidos no snapshot</span>
            <strong>{formatNumber(detail.totalOrders)}</strong>
          </div>
          <div>
            <span>Observação da planilha</span>
            <strong>{row.observation || "Nenhuma"}</strong>
          </div>
          <div>
            <span>Sinais de atenção</span>
            {flags.length ? (
              <div className="bankfin-more-flags">
                {flags.map((flag) => (
                  <span key={flag} className="bankfin-flag">
                    {flag}
                  </span>
                ))}
              </div>
            ) : (
              <strong>Nenhum</strong>
            )}
          </div>
          {row.manualOverrideUpdatedAt ? (
            <div>
              <span>Último ajuste manual</span>
              <strong>
                {formatDate(row.manualOverrideUpdatedAt)}
                {row.manualOverrideUpdatedByName ? ` · ${row.manualOverrideUpdatedByName}` : ""}
              </strong>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

export function CustomerFinancialDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useInfiniteQuery({
    queryKey: ["customer-credit-detail", id],
    initialPageParam: { ordersOffset: 0, paymentsOffset: 0 },
    queryFn: ({ pageParam }) =>
      api.customerCreditDetail(token!, id!, {
        ...pageParam,
        pageSize: 100,
      }),
    enabled: Boolean(token && id),
    getNextPageParam: (lastPage, pages) => {
      const loadedOrders = pages.reduce((sum, page) => sum + page.orders.length, 0);
      const loadedPayments = pages.reduce((sum, page) => sum + page.payments.length, 0);
      if (loadedOrders >= lastPage.totalOrders && loadedPayments >= lastPage.totalPayments) {
        return undefined;
      }

      return {
        ordersOffset: loadedOrders,
        paymentsOffset: loadedPayments,
      };
    },
  });

  const detail = useMemo(() => {
    const pages = detailQuery.data?.pages;
    const firstPage = pages?.[0];
    if (!firstPage) {
      return null;
    }

    return {
      ...firstPage,
      orders: pages.flatMap((page) => page.orders),
      payments: pages.flatMap((page) => page.payments),
    };
  }, [detailQuery.data?.pages]);

  const settingsMutation = useMutation({
    mutationFn: (input: CustomerCreditSettingsUpdate) =>
      api.updateCustomerCreditSettings(token!, id!, input),
    onSuccess: async (payload) => {
      queryClient.setQueryData(["customer-credit-detail", id], {
        pages: [payload],
        pageParams: [{ ordersOffset: 0, paymentsOffset: 0 }],
      });
      await queryClient.invalidateQueries({ queryKey: ["customer-credit-overview"] });
    },
  });

  return (
    <CustomerFinancialDetailPageView
      detail={detail}
      isLoading={detailQuery.isLoading}
      isError={detailQuery.isError}
      canLoadMore={detailQuery.hasNextPage}
      isLoadingMore={detailQuery.isFetchingNextPage}
      onLoadMore={() => void detailQuery.fetchNextPage()}
      canEditSettings={user?.role === "ADMIN" || user?.role === "MANAGER"}
      isSavingSettings={settingsMutation.isPending}
      settingsSaved={settingsMutation.isSuccess}
      settingsError={settingsMutation.isError}
      onUpdateSettings={async (input) => {
        await settingsMutation.mutateAsync(input);
      }}
    />
  );
}
