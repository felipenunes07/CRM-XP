import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MessageAutomation } from "@olist-crm/shared";
import { ArrowRight, CalendarClock, ChevronLeft, ChevronRight, MessageCircle, RefreshCw, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatDateTime, formatNumber } from "../lib/format";
import "./LiliReactivationPanel.css";

const PAGE_SIZE = 25;
const scheduleFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const STATUS_LABELS: Record<string, string> = {
  READY: "Pronto para envio", NO_GROUP: "Vínculo pendente", MULTIPLE_GROUPS: "Revisar grupos",
  IDENTITY_CONFLICT: "Código divergente", RECENT_CONTACT: "Contato recente",
};

export function LiliReactivationPanel({ token, automations, canManage }: {
  token: string | null; automations: MessageAutomation[] | undefined; canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [stageFilter, setStageFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("READY");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const rules = automations?.filter(a => a.flowDefinition.reactivationPreset === "lili-inactivity-v1");
  const previewQuery = useQuery({
    queryKey: ["lili-reactivation-preview", rules?.map(a => `${a.id}:${a.updatedAt}`).join(",")],
    queryFn: () => api.previewLiliReactivation(token!),
    enabled: Boolean(token && rules?.length),
    refetchInterval: 60000,
    retry: false,
  });
  const prepareMutation = useMutation({
    mutationFn: () => api.prepareLiliReactivation(token!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
  const preview = previewQuery.data;
  const rows = (preview?.stages ?? []).flatMap(stage => stage.rows.map(row => ({ ...row, stage })));
  const filtered = rows.filter(row => (stageFilter === null || row.stage.days === stageFilter)
    && (statusFilter === "ALL" || (statusFilter === "PENDING" ? row.status !== "READY" : row.status === "READY"))
    && `${row.customerCode ?? ""} ${row.customerName} ${row.groupName ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .includes(search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()))
    .sort((a, b) => (a.stage.nextRunAt ?? "").localeCompare(b.stage.nextRunAt ?? "")
      || a.daysInactive - b.daysInactive || a.customerName.localeCompare(b.customerName, "pt-BR"));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const ready = rows.filter(row => row.status === "READY").length;
  const pending = rows.length - ready;
  const nextRun = preview?.stages.filter(s => s.status === "ACTIVE" && s.nextRunAt).map(s => s.nextRunAt!).sort()[0];
  const error = previewQuery.error ?? prepareMutation.error;

  return <section className="panel lili-queue" aria-labelledby="lili-queue-title">
    <div className="lili-queue-heading">
      <div><span className="lili-queue-eyebrow"><MessageCircle size={14} /> Lili Assistente</span>
        <h2 id="lili-queue-title">Próximos disparos</h2>
        <p>Reativação nos grupos dos clientes · 30, 60 e 90 dias sem comprar</p></div>
      <div className="lili-queue-heading-actions">
        <Link to="/disparador" className="lili-queue-history">Acompanhar envios <ArrowRight size={14} /></Link>
        {rules?.length ? <button type="button" className="secondary-button" disabled={previewQuery.isFetching} onClick={() => void previewQuery.refetch()}>
          <RefreshCw size={14} className={previewQuery.isFetching ? "lili-refreshing" : ""} /> Atualizar lista
        </button> : null}
      </div>
    </div>
    {error ? <p role="alert" className="lili-queue-error">Não foi possível atualizar a lista: {error.message}</p> : null}
    {!automations || (rules?.length && !preview && previewQuery.isPending) ? <p role="status">Carregando próximos disparos…</p> : null}
    {automations && !rules?.length ? <div className="lili-queue-empty">
      <p>Prepare a régua para visualizar os clientes e revisar as mensagens.</p>
      <button type="button" className="secondary-button" disabled={!canManage || prepareMutation.isPending} onClick={() => prepareMutation.mutate()}>
        {prepareMutation.isPending ? "Preparando…" : "Preparar régua 30 / 60 / 90"}
      </button></div> : null}
    {preview ? <>
      <div className="lili-queue-summary"><span><CalendarClock size={16} />
        {nextRun ? <>Próxima verificação <strong>{scheduleFormat.format(new Date(nextRun))}</strong></> : <strong>Automações pausadas</strong>}
        <small>Horário de São Paulo</small></span>
        <span>Envio pela {preview.sender.name} · +{preview.sender.phone}</span>
      </div>
      <div className="lili-queue-stages" aria-label="Filtrar por faixa de inatividade">
        <button type="button" className={stageFilter === null ? "is-selected" : ""} aria-pressed={stageFilter === null} onClick={() => { setStageFilter(null); setPage(0); }}>
          <span>Todas as faixas</span><strong>{formatNumber(ready)} <small>prontos</small></strong><small>{formatNumber(pending)} pendências para revisar</small>
        </button>
        {preview.stages.map(stage => <button type="button" key={stage.automationId} className={`lili-stage-${stage.days} ${stageFilter === stage.days ? "is-selected" : ""}`}
          aria-pressed={stageFilter === stage.days} onClick={() => { setStageFilter(stage.days); setPage(0); }}>
          <span>{stage.days === 90 ? "90 dias ou mais" : `${stage.days}–${stage.days === 30 ? 59 : 89} dias`}<i className={stage.status === "ACTIVE" ? "is-active" : ""}>{stage.status === "ACTIVE" ? "Ativa" : "Pausada"}</i></span>
          <strong>{formatNumber(stage.ready)} <small>prontos</small></strong><small>{formatNumber(stage.rows.length - stage.ready)} pendências para revisar</small>
        </button>)}
      </div>
      <div className="lili-queue-toolbar">
        <div className="lili-queue-filters" role="group" aria-label="Filtrar por situação">
          {([["READY", "Prontos"], ["PENDING", "Pendências"], ["ALL", "Todos"]] as const).map(([value, label]) =>
            <button type="button" key={value} aria-pressed={statusFilter === value} className={statusFilter === value ? "is-selected" : ""}
              onClick={() => { setStatusFilter(value); setPage(0); }}>{label}</button>)}
        </div>
        <label className="lili-queue-search"><Search size={15} /><input aria-label="Buscar cliente ou grupo" placeholder="Buscar cliente ou grupo…" value={search}
          onChange={event => { setSearch(event.target.value); setPage(0); }} /></label>
      </div>
      <div className="lili-queue-table-wrap"><table className="lili-queue-table">
        <thead><tr><th>Cliente</th><th>Faixa</th><th>Próxima verificação</th><th>Grupo do WhatsApp</th><th>Situação</th><th>Mensagem</th></tr></thead>
        <tbody>{filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(row => {
          const key = `${row.stage.days}:${row.customerId}`;
          const expanded = expandedCustomer === key;
          return <Fragment key={key}><tr>
            <td><strong>{row.customerName}</strong><small>{row.customerCode ?? "Sem código"} · {row.daysInactive} dias sem comprar</small></td>
            <td><span className={`lili-queue-stage-pill lili-stage-${row.stage.days}`}>{row.stage.days} dias{row.stage.days === 90 ? "+" : ""}</span></td>
            <td>{row.stage.status === "ACTIVE" ? <><span>{row.stage.nextRunAt ? scheduleFormat.format(new Date(row.stage.nextRunAt)) : "Aguardando agendamento"}</span><small>São Paulo · verificação diária</small></> : <span className="lili-queue-pending">Automação pausada</span>}</td>
            <td><span className="lili-queue-group">{row.groupName ?? "Aguardando confirmação do vínculo"}</span></td>
            <td><span className={`lili-queue-status ${row.status === "READY" ? "is-ready" : "is-pending"}`}>
              {STATUS_LABELS[row.status] ?? row.status}</span></td>
            <td><button type="button" className="lili-queue-message-button" aria-expanded={expanded} aria-label={`${expanded ? "Ocultar" : "Ver"} mensagem de ${row.customerName}`}
              onClick={() => setExpandedCustomer(expanded ? null : key)}><MessageCircle size={14} /> {expanded ? "Ocultar" : "Ver mensagem"}</button></td>
          </tr>{expanded ? <tr className="lili-queue-message-row"><td colSpan={6}><div><strong>Mensagem para {row.customerName}</strong><p>{row.message}</p></div></td></tr> : null}</Fragment>;
        })}{!filtered.length ? <tr><td colSpan={6} className="lili-queue-empty">Nenhum cliente encontrado com estes filtros.</td></tr> : null}</tbody>
      </table></div>
      <div className="lili-queue-footer"><span>{filtered.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)}` : "0"} de {formatNumber(filtered.length)} clientes</span>
        <div><button type="button" aria-label="Página anterior" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>
          <span>{currentPage + 1} / {pageCount}</span><button type="button" aria-label="Próxima página" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div>
      </div>
      <p className="lili-queue-note">Previsão atualizada em {formatDateTime(preview.generatedAt)}. A lista é conferida novamente antes de enviar; uma nova compra reinicia a contagem.</p>
    </> : null}
  </section>;
}
