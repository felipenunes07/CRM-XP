import type { CustomerCreditRow } from "@olist-crm/shared";
import { useMemo, useReducer } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDateTime, formatNumber } from "../lib/format";
import { isOverdueCreditRow } from "../lib/customerCredit";
import { CustomerCreditCardList } from "../components/CustomerCreditCardList";
import { CustomerDocInsightsTable } from "../components/CustomerDocInsightsTable";
import { CustomerCreditTable } from "../components/CustomerCreditTable";
import { CustomerTable } from "../components/CustomerTable";
import { StatCard } from "../components/StatCard";
import {
  buildCustomersQueryParams,
  type CustomerCreditFilters,
  type CustomerPortfolioSortBy,
  createInitialCustomersPageState,
  customersPageReducer,
} from "./customersPage.helpers";

const viewTabs = [
  {
    value: "portfolio" as const,
    label: "Carteira",
    helper: "Busca, filtros e priorizacao da carteira comercial.",
    title: "Procure, filtre e priorize sua carteira",
  },
  {
    value: "docInsights" as const,
    label: "Insights DOC",
    helper: "Ranking global de quem mais compra DOC de Carga.",
    title: "Insights de compra de DOC de Carga",
  },
  {
    value: "creditPayment" as const,
    label: "Credito & Pagamento",
    helper: "Leitura diaria de saldo, credito liberado e risco financeiro da carteira.",
    title: "Credito e pagamento da carteira",
  },
];

function applyCreditFilters(rows: CustomerCreditRow[], filters: CustomerCreditFilters) {
  const search = filters.search.trim().toLowerCase();

  return rows.filter((row) => {
    if (search) {
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

      if (!haystack.includes(search)) {
        return false;
      }
    }

    if (filters.riskLevel && row.riskLevel !== filters.riskLevel) {
      return false;
    }

    if (filters.operationalState && row.operationalState !== filters.operationalState) {
      return false;
    }

    if (filters.onlyWithCredit === "true" && row.creditLimit <= 0) {
      return false;
    }

    if (filters.onlyUnusedCredit === "true" && row.operationalState !== "UNUSED_CREDIT") {
      return false;
    }

    if (filters.onlyOverdue === "true" && !isOverdueCreditRow(row)) {
      return false;
    }

    return true;
  });
}

function buildCreditSections(rows: CustomerCreditRow[]) {
  return [
    {
      key: "charge-now",
      title: "Cobranca imediata",
      helper: "Acima do limite, sem credito ou com atraso relevante.",
      rows: rows.filter((row) => row.hasOverCredit || row.hasDebtWithoutCredit || isOverdueCreditRow(row)),
    },
    {
      key: "within-limit",
      title: "Devendo dentro do limite",
      helper: "Clientes que estao usando credito, mas ainda cabem no limite liberado.",
      rows: rows.filter(
        (row) => row.debtAmount > 0 && row.withinCreditLimit && !row.hasOverCredit && !row.hasDebtWithoutCredit,
      ),
    },
    {
      key: "upsell",
      title: "Credito livre para vender",
      helper: "Carteira com limite liberado e sem saldo em aberto agora.",
      rows: rows.filter((row) => row.operationalState === "UNUSED_CREDIT"),
    },
    {
      key: "positive-balance",
      title: "Saldo a favor",
      helper: "Clientes com saldo positivo registrado no resumo financeiro.",
      rows: rows.filter((row) => row.operationalState === "HAS_CREDIT_BALANCE"),
    },
    {
      key: "settled",
      title: "Sem pendencia",
      helper: "Clientes zerados no snapshot atual.",
      rows: rows.filter((row) => row.operationalState === "SETTLED"),
    },
  ];
}

export function CustomersPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(customersPageReducer, undefined, createInitialCustomersPageState);
  const customerQueryParams = buildCustomersQueryParams(state.portfolioFilters);
  const activeTab = viewTabs.find((tab) => tab.value === state.activeView) ?? viewTabs[0]!;
  const canRefreshCredit = user?.role === "ADMIN" || user?.role === "MANAGER";

  const labelsQuery = useQuery({
    queryKey: ["customer-labels"],
    queryFn: () => api.customerLabels(token!),
    enabled: Boolean(token),
  });

  const customersQuery = useQuery({
    queryKey: ["customers", customerQueryParams],
    queryFn: () => api.customers(token!, customerQueryParams),
    enabled: Boolean(token && state.activeView === "portfolio"),
  });

  const docInsightsQuery = useQuery({
    queryKey: ["customer-doc-insights"],
    queryFn: () => api.customerDocInsights(token!),
    enabled: Boolean(token && state.activeView === "docInsights"),
  });

  const creditOverviewQuery = useQuery({
    queryKey: ["customer-credit-overview"],
    queryFn: () => api.customerCreditOverview(token!),
    enabled: Boolean(token && state.activeView === "creditPayment"),
  });

  const refreshCreditMutation = useMutation({
    mutationFn: () => api.refreshCustomerCreditOverview(token!),
    onSuccess: (payload) => {
      queryClient.setQueryData(["customer-credit-overview"], payload);
      void queryClient.invalidateQueries({ queryKey: ["customer-credit-detail"] });
    },
  });

  const filteredLinkedCreditRows = useMemo(
    () => applyCreditFilters(creditOverviewQuery.data?.linkedRows ?? [], state.creditFilters),
    [creditOverviewQuery.data?.linkedRows, state.creditFilters],
  );
  const filteredUnmatchedCreditRows = useMemo(
    () => applyCreditFilters(creditOverviewQuery.data?.unmatchedRows ?? [], state.creditFilters),
    [creditOverviewQuery.data?.unmatchedRows, state.creditFilters],
  );
  const creditSections = useMemo(() => buildCreditSections(filteredLinkedCreditRows), [filteredLinkedCreditRows]);
  const filteredCreditBalanceCustomers = useMemo(
    () => filteredLinkedCreditRows.filter((row) => row.creditBalanceAmount > 0).length,
    [filteredLinkedCreditRows],
  );
  const filteredAvailableCreditAmount = useMemo(
    () => filteredLinkedCreditRows.reduce((sum, row) => sum + row.availableCreditAmount, 0),
    [filteredLinkedCreditRows],
  );

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Clientes</p>
            <h2>{activeTab.title}</h2>
          </div>

          <div className="chart-switcher customers-view-switcher" role="tablist" aria-label="Alternar visao da pagina de clientes">
            {viewTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                title={tab.helper}
                aria-selected={state.activeView === tab.value}
                aria-pressed={state.activeView === tab.value}
                className={`chart-switch-button ${state.activeView === tab.value ? "active" : ""}`}
                onClick={() => dispatch({ type: "setView", view: tab.value })}
              >
                <strong>{tab.label}</strong>
              </button>
            ))}
          </div>
        </div>

        {state.activeView === "portfolio" ? (
          <div className="filters-grid filters-grid-six">
            <label>
              Buscar
              <input
                value={state.portfolioFilters.search}
                onChange={(event) =>
                  dispatch({ type: "updatePortfolioFilter", key: "search", value: event.target.value })
                }
                placeholder="Nome ou codigo"
              />
            </label>

            <label>
              Status
              <select
                value={state.portfolioFilters.status}
                onChange={(event) =>
                  dispatch({ type: "updatePortfolioFilter", key: "status", value: event.target.value })
                }
              >
                <option value="">Todos</option>
                <option value="ACTIVE">Ativos</option>
                <option value="ATTENTION">Atencao</option>
                <option value="INACTIVE">Inativos</option>
              </select>
            </label>

            <label>
              Ordenar por
              <select
                value={state.portfolioFilters.sortBy}
                onChange={(event) =>
                  dispatch({
                    type: "updatePortfolioFilter",
                    key: "sortBy",
                    value: event.target.value as CustomerPortfolioSortBy,
                  })
                }
              >
                <option value="priority">Prioridade</option>
                <option value="faturamento">Faturamento</option>
                <option value="recencia">Recencia</option>
              </select>
            </label>

            <label>
              Com rotulo
              <select
                value={state.portfolioFilters.label}
                onChange={(event) =>
                  dispatch({ type: "updatePortfolioFilter", key: "label", value: event.target.value })
                }
              >
                <option value="">Todos</option>
                {labelsQuery.data?.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Excluir rotulo
              <select
                value={state.portfolioFilters.excludeLabel}
                onChange={(event) =>
                  dispatch({ type: "updatePortfolioFilter", key: "excludeLabel", value: event.target.value })
                }
              >
                <option value="">Nenhum</option>
                {labelsQuery.data?.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Embaixadores
              <select
                value={state.portfolioFilters.ambassadorOnly}
                onChange={(event) =>
                  dispatch({ type: "updatePortfolioFilter", key: "ambassadorOnly", value: event.target.value })
                }
              >
                <option value="">Todos</option>
                <option value="true">So embaixadores</option>
              </select>
            </label>
          </div>
        ) : state.activeView === "docInsights" ? (
          <p className="panel-subcopy customers-doc-subcopy">
            Ranking global no historico total da base, considerando como DOC os itens cuja descricao contenha{" "}
            <code>DOC DE CARGA</code>.
          </p>
        ) : (
          <div className="filters-grid filters-grid-six">
            <label>
              Buscar
              <input
                value={state.creditFilters.search}
                onChange={(event) =>
                  dispatch({ type: "updateCreditFilter", key: "search", value: event.target.value })
                }
                placeholder="Nome, codigo, observacao ou flag"
              />
            </label>

            <label>
              Grau de risco
              <select
                value={state.creditFilters.riskLevel}
                onChange={(event) =>
                  dispatch({ type: "updateCreditFilter", key: "riskLevel", value: event.target.value })
                }
              >
                <option value="">Todos</option>
                <option value="CRITICO">Critico</option>
                <option value="ATENCAO">Atencao</option>
                <option value="MONITORAR">Monitorar</option>
                <option value="OK">OK</option>
              </select>
            </label>

            <label>
              Situacao
              <select
                value={state.creditFilters.operationalState}
                onChange={(event) =>
                  dispatch({ type: "updateCreditFilter", key: "operationalState", value: event.target.value })
                }
              >
                <option value="">Todas</option>
                <option value="OWES">Devendo</option>
                <option value="OVER_CREDIT">Ultrapassou credito</option>
                <option value="UNUSED_CREDIT">Credito sem uso</option>
                <option value="HAS_CREDIT_BALANCE">Saldo a favor</option>
                <option value="SETTLED">Quitado</option>
              </select>
            </label>

            <label>
              Com credito
              <select
                value={state.creditFilters.onlyWithCredit}
                onChange={(event) =>
                  dispatch({ type: "updateCreditFilter", key: "onlyWithCredit", value: event.target.value })
                }
              >
                <option value="">Todos</option>
                <option value="true">So com credito</option>
              </select>
            </label>

            <label>
              Credito sem uso
              <select
                value={state.creditFilters.onlyUnusedCredit}
                onChange={(event) =>
                  dispatch({ type: "updateCreditFilter", key: "onlyUnusedCredit", value: event.target.value })
                }
              >
                <option value="">Todos</option>
                <option value="true">So oportunidades</option>
              </select>
            </label>

            <label>
              Somente vencidos
              <select
                value={state.creditFilters.onlyOverdue}
                onChange={(event) =>
                  dispatch({ type: "updateCreditFilter", key: "onlyOverdue", value: event.target.value })
                }
              >
                <option value="">Todos</option>
                <option value="true">So vencidos</option>
              </select>
            </label>
          </div>
        )}
      </section>

      {state.activeView === "portfolio" ? (
        <>
          {customersQuery.isLoading ? <div className="page-loading">Carregando clientes...</div> : null}
          {customersQuery.isError ? <div className="page-error">Falha ao carregar a carteira.</div> : null}
          {customersQuery.data ? <CustomerTable customers={customersQuery.data} /> : null}
        </>
      ) : state.activeView === "docInsights" ? (
        <>
          {docInsightsQuery.isLoading ? <div className="page-loading">Carregando insights de DOC...</div> : null}
          {docInsightsQuery.isError ? <div className="page-error">Falha ao carregar os insights de DOC.</div> : null}
          {docInsightsQuery.data ? (
            <>
              <section className="stats-grid customers-doc-stats">
                <StatCard
                  title="Clientes com DOC"
                  value={formatNumber(docInsightsQuery.data.summary.customersWithDoc)}
                  helper="Clientes que ja compraram DOC ao menos uma vez"
                  tone="success"
                />
                <StatCard
                  title="Pedidos com DOC"
                  value={formatNumber(docInsightsQuery.data.summary.docOrders)}
                  helper="Pedidos distintos contendo DOC no historico"
                />
                <StatCard
                  title="Pecas de DOC"
                  value={formatNumber(docInsightsQuery.data.summary.docQuantity)}
                  helper="Quantidade total de unidades vendidas"
                  tone="warning"
                />
                <StatCard
                  title="Faturamento DOC"
                  value={formatCurrency(docInsightsQuery.data.summary.docRevenue)}
                  helper="Receita acumulada dessa familia"
                />
              </section>

              <section className="panel customers-doc-intro">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Ranking DOC</p>
                    <h3>Quem mais compra DOC de Carga</h3>
                  </div>
                </div>
                <p className="panel-subcopy">
                  Ordenacao fixa por pecas de DOC, depois quantidade de pedidos com DOC, faturamento e nome do cliente.
                </p>
              </section>

              <CustomerDocInsightsTable ranking={docInsightsQuery.data.ranking} />
            </>
          ) : null}
        </>
      ) : (
        <>
          {creditOverviewQuery.isLoading ? <div className="page-loading">Carregando credito e pagamento...</div> : null}
          {creditOverviewQuery.isError ? <div className="page-error">Falha ao carregar o snapshot financeiro.</div> : null}
          {creditOverviewQuery.data ? (
            <>
              <section className="panel customer-credit-workspace">
                <div className="customer-credit-topbar">
                  <div>
                    <p className="eyebrow">Operacao financeira</p>
                    <h3>Credito, cobranca e oportunidade de venda</h3>
                    <p className="panel-subcopy">
                      Agora o saldo em aberto respeita o limite liberado. Se a divida estiver dentro do credito, o cliente
                      aparece como dentro do limite, nao como ultrapassado.
                    </p>
                  </div>

                  <div className="customer-credit-topbar-actions">
                    <div className="customer-credit-meta-chip">
                      <strong>{creditOverviewQuery.data.snapshot?.sourceFileName ?? "Sem snapshot"}</strong>
                      <span>
                        {creditOverviewQuery.data.snapshot
                          ? `${formatNumber(creditOverviewQuery.data.snapshot.matchedRows)} vinculados | ${formatNumber(creditOverviewQuery.data.snapshot.unmatchedRows)} nao vinculados`
                          : "Sem dados carregados"}
                      </span>
                      {creditOverviewQuery.data.snapshot ? (
                        <small>
                          Arquivo {formatDateTime(creditOverviewQuery.data.snapshot.sourceFileUpdatedAt)} | Importado{" "}
                          {formatDateTime(creditOverviewQuery.data.snapshot.importedAt)}
                        </small>
                      ) : null}
                    </div>

                    <div className="chart-switcher customers-credit-layout-switcher" role="tablist" aria-label="Alternar leitura da aba de credito">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={state.creditPresentation === "cards"}
                        className={`chart-switch-button ${state.creditPresentation === "cards" ? "active" : ""}`}
                        onClick={() => dispatch({ type: "setCreditPresentation", value: "cards" })}
                      >
                        <strong>Cards</strong>
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={state.creditPresentation === "table"}
                        className={`chart-switch-button ${state.creditPresentation === "table" ? "active" : ""}`}
                        onClick={() => dispatch({ type: "setCreditPresentation", value: "table" })}
                      >
                        <strong>Tabela</strong>
                      </button>
                    </div>

                    {canRefreshCredit ? (
                      <button
                        type="button"
                        className="ghost-button small"
                        onClick={() => refreshCreditMutation.mutate()}
                        disabled={refreshCreditMutation.isPending}
                      >
                        {refreshCreditMutation.isPending ? "Atualizando..." : "Atualizar agora"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {refreshCreditMutation.isError ? (
                  <span className="inline-error">Nao foi possivel atualizar o arquivo agora.</span>
                ) : null}

                <div className="customer-credit-kpi-strip">
                  <article className="customer-credit-kpi tone-warning">
                    <span>Em aberto</span>
                    <strong>{formatCurrency(creditOverviewQuery.data.summary.totalDebtAmount)}</strong>
                    <small>{formatNumber(creditOverviewQuery.data.summary.customersOwing)} clientes com divida</small>
                  </article>
                  <article className="customer-credit-kpi tone-success">
                    <span>Saldo a favor</span>
                    <strong>{formatCurrency(creditOverviewQuery.data.summary.totalCreditBalanceAmount)}</strong>
                    <small>{formatNumber(filteredCreditBalanceCustomers)} clientes com saldo positivo</small>
                  </article>
                  <article className="customer-credit-kpi tone-info">
                    <span>Credito livre</span>
                    <strong>{formatCurrency(filteredAvailableCreditAmount)}</strong>
                    <small>{formatNumber(creditOverviewQuery.data.summary.customersWithUnusedCredit)} clientes para empurrar venda</small>
                  </article>
                  <article className="customer-credit-kpi tone-danger">
                    <span>Acima do limite</span>
                    <strong>{formatNumber(creditOverviewQuery.data.summary.customersOverCredit)}</strong>
                    <small>{formatNumber(creditOverviewQuery.data.summary.customersOverdue)} com atraso ou sem pagamento</small>
                  </article>
                </div>

                <div className="customer-credit-result-meta">
                  <p>
                    Exibindo {formatNumber(filteredLinkedCreditRows.length)} de{" "}
                    {formatNumber(creditOverviewQuery.data.summary.totalLinkedCustomers)} clientes vinculados.
                  </p>
                  <p>Os codigos nao vinculados continuam abaixo para revisao, sem poluir a operacao principal.</p>
                </div>
              </section>

              {state.creditPresentation === "cards" ? (
                filteredLinkedCreditRows.length ? (
                  <div className="customer-credit-sections">
                    {creditSections
                      .filter((section) => section.rows.length > 0)
                      .map((section) => (
                        <section key={section.key} className="panel customer-credit-section">
                          <div className="panel-header">
                            <div>
                              <h3>
                                {section.title}{" "}
                                <span className="customer-credit-section-count">{formatNumber(section.rows.length)}</span>
                              </h3>
                              <p className="panel-subcopy">{section.helper}</p>
                            </div>
                          </div>
                          <CustomerCreditCardList rows={section.rows} emptyMessage="Nenhum cliente nessa faixa." />
                        </section>
                      ))}
                  </div>
                ) : (
                  <div className="panel empty-panel">
                    <div className="empty-state">Nenhum cliente vinculado ao CRM bate com esse filtro.</div>
                  </div>
                )
              ) : (
                <CustomerCreditTable
                  rows={filteredLinkedCreditRows}
                  emptyMessage="Nenhum cliente vinculado ao CRM bate com esse filtro."
                />
              )}

              <details className="panel customer-credit-unmatched-panel">
                <summary>
                  Nao vinculados ao CRM ({formatNumber(filteredUnmatchedCreditRows.length)}/
                  {formatNumber(creditOverviewQuery.data.summary.totalUnmatchedRows)})
                </summary>
                <p className="panel-subcopy">
                  Esses codigos existem no Excel diario, mas ainda nao encontraram correspondencia pelo{" "}
                  <code>customer_code</code> do CRM. Eles ficam visiveis para revisao sem poluir a operacao principal.
                </p>
                <CustomerCreditTable
                  rows={filteredUnmatchedCreditRows}
                  linkedOnly={false}
                  emptyMessage="Nenhum codigo nao vinculado bate com esse filtro."
                />
              </details>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
