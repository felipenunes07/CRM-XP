import type {Pool,PoolClient} from 'pg';
import {factoryProfiles} from './returnFactoryPolicies.js';
import {normalizeFactoryToken} from '@olist-crm/shared';
export async function returnProductCatalog(client:Pool|PoolClient,search:string){
 if(search.trim().length<2)return [];
 const rows=(await client.query(`WITH active_catalog AS(SELECT c.* FROM return_price_catalog c JOIN return_legacy_revisions v ON v.id=c.revision_id AND v.active), archived AS(SELECT DISTINCT ON(upper(trim(r.raw_payload->>'B'))) upper(trim(r.raw_payload->>'B')) AS sku,r.raw_payload->>'A' AS model,r.raw_payload->>'F' AS color,r.raw_payload->>'G' AS quality,r.raw_payload->>'E' AS frame FROM return_legacy_archive_rows r JOIN return_legacy_archives a ON a.id=r.archive_id WHERE r.sheet='Modelos' AND COALESCE(r.raw_payload->>'B','')<>'' ORDER BY upper(trim(r.raw_payload->>'B')),a.created_at DESC,r.row_number), products AS(SELECT c.sku,c.model,c.color,c.quality,COALESCE(a.frame,'') AS frame FROM active_catalog c LEFT JOIN archived a ON a.sku=c.sku UNION ALL SELECT a.* FROM archived a WHERE NOT EXISTS(SELECT 1 FROM active_catalog c WHERE c.sku=a.sku)) SELECT * FROM products WHERE sku ILIKE $1 OR model ILIKE $1 ORDER BY sku LIMIT 50`,['%'+search+'%'])).rows;
 const profiles=await factoryProfiles(client);
 return rows.map(row=>{
  const tokens=String(row.model).toUpperCase().split(/[\s\[\]()*|,;]+/).filter(Boolean).map(normalizeFactoryToken);
  const found=profiles.filter(p=>!['OTHER','UNKNOWN'].includes(p.code)&&p.isActive&&[p.code,p.name,...p.aliases].some(a=>tokens.includes(normalizeFactoryToken(a))));
  return {...row,manufacturer:found.length===1?found[0]!.name:''};
 });
}
