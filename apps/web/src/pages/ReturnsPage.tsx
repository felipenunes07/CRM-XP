import { useDeferredValue, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { RETURN_OUTCOME_LABELS, RETURN_STAGE_LABELS, type ReturnDetail, type ReturnEvent, type ReturnItem, type ReturnItemInput, type ReturnPerson } from "@olist-crm/shared";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { api } from "../lib/api";
import "./ReturnsPage.css";
import { ReturnExecutionPanel,ReturnCustomerSummary } from './ReturnExecutionPanel';
import { ReturnFactoryWorkspace } from './ReturnFactoryWorkspace';

const localTime = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
};
const dateLabel = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente.";
const formValue = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export function ReturnsPage() {
  const { token } = useAuth();
  const { canAccess } = usePermissions();
  const canManage = canAccess("returns.manage");
  const queryClient = useQueryClient();
  const [params,setParams] = useSearchParams();
  const selectedId = params.get("protocolo");
  const factoryView=params.get('visao')==='fabricas';
  const [creating,setCreating] = useState(false);
  const [search,setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [stage,setStage] = useState("active");
  const [mine,setMine] = useState(false);
  const [page,setPage] = useState(1);
  const queue = useQuery({ queryKey: ["returns",deferredSearch,stage,mine,page],
    queryFn: () => api.returnQueue(token!,{ search: deferredSearch,stage,mine: String(mine),page }), enabled: Boolean(token), refetchInterval: 30000 });
  const lookups = useQuery({ queryKey: ["return-lookups"], queryFn: () => api.returnLookups(token!), enabled: Boolean(token) });
  const detail = useQuery({ queryKey: ["return-detail",selectedId], queryFn: () => api.returnDetail(token!,selectedId!), enabled: Boolean(token && selectedId), refetchOnWindowFocus: false });
  const saved = (value: ReturnDetail) => {
    queryClient.setQueryData(["return-detail",value.id],value);
    void queryClient.invalidateQueries({ queryKey: ["returns"] });
    setParams({ protocolo: value.id });
    setCreating(false);
  };
  return <div className="page-stack returns-page">
    <section className="panel returns-heading"><div><p className="eyebrow">Recebimento e triagem</p><h1>Trocas · fila da Isis</h1>
      <p>Recebimento, fábrica, acerto e entrega no mesmo protocolo. Isis acompanha as pendências.</p></div>
      {canManage && !factoryView && <button className="button primary" onClick={() => setCreating(true)}>Novo recebimento</button>}
    </section>
    <nav className="returns-view-tabs returns-tabs" aria-label="Visões de trocas"><button aria-pressed={!factoryView} onClick={()=>setParams({})}>Protocolos e fila</button><button aria-pressed={factoryView} onClick={()=>setParams({visao:'fabricas'})}>Envios de fábrica</button></nav>
    {factoryView?<ReturnFactoryWorkspace token={token!} onCase={id=>setParams({protocolo:id})}/>:<>
    {queue.data && <section className="returns-summary" aria-label="Resumo geral da fila">
      <span>Recebidos <strong>{queue.data.summary.received}</strong></span><span>Em triagem <strong>{queue.data.summary.triage}</strong></span>
      <span>Em acompanhamento <strong>{queue.data.summary.triageCompleted}</strong></span><span>Prazos vencidos <strong>{queue.data.summary.overdue}</strong></span>
    </section>}
    <div className="returns-layout"><section className="panel returns-queue">
      <h2>Protocolos</h2><label>Buscar protocolo ou cliente<input value={search} onChange={e => { setSearch(e.target.value);setPage(1); }} placeholder="TR-000001, código ou nome" /></label>
      <div className="returns-filters"><label>Situação<select value={stage} onChange={e => { setStage(e.target.value);setPage(1); }}>
        <option value="active">Todos os protocolos em aberto</option><option value="received">Recebidos</option><option value="triage">Em triagem</option>
        <option value="triage_completed">Pós-triagem · fábrica, acerto e entrega</option><option value="closed">Encerrados</option><option value="overdue">Prazo vencido</option><option value="all">Todos</option>
      </select></label><label className="returns-checkbox"><input type="checkbox" checked={mine} onChange={e => { setMine(e.target.checked);setPage(1); }} />Sob minha responsabilidade</label></div>
      {queue.isLoading && <p role="status">Carregando fila...</p>}
      {queue.isError && <p role="alert">{message(queue.error)} <button onClick={() => void queue.refetch()}>Tentar novamente</button></p>}
      {queue.data?.items.length === 0 && <p>Nenhum protocolo nesta fila.</p>}
      <div className="returns-cards">{queue.data?.items.map(row => <button key={row.id} className={`returns-card ${row.id === selectedId ? "is-selected" : ""}`} onClick={() => { setCreating(false);setParams({ protocolo: row.id }); }}>
        <div className="returns-card-title"><strong>{row.protocol}</strong><span className="returns-badge">{RETURN_STAGE_LABELS[row.stage]}</span></div>
        <strong>{row.customer.code} · {row.customer.name}</strong>
        <span>{row.receivedQuantity} peças · {row.pendingQuantity} sem destino técnico definido</span>
        {row.stage==='triage_completed'&&row.progress&&<><span>Fábrica: {row.progress.factoryPendingQuantity} sem parecer · créditos: {row.progress.financePendingCount} pendente(s)</span><span>Cliente: {row.progress.customerComplete?'atendido':`${row.progress.customerPendingQuantity} peça(s) pendente(s)`} · destinos físicos: {row.progress.internalPendingQuantity}</span></>}
        <span>Responsável: {row.assignee?.name ?? "Isis · atribuição pendente"}</span>
        <span className={row.overdue ? "returns-overdue" : ""}>{row.dueAt ? `Prazo: ${dateLabel(row.dueAt)}` : "Prazo de triagem a definir"}</span>
        <span>Próxima ação: {row.nextAction}</span><small>Último movimento: {dateLabel(row.updatedAt)}</small>
      </button>)}</div>
      {queue.data && <div className="returns-pagination"><button disabled={page === 1} onClick={() => setPage(page-1)}>Anterior</button>
        <span>Página {page} · {queue.data.total} protocolos</span><button disabled={page*50 >= queue.data.total} onClick={() => setPage(page+1)}>Próxima</button></div>}
    </section><section className="panel returns-detail">
      {creating ? <ReceiptForm token={token!} onSaved={saved} onCancel={() => setCreating(false)} /> : selectedId ? <>
        {detail.isLoading && <p role="status">Carregando protocolo...</p>}
        {detail.isError && <p role="alert">{message(detail.error)}</p>}
        {detail.data && <ReturnDetailView key={detail.data.id} detail={detail.data} token={token!} people={lookups.data?.people ?? []} canManage={canManage} onSaved={saved} onReload={() => void detail.refetch()} />}
      </> : <div className="returns-empty"><h2>Uma remessa, um protocolo</h2><p>Selecione um recebimento para acompanhar os itens, fábrica, acerto, entregas e histórico até a conclusão.</p><p>Encerrar exige conferência das obrigações com o cliente, dos créditos e dos destinos físicos.</p></div>}
    </section></div>
    </>}
  </div>;
}

function ReceiptForm({ token,onSaved,onCancel }: { token: string; onSaved: (value: ReturnDetail) => void; onCancel: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [search,setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const customers = useQuery({ queryKey: ["return-customers",deferredSearch], queryFn: () => api.returnLookups(token,deferredSearch) });
  const mutation = useMutation({ mutationFn: (data: Parameters<typeof api.createReturn>[1]) => api.createReturn(token,data), retry: false,onSuccess: onSaved });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const declared = formValue(data,"declaredQuantity");
    mutation.mutate({ requestId,customerId: formValue(data,"customerId"),receivedAt: new Date(formValue(data,"receivedAt")).toISOString(),
      declaredQuantity: declared === "" ? null : Number(declared),receivedQuantity: Number(data.get("receivedQuantity")),volumes: Number(data.get("volumes")),location: formValue(data,"location"),notes: formValue(data,"notes") });
  };
  return <form onSubmit={submit} className="returns-form"><h2>Novo recebimento</h2><p>Conte a remessa e identifique a caixa. Fotos e documentos podem ser anexados depois de gerar o protocolo.</p>
    <fieldset disabled={mutation.isPending}><label>Pesquisar cliente<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Código ou nome do cliente" /></label>
      <label>Cliente<select name="customerId" required defaultValue=""><option value="">Selecione o cliente</option>{customers.data?.customers.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label>
      {customers.isError && <p role="alert">Não foi possível consultar os clientes. <button type="button" onClick={() => void customers.refetch()}>Tentar novamente</button></p>}
      <div className="returns-form-grid"><label>Recebido em<input name="receivedAt" type="datetime-local" defaultValue={localTime(new Date().toISOString())} required /></label>
        <label>Volumes / caixas<input name="volumes" type="number" min="1" max="100000" defaultValue="1" required /></label>
        <label>Quantidade declarada pelo cliente<input name="declaredQuantity" type="number" min="0" max="100000" placeholder="Não informada" /></label>
        <label>Quantidade contada<input name="receivedQuantity" type="number" min="1" max="100000" required /></label></div>
      <label>Localização da caixa<input name="location" maxLength={250} placeholder="Ex.: bancada de recebimento, caixa 12" required /></label>
      <label>Observações / divergência de contagem<textarea name="notes" maxLength={4000} placeholder="Informe diferenças, condições da caixa e o que precisa ser conferido." /></label>
      <div className="returns-actions"><button type="submit" className="button primary">{mutation.isPending ? "Registrando..." : "Gerar protocolo"}</button><button type="button" onClick={onCancel}>Cancelar</button></div>
    </fieldset>{mutation.isError && <p role="alert">{message(mutation.error)}</p>}
  </form>;
}

function ReturnDetailView({ detail:d,token,people,canManage,onSaved,onReload }: { detail: ReturnDetail; token: string; people: ReturnPerson[]; canManage: boolean; onSaved: (value: ReturnDetail) => void; onReload: () => void }) {
  const [editing,setEditing] = useState<ReturnItem | null | undefined>(undefined);
  const [fileError,setFileError] = useState("");
  const [printMode,setPrintMode]=useState<'label'|'customer'>('label');
  const executionStarted=Boolean(d.execution.factoryLines.length||d.execution.resolutions.length||d.execution.receipts.length);
  const print=(mode:'label'|'customer')=>{setPrintMode(mode);requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));};
  const mutation = useMutation({ mutationFn: (run: () => Promise<ReturnDetail>) => run(),retry: false,onSuccess: result=>{setEditing(undefined);onSaved(result);} });
  const apply = (run: () => Promise<ReturnDetail>) => mutation.mutate(run);
  const assignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const due = formValue(data,"dueAt");
    apply(() => api.assignReturn(token,d.id,{ version:d.version,assigneeId:formValue(data,"assigneeId") || null,dueAt:due ? new Date(due).toISOString() : null,nextAction:formValue(data,"nextAction"),location:formValue(data,"location"),receivedQuantity:Number(data.get("receivedQuantity")),correctionReason:formValue(data,"correctionReason") }));
  };
  const action = (type: "start_triage" | "complete_triage" | "reopen_triage") => {
    const reason = type === "reopen_triage" ? window.prompt("Qual o motivo da reabertura da triagem?") : "";
    if (reason === null || (type === "reopen_triage" && !reason.trim())) return;
    apply(() => api.returnAction(token,d.id,{ version:d.version,action:type,reason }));
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setFileError("");
    if (file.size > 5242880 || !["image/jpeg","image/png","application/pdf"].includes(file.type)) { setFileError("Envie JPG, PNG ou PDF com até 5 MB.");return; }
    try {
      const base64 = await new Promise<string>((resolve,reject) => { const reader = new FileReader();reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");reader.onerror = reject;reader.readAsDataURL(file); });
      apply(() => api.attachReturnFile(token,d.id,{ version:d.version,name:file.name,contentType:file.type,contentBase64:base64 }));
    } catch { setFileError("Não foi possível ler o arquivo."); }
  };
  const download = async (fileId: string) => {
    try {
      const file = await api.returnFile(token,d.id,fileId); const bytes = Uint8Array.from(atob(file.contentBase64),char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes],{ type:file.contentType }));const a = document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch (error) { setFileError(message(error)); }
  };
  return <>
    <header className="returns-detail-heading"><div><p className="eyebrow">{RETURN_STAGE_LABELS[d.stage]}</p><h2>{d.protocol}</h2><p>{d.customer.code} · {d.customer.name}</p></div>
      <div className="returns-actions"><button onClick={onReload}>Recarregar protocolo</button><button onClick={() => print('label')}>Imprimir etiqueta</button><button onClick={()=>print('customer')}>Imprimir resumo do cliente</button></div></header>
    <div className="returns-receipt"><p>Recebido em <strong>{dateLabel(d.receivedAt)}</strong> por {d.receiverName}</p>
      <p><strong>{d.receivedQuantity} peças contadas</strong> · declaradas: {d.declaredQuantity ?? "não informadas"} · {d.volumes} {d.volumes === 1 ? "volume" : "volumes"}</p>
      {d.declaredQuantity !== null && d.declaredQuantity !== d.receivedQuantity && <p className="returns-overdue">Divergência de contagem: conferir com o cliente.</p>}
      {d.notes && <p className="returns-notes">{d.notes}</p>}</div>
    <form key={d.version} className="returns-form" onSubmit={assignment}><h3>Responsável e próxima ação</h3><fieldset disabled={!canManage || mutation.isPending || d.stage==='closed'}>
      <div className="returns-form-grid"><label>Responsável pela próxima ação<select name="assigneeId" defaultValue={d.assignee?.id ?? ""}><option value="">Isis · atribuição pendente</option>{people.filter(p=>!['received','triage'].includes(d.stage)||p.canTriage!==false).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Prazo interno<input type="datetime-local" name="dueAt" defaultValue={d.dueAt ? localTime(d.dueAt) : ""} /></label></div>
      <label>Próxima ação<input name="nextAction" defaultValue={d.nextAction} maxLength={500} required /></label>
      <label>Localização atual<input name="location" defaultValue={d.location} maxLength={250} required /></label>
      <div className="returns-form-grid"><label>Quantidade contada<input name="receivedQuantity" type="number" min="1" max="100000" defaultValue={d.receivedQuantity} required readOnly={d.stage === "triage_completed"} /></label>
      <label>Motivo, se corrigir a contagem<input name="correctionReason" maxLength={2000} placeholder="A correção fica no histórico" /></label></div>
      {canManage && <button type="submit" className="button">Salvar responsável e ação</button>}
    </fieldset></form>
    <section><h3>Itens e resultado da triagem</h3><p>{d.itemQuantity} de {d.receivedQuantity} peças cadastradas · {d.pendingQuantity} sem destino técnico definido</p>
      {d.stage === "triage_completed" && <p className="returns-info">Triagem concluída. Continue abaixo com fábrica, acerto, entrega e destino das peças. Parecer, crédito e entrega têm comprovações independentes.</p>}
      <div className="returns-actions">{canManage && <>
        {d.stage === "received" && <button disabled={mutation.isPending} onClick={() => action("start_triage")}>Iniciar triagem</button>}
        {d.stage === "triage" && <><button disabled={mutation.isPending} onClick={() => setEditing(null)}>Adicionar item</button><button disabled={mutation.isPending || d.pendingQuantity !== 0} onClick={() => action("complete_triage")}>Concluir triagem</button></>}
        {d.stage === "triage_completed" && <button disabled={mutation.isPending||executionStarted} title={executionStarted?'Movimentos já registrados: solicite revisão à Isis':'Corrigir a triagem com motivo'} onClick={() => action("reopen_triage")}>Reabrir triagem</button>}
      </>}</div>
      {d.items.length === 0 && <p>Os modelos serão identificados durante a triagem.</p>}
      {d.items.map(item => <div key={item.id} className="returns-item"><div><strong>{item.quantity} × {item.model || "Modelo a identificar"}</strong>
        <span>{item.sku || "SKU não informado"} · {RETURN_OUTCOME_LABELS[item.outcome]}</span><span>{[item.frame,item.color,item.manufacturer].filter(Boolean).join(" · ")}</span>
        {item.reason && <p>Motivo: {item.reason}</p>}{item.testNotes && <p>Teste / inspeção: {item.testNotes}</p>}</div>
        {canManage && d.stage === "triage" && <div className="returns-actions"><button disabled={mutation.isPending} onClick={() => setEditing(item)}>Editar item</button><button disabled={mutation.isPending} onClick={() => { if (window.confirm("Remover este grupo de peças? A alteração ficará no histórico.")) apply(() => api.removeReturnItem(token,d.id,item.id,d.version)); }}>Remover item</button></div>}
      </div>)}
      {editing !== undefined && <ItemForm key={editing?.id ?? "new"} item={editing} version={d.version} busy={mutation.isPending} onCancel={() => setEditing(undefined)} onSubmit={data => apply(() => api.saveReturnItem(token,d.id,editing?.id ?? null,data))} />}
    </section>
    {['triage_completed','closed'].includes(d.stage)&&<ReturnExecutionPanel detail={d} token={token} onSaved={onSaved}/>}
    {mutation.isPending && <p role="status">Salvando alteração...</p>}{mutation.isError && <p role="alert">{message(mutation.error)}</p>}
    <section><h3>Fotos e documentos</h3><p>JPG, PNG ou PDF · até 5 MB por arquivo · até 20 anexos.</p>
      {canManage && <label>Anexar evidência<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={mutation.isPending} onChange={e => { void upload(e.target.files?.[0]);e.target.value=""; }} /></label>}
      {fileError && <p role="alert">{fileError}</p>}{d.attachments.map(file => <div key={file.id} className="returns-attachment"><span>{file.name} · {file.authorName}</span><button onClick={() => void download(file.id)}>Baixar {file.name}</button></div>)}
    </section>
    <section><h3>Histórico do protocolo</h3><ol className="returns-history">{d.events.map(event => <li key={event.id}><strong>{eventLabel(event.action)}</strong><span>{event.authorName} · {dateLabel(event.createdAt)}</span><p>{eventDescription(event)}</p></li>)}</ol></section>
    <div className="return-print-label">{printMode==='customer'?<ReturnCustomerSummary detail={d}/>:<><h1>{d.protocol}</h1><p>{d.customer.code} · {d.customer.name}</p><p>{d.receivedQuantity} peças · {d.volumes} {d.volumes === 1 ? "volume" : "volumes"}</p><p>{dateLabel(d.receivedAt)} · {d.receiverName}</p><p>Local: {d.location}</p></>}</div>
  </>;
}

function ItemForm({ item,version,busy,onCancel,onSubmit }: { item: ReturnItem | null; version: number; busy: boolean; onCancel: () => void; onSubmit: (data: ReturnItemInput) => void }) {
  const [outcome,setOutcome] = useState(item?.outcome ?? "pending");
  const decided = !["pending","review"].includes(outcome);
  const reasonRequired = ["refused","no_defect","resale"].includes(outcome);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();const data = new FormData(event.currentTarget);
    onSubmit({ version,model:formValue(data,"model"),sku:formValue(data,"sku"),quantity:Number(data.get("quantity")),frame:formValue(data,"frame"),color:formValue(data,"color"),manufacturer:formValue(data,"manufacturer"),outcome,reason:formValue(data,"reason"),testNotes:formValue(data,"testNotes") });
  };
  return <form className="returns-form returns-item-form" onSubmit={submit}><h3>{item ? "Editar item" : "Adicionar item"}</h3><p>Separe em linhas diferentes as quantidades com resultados diferentes.</p>
    <fieldset disabled={busy}><div className="returns-form-grid">
      <label>Modelo<input name="model" defaultValue={item?.model ?? ""} maxLength={500} required={decided} /></label><label>SKU, se identificado<input name="sku" defaultValue={item?.sku ?? ""} maxLength={100} /></label>
      <label>Quantidade do grupo<input name="quantity" type="number" min="1" max="100000" defaultValue={item?.quantity ?? 1} required /></label>
      <label>Resultado<select value={outcome} onChange={e => setOutcome(e.target.value as ReturnItem["outcome"])}>{Object.entries(RETURN_OUTCOME_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Aro<input name="frame" defaultValue={item?.frame ?? ""} maxLength={50} placeholder="Com aro / sem aro" /></label><label>Cor<input name="color" defaultValue={item?.color ?? ""} maxLength={100} /></label>
      <label>Fábrica / selo<input name="manufacturer" defaultValue={item?.manufacturer ?? ""} maxLength={100} required={outcome === "external_analysis"} /></label>
    </div><label>Teste ou inspeção realizada<textarea name="testNotes" defaultValue={item?.testNotes ?? ""} maxLength={4000} required={decided} /></label>
    <label>Motivo / observação<textarea name="reason" defaultValue={item?.reason ?? ""} maxLength={2000} required={reasonRequired} /></label>
    <div className="returns-actions"><button type="submit" className="button primary">Salvar item</button><button type="button" onClick={onCancel}>Cancelar edição</button></div></fieldset>
  </form>;
}

function eventLabel(action: string) {
  return ({ factory_dispatched:'Envio de fábrica registrado',factory_cancelled:'Registro de envio corrigido',factory_result:'Parecer da fábrica conferido',physical_receipt:'Entrada física / custódia registrada',resolution:'Atendimento ao cliente definido',credit_authorize:'Crédito autorizado',credit_post:'Lançamento financeiro confirmado',credit_reverse:'Crédito estornado / cancelado',delivery:'Retirada / despacho registrado',delivery_confirm:'Recebimento do cliente confirmado',disposition:'Destino interno encaminhado',disposition_confirm:'Destino interno concluído',notice:'Contato com o cliente registrado',review:'Revisão aberta',review_resolve:'Revisão resolvida',close:'Protocolo encerrado',reopen:'Protocolo reaberto',void_record:'Registro corrigido com histórico',received:"Recebimento registrado",assignment_updated:"Responsável / ação atualizados",start_triage:"Triagem iniciada",complete_triage:"Triagem concluída",reopen_triage:"Triagem reaberta",item_added:"Item adicionado",item_updated:"Item alterado",item_removed:"Item removido",file_attached:"Evidência anexada" } as Record<string,string>)[action] ?? action;
}

function eventDescription(event: ReturnEvent) {
  const after = event.data.after as Record<string,unknown> | undefined;
  const before = event.data.before as Record<string,unknown> | undefined;
  if (event.action.startsWith("item_")) {
    const item = after ?? before;
    if (item) return `${item.quantity} × ${item.model || "Modelo a identificar"} · ${RETURN_OUTCOME_LABELS[item.outcome as ReturnItem["outcome"]] ?? ""}${item.reason ? ` · ${item.reason}` : ""}`;
  }
  if (event.action === "assignment_updated" && after) {
    const correction = before?.receivedQuantity !== after.receivedQuantity ? ` Contagem: ${before?.receivedQuantity} → ${after.receivedQuantity}. ${after.correctionReason}` : "";
    return `${after.nextAction} · Local: ${after.location}.${correction}`;
  }
  if (event.action === "received") return `${event.data.receivedQuantity} peças · ${event.data.volumes} volumes · ${event.data.location}`;
  if (event.action === "file_attached") return String(event.data.name ?? "");
  return [event.data.reason,event.data.reference,event.data.officialReference,event.data.proof,event.data.resolution,event.data.quantity?`${event.data.quantity} peça(s)`:null].filter(value=>typeof value==='string'&&value).join(' · ');
}
