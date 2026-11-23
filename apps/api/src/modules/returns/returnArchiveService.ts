import {createHash} from 'node:crypto';
import {z} from 'zod';
import {pool} from '../../db/client.js';
import {HttpError} from '../../lib/httpError.js';
import type {JwtUser} from '../platform/authService.js';
import {transaction} from './returnTransactions.js';
export async function importReturnArchive(payload:unknown,actor:JwtUser){
 if(!actor.permissions?.includes('returns.configure'))throw new HttpError(403,'Acesso negado');
 const i=z.object({sourceName:z.string().trim().min(1).max(300),sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),rows:z.array(z.object({sheet:z.string().min(1).max(100),rowNumber:z.number().int().positive(),payload:z.record(z.unknown())}).strict()).min(1).max(100000)}).strict().parse(payload);
 const checksum=createHash('sha256').update(JSON.stringify(i.rows)).digest('hex');
 return transaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['returns-archive:'+i.sourceSha256]);
  const previous=(await client.query('SELECT id,export_sha256 FROM return_legacy_archives WHERE source_sha256=$1',[i.sourceSha256])).rows[0];
  if(previous){if(previous.export_sha256!==checksum)throw new HttpError(409,'O mesmo arquivo já tem outra extração; preserve a origem e confira a diferença');return {id:previous.id};}
  const archive=(await client.query('INSERT INTO return_legacy_archives(source_name,source_sha256,export_sha256,rows_count,author_id) VALUES($1,$2,$3,$4,$5) RETURNING id',[i.sourceName,i.sourceSha256,checksum,i.rows.length,actor.id])).rows[0];
  for(let n=0;n<i.rows.length;n+=500){const rows=i.rows.slice(n,n+500).map(r=>({...r,searchText:Object.values(r.payload).map(v=>typeof v==='object'?JSON.stringify(v):String(v??'')).join(' ').slice(0,10000)}));await client.query(`INSERT INTO return_legacy_archive_rows SELECT $1,x.sheet,x."rowNumber",x."searchText",x.payload FROM jsonb_to_recordset($2::jsonb) AS x(sheet text,"rowNumber" int,payload jsonb,"searchText" text)`,[archive.id,JSON.stringify(rows)]);}
  await client.query('INSERT INTO return_settings_events(resource,author_id,author_name,data) VALUES($1,$2,$3,$4)',['legacy_archive',actor.id,actor.name,JSON.stringify({archiveId:archive.id,sourceName:i.sourceName,sourceSha256:i.sourceSha256,exportSha256:checksum,rows:i.rows.length})]);return {id:archive.id};
 });
}
export async function listReturnArchives(query:unknown){
 const i=z.object({source:z.string().max(100).default('live'),sheet:z.string().max(100).default(''),search:z.string().trim().max(150).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}).parse(query);
 const archives=(await pool.query('SELECT id,source_name AS name,source_sha256 AS "sourceSha256",rows_count AS "rowCount",created_at AS "createdAt" FROM return_legacy_archives ORDER BY created_at')).rows;
 if(i.source!=='live'&&!z.string().uuid().safeParse(i.source).success)throw new HttpError(400,'Origem inválida');
 const source=i.source==='live'?`FROM return_legacy_auxiliary_rows r JOIN return_legacy_revisions v ON v.id=r.revision_id AND v.active WHERE TRUE`:`FROM return_legacy_archive_rows r WHERE r.archive_id=$3`;
 const params:unknown[]=[i.sheet,'%'+i.search+'%'];if(i.source!=='live')params.push(i.source);
 const where=source+` AND ($1='' OR r.sheet=$1) AND r.search_text ILIKE $2`;
 const total=(await pool.query(`SELECT count(*)::int AS n ${where}`,params)).rows[0].n;
 const items=(await pool.query(`SELECT r.sheet,r.row_number AS "rowNumber",r.raw_payload AS "rawPayload" ${where} ORDER BY r.sheet,r.row_number LIMIT 50 OFFSET $${params.length+1}`,[...params,(i.page-1)*50])).rows;
 const sheets=(await pool.query(i.source==='live'?`SELECT DISTINCT r.sheet ${source}`:'SELECT DISTINCT sheet FROM return_legacy_archive_rows WHERE archive_id=$1',i.source==='live'?[]:[i.source])).rows.map(r=>r.sheet);
 return {archives,items,sheets,total,page:i.page,source:i.source};
}
