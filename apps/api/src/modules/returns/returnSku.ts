import type {PoolClient} from 'pg';
import {HttpError} from '../../lib/httpError.js';
export async function canonicalReturnSku(client:PoolClient,sku:string){
 let current=sku.trim().toUpperCase();const seen=new Set<string>();
 for(let n=0;n<20;n++){
  if(seen.has(current))throw new HttpError(409,'Há um ciclo na equivalência de SKU; confira o cadastro');seen.add(current);
  const alias=(await client.query('SELECT a.canonical_sku,a.ambiguous FROM return_sku_aliases a JOIN return_legacy_revisions v ON v.id=a.revision_id AND v.active WHERE a.sku=$1',[current])).rows[0];
  if(!alias)return current;if(alias.ambiguous)throw new HttpError(409,'SKU com equivalências diferentes; confira a origem');current=alias.canonical_sku;
 }
 throw new HttpError(409,'A cadeia de equivalência de SKU precisa ser conferida');
}
