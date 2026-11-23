import { useDeferredValue, useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { RETURN_OUTCOME_LABELS, RETURN_STAGE_LABELS, type ReturnCustomer, type ReturnDetail, type ReturnEvent, type ReturnItem, type ReturnItemInput, type ReturnPerson } from "@olist-crm/shared";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { api } from "../lib/api";
import "./ReturnsPage.css";
import {ArrowLeft,ArrowRight,Plus,PackageOpen,ClipboardCheck,Truck,Search,MoreHorizontal} from 'lucide-react';
import {RETURN_STEPS,returnNextStep,type ReturnStep,type ReturnWorkArea} from '../lib/returnJourney';
import { ReturnExecutionPanel,ReturnCustomerSummary } from './ReturnExecutionPanel';
import { ReturnFactoryWorkspace } from './ReturnFactoryWorkspace';
import {ReturnTransitionWorkspace,ReturnFactorySettings} from './ReturnTransitionWorkspace';
import {ReturnNativePanel} from './ReturnNativePanel';
import {ReturnAssetsWorkspace} from './ReturnAssetsWorkspace';

const localTime = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
};
const dateLabel = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const message = (error: unknown) => error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente.";
const formValue = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export function ReturnsPage() {
  const {token}=useAuth(),{canAccess}=usePermissions(),canManage=canAccess('returns.manage'),queryClient=useQueryClient();
  const [params,setParams]=useSearchParams(),selectedId=params.get('protocolo'),view=params.get('visao')??'';
  const factoryView=view==='fabricas',transitionView=view==='transicao',settingsView=view==='regras',assetsView=view==='saldos',queueView=!view;
  const [creating,setCreating]=useState(false),[search,setSearch]=useState(''),[stage,setStage]=useState('active'),[mine,setMine]=useState(false),[factory,setFactory]=useState(''),[page,setPage]=useState(1),[filters,setFilters]=useState(false);
  const deferredSearch=useDeferredValue(search),showCase=creating||(queueView&&Boolean(selectedId)),technicalOnly=canManage&&!canAccess('returns.logistics');
  useEffect(()=>{setMine(technicalOnly);},[technicalOnly]);
  const queue=useQuery({queryKey:['returns',deferredSearch,stage,mine,page,factory],queryFn:()=>api.returnQueue(token!,{search:deferredSearch,stage,mine:String(mine),page,factory}),enabled:Boolean(token&&queueView&&!selectedId&&!creating),refetchInterval:30000});
  const lookups=useQuery({queryKey:['return-lookups'],queryFn:()=>api.returnLookups(token!),enabled:Boolean(token)});
  const detail=useQuery({queryKey:['return-detail',selectedId],queryFn:()=>api.returnDetail(token!,selectedId!),enabled:Boolean(token&&selectedId),refetchOnWindowFocus:false});
  useEffect(()=>{document.getElementById('returns-workspace')?.scrollIntoView({block:'start'});},[selectedId,creating,view]);
  const saved=(value:ReturnDetail)=>{queryClient.setQueryData(['return-detail',value.id],value);void queryClient.invalidateQueries({queryKey:['returns']});setParams({protocolo:value.id});setCreating(false);};
  const navigate=(next:string)=>{setCreating(false);setParams(next?{visao:next}:{});};
  const receive=()=>{setParams({});setCreating(true);};
  const reset=()=>{setSearch('');setStage('active');setMine(false);setFactory('');setPage(1);};
  const summary=queue.data?.summary,hasAny=summary?summary.received+summary.triage+summary.triageCompleted+summary.closed>0:false;
  return <div id="returns-workspace" className="page-stack returns-page">
    <header className="returns-toolbar"><div><p className="eyebrow">Atendimento ao cliente</p><h1>Trocas</h1><p>Saiba o que fazer, quem está responsável e o que falta para concluir.</p></div>{canManage&&!creating&&<button className="button primary" onClick={receive}><Plus size={18}/>Receber troca</button>}</header>
    {!showCase&&<nav className="returns-view-tabs returns-main-nav" aria-label="Áreas de trocas"><div>{[['','Atendimentos'],['fabricas','Envios à fábrica'],['saldos','Estoque e créditos']].map(([key,label])=><button key={key} aria-current={view===key?'page':undefined} onClick={()=>navigate(key!)}>{label}</button>)}</div><details className="returns-more"><summary aria-label="Mais opções de trocas"><MoreHorizontal size={18}/>Mais opções</summary><div><button onClick={e=>{navigate('transicao');e.currentTarget.closest('details')?.removeAttribute('open');}}>Histórico importado</button><button onClick={e=>{navigate('regras');e.currentTarget.closest('details')?.removeAttribute('open');}}>Regras e configurações</button></div></details></nav>}
    {showCase?<>
      <button className="returns-back" onClick={()=>{setCreating(false);setParams({});}}><ArrowLeft size={16}/>Voltar aos atendimentos</button>
      <section className="panel returns-detail returns-full-detail">{creating?<ReceiptForm token={token!} onSaved={saved} onCancel={()=>setCreating(false)}/>:<>{detail.isLoading&&<p role="status">Abrindo atendimento...</p>}{detail.isError&&<p role="alert">{message(detail.error)} <button onClick={()=>void detail.refetch()}>Tentar novamente</button></p>}{detail.data&&<ReturnDetailView key={detail.data.id} detail={detail.data} token={token!} people={lookups.data?.people??[]} canManage={canManage} onSaved={saved} onReload={()=>void detail.refetch()} onFactory={()=>setParams({visao:'fabricas',protocolo:detail.data!.id})}/>}</>}</section>
    </>:factoryView?<>{selectedId&&<button className="returns-back" onClick={()=>setParams({protocolo:selectedId})}><ArrowLeft size={16}/>Voltar ao atendimento</button>}<ReturnFactoryWorkspace token={token!} onCase={id=>setParams({protocolo:id})}/></>:assetsView?<ReturnAssetsWorkspace token={token!} onCase={id=>setParams({protocolo:id})}/>:transitionView?<ReturnTransitionWorkspace token={token!} onCase={id=>setParams({protocolo:id})}/>:settingsView?<ReturnFactorySettings token={token!}/>:<>
      {queue.isLoading&&<p role="status">Carregando atendimentos...</p>}{queue.isError&&<p role="alert">{message(queue.error)} <button onClick={()=>void queue.refetch()}>Tentar novamente</button></p>}
      {queue.data&&!hasAny?<section className="panel returns-welcome"><div className="returns-welcome-icon"><PackageOpen size={30}/></div><p className="eyebrow">Comece por aqui</p><h2>Chegou uma troca?</h2><p>Registre o cliente e a quantidade recebida. O CRM cria o protocolo e mostra o próximo passo.</p>{canManage&&<button className="button primary" onClick={receive}>Receber a primeira troca<ArrowRight size={18}/></button>}<div className="returns-start-steps"><article><span>1</span><h3>Receba a caixa</h3><p>Identifique o cliente, conte as peças e informe onde ficaram.</p></article><article><span>2</span><h3>Encaminhe para teste</h3><p>O técnico registra os modelos e o resultado de cada grupo.</p></article><article><span>3</span><h3>Acompanhe até resolver</h3><p>Isis acompanha fábrica, crédito, reparo e entrega no mesmo atendimento.</p></article></div><div className="returns-history-shortcut"><span>Quer consultar registros antigos?</span><button onClick={()=>navigate('transicao')}>Abrir histórico importado<ArrowRight size={14}/></button></div></section>:<>
       {summary&&<section className="returns-summary returns-summary-actions" aria-label="Situação dos atendimentos">{[['received','Aguardando teste',summary.received],['triage','Em teste',summary.triage],['triage_completed','Em resolução',summary.triageCompleted],['overdue','Com atraso',summary.overdue]].map(([key,label,count])=><button key={String(key)} data-overdue={key==='overdue'&&Number(count)>0} aria-pressed={stage===key} onClick={()=>{setStage(String(key));setPage(1);}}><span>{label}</span><strong>{count}</strong><small>Ver atendimentos<ArrowRight size={13}/></small></button>)}</section>}
       <section className="panel returns-queue"><div className="returns-list-heading"><div><h2>{mine?'Minhas tarefas':'Atendimentos'}</h2><p>Abra uma troca para ver a próxima ação.</p></div><div className="returns-list-tools"><label className="returns-search"><Search size={17}/><input aria-label="Buscar protocolo ou cliente" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Cliente ou protocolo"/></label><button className="button" aria-expanded={filters} onClick={()=>setFilters(!filters)}>Filtros</button></div></div>
       {filters&&<div className="returns-filter-bar"><label>Situação<select value={stage} onChange={e=>{setStage(e.target.value);setPage(1);}}><option value="active">Em aberto</option><option value="received">Aguardando teste</option><option value="triage">Em teste</option><option value="triage_completed">Em resolução</option><option value="closed">Concluídos</option><option value="overdue">Com atraso</option><option value="all">Todos</option></select></label><label>Fábrica<select value={factory} onChange={e=>{setFactory(e.target.value);setPage(1);}}><option value="">Todas</option>{lookups.data?.factories?.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></label><label className="returns-checkbox"><input type="checkbox" checked={mine} onChange={e=>{setMine(e.target.checked);setPage(1);}}/>Só minhas tarefas</label><button onClick={reset}>Limpar filtros</button></div>}
       <div className="returns-case-list">{queue.data?.items.map(row=><button key={row.id} className="returns-case-row" onClick={()=>setParams({protocolo:row.id})}><div className="returns-case-person"><strong>{row.customer.name}</strong><span>{row.customer.code} · {row.protocol} · {row.receivedQuantity} peças</span></div><span className={'returns-badge '+(row.overdue?'returns-overdue':'')}>{row.stage==='received'?'Aguardando teste':row.stage==='triage'?'Em teste':row.stage==='closed'?'Concluído':'Em resolução'}</span><div className="returns-case-owner"><span>{row.assignee?.name??'Responsável a definir'}</span><small>{row.dueAt?'Até '+dateLabel(row.dueAt):'Prazo a definir'}</small></div><div className="returns-case-next"><span>{row.nextAction}</span><ArrowRight size={17}/></div></button>)}</div>
       {queue.data?.items.length===0&&<div className="returns-empty"><ClipboardCheck size={26}/><h3>Nenhuma troca com esses filtros</h3><p>Altere a busca ou veja todos os atendimentos.</p><button className="button" onClick={reset}>Limpar filtros</button></div>}
       {queue.data&&queue.data.total>50&&<div className="returns-pagination"><button disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page} · {queue.data.total} atendimentos</span><button disabled={page*50>=queue.data.total} onClick={()=>setPage(page+1)}>Próxima</button></div>}
       </section></>}
    </>}
  </div>;
}

function ReceiptForm({ token,onSaved,onCancel }: { token: string; onSaved: (value: ReturnDetail) => void; onCancel: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [search,setSearch] = useState("");
  const [selectedCustomer,setSelectedCustomer]=useState<ReturnCustomer|null>(null);
  const deferredSearch = useDeferredValue(search);
  const customers = useQuery({ queryKey: ["return-customers",deferredSearch], queryFn: () => api.returnLookups(token,deferredSearch) });
  const fetchedCustomers=customers.data?.customers??[];
  const customerOptions=selectedCustomer&&!fetchedCustomers.some(c=>c.id===selectedCustomer.id)?[selectedCustomer,...fetchedCustomers]:fetchedCustomers;
  const mutation = useMutation({ mutationFn: (data: Parameters<typeof api.createReturn>[1]) => api.createReturn(token,data), retry: false,onSuccess: onSaved });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const declared = formValue(data,"declaredQuantity");
    mutation.mutate({ requestId,customerId: formValue(data,"customerId"),receivedAt: new Date(formValue(data,"receivedAt")).toISOString(),
      declaredQuantity: declared === "" ? null : Number(declared),receivedQuantity: Number(data.get("receivedQuantity")),volumes: Number(data.get("volumes")),location: formValue(data,"location"),notes: formValue(data,"notes") });
  };
  return <form onSubmit={submit} className="returns-form returns-receive-form"><p className="eyebrow">1 · Receber</p><h2>Qual cliente enviou as peças?</h2><p>Comece pelo cliente, quantidade e local da caixa. Os modelos serão cadastrados durante os testes.</p>
    <fieldset disabled={mutation.isPending}><div className="returns-form-grid"><label>Pesquisar cliente<input value={search} onChange={e=>{setSearch(e.target.value);setSelectedCustomer(null);}} placeholder="Nome ou código do cliente"/></label><label>Cliente<select aria-label="Cliente" name="customerId" required value={selectedCustomer?.id??''} onChange={e=>setSelectedCustomer(customerOptions.find(c=>c.id===e.target.value)??null)}><option value="">Selecione o cliente</option>{customerOptions.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label></div>
    {customers.isError&&<p role="alert">Não foi possível buscar os clientes. <button type="button" onClick={()=>void customers.refetch()}>Tentar novamente</button></p>}
    <div className="returns-form-grid"><label>Quantidade contada<input name="receivedQuantity" type="number" min="1" max="100000" placeholder="Quantas peças chegaram?" required/></label><label>Localização da caixa<input name="location" maxLength={250} placeholder="Ex.: recebimento, caixa 12" required/></label></div>
    <details className="returns-advanced"><summary>Mais detalhes do recebimento</summary><div className="returns-form-grid"><label>Recebido em<input name="receivedAt" type="datetime-local" defaultValue={localTime(new Date().toISOString())} required/></label><label>Volumes / caixas<input name="volumes" type="number" min="1" max="100000" defaultValue="1" required/></label><label>Quantidade declarada pelo cliente<input name="declaredQuantity" type="number" min="0" max="100000" placeholder="Se o cliente informou"/></label></div><label>Observações / divergência de contagem<textarea name="notes" maxLength={4000} placeholder="Condição da caixa, diferença de quantidade ou outra informação importante."/></label></details>
    <div className="returns-actions"><button type="submit" className="button primary">{mutation.isPending?'Registrando...':'Criar atendimento'}<ArrowRight size={17}/></button><button type="button" onClick={onCancel}>Cancelar</button></div><p className="returns-muted">O protocolo será gerado automaticamente. Depois, escolha o técnico e o prazo dos testes.</p></fieldset>{mutation.isError&&<p role="alert">{message(mutation.error)}</p>}
  </form>;
}

function ReturnDetailView({ detail:d,token,people,canManage,onSaved,onReload,onFactory }: { detail: ReturnDetail; token: string; people: ReturnPerson[]; canManage: boolean; onSaved: (value: ReturnDetail) => void; onReload: () => void;onFactory:()=>void }) {
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
  const {canAccess}=usePermissions();
  const technicalOnly=canManage&&!canAccess('returns.logistics');
  const next=returnNextStep(d),[step,setStep]=useState<ReturnStep>(next.step),[area,setArea]=useState<ReturnWorkArea>(technicalOnly?'technical':next.area??'customer'),[showHistory,setShowHistory]=useState(false);
  useEffect(()=>{const n=returnNextStep(d);setStep(n.step);setArea(technicalOnly?'technical':n.area??'customer');setShowHistory(false);},[d.stage]);
  const go=(target:ReturnStep,workArea?:ReturnWorkArea)=>{setEditing(undefined);setShowHistory(false);setStep(target);if(workArea)setArea(workArea);};
  const afterTests=['triage_completed','closed'].includes(d.stage);
  return <>
    <header className="returns-detail-heading"><div><p className="eyebrow">{d.customer.code} · {RETURN_STAGE_LABELS[d.stage]}</p><h2>{d.customer.name}</h2><p className="returns-case-id">Protocolo <strong>{d.protocol}</strong> · {d.receivedQuantity} peças · {d.location}</p></div><details className="returns-detail-options"><summary>Documentos e opções</summary><div className="returns-actions"><button onClick={()=>setShowHistory(!showHistory)}>{showHistory?'Voltar às etapas':'Fotos e histórico'}</button><button onClick={()=>print('label')}>Imprimir etiqueta</button><button onClick={()=>print('customer')}>Imprimir resumo do cliente</button><button onClick={onReload}>Atualizar atendimento</button></div></details></header>
    <section className="returns-next-step" aria-label="Próximo passo"><div><span className="eyebrow">Próximo passo</span><h3>{technicalOnly&&afterTests&&d.stage!=='closed'?'Confira seus trabalhos técnicos':next.title}</h3><p>{technicalOnly&&afterTests&&d.stage!=='closed'?'Abra Peças e reparos para registrar o reteste ou a recuperação que foi atribuída a você.':next.description}</p></div><button className="button primary" onClick={()=>go(technicalOnly&&afterTests?'resolver':next.step,technicalOnly&&afterTests?'technical':next.area)}>{technicalOnly&&afterTests?'Ver meus trabalhos':next.action}<ArrowRight size={16}/></button></section>
    <nav className="returns-stepper" aria-label="Etapas do atendimento">{RETURN_STEPS.map((s,n)=><button key={s.key} aria-label={'Etapa '+(n+1)+': '+s.label} aria-current={!showHistory&&step===s.key?'step':undefined} onClick={()=>go(s.key)}><span>{n+1}</span>{s.label}</button>)}</nav>
    {!showHistory&&<div className="returns-step-content" key={step}>
     {step==='receber'&&<>    <div className="returns-receipt"><p>Recebido em <strong>{dateLabel(d.receivedAt)}</strong> por {d.receiverName}</p>
      <p><strong>{d.receivedQuantity} peças contadas</strong> · declaradas: {d.declaredQuantity ?? "não informadas"} · {d.volumes} {d.volumes === 1 ? "volume" : "volumes"}</p>
      {d.declaredQuantity !== null && d.declaredQuantity !== d.receivedQuantity && <p className="returns-overdue">Divergência de contagem: conferir com o cliente.</p>}
      {d.notes && <p className="returns-notes">{d.notes}</p>}</div>
    <form key={d.version} className="returns-form" onSubmit={assignment}><h3>Quem vai cuidar desta troca?</h3><p>Escolha o técnico que fará os testes e combine o prazo.</p><fieldset disabled={!canManage || mutation.isPending || d.stage==='closed'}>
      <div className="returns-form-grid"><label>Responsável pela próxima ação<select name="assigneeId" defaultValue={d.assignee?.id ?? ""}><option value="">Isis · atribuição pendente</option>{people.filter(p=>!['received','triage'].includes(d.stage)||p.canTriage!==false).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Prazo interno<input type="datetime-local" name="dueAt" defaultValue={d.dueAt ? localTime(d.dueAt) : ""} /></label></div>
      <details className="returns-advanced"><summary>Mais detalhes e correção da contagem</summary><label>Próxima ação<input name="nextAction" defaultValue={d.nextAction} maxLength={500} required /></label>
      <label>Localização atual<input name="location" defaultValue={d.location} maxLength={250} required /></label>
      <div className="returns-form-grid"><label>Quantidade contada<input name="receivedQuantity" type="number" min="1" max="100000" defaultValue={d.receivedQuantity} required readOnly={d.stage === "triage_completed"} /></label>
      <label>Motivo, se corrigir a contagem<input name="correctionReason" maxLength={2000} placeholder="A correção fica no histórico" /></label></div>
      </details>{canManage && <button type="submit" className="button">Salvar responsável e prazo</button>}
    </fieldset></form>
{d.assignee&&d.dueAt&&<button className="button primary" onClick={()=>go('testar')}>Ir para os testes<ArrowRight size={16}/></button>}</>}
     {step==='testar'&&<>    <section><h3>Peças e resultado dos testes</h3><p>{d.itemQuantity} de {d.receivedQuantity} peças cadastradas · {d.pendingQuantity} sem destino técnico definido</p>
      {d.stage === "triage_completed" && <p className="returns-info">Testes concluídos. A etapa Resolver reúne a solução para o cliente, a fábrica e os reparos necessários.</p>}
      <div className="returns-actions">{canManage && <>
        {d.stage === "received" && <button disabled={mutation.isPending} onClick={() => action("start_triage")}>Iniciar triagem</button>}
        {d.stage === "triage" && <><button disabled={mutation.isPending} onClick={() => setEditing(null)}>Adicionar item</button><button disabled={mutation.isPending || d.pendingQuantity !== 0} onClick={() => action("complete_triage")}>Concluir triagem</button></>}
        {d.stage === "triage_completed" && <button disabled={mutation.isPending||executionStarted} title={executionStarted?'Movimentos já registrados: solicite revisão à Isis':'Corrigir a triagem com motivo'} onClick={() => action("reopen_triage")}>Reabrir triagem</button>}
      </>}</div>
      {d.items.length === 0 && <p>Os modelos serão identificados durante a triagem.</p>}
      {d.items.map(item => <div key={item.id} className="returns-item"><div><strong>{item.quantity} × {item.model || "Modelo a identificar"}</strong>
        <span>{item.sku || "SKU não informado"} · {RETURN_OUTCOME_LABELS[item.outcome]}</span><span>{[item.frame,item.color,item.manufacturer].filter(Boolean).join(" · ")}</span>
        {item.reason && <p>Motivo: {item.reason}</p>}{item.testNotes && <p>Teste / inspeção: {item.testNotes}</p>}{item.customerReportedDefect&&<p>Defeito informado pelo cliente: {item.customerReportedDefect}</p>}{item.customerEvidenceReference&&<p>Evidência do cliente: {item.customerEvidenceReference}</p>}</div>
        {canManage && d.stage === "triage" && <div className="returns-actions"><button disabled={mutation.isPending} onClick={() => setEditing(item)}>Editar item</button><button disabled={mutation.isPending} onClick={() => { if (window.confirm("Remover este grupo de peças? A alteração ficará no histórico.")) apply(() => api.removeReturnItem(token,d.id,item.id,d.version)); }}>Remover item</button></div>}
      </div>)}
      {editing !== undefined && <ItemForm token={token} key={editing?.id ?? "new"} item={editing} version={d.version} busy={mutation.isPending} onCancel={() => setEditing(undefined)} onSubmit={data => apply(() => api.saveReturnItem(token,d.id,editing?.id ?? null,data))} />}
    </section>
</>}
     {['resolver','entregar','concluir'].includes(step)&&!afterTests&&<div className="returns-empty"><ClipboardCheck size={28}/><h3>Primeiro, conclua os testes</h3><p>Identifique as peças e registre o resultado para liberar a resolução e a entrega.</p><button className="button primary" onClick={()=>go('testar')}>Ir para os testes</button></div>}
     {afterTests&&step==='resolver'&&<><div className="returns-work-choices" role="tablist" aria-label="O que precisa ser resolvido">{[['customer','Solução para o cliente'],['factory','Fábrica'],['technical','Peças e reparos'],['finance','Créditos']].filter(([key])=>key!=='finance'||canAccess('returns.logistics')||canAccess('returns.finance')).map(([key,label])=><button key={key} role="tab" aria-selected={area===key} onClick={()=>setArea(key as ReturnWorkArea)}>{label}</button>)}</div>
       {area==='customer'&&<ReturnExecutionPanel view="customer" detail={d} token={token} onSaved={onSaved}/>}
       {area==='factory'&&<><div className="returns-info"><strong>Esta troca precisa de análise externa?</strong><p>Prepare o envio quando houver peças encaminhadas para a fábrica. Depois registre aqui o parecer e o retorno.</p><button className="button" onClick={onFactory}>Abrir envios à fábrica<Truck size={16}/></button></div><ReturnExecutionPanel view="factory" detail={d} token={token} onSaved={onSaved}/></>}
       {area==='technical'&&<>{!technicalOnly&&<ReturnExecutionPanel view="destination" mode="movement" detail={d} token={token} onSaved={onSaved}/>}<ReturnNativePanel key="technical" scope="technical" detail={d} token={token} onSaved={onSaved}/></>}
       {area==='finance'&&<><ReturnNativePanel key="finance" scope="finance" detail={d} token={token} onSaved={onSaved}/>{canAccess('returns.finance')&&<details className="returns-advanced"><summary>Crédito da fábrica ou valor que precisa de conferência</summary><ReturnExecutionPanel view="customer" financeOnly detail={d} token={token} onSaved={onSaved}/></details>}</>}
      </>}
     {afterTests&&step==='entregar'&&<ReturnExecutionPanel view="delivery" detail={d} token={token} onSaved={onSaved}/>}
     {afterTests&&step==='concluir'&&<ReturnExecutionPanel view="destination" mode="completion" detail={d} token={token} onSaved={onSaved}/>}
    </div>}
        {mutation.isPending && <p role="status">Salvando alteração...</p>}{mutation.isError && <p role="alert">{message(mutation.error)}</p>}
{showHistory&&<div className="returns-step-content">    <section><h3>Fotos e documentos</h3><p>JPG, PNG ou PDF · até 5 MB por arquivo · até 20 anexos.</p>
      {canManage && <label>Anexar evidência<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={mutation.isPending} onChange={e => { void upload(e.target.files?.[0]);e.target.value=""; }} /></label>}
      {fileError && <p role="alert">{fileError}</p>}{d.attachments.map(file => <div key={file.id} className="returns-attachment"><span>{file.name} · {file.authorName}</span><button onClick={() => void download(file.id)}>Baixar {file.name}</button></div>)}
    </section>
    <section><h3>Histórico do protocolo</h3><ol className="returns-history">{d.events.map(event => <li key={event.id}><strong>{eventLabel(event.action)}</strong><span>{event.authorName} · {dateLabel(event.createdAt)}</span><p>{eventDescription(event)}</p></li>)}</ol></section>
</div>}
    <div className="return-print-label">{printMode==='customer'?<ReturnCustomerSummary detail={d}/>:<><h1>{d.protocol}</h1><p>{d.customer.code} · {d.customer.name}</p><p>{d.receivedQuantity} peças · {d.volumes} {d.volumes === 1 ? "volume" : "volumes"}</p><p>{dateLabel(d.receivedAt)} · {d.receiverName}</p><p>Local: {d.location}</p></>}</div>
  </>;
}

function ItemForm({ item,version,busy,onCancel,onSubmit,token }: { item: ReturnItem | null; version: number; busy: boolean; onCancel: () => void; onSubmit: (data: ReturnItemInput) => void;token:string }) {
  const {canAccess}=usePermissions();
  const [outcome,setOutcome] = useState(item?.outcome ?? "pending");
  const [reasonCode,setReasonCode]=useState(item?.reasonCode??'');
  const reasonRules=useQuery({queryKey:['return-reason-rules'],queryFn:()=>api.returnReasonRules(token)});
  const [catalogSearch,setCatalogSearch]=useState(''),[identity,setIdentity]=useState({model:item?.model??'',sku:item?.sku??'',frame:item?.frame??'',color:item?.color??'',manufacturer:item?.manufacturer??''});
  const products=useQuery({queryKey:['return-product-catalog',catalogSearch],queryFn:()=>api.returnProductCatalog(token,catalogSearch),enabled:catalogSearch.trim().length>=2});
  const decided = !["pending","review"].includes(outcome);
  const reasonRequired = ["refused","no_defect","resale"].includes(outcome)&&!reasonCode;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();const data = new FormData(event.currentTarget);
    onSubmit({ version,model:formValue(data,"model"),sku:formValue(data,"sku"),quantity:Number(data.get("quantity")),frame:formValue(data,"frame"),color:formValue(data,"color"),manufacturer:formValue(data,"manufacturer"),outcome,reason:formValue(data,"reason"),testNotes:formValue(data,"testNotes"),seal:formValue(data,'seal'),routingOverride:formValue(data,'routingOverride'),reasonCode,customerReportedDefect:formValue(data,'customerReportedDefect'),customerEvidenceReference:formValue(data,'customerEvidenceReference'),testFinding:formValue(data,'testFinding') as ReturnItemInput['testFinding'] });
  };
  return <form className="returns-form returns-item-form" onSubmit={submit}><h3>{item?'Editar grupo de peças':'Registrar peças testadas'}</h3><p>Use um grupo para cada modelo e resultado. O catálogo ajuda a preencher a identificação.</p>
    <fieldset disabled={busy}><label>Buscar modelo ou SKU no catálogo<input value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} placeholder="Digite o modelo ou código da peça"/></label>{products.data&&<label>Preencher identificação pelo catálogo<select defaultValue="" onChange={e=>{const p=products.data.find(p=>p.sku===e.target.value);if(p)setIdentity({...identity,model:p.model,sku:p.sku,frame:p.frame,color:p.color,manufacturer:p.manufacturer||identity.manufacturer});}}><option value="">Selecione a peça conferida</option>{products.data.map(p=><option key={p.sku} value={p.sku}>{p.sku} · {p.model} · {p.quality}</option>)}</select></label>}{products.isError&&<p role="alert">{products.error.message}</p>}
    <div className="returns-form-grid"><label>Modelo<input name="model" value={identity.model} onChange={e=>setIdentity({...identity,model:e.target.value})} maxLength={500} required={decided}/></label><label>Quantidade do grupo<input name="quantity" type="number" min="1" max="100000" defaultValue={item?.quantity??1} required/></label><label>Fábrica<input name="manufacturer" list="returns-factory-options" value={identity.manufacturer} onChange={e=>setIdentity({...identity,manufacturer:e.target.value})} maxLength={100} required={decided} placeholder="Escolha ou informe a fábrica"/><datalist id="returns-factory-options">{['XP','VV','D.E.','STC','TC-OMG'].map(f=><option key={f} value={f}/>)}</datalist></label><label>Carimbo / selo da peça<input name="seal" defaultValue={item?.seal??''} maxLength={250} placeholder="Informe se houver. Ex.: J, S, Y, 1 ou 2"/></label></div>
    <details className="returns-advanced" open={Boolean(identity.sku||identity.frame||identity.color)}><summary>Código, aro e cor da peça</summary><div className="returns-form-grid"><label>SKU, se identificado<input name="sku" value={identity.sku} onChange={e=>setIdentity({...identity,sku:e.target.value})} maxLength={100}/></label><label>Aro<input name="frame" value={identity.frame} onChange={e=>setIdentity({...identity,frame:e.target.value})} maxLength={50} placeholder="Com aro / sem aro"/></label><label>Cor<input name="color" value={identity.color} onChange={e=>setIdentity({...identity,color:e.target.value})} maxLength={100}/></label></div></details>
    <h4>O que o teste mostrou?</h4><div className="returns-form-grid"><label>Resultado<select aria-label="Resultado" value={outcome} disabled={Boolean(reasonCode)} onChange={e=>setOutcome(e.target.value as ReturnItem['outcome'])}>{Object.entries(RETURN_OUTCOME_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Motivo do resultado<select aria-label="Motivo do resultado" value={reasonCode} onChange={e=>{const code=e.target.value;setReasonCode(code);const rule=reasonRules.data?.find(r=>r.code===code);if(rule)setOutcome(rule.outcome);}}><option value="">Informar o motivo abaixo</option>{reasonRules.data?.map(r=><option key={r.code} value={r.code}>{r.code.replace(/[㐀-鿿]/g,'').trim()||r.label}</option>)}</select></label></div>{reasonCode&&<p className="returns-muted">O resultado foi preenchido a partir do motivo selecionado.</p>}
    <label>Teste ou inspeção realizada<textarea name="testNotes" defaultValue={item?.testNotes??''} maxLength={4000} required={decided} placeholder="Descreva o que testou e o que encontrou."/></label><label>Motivo / observação<textarea name="reason" defaultValue={item?.reason??''} maxLength={2000} required={reasonRequired} placeholder="Complete o motivo quando precisar explicar o resultado."/></label>
    <details className="returns-advanced" open={Boolean(item?.customerReportedDefect||item?.customerEvidenceReference)}><summary>Relato ou vídeo enviado pelo cliente</summary><p>Confira a evidência antes de concluir. Se o vídeo indica defeito e o teste não confirma, a coordenação precisa revisar.</p><label>Defeito informado pelo cliente<textarea name="customerReportedDefect" defaultValue={item?.customerReportedDefect??''} maxLength={2000}/></label><label>Referência do vídeo, mensagem ou documento do cliente<input name="customerEvidenceReference" defaultValue={item?.customerEvidenceReference??''} maxLength={1000} placeholder="Link ou identificação do arquivo"/></label></details><label>Constatação no teste<select name="testFinding" defaultValue={item?.testFinding??'not_tested'}><option value="not_tested">Inspeção descrita no campo de teste</option><option value="reproduced">Defeito confirmado</option><option value="not_reproduced">Defeito não reproduzido</option></select></label>
    {canAccess('returns.logistics')&&<details className="returns-advanced" open={Boolean(item?.routingOverride)}><summary>Exceção autorizada pela coordenação</summary><label>Autorização para exceção de encaminhamento<input name="routingOverride" defaultValue={item?.routingOverride??''} maxLength={4000} placeholder="Registre a conferência e a autorização"/></label></details>}
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
