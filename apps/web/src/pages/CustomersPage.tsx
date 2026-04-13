import { useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
import { CustomerDocInsightsTable } from "../components/CustomerDocInsightsTable";
import { CustomerTable } from "../components/CustomerTable";
import { StatCard } from "../components/StatCard";
import {
  buildCustomersQueryParams,
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
];

export function CustomersPage() {
  const { token } = useAuth();
  const [state, dispatch] = useReducer(customersPageReducer, undefined, createInitialCustomersPageState);
  const customerQueryParams = buildCustomersQueryParams(state.portfolioFilters);
  const activeTab = viewTabs.find((tab) => tab.value === state.activeView) ?? viewTabs[0]!;

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

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Clientes</p>
            <h2>{activeTab.title}</h2>
          </div>
        </div>

        <div className="chart-switcher customers-view-switcher" role="tablist" aria-label="Alternar visao da pagina de clientes">
          {viewTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={state.activeView === tab.value}
              aria-pressed={state.activeView === tab.value}
              className={`chart-switch-button ${state.activeView === tab.value ? "active" : ""}`}
              onClick={() => dispatch({ type: "setView", view: tab.value })}
            >
              <strong>{tab.label}</strong>
              <span>{tab.helper}</span>
            </button>
          ))}
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
        ) : (
          <p className="panel-subcopy customers-doc-subcopy">
            Ranking global no historico total da base, considerando como DOC os itens cuja descricao contenha{" "}
            <code>DOC DE CARGA</code>.
          </p>
        )}
      </section>

      {state.activeView === "portfolio" ? (
        <>
          {customersQuery.isLoading ? <div className="page-loading">Carregando clientes...</div> : null}
          {customersQuery.isError ? <div className="page-error">Falha ao carregar a carteira.</div> : null}
          {customersQuery.data ? <CustomerTable customers={customersQuery.data} /> : null}
        </>
      ) : (
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
      )}
    </div>
  );
}
