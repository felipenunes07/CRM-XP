import { z } from 'zod';
import type { Pool,PoolClient } from 'pg';
import { findFactoryProfile,isAnalysisSeal,normalizeFactoryToken,type ReturnFactoryProfile,type ReturnItemInput } from '@olist-crm/shared';
import { pool } from '../../db/client.js';
import { HttpError } from '../../lib/httpError.js';
import type { JwtUser } from '../platform/authService.js';
import {transaction} from './returnTransactions.js';
export async function factoryProfiles(client:Pool|PoolClient=pool):Promise<ReturnFactoryProfile[]>{
 return (await client.query(`SELECT code,name,aliases,workflow,default_assignee_id AS "defaultAssigneeId",instructions,is_active AS "isActive",version FROM return_factory_profiles ORDER BY CASE code WHEN 'VV' THEN 0 WHEN 'DE' THEN 1 WHEN 'STC' THEN 2 ELSE 3 END,name`)).rows;
}
const profileSchema=z.object({version:z.number().int().min(0),code:z.string().regex(/^[A-Z0-9_]{2,30}$/),name:z.string().trim().min(1).max(100),aliases:z.array(z.string().trim().min(1).max(100)).max(30),workflow:z.enum(['vv_batch','external_individual','internal']),defaultAssigneeId:z.string().uuid().nullable(),instructions:z.string().trim().max(4000),isActive:z.boolean()}).strict();
export async function saveFactoryProfile(payload:unknown,actor:JwtUser){
 if(!actor.permissions?.includes('returns.configure'))throw new HttpError(403,'Acesso negado');const i=profileSchema.parse(payload);
 await transaction(async client=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('returns-factory-configuration',0))");
  const profiles=await factoryProfiles(client),before=profiles.find(p=>p.code===i.code);
  if((before?.version??0)!==i.version)throw new HttpError(409,'Configuração alterada por outra pessoa. Recarregue.');
  if(['VV','DE','STC','TCOMG','UNKNOWN'].includes(i.code)&&before&&i.workflow!==before.workflow)throw new HttpError(400,'O fluxo específico desta fábrica não pode ser removido; configure responsável e instruções');
  const tokens=[i.code,i.name,...i.aliases].map(normalizeFactoryToken).filter(Boolean);
  if(profiles.some(p=>p.code!==i.code&&[p.code,p.name,...p.aliases].some(a=>tokens.includes(normalizeFactoryToken(a)))))throw new HttpError(400,'Nome ou apelido já identifica outra fábrica');
  if(i.defaultAssigneeId){const p=(await client.query(`SELECT p.role,p.is_active,COALESCE(jsonb_agg(jsonb_build_object('permissionKey',u.permission_key,'allowed',u.allowed)) FILTER(WHERE u.permission_key IS NOT NULL),'[]'::jsonb) AS overrides FROM profiles p LEFT JOIN user_permissions u ON u.user_id=p.id WHERE p.id=$1 GROUP BY p.id`,[i.defaultAssigneeId])).rows[0];
   const {computeEffectivePermissions}=await import('../platform/permissionService.js');
   const required=i.workflow==='internal'?'returns.manage':'returns.logistics';if(!p?.is_active||!computeEffectivePermissions({role:p.role,overrides:p.overrides}).includes(required))throw new HttpError(400,'Selecione um responsável ativo com acesso à etapa');
  }
  await client.query(`INSERT INTO return_factory_profiles(code,name,aliases,workflow,default_assignee_id,instructions,is_active) VALUES($1,$2,$3::jsonb,$4,$5,$6,$7) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,aliases=EXCLUDED.aliases,default_assignee_id=EXCLUDED.default_assignee_id,instructions=EXCLUDED.instructions,is_active=EXCLUDED.is_active,workflow=EXCLUDED.workflow,version=return_factory_profiles.version+1,updated_at=NOW()`,[i.code,i.name,JSON.stringify(i.aliases),i.workflow,i.defaultAssigneeId,i.instructions,i.isActive]);
  await client.query('INSERT INTO return_settings_events(resource,author_id,author_name,data) VALUES($1,$2,$3,$4::jsonb)',['factory:'+i.code,actor.id,actor.name,JSON.stringify({before,after:i})]);
 });return factoryProfiles();
}
export async function routeReturnItem(client:PoolClient,input:ReturnItemInput,actor:JwtUser){
 const profiles=await factoryProfiles(client);const profile=findFactoryProfile(profiles,input.manufacturer,input.factoryCode);
 if(!profile||!profile.isActive)throw new HttpError(400,'Selecione uma fábrica ativa');
 if(input.factoryCode&&profile.code!==input.factoryCode)throw new HttpError(400,'O nome informado pertence a outra fábrica. Confira o cadastro.');
 const seal=input.seal?.trim()??'';const routed=isAnalysisSeal(seal)||profile.workflow!=='internal';
 const override=input.routingOverride?.trim()??'';
 if(override&&!actor.permissions?.includes('returns.logistics'))throw new HttpError(403,'Somente logística pode registrar uma exceção de encaminhamento');
 const outcome=routed&&!override&&!['pending','review'].includes(input.outcome)?'external_analysis':input.outcome;
 const factoryCode=profile.code==='OTHER'&&isAnalysisSeal(seal)&&!input.manufacturer.trim()?'UNKNOWN':profile.code;
 return {...input,outcome,manufacturer:input.manufacturer.trim()|| (factoryCode==='UNKNOWN'?'Fábrica a identificar':profile.code==='OTHER'?'':profile.name),factoryCode,factoryWorkflow:factoryCode==='UNKNOWN'?'external_individual':profile.workflow,seal,routingOverride:override};
}
