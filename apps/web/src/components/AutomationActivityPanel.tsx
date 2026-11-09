import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AutomationActivityFilter, AutomationActivityKind, MessageAutomationRun } from "@olist-crm/shared";
import { CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Clock3, MessageCircle, RefreshCw, Search, TriangleAlert, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatNumber } from "../lib/format";
import { ACTIVITY_STATUS, activityDate, activityMessageLabel, activityReason } from "./automationActivityPresentation";
import "./AutomationActivityPanel.css";

const PAGE_SIZE = 25;
const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const summaries = [
  { key: "sent", filter: "SENT", label: "Mensagens enviadas", icon: CheckCheck, tone: "sent" },
  { key: "waiting", filter: "WAITING", label: "Aguardando envio", icon: Clock3, tone: "waiting" },
  { key: "failed", filter: "FAILED", label: "Falhas no envio", icon: TriangleAlert, tone: "failed" },
  { key: "notSent", filter: "NOT_SENT", label: "Não enviadas", icon: X, tone: "skipped" },
  { key: "awaitingApproval", filter: "PENDING_APPROVAL", label: "Para aprovar", icon: MessageCircle, tone: "approval" },
] as const;

export function AutomationActivityPanel({ token, runs, canManage, onApprove, onReject, resolving, actionError, focusRunId }: {
  token: string | null; runs: MessageAutomationRun[] | undefined; canManage: boolean;
  onApprove: (id: string) => void; onReject: (id: string) => void; resolving: boolean; actionError?: string; focusRunId: string | null;
}) {
  const [date, setDate] = useState(() => activityDate());
  const [status, setStatus] = useState<AutomationActivityFilter>("ALL");
  const [kind, setKind] = useState<AutomationActivityKind>("ALL");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [runId, setRunId] = useState<string | undefined>();
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => { setAppliedSearch(search.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [search]);
  const focusRun = runs?.find(run => run.id === focusRunId);
  useEffect(() => {
    if (focusRun) { setRunId(focusRun.id); setDate(activityDate(new Date(focusRun.scheduledFor))); setStatus("ALL"); setPage(0); }
  }, [focusRun?.id]);
  const query = useQuery({
    queryKey: ["automation-activity", date, status, kind, appliedSearch, runId, page],
    queryFn: () => api.automationActivity(token!, { date, status, kind, search: appliedSearch, runId, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    enabled: Boolean(token), refetchInterval: 15000, retry: false,
  });
  const data = query.data;
  useEffect(() => { if (data && page > 0 && page * PAGE_SIZE >= data.total) setPage(Math.max(0, Math.ceil(data.total / PAGE_SIZE) - 1)); }, [data?.total, page]);
  const pending = runs?.filter(run => run.status === "PENDING_APPROVAL") ?? [];
  const selectedRun = runs?.find(run => run.id === runId);
  const checks = runs?.filter(run => activityDate(new Date(run.scheduledFor)) === date) ?? [];
  function selectDate(value: string) { if (value) { setDate(value); setRunId(undefined); setPage(0); setExpanded(null); } }
  function shiftDate(days: number) { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + days); selectDate(next.toISOString().slice(0, 10)); }
  function review(run: MessageAutomationRun) { setRunId(run.id); setDate(activityDate(new Date(run.scheduledFor))); setStatus("ALL"); setKind("ALL"); setSearch(""); setPage(0); }

  return <section className="automation-activity" aria-labelledby="automation-history-title">
    <div className="automation-history-heading"><div><span className="automation-history-eyebrow">Acompanhamento das automações</span><h2 id="automation-history-title">Envios e clientes</h2><p>Veja para quem a Lili enviou mensagens, qual regra foi usada e o que ainda precisa de atenção.</p></div>
      <button type="button" className="secondary-button" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={15} /> Atualizar</button></div>
    <div className="automation-history-date-row"><div className="automation-history-date-picker"><button type="button" aria-label="Dia anterior" onClick={() => shiftDate(-1)}><ChevronLeft size={17} /></button><label>Data dos envios<input type="date" value={date} required onChange={event => selectDate(event.target.value)} /></label><button type="button" aria-label="Próximo dia" onClick={() => shiftDate(1)}><ChevronRight size={17} /></button></div><button type="button" className="secondary-button" onClick={() => selectDate(activityDate())}>Hoje</button><span>Horários de Brasília · Atualização a cada 15 segundos</span></div>
    {pending.length > 0 ? <details className="automation-history-approvals"><summary><MessageCircle size={16} /><strong>{pending.length} {pending.length === 1 ? "envio precisa" : "envios precisam"} de aprovação</strong><span>Confira os destinatários antes de aprovar</span><ChevronDown size={15} /></summary><div>{pending.map(run => <div className="automation-history-approval-row" key={run.id}><div><strong>{run.automationName}</strong><small>{dayFormat.format(new Date(run.scheduledFor))} · {run.mappedGroupCount} grupos preparados</small></div><button type="button" className="secondary-button" onClick={() => review(run)}>Ver destinatários</button></div>)}</div></details> : null}
    <div className="automation-history-summary">{summaries.map(summary => <button type="button" key={summary.key} className={`automation-history-summary-card is-${summary.tone} ${status === summary.filter ? "is-selected" : ""}`} aria-pressed={status === summary.filter} onClick={() => { setStatus(status === summary.filter ? "ALL" : summary.filter); setPage(0); }}><summary.icon size={18} /><span>{summary.label}</span><strong>{data ? formatNumber(data.summary[summary.key]) : "—"}</strong></button>)}</div>
    <div className="automation-history-results panel">
      <div className="automation-history-list-heading"><div><h3>Clientes e grupos</h3><p>Entrar na fila ainda não significa que a mensagem foi enviada.</p></div>{data ? <span>{formatNumber(data.total)} {data.total === 1 ? "registro" : "registros"}</span> : null}</div>
      <div className="automation-history-filters"><label className="automation-history-search"><Search size={16} /><input aria-label="Buscar cliente ou grupo" placeholder="Buscar por cliente, código ou grupo…" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} /></label><label>Tipo de automação<select value={kind} onChange={event => { setKind(event.target.value as AutomationActivityKind); setPage(0); }}><option value="ALL">Todas as automações</option><option value="REACTIVATION">Clientes sem comprar</option><option value="PROSPECT">Remarketing de grupos novos</option><option value="CUSTOM">Automações personalizadas</option></select></label><label>Resultado<select value={status} onChange={event => { setStatus(event.target.value as AutomationActivityFilter); setPage(0); }}><option value="ALL">Todos os resultados</option><option value="SENT">Enviadas</option><option value="WAITING">Aguardando envio</option><option value="FAILED">Falhas no envio</option><option value="NOT_SENT">Não enviadas</option><option value="PENDING_APPROVAL">Aguardando aprovação</option></select></label></div>
      {runId ? <div className="automation-history-run-filter"><span>Mostrando destinatários de <strong>{selectedRun?.automationName ?? "uma execução"}</strong></span><button type="button" className="secondary-button" onClick={() => { setRunId(undefined); setPage(0); }}>Ver todos os envios</button></div> : null}
      {query.isPending ? <p className="automation-history-empty" role="status">Consultando os envios da data selecionada…</p> : null}
      {query.isError ? <div className="automation-history-empty" role="alert"><strong>Não foi possível consultar os envios.</strong><p>{query.error.message}</p><button type="button" className="secondary-button" onClick={() => void query.refetch()}>Tentar novamente</button></div> : null}
      {data?.items.length === 0 ? <div className="automation-history-empty"><MessageCircle size={26} /><strong>Nenhum registro com estes filtros</strong><p>{status === "ALL" && !appliedSearch && kind === "ALL" && !runId ? "Nenhuma mensagem enviada ou preparada nesta data. Confira as verificações abaixo ou escolha outra data." : "Experimente outro resultado, nome ou tipo de automação."}</p></div> : null}
      {data && data.items.length > 0 ? <><div className="automation-history-table-wrap"><table className="automation-history-table"><thead><tr><th>Cliente / grupo</th><th>Automação</th><th>Resultado</th><th>Horário</th><th>Mensagem</th></tr></thead><tbody>{data.items.map(item => {
        const badge = ACTIVITY_STATUS[item.status];
        return <Fragment key={item.id}><tr><td><strong>{item.customerId ? <Link to={`/clientes/${item.customerId}`}>{item.customerName}</Link> : item.customerName}</strong><small>{item.customerCode ?? "Sem código de cliente"}</small>{item.groupName !== item.customerName ? <span className="automation-history-group-name">{item.groupName}</span> : null}</td><td data-label="Automação"><span>{item.ruleName}</span><small>{item.kind === "PROSPECT" ? "Grupo novo sem compra" : item.kind === "REACTIVATION" ? "Reativação de clientes" : "Regra personalizada"}</small></td><td data-label="Resultado"><span className={`automation-history-badge is-${badge.tone}`}>{badge.label}</span>{item.status === "PAUSED" ? <small>Campanha pausada</small> : null}</td><td data-label="Horário"><strong>{timeFormat.format(new Date(item.eventAt))}</strong><small>{item.status === "SENT" ? "Horário do envio" : item.status === "FAILED" ? "Última tentativa" : item.status === "PENDING" || item.status === "PENDING_APPROVAL" || item.status === "PAUSED" ? "Horário previsto" : "Registro"}</small></td><td><button type="button" className="automation-history-message-button" aria-expanded={expanded === item.id} aria-label={`Ver mensagem de ${item.customerName}`} onClick={() => setExpanded(expanded === item.id ? null : item.id)}><MessageCircle size={14} /> Ver mensagem <ChevronDown size={13} /></button></td></tr>
          {expanded === item.id ? <tr className="automation-history-detail-row"><td colSpan={5}><div className="automation-history-detail"><div><strong>{activityMessageLabel(item)}</strong>{item.message ? <p className="automation-history-message-text">{item.message}</p> : <p>{item.status === "SENT" ? "O texto deste envio antigo não ficou registrado." : "Não há texto registrado para este item."}</p>}</div><aside><strong>{badge.label}</strong><p>{dayFormat.format(new Date(item.eventAt))} às {timeFormat.format(new Date(item.eventAt))} · Brasília</p><p>Grupo: {item.groupName}</p>{item.lastError ? <p className="automation-history-error">{activityReason(item.lastError)}</p> : null}{item.status === "FAILED" ? <p>O envio não foi confirmado. Confira o WhatsApp antes de tentar novamente.</p> : null}{item.status === "PENDING_APPROVAL" ? <p>A mensagem ainda não foi enviada. Aguarda sua aprovação.</p> : null}</aside></div></td></tr> : null}</Fragment>;
      })}</tbody></table></div><div className="automation-history-pagination"><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} de {data.total} registros</span><div><button type="button" className="secondary-button" disabled={page === 0 || query.isFetching} aria-label="Página anterior" onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button><button type="button" className="secondary-button" disabled={(page + 1) * PAGE_SIZE >= data.total || query.isFetching} aria-label="Próxima página" onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button></div></div></> : null}
      {selectedRun?.status === "PENDING_APPROVAL" && data ? <div className="automation-history-approval-actions"><div><strong>Enviar esta lista?</strong><p>Aprovar coloca os grupos preparados na fila. As condições de compra são verificadas novamente antes do envio.</p></div><button type="button" className="secondary-button" disabled={!canManage || resolving} onClick={() => onReject(selectedRun.id)}>Rejeitar envio</button><button type="button" className="primary-button" disabled={!canManage || resolving || query.isFetching || data.total === 0} onClick={() => onApprove(selectedRun.id)}>Aprovar e colocar na fila</button></div> : null}
      {actionError ? <p role="alert" className="automation-history-error">{actionError}</p> : null}
    </div>
    {checks.length ? <details className="automation-history-checks"><summary><Clock3 size={16} /><strong>Verificações automáticas da data</strong><span>{checks.length} {checks.length === 1 ? "verificação" : "verificações"}</span><ChevronDown size={15} /></summary><p>A Lili procura os clientes elegíveis em cada regra. Uma verificação pode terminar sem encontrar destinatários.</p>{checks.map(run => <div key={run.id}><strong>{run.automationName}</strong><time>{timeFormat.format(new Date(run.scheduledFor))}</time><span>{run.status === "NO_MATCH" ? "Nenhum grupo elegível" : run.status === "FAILED" ? "Falha ao preparar o envio" : run.status === "REJECTED" ? "Envio rejeitado" : run.status === "PENDING_APPROVAL" ? "Aguardando aprovação" : `${run.mappedGroupCount} grupos preparados · veja os resultados na lista`}</span>{run.errorMessage ? <p className="automation-history-error">{run.errorMessage}</p> : null}</div>)}</details> : null}
  </section>;
}
