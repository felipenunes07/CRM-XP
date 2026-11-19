import {z} from 'zod';
import type {PoolClient} from 'pg';
import {pool} from '../../db/client.js';
import {HttpError} from '../../lib/httpError.js';
import {cleanupTempFile,downloadFileByPath,getDropboxFileMetadata} from '../../lib/dropboxClient.js';
import {logger} from '../../lib/logger.js';
import type {JwtUser} from '../platform/authService.js';
import {command,lockCase,record,transaction} from './returnTransactions.js';
import {readReturnLegacyFile} from './returnLegacyParser.js';
const ensure=(condition:unknown,message:string)=>{if(!condition)throw new HttpError(409,message);};
export async function transitionSettings(client:PoolClient|typeof pool=pool){
 return (await client.query(`SELECT source_path AS "sourcePath",source_enabled AS "sourceEnabled",authority,version,cutover_at AS "cutoverAt",cutover_reason AS "cutoverReason",last_checked_at AS "lastCheckedAt",last_success_at AS "lastSuccessAt",last_error AS "lastError" FROM return_transition_settings WHERE id=1`)).rows[0];
}
// A refresh never creates a protocol, approves money or modifies Dropbox.
export async function refreshReturnLegacy(){
 const client=await pool.connect();let localPath:string|undefined;
 try{
  if(!(await client.query("SELECT pg_try_advisory_lock(hashtextextended('return-legacy-sync',0)) AS acquired")).rows[0].acquired)return;
  const settings=await transitionSettings(client);if(!settings.sourceEnabled)return;
  await client.query('UPDATE return_transition_settings SET last_checked_at=NOW() WHERE id=1');
  const meta=await getDropboxFileMetadata(settings.sourcePath);
  ensure(meta.fileSizeBytes<100_000_000,'A origem ultrapassou o limite de leitura');
  if((await client.query('SELECT 1 FROM return_legacy_revisions WHERE active AND source_file_id=$1 AND source_revision=$2',[meta.fileId,meta.fileRevision])).rowCount){await client.query("UPDATE return_transition_settings SET last_success_at=NOW(),last_error='' WHERE id=1");return;}
  const file=await downloadFileByPath('rev:'+meta.fileRevision);localPath=file.localPath;
  ensure(file.fileId===meta.fileId&&file.fileRevision===meta.fileRevision,'A origem mudou durante a leitura; tente novamente');
  const rows=readReturnLegacyFile(localPath);
  await client.query('BEGIN');
  const current=await client.query('SELECT version FROM return_transition_settings WHERE id=1 FOR UPDATE');ensure(current.rows[0].version===settings.version,'A configuração mudou durante a atualização');
  let revision=(await client.query(`INSERT INTO return_legacy_revisions(source_path,source_file_id,source_revision,source_hash,source_modified_at,row_count) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_file_id,source_revision) DO NOTHING RETURNING id`,[settings.sourcePath,meta.fileId,meta.fileRevision,meta.contentHash,meta.fileUpdatedAt,rows.length])).rows[0];
  if(revision){
   for(let i=0;i<rows.length;i+=1000)await client.query(`INSERT INTO return_legacy_rows(revision_id,sheet,row_number,fingerprint,anchor,occurrence,document,customer_code,customer_name,occurred_on,sku,description,signed_quantity,amount_cents,raw_status,raw_payload) SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(sheet text,row_number int,fingerprint text,anchor text,occurrence int,document text,customer_code text,customer_name text,occurred_on text,sku text,description text,signed_quantity numeric,amount_cents bigint,raw_status text,raw_payload jsonb)`,[revision.id,JSON.stringify(rows.slice(i,i+1000))]);
  }else revision=(await client.query('SELECT id FROM return_legacy_revisions WHERE source_file_id=$1 AND source_revision=$2',[meta.fileId,meta.fileRevision])).rows[0];
  await client.query('UPDATE return_legacy_revisions SET active=FALSE WHERE active');
  await client.query('UPDATE return_legacy_revisions SET active=TRUE WHERE id=$1',[revision.id]);
  // Only the current read cache is needed; every reviewed source row and revision receipt is retained.
  await client.query(`DELETE FROM return_legacy_rows r USING return_legacy_revisions v WHERE v.id=r.revision_id AND NOT v.active AND NOT EXISTS(SELECT 1 FROM return_legacy_links l WHERE l.source_row_id=r.id) AND NOT EXISTS(SELECT 1 FROM return_legacy_exclusions e WHERE e.source_row_id=r.id)`);
  await client.query("UPDATE return_transition_settings SET last_success_at=NOW(),last_error='' WHERE id=1");await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');await client.query('UPDATE return_transition_settings SET last_error=$1 WHERE id=1',[String(error).slice(0,500)]);throw error;}
 finally{if(localPath)await cleanupTempFile(localPath);await client.query("SELECT pg_advisory_unlock(hashtextextended('return-legacy-sync',0))");client.release();}
}
const currentRows=`FROM return_legacy_rows r JOIN return_legacy_revisions v ON v.id=r.revision_id AND v.active LEFT JOIN return_legacy_links l ON l.fingerprint=r.fingerprint AND l.occurrence=r.occurrence AND l.active LEFT JOIN return_legacy_exclusions e ON e.fingerprint=r.fingerprint AND e.occurrence=r.occurrence`;
export async function listReturnLegacy(query:unknown){
 const q=z.object({search:z.string().trim().max(150).default(''),page:z.coerce.number().int().positive().max(100000).default(1),pending:z.enum(['true','false']).default('false')}).parse(query);
 const condition=`WHERE (r.customer_code ILIKE $1 OR r.customer_name ILIKE $1 OR r.document ILIKE $1 OR r.sku ILIKE $1) ${q.pending==='true'?'AND l.id IS NULL AND e.id IS NULL':''}`;
 return transaction(async client=>{
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const settings=await transitionSettings(client),revision=(await client.query(`SELECT id,source_path AS "sourcePath",source_revision AS "sourceRevision",source_modified_at AS "sourceModifiedAt",imported_at AS "importedAt",row_count AS "rowCount" FROM return_legacy_revisions WHERE active`)).rows[0]??null;
  const total=(await client.query(`SELECT count(*)::int AS total ${currentRows} ${condition}`,['%'+q.search+'%'])).rows[0].total;
  const items=(await client.query(`SELECT r.id,r.sheet,r.row_number AS "rowNumber",r.fingerprint,r.document,r.customer_code AS "customerCode",r.customer_name AS "customerName",r.occurred_on AS "occurredOn",r.sku,r.description,r.signed_quantity::float8 AS "signedQuantity",r.amount_cents::float8 AS "amountCents",r.raw_status AS "rawStatus",r.raw_payload AS "rawPayload",l.case_id AS "linkedCaseId",e.reason AS "exclusionReason",(SELECT count(*)>1 FROM return_legacy_rows d WHERE d.revision_id=r.revision_id AND d.fingerprint=r.fingerprint) AS conflict ${currentRows} ${condition} ORDER BY r.row_number LIMIT 50 OFFSET $2`,['%'+q.search+'%',(q.page-1)*50])).rows;
  const unresolved=(await client.query(`SELECT count(*)::int AS count ${currentRows} WHERE l.id IS NULL AND e.id IS NULL`)).rows[0].count;
  const conflicts=(await client.query(`SELECT l.id,l.case_id AS "caseId",l.source_revision AS "sourceRevision",r.document,r.row_number AS "rowNumber" FROM return_legacy_links l JOIN return_legacy_rows r ON r.id=l.source_row_id WHERE l.active AND NOT EXISTS(SELECT 1 FROM return_legacy_rows n JOIN return_legacy_revisions v ON v.id=n.revision_id AND v.active WHERE n.fingerprint=l.fingerprint AND n.occurrence=l.occurrence) ORDER BY l.created_at LIMIT 100`)).rows;
  return {settings,revision,items,total,page:q.page,unresolved,conflicts};
 });
}
export async function reviewReturnLegacy(payload:unknown,actor:JwtUser){
 const i=z.object({requestId:z.string().uuid(),rowId:z.string().uuid(),revision:z.string(),caseId:z.string().uuid().nullable(),version:z.number().int().positive().optional(),reason:z.string().trim().min(5).max(4000)}).strict().parse(payload);
 await command('legacy_review',i,actor,async client=>{
  await client.query('SELECT id FROM return_transition_settings WHERE id=1 FOR SHARE');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('return-legacy-review',0))");
  const r=(await client.query('SELECT r.*,v.source_revision FROM return_legacy_rows r JOIN return_legacy_revisions v ON v.id=r.revision_id AND v.active WHERE r.id=$1',[i.rowId])).rows[0];ensure(r&&r.source_revision===i.revision,'A planilha foi atualizada; recarregue a versão atual antes da conferência');
  ensure(!(await client.query('SELECT id FROM return_legacy_links WHERE fingerprint=$1 AND occurrence=$2 AND active',[r.fingerprint,r.occurrence])).rowCount,'Linha já vinculada; revise o vínculo existente');
  ensure(!(await client.query('SELECT id FROM return_legacy_exclusions WHERE fingerprint=$1 AND occurrence=$2',[r.fingerprint,r.occurrence])).rowCount,'Linha já conferida fora do escopo');
  if(i.caseId){
   ensure(i.version,'Informe a versão do protocolo');const parent=await lockCase(client,i.caseId,i.version!);
   const customer=(await client.query('SELECT customer_code FROM customers WHERE id=$1',[parent.customer_id])).rows[0];
   ensure(String(customer.customer_code).replace(/[^A-Z0-9]/gi,'').toUpperCase()===String(r.customer_code).replace(/[^A-Z0-9]/gi,'').toUpperCase(),'O cliente da linha e do protocolo precisa ser o mesmo');
   ensure((await client.query('SELECT count(*)::int AS n FROM return_legacy_rows WHERE revision_id=$1 AND fingerprint=$2',[r.revision_id,r.fingerprint])).rows[0].n===1,'Linhas idênticas são ambíguas; confirme uma origem individual antes de migrar');
   await client.query(`INSERT INTO return_legacy_links(source_row_id,fingerprint,occurrence,case_id,source_revision,review_reason,author_id,author_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[r.id,r.fingerprint,r.occurrence,i.caseId,i.revision,i.reason,actor.id,actor.name]);
   await record(client,i.caseId,'legacy_linked',{sourceRow:r.id,revision:i.revision,document:r.document,reason:i.reason},actor);
  }else await client.query('INSERT INTO return_legacy_exclusions(fingerprint,occurrence,source_row_id,reason,author_id) VALUES($1,$2,$3,$4,$5)',[r.fingerprint,r.occurrence,r.id,i.reason,actor.id]);
  return r.id;
 });
}
export async function resolveReturnLegacyLink(payload:unknown,actor:JwtUser){
 const i=z.object({requestId:z.string().uuid(),linkId:z.string().uuid(),caseVersion:z.number().int().positive(),reason:z.string().trim().min(5).max(4000)}).strict().parse(payload);
 await command('legacy_resolve',i,actor,async client=>{const l=(await client.query('SELECT * FROM return_legacy_links WHERE id=$1 FOR UPDATE',[i.linkId])).rows[0];ensure(l?.active,'Vínculo não está ativo');await lockCase(client,l.case_id,i.caseVersion);await client.query('UPDATE return_legacy_links SET active=FALSE,superseded_at=NOW(),resolution=$2 WHERE id=$1',[l.id,i.reason]);await record(client,l.case_id,'legacy_link_resolved',{linkId:l.id,reason:i.reason},actor);return l.case_id;});
}
export async function configureReturnTransition(payload:unknown,actor:JwtUser){
 const i=z.object({version:z.number().int().positive(),sourcePath:z.string().trim().startsWith('/').max(1000),sourceEnabled:z.boolean(),authority:z.enum(['parallel','crm']),reason:z.string().trim().min(5).max(4000)}).strict().parse(payload);
 await transaction(async client=>{const old=(await client.query('SELECT * FROM return_transition_settings WHERE id=1 FOR UPDATE')).rows[0];ensure(old.version===i.version,'Configuração atualizada; recarregue');
  if(i.authority==='crm'&&old.authority!=='crm'){
   ensure(!(await client.query(`SELECT 1 ${currentRows} WHERE l.id IS NULL AND e.id IS NULL LIMIT 1`)).rowCount,'Conclua a conferência das linhas antes de encerrar a migração');
   ensure(!(await client.query(`SELECT 1 FROM return_legacy_links l WHERE active AND NOT EXISTS(SELECT 1 FROM return_legacy_rows r JOIN return_legacy_revisions v ON v.id=r.revision_id AND v.active WHERE r.fingerprint=l.fingerprint AND r.occurrence=l.occurrence) LIMIT 1`)).rowCount,'Resolva os vínculos alterados na planilha');
   ensure((await client.query('SELECT 1 FROM return_legacy_revisions WHERE active')).rowCount,'Atualize a origem antes do corte');
   ensure(!old.last_error&&old.last_success_at&&Date.now()-new Date(old.last_success_at).getTime()<15*60*1000,'Atualize a origem nos últimos 15 minutos antes do corte');
   ensure(i.sourcePath===old.source_path,'Não altere a origem durante o corte');
  }
  await client.query(`UPDATE return_transition_settings SET last_success_at=CASE WHEN source_path<>$1 THEN NULL ELSE last_success_at END,last_error=CASE WHEN source_path<>$1 THEN 'Origem alterada; aguarde a primeira leitura válida' ELSE last_error END,source_path=$1,source_enabled=$2,authority=$3,cutover_at=CASE WHEN $3='crm' THEN COALESCE(cutover_at,NOW()) ELSE NULL END,cutover_reason=$4,version=version+1 WHERE id=1`,[i.sourcePath,i.sourceEnabled,i.authority,i.reason]);
  await client.query(`INSERT INTO return_settings_events(resource,author_id,author_name,data) VALUES('transition',$1,$2,$3)`,[actor.id,actor.name,JSON.stringify({before:old,after:i})]);
 });return transitionSettings();
}
export function startReturnLegacySync(){
 let running=false;const tick=async()=>{if(running)return;running=true;try{await refreshReturnLegacy();}catch(error){logger.warn('returns legacy sync failed',{error:String(error)});}finally{running=false;}};
 void tick();const interval=setInterval(()=>void tick(),120000);interval.unref();return {close:()=>clearInterval(interval)};
}
