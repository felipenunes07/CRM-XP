import {useQuery,useMutation} from '@tanstack/react-query';
import type {ReturnDetail} from '@olist-crm/shared';
import {api} from '../lib/api';
import {usePermissions} from '../hooks/usePermissions';
const money=(n:number)=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function ReturnCreditCalculator({token,detail:d,onSaved}:{token:string;detail:ReturnDetail;onSaved:(d:ReturnDetail)=>void}){
 const {canAccess}=usePermissions();
 const sources=d.execution.resolutions.filter(r=>!r.voidedAt&&['credit','sale_cancellation'].includes(r.kind)&&!d.execution.credits.some(c=>c.resolutionId===r.id&&['approved','posted'].includes(c.status)));
 if(!canAccess('returns.logistics')&&!canAccess('returns.finance'))return null;
 return <section className="panel"><h3>Cálculo automático dos créditos do cliente</h3><p>O CRM calcula pelo histórico de compras do cliente. Sem uma média utilizável, consulta o preço de referência. Em cancelamentos, usa o preço da venda original. O financeiro confere e confirma o lançamento.</p>{sources.length===0&&<p>Para oferecer crédito, abra Solução para o cliente e escolha essa forma de atendimento. Se o valor já foi autorizado, confira o lançamento na carteira abaixo.</p>}{sources.map(s=><CalculatedCredit key={s.id+':'+d.version} token={token} detail={d} sourceId={s.id} onSaved={onSaved}/>)}</section>;
}
function CalculatedCredit({token,detail:d,sourceId,onSaved}:{token:string;detail:ReturnDetail;sourceId:string;onSaved:(d:ReturnDetail)=>void}){
 const {canAccess}=usePermissions(),query=useQuery({queryKey:['return-credit-quote',d.id,sourceId,d.version],queryFn:()=>api.returnCreditQuote(token,d.id,sourceId),retry:false}),q=query.data;
 const mutation=useMutation({retry:false,mutationFn:()=>{if(!q||q.issue||q.amountCents===null)throw Error('Recalcule o crédito');return api.executeReturn(token,d.id,'credit_authorize',{requestId:crypto.randomUUID(),version:d.version,party:'customer',sourceId,amountCents:q.amountCents,currency:'BRL',priceBasis:q.basis,approvalReference:'CALCULO-CRM-'+(q.revision??'VENDA-ORIGINAL'),useCalculation:true,quoteRevision:q.revision});},onSuccess:onSaved});
 return <article className="returns-execution-card"><strong>{q?.sku??'Calculando'} · {q?.quantity??''} peça(s) · {q?.category}</strong>{q?.issue?<p role="alert">{q.issue}</p>:q?.amountCents!==null&&q?.amountCents!==undefined&&<><p>{q.quantity} × {money(q.unitCents!)} = <strong>{money(q.amountCents)}</strong></p><details><summary>Ver origem do cálculo</summary><p>{q.basis}</p></details>{canAccess('returns.finance')&&d.stage==='triage_completed'&&<button disabled={mutation.isPending} onClick={()=>mutation.mutate()}>Autorizar valor calculado</button>}</>}<button disabled={query.isFetching} onClick={()=>void query.refetch()}>Recalcular</button>{query.isError&&<p role="alert">{query.error.message}</p>}{mutation.isError&&<p role="alert">{mutation.error.message}</p>}</article>;
}
