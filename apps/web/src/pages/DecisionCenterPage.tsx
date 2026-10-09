import type { DecisionCenterResponse } from "@olist-crm/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Banknote,
  CircleAlert,
  Clock3,
  Gauge,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  Target,
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
  { key: "decisions", label: "Pedidos para decidir", helper: "Propostas que ultrapassam o limite" },
  { key: "sales", label: "Vender hoje", helper: "Crédito disponível combinado com estoque" },
  { key: "recovery", label: "Recuperar clientes", helper: "Clientes perdendo ritmo de compra" },
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
  const [activeQueue, setActiveQueue] = useState<QueueKey>("decisions");
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
          <h1>O que precisa de decisão hoje</h1>
          <p>Pedidos, oportunidades e clientes organizados por impacto — sem procurar em várias telas.</p>
        </div>
        <div className="decision-hero-actions">
          <span>Atualizado {formatDateTime(data.generatedAt)}</span>
          <button type="button" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "is-spinning" : ""} />
            Atualizar
          </button>
        </div>
      </header>

      <section className="decision-summary-grid" aria-label="Resumo da central">
        <article className="decision-summary-card is-danger">
          <span className="decision-summary-icon"><CircleAlert size={21} /></span>
          <div><strong>{data.summary.decisionsCount}</strong><span>pedidos para decidir</span></div>
          <small>{formatCurrency(data.summary.decisionsValue)} em propostas</small>
        </article>
        <article className="decision-summary-card is-money">
          <span className="decision-summary-icon"><Banknote size={21} /></span>
          <div><strong>{formatCurrency(data.summary.requiredPaymentTotal)}</strong><span>pagamento necessário</span></div>
          <small>para enquadrar as propostas</small>
        </article>
        <article className="decision-summary-card is-opportunity">
          <span className="decision-summary-icon"><TrendingUp size={21} /></span>
          <div><strong>{data.summary.salesCount}</strong><span>oportunidades prontas</span></div>
          <small>{formatCurrency(data.summary.salesPotential)} sugeridos</small>
        </article>
        <article className="decision-summary-card is-recovery">
          <span className="decision-summary-icon"><UserRoundSearch size={21} /></span>
          <div><strong>{data.summary.recoveryCount}</strong><span>clientes para recuperar</span></div>
          <small>priorizados por valor e urgência</small>
        </article>
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
          <span>{counts[activeQueue]} na fila</span>
        </div>

        {activeQueue === "decisions" && (
          <div className="decision-list">
            {decisions.map((item) => (
              <article className="decision-row is-credit" key={item.orderId}>
                <div className="decision-row-main">
                  <div className="decision-row-title">
                    <span className="decision-priority">Decidir agora</span>
                    <h3>{item.customerCode} · {item.customerName}</h3>
                    <p>Pedido {item.orderNumber} · {item.seller || "Sem vendedora"}</p>
                  </div>
                  <div className="decision-money-block"><span>Proposta</span><strong>{formatCurrency(item.orderTotal)}</strong></div>
                  <div className="decision-money-block"><span>Dívida + propostas</span><strong>{formatCurrency(item.projectedExposure)}</strong></div>
                  <div className="decision-money-block"><span>Limite</span><strong>{formatCurrency(item.effectiveLimit)}</strong></div>
                </div>
                <div className="decision-row-action">
                  <div><CircleAlert size={17} /><span>Exigir antes de liberar</span><strong>{formatCurrency(item.requiredPayment)}</strong></div>
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
          <div className="decision-card-grid">
            {sales.map((item) => (
              <article className="decision-opportunity-card" key={item.customerId}>
                <div className="decision-card-top"><span><Sparkles size={15} /> Pronto para vender</span><strong>{item.lastAttendant || "Não atribuída"}</strong></div>
                <h3>{item.customerCode} · {item.customerDisplayName}</h3>
                <p>{item.creditBalanceAmount > 0 ? "Cliente com saldo a favor" : "Cliente com crédito disponível"}</p>
                <div className="decision-card-value"><span>Venda sugerida</span><strong>{formatCurrency(item.suggestedAmount)}</strong></div>
                <div className="decision-card-meta">
                  <span><Target size={14} /> Potencial {formatCurrency(item.targetAmount)}</span>
                  <span><Clock3 size={14} /> {relativeDays(item.daysSinceLastPurchase)}</span>
                </div>
                {!!item.topModelsInStock.length && <p className="decision-products">{item.topModelsInStock.join(" · ")}</p>}
                <Link to={`/clientes/${item.customerId}`}>Abrir cliente <ArrowRight size={15} /></Link>
              </article>
            ))}
            {!sales.length && <div className="decision-empty"><TrendingUp size={28} /><strong>Nenhuma oportunidade encontrada</strong><span>Ajuste a busca ou aguarde a próxima atualização.</span></div>}
          </div>
        )}

        {activeQueue === "recovery" && (
          <div className="decision-card-grid">
            {recovery.map((item) => (
              <article className="decision-opportunity-card is-recovery" key={item.customerId}>
                <div className="decision-card-top"><span>{item.status === "INACTIVE" ? "Inativo" : "Perdendo ritmo"}</span><strong>{item.seller || "Não atribuída"}</strong></div>
                <h3>{item.customerCode ? `${item.customerCode} · ` : ""}{item.customerName}</h3>
                <p>{item.suggestedAction}</p>
                <div className="decision-card-value"><span>Ticket médio</span><strong>{formatCurrency(item.averageTicket)}</strong></div>
                <div className="decision-card-meta">
                  <span><Clock3 size={14} /> {relativeDays(item.daysSinceLastPurchase)}</span>
                  <span><Target size={14} /> Prioridade {Math.round(item.priorityScore)}</span>
                </div>
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
    return <div className="decision-state"><RefreshCw size={24} className="is-spinning" /><strong>Montando a Central de Decisão…</strong><span>Cruzando propostas, crédito, estoque e carteira.</span></div>;
  }
  if (query.isError || !query.data) {
    return <div className="decision-state is-error"><CircleAlert size={26} /><strong>Não foi possível carregar a central</strong><span>Tente novamente; nenhuma decisão foi alterada.</span><button type="button" onClick={() => query.refetch()}>Tentar novamente</button></div>;
  }

  return <DecisionCenterPageView data={query.data} refreshing={query.isFetching} onRefresh={() => query.refetch()} />;
}

