import type {Pool,PoolClient} from 'pg';
import type {ReturnCase,ReturnExecution,ReturnItem,ReturnPerson,ReturnTask,ReturnWork} from '@olist-crm/shared';
import {originalAvailable,replacementAvailable} from './returnExecutionData.js';

interface WorkJob {id:string;caseId:string;dispositionId:string;kind:'inspection'|'repair';assignee:ReturnPerson|null;coordinator:ReturnPerson|null;dueAt:string;completedAt:string|null}
interface WorkCase extends ReturnCase {items:ReturnItem[];execution:ReturnExecution}
export function deriveReturnWork(d:WorkCase,coordinator:ReturnPerson|null,jobs:WorkJob[]):ReturnWork{
 const tasks:ReturnTask[]=[],f=d.execution,p=f.progress;
 const live=<T extends {voidedAt:string|null}>(rows:T[])=>rows.filter(r=>!r.voidedAt);
 const add=(id:string,title:string,description:string,target:ReturnTask['target'],owner=coordinator,team:ReturnTask['team']='returns.logistics',state:ReturnTask['state']='action',dueAt:string|null=null)=>tasks.push({id,title,description,target,owner,team,state,dueAt});
 let phase=d.stage==='closed'?'Concluído':d.stage==='received'?'Aguardando início dos testes':d.stage==='triage'?'Em testes':'Em resolução';
 if(d.stage==='closed')return{coordinator,phase,tasks};
 if(['received','triage'].includes(d.stage)){
  if(!d.assignee||!d.dueAt)add('assign','Definir técnico e prazo','Depois, o técnico começa os testes.',{section:'receber'},coordinator,'returns.manage','unassigned');
  else add('triage',d.stage==='received'?'Iniciar os testes':'Lançar e concluir os testes',`${d.itemQuantity} de ${d.receivedQuantity} peças lançadas. Depois dos testes, a troca volta para ${coordinator?.name??'a coordenação'}.`,{section:'testar'},d.assignee,'returns.manage','action',d.dueAt);
  return{coordinator,phase,tasks};
 }
 const lines=live(f.factoryLines),results=live(f.results),receipts=live(f.receipts),resolutions=live(f.resolutions),deliveries=live(f.deliveries),dispositions=live(f.dispositions);
 for(const item of d.items.filter(i=>i.outcome==='external_analysis')){
  const missing=item.quantity-lines.filter(l=>l.itemId===item.id).reduce((n,l)=>n+l.quantity,0);
  if(missing>0)add('send-'+item.id,'Preparar envio à fábrica',`${missing} × ${item.model} · ${item.manufacturer}`,{section:'resolver',area:'factory',entityId:item.id});
 }
 for(const batchId of new Set(lines.map(l=>l.batchId))){
  const batchLines=lines.filter(l=>l.batchId===batchId),line=batchLines[0]!;
  const owner=line.responsibleId&&line.responsibleName?{id:line.responsibleId,name:line.responsibleName}:null;
  const pending=batchLines.reduce((n,l)=>n+l.quantity-results.filter(r=>r.lineId===l.id).reduce((n,r)=>n+r.quantity,0),0);
  if(line.state==='assembling')add('batch-'+batchId,'Conferir e enviar o lote',`${line.batchCode} · ${line.manufacturer}`,{section:'resolver',area:'factory',entityId:batchId},owner,'returns.logistics',owner?'action':'unassigned',line.dueAt);
  else if(pending>0)add('batch-'+batchId,'Aguardando parecer da fábrica',`${pending} peça(s) · ${line.batchCode} · ${line.manufacturer}. Registre o parecer quando ele chegar.`,{section:'resolver',area:'factory',entityId:batchId},owner,'returns.logistics','external_wait',line.dueAt);
  const originalsPending=batchLines.some(l=>l.state==='sent'&&l.quantity>receipts.filter(r=>r.lineId===l.id&&['original_returned','factory_retained'].includes(r.kind)).reduce((n,r)=>n+r.quantity,0));
  if(originalsPending)add('return-'+batchId,'Acompanhar retorno das peças originais',`${line.batchCode}: confirme chegada ou retenção autorizada quando houver comprovação.`,{section:'resolver',area:'factory',entityId:batchId},owner,'returns.logistics','external_wait',line.dueAt);
 }
 for(const result of results.filter(r=>r.compensation==='replacement')){
  if(result.quantity>receipts.filter(r=>r.resultId===result.id&&r.kind==='supplier_replacement').reduce((n,r)=>n+r.quantity,0))add('replacement-'+result.id,'Aguardando substitutas da fábrica',d.items.find(i=>i.id===result.itemId)?.model??'Confira o retorno autorizado.',{section:'resolver',area:'factory',entityId:result.id},coordinator,'returns.logistics','external_wait');
 }
 if(f.pools.some(pool=>pool.remainingQuantity>0))add('solution','Definir o atendimento ao cliente','Escolha a solução para cada quantidade já analisada.',{section:'resolver',area:'customer'});
 for(const resolution of resolutions.filter(r=>['credit','sale_cancellation'].includes(r.kind))){
  if(!f.credits.some(c=>c.resolutionId===resolution.id&&c.party==='customer'&&c.status==='posted'))add('credit-'+resolution.id,resolution.kind==='sale_cancellation'?'Conferir recuperação e cancelamento de venda':'Calcular e lançar crédito do cliente','Financeiro confere os requisitos e o valor calculado antes de lançar.',{section:'resolver',area:'finance',entityId:resolution.id},null,'returns.finance');
 }
 for(const result of results.filter(r=>r.compensation==='credit')){
  if(!f.credits.some(c=>c.resultId===result.id&&c.party==='supplier'&&c.status==='posted'))add('supplier-credit-'+result.id,'Conferir crédito da fábrica','Registre a autorização e o lançamento comprovado do fornecedor.',{section:'resolver',area:'finance',entityId:result.id},null,'returns.finance');
 }
 for(const disposition of dispositions.filter(r=>!r.completedAt)){
  const job=jobs.find(j=>j.dispositionId===disposition.id);
  const technical=['technical_review','reconditioning'].includes(disposition.destination);
  if(technical&&!job)add('assign-'+disposition.id,disposition.destination==='reconditioning'?'Atribuir recondicionamento':'Atribuir separação e reteste','Escolha o técnico e o prazo. O trabalho ainda não foi atribuído.',{section:'resolver',area:'technical',entityId:disposition.id},coordinator,'returns.logistics','unassigned');
  else if(technical&&job&&!job.completedAt)add('job-'+job.id,job.assignee?(job.kind==='repair'?'Recondicionar e registrar os testes':'Separar, retestar e indicar destino'):'Reatribuir trabalho técnico',d.items.find(i=>i.id===disposition.itemId)?.model??'',{section:'resolver',area:'technical',entityId:job.id},job.assignee??coordinator,job.assignee?'returns.manage':'returns.logistics',job.assignee?'action':'unassigned',job.dueAt);
  else add('physical-'+disposition.id,'Conferir o destino físico das peças',`${disposition.quantity} peça(s) · ${disposition.toLocation}. O teste concluído não confirma o movimento físico.`,{section:'resolver',area:'technical',entityId:disposition.id},job?.coordinator??coordinator);
 }
 const originalsToRoute=d.items.some(item=>originalAvailable(item,f)>resolutions.filter(r=>r.itemId===item.id&&r.kind==='return_original').reduce((n,r)=>n+r.quantity-deliveries.filter(e=>e.resolutionId===r.id).reduce((n,e)=>n+e.quantity,0),0));
 const replacementsToRoute=receipts.some(r=>['supplier_replacement','stock_replacement'].includes(r.kind)&&replacementAvailable(r.id,f)>resolutions.filter(s=>s.itemId===r.itemId&&s.kind==='replacement'&&(r.kind==='stock_replacement'||s.resultId===r.resultId)).reduce((n,s)=>n+s.quantity-deliveries.filter(e=>e.resolutionId===s.id).reduce((n,e)=>n+e.quantity,0),0));
 if(originalsToRoute||replacementsToRoute)add('route','Definir o destino das peças disponíveis','Encaminhe para reteste, recuperação ou o destino autorizado. Não registre entrada de estoque sem inspeção.',{section:'resolver',area:'technical'});
 if(p.stockPending)add('stock','Registrar entrada das peças recuperadas','O destino foi confirmado; falta a entrada inspecionada no estoque.',{section:'resolver',area:'technical'});
 for(const resolution of resolutions.filter(r=>['return_original','replacement'].includes(r.kind))){
  const outstanding=resolution.quantity-deliveries.filter(e=>e.resolutionId===resolution.id).reduce((n,e)=>n+e.quantity,0);
  if(outstanding>0){
   const item=d.items.find(i=>i.id===resolution.itemId);
   const ready=resolution.kind==='return_original'?Boolean(item&&originalAvailable(item,f)>0):receipts.some(r=>r.itemId===resolution.itemId&&['supplier_replacement','stock_replacement'].includes(r.kind)&&(r.kind==='stock_replacement'||r.resultId===resolution.resultId)&&replacementAvailable(r.id,f)>0);
   add('delivery-'+resolution.id,ready?'Registrar retirada ou despacho':'Aguardando peças para entregar',`${outstanding} × ${item?.model??'peça'}`,{section:'entregar',entityId:resolution.id},coordinator,'returns.logistics',ready?'action':'blocked');
  }
 }
 for(const delivery of deliveries.filter(r=>!r.deliveredAt))add('confirm-'+delivery.id,'Acompanhar recebimento do cliente',delivery.tracking||delivery.recipient,{section:'entregar',entityId:delivery.id},coordinator,'returns.logistics','external_wait');
 if(resolutions.length&&!f.notices.length)add('contact','Registrar contato realizado com o cliente','Informe o resultado pelo canal combinado e registre o contato. Nenhuma mensagem é enviada por esta ação.',{section:'entregar'});
 if(p.reviewCount)add('reviews','Conferir revisões abertas',`${p.reviewCount} revisão(ões) pendente(s).`,{section:'concluir'});
 if(p.legacyConflict)add('legacy','Conferir vínculo com o histórico','O registro de origem mudou. Confira o vínculo antes do encerramento.',{section:'concluir'});
 if(p.canClose){phase='Pronto para encerrar';add('close','Conferir e encerrar o atendimento','Cliente, créditos e destinos foram conferidos.',{section:'concluir'});}
 else if(p.customerComplete)phase='Cliente atendido · peças em acompanhamento';
 if(!tasks.length)add('check','Conferir pendências do atendimento',p.blockers.join(' · '),{section:'concluir'});
 return{coordinator,phase,tasks};
}

// One grouped read for the whole page. Work is derived; assignments stay in their owning records.
export async function loadReturnWork(client:Pool|PoolClient,cases:WorkCase[]):Promise<Map<string,ReturnWork>>{
 const work=new Map<string,ReturnWork>();if(!cases.length)return work;
 const ids=cases.map(c=>c.id);
 const coordinators=(await client.query(`SELECT r.id,p.id AS person_id,p.full_name FROM return_cases r LEFT JOIN profiles p ON p.id=r.coordinator_id AND p.is_active WHERE r.id=ANY($1::uuid[])`,[ids])).rows;
 const rows=(await client.query(`SELECT j.id,j.case_id,j.disposition_id,j.due_at,j.completed_at,'inspection' AS kind,p.id AS assignee_id,p.full_name AS assignee_name,c.id AS coordinator_id,c.full_name AS coordinator_name FROM return_inspection_jobs j JOIN return_dispositions d ON d.id=j.disposition_id AND d.voided_at IS NULL LEFT JOIN profiles p ON p.id=j.assignee_id AND p.is_active LEFT JOIN profiles c ON c.id=j.coordinator_id AND c.is_active WHERE j.case_id=ANY($1::uuid[])
 UNION ALL SELECT j.id,j.case_id,j.disposition_id,j.due_at,j.completed_at,'repair',p.id,p.full_name,c.id,c.full_name FROM return_repair_jobs j JOIN return_dispositions d ON d.id=j.disposition_id AND d.voided_at IS NULL LEFT JOIN profiles p ON p.id=j.assignee_id AND p.is_active LEFT JOIN profiles c ON c.id=j.coordinator_id AND c.is_active WHERE j.case_id=ANY($1::uuid[])`,[ids])).rows;
 const personIds=[...new Set([...cases.map(d=>d.assignee?.id),...coordinators.map(c=>c.person_id),...rows.flatMap(r=>[r.assignee_id,r.coordinator_id]),...cases.flatMap(d=>d.execution.factoryLines.map(l=>l.responsibleId))].filter(Boolean))];
 const people=(await client.query(`SELECT p.id,p.is_active,p.role,COALESCE(jsonb_agg(jsonb_build_object('permissionKey',u.permission_key,'allowed',u.allowed)) FILTER(WHERE u.permission_key IS NOT NULL),'[]'::jsonb) AS overrides FROM profiles p LEFT JOIN user_permissions u ON u.user_id=p.id WHERE p.id=ANY($1::uuid[]) GROUP BY p.id`,[personIds])).rows;
 const {computeEffectivePermissions}=await import('../platform/permissionService.js');
 const eligible=(id:string|undefined|null,permission:string)=>{const p=people.find(p=>p.id===id);if(!p?.is_active)return false;const permissions=computeEffectivePermissions({role:p.role,overrides:p.overrides});return permissions.includes('returns.view')&&permissions.includes(permission);};
 const jobs:WorkJob[]=rows.map(r=>({id:r.id,caseId:r.case_id,dispositionId:r.disposition_id,kind:r.kind,assignee:eligible(r.assignee_id,'returns.manage')?{id:r.assignee_id,name:r.assignee_name}:null,coordinator:eligible(r.coordinator_id,'returns.logistics')?{id:r.coordinator_id,name:r.coordinator_name}:null,dueAt:new Date(r.due_at).toISOString(),completedAt:r.completed_at?new Date(r.completed_at).toISOString():null}));
 for(const d of cases){const c=coordinators.find(r=>r.id===d.id);const execution={...d.execution,factoryLines:d.execution.factoryLines.map(l=>eligible(l.responsibleId,'returns.logistics')?l:{...l,responsibleId:null,responsibleName:null})};work.set(d.id,deriveReturnWork({...d,execution,assignee:eligible(d.assignee?.id,'returns.manage')?d.assignee:null},eligible(c?.person_id,'returns.logistics')?{id:c.person_id,name:c.full_name}:null,jobs.filter(j=>j.caseId===d.id)));}
 return work;
}
