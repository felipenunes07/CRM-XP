import type { PoolClient } from 'pg';
import type { ReturnExecution,ReturnExecutionInputMap,ReturnItem,ReturnFactoryBatch } from '@olist-crm/shared';
import { pool } from '../../db/client.js';
import { HttpError } from '../../lib/httpError.js';
import type { JwtUser } from '../platform/authService.js';
import { command,lockCase,record } from './returnTransactions.js';
import { loadExecution,live,sum,originalAvailable,replacementAvailable } from './returnExecutionData.js';
import { batchSchema,batchCancelSchema,executionSchemas } from './returnExecutionSchemas.js';
const ensure:(condition:unknown,message:string,status?:number)=>asserts condition=(condition,message,status=400)=>{if(!condition)throw new HttpError(status,message);};
type Context={id:string;actor:JwtUser;items:ReturnItem[];facts:ReturnExecution};
type Table='return_factory_results'|'return_physical_receipts'|'return_resolutions'|'return_credits'|'return_deliveries'|'return_dispositions'|'return_notices'|'return_reviews'|'return_factory_batches'|'return_factory_lines';
async function insert(client:PoolClient,table:Table,data:Record<string,unknown>){
 const keys=Object.keys(data);return (await client.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,Object.values(data))).rows[0].id as string;
}
async function itemsFor(client:PoolClient,id:string):Promise<ReturnItem[]>{return (await client.query(`SELECT id,model,sku,quantity,frame,color,manufacturer,outcome,reason,test_notes AS "testNotes" FROM return_items WHERE case_id=$1 ORDER BY id`,[id])).rows;}
const itemFor=(ctx:Context,id:string)=>{const item=ctx.items.find(i=>i.id===id);ensure(item,'Item não encontrado neste protocolo',404);return item;};
const factFor=<T extends {id:string;voidedAt:string|null}>(rows:T[],id:string)=>{const row=live(rows).find(r=>r.id===id);ensure(row,'Movimento não encontrado neste protocolo',404);return row;};
const dateOrder=(a:string,b:string)=>ensure(Date.parse(a)>=Date.parse(b),'A confirmação não pode ser anterior à saída');
async function financialReference(client:PoolClient,system:string,reference:string){
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['return-finance:'+system.trim().toLowerCase()+':'+reference.trim().toLowerCase()]);
 const used=await client.query(`SELECT id FROM return_credits WHERE (lower(trim(official_system))=lower(trim($1)) AND lower(trim(official_reference))=lower(trim($2))) OR (lower(trim(reversal_system))=lower(trim($1)) AND lower(trim(reversal_reference))=lower(trim($2)))`,[system,reference]);
 ensure(!used.rowCount,'Esta referência financeira já foi registrada em crédito ou estorno',409);
}
function checkSource(ctx:Context,itemId:string,receiptId:string|null,asset:'original'|'replacement',quantity:number){
 const item=itemFor(ctx,itemId);
 if(asset==='original'){ensure(!receiptId,'A peça original usa o saldo físico do item');ensure(quantity<=originalAvailable(item,ctx.facts),'Quantidade de originais indisponível na XP');}
 else{ensure(receiptId,'Selecione a entrada física das substitutas');const receipt=factFor(ctx.facts.receipts,receiptId);ensure(receipt.itemId===itemId&&['supplier_replacement','stock_replacement'].includes(receipt.kind),'Entrada de substituta incompatível');ensure(quantity<=replacementAvailable(receiptId,ctx.facts),'Quantidade de substitutas indisponível nesta entrada');}
}
const handlers:{[K in keyof ReturnExecutionInputMap]:(client:PoolClient,ctx:Context,input:ReturnExecutionInputMap[K])=>Promise<void>}={
 async factory_result(client,ctx,i){
  const line=ctx.facts.factoryLines.find(l=>l.id===i.lineId&&!l.voidedAt);ensure(line,'Linha de envio não encontrada neste protocolo',404);
  ensure(i.quantity<=line.quantity-sum(live(ctx.facts.results).filter(r=>r.lineId===line.id),r=>r.quantity),'Parecer excede a quantidade enviada ainda sem decisão');
  dateOrder(i.occurredAt,line.sentAt);
  ensure(i.decision==='approved'||i.compensation==='none','Recusa não pode prometer compensação da fábrica');
  ensure(!(i.decision==='approved'&&i.compensation==='none')||i.approvalReference,'Informe a autorização para aprovação sem compensação');
  await insert(client,'return_factory_results',{case_id:ctx.id,item_id:line.itemId,line_id:line.id,quantity:i.quantity,decision:i.decision,compensation:i.compensation,reason:i.reason,original_report:i.originalReport,translation:i.translation,reference:i.reference,occurred_at:i.occurredAt,approval_reference:i.approvalReference,author_name:ctx.actor.name});
 },
 async physical_receipt(client,ctx,i){
  itemFor(ctx,i.itemId);
  if(i.kind==='stock_replacement'){
   ensure(!i.lineId&&!i.resultId,'Separação de estoque não é retorno de fábrica');
   const demand=sum(live(ctx.facts.resolutions).filter(s=>s.itemId===i.itemId&&s.kind==='replacement'),s=>s.quantity);
   ensure(i.quantity<=demand-sum(live(ctx.facts.receipts).filter(r=>r.itemId===i.itemId&&r.kind==='stock_replacement'),r=>r.quantity),'A separação do estoque excede as substituições prometidas');
  }else{
   const line=ctx.facts.factoryLines.find(l=>l.id===i.lineId&&!l.voidedAt);ensure(line&&line.itemId===i.itemId,'Envio incompatível com este item');dateOrder(i.occurredAt,line.sentAt);
   if(i.kind==='supplier_replacement'){
    ensure(i.resultId,'Selecione o parecer que promete as substitutas');const result=factFor(ctx.facts.results,i.resultId);
    ensure(result.lineId===line.id&&result.compensation==='replacement','O parecer não autoriza substituta; crédito e substituta são compensações distintas');
    ensure(i.quantity<=result.quantity-sum(live(ctx.facts.receipts).filter(r=>r.resultId===result.id&&r.kind==='supplier_replacement'),r=>r.quantity),'Substitutas excedem a compensação aprovada');
   }else{
    ensure(!i.resultId,'A custódia da original está vinculada ao envio, separada do parecer');
    ensure(i.quantity<=line.quantity-sum(live(ctx.facts.receipts).filter(r=>r.lineId===line.id&&['original_returned','factory_retained'].includes(r.kind)),r=>r.quantity),'Original já retornada ou retida; quantidade excede o envio');
    ensure(i.kind!=='factory_retained'||i.approvalReference,'Retenção definitiva precisa de autorização e comprovante');
   }
  }
  await insert(client,'return_physical_receipts',{case_id:ctx.id,item_id:i.itemId,line_id:i.lineId,result_id:i.resultId,kind:i.kind,quantity:i.quantity,location:i.location,received_by:i.receivedBy,reference:i.reference,reason:i.reason,approval_reference:i.approvalReference,occurred_at:i.occurredAt,author_name:ctx.actor.name});
 },
 async resolution(client,ctx,i){
  itemFor(ctx,i.itemId);const source=ctx.facts.pools.find(p=>p.itemId===i.itemId&&p.resultId===i.resultId);ensure(source,'Aguarde uma decisão técnica definitiva para esta quantidade');
  ensure(i.quantity<=source.remainingQuantity,'Esta quantidade já tem atendimento definido');
  if(i.kind==='not_applicable'||(['credit','replacement'].includes(i.kind)&&source.outcome!=='approved'))ensure(i.approvalReference,'Exceção de atendimento exige autorização da gestão');
  await insert(client,'return_resolutions',{case_id:ctx.id,item_id:i.itemId,result_id:i.resultId,quantity:i.quantity,kind:i.kind,reason:i.reason,approval_reference:i.approvalReference,author_name:ctx.actor.name});
 },
 async credit_authorize(client,ctx,i){
  let itemId:string;
  if(i.party==='customer'){const resolution=factFor(ctx.facts.resolutions,i.sourceId);ensure(resolution.kind==='credit','Este atendimento não prevê crédito');ensure(i.currency==='BRL','Crédito do cliente deve ser registrado em BRL');itemId=resolution.itemId;}
  else{const result=factFor(ctx.facts.results,i.sourceId);ensure(result.compensation==='credit','O parecer não prevê crédito do fornecedor');itemId=result.itemId;}
  await insert(client,'return_credits',{case_id:ctx.id,item_id:itemId,resolution_id:i.party==='customer'?i.sourceId:null,result_id:i.party==='supplier'?i.sourceId:null,party:i.party,amount_cents:i.amountCents,currency:i.currency,price_basis:i.priceBasis,approval_reference:i.approvalReference,author_name:ctx.actor.name});
 },
 async credit_post(client,ctx,i){
  const credit=ctx.facts.credits.find(c=>c.id===i.creditId);ensure(credit&&credit.status==='approved','Crédito não está autorizado ou já foi confirmado');
  await financialReference(client,i.officialSystem,i.officialReference);
  await client.query(`UPDATE return_credits SET status='posted',official_system=$2,official_reference=$3,posted_at=$4 WHERE id=$1`,[credit.id,i.officialSystem,i.officialReference,i.occurredAt]);
 },
 async credit_reverse(client,ctx,i){
  const credit=ctx.facts.credits.find(c=>c.id===i.creditId);ensure(credit&&['approved','posted'].includes(credit.status),'Crédito não pode ser estornado novamente');
  if(credit.status==='posted'){ensure(i.officialSystem&&i.officialReference,'Informe sistema e referência do estorno efetivamente lançado');dateOrder(i.occurredAt,credit.postedAt!);await financialReference(client,i.officialSystem,i.officialReference);}
  await client.query(`UPDATE return_credits SET status=$2,reversal_system=$3,reversal_reference=$4,reversal_reason=$5,reversed_at=$6 WHERE id=$1`,[credit.id,credit.status==='posted'?'reversed':'voided',i.officialSystem,i.officialReference,i.reason,i.occurredAt]);
 },
 async delivery(client,ctx,i){
  const resolution=factFor(ctx.facts.resolutions,i.resolutionId);ensure(['replacement','return_original'].includes(resolution.kind),'Este atendimento não exige entrega física');
  ensure(i.quantity<=resolution.quantity-sum(live(ctx.facts.deliveries).filter(d=>d.resolutionId===resolution.id),d=>d.quantity),'A entrega excede a quantidade prometida ainda não alocada');
  const asset=resolution.kind==='return_original'?'original':'replacement';checkSource(ctx,resolution.itemId,i.receiptId,asset,i.quantity);
  ensure(i.method!=='dispatch'||i.tracking,'Despacho exige transportadora/rastreio');ensure(i.method!=='pickup'||i.deliveryProof,'Retirada exige comprovante e nome do retirante');
  await insert(client,'return_deliveries',{case_id:ctx.id,item_id:resolution.itemId,resolution_id:resolution.id,receipt_id:i.receiptId,quantity:i.quantity,method:i.method,asset,recipient:i.recipient,tracking:i.tracking,reference:i.reference,sent_at:i.sentAt,delivered_at:i.method==='pickup'?i.sentAt:null,delivery_proof:i.deliveryProof,author_name:ctx.actor.name});
 },
 async delivery_confirm(client,ctx,i){
  const delivery=factFor(ctx.facts.deliveries,i.deliveryId);ensure(!delivery.deliveredAt,'Esta entrega já foi confirmada');dateOrder(i.occurredAt,delivery.sentAt);
  await client.query('UPDATE return_deliveries SET delivered_at=$2,delivery_proof=$3,recipient=$4 WHERE id=$1',[delivery.id,i.occurredAt,i.proof,i.recipient]);
 },
 async disposition(client,ctx,i){
  checkSource(ctx,i.itemId,i.receiptId,i.asset,i.quantity);
  await insert(client,'return_dispositions',{case_id:ctx.id,item_id:i.itemId,receipt_id:i.receiptId,asset:i.asset,quantity:i.quantity,destination:i.destination,from_location:i.fromLocation,to_location:i.toLocation,custodian:i.custodian,reference:i.reference,reason:i.reason,test_notes:i.testNotes,occurred_at:i.occurredAt,author_name:ctx.actor.name});
 },
 async disposition_confirm(client,ctx,i){
  const disposition=factFor(ctx.facts.dispositions,i.dispositionId);ensure(!disposition.completedAt,'Este destino já foi confirmado');dateOrder(i.occurredAt,disposition.occurredAt);
  await client.query('UPDATE return_dispositions SET completed_at=$2,completion_proof=$3,received_by=$4 WHERE id=$1',[disposition.id,i.occurredAt,i.proof,i.receivedBy]);
 },
 async notice(client,ctx,i){await insert(client,'return_notices',{case_id:ctx.id,channel:i.channel,recipient:i.recipient,summary:i.summary,reference:i.reference,occurred_at:i.occurredAt,author_name:ctx.actor.name});},
 async review(client,ctx,i){await insert(client,'return_reviews',{case_id:ctx.id,reason:i.reason,author_name:ctx.actor.name});},
 async review_resolve(client,ctx,i){const review=ctx.facts.reviews.find(r=>r.id===i.reviewId&&!r.resolvedAt);ensure(review,'Revisão aberta não encontrada',404);await client.query('UPDATE return_reviews SET resolved_at=NOW(),resolution=$2 WHERE id=$1',[review.id,i.resolution]);},
 async close(client,ctx,i){ensure(ctx.facts.progress.canClose,ctx.facts.progress.blockers.join('; '));await client.query("UPDATE return_cases SET stage='closed',closed_at=NOW(),closed_by=$2,closure_note=$3 WHERE id=$1",[ctx.id,ctx.actor.id,i.reason]);},
 async reopen(client,ctx,i){await client.query("UPDATE return_cases SET stage='triage_completed',closed_at=NULL,closed_by=NULL,closure_note='',next_action=$2 WHERE id=$1",[ctx.id,'Revisão do encerramento: '+i.reason]);await insert(client,'return_reviews',{case_id:ctx.id,reason:i.reason,author_name:ctx.actor.name});},
 async void_record(client,ctx,i){
  const f=ctx.facts;let table:Table;
  if(i.recordType==='result'){
   factFor(f.results,i.recordId);ensure(!live(f.resolutions).some(r=>r.resultId===i.recordId)&&!live(f.receipts).some(r=>r.resultId===i.recordId)&&!f.credits.some(c=>c.resultId===i.recordId&&['approved','posted'].includes(c.status)),'Cancele os atendimentos/entradas e estorne os créditos dependentes antes de corrigir o parecer');table='return_factory_results';
  }else if(i.recordType==='receipt'){
   factFor(f.receipts,i.recordId);ensure(!live(f.deliveries).some(d=>d.receiptId===i.recordId)&&!live(f.dispositions).some(d=>d.receiptId===i.recordId),'Esta entrada já foi usada em entrega ou destino');table='return_physical_receipts';
   const receipt=factFor(f.receipts,i.recordId);if(receipt.kind==='original_returned')ensure(originalAvailable(itemFor(ctx,receipt.itemId),f)>=receipt.quantity,'As originais desta entrada já foram movimentadas');
  }else if(i.recordType==='resolution'){
   factFor(f.resolutions,i.recordId);ensure(!live(f.deliveries).some(d=>d.resolutionId===i.recordId)&&!f.credits.some(c=>c.resolutionId===i.recordId&&['approved','posted'].includes(c.status)),'Estorne o crédito ou corrija a entrega antes do atendimento');table='return_resolutions';
  }else if(i.recordType==='delivery'){const delivery=factFor(f.deliveries,i.recordId);ensure(!delivery.deliveredAt,'Entrega recebida exige revisão e novo movimento de devolução; não apague a saída confirmada');table='return_deliveries';}
  else{const disposition=factFor(f.dispositions,i.recordId);ensure(!disposition.completedAt,'Destino concluído exige revisão; não apague a confirmação física');table='return_dispositions';}
  await client.query(`UPDATE ${table} SET voided_at=NOW() WHERE id=$1 AND case_id=$2`,[i.recordId,ctx.id]);
 },
};
function permissionForExecution(operation:keyof ReturnExecutionInputMap){return operation.startsWith('credit_')?'returns.finance':'returns.logistics';}
export async function executeReturnOperation<K extends keyof ReturnExecutionInputMap>(id:string,operation:K,payload:unknown,actor:JwtUser){
 ensure(actor.permissions?.includes(permissionForExecution(operation)),'Acesso negado',403);
 // The mapped schema and handler have the same K; this cast preserves their correlation.
 const input=executionSchemas[operation].parse(payload) as ReturnExecutionInputMap[K];
 await command(operation,{...input,caseId:id},actor,async client=>{
  const parent=await lockCase(client,id,input.version);
  ensure(operation==='reopen'?parent.stage==='closed':parent.stage==='triage_completed',operation==='reopen'?'Somente protocolo encerrado pode ser reaberto':'Conclua a triagem ou reabra o protocolo antes deste movimento',409);
  if(input.evidenceId)ensure((await client.query('SELECT id FROM return_attachments WHERE id=$1 AND case_id=$2',[input.evidenceId,id])).rowCount,'O anexo não pertence a este protocolo');
  const items=await itemsFor(client,id);const facts=await loadExecution(client,id,items,parent.stage);
  await handlers[operation](client,{id,actor,items,facts},input);
  await record(client,id,operation,{...input},actor);return id;
 });
}

export async function factoryAvailable(search:string){
 const {rows}=await pool.query(`SELECT i.id AS "itemId",r.id AS "caseId",r.version,'TR-'||LPAD(r.protocol_number::text,GREATEST(6,length(r.protocol_number::text)),'0') AS protocol,
  c.customer_code AS "customerCode",c.display_name AS "customerName",i.model,i.manufacturer,(i.quantity-COALESCE(sent.quantity,0))::int AS "availableQuantity"
  FROM return_items i JOIN return_cases r ON r.id=i.case_id JOIN customers c ON c.id=r.customer_id
  LEFT JOIN LATERAL(SELECT sum(l.quantity) AS quantity FROM return_factory_lines l JOIN return_factory_batches b ON b.id=l.batch_id WHERE l.item_id=i.id AND b.voided_at IS NULL)sent ON true
  WHERE r.stage='triage_completed' AND i.outcome='external_analysis' AND i.quantity>COALESCE(sent.quantity,0)
  AND (c.customer_code ILIKE $1 OR c.display_name ILIKE $1 OR i.manufacturer ILIKE $1 OR i.model ILIKE $1 OR ('TR-'||LPAD(r.protocol_number::text,GREATEST(6,length(r.protocol_number::text)),'0')) ILIKE $1) ORDER BY r.received_at,i.id LIMIT 200`,['%'+search+'%']);return rows;
}
export async function dispatchFactoryBatch(payload:unknown,actor:JwtUser){
 ensure(actor.permissions?.includes('returns.logistics'),'Acesso negado',403);const input=batchSchema.parse(payload);
 ensure(Date.parse(input.dueAt)>=Date.parse(input.sentAt),'Prazo não pode ser anterior ao envio');
 ensure(new Set(input.lines.map(l=>l.itemId)).size===input.lines.length,'Selecione cada item apenas uma vez');
 const id=await command('factory_dispatch',input,actor,async client=>{
  const versions=new Map<string,number>();for(const line of input.lines){ensure(!versions.has(line.caseId)||versions.get(line.caseId)===line.version,'Versões diferentes do mesmo protocolo');versions.set(line.caseId,line.version);}
  const allItems=new Map<string,ReturnItem[]>();const facts=new Map<string,ReturnExecution>();
  for(const caseId of [...versions.keys()].sort()){
   const parent=await lockCase(client,caseId,versions.get(caseId)!);ensure(parent.stage==='triage_completed','Somente triagens concluídas podem sair para fábrica');
   const items=await itemsFor(client,caseId);allItems.set(caseId,items);facts.set(caseId,await loadExecution(client,caseId,items,parent.stage));
  }
  const batchId=await insert(client,'return_factory_batches',{manufacturer:input.manufacturer,sent_at:input.sentAt,due_at:input.dueAt,reference:input.reference,carrier:input.carrier,from_location:input.fromLocation,author_id:actor.id,author_name:actor.name});
  for(const line of input.lines){
   const item=allItems.get(line.caseId)!.find(i=>i.id===line.itemId);ensure(item&&item.outcome==='external_analysis','Item não pertence à análise externa deste protocolo');
   ensure(item.manufacturer.trim().toLowerCase()===input.manufacturer.trim().toLowerCase(),'Todos os itens devem pertencer à fábrica selecionada');
   const f=facts.get(line.caseId)!;const already=sum(f.factoryLines.filter(l=>!l.voidedAt&&l.itemId===item.id),l=>l.quantity);
   ensure(line.quantity<=item.quantity-already&&line.quantity<=originalAvailable(item,f),'Quantidade já enviada ou fisicamente indisponível');
   const owner=(await client.query(`SELECT r.protocol_number,c.customer_code,c.display_name FROM return_cases r JOIN customers c ON c.id=r.customer_id WHERE r.id=$1`,[line.caseId])).rows[0];
   await insert(client,'return_factory_lines',{batch_id:batchId,case_id:line.caseId,item_id:item.id,quantity:line.quantity,protocol_snapshot:'TR-'+String(owner.protocol_number).padStart(6,'0'),customer_code_snapshot:owner.customer_code??'',customer_name_snapshot:owner.display_name,model_snapshot:[item.model,item.sku,item.frame,item.color].filter(Boolean).join(' · '),manufacturer_snapshot:item.manufacturer});
  }
  for(const caseId of [...versions.keys()].sort())await record(client,caseId,'factory_dispatched',{batchId,manufacturer:input.manufacturer,reference:input.reference,lines:input.lines.filter(l=>l.caseId===caseId)},actor);
  return batchId;
 });return getFactoryBatch(id);
}
export async function getFactoryBatch(id:string):Promise<ReturnFactoryBatch>{
 const row=(await pool.query('SELECT * FROM return_factory_batches WHERE id=$1',[id])).rows[0];ensure(row,'Envio não encontrado',404);
 const lines=(await pool.query(`SELECT l.id,l.item_id AS "itemId",l.case_id AS "caseId",r.version,l.quantity,l.model_snapshot AS model,l.manufacturer_snapshot AS manufacturer,
  l.protocol_snapshot AS protocol,l.customer_code_snapshot AS "customerCode",l.customer_name_snapshot AS "customerName",
  0 AS "availableQuantity",COALESCE((SELECT sum(quantity) FROM return_factory_results WHERE line_id=l.id AND voided_at IS NULL),0)::int AS "decidedQuantity"
  FROM return_factory_lines l JOIN return_cases r ON r.id=l.case_id WHERE l.batch_id=$1 ORDER BY r.protocol_number,l.id`,[id])).rows;
 return {id:row.id,code:'EF-'+String(row.number).padStart(6,'0'),manufacturer:row.manufacturer,sentAt:row.sent_at.toISOString(),dueAt:row.due_at.toISOString(),reference:row.reference,carrier:row.carrier,fromLocation:row.from_location,authorName:row.author_name,voidedAt:row.voided_at?.toISOString()??null,lines};
}
export async function listFactoryBatches(search='',page=1){
 const where=`WHERE b.manufacturer ILIKE $1 OR b.reference ILIKE $1 OR ('EF-'||LPAD(b.number::text,GREATEST(6,length(b.number::text)),'0')) ILIKE $1 OR EXISTS(SELECT 1 FROM return_factory_lines l JOIN return_cases r ON r.id=l.case_id JOIN customers c ON c.id=r.customer_id WHERE l.batch_id=b.id AND (c.customer_code ILIKE $1 OR c.display_name ILIKE $1 OR ('TR-'||LPAD(r.protocol_number::text,GREATEST(6,length(r.protocol_number::text)),'0')) ILIKE $1))`;
 const term='%'+search+'%';const count=(await pool.query(`SELECT count(*)::int AS total FROM return_factory_batches b ${where}`,[term])).rows[0].total;
 const {rows}=await pool.query(`SELECT b.id FROM return_factory_batches b ${where} ORDER BY b.number DESC LIMIT 25 OFFSET $2`,[term,(page-1)*25]);
 return {items:await Promise.all(rows.map(r=>getFactoryBatch(r.id))),total:count,page};
}
export async function cancelFactoryBatch(id:string,payload:unknown,actor:JwtUser){
 ensure(actor.permissions?.includes('returns.logistics'),'Acesso negado',403);const input=batchCancelSchema.parse(payload);
 await command('factory_cancel',{...input,batchId:id},actor,async client=>{
  const caseIds=(await client.query('SELECT DISTINCT case_id FROM return_factory_lines WHERE batch_id=$1 ORDER BY case_id',[id])).rows.map(r=>r.case_id as string);
  ensure(caseIds.length&&caseIds.length===input.cases.length&&new Set(input.cases.map(c=>c.id)).size===caseIds.length,'Informe todos os protocolos do envio');
  for(const caseId of caseIds){const version=input.cases.find(c=>c.id===caseId)?.version;ensure(version,'Protocolo não pertence ao envio');const parent=await lockCase(client,caseId,version);ensure(parent.stage==='triage_completed','Reabra o protocolo antes de corrigir o envio');}
  const batch=(await client.query('SELECT id,voided_at FROM return_factory_batches WHERE id=$1 FOR UPDATE',[id])).rows[0];ensure(batch&&!batch.voided_at,'Envio inexistente ou já cancelado');
  const used=await client.query(`SELECT 1 FROM return_factory_results r JOIN return_factory_lines l ON l.id=r.line_id WHERE l.batch_id=$1 AND r.voided_at IS NULL
   UNION ALL SELECT 1 FROM return_physical_receipts r JOIN return_factory_lines l ON l.id=r.line_id WHERE l.batch_id=$1 AND r.voided_at IS NULL`,[id]);ensure(!used.rowCount,'Corrija os pareceres e retornos vinculados antes de cancelar o envio');
  await client.query('UPDATE return_factory_batches SET voided_at=NOW() WHERE id=$1',[id]);
  for(const caseId of caseIds)await record(client,caseId,'factory_cancelled',{batchId:id,reason:input.reason},actor);return id;
 });return getFactoryBatch(id);
}
