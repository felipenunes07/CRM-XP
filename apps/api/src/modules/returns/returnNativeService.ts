import {z} from 'zod';
import type {PoolClient} from 'pg';
import {pool} from '../../db/client.js';
import {HttpError} from '../../lib/httpError.js';
import type {JwtUser} from '../platform/authService.js';
import {command,lockCase,record} from './returnTransactions.js';
import {loadExecution,replacementAvailable} from './returnExecutionData.js';
import {assignReturnInspection,completeReturnInspection} from './returnInspectionService.js';
import {canonicalReturnSku} from './returnSku.js';
import {isReturnCreditPaymentType} from './returnFinancialProjection.js';
import {returnCreditPayments,reconcileReturnCredit,releaseReturnCreditReconciliation} from './returnCreditReconciliation.js';
import {cancellationSaleSources} from './returnSaleSources.js';
import {isAnalysisSeal,isReconditionedSeal} from '@olist-crm/shared';
const ensure:(condition:unknown,message:string)=>asserts condition=(condition,message)=>{if(!condition)throw new HttpError(409,message);};
const id=z.string().uuid(),q=z.number().int().min(1).max(100000),cents=z.number().int().min(1).max(1e12),ref=z.string().trim().min(1).max(250),reason=z.string().trim().min(5).max(4000),base={requestId:id,version:q};
export const nativeSchemas={
 inspection_assign:z.object({...base,dispositionId:id,assigneeId:id,dueAt:z.string().datetime({offset:true}),notes:reason}).strict(),
 inspection_complete:z.object({...base,jobId:id,jobVersion:q,recommendation:z.enum(['reconditioning','outlet','stock','china','disposal']),seal:z.string().trim().max(250),testNotes:reason}).strict(),
 wallet_post:z.object({...base,creditId:id,exclusiveConfirmed:z.literal(true),reason}).strict(),
 wallet_apply:z.object({...base,creditId:id,amountCents:cents,reference:ref,reason}).strict(),
 wallet_undo:z.object({...base,entryId:id,reference:ref,reason}).strict(),
 wallet_transfer:z.object({...base,creditId:id,paymentReference:ref,reason}).strict(),
 wallet_reconcile:z.object({...base,creditId:id,paymentReference:ref,reason}).strict(),
 wallet_release:z.object({...base,creditId:id,reason}).strict(),
 cancellation:z.object({...base,itemId:id,resultId:id.nullable(),quantity:q,saleReference:ref,saleLine:ref,originalQuantity:q,unitCents:cents,inspection:reason,approvalReference:ref,saleSourceKey:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict(),
 stock_receive:z.object({...base,dispositionId:id,sku:ref,grade:z.enum(['new','grade_1','grade_2']),seal:z.string().trim().max(250),inspection:reason,location:ref,reference:ref}).strict(),
 stock_issue:z.object({...base,lotId:id,itemId:id,quantity:q,reference:ref,reason,location:ref,receivedBy:ref}).strict(),
 stock_adjust:z.object({...base,lotId:id,quantity:q,reference:ref,reason}).strict(),
 stock_return:z.object({...base,movementId:id,reference:ref,reason}).strict(),
 stock_transfer:z.object({...base,lotId:id,location:ref,custodian:ref,reference:ref,reason}).strict(),
 repair_assign:z.object({...base,dispositionId:id,assigneeId:id,dueAt:z.string().datetime({offset:true}),notes:reason}).strict(),
 repair_complete:z.object({...base,jobId:id,jobVersion:q,grade:z.enum(['new','grade_1','grade_2']),seal:z.string().trim().max(250),testNotes:reason}).strict(),
};
export type NativeOperation=keyof typeof nativeSchemas;
async function grant(client:PoolClient,creditId:string,caseId:string){
 const g=(await client.query("SELECT * FROM return_wallet_entries WHERE credit_id=$1 AND case_id=$2 AND kind='grant' FOR UPDATE",[creditId,caseId])).rows[0];ensure(g,'Crédito não lançado na carteira do CRM');return g;
}
async function remaining(client:PoolClient,creditId:string){return Number((await client.query('SELECT COALESCE(sum(amount_cents),0) AS balance FROM return_wallet_entries WHERE credit_id=$1',[creditId])).rows[0].balance);}
async function legacyMatches(client:PoolClient,customerId:string,reference:string){
 return (await client.query(`SELECT p.snapshot_id,p.payment_key,p.amount,p.payment_number,p.payment_type FROM customer_credit_payment_entries p JOIN customer_credit_snapshots s ON s.id=p.snapshot_id AND s.is_active WHERE p.customer_id=$1 AND lower(trim(p.payment_number))=lower(trim($2))`,[customerId,reference])).rows;
}
async function walletEntry(client:PoolClient,g:Record<string,any>,kind:string,amount:number,reference:string,why:string,actor:JwtUser,parent:string|null=null){
 return (await client.query(`INSERT INTO return_wallet_entries(case_id,credit_id,customer_id,factory_code,party,currency,kind,amount_cents,parent_id,reference,reason,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[g.case_id,g.credit_id,g.customer_id,g.factory_code,g.party,g.currency,kind,amount,parent,reference,why,actor.id])).rows[0].id;
}
export async function reverseNativeCredit(client:PoolClient,creditId:string,caseId:string,actor:JwtUser,why:string){
 const g=(await client.query("SELECT * FROM return_wallet_entries WHERE credit_id=$1 AND case_id=$2 AND kind='grant' FOR UPDATE",[creditId,caseId])).rows[0];if(!g)return false;
 ensure(await remaining(client,creditId)===Number(g.amount_cents),'Desfaça os usos do crédito antes do estorno; saldo transferido ao legado exige conciliação financeira');
 ensure(g.party!=='customer'||g.currency!=='BRL'||(!(await returnCreditPayments(client,g.customer_id,caseId,g.reference)).length&&!(await client.query('SELECT 1 FROM return_credit_reconciliations WHERE credit_id=$1 AND active',[creditId])).rowCount),'O crédito apareceu no financeiro importado; concilie o lançamento e o estorno antes de prosseguir');
 await walletEntry(client,g,'credit_reversal',-Number(g.amount_cents),'ESTORNO-'+creditId,why,actor);return true;
}
export async function executeNativeReturn(caseId:string,operation:NativeOperation,payload:unknown,actor:JwtUser){
 const required=['repair_complete','inspection_complete'].includes(operation)?'returns.manage':operation.startsWith('wallet_')||operation==='cancellation'?'returns.finance':'returns.logistics';if(!actor.permissions?.includes(required))throw new HttpError(403,'Acesso negado');
 const input=nativeSchemas[operation].parse(payload);
 await command('native_'+operation,{...input,caseId},actor,async client=>{
  const parent=await lockCase(client,caseId,input.version);ensure(['triage_completed','closed'].includes(parent.stage),'Conclua a triagem antes deste movimento');
  if(!operation.startsWith('wallet_'))ensure(parent.stage==='triage_completed','Reabra o protocolo antes de movimentar peças');
  const items=(await client.query('SELECT *,test_notes AS "testNotes" FROM return_items WHERE case_id=$1',[caseId])).rows;
  const facts=await loadExecution(client,caseId,items,parent.stage);
  switch(operation){
   case 'wallet_reconcile':{const i=nativeSchemas.wallet_reconcile.parse(input);await reconcileReturnCredit(client,caseId,i.creditId,i.paymentReference,i.reason,actor);break;}
   case 'wallet_release':{const i=nativeSchemas.wallet_release.parse(input);await releaseReturnCreditReconciliation(client,caseId,i.creditId,i.reason);break;}
   case 'inspection_assign':await assignReturnInspection(client,caseId,facts,nativeSchemas.inspection_assign.parse(input),actor);break;
   case 'inspection_complete':await completeReturnInspection(client,caseId,facts,nativeSchemas.inspection_complete.parse(input),actor);break;
   case 'wallet_post':{
    const i=nativeSchemas.wallet_post.parse(input),credit=(await client.query('SELECT * FROM return_credits WHERE id=$1 AND case_id=$2 FOR UPDATE',[i.creditId,caseId])).rows[0];ensure(credit?.status==='approved','Crédito precisa estar autorizado e ainda não lançado');
    const reference='CRM-TROCA-'+credit.id;
     ensure(credit.party!=='customer'||credit.currency!=='BRL'||!(await returnCreditPayments(client,parent.customer_id,caseId,reference)).length,'Crédito encontrado no financeiro importado; use a conciliação com o documento vinculado antes de lançar');
    const item=items.find(r=>r.id===credit.item_id);ensure(item,'Item não encontrado');
    await walletEntry(client,{case_id:caseId,credit_id:credit.id,customer_id:parent.customer_id,factory_code:item.factory_code,party:credit.party,currency:credit.currency},'grant',Number(credit.amount_cents),reference,i.reason,actor);
    await client.query("UPDATE return_credits SET status='posted',official_system='CRM XP · carteira de trocas',official_reference=$2,posted_at=NOW() WHERE id=$1",[credit.id,reference]);break;
   }
   case 'wallet_apply':{
    const i=nativeSchemas.wallet_apply.parse(input),g=await grant(client,i.creditId,caseId);
     ensure(g.party!=='customer'||g.currency!=='BRL'||(!(await returnCreditPayments(client,g.customer_id,caseId,g.reference)).length&&!(await client.query('SELECT 1 FROM return_credit_reconciliations WHERE credit_id=$1 AND active',[i.creditId])).rowCount),'Este crédito também aparece no financeiro importado; uso bloqueado até a conciliação');
    ensure(i.amountCents<=await remaining(client,i.creditId),'Uso excede o saldo disponível deste crédito');
    await walletEntry(client,g,'application',-i.amountCents,i.reference,i.reason,actor);break;
   }
   case 'wallet_undo':{
    const i=nativeSchemas.wallet_undo.parse(input),entry=(await client.query("SELECT * FROM return_wallet_entries WHERE id=$1 AND case_id=$2 AND kind='application'",[i.entryId,caseId])).rows[0];ensure(entry,'Uso de crédito não encontrado');const g=await grant(client,entry.credit_id,caseId);
     ensure(!(await client.query('SELECT 1 FROM return_credit_reconciliations WHERE credit_id=$1 AND active',[entry.credit_id])).rowCount,'Conciliação ativa na origem financeira; devolva a autoridade ao CRM antes de estornar o uso');
     ensure(!(await client.query("SELECT id FROM return_wallet_entries WHERE parent_id=$1 AND kind='application_reversal'",[entry.id])).rowCount,'Uso já estornado');
    await walletEntry(client,g,'application_reversal',-Number(entry.amount_cents),i.reference,i.reason,actor,entry.id);break;
   }
   case 'wallet_transfer':{
    const i=nativeSchemas.wallet_transfer.parse(input),g=await grant(client,i.creditId,caseId),balance=await remaining(client,i.creditId);ensure(balance>0,'Sem saldo a transferir');
    ensure(g.party==='customer'&&g.currency==='BRL','A transferência ao legado é exclusiva da carteira de clientes em BRL');
     ensure(!(await client.query('SELECT 1 FROM return_credit_reconciliations WHERE credit_id=$1 AND active',[i.creditId])).rowCount,'Crédito já conciliado na origem financeira');
    ensure(i.paymentReference.trim().toLowerCase()===String(g.reference).trim().toLowerCase(),'A referência no legado deve ser a referência original deste crédito no CRM');
    const matches=await legacyMatches(client,g.customer_id,i.paymentReference);ensure(matches.length===1&&Math.round(Number(matches[0].amount)*100)===balance,'O lançamento importado precisa ser único, do mesmo cliente e com valor positivo igual ao saldo transferido');
    ensure(isReturnCreditPaymentType(String(matches[0].payment_type)),'O lançamento importado precisa estar identificado como crédito de troca, defeito ou cancelamento');
    const transfer=await walletEntry(client,g,'legacy_transfer',-balance,'LEGADO-'+i.paymentReference,i.reason,actor);await client.query('UPDATE return_wallet_entries SET legacy_evidence=$2 WHERE id=$1',[transfer,JSON.stringify(matches[0])]);break;
   }
   case 'cancellation':{
    const i=nativeSchemas.cancellation.parse(input);
    let saleEvidence:unknown={mode:'manual',inspection:i.inspection,approvalReference:i.approvalReference};
    if(i.saleSourceKey){
     const sale=(await cancellationSaleSources(client,caseId,i.itemId,i.saleReference)).find(s=>s.sourceKey===i.saleSourceKey);
     ensure(sale&&sale.saleReference===i.saleReference&&sale.saleLine===i.saleLine&&sale.originalQuantity===i.originalQuantity&&sale.unitCents===i.unitCents,'A venda original mudou ou não corresponde ao cliente, SKU e preço informados; recarregue a origem');
     await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['return-sale-sku:'+parent.customer_id+':'+sale.saleReference.toLowerCase()+':'+sale.sku]);
     const totalCancelled=Number((await client.query(`SELECT COALESCE(sum(c.quantity),0) AS quantity FROM return_sale_cancellations c JOIN return_resolutions r ON r.id=c.resolution_id AND r.voided_at IS NULL JOIN return_items i ON i.id=c.item_id WHERE c.customer_id=$1 AND lower(c.sale_reference)=lower($2) AND upper(trim(i.sku))=$3 AND (c.sale_source_evidence->>'saleDate'=$4 OR c.sale_source_evidence->>'mode' IS DISTINCT FROM 'crm')`,[parent.customer_id,sale.saleReference,sale.sku,sale.saleDate])).rows[0].quantity);
     ensure(totalCancelled+i.quantity<=sale.totalQuantity,'Cancelamentos deste modelo excedem a quantidade total da venda original');saleEvidence={mode:'crm',...sale};
    }
    ensure(Number.isSafeInteger(i.quantity*i.unitCents)&&i.quantity*i.unitCents<=1e12,'O valor total do cancelamento ultrapassa o limite financeiro permitido');
    const source=facts.pools.find(p=>p.itemId===i.itemId&&p.resultId===i.resultId);ensure(source&&i.quantity<=source.remainingQuantity,'Quantidade sem decisão definitiva ou já atendida');
    ensure(items.some(r=>r.id===i.itemId&&r.sku),'Informe o SKU do item antes do cancelamento');
    const checked=(await client.query("SELECT COALESCE(sum(quantity),0)::int AS n FROM return_stock_lots WHERE case_id=$1 AND item_id=$2 AND grade='new'",[caseId,i.itemId])).rows[0].n;
    const cancelled=(await client.query('SELECT COALESCE(sum(c.quantity),0)::int AS n FROM return_sale_cancellations c JOIN return_resolutions r ON r.id=c.resolution_id AND r.voided_at IS NULL WHERE c.case_id=$1 AND c.item_id=$2',[caseId,i.itemId])).rows[0].n;
    ensure(i.quantity<=checked-cancelled,'Conclua a recuperação e a inspeção como peça nova no estoque antes do cancelamento da venda');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['return-sale:'+parent.customer_id+':'+i.saleReference.toLowerCase()+':'+i.saleLine.toLowerCase()]);
    const prior=(await client.query(`SELECT c.* FROM return_sale_cancellations c JOIN return_resolutions r ON r.id=c.resolution_id AND r.voided_at IS NULL WHERE c.customer_id=$1 AND lower(c.sale_reference)=lower($2) AND lower(c.sale_line)=lower($3)`,[parent.customer_id,i.saleReference,i.saleLine])).rows;
    ensure(prior.every(r=>r.original_quantity===i.originalQuantity&&Number(r.unit_cents)===i.unitCents),'A quantidade e o preço originais divergem da conferência anterior desta venda');
    ensure(prior.reduce((n,r)=>n+r.quantity,0)+i.quantity<=i.originalQuantity,'Cancelamentos excedem a quantidade da venda original');
    const resolution=(await client.query(`INSERT INTO return_resolutions(case_id,item_id,result_id,quantity,kind,reason,approval_reference,author_name) VALUES($1,$2,$3,$4,'sale_cancellation',$5,$6,$7) RETURNING id`,[caseId,i.itemId,i.resultId,i.quantity,'Cancelamento da venda '+i.saleReference+' / '+i.saleLine,i.approvalReference,actor.name])).rows[0];
    await client.query(`INSERT INTO return_sale_cancellations(case_id,item_id,resolution_id,customer_id,sale_reference,sale_line,original_quantity,quantity,unit_cents,inspection,approval_reference,author_id,sale_source_evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[caseId,i.itemId,resolution.id,parent.customer_id,i.saleReference,i.saleLine,i.originalQuantity,i.quantity,i.unitCents,i.inspection,i.approvalReference,actor.id,JSON.stringify(saleEvidence)]);break;
   }
   case 'stock_receive':{
    const i=nativeSchemas.stock_receive.parse(input),d=facts.dispositions.find(r=>r.id===i.dispositionId&&!r.voidedAt);ensure(d?.completedAt&&['stock','outlet','reconditioning'].includes(d.destination),'Conclua o recondicionamento ou a conferência do destino antes da entrada');
    ensure(i.grade!=='new'||(!isAnalysisSeal(i.seal)&&!isReconditionedSeal(i.seal)),'Selo de análise ou condição 1/2 não permite entrada como peça nova');
    ensure(d.destination!=='outlet'||i.grade!=='new','Outlet deve manter a condição recondicionada 1 ou 2');
    const item=items.find(r=>r.id===d.itemId);ensure(item,'Item não encontrado');
    const stockSku=await canonicalReturnSku(client,i.sku);if(item.sku)ensure(stockSku===await canonicalReturnSku(client,item.sku),'O SKU recuperado deve corresponder ao item ou à equivalência conferida; abra revisão se a identificação mudou');
    if(d.destination==='reconditioning'){const job=(await client.query('SELECT * FROM return_repair_jobs WHERE disposition_id=$1',[d.id])).rows[0];ensure(job?.completed_at&&job.grade===i.grade&&job.seal===i.seal,'A condição e o selo precisam corresponder à conclusão técnica do recondicionamento');}
    const lot=(await client.query(`INSERT INTO return_stock_lots(case_id,item_id,disposition_id,sku,model,manufacturer,grade,seal,inspection,location,quantity,author_id,factory_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,[caseId,item.id,d.id,stockSku,item.model,item.manufacturer,i.grade,i.seal,i.inspection,i.location,d.quantity,actor.id,item.factory_code])).rows[0];
    await client.query(`INSERT INTO return_stock_movements(lot_id,case_id,kind,quantity,reference,reason,author_id) VALUES($1,$2,'receipt',$3,$4,$5,$6)`,[lot.id,caseId,d.quantity,i.reference,i.inspection,actor.id]);break;
   }
   case 'stock_issue':{
    const i=nativeSchemas.stock_issue.parse(input),lot=(await client.query('SELECT * FROM return_stock_lots WHERE id=$1 FOR UPDATE',[i.lotId])).rows[0];ensure(lot,'Lote de estoque não encontrado');
    const balance=Number((await client.query('SELECT COALESCE(sum(quantity),0) AS n FROM return_stock_movements WHERE lot_id=$1',[lot.id])).rows[0].n);ensure(i.quantity<=balance,'Estoque recuperado insuficiente');
    const item=items.find(r=>r.id===i.itemId);ensure(item&&await canonicalReturnSku(client,item.sku)===lot.sku&&item.factory_code===lot.factory_code&&(lot.factory_code!=='OTHER'||item.manufacturer.trim().toUpperCase()===lot.manufacturer.trim().toUpperCase()),'SKU e fábrica precisam corresponder ao item atendido');
    const demand=facts.resolutions.filter(r=>!r.voidedAt&&r.itemId===item.id&&r.kind==='replacement').reduce((n,r)=>n+r.quantity,0),used=facts.receipts.filter(r=>!r.voidedAt&&r.itemId===item.id&&r.kind==='stock_replacement').reduce((n,r)=>n+r.quantity,0);ensure(i.quantity<=demand-used,'A saída excede as substituições prometidas');
    const receipt=(await client.query(`INSERT INTO return_physical_receipts(case_id,item_id,kind,quantity,location,received_by,reference,reason,occurred_at,author_name) VALUES($1,$2,'stock_replacement',$3,$4,$5,$6,$7,NOW(),$8) RETURNING id`,[caseId,item.id,i.quantity,i.location,i.receivedBy,i.reference,i.reason,actor.name])).rows[0];
    await client.query(`INSERT INTO return_stock_movements(lot_id,case_id,kind,quantity,receipt_id,reference,reason,author_id) VALUES($1,$2,'issue',$3,$4,$5,$6,$7)`,[lot.id,caseId,-i.quantity,receipt.id,i.reference,i.reason,actor.id]);break;
   }
   case 'stock_adjust':{
    const i=nativeSchemas.stock_adjust.parse(input);await client.query('SELECT id FROM return_stock_lots WHERE id=$1 AND case_id=$2 FOR UPDATE',[i.lotId,caseId]);const balance=Number((await client.query('SELECT COALESCE(sum(m.quantity),0) AS n FROM return_stock_movements m JOIN return_stock_lots l ON l.id=m.lot_id WHERE l.id=$1 AND l.case_id=$2',[i.lotId,caseId])).rows[0].n);ensure(i.quantity<=balance,'Ajuste excede o saldo deste lote');
    await client.query(`INSERT INTO return_stock_movements(lot_id,case_id,kind,quantity,reference,reason,author_id) VALUES($1,$2,'adjustment',$3,$4,$5,$6)`,[i.lotId,caseId,-i.quantity,i.reference,i.reason,actor.id]);break;
   }
   case 'stock_return':{
    const i=nativeSchemas.stock_return.parse(input),m=(await client.query("SELECT * FROM return_stock_movements WHERE id=$1 AND case_id=$2 AND kind='issue'",[i.movementId,caseId])).rows[0];ensure(m,'Saída de estoque não encontrada');await client.query('SELECT id FROM return_stock_lots WHERE id=$1 FOR UPDATE',[m.lot_id]);
    const receipt=facts.receipts.find(r=>r.id===m.receipt_id&&!r.voidedAt);ensure(receipt&&replacementAvailable(receipt.id,facts)===receipt.quantity,'Só é possível devolver uma separação inteira ainda sem entrega nem destino; abra revisão para peças já movimentadas');
    await client.query("INSERT INTO return_stock_movements(lot_id,case_id,kind,quantity,parent_id,reference,reason,author_id) VALUES($1,$2,'issue_return',$3,$4,$5,$6,$7)",[m.lot_id,caseId,-m.quantity,m.id,i.reference,i.reason,actor.id]);await client.query('UPDATE return_physical_receipts SET voided_at=NOW() WHERE id=$1',[receipt.id]);break;
   }
   case 'stock_transfer':{
    const i=nativeSchemas.stock_transfer.parse(input),lot=(await client.query('SELECT * FROM return_stock_lots WHERE id=$1 AND case_id=$2 FOR UPDATE',[i.lotId,caseId])).rows[0];ensure(lot,'Lote não encontrado neste protocolo');const balance=Number((await client.query('SELECT COALESCE(sum(quantity),0) AS n FROM return_stock_movements WHERE lot_id=$1',[lot.id])).rows[0].n);ensure(balance>0&&lot.location!==i.location,'Informe um local diferente para o saldo disponível');
    await client.query('INSERT INTO return_stock_transfers(lot_id,quantity,from_location,to_location,custodian,reference,reason,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[lot.id,balance,lot.location,i.location,i.custodian,i.reference,i.reason,actor.id]);await client.query('UPDATE return_stock_lots SET location=$2 WHERE id=$1',[lot.id,i.location]);break;
   }
   case 'repair_assign':{
    const i=nativeSchemas.repair_assign.parse(input),d=facts.dispositions.find(r=>r.id===i.dispositionId&&!r.voidedAt&&!r.completedAt&&r.destination==='reconditioning');ensure(d,'Selecione um recondicionamento pendente');
    const p=(await client.query(`SELECT p.role,p.is_active,COALESCE(jsonb_agg(jsonb_build_object('permissionKey',u.permission_key,'allowed',u.allowed)) FILTER(WHERE u.permission_key IS NOT NULL),'[]'::jsonb) AS overrides FROM profiles p LEFT JOIN user_permissions u ON u.user_id=p.id WHERE p.id=$1 GROUP BY p.id`,[i.assigneeId])).rows[0];const {computeEffectivePermissions}=await import('../platform/permissionService.js');ensure(p?.is_active&&computeEffectivePermissions({role:p.role,overrides:p.overrides}).includes('returns.manage'),'Selecione um técnico ativo com acesso à triagem');
    const old=(await client.query('SELECT * FROM return_repair_jobs WHERE disposition_id=$1 FOR UPDATE',[d.id])).rows[0];ensure(!old?.completed_at,'Trabalho técnico já concluído; abra revisão para correções');
    await client.query(`INSERT INTO return_repair_jobs(case_id,disposition_id,assignee_id,coordinator_id,due_at,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(disposition_id) DO UPDATE SET assignee_id=EXCLUDED.assignee_id,coordinator_id=EXCLUDED.coordinator_id,due_at=EXCLUDED.due_at,notes=EXCLUDED.notes,version=return_repair_jobs.version+1`,[caseId,d.id,i.assigneeId,actor.id,i.dueAt,i.notes]);
    await client.query("UPDATE return_cases SET assignee_id=$2,due_at=$3,next_action='Executar recondicionamento e registrar condição e testes' WHERE id=$1",[caseId,i.assigneeId,i.dueAt]);if(old)await record(client,caseId,'repair_reassigned',{before:old,after:i},actor);break;
   }
   case 'repair_complete':{
    const i=nativeSchemas.repair_complete.parse(input),job=(await client.query('SELECT * FROM return_repair_jobs WHERE id=$1 AND case_id=$2 FOR UPDATE',[i.jobId,caseId])).rows[0];ensure(job&&!job.completed_at&&job.version===i.jobVersion,'Trabalho já concluído ou atualizado; recarregue');ensure(job.assignee_id===actor.id||actor.permissions?.includes('returns.logistics'),'Somente o técnico responsável ou a coordenação pode concluir este trabalho');
    ensure(i.grade!=='new'||(!isAnalysisSeal(i.seal)&&!isReconditionedSeal(i.seal)),'Selo de análise ou condição 1/2 não comprova peça nova; confira a condição e a marcação');
    ensure(facts.dispositions.some(d=>d.id===job.disposition_id&&!d.voidedAt&&!d.completedAt),'Encaminhamento não está ativo');
    await client.query('UPDATE return_repair_jobs SET grade=$2,seal=$3,test_notes=$4,completed_at=NOW(),completed_by=$5,version=version+1 WHERE id=$1',[job.id,i.grade,i.seal,i.testNotes,actor.id]);
    await client.query("UPDATE return_cases SET assignee_id=$2,next_action='Conferir recuperação, confirmar destino e registrar entrada no estoque' WHERE id=$1",[caseId,job.coordinator_id]);break;
   }
  }
  await record(client,caseId,'native_'+operation,input,actor);return caseId;
 });
}
const camel=(row:Record<string,unknown>)=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase()),v===null?null:v instanceof Date?v.toISOString():['amount_cents','balance_cents','unit_cents'].includes(k)?Number(v):v]));
export async function getNativeReturn(caseId:string,finance:boolean){
 const [wallet,cancellations,stock,messages,movements,transfers,repairs,inspections]=await Promise.all([
  finance?pool.query(`SELECT e.*,COALESCE((SELECT sum(amount_cents) FROM return_wallet_entries a WHERE a.credit_id=e.credit_id),0) AS balance_cents,CASE WHEN e.kind='grant' AND e.party='customer' AND e.currency='BRL' THEN EXISTS(SELECT 1 FROM return_credit_reconciliations r WHERE r.credit_id=e.credit_id AND r.active) OR EXISTS(SELECT 1 FROM return_legacy_links l JOIN return_legacy_rows r ON r.id=l.source_row_id JOIN customer_credit_payment_entries p ON p.customer_id=e.customer_id AND trim(r.document)<>'' AND lower(trim(r.document))=lower(trim(p.payment_number)) JOIN customer_credit_snapshots s ON s.id=p.snapshot_id AND s.is_active WHERE l.case_id=e.case_id AND l.active) OR EXISTS(SELECT 1 FROM customer_credit_payment_entries p JOIN customer_credit_snapshots s ON s.id=p.snapshot_id AND s.is_active WHERE p.customer_id=e.customer_id AND lower(trim(p.payment_number))=lower(trim(e.reference))) WHEN e.kind='legacy_transfer' THEN NOT EXISTS(SELECT 1 FROM customer_credit_payment_entries p JOIN customer_credit_snapshots s ON s.id=p.snapshot_id AND s.is_active WHERE p.customer_id=e.customer_id AND p.payment_key=e.legacy_evidence->>'payment_key' AND p.amount=(e.legacy_evidence->>'amount')::numeric AND p.payment_type=e.legacy_evidence->>'payment_type') ELSE FALSE END AS legacy_conflict FROM return_wallet_entries e WHERE e.case_id=$1 ORDER BY e.created_at`,[caseId]):Promise.resolve({rows:[]}),
  pool.query('SELECT * FROM return_sale_cancellations WHERE case_id=$1 ORDER BY created_at',[caseId]),
  pool.query(`SELECT l.*,COALESCE((SELECT sum(quantity)::int FROM return_stock_movements m WHERE m.lot_id=l.id),0) AS available_quantity FROM return_stock_lots l WHERE l.case_id=$1 ORDER BY l.created_at`,[caseId]),
  pool.query('SELECT id,case_id,instance_id,destination,message,status,provider_id,last_error,author_name,created_at,accepted_at FROM return_message_outbox WHERE case_id=$1 ORDER BY created_at DESC',[caseId]),
  pool.query('SELECT * FROM return_stock_movements WHERE case_id=$1 ORDER BY created_at',[caseId]),
  pool.query('SELECT t.* FROM return_stock_transfers t JOIN return_stock_lots l ON l.id=t.lot_id WHERE l.case_id=$1 ORDER BY t.created_at',[caseId]),
  pool.query('SELECT j.*,p.full_name AS assignee_name FROM return_repair_jobs j JOIN profiles p ON p.id=j.assignee_id WHERE j.case_id=$1 ORDER BY j.created_at',[caseId]),
  pool.query('SELECT j.*,p.full_name AS assignee_name FROM return_inspection_jobs j JOIN profiles p ON p.id=j.assignee_id WHERE j.case_id=$1 ORDER BY j.created_at',[caseId])]);
 return {wallet:wallet.rows.map(camel),cancellations:cancellations.rows.map(camel),stock:stock.rows.map(camel),messages:messages.rows.map(camel),movements:movements.rows.map(camel),transfers:transfers.rows.map(camel),repairs:repairs.rows.map(camel),inspections:inspections.rows.map(camel)};
}
export async function listReturnStock(search=''){
 return (await pool.query(`SELECT l.*,COALESCE(sum(m.quantity),0)::int AS available_quantity FROM return_stock_lots l JOIN return_stock_movements m ON m.lot_id=l.id WHERE l.sku ILIKE $1 OR l.model ILIKE $1 GROUP BY l.id HAVING sum(m.quantity)>0 ORDER BY l.created_at LIMIT 100`,['%'+search+'%'])).rows.map(camel);
}
export async function listReturnWallet(search='',customerId:string|null=null,page=1){
 const condition=`WHERE ($2::uuid IS NULL OR c.customer_id=$2) AND (u.customer_code ILIKE $1 OR u.display_name ILIKE $1 OR f.name ILIKE $1 OR x.official_reference ILIKE $1)`;
 const from=`FROM return_credits x JOIN return_cases c ON c.id=x.case_id JOIN customers u ON u.id=c.customer_id JOIN return_items i ON i.id=x.item_id JOIN return_factory_profiles f ON f.code=i.factory_code`;
 const params=['%'+search+'%',customerId];
 const total=(await pool.query(`SELECT count(*)::int AS n ${from} ${condition}`,params)).rows[0].n;
 const items=(await pool.query(`SELECT x.id,x.case_id,x.party,x.currency,x.amount_cents,x.status,x.official_system,x.official_reference,u.customer_code,u.display_name AS customer_name,f.name AS factory_name,'TR-'||LPAD(c.protocol_number::text,GREATEST(6,length(c.protocol_number::text)),'0') AS protocol,(SELECT sum(amount_cents) FROM return_wallet_entries w WHERE w.credit_id=x.id) AS balance_cents ${from} ${condition} ORDER BY x.created_at DESC LIMIT 50 OFFSET $3`,[...params,(page-1)*50])).rows.map(camel);
 return {items,total,page};
}
