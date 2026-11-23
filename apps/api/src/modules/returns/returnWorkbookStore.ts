import type {PoolClient} from 'pg';
import type {ReturnWorkbookBundle} from './returnWorkbookReader.js';
export async function storeReturnWorkbookRules(client:PoolClient,revisionId:string,{pricing,auxiliary}:Pick<ReturnWorkbookBundle,'pricing'|'auxiliary'>){
 await client.query('INSERT INTO return_price_snapshots(revision_id,formula_version,source_formula,catalog_range,sales_through) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[revisionId,pricing.formulaVersion,pricing.sourceFormula,pricing.catalogRange,pricing.salesThrough]);
 for(let i=0;i<pricing.history.length;i+=1000)await client.query(`INSERT INTO return_price_history SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x("customerCode" text,sku text,quantity numeric,"weightedCents" numeric,invalid boolean) ON CONFLICT DO NOTHING`,[revisionId,JSON.stringify(pricing.history.slice(i,i+1000))]);
 await client.query(`INSERT INTO return_price_catalog SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(sku text,"unitCents" bigint,ambiguous boolean,model text,color text,quality text) ON CONFLICT DO NOTHING`,[revisionId,JSON.stringify(pricing.catalog)]);
 await client.query(`INSERT INTO return_reason_rules SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(code text,label text,outcome text) ON CONFLICT DO NOTHING`,[revisionId,JSON.stringify(pricing.reasons)]);
 await client.query(`INSERT INTO return_sku_aliases SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(sku text,"canonicalSku" text,ambiguous boolean) ON CONFLICT DO NOTHING`,[revisionId,JSON.stringify(pricing.skuAliases)]);
 for(let i=0;i<auxiliary.length;i+=1000)await client.query(`INSERT INTO return_legacy_auxiliary_rows SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(sheet text,"rowNumber" int,"searchText" text,"rawPayload" jsonb) ON CONFLICT DO NOTHING`,[revisionId,JSON.stringify(auxiliary.slice(i,i+1000))]);
}
