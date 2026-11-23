import type { Pool, PoolClient } from "pg";
import type { ReturnExecution, ReturnItem, ReturnProgress, ReturnSourcePool } from "@olist-crm/shared";
export const live=<T extends {voidedAt:string|null}>(rows:T[])=>rows.filter(row=>!row.voidedAt);
export const sum=<T>(rows:T[],value:(row:T)=>number)=>rows.reduce((total,row)=>total+value(row),0);
export function originalAvailable(item:ReturnItem,f:ReturnExecution,ignoreBatchId?:string){
 return item.quantity-sum(f.factoryLines.filter(l=>l.itemId===item.id&&!l.voidedAt&&l.batchId!==ignoreBatchId),l=>l.quantity)
  +sum(live(f.receipts).filter(r=>r.itemId===item.id&&r.kind==='original_returned'),r=>r.quantity)
  -sum(live(f.deliveries).filter(d=>d.itemId===item.id&&d.asset==='original'),d=>d.quantity)
  -sum(live(f.dispositions).filter(d=>d.itemId===item.id&&d.asset==='original'),d=>d.quantity);
}
export function replacementAvailable(receiptId:string,f:ReturnExecution){
 const receipt=live(f.receipts).find(r=>r.id===receiptId);
 return (receipt?.quantity??0)-sum(live(f.deliveries).filter(d=>d.receiptId===receiptId),d=>d.quantity)-sum(live(f.dispositions).filter(d=>d.receiptId===receiptId),d=>d.quantity);
}
export function deriveProgress(items:ReturnItem[],stage:string,f:ReturnExecution):{pools:ReturnSourcePool[];progress:ReturnProgress}{
 const results=live(f.results),receipts=live(f.receipts),resolutions=live(f.resolutions),deliveries=live(f.deliveries),dispositions=live(f.dispositions);
 const pools=items.flatMap<ReturnSourcePool>(item=>item.outcome==='external_analysis'
  ?results.filter(r=>r.itemId===item.id).map(r=>({key:r.id,itemId:item.id,resultId:r.id,model:item.model,outcome:r.decision,quantity:r.quantity,remainingQuantity:r.quantity-sum(resolutions.filter(s=>s.resultId===r.id),s=>s.quantity)}))
  :['pending','review'].includes(item.outcome)?[]:[{key:item.id,itemId:item.id,resultId:null,model:item.model,outcome:item.outcome,quantity:item.quantity,remainingQuantity:item.quantity-sum(resolutions.filter(s=>s.itemId===item.id&&!s.resultId),s=>s.quantity)}]);
 const postedCustomer=(id:string)=>f.credits.some(c=>c.resolutionId===id&&c.status==='posted');
 const postedSupplier=(id:string)=>f.credits.some(c=>c.resultId===id&&c.status==='posted');
 const factoryPendingQuantity=sum(items.filter(i=>i.outcome==='external_analysis'),i=>i.quantity)-sum(results,r=>r.quantity);
 const supplierPendingQuantity=sum(results.filter(r=>r.decision==='approved'),r=>r.compensation==='replacement'
  ?r.quantity-sum(receipts.filter(p=>p.resultId===r.id&&p.kind==='supplier_replacement'),p=>p.quantity)
  :r.compensation==='credit'&&!postedSupplier(r.id)?r.quantity:0);
 const financePendingCount=resolutions.filter(s=>['credit','sale_cancellation'].includes(s.kind)&&!postedCustomer(s.id)).length+results.filter(r=>r.compensation==='credit'&&!postedSupplier(r.id)).length;
 const deliveryPendingQuantity=sum(resolutions.filter(s=>['replacement','return_original'].includes(s.kind)),s=>s.quantity-sum(deliveries.filter(d=>d.resolutionId===s.id&&d.deliveredAt),d=>d.quantity));
 const customerPendingQuantity=sum(items,i=>i.quantity)-sum(resolutions,s=>s.quantity)+sum(resolutions.filter(s=>['credit','sale_cancellation'].includes(s.kind)&&!postedCustomer(s.id)),s=>s.quantity)+deliveryPendingQuantity;
 const originalsPending=sum(items,i=>i.quantity)-sum(receipts.filter(r=>r.kind==='factory_retained'),r=>r.quantity)
  -sum(deliveries.filter(d=>d.asset==='original'&&d.deliveredAt),d=>d.quantity)-sum(dispositions.filter(d=>d.asset==='original'&&d.completedAt),d=>d.quantity);
 const replacementPending=sum(receipts.filter(r=>['supplier_replacement','stock_replacement'].includes(r.kind)),r=>r.quantity)
  -sum(deliveries.filter(d=>d.asset==='replacement'&&d.deliveredAt),d=>d.quantity)-sum(dispositions.filter(d=>d.asset==='replacement'&&d.completedAt),d=>d.quantity);
 const internalPendingQuantity=originalsPending+replacementPending;
 const reviewCount=f.reviews.filter(r=>!r.resolvedAt).length;
 const blockers:string[]=[];
 if(!['triage_completed','closed'].includes(stage))blockers.push('Concluir a triagem e conferir todas as peças');
 if(factoryPendingQuantity)blockers.push(`${factoryPendingQuantity} peça(s) aguardando envio ou decisão da fábrica`);
 if(supplierPendingQuantity)blockers.push(`${supplierPendingQuantity} peça(s) com compensação da fábrica pendente`);
 if(customerPendingQuantity)blockers.push(`${customerPendingQuantity} peça(s) com atendimento ao cliente pendente`);
 if(financePendingCount)blockers.push(`${financePendingCount} crédito(s) sem confirmação no financeiro oficial`);
 if(internalPendingQuantity)blockers.push(`${internalPendingQuantity} peça(s) com destino físico ainda não concluído`);
 if(!f.notices.length)blockers.push('Registrar a comunicação efetivamente realizada com o cliente');
 if(reviewCount)blockers.push(`${reviewCount} revisão(ões) ou divergência(s) aberta(s)`);
 return {pools,progress:{factoryPendingQuantity,supplierPendingQuantity,customerPendingQuantity,financePendingCount,deliveryPendingQuantity,internalPendingQuantity,reviewCount,
  customerComplete:customerPendingQuantity===0&&f.notices.length>0&&reviewCount===0&&['triage_completed','closed'].includes(stage),
  internalComplete:internalPendingQuantity===0&&factoryPendingQuantity===0&&supplierPendingQuantity===0,
  canClose:stage==='triage_completed'&&blockers.length===0,blockers}};
}
function camelRow(row:Record<string,unknown>){return Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,char:string)=>char.toUpperCase()),value instanceof Date?value.toISOString():key==='amount_cents'?Number(value):value]));}
export async function loadExecutions(client:Pool|PoolClient,cases:Array<{id:string;items:ReturnItem[];stage:string}>):Promise<Map<string,ReturnExecution>>{
 const executions=new Map<string,ReturnExecution>();if(!cases.length)return executions;
 const tables=[['return_factory_results','results'],['return_physical_receipts','receipts'],['return_resolutions','resolutions'],['return_credits','credits'],['return_deliveries','deliveries'],['return_dispositions','dispositions'],['return_notices','notices'],['return_reviews','reviews']] as const;
 const facts=new Map(cases.map(c=>[c.id,{factoryLines:[],pools:[],progress:{}} as Record<string,unknown>]));
 const ids=cases.map(c=>c.id);
 // Batch the whole queue, and serialize queries on a transaction client.
 for(const [table,key] of tables){
  const rows=(await client.query(`SELECT * FROM ${table} WHERE case_id=ANY($1::uuid[]) ORDER BY id`,[ids])).rows.map(camelRow);
  for(const c of cases)facts.get(c.id)![key]=rows.filter(r=>r.caseId===c.id);
 }
 const lines=await client.query(`SELECT l.*,b.manufacturer,b.sent_at,b.due_at,b.reference,b.voided_at,b.state,b.mode,b.lot_reference,bp.id AS responsible_id,bp.full_name AS responsible_name,
  'EF-'||LPAD(b.number::text,GREATEST(6,length(b.number::text)),'0') AS batch_code
  FROM return_factory_lines l JOIN return_factory_batches b ON b.id=l.batch_id LEFT JOIN profiles bp ON bp.id=b.responsible_id AND bp.is_active WHERE l.case_id=ANY($1::uuid[]) ORDER BY b.sent_at,l.id`,[ids]);
 const lineRows=lines.rows.map(camelRow);
 const legacyConflicts=(await client.query(`SELECT DISTINCT l.case_id FROM return_legacy_links l WHERE l.case_id=ANY($1::uuid[]) AND l.active AND NOT EXISTS(SELECT 1 FROM return_legacy_rows r JOIN return_legacy_revisions v ON v.id=r.revision_id AND v.active WHERE r.fingerprint=l.fingerprint AND r.occurrence=l.occurrence)`,[ids])).rows;
 const stockPending=(await client.query(`SELECT DISTINCT d.case_id FROM return_dispositions d WHERE d.case_id=ANY($1::uuid[]) AND d.voided_at IS NULL AND d.completed_at IS NOT NULL AND d.destination IN ('stock','outlet','reconditioning') AND NOT EXISTS(SELECT 1 FROM return_stock_lots l WHERE l.disposition_id=d.id)`,[ids])).rows;
 for(const c of cases){const f=facts.get(c.id)! as unknown as ReturnExecution;f.factoryLines=lineRows.filter(r=>r.caseId===c.id) as unknown as ReturnExecution['factoryLines'];Object.assign(f,deriveProgress(c.items,c.stage,f));f.progress.stockPending=stockPending.some(r=>r.case_id===c.id);f.progress.legacyConflict=legacyConflicts.some(r=>r.case_id===c.id);if(f.progress.stockPending){f.progress.blockers.push('Registrar entrada das peças recuperadas no estoque após conferência');f.progress.canClose=false;f.progress.internalComplete=false;}if(f.progress.legacyConflict){f.progress.blockers.push('Conferir vínculo cuja linha mudou ou saiu da planilha');f.progress.canClose=false;f.progress.customerComplete=false;}executions.set(c.id,f);}return executions;
}
export async function loadExecution(client:Pool|PoolClient,id:string,items:ReturnItem[],stage:string):Promise<ReturnExecution>{
 return (await loadExecutions(client,[{id,items,stage}])).get(id)!;
}
