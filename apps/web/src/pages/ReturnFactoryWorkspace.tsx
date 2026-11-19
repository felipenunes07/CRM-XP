import { useState,type FormEvent } from 'react';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import type { ReturnFactoryBatch,ReturnBatchInput } from '@olist-crm/shared';
import { api } from '../lib/api';
import { usePermissions } from '../hooks/usePermissions';
const now=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const date=(s:string|null)=>s?new Date(s).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Em formação';
function DraftFactoryEditor({batch:b,token,onSaved}:{batch:ReturnFactoryBatch;token:string;onSaved:()=>void}){
 const [search,setSearch]=useState(b.manufacturer),[editing,setEditing]=useState(false);
 const [quantities,setQuantities]=useState<Record<string,number>>(()=>Object.fromEntries(b.lines.map(l=>[l.itemId,l.quantity])));
 const available=useQuery({queryKey:['return-factory-available',search],queryFn:()=>api.returnFactoryAvailable(token,search)});
 const merged=Array.from(new Map([...b.lines,...(available.data??[])].map(l=>[l.itemId,l])).values());
 const mutation=useMutation({mutationFn:async({action,data}:{action:'lines'|'send';data:Record<string,unknown>})=>action==='lines'?api.replaceReturnFactoryLines(token,b.id,data):api.sendReturnFactory(token,b.id,data),onSuccess:onSaved,retry:false});
 const cases=Array.from(new Map(b.lines.map(l=>[l.caseId,{id:l.caseId,version:l.version}])).values());
 return <section className="returns-form"><h3>Conferência do lote em formação</h3><button onClick={()=>setEditing(!editing)}>Adicionar ou retirar itens do lote</button>
  {editing&&<><label>Buscar itens disponíveis<input value={search} onChange={e=>setSearch(e.target.value)}/></label>{merged.map(l=><label key={l.itemId}>{l.protocol} · {l.customerCode} · {l.model}<input aria-label={'Quantidade '+l.protocol+' '+l.model} type="number" min="0" value={quantities[l.itemId]??0} onChange={e=>setQuantities({...quantities,[l.itemId]:Number(e.target.value)})}/></label>)}<button disabled={mutation.isPending} onClick={()=>{
   const lines=merged.filter(l=>(quantities[l.itemId]??0)>0).map(l=>({caseId:l.caseId,itemId:l.itemId,quantity:quantities[l.itemId]!,version:l.version}));
   const versions=Array.from(new Map([...cases,...lines.map(l=>({id:l.caseId,version:l.version}))].map(c=>[c.id,c])).values());
   mutation.mutate({action:'lines',data:{requestId:crypto.randomUUID(),version:b.version,cases:versions,lines}});
  }}>Salvar composição do lote</button></>}
  <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);mutation.mutate({action:'send',data:{requestId:crypto.randomUUID(),version:b.version,cases,sentAt:new Date(String(f.get('sentAt'))).toISOString(),dueAt:b.dueAt,reference:String(f.get('reference')),carrier:String(f.get('carrier')),fromLocation:b.fromLocation}});}}><label>Data da saída física<input type="datetime-local" name="sentAt" defaultValue={now()} required/></label><label>Comprovante da saída<input name="reference" defaultValue={b.reference} required/></label><label>Transportadora / entregue por<input name="carrier" defaultValue={b.carrier} required/></label><button className="button primary" disabled={mutation.isPending}>Confirmar saída física do lote</button></form>
  {available.isError&&<p role="alert">Não foi possível consultar os itens disponíveis.</p>}{mutation.isError&&<p role="alert">{mutation.error.message}</p>}
 </section>;
}
export function ReturnFactoryWorkspace({token,onCase}:{token:string;onCase:(id:string)=>void}){
 const {canAccess}=usePermissions();const manage=canAccess('returns.logistics');const queryClient=useQueryClient();
 const [creating,setCreating]=useState(false),[selected,setSelected]=useState<string|null>(null),[search,setSearch]=useState('');
 const [page,setPage]=useState(1);
 const batches=useQuery({queryKey:['return-factories',search,page],queryFn:()=>api.returnFactoryBatches(token,search,page)});
 const batch=batches.data?.items.find(b=>b.id===selected);
 const cancel=useMutation({mutationFn:(b:ReturnFactoryBatch)=>{
  const reason=window.prompt('Motivo da correção do registro de envio. Use somente se a saída foi registrada por engano ou se os movimentos já foram corrigidos com comprovantes.');
  if(!reason?.trim())throw Error('Correção cancelada');
  const cases=Array.from(new Map(b.lines.map(l=>[l.caseId,{id:l.caseId,version:l.version}])).values());
  return api.cancelReturnFactory(token,b.id,{requestId:crypto.randomUUID(),reason:reason.trim(),cases});
 },onSuccess:()=>{void queryClient.invalidateQueries({queryKey:['return-factories']});void queryClient.invalidateQueries({queryKey:['return-factory-available']});void queryClient.invalidateQueries({queryKey:['returns']});}});
 const filtered=batches.data?.items;
 const reload=()=>{void queryClient.invalidateQueries({queryKey:['return-factories']});void queryClient.invalidateQueries({queryKey:['return-factory-available']});void queryClient.invalidateQueries({queryKey:['return-detail']});void queryClient.invalidateQueries({queryKey:['returns']});};
 return <div className="returns-layout"><section className="panel returns-queue"><div className="returns-detail-heading"><h2>Envios de fábrica</h2>{manage&&<button className="button primary" onClick={()=>setCreating(true)}>Novo envio</button>}</div><label>Buscar envio, fábrica ou cliente<input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} /></label><p>Uma relação de envio conserva o cliente e o protocolo de cada quantidade.</p>
  {batches.isLoading&&<p role="status">Carregando envios...</p>}{batches.isError&&<p role="alert">Não foi possível carregar os envios. <button onClick={()=>void batches.refetch()}>Tentar novamente</button></p>}
  <div className="returns-cards">{filtered?.map(b=><button className={`returns-card ${b.id===selected?'is-selected':''}`} key={b.id} onClick={()=>{setSelected(b.id);setCreating(false);}}><strong>{b.code} · {b.manufacturer} · {b.lotReference}</strong><span>{b.lines.reduce((n,l)=>n+l.quantity,0)} peças · {new Set(b.lines.map(l=>l.caseId)).size} protocolo(s)</span><span>Prazo {date(b.dueAt)} · {b.voidedAt?'Registro corrigido':b.state==='assembling'?'Em formação':'Enviado'}</span><small>{b.reference}</small></button>)}</div>{!filtered?.length&&!batches.isLoading&&<p>Nenhum envio encontrado.</p>}
  {batches.data&&<div className="returns-pagination"><button disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page} · {batches.data.total} envios</span><button disabled={page*25>=batches.data.total} onClick={()=>setPage(page+1)}>Próxima</button></div>}
 </section><section className="panel returns-detail">
  {creating?<FactoryForm token={token} onCancel={()=>setCreating(false)} onSaved={b=>{setSelected(b.id);setCreating(false);void queryClient.invalidateQueries({queryKey:['return-factories']});void queryClient.invalidateQueries({queryKey:['return-factory-available']});void queryClient.invalidateQueries({queryKey:['return-detail']});void queryClient.invalidateQueries({queryKey:['returns']});}}/>:batch?<><div className="returns-detail-heading"><div><p className="eyebrow">Relação de envio · {batch.voidedAt?'registro corrigido':batch.state==='assembling'?'em formação':'enviado'}</p><h2>{batch.code} · {batch.manufacturer}</h2></div><button onClick={()=>window.print()}>Imprimir relação do envio</button></div><p>Saída {date(batch.sentAt)} · prazo {date(batch.dueAt)}</p><p>{batch.fromLocation} → {batch.manufacturer} · {batch.carrier}</p><p>Comprovante: {batch.reference} · registrado por {batch.authorName}</p>
   {batch.lines.map(l=><article className="returns-execution-card" key={l.id}><strong>{l.protocol} · {l.customerCode} · {l.customerName}</strong><p>{l.quantity} × {l.model} · {l.decidedQuantity} com parecer · {l.quantity-l.decidedQuantity} aguardando parecer</p><button onClick={()=>onCase(l.caseId)}>Abrir protocolo {l.protocol}</button></article>)}
   <p>{batch.state==='assembling'?'Confira os itens e confirme a saída física para liberar parecer e retorno.':'Para registrar parecer e retorno, abra o protocolo de origem. Após a saída, um complemento exige novo envio.'}</p>
   {manage&&!batch.voidedAt&&batch.state==='assembling'&&<DraftFactoryEditor key={batch.id+'-'+batch.version} batch={batch} token={token} onSaved={reload}/>}
   {manage&&!batch.voidedAt&&<button disabled={cancel.isPending} onClick={()=>cancel.mutate(batch)}>Corrigir registro de envio</button>}{cancel.isError&&<p role="alert">{cancel.error.message}</p>}
   <div className="return-print-label"><h1>{batch.code} · {batch.manufacturer}</h1><p>Saída: {date(batch.sentAt)} · retorno previsto: {date(batch.dueAt)}</p><p>{batch.fromLocation} → {batch.manufacturer} · {batch.carrier} · {batch.reference}</p><table><thead><tr><th>Protocolo / cliente</th><th>Modelo</th><th>Quantidade</th></tr></thead><tbody>{batch.lines.map(l=><tr key={l.id}><td>{l.protocol} · {l.customerCode} · {l.customerName}</td><td>{l.model}</td><td>{l.quantity}</td></tr>)}</tbody></table><p>Total: {batch.lines.reduce((n,l)=>n+l.quantity,0)} peças · conferido por {batch.authorName}</p><p>Entregue por: ____________________ Recebido por: ____________________</p></div>
  </>:<div className="returns-empty"><h2>Envios e retornos, por cliente</h2><p>Selecione um envio ou forme uma relação com quantidades já encaminhadas para análise de fábrica.</p></div>}
 </section></div>;
}
function FactoryForm({token,onSaved,onCancel}:{token:string;onSaved:(b:ReturnFactoryBatch)=>void;onCancel:()=>void}){
 const [state,setState]=useState<'assembling'|'sent'>('assembling');
 const [requestId]=useState(()=>crypto.randomUUID()),[search,setSearch]=useState(''),[selected,setSelected]=useState<Record<string,number>>({}),[error,setError]=useState('');
 const available=useQuery({queryKey:['return-factory-available',search],queryFn:()=>api.returnFactoryAvailable(token,search)});
 const [chosen,setChosen]=useState<NonNullable<typeof available.data>>([]);
 const lookups=useQuery({queryKey:['return-lookups'],queryFn:()=>api.returnLookups(token)});
 const mutation=useMutation({mutationFn:(input:ReturnBatchInput)=>api.dispatchReturnFactory(token,input),retry:false,onSuccess:onSaved});
 const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setError('');const data=new FormData(e.currentTarget);const val=(key:string)=>String(data.get(key)??'').trim();
  const lines=chosen.filter(l=>selected[l.itemId]).map(l=>({caseId:l.caseId,itemId:l.itemId,version:l.version,quantity:selected[l.itemId]!}));
  if(!lines.length){setError('Selecione pelo menos um item');return;}
  mutation.mutate({requestId,manufacturer:val('manufacturer'),sentAt:new Date(val('sentAt')).toISOString(),dueAt:new Date(val('dueAt')).toISOString(),reference:val('reference'),carrier:val('carrier'),fromLocation:val('fromLocation'),lines,state:val('state') as 'assembling'|'sent',lotReference:val('lotReference'),responsibleId:val('responsibleId')||null});
 };
 return <form className="returns-form" aria-label="Novo envio de fábrica" onSubmit={submit}><h2>Novo envio de fábrica</h2><p>VV forma lote. D.E., STC e TC-OMG seguem por protocolo, sem misturar fábricas. Em formação reserva as peças; parecer só é liberado após a saída física.</p><fieldset disabled={mutation.isPending}>
  <label>Situação<select aria-label="Situação" name="state" value={state} onChange={e=>setState(e.target.value as 'assembling'|'sent')}><option value="assembling">Em formação · ainda na XP</option><option value="sent">Saída física conferida</option></select></label><label>Identificação do lote VV<input name="lotReference" maxLength={250} placeholder="Obrigatória para VV"/></label><label>Responsável pelo encaminhamento<select name="responsibleId" defaultValue=""><option value="">Responsável configurado da fábrica / quem registra</option>{lookups.data?.people.filter(p=>p.canLogistics).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <div className="returns-form-grid"><label>Fábrica do envio<input name="manufacturer" required maxLength={100}/></label><label>Data da saída<input name="sentAt" type="datetime-local" required defaultValue={now()}/></label><label>Prazo interno de retorno<input name="dueAt" type="datetime-local" required/></label><label>Local de saída<input name="fromLocation" required maxLength={250}/></label><label>Transportadora / entregue por<input name="carrier" required={state==='sent'} maxLength={250}/></label><label>Comprovante único do envio<input name="reference" required maxLength={250}/></label></div>
  <label>Buscar itens por cliente ou fábrica<input value={search} onChange={e=>setSearch(e.target.value)}/></label>
  {available.isLoading&&<p>Carregando itens...</p>}{available.isError&&<p role="alert">Não foi possível carregar os itens. <button type="button" onClick={()=>void available.refetch()}>Tentar novamente</button></p>}
  {available.data?.map(l=><div className="returns-factory-line" key={l.itemId}><label className="returns-checkbox"><input type="checkbox" checked={Boolean(selected[l.itemId])} onChange={e=>{const checked=e.target.checked;setSelected(s=>({...s,[l.itemId]:checked?l.availableQuantity:0}));setChosen(rows=>checked?[...rows.filter(r=>r.itemId!==l.itemId),l]:rows.filter(r=>r.itemId!==l.itemId));}}/>{l.protocol} · {l.customerCode} · {l.customerName} · {l.model} · {l.manufacturer} · {l.availableQuantity} disponíveis</label>{Boolean(selected[l.itemId])&&<label>Quantidade de {l.protocol} · {l.model}<input type="number" min={1} max={l.availableQuantity} required value={selected[l.itemId]} onChange={e=>setSelected(s=>({...s,[l.itemId]:Number(e.target.value)}))}/></label>}</div>)}
  <p>{chosen.filter(l=>selected[l.itemId]).length} item(ns) selecionado(s), inclusive de outras buscas. Cada item precisa ter a mesma fábrica informada acima.</p>
  <div className="returns-actions"><button type="submit" className="button primary">Registrar encaminhamento</button><button type="button" onClick={onCancel}>Cancelar</button></div>
 </fieldset>{error&&<p role="alert">{error}</p>}{mutation.isError&&<p role="alert">{mutation.error.message} Se outra pessoa alterou os protocolos, cancele e abra um novo formulário para conferir as quantidades atuais.</p>}</form>;
}
