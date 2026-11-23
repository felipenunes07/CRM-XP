import type {PoolClient} from 'pg';
import type {ReturnExecution} from '@olist-crm/shared';
import type {JwtUser} from '../platform/authService.js';
import {computeEffectivePermissions} from '../platform/permissionService.js';
import {HttpError} from '../../lib/httpError.js';
const ensure:(v:unknown,message:string)=>asserts v=(v,message)=>{if(!v)throw new HttpError(409,message);};
export async function assignReturnInspection(client:PoolClient,caseId:string,facts:ReturnExecution,i:{dispositionId:string;assigneeId:string;dueAt:string;notes:string},actor:JwtUser){
 const d=facts.dispositions.find(d=>d.id===i.dispositionId&&!d.voidedAt&&!d.completedAt&&d.destination==='technical_review');
 ensure(d,'Selecione uma separação e reteste interno pendente');
 const p=(await client.query(`SELECT p.role,p.is_active,COALESCE(jsonb_agg(jsonb_build_object('permissionKey',u.permission_key,'allowed',u.allowed)) FILTER(WHERE u.permission_key IS NOT NULL),'[]'::jsonb) AS overrides FROM profiles p LEFT JOIN user_permissions u ON u.user_id=p.id WHERE p.id=$1 GROUP BY p.id`,[i.assigneeId])).rows[0];
 ensure(p?.is_active&&computeEffectivePermissions({role:p.role,overrides:p.overrides}).includes('returns.manage'),'Selecione um técnico ativo com acesso às trocas');
 const old=(await client.query('SELECT * FROM return_inspection_jobs WHERE disposition_id=$1 FOR UPDATE',[d.id])).rows[0];
 ensure(!old?.completed_at,'Reteste já concluído; abra revisão para correções');
 await client.query(`INSERT INTO return_inspection_jobs(case_id,disposition_id,assignee_id,coordinator_id,due_at,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(disposition_id) DO UPDATE SET assignee_id=EXCLUDED.assignee_id,coordinator_id=EXCLUDED.coordinator_id,due_at=EXCLUDED.due_at,notes=EXCLUDED.notes,version=return_inspection_jobs.version+1`,[caseId,d.id,i.assigneeId,actor.id,i.dueAt,i.notes]);
 await client.query("UPDATE return_cases SET assignee_id=$2,due_at=$3,next_action='Separar por modelo, retestar e indicar destino das peças' WHERE id=$1",[caseId,i.assigneeId,i.dueAt]);
}
export async function completeReturnInspection(client:PoolClient,caseId:string,facts:ReturnExecution,i:{jobId:string;jobVersion:number;recommendation:string;seal:string;testNotes:string},actor:JwtUser){
 const job=(await client.query('SELECT * FROM return_inspection_jobs WHERE id=$1 AND case_id=$2 FOR UPDATE',[i.jobId,caseId])).rows[0];
 ensure(job&&!job.completed_at&&job.version===i.jobVersion,'Reteste concluído ou atualizado; recarregue');
 ensure(job.assignee_id===actor.id||actor.permissions?.includes('returns.logistics'),'Somente o técnico responsável ou a coordenação pode concluir o reteste');
 ensure(facts.dispositions.some(d=>d.id===job.disposition_id&&!d.voidedAt&&!d.completedAt&&d.destination==='technical_review'),'Encaminhamento de reteste não está ativo');
 await client.query('UPDATE return_inspection_jobs SET recommendation=$2,seal=$3,test_notes=$4,completed_at=NOW(),completed_by=$5,version=version+1 WHERE id=$1',[job.id,i.recommendation,i.seal,i.testNotes,actor.id]);
 // The recommendation changes the proposed destination, never the physical completion or stock.
 const item=(await client.query('SELECT i.outcome FROM return_items i JOIN return_dispositions d ON d.item_id=i.id WHERE d.id=$1',[job.disposition_id])).rows[0];
 const destination=item?.outcome==='resale'&&['stock','outlet'].includes(i.recommendation)?'reconditioning':i.recommendation;
 await client.query('UPDATE return_dispositions SET destination=$2,test_notes=$3 WHERE id=$1',[job.disposition_id,destination,i.testNotes]);
 await client.query("UPDATE return_cases SET assignee_id=$2,next_action='Conferir parecer do reteste e registrar o destino físico; recuperação exige novo trabalho técnico' WHERE id=$1",[caseId,job.coordinator_id]);
}
