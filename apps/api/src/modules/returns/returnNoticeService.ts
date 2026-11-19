import {z} from 'zod';
import {pool} from '../../db/client.js';
import {HttpError} from '../../lib/httpError.js';
import type {JwtUser} from '../platform/authService.js';
import {command,lockCase,record,transaction} from './returnTransactions.js';
import {sendWhatsappInstanceTextMessage} from '../whatsapp/evolutionService.js';
import {sendUazapiTextMessage} from '../whatsapp/uazapiService.js';
import {computeEffectivePermissions} from '../platform/permissionService.js';
import type {PoolClient} from 'pg';
const ensure:(condition:unknown,message:string)=>asserts condition=(condition,message)=>{if(!condition)throw new HttpError(409,message);};
export async function returnNoticeSenders(actor:JwtUser){
 return (await pool.query(`SELECT id,display_label AS name,phone_number AS phone FROM whatsapp_instances w WHERE status='ACTIVE' AND (is_default OR assigned_user_id=$1 OR $2 OR EXISTS(SELECT 1 FROM return_notice_sender_access a WHERE a.instance_id=w.id AND a.user_id=$1)) ORDER BY is_default DESC,display_label`,[actor.id,actor.appRole==='admin'])).rows;
}
export async function returnNoticeAccessConfiguration(client:PoolClient|typeof pool=pool){
 const [instances,people]=await Promise.all([
  client.query(`SELECT w.id,w.display_label AS name,w.status,w.provider,w.is_default AS "isDefault",w.assigned_user_name AS "assignedUserName",w.last_health_status AS health,
   (CASE WHEN w.provider='UAZAPI' THEN COALESCE(w.uazapi_base_url,'')<>'' AND COALESCE(w.uazapi_token,'')<>'' ELSE COALESCE(w.evolution_base_url,'')<>'' AND COALESCE(w.evolution_api_key,'')<>'' AND COALESCE(w.instance_name,'')<>'' END) AS configured,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',p.id,'name',p.full_name) ORDER BY p.full_name) FROM return_notice_sender_access a JOIN profiles p ON p.id=a.user_id WHERE a.instance_id=w.id),'[]'::jsonb) AS grants FROM whatsapp_instances w ORDER BY w.display_label`),
  client.query(`SELECT p.id,p.full_name AS name,p.role,COALESCE(jsonb_agg(jsonb_build_object('permissionKey',u.permission_key,'allowed',u.allowed)) FILTER(WHERE u.permission_key IS NOT NULL),'[]'::jsonb) AS overrides FROM profiles p LEFT JOIN user_permissions u ON u.user_id=p.id WHERE p.is_active GROUP BY p.id ORDER BY p.full_name`)]);
 return {instances:instances.rows,people:people.rows.filter(p=>{const permissions=computeEffectivePermissions({role:p.role,overrides:p.overrides});return permissions.includes('returns.view')&&permissions.includes('returns.communicate');}).map(p=>({id:p.id,name:p.name}))};
}
export async function configureReturnNoticeAccess(payload:unknown,actor:JwtUser){
 if(!actor.permissions?.includes('returns.configure'))throw new HttpError(403,'Acesso negado');
 const i=z.object({requestId:z.string().uuid(),instanceId:z.string().uuid(),userId:z.string().uuid(),allowed:z.boolean(),previousAllowed:z.boolean(),reason:z.string().trim().min(5).max(4000)}).strict().parse(payload);
 await command('notice_sender_access',i,actor,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['return-notice-access:'+i.instanceId+':'+i.userId]);
  const current=Boolean((await client.query('SELECT 1 FROM return_notice_sender_access WHERE instance_id=$1 AND user_id=$2',[i.instanceId,i.userId])).rowCount);ensure(current===i.previousAllowed,'A vinculação mudou; recarregue antes de salvar');
  if(i.allowed){const configuration=await returnNoticeAccessConfiguration(client);const instance=configuration.instances.find(p=>p.id===i.instanceId);ensure(instance?.status==='ACTIVE'&&instance.configured,'Selecione um WhatsApp ativo e configurado');ensure(configuration.people.some(p=>p.id===i.userId),'A pessoa precisa estar ativa e ter permissão de avisos de trocas');
   await client.query('INSERT INTO return_notice_sender_access(instance_id,user_id,granted_by,reason) VALUES($1,$2,$3,$4) ON CONFLICT(instance_id,user_id) DO UPDATE SET granted_by=EXCLUDED.granted_by,reason=EXCLUDED.reason,created_at=NOW()',[i.instanceId,i.userId,actor.id,i.reason]);
  }else await client.query('DELETE FROM return_notice_sender_access WHERE instance_id=$1 AND user_id=$2',[i.instanceId,i.userId]);
  await client.query("INSERT INTO return_settings_events(resource,author_id,author_name,data) VALUES('notice_sender_access',$1,$2,$3)",[actor.id,actor.name,JSON.stringify(i)]);return i.userId;
 });return returnNoticeAccessConfiguration();
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
