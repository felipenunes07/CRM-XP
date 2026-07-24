import type { CustomerCreditRow, CustomerCreditSnapshotMeta } from "@olist-crm/shared";
import { AlertTriangle, Clock, RefreshCw, ShieldAlert, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { getCustomerCreditDeadline } from "../lib/customerCredit";
import { formatCurrency, formatDateTime, formatNumber, formatPercent } from "../lib/format";
import type { CreditKpiFilter, CreditQuickFilter, CreditSortBy } from "../pages/customersPage.helpers";
import "./customerCreditBank.css";

interface CustomerCreditExecutiveSummaryProps {
  rows: CustomerCreditRow[];
  snapshot: CustomerCreditSnapshotMeta | null;
  linkedCount: number;
  unmatchedCount: number;
  quickFilter: CreditQuickFilter;
  kpiFilter: CreditKpiFilter;
  sort: CreditSortBy;
  quickCounts: Record<Exclude<CreditQuickFilter, "">, number>;
  debtAmount: number;
  debtCount: number;
  overdueDebtAmount: number;
  overdueCount: number;
  availableCreditAmount: number;
  unusedCreditCount: number;
  excessAmount: number;
  overCreditCount: number;
  hasActiveFilters: boolean;
  canRefresh: boolean;
  isRefreshing: boolean;
  refreshError: boolean;
  onQuickFilter: (value: CreditQuickFilter) => void;
  onKpiFilter: (value: CreditKpiFilter) => void;
  onSort: (value: CreditSortBy) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
}

type AgingBucket = {
  key: string;
  label: string;
  amount: number;
  count: number;
  tone: "danger" | "warning" | "info" | "success";
};

export function CustomerCreditExecutiveSummary({
  rows,
  snapshot,
  linkedCount,
  unmatchedCount,
  quickFilter,
  kpiFilter,
  sort,
  quickCounts,
  debtAmount,
  debtCount,
  overdueDebtAmount,
  overdueCount,
  availableCreditAmount,
  unusedCreditCount,
  excessAmount,
  overCreditCount,
  hasActiveFilters,
  canRefresh,
  isRefreshing,
  refreshError,
  onQuickFilter,
  onKpiFilter,
  onSort,
  onClearFilters,
  onRefresh,
}: CustomerCreditExecutiveSummaryProps) {
  const analysis = useMemo(() => {
    const debtRows = rows.filter((row) => row.debtAmount > 0);
    const agingMap = new Map<string, AgingBucket>([
      ["severe", { key: "severe", label: "Mais de 30 dias", amount: 0, count: 0, tone: "danger" }],
      ["overdue", { key: "overdue", label: "1 a 30 dias vencido", amount: 0, count: 0, tone: "warning" }],
      ["dueSoon", { key: "dueSoon", label: "Vence em até 7 dias", amount: 0, count: 0, tone: "info" }],
      ["onTrack", { key: "onTrack", label: "Dentro do prazo", amount: 0, count: 0, tone: "success" }],
    ]);

    for (const row of debtRows) {
      const deadline = getCustomerCreditDeadline(row);
      const bucketKey =
        deadline.status === "overdue" && deadline.overdueDays > 30
          ? "severe"
          : deadline.status === "overdue"
            ? "overdue"
            : deadline.status === "due_soon"
              ? "dueSoon"
              : "onTrack";
      const bucket = agingMap.get(bucketKey)!;
      bucket.amount += row.debtAmount;
      bucket.count += 1;
    }

    const topDebtors = [...debtRows]
      .sort((left, right) => right.debtAmount - left.debtAmount)
      .slice(0, 5);
    const topDebtAmount = topDebtors.reduce((sum, row) => sum + row.debtAmount, 0);

    return {
      aging: Array.from(agingMap.values()),
      topDebtors,
      maxTopDebt: topDebtors[0]?.debtAmount ?? 1,
      overdueRatio: debtAmount > 0 ? overdueDebtAmount / debtAmount : 0,
      concentrationRatio: debtAmount > 0 ? topDebtAmount / debtAmount : 0,
      criticalCount: debtRows.filter((row) => row.riskLevel === "CRITICO").length,
    };
  }, [debtAmount, overdueDebtAmount, rows]);

  const health =
    analysis.overdueRatio >= 0.6 || overCreditCount >= 10
      ? { label: "Atenção máxima", tone: "danger" }
      : analysis.overdueRatio >= 0.3
        ? { label: "Risco elevado", tone: "warning" }
        : { label: "Carteira controlada", tone: "success" };

  const toggleKpiFilter = (value: Exclude<CreditKpiFilter, "">) => {
    onKpiFilter(kpiFilter === value ? "" : value);
  };

  const toggleQuickFilter = (value: Exclude<CreditQuickFilter, "">) => {
    onQuickFilter(quickFilter === value ? "" : value);
  };

  const chips = [
    { value: "" as const, label: "Todos", count: rows.length, tone: "" },
    { value: "to_charge" as const, label: "Cobrar hoje", count: quickCounts.to_charge, tone: "tone-danger" },
    { value: "overdue" as const, label: "Vencidos", count: quickCounts.overdue, tone: "tone-warning" },
    { value: "due_soon" as const, label: "Vence em 7 dias", count: quickCounts.due_soon, tone: "" },
    { value: "ontrack" as const, label: "Em dia", count: quickCounts.ontrack, tone: "tone-success" },
  ];

  return (
    <div className="bankfin-stack">
      {/* Extrato da carteira ------------------------------------------------ */}
      <section className="bankfin-account" aria-label="Posição financeira da carteira">
        <div className="bankfin-account-top">
          <div className="bankfin-account-title">
            <h3>Posição da carteira</h3>
            <span>
              Total em aberto <strong>{formatCurrency(debtAmount)}</strong> · {formatNumber(debtCount)} clientes
            </span>
          </div>

          <div className="bankfin-account-tools">
            <span className={`bankfin-health tone-${health.tone}`}>
              <ShieldAlert size={13} />
              {health.label}
            </span>
            <span className="bankfin-meta">
              <Clock size={13} />
              {snapshot?.importedAt ? formatDateTime(snapshot.importedAt) : "Sem atualização"}
            </span>
            {canRefresh ? (
              <button type="button" className="bankfin-refresh" onClick={onRefresh} disabled={isRefreshing}>
                <RefreshCw size={13} className={isRefreshing ? "spin" : ""} />
                {isRefreshing ? "Atualizando" : "Atualizar"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="bankfin-balances">
          <button
            type="button"
            className={`bankfin-balance tone-danger ${quickFilter === "overdue" ? "active" : ""}`}
            onClick={() => toggleQuickFilter("overdue")}
          >
            <span className="bankfin-balance-label">
              <AlertTriangle size={13} />
              Vencido
            </span>
            <span className="bankfin-balance-value">{formatCurrency(overdueDebtAmount)}</span>
            <span className="bankfin-balance-foot">
              <strong>{formatNumber(overdueCount)}</strong> clientes · {formatPercent(analysis.overdueRatio)} do total
            </span>
          </button>

          <button
            type="button"
            className={`bankfin-balance tone-warning ${kpiFilter === "over_credit" ? "active" : ""}`}
            onClick={() => toggleKpiFilter("over_credit")}
          >
            <span className="bankfin-balance-label">
              <ShieldAlert size={13} />
              Acima do limite
            </span>
            <span className="bankfin-balance-value">{formatNumber(overCreditCount)}</span>
            <span className="bankfin-balance-foot">
              <strong>{formatCurrency(excessAmount)}</strong> de excesso
            </span>
          </button>

          <button
            type="button"
            className={`bankfin-balance tone-success ${kpiFilter === "unused_credit" ? "active" : ""}`}
            onClick={() => toggleKpiFilter("unused_credit")}
          >
            <span className="bankfin-balance-label">
              <TrendingUp size={13} />
              Crédito disponível
            </span>
            <span className="bankfin-balance-value">{formatCurrency(availableCreditAmount)}</span>
            <span className="bankfin-balance-foot">
              <strong>{formatNumber(unusedCreditCount)}</strong> clientes sem uso
            </span>
          </button>
        </div>

        <div className="bankfin-account-note">
          <span>
            Os 5 maiores devedores concentram <strong>{formatPercent(analysis.concentrationRatio)}</strong> da dívida.
          </span>
          <span>
            <strong>{formatNumber(analysis.criticalCount)}</strong> clientes em risco crítico.
          </span>
          <span>
            <strong>{formatNumber(linkedCount)}</strong> vinculados ao CRM
            {unmatchedCount > 0 ? ` · ${formatNumber(unmatchedCount)} sem vínculo` : ""}.
          </span>
        </div>
      </section>

      {refreshError ? <div className="inline-error">Não foi possível atualizar a planilha agora.</div> : null}

      {/* Filtros rápidos ---------------------------------------------------- */}
      <div className="bankfin-toolbar">
        <div className="bankfin-chips" role="group" aria-label="Filtrar clientes">
          {chips.map((chip) => (
            <button
              key={chip.value || "all"}
              type="button"
              className={`bankfin-chip ${chip.tone} ${quickFilter === chip.value ? "active" : ""}`}
              onClick={() => onQuickFilter(chip.value)}
            >
              {chip.label}
              <b>{formatNumber(chip.count)}</b>
            </button>
          ))}
        </div>

        <div className="bankfin-sort">
          {hasActiveFilters ? (
            <button type="button" className="bankfin-linkbtn" onClick={onClearFilters}>
              Limpar filtros
            </button>
          ) : null}
          <label htmlFor="credit-sort-select" className="visually-hidden" style={{ display: "none" }}>
            Ordenar carteira
          </label>
          <select
            id="credit-sort-select"
            value={sort}
            onChange={(event) => onSort(event.target.value as CreditSortBy)}
          >
            <option value="urgency">Ordenar por urgência</option>
            <option value="debt_desc">Maior saldo devedor</option>
            <option value="available_desc">Maior crédito livre</option>
            <option value="name">Nome (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Gráficos ----------------------------------------------------------- */}
      <div className="bankfin-charts">
        <article className="bankfin-card">
          <div className="bankfin-card-head">
            <h4>Envelhecimento da dívida</h4>
            <span>{formatCurrency(debtAmount)} em aberto</span>
          </div>
          <div className="bankfin-aging">
            {analysis.aging.map((bucket) => {
              const share = debtAmount > 0 ? bucket.amount / debtAmount : 0;
              return (
                <button
                  key={bucket.key}
                  type="button"
                  className="bankfin-aging-row"
                  onClick={() => {
                    if (bucket.key === "dueSoon") onQuickFilter("due_soon");
                    else if (bucket.key === "onTrack") onQuickFilter("ontrack");
                    else onQuickFilter("overdue");
                  }}
                >
                  <span className="bankfin-aging-label">{bucket.label}</span>
                  <span className="bankfin-aging-value">{formatCurrency(bucket.amount)}</span>
                  <span className="bankfin-aging-track">
                    <i
                      className={`tone-${bucket.tone}`}
                      style={{ width: `${Math.max(share * 100, bucket.amount ? 2 : 0)}%` }}
                    />
                  </span>
                  <span className="bankfin-aging-sub">
                    {formatNumber(bucket.count)} clientes · {formatPercent(share)}
                  </span>
                </button>
              );
            })}
          </div>
        </article>

        <article className="bankfin-card">
          <div className="bankfin-card-head">
            <h4>Maiores saldos em aberto</h4>
            <span>{formatPercent(analysis.concentrationRatio)} da dívida</span>
          </div>
          <div className="bankfin-rank">
            {analysis.topDebtors.length === 0 ? (
              <p className="bankfin-drawer-note">Nenhum cliente devedor neste filtro.</p>
            ) : null}
            {analysis.topDebtors.map((row, index) => (
              <button
                key={row.id}
                type="button"
                className="bankfin-rank-row"
                onClick={() => toggleKpiFilter("owing")}
                title={row.customerDisplayName}
              >
                <span className="bankfin-rank-pos">{index + 1}</span>
                <strong>{row.customerDisplayName}</strong>
                <b>{formatCurrency(row.debtAmount)}</b>
                <span className="bankfin-rank-track">
                  <i style={{ width: `${(row.debtAmount / analysis.maxTopDebt) * 100}%` }} />
                </span>
              </button>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
