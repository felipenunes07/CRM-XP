import type { CustomerCreditRow } from "@olist-crm/shared";
import { useMemo, useReducer, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeDollarSign, Copy, Download, Repeat, Search, Send, ShieldAlert, SlidersHorizontal, TrendingUp, Users, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDateTime, formatNumber } from "../lib/format";
import { isOverdueCreditRow, creditNeedsCharge } from "../lib/customerCredit";
import { CustomerDocInsightsTable } from "../components/CustomerDocInsightsTable";
import { CustomerCreditTable } from "../components/CustomerCreditTable";
import { CustomerTable } from "../components/CustomerTable";
import { StatCard } from "../components/StatCard";
import { GeographicView } from "../components/GeographicView";
import {
  buildCustomersQueryParams,
  type CreditKpiFilter,
  type CreditQuickFilter,
  type CreditSortBy,
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
  {
    value: "geographic" as const,
    label: "Região",
    helper: "Mapa e volume de vendas por estado e cidade.",
    title: "Visão geográfica da carteira",
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

function applyCreditKpiFilter(rows: CustomerCreditRow[], kpiFilter: CreditKpiFilter) {
  if (!kpiFilter) return rows;

  return rows.filter((row) => {
    switch (kpiFilter) {
      case "owing":
        return row.debtAmount > 0;
      case "credit_balance":
        return row.creditBalanceAmount > 0;
      case "unused_credit":
        return row.operationalState === "UNUSED_CREDIT";
      case "over_credit":
        return row.hasOverCredit;
      default:
        return true;
    }
  });
}

function matchesCreditQuickFilter(row: CustomerCreditRow, quick: CreditQuickFilter) {
  switch (quick) {
    case "to_charge":
      return creditNeedsCharge(row);
    case "overdue":
      return isOverdueCreditRow(row);
    case "opportunity":
      return row.operationalState === "UNUSED_CREDIT";
    case "ontrack":
      return !row.hasOverCredit && !isOverdueCreditRow(row);
    default:
      return true;
  }
}

function applyCreditQuickFilter(rows: CustomerCreditRow[], quick: CreditQuickFilter) {
  if (!quick) return rows;
  return rows.filter((row) => matchesCreditQuickFilter(row, quick));
}

function creditUrgencyScore(row: CustomerCreditRow) {
  if (row.hasOverCredit) return 4;
  if (isOverdueCreditRow(row)) return 3;
  if (row.debtAmount > 0) return 2;
  if (row.operationalState === "UNUSED_CREDIT") return 1;
  return 0;
}

function sortCreditRows(rows: CustomerCreditRow[], sortBy: CreditSortBy) {
  const copy = [...rows];
  switch (sortBy) {
    case "debt_desc":
      return copy.sort((a, b) => b.debtAmount - a.debtAmount);
    case "available_desc":
      return copy.sort((a, b) => (b.availableCreditAmount ?? 0) - (a.availableCreditAmount ?? 0));
    case "name":
      return copy.sort((a, b) => a.customerDisplayName.localeCompare(b.customerDisplayName, "pt-BR"));
    case "urgency":
    default:
      return copy.sort((a, b) => {
        const diff = creditUrgencyScore(b) - creditUrgencyScore(a);
        if (diff !== 0) return diff;
        return b.debtAmount - a.debtAmount;
      });
  }
}

export function CustomersPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(customersPageReducer, undefined, createInitialCustomersPageState);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const customerQueryParams = buildCustomersQueryParams(state.portfolioFilters);
  const activeTab = viewTabs.find((tab) => tab.value === state.activeView) ?? viewTabs[0]!;
  const canRefreshCredit = user?.role === "ADMIN" || user?.role === "MANAGER";

  const [downloadingFiltered, setDownloadingFiltered] = useState(false);

  const getDownloadInfo = () => {
    const status = state.portfolioFilters.status;
    if (status === "ACTIVE") {
      return {
        label: "Baixar Clientes Ativos (CSV)",
        filename: `clientes_ativos_${new Date().toISOString().split("T")[0]}.csv`,
      };
    }
    if (status === "ATTENTION") {
      return {
        label: "Baixar Clientes em Atenção (CSV)",
        filename: `clientes_em_atencao_${new Date().toISOString().split("T")[0]}.csv`,
      };
    }
    if (status === "INACTIVE") {
      return {
        label: "Baixar Clientes Inativos (CSV)",
        filename: `clientes_inativos_${new Date().toISOString().split("T")[0]}.csv`,
      };
    }
    return {
      label: "Baixar Clientes Filtrados (CSV)",
      filename: `carteira_clientes_filtrada_${new Date().toISOString().split("T")[0]}.csv`,
    };
  };

  const { label: downloadButtonLabel, filename: downloadFilename } = getDownloadInfo();

  const downloadFilteredCustomers = async () => {
    if (downloadingFiltered || !token) return;
    setDownloadingFiltered(true);
    try {
      const queryParams = {
        ...customerQueryParams,
        limit: 100000,
      };
      const data = await api.customers(token, queryParams);
      if (!data || data.length === 0) {
        alert("Nenhum cliente encontrado com os filtros atuais para download.");
        return;
      }

      const headers = [
        "Código",
        "Nome",
        "Status",
        "Total de Pedidos",
        "Total Gasto",
        "Ticket Médio",
        "Última Compra",
        "Dias Inativo",
        "Média Dias Entre Pedidos",
        "Rótulos",
        "Estado",
        "Cidade",
        "Prioridade"
      ];

      const csvLines = [
        "\uFEFF" + headers.join(";"),
        ...data.map((row) =>
          [
            row.customerCode || "",
            row.displayName || "",
            row.status === "ACTIVE" ? "Ativo" : row.status === "ATTENTION" ? "Atenção" : "Inativo",
            row.totalOrders || 0,
            row.totalSpent || 0,
            row.avgTicket || 0,
            row.lastPurchaseAt || "",
            row.daysSinceLastPurchase !== null && row.daysSinceLastPurchase !== undefined ? row.daysSinceLastPurchase : "",
            row.avgDaysBetweenOrders !== null && row.avgDaysBetweenOrders !== undefined ? Math.round(row.avgDaysBetweenOrders) : "",
            row.labels.map((l) => l.name).join(", "),
            row.state || "",
            row.city || "",
            row.priorityScore || 0,
          ]
            .map((val) => `"${String(val).replace(/"/g, '""')}"`)
            .join(";")
        ),
      ];

      const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadFilename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Erro ao baixar clientes filtrados:", err);
      alert(`Erro ao exportar clientes: ${err.message || err}`);
    } finally {
      setDownloadingFiltered(false);
    }
  };

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
      
      if (payload.snapshot) {
        const fileName = payload.snapshot.sourceFileName;
        const fileDate = formatDateTime(payload.snapshot.sourceFileUpdatedAt);
        setToastMessage(`Sincronizado com sucesso! Arquivo: ${fileName} (${fileDate})`);
      } else {
        setToastMessage("Sincronização concluída, mas nenhum dado foi retornado.");
      }
    },
  });

  const navigate = useNavigate();
  const [selectedCreditCodes, setSelectedCreditCodes] = useState<Set<string>>(() => new Set());
  const [showCreditFilters, setShowCreditFilters] = useState(false);
  const [audienceModal, setAudienceModal] = useState<{ destination: "dispatch" | "automation"; name: string } | null>(null);

  const activeAdvancedCreditFilters = [
    state.creditFilters.riskLevel,
    state.creditFilters.operationalState,
    state.creditFilters.onlyWithCredit,
    state.creditFilters.onlyUnusedCredit,
    state.creditFilters.onlyOverdue,
  ].filter((value) => value !== "").length;

  const toggleCreditCode = (code: string) => {
    setSelectedCreditCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const createAudienceMutation = useMutation({
    mutationFn: (input: { name: string; codes: string[] }) =>
      api.createSavedSegment(token!, { name: input.name, definition: { customerCodes: input.codes } }),
  });

  const filteredLinkedCreditRows = useMemo(
    () => applyCreditFilters(creditOverviewQuery.data?.linkedRows ?? [], state.creditFilters),
    [creditOverviewQuery.data?.linkedRows, state.creditFilters],
  );
  const filteredUnmatchedCreditRows = useMemo(
    () => applyCreditFilters(creditOverviewQuery.data?.unmatchedRows ?? [], state.creditFilters),
    [creditOverviewQuery.data?.unmatchedRows, state.creditFilters],
  );

  const kpiFilteredRows = useMemo(
    () => applyCreditKpiFilter(filteredLinkedCreditRows, state.creditKpiFilter),
    [filteredLinkedCreditRows, state.creditKpiFilter],
  );

  // Linhas finais exibidas: KPI + atalho de triagem + ordenacao
  const displayedCreditRows = useMemo(
    () => sortCreditRows(applyCreditQuickFilter(kpiFilteredRows, state.creditQuickFilter), state.creditSort),
    [kpiFilteredRows, state.creditQuickFilter, state.creditSort],
  );

  // Contagens dos atalhos de triagem (sobre a base filtrada por busca/avancados)
  const quickFilterCounts = useMemo(
    () => ({
      to_charge: filteredLinkedCreditRows.filter((row) => creditNeedsCharge(row)).length,
      overdue: filteredLinkedCreditRows.filter((row) => isOverdueCreditRow(row)).length,
      opportunity: filteredLinkedCreditRows.filter((row) => row.operationalState === "UNUSED_CREDIT").length,
      ontrack: filteredLinkedCreditRows.filter((row) => !row.hasOverCredit && !isOverdueCreditRow(row)).length,
    }),
    [filteredLinkedCreditRows],
  );

  const filteredDebtAmount = useMemo(
    () => filteredLinkedCreditRows.reduce((sum, row) => sum + row.debtAmount, 0),
    [filteredLinkedCreditRows],
  );
  const filteredDebtCount = useMemo(
    () => filteredLinkedCreditRows.filter((row) => row.debtAmount > 0).length,
    [filteredLinkedCreditRows],
  );

  const filteredCreditBalanceAmount = useMemo(
    () => filteredLinkedCreditRows.reduce((sum, row) => sum + row.creditBalanceAmount, 0),
    [filteredLinkedCreditRows],
  );
  const filteredCreditBalanceCount = useMemo(
    () => filteredLinkedCreditRows.filter((row) => row.creditBalanceAmount > 0).length,
    [filteredLinkedCreditRows],
  );

  const filteredAvailableCreditAmount = useMemo(
    () =>
      filteredLinkedCreditRows
        .filter((row) => row.operationalState === "UNUSED_CREDIT")
        .reduce((sum, row) => sum + Math.max(0, row.availableCreditAmount ?? 0), 0),
    [filteredLinkedCreditRows],
  );
  const filteredUnusedCreditCount = useMemo(
    () => filteredLinkedCreditRows.filter((row) => row.operationalState === "UNUSED_CREDIT").length,
    [filteredLinkedCreditRows],
  );

  const filteredTotalExcessAmount = useMemo(
    () => filteredLinkedCreditRows.reduce((sum, row) => sum + Math.max(0, -(row.availableCreditAmount ?? 0)), 0),
    [filteredLinkedCreditRows],
  );
  const filteredOverCreditCount = useMemo(
    () => filteredLinkedCreditRows.filter((row) => row.operationalState === "OVER_CREDIT" || row.hasOverCredit).length,
    [filteredLinkedCreditRows],
  );
  const filteredOverdueCount = useMemo(
    () => filteredLinkedCreditRows.filter((row) => isOverdueCreditRow(row)).length,
    [filteredLinkedCreditRows],
  );

  // ── Selecao para montar publico de cobranca ──
  const selectedCreditRows = useMemo(
    () => displayedCreditRows.filter((row) => selectedCreditCodes.has(row.customerCode)),
    [displayedCreditRows, selectedCreditCodes],
  );
  const selectedCreditDebt = useMemo(
    () => selectedCreditRows.reduce((sum, row) => sum + Math.max(0, row.debtAmount), 0),
    [selectedCreditRows],
  );

  const toggleAllVisibleCredit = (checked: boolean) => {
    setSelectedCreditCodes((current) => {
      const next = new Set(current);
      for (const row of displayedCreditRows) {
        if (!row.customerId) continue;
        if (checked) {
          next.add(row.customerCode);
        } else {
          next.delete(row.customerCode);
        }
      }
      return next;
    });
  };

  const handleCopyCreditCodes = async () => {
    const codes = selectedCreditRows.map((row) => row.customerCode).join(", ");
    try {
      await navigator.clipboard.writeText(codes);
      setToastMessage(`${formatNumber(selectedCreditRows.length)} codigos copiados.`);
    } catch {
      setToastMessage("Nao foi possivel copiar os codigos.");
    }
  };

  const openAudienceModal = (destination: "dispatch" | "automation") => {
    if (selectedCreditRows.length === 0) {
      return;
    }
    const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const suggested = destination === "automation" ? `Cobranca recorrente ${today}` : `Cobranca ${today}`;
    setAudienceModal({ destination, name: suggested });
  };

  const confirmAudienceModal = async () => {
    if (!audienceModal || !token || selectedCreditRows.length === 0 || createAudienceMutation.isPending) {
      return;
    }
    const { destination } = audienceModal;
    const name = audienceModal.name.trim();
    if (!name) {
      return;
    }
    try {
      const segment = await createAudienceMutation.mutateAsync({
        name,
        codes: selectedCreditRows.map((row) => row.customerCode),
      });
      void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
      setSelectedCreditCodes(new Set());
      setAudienceModal(null);
      navigate(destination === "automation" ? "/automacoes" : "/disparador", {
        state: { savedSegmentId: segment.id, savedSegmentName: segment.name },
      });
    } catch {
      setToastMessage("Nao foi possivel criar o publico agora. Tente novamente.");
    }
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Clientes</p>
            <h2 className="premium-header-title">{activeTab.title}</h2>
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
              Ocultar com rotulo
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
        ) : state.activeView === "geographic" ? (
          <p className="panel-subcopy">
            Mapa com leitura espacial da carteira, ranking por cidade e filtros de estado para aproximar a experiencia do Power BI.
          </p>
        ) : (
          <div className="credit-filter-wrap">
            <div className="credit-filter-bar">
              <div className="credit-search-field">
                <Search size={17} className="credit-search-icon" />
                <input
                  value={state.creditFilters.search}
                  onChange={(event) =>
                    dispatch({ type: "updateCreditFilter", key: "search", value: event.target.value })
                  }
                  placeholder="Buscar por nome, codigo ou observacao..."
                />
              </div>

              <button
                type="button"
                className={`ghost-button credit-filter-toggle ${showCreditFilters ? "active" : ""}`}
                onClick={() => setShowCreditFilters((value) => !value)}
              >
                <SlidersHorizontal size={16} />
                Filtros
                {activeAdvancedCreditFilters > 0 ? (
                  <span className="credit-filter-count">{activeAdvancedCreditFilters}</span>
                ) : null}
              </button>
            </div>

            {showCreditFilters ? (
              <div className="filters-grid credit-advanced-filters">
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
            ) : null}
          </div>
        )}
      </section>

      {state.activeView === "portfolio" ? (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", margin: "1rem 0" }}>
            <button
              type="button"
              className="ghost-button small"
              onClick={downloadFilteredCustomers}
              disabled={downloadingFiltered}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Download size={16} />
              {downloadingFiltered ? "Baixando..." : downloadButtonLabel}
            </button>
          </div>
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
      ) : state.activeView === "geographic" ? (
        <GeographicView />
      ) : (
        <>
          {creditOverviewQuery.isLoading ? (
            <div className="credit-skeleton" aria-busy="true" aria-label="Carregando credito e pagamento">
              <div className="credit-skeleton-strip">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="credit-skeleton-card" />
                ))}
              </div>
              <div className="credit-skeleton-bar" />
              <div className="credit-skeleton-rows">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="credit-skeleton-row" />
                ))}
              </div>
            </div>
          ) : null}
          {creditOverviewQuery.isError ? <div className="page-error">Falha ao carregar o snapshot financeiro.</div> : null}
          {creditOverviewQuery.data ? (
            <>
              {/* KPI Strip - Interactive */}
              <div className="credit-kpi-strip">
                <button
                  type="button"
                  className={`credit-kpi-card tone-warning ${state.creditKpiFilter === "owing" ? "active" : ""}`}
                  onClick={() => dispatch({ type: "setCreditKpiFilter", value: "owing" })}
                >
                  <div className="credit-kpi-header">
                    <span className="credit-kpi-label">Em aberto</span>
                    <div className="credit-kpi-icon tone-warning"><BadgeDollarSign size={18} /></div>
                  </div>
                  <strong className="credit-kpi-value">{formatCurrency(filteredDebtAmount)}</strong>
                  <span className="credit-kpi-helper">{formatNumber(filteredDebtCount)} clientes com divida</span>
                </button>

                <button
                  type="button"
                  className={`credit-kpi-card tone-success ${state.creditKpiFilter === "credit_balance" ? "active" : ""}`}
                  onClick={() => dispatch({ type: "setCreditKpiFilter", value: "credit_balance" })}
                >
                  <div className="credit-kpi-header">
                    <span className="credit-kpi-label">Saldo a favor</span>
                    <div className="credit-kpi-icon tone-success"><TrendingUp size={18} /></div>
                  </div>
                  <strong className="credit-kpi-value">{formatCurrency(filteredCreditBalanceAmount)}</strong>
                  <span className="credit-kpi-helper">{formatNumber(filteredCreditBalanceCount)} clientes com saldo positivo</span>
                </button>

                <button
                  type="button"
                  className={`credit-kpi-card tone-info ${state.creditKpiFilter === "unused_credit" ? "active" : ""}`}
                  onClick={() => dispatch({ type: "setCreditKpiFilter", value: "unused_credit" })}
                >
                  <div className="credit-kpi-header">
                    <span className="credit-kpi-label">Credito livre</span>
                    <div className="credit-kpi-icon tone-info"><TrendingUp size={18} /></div>
                  </div>
                  <strong className="credit-kpi-value">{formatCurrency(filteredAvailableCreditAmount)}</strong>
                  <span className="credit-kpi-helper">{formatNumber(filteredUnusedCreditCount)} clientes para empurrar venda</span>
                </button>

                <button
                  type="button"
                  className={`credit-kpi-card tone-danger ${state.creditKpiFilter === "over_credit" ? "active" : ""}`}
                  onClick={() => dispatch({ type: "setCreditKpiFilter", value: "over_credit" })}
                >
                  <div className="credit-kpi-header">
                    <span className="credit-kpi-label">Acima do limite</span>
                    <div className="credit-kpi-icon tone-danger"><ShieldAlert size={18} /></div>
                  </div>
                  <strong className="credit-kpi-value">{formatCurrency(filteredTotalExcessAmount)}</strong>
                  <span className="credit-kpi-helper">{formatNumber(filteredOverCreditCount)} acima e {formatNumber(filteredOverdueCount)} com atraso</span>
                </button>
              </div>

              {/* Snapshot bar + Meta */}
              <div className="credit-snapshot-bar">
                <div className="credit-snapshot-info">
                  <strong>{creditOverviewQuery.data.snapshot?.sourceFileName || "Planilha de saldos"}</strong>
                  <span>
                    {`${formatNumber(creditOverviewQuery.data.summary.totalLinkedCustomers)} vinculados · ${formatNumber(creditOverviewQuery.data.summary.totalUnmatchedRows)} nao vinculados`}
                  </span>
                  {creditOverviewQuery.data.snapshot?.importedAt ? (
                    <small>
                      {creditOverviewQuery.data.snapshot.sourceFileUpdatedAt
                        ? `Arquivo ${formatDateTime(creditOverviewQuery.data.snapshot.sourceFileUpdatedAt)} · `
                        : ""}
                      Atualizado {formatDateTime(creditOverviewQuery.data.snapshot.importedAt)}
                    </small>
                  ) : null}
                </div>

                <div className="credit-snapshot-actions">
                  {state.creditKpiFilter || state.creditQuickFilter || Object.values(state.creditFilters).some(v => v !== "") ? (
                    <button
                      type="button"
                      className="ghost-button small"
                      onClick={() => dispatch({ type: "clearCreditFilters" })}
                    >
                      Limpar filtro
                    </button>
                  ) : null}

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

              {/* Atalhos de triagem + ordenacao */}
              <div className="credit-triage-bar">
                <div className="credit-triage-chips" role="group" aria-label="Atalhos de triagem">
                  {([
                    { value: "to_charge", label: "Cobrar hoje", tone: "danger", count: quickFilterCounts.to_charge },
                    { value: "overdue", label: "Vencidos", tone: "warning", count: quickFilterCounts.overdue },
                    { value: "opportunity", label: "Oportunidades", tone: "success", count: quickFilterCounts.opportunity },
                    { value: "ontrack", label: "Em dia", tone: "muted", count: quickFilterCounts.ontrack },
                  ] as const).map((chip) => (
                    <button
                      key={chip.value}
                      type="button"
                      className={`credit-chip tone-${chip.tone} ${state.creditQuickFilter === chip.value ? "active" : ""}`}
                      aria-pressed={state.creditQuickFilter === chip.value}
                      onClick={() => dispatch({ type: "setCreditQuickFilter", value: chip.value })}
                    >
                      {chip.label}
                      <span className="credit-chip-count">{formatNumber(chip.count)}</span>
                    </button>
                  ))}
                </div>

                <label className="credit-sort-field">
                  <span>Ordenar por</span>
                  <select
                    value={state.creditSort}
                    onChange={(event) =>
                      dispatch({ type: "setCreditSort", value: event.target.value as CreditSortBy })
                    }
                  >
                    <option value="urgency">Urgencia</option>
                    <option value="debt_desc">Maior em aberto</option>
                    <option value="available_desc">Maior credito livre</option>
                    <option value="name">Nome (A-Z)</option>
                  </select>
                </label>
              </div>

              {/* Results meta */}
              <div className="credit-results-meta">
                <p>
                  Exibindo {formatNumber(displayedCreditRows.length)} de{" "}
                  {formatNumber(creditOverviewQuery.data.summary.totalLinkedCustomers)} clientes vinculados.
                  {state.creditKpiFilter || state.creditQuickFilter ? (
                    <button
                      type="button"
                      className="credit-clear-filter-inline"
                      onClick={() => dispatch({ type: "clearCreditFilters" })}
                    >
                      Mostrar todos
                    </button>
                  ) : null}
                </p>
                {displayedCreditRows.length > 0 ? (
                  <button
                    type="button"
                    className="ghost-button small"
                    onClick={() => toggleAllVisibleCredit(selectedCreditRows.length !== displayedCreditRows.length)}
                  >
                    {selectedCreditRows.length === displayedCreditRows.length ? "Desmarcar todos" : "Selecionar todos os visiveis"}
                  </button>
                ) : null}
              </div>

              {/* Barra de acao do publico de cobranca */}
              {selectedCreditRows.length > 0 ? (
                <div className="credit-audience-bar">
                  <div className="credit-audience-info">
                    <Users size={18} />
                    <div>
                      <strong>{formatNumber(selectedCreditRows.length)} clientes selecionados</strong>
                      <span>{formatCurrency(selectedCreditDebt)} em aberto neste grupo</span>
                    </div>
                  </div>
                  <div className="credit-audience-actions">
                    <button type="button" className="ghost-button small" onClick={handleCopyCreditCodes}>
                      <Copy size={15} /> Copiar codigos
                    </button>
                    <button
                      type="button"
                      className="ghost-button small"
                      onClick={() => setSelectedCreditCodes(new Set())}
                    >
                      Limpar selecao
                    </button>
                    <button
                      type="button"
                      className="ghost-button small"
                      onClick={() => openAudienceModal("automation")}
                      disabled={createAudienceMutation.isPending}
                    >
                      <Repeat size={15} /> Cobranca automatica
                    </button>
                    <button
                      type="button"
                      className="primary-button small"
                      onClick={() => openAudienceModal("dispatch")}
                      disabled={createAudienceMutation.isPending}
                    >
                      <Send size={15} />
                      Disparar cobranca agora
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedCreditRows.length === 0 && displayedCreditRows.length > 0 ? (
                <p className="credit-select-hint">
                  <Users size={14} /> Marque os clientes na primeira coluna para criar um publico e disparar a cobranca no
                  WhatsApp. Use os atalhos acima (ex.: "Cobrar hoje") para filtrar quem precisa de cobranca.
                </p>
              ) : null}

              {/* Table */}
              <CustomerCreditTable
                rows={displayedCreditRows}
                emptyMessage="Nenhum cliente vinculado ao CRM bate com esse filtro."
                selectable
                selectedCodes={selectedCreditCodes}
                onToggleRow={toggleCreditCode}
                onToggleAll={toggleAllVisibleCredit}
              />

              {/* Unmatched */}
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

      {audienceModal ? (
        <div className="modal-backdrop" onClick={() => setAudienceModal(null)}>
          <div
            className="modal-container credit-audience-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>{audienceModal.destination === "automation" ? "Criar cobranca automatica" : "Disparar cobranca agora"}</h3>
                <p className="credit-audience-modal-sub">
                  {formatNumber(selectedCreditRows.length)} clientes · {formatCurrency(selectedCreditDebt)} em aberto
                </p>
              </div>
              <button type="button" className="modal-close" onClick={() => setAudienceModal(null)} aria-label="Fechar">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <label>
                Nome do publico
                <input
                  value={audienceModal.name}
                  autoFocus
                  onChange={(event) =>
                    setAudienceModal((current) => (current ? { ...current, name: event.target.value } : current))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void confirmAudienceModal();
                    }
                  }}
                  placeholder="Ex.: Cobranca recorrente"
                />
              </label>

              <div className="credit-audience-review">
                <div className="credit-audience-review-head">
                  <span>Clientes neste publico</span>
                  <strong>{formatNumber(selectedCreditRows.length)}</strong>
                </div>
                <div className="credit-audience-review-list">
                  {selectedCreditRows.map((row) => (
                    <div key={row.customerCode} className="credit-audience-review-row">
                      <div className="credit-audience-review-client">
                        <strong>{row.customerDisplayName}</strong>
                        <span>{row.customerCode}</span>
                      </div>
                      <div className="credit-audience-review-amount">
                        <span className={row.debtAmount > 0 ? "credit-amount-debt" : ""}>
                          {row.debtAmount > 0 ? formatCurrency(row.debtAmount) : "—"}
                        </span>
                        <button
                          type="button"
                          className="credit-audience-review-remove"
                          onClick={() => toggleCreditCode(row.customerCode)}
                          aria-label={`Remover ${row.customerDisplayName}`}
                          title="Remover deste publico"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {selectedCreditRows.length === 0 ? (
                    <div className="credit-audience-review-empty">
                      Voce removeu todos os clientes. Feche e selecione ao menos um.
                    </div>
                  ) : null}
                </div>
                <div className="credit-audience-review-total">
                  <span>Total em aberto</span>
                  <strong>{formatCurrency(selectedCreditDebt)}</strong>
                </div>
              </div>

              <div className="credit-audience-modal-steps">
                <span className="credit-audience-modal-steps-title">Como vai funcionar</span>
                <ol>
                  <li>
                    Criamos um publico com esses {formatNumber(selectedCreditRows.length)} clientes selecionados.
                  </li>
                  {audienceModal.destination === "automation" ? (
                    <>
                      <li>Abrimos a automacao ja apontada para esse publico.</li>
                      <li>Voce escolhe a frequencia (ex.: toda segunda 9h), a mensagem e ativa.</li>
                    </>
                  ) : (
                    <>
                      <li>Abrimos o disparo ja com esse publico selecionado.</li>
                      <li>Voce confere a mensagem e envia na hora.</li>
                    </>
                  )}
                </ol>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="secondary-button" onClick={() => setAudienceModal(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void confirmAudienceModal()}
                disabled={!audienceModal.name.trim() || selectedCreditRows.length === 0 || createAudienceMutation.isPending}
              >
                {createAudienceMutation.isPending
                  ? "Criando..."
                  : audienceModal.destination === "automation"
                    ? "Continuar para automacao"
                    : "Abrir disparo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="idea-canvas-toast" style={{ background: "rgba(47, 157, 103, 0.96)" }}>
          <span>{toastMessage}</span>
          <button type="button" className="ghost-button icon-only" onClick={() => setToastMessage(null)} style={{ color: "white" }}>
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  );
}
