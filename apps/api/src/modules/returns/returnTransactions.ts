import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import type { JwtUser } from "../platform/authService.js";
export async function transaction<T>(run:(client:PoolClient)=>Promise<T>) {
 const client=await pool.connect();
 try {await client.query("BEGIN");const value=await run(client);await client.query("COMMIT");return value;}
 catch(error){await client.query("ROLLBACK");if((error as {code?:string}).code==='23505')throw new HttpError(409,"Documento ou operação já registrado. Confira a referência e recarregue.");throw error;}
 finally{client.release();}
}
export async function lockCase(client:PoolClient,id:string,version:number){
 const row=(await client.query("SELECT * FROM return_cases WHERE id=$1 FOR UPDATE",[id])).rows[0];
 if(!row)throw new HttpError(404,"Protocolo não encontrado");
 if(row.version!==version)throw new HttpError(409,"Este protocolo foi atualizado por outra pessoa. Recarregue antes de salvar.");
 return row;
}
export async function record(client:PoolClient,id:string,action:string,data:unknown,actor:JwtUser){
 await client.query("UPDATE return_cases SET version=version+1,updated_at=NOW() WHERE id=$1",[id]);
 await client.query("INSERT INTO return_events(case_id,action,author_id,author_name,data) VALUES($1,$2,$3,$4,$5::jsonb)",[id,action,actor.id,actor.name,JSON.stringify(data)]);
}
// The request lock precedes case locks, so a response-lost retry can succeed with its old version.
export async function command<T extends {requestId:string}>(name:string,input:T,actor:JwtUser,run:(client:PoolClient)=>Promise<string>){
 const hash=createHash('sha256').update(JSON.stringify({name,input,actorId:actor.id})).digest('hex');
 return transaction(async client=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[input.requestId]);
  const previous=(await client.query("SELECT request_hash,result_id FROM return_commands WHERE request_id=$1",[input.requestId])).rows[0];
  if(previous){if(previous.request_hash!==hash)throw new HttpError(409,"Esta solicitação já foi usada com outros dados");return previous.result_id as string;}
  const id=await run(client);
  await client.query("INSERT INTO return_commands(request_id,request_hash,actor_id,result_id) VALUES($1,$2,$3,$4)",[input.requestId,hash,actor.id,id]);
  return id;
 });
}
