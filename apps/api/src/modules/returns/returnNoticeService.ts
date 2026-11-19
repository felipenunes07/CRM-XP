import {z} from 'zod';
import {pool} from '../../db/client.js';
import {HttpError} from '../../lib/httpError.js';
import type {JwtUser} from '../platform/authService.js';
import {command,lockCase,record,transaction} from './returnTransactions.js';
import {sendWhatsappInstanceTextMessage} from '../whatsapp/evolutionService.js';
import {sendUazapiTextMessage} from '../whatsapp/uazapiService.js';
const ensure:(condition:unknown,message:string)=>asserts condition=(condition,message)=>{if(!condition)throw new HttpError(409,message);};
export async function returnNoticeSenders(actor:JwtUser){
 return (await pool.query(`SELECT id,display_label AS name,phone_number AS phone FROM whatsapp_instances WHERE status='ACTIVE' AND (is_default OR assigned_user_id=$1 OR $2) ORDER BY is_default DESC,display_label`,[actor.id,actor.appRole==='admin'])).rows;
}
export async function prepareReturnNotice(caseId:string,payload:unknown,actor:JwtUser){
 const i=z.object({requestId:z.string().uuid(),version:z.number().int().positive(),instanceId:z.string().uuid(),destination:z.string().regex(/^\d{10,15}$/),message:z.string().trim().min(1).max(4000)}).strict().parse(payload);
 ensure((await returnNoticeSenders(actor)).some(s=>s.id===i.instanceId),'Selecione um remetente autorizado');
 return command('notice_prepare',{...i,caseId},actor,async client=>{await lockCase(client,caseId,i.version);const r=(await client.query('INSERT INTO return_message_outbox(case_id,instance_id,destination,message,author_id,author_name) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[caseId,i.instanceId,i.destination,i.message,actor.id,actor.name])).rows[0];await record(client,caseId,'notice_prepared',{outboxId:r.id,destination:i.destination},actor);return r.id;});
}
// Claim is committed before provider I/O. An ambiguous attempt is never retried automatically.
export async function sendReturnNotice(caseId:string,outboxId:string,actor:JwtUser){
 const prepared=await transaction(async client=>{
  const r=(await client.query('SELECT * FROM return_message_outbox WHERE id=$1 AND case_id=$2 FOR UPDATE',[outboxId,caseId])).rows[0];ensure(r,'Aviso não encontrado');if(r.status==='accepted')return null;ensure(r.status==='pending','Envio já tentado; confira o resultado antes de preparar outro aviso');
  ensure((await returnNoticeSenders(actor)).some(s=>s.id===r.instance_id),'Remetente não autorizado');
  const instance=(await client.query('SELECT * FROM whatsapp_instances WHERE id=$1 AND status=\'ACTIVE\'',[r.instance_id])).rows[0];ensure(instance,'Remetente inativo');
  const ready=instance.provider==='UAZAPI'?instance.uazapi_base_url&&instance.uazapi_token:instance.evolution_base_url&&instance.evolution_api_key&&instance.instance_name;ensure(ready,'Remetente sem configuração de envio');
  await client.query("UPDATE return_message_outbox SET status='sending',attempted_at=NOW() WHERE id=$1",[r.id]);return {r,instance};
 });
 if(!prepared)return;
 try{
  const {r,instance}=prepared,jid=r.destination+'@s.whatsapp.net';
  const result=instance.provider==='UAZAPI'?await sendUazapiTextMessage({baseUrl:instance.uazapi_base_url,token:instance.uazapi_token},jid,r.message):await sendWhatsappInstanceTextMessage({instanceName:instance.instance_name,evolutionBaseUrl:instance.evolution_base_url,evolutionApiKey:instance.evolution_api_key},jid,r.message);
  const data=result as Record<string,any>;const rawId=data?.key?.id??data?.messageid??data?.messageId??data?.id;const providerId=typeof rawId==='string'?rawId.trim():'';ensure(providerId&&providerId.length<=250,'O provedor não retornou identificador; confira o envio antes de tentar novamente');
  await acceptNotice(caseId,r.id,providerId,actor,'Aceito pelo provedor');
 }catch(error){await pool.query("UPDATE return_message_outbox SET status='uncertain',last_error=$2 WHERE id=$1 AND status='sending'",[outboxId,'Resultado incerto; conferir no provedor antes de repetir. '+String(error).slice(0,200)]);throw new HttpError(409,'O resultado do envio precisa de conferência. Não foi registrado contato confirmado nem feita nova tentativa automática.');}
}
async function acceptNotice(caseId:string,outboxId:string,providerId:string,actor:JwtUser,reason:string){
 await transaction(async client=>{
  // Same case lock order as all operational commands.
  await client.query('SELECT id FROM return_cases WHERE id=$1 FOR UPDATE',[caseId]);
  const r=(await client.query('SELECT * FROM return_message_outbox WHERE id=$1 AND case_id=$2 FOR UPDATE',[outboxId,caseId])).rows[0];ensure(r&&['sending','uncertain'].includes(r.status),'Aviso não está aguardando conferência');
  const n=(await client.query(`INSERT INTO return_notices(case_id,channel,recipient,summary,reference,occurred_at,author_name) VALUES($1,'whatsapp',$2,$3,$4,NOW(),$5) RETURNING id`,[caseId,r.destination,r.message,providerId,actor.name])).rows[0];
  await client.query("UPDATE return_message_outbox SET status='accepted',provider_id=$2,accepted_at=NOW(),notice_id=$3,last_error='' WHERE id=$1",[r.id,providerId,n.id]);
  await record(client,caseId,'notice_provider_accepted',{outboxId:r.id,providerId,reason},actor);
 });
}
export async function resolveReturnNotice(caseId:string,outboxId:string,payload:unknown,actor:JwtUser){
 const i=z.object({outcome:z.enum(['accepted','cancelled']),providerId:z.string().trim().max(250),reason:z.string().trim().min(5).max(4000)}).strict().parse(payload);
 await pool.query("UPDATE return_message_outbox SET status='uncertain',last_error='Tentativa interrompida; conferir no provedor' WHERE id=$1 AND status='sending' AND attempted_at<NOW()-INTERVAL '2 minutes'",[outboxId]);
 if(i.outcome==='accepted'){ensure(i.providerId,'Informe o identificador real conferido no provedor');await acceptNotice(caseId,outboxId,i.providerId,actor,i.reason);}
 else await transaction(async client=>{await client.query('SELECT id FROM return_cases WHERE id=$1 FOR UPDATE',[caseId]);const r=await client.query("UPDATE return_message_outbox SET status='cancelled',last_error=$3 WHERE id=$1 AND case_id=$2 AND status IN ('pending','uncertain') RETURNING id",[outboxId,caseId,i.reason]);ensure(r.rowCount,'Aviso não pode ser cancelado neste estado');await record(client,caseId,'notice_cancelled',{outboxId,reason:i.reason},actor);});
}
