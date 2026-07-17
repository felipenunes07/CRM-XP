import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MessageSquareWarning,
  PackageSearch,
  RefreshCw,
  Search,
  Users,
  Wrench,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api, type ProductComplaintsFilters } from "../lib/api";

const CATEGORY_META: Record<string, { label: string; color: string; soft: string }> = {
  reclamacao: { label: "Reclamação", color: "#ef4444", soft: "rgba(239, 68, 68, 0.1)" },
  defeito: { label: "Defeito", color: "#f97316", soft: "rgba(249, 115, 22, 0.1)" },
  troca: { label: "Troca / Devolução", color: "#eab308", soft: "rgba(234, 179, 8, 0.12)" },
  duvida: { label: "Dúvida técnica", color: "#3b82f6", soft: "rgba(59, 130, 246, 0.1)" },
  outro: { label: "Outro", color: "#64748b", soft: "rgba(100, 116, 139, 0.1)" },
};

const SEVERITY_META: Record<string, { label: string; color: string }> = {
  critical: { label: "Crítico", color: "#dc2626" },
  high: { label: "Alto", color: "#ea580c" },
  medium: { label: "Médio", color: "#ca8a04" },
  low: { label: "Baixo", color: "#0891b2" },
  none: { label: "—", color: "#94a3b8" },
};

const PERIOD_OPTIONS: { label: string; days: number | null }[] = [
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "12 meses", days: 365 },
  { label: "Tudo", days: null },
];

function formatBrDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const index = Number(m) - 1;
  return names[index] ? `${names[index]}/${y?.slice(2)}` : month;
}

function isoDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function CategoryBadge({ category }: { category: string }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.outro!;
  return (
    <span style={{
      display: "inline-block", padding: "0.2rem 0.6rem", borderRadius: "999px",
      fontSize: "0.75rem", fontWeight: 600, color: meta.color, background: meta.soft,
      border: `1px solid ${meta.color}33`, whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function StatCard({ icon, label, value, hint, color }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  color: string;
}) {
  return (
    <div className="panel" style={{ padding: "1.1rem 1.25rem", display: "flex", gap: "0.9rem", alignItems: "center" }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center",
        justifyContent: "center", color, background: `${color}1a`, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p className="eyebrow" style={{ margin: 0 }}>{label}</p>
        <p style={{ margin: "0.1rem 0 0 0", fontSize: "1.45rem", fontWeight: 700, lineHeight: 1.1 }}>{value}</p>
        {hint ? <p style={{ margin: "0.15rem 0 0 0", fontSize: "0.78rem", color: "var(--muted-foreground, #64748b)" }}>{hint}</p> : null}
      </div>
    </div>
  );
}

function MonthlyBars({ monthly }: { monthly: Array<{ month: string; total: number; distinctClients: number }> }) {
  const max = Math.max(1, ...monthly.map((entry) => entry.total));
  if (monthly.length === 0) {
    return <p style={{ color: "var(--muted-foreground, #64748b)", fontSize: "0.9rem" }}>Sem registros no período.</p>;
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "0.65rem", height: 130, paddingTop: "0.5rem" }}>
      {monthly.map((entry) => (
        <div key={entry.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem", minWidth: 0 }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>{entry.total}</span>
          <div
            title={`${entry.total} registro(s), ${entry.distinctClients} cliente(s)`}
            style={{
              width: "100%", maxWidth: 42, borderRadius: "8px 8px 3px 3px",
              height: `${Math.max(6, Math.round((entry.total / max) * 90))}px`,
              background: "linear-gradient(180deg, #f87171, #dc2626)",
            }}
          />
          <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground, #64748b)", whiteSpace: "nowrap" }}>
            {formatMonthLabel(entry.month)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ProductComplaintsPage() {
  const { token } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState<"" | "reclamacao" | "defeito" | "troca" | "duvida">("");
  const [periodDays, setPeriodDays] = useState<number | null>(90);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const filters = useMemo<ProductComplaintsFilters>(() => ({
    model: model || undefined,
    category: category || undefined,
    dateFrom: periodDays ? isoDaysAgo(periodDays) : undefined,
  }), [model, category, periodDays]);

  const overviewQuery = useQuery({
    queryKey: ["product-complaints-overview", filters],
    queryFn: () => api.getProductComplaintsOverview(token!, filters),
    enabled: Boolean(token),
  });

  const listQuery = useQuery({
    queryKey: ["product-complaints-list", filters, page],
    queryFn: () => api.listProductComplaints(token!, filters, { page, pageSize }),
    enabled: Boolean(token),
  });

  const overview = overviewQuery.data;
  const list = listQuery.data;
  const totalPages = list ? Math.max(1, Math.ceil(list.total / pageSize)) : 1;

  const applySearch = (value: string) => {
    setModel(value.trim());
    setPage(1);
  };

  return (
    <div className="page-stack">
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: "1rem", marginBottom: "0.5rem",
        borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem",
      }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>WhatsApp × Produtos</p>
          <h2 className="premium-header-title" style={{ margin: "0.25rem 0 0 0" }}>Reclamações de Produto</h2>
          <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.88rem", color: "var(--muted-foreground, #64748b)", maxWidth: 640 }}>
            Histórico permanente de reclamações, defeitos, trocas e dúvidas capturadas pela IA nas conversas do WhatsApp,
            ligadas ao modelo do produto. Busque um modelo (ex.: A15) para ver quem reclamou e quando.
          </p>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => { overviewQuery.refetch(); listQuery.refetch(); }}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
        >
          <RefreshCw size={15} /> Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="panel" style={{ padding: "1rem 1.25rem", display: "flex", flexWrap: "wrap", gap: "0.85rem", alignItems: "center" }}>
        <form
          onSubmit={(event) => { event.preventDefault(); applySearch(searchInput); }}
          style={{ display: "flex", gap: "0.5rem", alignItems: "center", flex: "1 1 280px", minWidth: 240 }}
        >
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar modelo — ex.: A15, IPHONE 11, MOTO G54"
              style={{ width: "100%", paddingLeft: "2.2rem" }}
            />
          </div>
          <button type="submit" className="primary-button" style={{ whiteSpace: "nowrap" }}>Buscar</button>
        </form>

        <select
          value={category}
          onChange={(event) => { setCategory(event.target.value as typeof category); setPage(1); }}
          style={{ minWidth: 160 }}
        >
          <option value="">Todas as categorias</option>
          <option value="reclamacao">Reclamação</option>
          <option value="defeito">Defeito</option>
          <option value="troca">Troca / Devolução</option>
          <option value="duvida">Dúvida técnica</option>
        </select>

        <div className="customers-view-switcher" role="tablist" style={{ margin: 0, padding: "0.2rem" }}>
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              role="tab"
              aria-selected={periodDays === option.days}
              className={`chart-switch-button ${periodDays === option.days ? "active" : ""}`}
              onClick={() => { setPeriodDays(option.days); setPage(1); }}
              style={{ padding: "0.4rem 0.9rem", borderRadius: "12px", fontSize: "0.82rem" }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {model ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() => { setModel(""); setSearchInput(""); setPage(1); }}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.83rem" }}
          >
            <ArrowLeft size={14} /> Limpar filtro: <strong>{model.toUpperCase()}</strong>
          </button>
        ) : null}
      </div>

      {/* Summary cards */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.9rem" }}>
        <StatCard
          icon={<MessageSquareWarning size={20} />}
          label={model ? `Registros (${model.toUpperCase()})` : "Registros no período"}
          value={overview?.summary.total ?? "…"}
          hint={overview?.summary.lastDate ? `Último em ${formatBrDate(overview.summary.lastDate)}` : undefined}
          color="#dc2626"
        />
        <StatCard
          icon={<Users size={20} />}
          label="Clientes distintos"
          value={overview?.summary.distinctClients ?? "…"}
          hint={
            model && overview
              ? overview.summary.distinctClients >= 3
                ? "3+ clientes: indício de problema do PRODUTO"
                : overview.summary.distinctClients === 1 && overview.summary.total > 1
                  ? "1 cliente repetindo: caso pontual"
                  : undefined
              : undefined
          }
          color="#2563eb"
        />
        <StatCard
          icon={<PackageSearch size={20} />}
          label="Modelos afetados"
          value={overview?.summary.distinctModels ?? "…"}
          color="#7c3aed"
        />
        <StatCard
          icon={<Wrench size={20} />}
          label="Defeitos + trocas"
          value={overview ? overview.summary.defects + overview.summary.returns : "…"}
          hint={overview ? `${overview.summary.complaints} reclamações, ${overview.summary.questions} dúvidas` : undefined}
          color="#ea580c"
        />
      </section>

      <section className="grid-two" style={{ alignItems: "start" }}>
        {/* Monthly trend */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Evolução mensal</p>
              <h3>{model ? `Ocorrências do ${model.toUpperCase()}` : "Ocorrências por mês"}</h3>
            </div>
          </div>
          <MonthlyBars monthly={overview?.monthly ?? []} />
        </div>

        {/* Top models or top clients */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{model ? "Quem reclamou" : "Ranking"}</p>
              <h3>{model ? "Clientes deste modelo" : "Modelos com mais problemas"}</h3>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {(model ? (overview?.topClients ?? []) : []).map((client) => (
              <div key={client.client} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem",
                padding: "0.55rem 0.75rem", borderRadius: 10, border: "1px solid var(--border-color)",
              }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {client.client}
                </span>
                <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground, #64748b)", whiteSpace: "nowrap" }}>
                  {client.total}× · último {formatBrDate(client.lastDate)}
                </span>
              </div>
            ))}
            {(!model ? (overview?.topModels ?? []) : []).map((entry) => (
              <button
                key={entry.model}
                type="button"
                onClick={() => { setSearchInput(entry.model); applySearch(entry.model); }}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem",
                  padding: "0.55rem 0.75rem", borderRadius: 10, border: "1px solid var(--border-color)",
                  background: "transparent", cursor: "pointer", textAlign: "left", width: "100%",
                  color: "inherit", font: "inherit",
                }}
                title={`Filtrar por ${entry.model}`}
              >
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{entry.model}</span>
                <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground, #64748b)", whiteSpace: "nowrap" }}>
                  {entry.total} registro(s) · {entry.distinctClients} cliente(s)
                </span>
              </button>
            ))}
            {overview && (model ? overview.topClients.length === 0 : overview.topModels.length === 0) ? (
              <p style={{ color: "var(--muted-foreground, #64748b)", fontSize: "0.9rem", margin: 0 }}>
                Nenhum registro ainda. Os dados aparecem conforme a IA analisa as conversas do dia.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* History list */}
      <div className="panel">
        <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <p className="eyebrow">Histórico</p>
            <h3>
              {model ? `Ocorrências do ${model.toUpperCase()}` : "Todas as ocorrências"}
              {list ? ` (${list.total})` : ""}
            </h3>
          </div>
          {totalPages > 1 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                <ChevronLeft size={15} />
              </button>
              <span style={{ fontSize: "0.85rem" }}>{page} / {totalPages}</span>
              <button type="button" className="ghost-button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                <ChevronRight size={15} />
              </button>
            </div>
          ) : null}
        </div>

        {listQuery.isLoading ? (
          <p style={{ color: "var(--muted-foreground, #64748b)" }}>Carregando…</p>
        ) : (list?.items.length ?? 0) === 0 ? (
          <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--muted-foreground, #64748b)" }}>
            <AlertTriangle size={28} style={{ opacity: 0.5 }} />
            <p style={{ margin: "0.75rem 0 0.25rem 0", fontWeight: 600 }}>Nenhuma ocorrência encontrada</p>
            <p style={{ margin: 0, fontSize: "0.88rem" }}>
              {model
                ? `Nenhum registro para "${model.toUpperCase()}" no período selecionado.`
                : "O histórico é alimentado automaticamente pela análise diária de conversas da Inteligência de Mensagens."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {list!.items.map((item) => {
              const severity = SEVERITY_META[item.severity] ?? SEVERITY_META.none!;
              return (
                <div key={item.id} style={{
                  border: "1px solid var(--border-color)", borderRadius: 12, padding: "0.85rem 1rem",
                  display: "flex", flexDirection: "column", gap: "0.4rem",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "0.95rem" }}>{item.modelNormalized}</strong>
                      <CategoryBadge category={item.category} />
                      {item.severity !== "none" ? (
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: severity.color }}>
                          Atenção: {severity.label}
                        </span>
                      ) : null}
                    </div>
                    <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground, #64748b)", whiteSpace: "nowrap" }}>
                      {formatBrDate(item.windowDate)}
                    </span>
                  </div>
                  {item.detail ? <p style={{ margin: 0, fontSize: "0.9rem" }}>{item.detail}</p> : null}
                  {item.quote ? (
                    <p style={{
                      margin: 0, fontSize: "0.85rem", fontStyle: "italic",
                      color: "var(--muted-foreground, #64748b)", borderLeft: "3px solid var(--border-color)", paddingLeft: "0.6rem",
                    }}>
                      “{item.quote}”
                    </p>
                  ) : null}
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.78rem", color: "var(--muted-foreground, #64748b)" }}>
                    <span>Cliente: <strong style={{ color: "var(--foreground)" }}>{item.customerName ?? item.chatName ?? "—"}</strong>{item.isGroup ? " (grupo)" : ""}</span>
                    {item.agentName ? <span>Vendedora: {item.agentName}</span> : null}
                    <span>Origem: {item.source === "ai" ? "análise IA" : "backfill"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
