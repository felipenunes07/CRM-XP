import type { CustomerCreditRow, CustomerCreditSnapshotMeta } from "@olist-crm/shared";
import { Download, ExternalLink, Pencil, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { BillingAlertReport, BillingCustomerResult } from "../lib/api";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "../lib/format";
import "./creditPaymentSimple.css";

/**
 * Aba "Credito & Pagamento" simplificada. Usa o MESMO calculo da cobranca
 * (pagamentos quitam os pedidos mais antigos; vencido = pedido em aberto apos
 * data + prazo), entao os numeros batem com o grupo do WhatsApp e com
 * Clientes › Financeiro.
 */

export type CreditCardKey = "all" | "overLimit" | "overdue" | "noCredit" | "overCredit" | "nearLimit";
export type CreditSimpleSort = "debt" | "overdue" | "recentSale";
export type CreditSalePeriod = "all" | "7" | "30";

export interface CreditSimpleRow {
  row: CustomerCreditRow;
  billing: BillingCustomerResult | null;
}

export interface CreditSimpleFilters {
  card: CreditCardKey;
  search: string;
  seller: string;
  period: CreditSalePeriod;
  sort: CreditSimpleSort;
  today: string;
}

const PAGE_SIZE = 50;

const CARDS: Array<{ key: CreditCardKey; label: string; tone: string }> = [
  { key: "all", label: "Todos devendo", tone: "neutral" },
  { key: "overLimit", label: "Estourou o limite", tone: "danger" },
  { key: "overdue", label: "Vencido", tone: "danger" },
  { key: "noCredit", label: "Sem crédito", tone: "muted" },
  { key: "overCredit", label: "Passou do crédito", tone: "warning" },
  { key: "nearLimit", label: "Perto do limite", tone: "attention" },
];

const REPORT_GROUPS = ["overLimit", "overCredit", "overdue", "noCredit", "nearLimit", "missingPaymentTerm", "ignored"] as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** Junta a carteira (planilha + ajustes do CRM) com o calculo da cobranca. So quem deve. */
export function buildCreditSimpleRows(rows: CustomerCreditRow[], report: BillingAlertReport | null): CreditSimpleRow[] {
  const billingByCode = new Map<string, BillingCustomerResult>();
  for (const group of REPORT_GROUPS) {
    for (const customer of report?.[group] ?? []) {
      if (!billingByCode.has(customer.customerCode)) billingByCode.set(customer.customerCode, customer);
    }
  }
  return rows
    .filter((row) => row.debtAmount >= 1)
    .map((row) => ({ row, billing: billingByCode.get(row.customerCode) ?? null }));
}

export function cardMembership(report: BillingAlertReport | null) {
  const codes = (key: Exclude<CreditCardKey, "all">) =>
    new Set((report?.[key] ?? []).map((customer) => customer.customerCode));
  return {
    overLimit: codes("overLimit"),
    overdue: codes("overdue"),
    noCredit: codes("noCredit"),
    overCredit: codes("overCredit"),
    nearLimit: codes("nearLimit"),
  };
}

export function filterCreditSimpleRows(
  rows: CreditSimpleRow[],
  membership: ReturnType<typeof cardMembership>,
  filters: CreditSimpleFilters,
) {
  const needle = normalize(filters.search.trim());
  const filtered = rows.filter(({ row, billing }) => {
    if (filters.card !== "all" && !membership[filters.card].has(row.customerCode)) return false;
    if (needle) {
      const haystack = normalize([row.customerCode, row.customerDisplayName, row.sourceDisplayName ?? ""].join(" "));
      if (!haystack.includes(needle)) return false;
    }
    const sale = billing?.lastSale ?? null;
    if (filters.seller && (sale?.seller ?? "") !== filters.seller) return false;
    if (filters.period !== "all") {
      if (!sale?.orderDate || daysBetween(sale.orderDate, filters.today) > Number(filters.period)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  if (filters.sort === "overdue") {
    sorted.sort((left, right) => (right.billing?.overdueAmount ?? 0) - (left.billing?.overdueAmount ?? 0) || right.row.debtAmount - left.row.debtAmount);
  } else if (filters.sort === "recentSale") {
    sorted.sort((left, right) =>
      String(right.billing?.lastSale?.orderDate ?? "").localeCompare(String(left.billing?.lastSale?.orderDate ?? "")),
    );
  } else {
    sorted.sort((left, right) => right.row.debtAmount - left.row.debtAmount);
  }
  return sorted;
}

function situationBadges(billing: BillingCustomerResult | null, row: CustomerCreditRow) {
  const badges: Array<{ label: string; tone: string }> = [];
  if (billing?.status && /golpe|desativado/i.test(billing.status)) badges.push({ label: billing.status, tone: "muted" });
  if (billing?.limitLevel === "OVER_LIMIT") badges.push({ label: "Estourou o limite", tone: "danger" });
  if (billing?.limitLevel === "OVER_CREDIT") badges.push({ label: "Passou do crédito", tone: "warning" });
  if (billing?.limitLevel === "NO_LIMIT" || (!billing && row.creditLimit <= 0)) badges.push({ label: "Sem crédito", tone: "muted" });
  if (billing?.limitLevel === "NEAR_LIMIT") badges.push({ label: "Perto do limite", tone: "attention" });
  if (billing?.hasOverdue) badges.push({ label: "Vencido", tone: "danger" });
  // Sem PRAZO na planilha nao da para dizer que esta em dia.
  if (!badges.length) {
    badges.push(billing?.missingPaymentTerm ? { label: "Sem prazo", tone: "muted" } : { label: "Em dia", tone: "success" });
  }
  return badges;
}

function creditText(row: CustomerCreditRow) {
  const parts: string[] = [];
  if (row.creditLimit > 0) parts.push(formatCurrency(row.creditLimit));
  if (row.internalCreditLimit && row.internalCreditLimit > 0 && row.internalCreditLimit !== row.creditLimit) {
    parts.push(`interno ${formatCurrency(row.internalCreditLimit)}`);
  }
  return parts.length ? parts.join(" · ") : "Sem crédito";
}

export function CreditPaymentSimpleView({
  rows,
  report,
  isReportLoading,
  snapshot,
  selectedCodes,
  onToggleRow,
  onSetSelection,
  onExport,
  isExporting,
  exportError,
  onEditCredit,
  canRefresh,
  isRefreshing,
  onRefresh,
  selectionBar,
}: {
  rows: CustomerCreditRow[];
  report: BillingAlertReport | null;
  isReportLoading: boolean;
  snapshot: CustomerCreditSnapshotMeta | null;
  selectedCodes: Set<string>;
  onToggleRow: (code: string) => void;
  onSetSelection: (codes: string[], selected: boolean) => void;
  onExport: (rows: CustomerCreditRow[]) => void;
  isExporting: boolean;
  exportError: boolean;
  onEditCredit?: (row: CustomerCreditRow) => void;
  canRefresh: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  selectionBar?: ReactNode;
}) {
  const [card, setCard] = useState<CreditCardKey>("all");
  const [search, setSearch] = useState("");
  const [seller, setSeller] = useState("");
  const [period, setPeriod] = useState<CreditSalePeriod>("all");
  const [sort, setSort] = useState<CreditSimpleSort>("debt");
  const [page, setPage] = useState(1);

  const today = report?.today ?? new Date().toISOString().slice(0, 10);
  const allRows = useMemo(() => buildCreditSimpleRows(rows, report), [rows, report]);
  const membership = useMemo(() => cardMembership(report), [report]);
  const filtered = useMemo(
    () => filterCreditSimpleRows(allRows, membership, { card, search, seller, period, sort, today }),
    [allRows, membership, card, search, seller, period, sort, today],
  );
  const sellers = useMemo(
    () =>
      [...new Set(allRows.map(({ billing }) => billing?.lastSale?.seller).filter((name): name is string => Boolean(name)))].sort(
        (left, right) => left.localeCompare(right, "pt-BR"),
      ),
    [allRows],
  );

  useEffect(() => setPage(1), [card, search, seller, period, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageCodes = pageRows.filter(({ row }) => row.customerId).map(({ row }) => row.customerCode);
  const allPageSelected = pageCodes.length > 0 && pageCodes.every((code) => selectedCodes.has(code));

  const cardStats = useMemo(() => {
    const sumBy = (codes: Set<string> | null, value: (entry: CreditSimpleRow) => number) => {
      const list = codes ? allRows.filter(({ row }) => codes.has(row.customerCode)) : allRows;
      return { count: list.length, amount: list.reduce((sum, entry) => sum + value(entry), 0) };
    };
    const debt = (entry: CreditSimpleRow) => entry.row.debtAmount;
    return {
      all: sumBy(null, debt),
      overLimit: sumBy(membership.overLimit, debt),
      overdue: sumBy(membership.overdue, (entry) => entry.billing?.overdueAmount ?? 0),
      noCredit: sumBy(membership.noCredit, debt),
      overCredit: sumBy(membership.overCredit, debt),
      nearLimit: sumBy(membership.nearLimit, debt),
    } satisfies Record<CreditCardKey, { count: number; amount: number }>;
  }, [allRows, membership]);

  return (
    <div className="credit-simple">
      <div className="credit-simple-top">
        <span>
          {snapshot ? `Planilha de ${formatDateTime(snapshot.sourceFileUpdatedAt)}` : "Sem planilha importada"}
          {isReportLoading ? " · calculando cobrança..." : ""}
        </span>
        {canRefresh ? (
          <button type="button" className="ghost-button small" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw size={14} /> {isRefreshing ? "Atualizando..." : "Atualizar"}
          </button>
        ) : null}
      </div>

      <div className="credit-simple-cards" role="tablist">
        {CARDS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={card === entry.key}
            className={`credit-simple-card ${entry.tone} ${card === entry.key ? "active" : ""}`}
            onClick={() => setCard(entry.key)}
          >
            <span>{entry.label}</span>
            <strong>{formatNumber(cardStats[entry.key].count)}</strong>
            <small>{formatCurrency(cardStats[entry.key].amount)}</small>
          </button>
        ))}
      </div>

      <div className="credit-simple-toolbar">
        <label className="credit-simple-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou código" />
        </label>
        <select value={seller} onChange={(event) => setSeller(event.target.value)} aria-label="Quem vendeu">
          <option value="">Quem vendeu: todas</option>
          {sellers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select value={period} onChange={(event) => setPeriod(event.target.value as CreditSalePeriod)} aria-label="Última venda">
          <option value="all">Última venda: qualquer data</option>
          <option value="7">Última venda: 7 dias</option>
          <option value="30">Última venda: 30 dias</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as CreditSimpleSort)} aria-label="Ordenar">
          <option value="debt">Ordenar: maior dívida</option>
          <option value="overdue">Ordenar: maior vencido</option>
          <option value="recentSale">Ordenar: venda mais recente</option>
        </select>
        <button
          type="button"
          className="primary-button small"
          onClick={() => onExport(filtered.map(({ row }) => row))}
          disabled={isExporting || !filtered.length}
        >
          <Download size={15} /> {isExporting ? "Gerando..." : "Baixar Excel"}
        </button>
      </div>
      {exportError ? <div className="inline-error">Não foi possível gerar o Excel. Tente novamente.</div> : null}

      {selectionBar}

      <div className="credit-simple-tablewrap">
        <table className="credit-simple-table">
          <thead>
            <tr>
              <th className="is-check">
                <input
                  type="checkbox"
                  aria-label="Selecionar página"
                  checked={allPageSelected}
                  onChange={(event) => onSetSelection(pageCodes, event.target.checked)}
                />
              </th>
              <th>Cliente</th>
              <th className="is-right">Deve</th>
              <th>Crédito</th>
              <th>Situação</th>
              <th className="is-right">Vencido</th>
              <th>Última venda</th>
              <th className="is-actions" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ row, billing }) => {
              const sale = billing?.lastSale ?? null;
              return (
                <tr key={row.id}>
                  <td className="is-check">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${row.customerCode}`}
                      disabled={!row.customerId}
                      checked={selectedCodes.has(row.customerCode)}
                      onChange={() => onToggleRow(row.customerCode)}
                    />
                  </td>
                  <td>
                    <strong>{row.customerCode}</strong> {row.customerDisplayName}
                  </td>
                  <td className="is-right is-money">{formatCurrency(row.debtAmount)}</td>
                  <td className="is-credit">{creditText(row)}</td>
                  <td>
                    <div className="credit-simple-badges">
                      {situationBadges(billing, row).map((badge) => (
                        <span key={badge.label} className={`credit-simple-badge ${badge.tone}`}>
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="is-right is-money">
                    {billing?.hasOverdue ? (
                      <>
                        {formatCurrency(billing.overdueAmount)}
                        <small>há {billing.oldestOverdueDays} dia(s)</small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="is-sale">
                    {sale?.orderDate ? (
                      <>
                        {formatDate(sale.orderDate)}
                        {sale.seller ? <span className="credit-simple-seller">{sale.seller}</span> : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="is-actions">
                    {onEditCredit && row.customerId ? (
                      <button type="button" className="ghost-button small" onClick={() => onEditCredit(row)} title="Editar crédito e prazo">
                        <Pencil size={14} /> Editar
                      </button>
                    ) : null}
                    {row.customerId ? (
                      <Link className="ghost-button small" to={`/clientes/financeiro/${row.customerId}`} title="Abrir dossiê financeiro">
                        <ExternalLink size={14} />
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!pageRows.length ? <div className="credit-simple-empty">Nenhum cliente com esse filtro.</div> : null}
      </div>

      <div className="credit-simple-footer">
        <span>
          {formatNumber(filtered.length)} cliente(s) · {formatCurrency(filtered.reduce((sum, { row }) => sum + row.debtAmount, 0))}
        </span>
        {totalPages > 1 ? (
          <nav className="credit-simple-pages" aria-label="Páginas">
            <button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>
              Anterior
            </button>
            <span>
              {formatNumber(currentPage)} de {formatNumber(totalPages)}
            </span>
            <button type="button" onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>
              Próxima
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
