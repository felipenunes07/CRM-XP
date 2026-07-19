import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  MessageSquareWarning,
  PackageSearch,
  Users,
  Wrench,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api, type ProductComplaintModelRow } from "../lib/api";
import "../components/inventorySales.css";

type PeriodDays = 30 | 90 | 365 | 0;
type CategoryFilter = "" | "reclamacao" | "defeito";
type SortKey = "total" | "clients" | "lastDate";

const PERIOD_OPTIONS: { label: string; value: PeriodDays }[] = [
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
  { label: "12 meses", value: 365 },
  { label: "Tudo", value: 0 },
];

const CATEGORY_OPTIONS: { label: string; value: CategoryFilter }[] = [
  { label: "Todas", value: "" },
  { label: "Reclamação", value: "reclamacao" },
  { label: "Defeito", value: "defeito" },
];

const CATEGORY_META: Record<string, { label: string; color: string; soft: string }> = {
  reclamacao: { label: "Reclamação", color: "#c2410c", soft: "rgba(194, 65, 12, 0.12)" },
  defeito: { label: "Defeito", color: "#dc2626", soft: "rgba(220, 38, 38, 0.1)" },
  outro: { label: "Outro", color: "#475569", soft: "rgba(148, 163, 184, 0.16)" },
};

const SEVERITY_META: Record<string, { label: string; color: string; soft: string }> = {
  critical: { label: "Crítico", color: "#b91c1c", soft: "rgba(185, 28, 28, 0.12)" },
  high: { label: "Alto", color: "#c2410c", soft: "rgba(194, 65, 12, 0.12)" },
  medium: { label: "Médio", color: "#92600a", soft: "rgba(208, 154, 41, 0.16)" },
  low: { label: "Baixo", color: "#0e7490", soft: "rgba(8, 145, 178, 0.1)" },
  none: { label: "—", color: "#64748b", soft: "rgba(148, 163, 184, 0.14)" },
};

const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function formatMonthLabel(month: string) {
  const [year, monthPart] = month.split("-");
  const index = Number(monthPart) - 1;
  return `${MONTH_NAMES[index] ?? monthPart}/${(year ?? "").slice(2)}`;
}

function formatBrDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}

function isoDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 })}%`;
}

function Sparkline({ values, months }: { values: number[]; months: string[] }) {
  const max = Math.max(...values, 1);
  return (
    <div
      className="invsales-spark"
      title={months.map((month, index) => `${formatMonthLabel(month)}: ${values[index] ?? 0}`).join(" · ")}
      aria-hidden
    >
      {values.map((value, index) => (
        <span
          key={index}
          className={value > 0 ? "" : "zero"}
          style={{
            height: `${value > 0 ? Math.max((value / max) * 100, 12) : 6}%`,
            backgroundColor: value > 0 ? "#dc2626" : undefined,
          }}
        />
      ))}
    </div>
  );
}

function CategoryPill({ category, count }: { category: string; count?: number }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.outro!;
  return (
    <span className="invsales-pill" style={{ background: meta.soft, color: meta.color }}>
      {count !== undefined ? `${count} ` : ""}{meta.label.toLowerCase()}
    </span>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.none!;
  return (
    <span className="invsales-pill" style={{ background: meta.soft, color: meta.color }}>
      {meta.label}
    </span>
  );
}

/** Sub-linhas do drill-down: as ocorrências reais do modelo. */
function ModelOccurrences({ model, dateFrom, category }: {
  model: string;
  dateFrom?: string;
  category?: CategoryFilter;
}) {
  const { token } = useAuth();
  const occurrencesQuery = useQuery({
    queryKey: ["product-complaints-occurrences", model, dateFrom, category],
    queryFn: () => api.listProductComplaints(
      token!,
      { model, exact: true, dateFrom, category: category || undefined },
      { page: 1, pageSize: 100 },
    ),
    enabled: Boolean(token),
    staleTime: 60 * 1000,
  });

  if (occurrencesQuery.isLoading) {
    return (
      <tr className="sku-row">
        <td colSpan={9}>Carregando ocorrências…</td>
      </tr>
    );
  }

  const items = occurrencesQuery.data?.items ?? [];
  if (items.length === 0) {
    return (
      <tr className="sku-row">
        <td colSpan={9}>Nenhuma ocorrência neste recorte.</td>
      </tr>
    );
  }

  return (
    <>
      {items.map((item) => (
        <tr key={item.id} className="sku-row">
          <td />
          <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatBrDate(item.windowDate)}</td>
          <td colSpan={2}>
            <strong style={{ fontSize: "0.84rem" }}>{item.customerName ?? item.chatName ?? "—"}</strong>
            {item.isGroup ? <small style={{ color: "#94a3b8" }}> (grupo)</small> : null}
            {item.agentName ? <small style={{ color: "#94a3b8" }}> · {item.agentName}</small> : null}
          </td>
          <td><CategoryPill category={item.category} /></td>
          <td><SeverityPill severity={item.severity} /></td>
          <td colSpan={3}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 260, maxWidth: 560 }}>
              <span>{item.detail || "—"}</span>
              {item.quote ? (
                <span style={{ fontStyle: "italic", color: "#64748b", fontSize: "0.8rem" }}>“{item.quote}”</span>
              ) : null}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

function ProductComplaintsTab() {
  const { token } = useAuth();
  const [periodDays, setPeriodDays] = useState<PeriodDays>(90);
  const [category, setCategory] = useState<CategoryFilter>("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(40);

  const dateFrom = periodDays > 0 ? isoDaysAgo(periodDays) : undefined;

  const reportQuery = useQuery({
    queryKey: ["product-complaints-models", dateFrom, category],
    queryFn: () => api.getProductComplaintsModelReport(token!, {
      dateFrom,
      category: category || undefined,
    }),
    enabled: Boolean(token),
    staleTime: 60 * 1000,
  });

  const months = reportQuery.data?.months ?? [];
  const allModels = useMemo(() => reportQuery.data?.models ?? [], [reportQuery.data?.models]);

  const filteredModels = useMemo(() => {
    const term = search.trim().toUpperCase();
    const rows = term ? allModels.filter((row) => row.model.includes(term)) : allModels;
    const sorted = [...rows];
    if (sortKey === "clients") {
      sorted.sort((left, right) => right.distinctClients - left.distinctClients || right.total - left.total);
    } else if (sortKey === "lastDate") {
      sorted.sort((left, right) => right.lastDate.localeCompare(left.lastDate) || right.total - left.total);
    } else {
      sorted.sort((left, right) => right.total - left.total || right.lastDate.localeCompare(left.lastDate));
    }
    return sorted;
  }, [allModels, search, sortKey]);

  const totals = useMemo(() => {
    let records = 0;
    let defects = 0;
    let multiClient = 0;
    for (const row of filteredModels) {
      records += row.total;
      defects += row.defects;
      if (row.distinctClients >= 3) multiClient += 1;
    }
    return { records, defects, multiClient, models: filteredModels.length };
  }, [filteredModels]);

  const visibleModels = filteredModels.slice(0, visibleCount);

  function toggleModel(model: string) {
    setExpandedModel((current) => (current === model ? null : model));
  }

  return (
    <div className="page-stack invsales-stack" style={{ paddingTop: 0 }}>
      <p className="invsales-section-sub" style={{ margin: 0, maxWidth: 640 }}>
        Cada linha é um modelo com problema relatado no WhatsApp (capturado pela IA). Clique na linha para ver
        quem reclamou, quando e o que foi dito. 3+ clientes distintos = indício de defeito do produto.
      </p>

      {/* Filtros */}
      <section className="invsales-filterbar">
        <div className="invsales-filterbar-row">
          <div className="invsales-control">
            <span className="invsales-control-label">Período</span>
            <div className="invsales-seg" role="group" aria-label="Período">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={periodDays === option.value ? "active" : ""}
                  onClick={() => { setPeriodDays(option.value); setExpandedModel(null); setVisibleCount(40); }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Categoria</span>
            <div className="invsales-seg" role="group" aria-label="Categoria">
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={category === option.value ? "active" : ""}
                  onClick={() => { setCategory(option.value); setExpandedModel(null); setVisibleCount(40); }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Buscar modelo</span>
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setVisibleCount(40); }}
              placeholder="Ex.: A15, IPHONE 11, REDMI"
            />
          </div>
        </div>
      </section>

      {/* KPIs compactos */}
      <section className="invsales-kpi-grid">
        <article className="invsales-kpi">
          <span className="invsales-kpi-label">
            <PackageSearch size={14} /> Modelos com problema
          </span>
          <strong className="invsales-kpi-value">{reportQuery.isLoading ? "…" : totals.models}</strong>
          <div className="invsales-kpi-foot">
            <span className="invsales-kpi-hint">no recorte selecionado</span>
          </div>
        </article>
        <article className="invsales-kpi">
          <span className="invsales-kpi-label">
            <MessageSquareWarning size={14} /> Ocorrências
          </span>
          <strong className="invsales-kpi-value">{reportQuery.isLoading ? "…" : totals.records}</strong>
          <div className="invsales-kpi-foot">
            <span className="invsales-kpi-hint">conversas com problema de produto</span>
          </div>
        </article>
        <article className="invsales-kpi">
          <span className="invsales-kpi-label">
            <Wrench size={14} /> Defeitos
          </span>
          <strong className="invsales-kpi-value">{reportQuery.isLoading ? "…" : totals.defects}</strong>
          <div className="invsales-kpi-foot">
            <span className="invsales-kpi-hint">ocorrências mais graves</span>
          </div>
        </article>
        <article className="invsales-kpi">
          <span className="invsales-kpi-label">
            <Users size={14} /> Modelos com 3+ clientes
          </span>
          <strong className="invsales-kpi-value" style={totals.multiClient > 0 ? { color: "#dc2626" } : undefined}>
            {reportQuery.isLoading ? "…" : totals.multiClient}
          </strong>
          <div className="invsales-kpi-foot">
            <span className="invsales-kpi-hint">indício de defeito do produto</span>
          </div>
        </article>
      </section>

      {/* Tabela de modelos */}
      <section className="panel">
        <div className="invsales-section-head">
          <div>
            <p className="eyebrow">A lista completa</p>
            <h3>Modelos com reclamação</h3>
            <p className="invsales-section-sub">
              Clique numa linha para abrir as ocorrências do modelo (cliente, data e o que foi dito).
              Clique nos títulos das colunas para reordenar.
            </p>
          </div>
        </div>

        <div className="invsales-table-wrap">
          <table className="invsales-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Modelo</th>
                <th className="num">
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sortKey === "total" ? "active" : ""}`}
                    onClick={() => setSortKey("total")}
                  >
                    Ocorrências
                  </button>
                </th>
                <th className="num">% do total</th>
                <th className="num">
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sortKey === "clients" ? "active" : ""}`}
                    onClick={() => setSortKey("clients")}
                  >
                    Clientes
                  </button>
                </th>
                <th>Categorias</th>
                <th>Pior atenção</th>
                <th>Mês a mês</th>
                <th>
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sortKey === "lastDate" ? "active" : ""}`}
                    onClick={() => setSortKey("lastDate")}
                  >
                    Última
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleModels.map((row: ProductComplaintModelRow, index) => {
                const isExpanded = expandedModel === row.model;
                const share = totals.records > 0 ? (row.total / totals.records) * 100 : 0;
                return (
                  <ModelRowGroup
                    key={row.model}
                    row={row}
                    rank={index + 1}
                    share={share}
                    months={months}
                    isExpanded={isExpanded}
                    onToggle={() => toggleModel(row.model)}
                    dateFrom={dateFrom}
                    category={category}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredModels.length > visibleCount ? (
          <div className="invsales-table-foot">
            <button type="button" className="ghost-button" onClick={() => setVisibleCount((current) => current + 40)}>
              Mostrar mais {Math.min(40, filteredModels.length - visibleCount)}
            </button>
          </div>
        ) : null}

        {!reportQuery.isLoading && filteredModels.length === 0 ? (
          <div className="invsales-empty">
            <AlertTriangle size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            {search
              ? `Nenhum modelo bate com "${search.trim().toUpperCase()}" neste recorte.`
              : "Nenhuma ocorrência ainda — o histórico é alimentado pela análise diária de conversas da Inteligência de Mensagens."}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ModelRowGroup({ row, rank, share, months, isExpanded, onToggle, dateFrom, category }: {
  row: ProductComplaintModelRow;
  rank: number;
  share: number;
  months: string[];
  isExpanded: boolean;
  onToggle: () => void;
  dateFrom?: string;
  category?: CategoryFilter;
}) {
  const isProductIssue = row.distinctClients >= 3;
  return (
    <>
      <tr className={`group-row ${isExpanded ? "open" : ""}`} onClick={onToggle}>
        <td className="invsales-rank">{rank}</td>
        <td>
          <div className="invsales-cell-main" style={{ minWidth: 150 }}>
            <strong>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {row.model}
            </strong>
            {isProductIssue ? (
              <small style={{ color: "#dc2626", fontWeight: 700 }}>{row.distinctClients} clientes — possível defeito do produto</small>
            ) : (
              <small>desde {formatBrDate(row.firstDate)}</small>
            )}
          </div>
        </td>
        <td className="num"><strong>{row.total}</strong></td>
        <td className="num">
          <div className="invsales-share">
            <span className="invsales-share-track">
              <i style={{ width: `${Math.min(share, 100)}%`, background: "#dc2626" }} />
            </span>
            {share >= 0.1 ? formatPercent(share) : "<0,1%"}
          </div>
        </td>
        <td className="num" style={isProductIssue ? { color: "#dc2626", fontWeight: 700 } : undefined}>
          {row.distinctClients}
        </td>
        <td>
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
            {row.complaints > 0 ? <CategoryPill category="reclamacao" count={row.complaints} /> : null}
            {row.defects > 0 ? <CategoryPill category="defeito" count={row.defects} /> : null}
          </div>
        </td>
        <td><SeverityPill severity={row.worstSeverity} /></td>
        <td><Sparkline values={row.monthly} months={months} /></td>
        <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatBrDate(row.lastDate)}</td>
      </tr>
      {isExpanded ? <ModelOccurrences model={row.model} dateFrom={dateFrom} category={category} /> : null}
    </>
  );
}

// ── Reclamações Gerais (atendimento/vendedora, nao ligadas a produto) ──

type GeneralCategoryFilter = "" | "atendimento" | "vendedora" | "entrega" | "cobranca" | "outro";
type GeneralSortKey = "total" | "lastDate";

const GENERAL_CATEGORY_OPTIONS: { label: string; value: GeneralCategoryFilter }[] = [
  { label: "Todas", value: "" },
  { label: "Atendimento", value: "atendimento" },
  { label: "Vendedora", value: "vendedora" },
  { label: "Entrega", value: "entrega" },
  { label: "Cobrança", value: "cobranca" },
  { label: "Outro", value: "outro" },
];

const GENERAL_CATEGORY_META: Record<string, { label: string; color: string; soft: string }> = {
  atendimento: { label: "Atendimento", color: "#c2410c", soft: "rgba(194, 65, 12, 0.12)" },
  vendedora: { label: "Vendedora", color: "#7c3aed", soft: "rgba(124, 58, 237, 0.12)" },
  entrega: { label: "Entrega", color: "#0e7490", soft: "rgba(8, 145, 178, 0.1)" },
  cobranca: { label: "Cobrança", color: "#92600a", soft: "rgba(208, 154, 41, 0.16)" },
  outro: { label: "Outro", color: "#475569", soft: "rgba(148, 163, 184, 0.16)" },
};

function GeneralCategoryPill({ category }: { category: string }) {
  const meta = GENERAL_CATEGORY_META[category] ?? GENERAL_CATEGORY_META.outro!;
  return (
    <span className="invsales-pill" style={{ background: meta.soft, color: meta.color }}>
      {meta.label}
    </span>
  );
}

function GeneralComplaintsTab() {
  const { token } = useAuth();
  const [periodDays, setPeriodDays] = useState<PeriodDays>(90);
  const [category, setCategory] = useState<GeneralCategoryFilter>("");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<GeneralSortKey>("total");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const dateFrom = periodDays > 0 ? isoDaysAgo(periodDays) : undefined;

  const filters = useMemo(() => ({
    dateFrom,
    category: category || undefined,
    agentName: agentFilter || undefined,
  }), [dateFrom, category, agentFilter]);

  const overviewQuery = useQuery({
    queryKey: ["general-complaints-overview", filters],
    queryFn: () => api.getGeneralComplaintsOverview(token!, filters),
    enabled: Boolean(token),
    staleTime: 60 * 1000,
  });

  const listQuery = useQuery({
    queryKey: ["general-complaints-list", filters, page],
    queryFn: () => api.listGeneralComplaints(token!, filters, { page, pageSize }),
    enabled: Boolean(token),
  });

  const overview = overviewQuery.data;
  const list = listQuery.data;
  const totalPages = list ? Math.max(1, Math.ceil(list.total / pageSize)) : 1;

  const sortedRanking = useMemo(() => {
    const rows = overview?.agentRanking ?? [];
    const sorted = [...rows];
    if (sortKey === "lastDate") {
      sorted.sort((left, right) => right.lastDate.localeCompare(left.lastDate) || right.total - left.total);
    } else {
      sorted.sort((left, right) => right.total - left.total || right.lastDate.localeCompare(left.lastDate));
    }
    return sorted;
  }, [overview?.agentRanking, sortKey]);

  return (
    <div className="page-stack invsales-stack" style={{ paddingTop: 0 }}>
      <p className="invsales-section-sub" style={{ margin: 0, maxWidth: 640 }}>
        Reclamações capturadas pela IA que NÃO são sobre o produto: atendimento lento, vendedora rude,
        prazo de entrega, cobrança errada. Use para identificar se um problema é de uma vendedora específica
        ou da operação em geral.
      </p>

      {/* Filtros */}
      <section className="invsales-filterbar">
        <div className="invsales-filterbar-row">
          <div className="invsales-control">
            <span className="invsales-control-label">Período</span>
            <div className="invsales-seg" role="group" aria-label="Período">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={periodDays === option.value ? "active" : ""}
                  onClick={() => { setPeriodDays(option.value); setPage(1); }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="invsales-control">
            <span className="invsales-control-label">Categoria</span>
            <div className="invsales-seg" role="group" aria-label="Categoria">
              {GENERAL_CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={category === option.value ? "active" : ""}
                  onClick={() => { setCategory(option.value); setPage(1); }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {agentFilter ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => { setAgentFilter(""); setPage(1); }}
              style={{ fontSize: "0.83rem" }}
            >
              Limpar filtro: <strong>{agentFilter}</strong> ✕
            </button>
          ) : null}
        </div>
      </section>

      {/* KPIs compactos */}
      <section className="invsales-kpi-grid">
        <article className="invsales-kpi">
          <span className="invsales-kpi-label">
            <MessageSquareWarning size={14} /> Reclamações gerais
          </span>
          <strong className="invsales-kpi-value">{overviewQuery.isLoading ? "…" : overview?.summary.total ?? 0}</strong>
          <div className="invsales-kpi-foot">
            <span className="invsales-kpi-hint">no recorte selecionado</span>
          </div>
        </article>
        <article className="invsales-kpi">
          <span className="invsales-kpi-label">
            <Users size={14} /> Clientes distintos
          </span>
          <strong className="invsales-kpi-value">{overviewQuery.isLoading ? "…" : overview?.summary.distinctClients ?? 0}</strong>
          <div className="invsales-kpi-foot">
            <span className="invsales-kpi-hint">reclamando de atendimento</span>
          </div>
        </article>
        <article className="invsales-kpi">
          <span className="invsales-kpi-label">
            <Wrench size={14} /> Vendedoras envolvidas
          </span>
          <strong className="invsales-kpi-value">{overviewQuery.isLoading ? "…" : overview?.summary.distinctAgents ?? 0}</strong>
          <div className="invsales-kpi-foot">
            <span className="invsales-kpi-hint">com pelo menos 1 reclamação</span>
          </div>
        </article>
      </section>

      {/* Ranking por vendedora */}
      <section className="panel">
        <div className="invsales-section-head">
          <div>
            <p className="eyebrow">Quem tem mais reclamações</p>
            <h3>Ranking por vendedora</h3>
            <p className="invsales-section-sub">Clique numa linha para ver só as reclamações dessa pessoa no histórico abaixo.</p>
          </div>
        </div>

        <div className="invsales-table-wrap">
          <table className="invsales-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Vendedora</th>
                <th className="num">
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sortKey === "total" ? "active" : ""}`}
                    onClick={() => setSortKey("total")}
                  >
                    Reclamações
                  </button>
                </th>
                <th className="num">Clientes</th>
                <th>
                  <button
                    type="button"
                    className={`invsales-sort-btn ${sortKey === "lastDate" ? "active" : ""}`}
                    onClick={() => setSortKey("lastDate")}
                  >
                    Última
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRanking.map((row, index) => (
                <tr
                  key={row.agent}
                  className={`group-row ${agentFilter === row.agent ? "open" : ""}`}
                  onClick={() => { setAgentFilter(row.agent === "Não identificado" ? "" : row.agent); setPage(1); }}
                >
                  <td className="invsales-rank">{index + 1}</td>
                  <td><strong style={{ fontSize: "0.9rem" }}>{row.agent}</strong></td>
                  <td className="num"><strong>{row.total}</strong></td>
                  <td className="num">{row.distinctClients}</td>
                  <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatBrDate(row.lastDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!overviewQuery.isLoading && sortedRanking.length === 0 ? (
          <div className="invsales-empty">
            Nenhuma reclamação geral ainda — alimentada pela análise diária de conversas da Inteligência de Mensagens.
          </div>
        ) : null}
      </section>

      {/* Histórico */}
      <section className="panel">
        <div className="invsales-section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <p className="eyebrow">Histórico</p>
            <h3>Ocorrências{agentFilter ? ` — ${agentFilter}` : ""}{list ? ` (${list.total})` : ""}</h3>
          </div>
          {totalPages > 1 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                <ChevronDown size={14} style={{ transform: "rotate(90deg)" }} />
              </button>
              <span style={{ fontSize: "0.85rem" }}>{page} / {totalPages}</span>
              <button type="button" className="ghost-button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          ) : null}
        </div>

        {listQuery.isLoading ? (
          <p style={{ color: "#64748b" }}>Carregando…</p>
        ) : (list?.items.length ?? 0) === 0 ? (
          <div className="invsales-empty">
            <AlertTriangle size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            Nenhuma ocorrência encontrada neste recorte.
          </div>
        ) : (
          <div className="invsales-table-wrap">
            <table className="invsales-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Categoria</th>
                  <th>Vendedora</th>
                  <th>Cliente</th>
                  <th>Atenção</th>
                  <th>O que aconteceu</th>
                </tr>
              </thead>
              <tbody>
                {list!.items.map((item) => (
                  <tr key={item.id} className="sku-row">
                    <td style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatBrDate(item.windowDate)}</td>
                    <td><GeneralCategoryPill category={item.category} /></td>
                    <td>{item.agentName ?? "—"}</td>
                    <td>
                      <strong style={{ fontSize: "0.84rem" }}>{item.customerName ?? item.chatName ?? "—"}</strong>
                      {item.isGroup ? <small style={{ color: "#94a3b8" }}> (grupo)</small> : null}
                    </td>
                    <td><SeverityPill severity={item.severity} /></td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 260, maxWidth: 560 }}>
                        <span>{item.detail || "—"}</span>
                        {item.quote ? (
                          <span style={{ fontStyle: "italic", color: "#64748b", fontSize: "0.8rem" }}>“{item.quote}”</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type ComplaintsTabKey = "produto" | "geral";

export function ProductComplaintsPage() {
  const [activeTab, setActiveTab] = useState<ComplaintsTabKey>("produto");

  return (
    <div className="page-stack">
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        flexWrap: "wrap", gap: "1rem", marginBottom: "0.5rem",
      }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>WhatsApp × Inteligência</p>
          <h2 className="premium-header-title" style={{ margin: "0.25rem 0 0 0" }}>Reclamações</h2>
        </div>
        <div className="customers-view-switcher" role="tablist" style={{ margin: 0, padding: "0.25rem" }}>
          <button
            type="button" role="tab" aria-selected={activeTab === "produto"}
            className={`chart-switch-button ${activeTab === "produto" ? "active" : ""}`}
            onClick={() => setActiveTab("produto")}
            style={{ padding: "0.5rem 1.1rem", borderRadius: "14px" }}
          >
            <strong>📦 Produto</strong>
          </button>
          <button
            type="button" role="tab" aria-selected={activeTab === "geral"}
            className={`chart-switch-button ${activeTab === "geral" ? "active" : ""}`}
            onClick={() => setActiveTab("geral")}
            style={{ padding: "0.5rem 1.1rem", borderRadius: "14px" }}
          >
            <strong>🗣️ Geral</strong>
          </button>
        </div>
      </div>

      {activeTab === "produto" ? <ProductComplaintsTab /> : <GeneralComplaintsTab />}
    </div>
  );
}
