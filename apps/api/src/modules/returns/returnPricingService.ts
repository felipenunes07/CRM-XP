import type {Pool,PoolClient} from 'pg';
import {pool} from '../../db/client.js';
import {HttpError} from '../../lib/httpError.js';
import {calculateReturnUnit} from './returnPricing.js';
import {z} from 'zod';
import type {JwtUser} from '../platform/authService.js';
import {transaction} from './returnTransactions.js';
export async function returnCreditQuote(caseId:string,sourceId:string,client:Pool|PoolClient=pool){
 const source=(await client.query(`SELECT r.id,r.quantity,r.kind,i.sku,c.customer_id,u.customer_code FROM return_resolutions r JOIN return_items i ON i.id=r.item_id JOIN return_cases c ON c.id=r.case_id JOIN customers u ON u.id=c.customer_id WHERE r.id=$1 AND r.case_id=$2 AND r.voided_at IS NULL AND r.kind IN ('credit','sale_cancellation')`,[sourceId,caseId])).rows[0];
 if(!source)throw new HttpError(404,'Atendimento com crédito não encontrado');
 const category=String(source.sku).toUpperCase().startsWith('B')?'Baterias':'Telas';
 const base={sourceId,quantity:source.quantity,sku:source.sku,category,currency:'BRL' as const};
 if(source.kind==='sale_cancellation'){
  const c=(await client.query('SELECT unit_cents,sale_reference FROM return_sale_cancellations WHERE resolution_id=$1',[source.id])).rows[0];
  if(!c)return {...base,unitCents:null,amountCents:null,basis:'',revision:null,issue:'Conferência da venda original não encontrada'};
  return {...base,unitCents:Number(c.unit_cents),amountCents:Number(c.unit_cents)*source.quantity,basis:'Preço original conferido da venda '+c.sale_reference,revision:null,issue:null};
 }
 const revision=(await client.query(`SELECT v.id,v.source_revision,v.source_path,p.formula_version,p.sales_through::text,t.authority,t.source_enabled,t.last_success_at,t.last_error FROM return_legacy_revisions v JOIN return_price_snapshots p ON p.revision_id=v.id CROSS JOIN return_transition_settings t WHERE v.active AND t.id=1 AND v.source_path=t.source_path`)).rows[0];
 if(!revision)return {...base,unitCents:null,amountCents:null,basis:'',revision:null,issue:'Aguarde a primeira leitura validada da fórmula, das vendas OUT e do catálogo'};
 if(revision.authority==='parallel'&&(revision.last_error||!revision.last_success_at||Date.now()-new Date(revision.last_success_at).getTime()>15*60*1000))return {...base,unitCents:null,amountCents:null,basis:'',revision:revision.source_revision,issue:'Atualização da planilha pendente ou com erro; confira a origem antes de calcular'};
 const customer=String(source.customer_code??'').trim().toUpperCase(),sku=String(source.sku??'').trim().toUpperCase();
 let history=(await client.query('SELECT quantity::text,"weighted_cents"::text AS "weightedCents",invalid FROM return_price_history WHERE revision_id=$1 AND customer_code=$2 AND sku=$3',[revision.id,customer,sku])).rows[0]??null;
 const originalHistory=history;
 let extension:{quantity:string;weightedCents:string}|null=null;
 if(revision.authority==='crm'){
  if(!revision.sales_through)return {...base,unitCents:null,amountCents:null,basis:'',revision:revision.source_revision,issue:'Falta conferir a data de corte das vendas OUT antes de usar vendas novas do CRM'};
  // The OUT baseline already contains all earlier days. Add only later sales from the CRM's preferred source per order.
  const extra=(await client.query(`WITH preferred AS(SELECT DISTINCT ON(order_number,customer_code) order_number,customer_code,source_system FROM resolved_sales_raw WHERE customer_code=$1 AND lower(COALESCE(order_status,''))<>'cancelado' ORDER BY order_number,customer_code,CASE WHEN source_system='supabase_2026' THEN 1 ELSE 2 END,source_system) SELECT COALESCE(sum(s.quantity),0)::text AS quantity,COALESCE(sum(s.quantity*s.unit_price*100),0)::text AS "weightedCents" FROM resolved_sales_raw s JOIN preferred p ON p.order_number=s.order_number AND p.customer_code=s.customer_code AND p.source_system=s.source_system WHERE s.customer_code=$1 AND upper(trim(s.sku))=$2 AND s.sale_date>$3::date AND lower(COALESCE(s.order_status,''))<>'cancelado'`,[customer,sku,revision.sales_through])).rows[0];
  const integer=(v:string)=>/^-?\d+(?:\.0+)?$/.test(v)?BigInt(v.split('.')[0]!):null;
  const quantity=integer(extra.quantity),weighted=integer(extra.weightedCents);
  if(quantity===null||weighted===null)return {...base,unitCents:null,amountCents:null,basis:'',revision:revision.source_revision,issue:'Vendas novas têm quantidade fracionada ou precisão incompatível; confira a origem'};
  extension={quantity:String(quantity),weightedCents:String(weighted)};
  history={quantity:String(BigInt(history?.quantity??'0')+quantity),weightedCents:String(BigInt(history?.weightedCents??'0')+weighted),invalid:history?.invalid??false};
 }
 const nativeCatalog=(await client.query('SELECT unit_cents::float8 AS "unitCents",version FROM return_price_overrides WHERE sku=$1',[sku])).rows[0]??null;
 const catalog=nativeCatalog?{unitCents:nativeCatalog.unitCents,ambiguous:false}:(await client.query('SELECT unit_cents::float8 AS "unitCents",ambiguous FROM return_price_catalog WHERE revision_id=$1 AND sku=$2',[revision.id,sku])).rows[0]??null;
 const calculated=calculateReturnUnit(history,catalog),amountCents=calculated.unitCents===null?null:calculated.unitCents*source.quantity;
 if(amountCents!==null&&(!Number.isSafeInteger(amountCents)||amountCents>1e12))return {...base,unitCents:null,amountCents:null,basis:'',revision:revision.source_revision,issue:'Valor total ultrapassa o limite financeiro permitido'};
 const basis=nativeCatalog&&(!history||BigInt(history.quantity)===0n)?`Catálogo aprovado no CRM, versão ${nativeCatalog.version}`:calculated.basis;
 const evidence={sourceRevision:revision.source_revision,formulaVersion:revision.formula_version,baseline:originalHistory,extension,salesThrough:revision.sales_through,catalogUnitCents:catalog?.unitCents??null,nativeCatalogVersion:nativeCatalog?.version??null};
 return {...base,...calculated,amountCents,basis:basis?`${basis} · ${revision.formula_version} · revisão ${revision.source_revision}${extension?' · vendas novas do CRM após '+revision.sales_through:''}`:'',revision:revision.source_revision,evidence};
}
export async function listReturnNativePrices(search=''){
 return (await pool.query('SELECT o.sku,o.unit_cents::float8 AS "unitCents",o.version,o.reason,p.full_name AS "authorName",o.updated_at AS "updatedAt" FROM return_price_overrides o JOIN profiles p ON p.id=o.author_id WHERE o.sku ILIKE $1 ORDER BY o.sku LIMIT 100',['%'+search+'%'])).rows;
}
export async function saveReturnNativePrice(payload:unknown,actor:JwtUser){
 if(!actor.permissions?.some(p=>['returns.logistics','returns.finance'].includes(p)))throw new HttpError(403,'Acesso negado');
 const i=z.object({sku:z.string().trim().min(1).max(100).transform(s=>s.toUpperCase()),unitCents:z.number().int().min(1).max(250000),version:z.number().int().min(0),reason:z.string().trim().min(5).max(4000)}).strict().parse(payload);
 await transaction(async client=>{await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['return-price:'+i.sku]);const previous=(await client.query('SELECT * FROM return_price_overrides WHERE sku=$1 FOR UPDATE',[i.sku])).rows[0];if((previous?.version??0)!==i.version)throw new HttpError(409,'Preço alterado por outra pessoa; recarregue');await client.query('INSERT INTO return_price_overrides(sku,unit_cents,reason,author_id) VALUES($1,$2,$3,$4) ON CONFLICT(sku) DO UPDATE SET unit_cents=EXCLUDED.unit_cents,reason=EXCLUDED.reason,author_id=EXCLUDED.author_id,version=return_price_overrides.version+1,updated_at=NOW()',[i.sku,i.unitCents,i.reason,actor.id]);await client.query('INSERT INTO return_settings_events(resource,author_id,author_name,data) VALUES($1,$2,$3,$4)',['return_price',actor.id,actor.name,JSON.stringify({before:previous,after:i})]);});return listReturnNativePrices(i.sku);
}
