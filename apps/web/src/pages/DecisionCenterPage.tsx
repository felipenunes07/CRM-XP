import type { DecisionCenterResponse } from "@olist-crm/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleAlert,
  Gauge,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  UserRoundSearch,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDateTime } from "../lib/format";
import "./decisionCenter.css";

type QueueKey = "decisions" | "sales" | "recovery";

const queueMeta: Array<{ key: QueueKey; label: string; helper: string }> = [
  { key: "decisions", label: "Liberar pedidos", helper: "Pedidos bloqueados por falta de limite" },
  { key: "sales", label: "Buscar novas vendas", helper: "Clientes que podem comprar sem estourar o limite" },
  { key: "recovery", label: "Evitar perdas", helper: "Clientes que estão demorando mais que o normal para voltar" },
];

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}
function relativeDays(days: number | null) {
  if (days === null) return "Sem data de compra";
  if (days === 0) return "Comprou hoje";
  if (days === 1) return "Há 1 dia sem comprar";
  return `Há ${days} dias sem comprar`;
}

function recoveryUrgency(status: string, days: number | null) {
  if (status === "INACTIVE" || (days ?? 0) >= 90) return "Urgência alta";
  if ((days ?? 0) >= 60) return "Urgência média";
  return "Acompanhar";
}

function sellerOptions(data: DecisionCenterResponse) {
  return [...new Set([
    ...data.creditDecisions.map((item) => item.seller),
    ...data.salesOpportunities.map((item) => item.lastAttendant),
    ...data.recoveryOpportunities.map((item) => item.seller),
  ].filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right, "pt-BR"));
}

export function DecisionCenterPageView({ data, refreshing, onRefresh }: {
  data: DecisionCenterResponse;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [activeQueue, setActiveQueue] = useState<QueueKey>(() =>
    data.creditDecisions.length ? "decisions" : data.salesOpportunities.length ? "sales" : "recovery",
  );
  const [search, setSearch] = useState("");
  const [seller, setSeller] = useState("");
  const needle = normalize(search);

  const sellers = useMemo(() => sellerOptions(data), [data]);
  const decisions = data.creditDecisions.filter((item) =>
    (!seller || item.seller === seller) &&
    (!needle || normalize([item.customerCode, item.customerName, item.orderNumber, item.seller].join(" ")).includes(needle)),
  );
  const sales = data.salesOpportunities.filter((item) =>
    (!seller || item.lastAttendant === seller) &&
    (!needle || normalize([item.customerCode, item.customerDisplayName, item.lastAttendant, ...item.topModelsInStock].join(" ")).includes(needle)),
  );
  const recovery = data.recoveryOpportunities.filter((item) =>
    (!seller || item.seller === seller) &&
    (!needle || normalize([item.customerCode, item.customerName, item.seller, item.status].join(" ")).includes(needle)),
  );

  const counts: Record<QueueKey, number> = {
    decisions: decisions.length,
    sales: sales.length,
    recovery: recovery.length,
  };

  return (
    <main className="decision-center-page">
      <header className="decision-hero">
        <div>
          <div className="decision-eyebrow"><Gauge size={15} /> Gestão / Central de Decisão</div>
          <h1>Prioridades de hoje</h1>
          <p>Veja o problema, quem é responsável e qual é a próxima ação.</p>
        </div>
        <div className="decision-hero-actions">
          <span>Atualizado {formatDateTime(data.generatedAt)}</span>
          <button type="button" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "is-spinning" : ""} />
            Atualizar
          </button>
        </div>
      </header>

      <section className="decision-overview" aria-label="Resumo da central">
        <article className={`decision-focus-card ${data.summary.decisionsCount ? "is-danger" : "is-clear"}`}>
          <span className="decision-focus-icon"><CircleAlert size={24} /></span>
          <div>
            <span className="decision-focus-label">Decisão financeira</span>
            {data.summary.decisionsCount ? (
              <><strong>{data.summary.decisionsCount} pedido{data.summary.decisionsCount === 1 ? "" : "s"} bloqueado{data.summary.decisionsCount === 1 ? "" : "s"}</strong><p>Cobrar {formatCurrency(data.summary.requiredPaymentTotal)} antes de liberar {formatCurrency(data.summary.decisionsValue)} em propostas.</p></>
            ) : (
              <><strong>Nenhum pedido bloqueado agora</strong><p>Não há proposta acima do limite que exija pagamento.</p></>
            )}
          </div>
          <button type="button" onClick={() => setActiveQueue("decisions")}>Ver pedidos <ArrowRight size={15} /></button>
        </article>
        <button type="button" className="decision-metric-card is-opportunity" onClick={() => setActiveQueue("sales")}>
          <span className="decision-summary-icon"><TrendingUp size={20} /></span>
          <span><strong>{data.summary.salesCount} clientes podem comprar</strong><small>{formatCurrency(data.summary.salesPotential)} de capacidade financeira — não é previsão de venda</small></span>
          <ArrowRight size={17} />
        </button>
        <button type="button" className="decision-metric-card is-recovery" onClick={() => setActiveQueue("recovery")}>
          <span className="decision-summary-icon"><UserRoundSearch size={20} /></span>
          <span><strong>{data.summary.recoveryCount} clientes esfriando</strong><small>Ordenados por tempo sem comprar e valor histórico</small></span>
          <ArrowRight size={17} />
        </button>
      </section>

      <section className="decision-workspace">
        <div className="decision-toolbar">
          <div className="decision-tabs" role="tablist" aria-label="Filas de decisão">
            {queueMeta.map((queue) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeQueue === queue.key}
                className={activeQueue === queue.key ? "active" : ""}
                onClick={() => setActiveQueue(queue.key)}
                key={queue.key}
              >
                <span>{queue.label}</span><strong>{counts[queue.key]}</strong>
              </button>
            ))}
          </div>
          <div className="decision-filters">
            <label>
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou pedido" />
            </label>
            <select value={seller} onChange={(event) => setSeller(event.target.value)} aria-label="Filtrar por vendedora">
              <option value="">Todas as vendedoras</option>
              {sellers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        </div>

        <div className="decision-queue-heading">
          <div>
            <h2>{queueMeta.find((queue) => queue.key === activeQueue)?.label}</h2>
            <p>{queueMeta.find((queue) => queue.key === activeQueue)?.helper}</p>
          </div>
          <span>{counts[activeQueue]} cliente{counts[activeQueue] === 1 ? "" : "s"}</span>
        </div>

        {activeQueue === "decisions" && (
          <div className="decision-list">
            {decisions.map((item) => (
              <article className="decision-row is-credit" key={item.orderId}>
                <div className="decision-row-main">
                  <div className="decision-row-title">
                    <span className="decision-priority">Bloqueado pelo crédito</span>
                    <h3>{item.customerCode} · {item.customerName}</h3>
                    <p>Pedido {item.orderNumber} · {item.seller || "Sem vendedora"}</p>
                  </div>
                  <div className="decision-money-block"><span>Proposta</span><strong>{formatCurrency(item.orderTotal)}</strong></div>
                  <div className="decision-money-block"><span>Deve + propostas</span><strong>{formatCurrency(item.projectedExposure)}</strong></div>
                  <div className="decision-money-block"><span>Limite</span><strong>{formatCurrency(item.effectiveLimit)}</strong></div>
                </div>
                <div className="decision-row-action">
                  <div><CircleAlert size={17} /><span>Cobrar antes de liberar</span><strong>{formatCurrency(item.requiredPayment)}</strong></div>
                  {item.customerId ? (
                    <Link to={`/clientes/financeiro/${item.customerId}`}>Ver financeiro <ArrowRight size={15} /></Link>
                  ) : <span className="decision-muted">Cliente não vinculado</span>}
                </div>
              </article>
            ))}
            {!decisions.length && <div className="decision-empty"><ShoppingCart size={28} /><strong>Nenhum pedido exige decisão</strong><span>As propostas dentro do limite não aparecem aqui.</span></div>}
          </div>
        )}

        {activeQueue === "sales" && (
          <div className="decision-action-list">
            {sales.map((item) => (
              <article className="decision-action-row is-sale" key={item.customerId}>
                <span className="decision-action-badge"><Sparkles size={14} /> Vender</span>
                <div className="decision-action-client">
                  <h3>{item.customerCode} · {item.customerDisplayName}</h3>
                  <p>Responsável: <strong>{item.lastAttendant || "Não atribuída"}</strong></p>
                </div>
                <div className="decision-action-reason">
                  <span>Por que aparece aqui</span>
                  <strong>{item.creditBalanceAmount > 0 ? `${formatCurrency(item.creditBalanceAmount)} de saldo a favor` : `${formatCurrency(item.availableCreditAmount)} de limite livre`}</strong>
                  <small>{relativeDays(item.daysSinceLastPurchase)}</small>
                </div>
                <div className="decision-action-next"><span>Próxima ação</span><strong>Contatar para uma nova venda</strong></div>
                <Link to={`/clientes/${item.customerId}`}>Abrir cliente <ArrowRight size={15} /></Link>
              </article>
            ))}
            {!sales.length && <div className="decision-empty"><TrendingUp size={28} /><strong>Nenhuma oportunidade encontrada</strong><span>Ajuste a busca ou aguarde a próxima atualização.</span></div>}
          </div>
        )}

        {activeQueue === "recovery" && (
          <div className="decision-action-list">
            {recovery.map((item) => (
              <article className="decision-action-row is-recovery" key={item.customerId}>
                <span className="decision-action-badge">{recoveryUrgency(item.status, item.daysSinceLastPurchase)}</span>
                <div className="decision-action-client">
                  <h3>{item.customerCode ? `${item.customerCode} · ` : ""}{item.customerName}</h3>
                  <p>Responsável: <strong>{item.seller || "Não atribuída"}</strong></p>
                </div>
                <div className="decision-action-reason">
                  <span>Por que agir agora</span>
                  <strong>{relativeDays(item.daysSinceLastPurchase)}</strong>
                  <small>Ticket médio {formatCurrency(item.averageTicket)} · Histórico {formatCurrency(item.totalSpent)}</small>
                </div>
                <div className="decision-action-next"><span>Próxima ação</span><strong>{item.suggestedAction}</strong></div>
                <Link to={`/clientes/${item.customerId}`}>Abrir cliente <ArrowRight size={15} /></Link>
              </article>
            ))}
            {!recovery.length && <div className="decision-empty"><UserRoundSearch size={28} /><strong>Nenhum cliente neste filtro</strong><span>A carteira está em dia ou o filtro não encontrou resultados.</span></div>}
          </div>
        )}
      </section>
    </main>
  );
}

export function DecisionCenterPage() {
  const { token } = useAuth();
  const query = useQuery({
    queryKey: ["decision-center"],
    queryFn: () => api.decisionCenter(token!),
    enabled: Boolean(token),
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });

  if (query.isLoading) {
    return <div className="decision-state"><RefreshCw size={24} className="is-spinning" /><strong>Montando a Central de Decisão…</strong><span>Cruzando propostas, crédito e carteira.</span></div>;
  }
  if (query.isError || !query.data) {
    return <div className="decision-state is-error"><CircleAlert size={26} /><strong>Não foi possível carregar a central</strong><span>Tente novamente; nenhuma decisão foi alterada.</span><button type="button" onClick={() => query.refetch()}>Tentar novamente</button></div>;
  }

  return <DecisionCenterPageView data={query.data} refreshing={query.isFetching} onRefresh={() => query.refetch()} />;
}

