import {z} from 'zod';
import {pool} from '../../db/client.js';
export async function returnInventoryReport(query:unknown){
 const i=z.object({search:z.string().trim().max(150).default(''),from:z.string().date().optional(),to:z.string().date().optional(),page:z.coerce.number().int().min(1).max(100000).default(1)}).parse(query);
 const rows=(await pool.query(`WITH items AS (
 SELECT i.id,c.id AS case_id,'TR-'||lpad(c.protocol_number::text,6,'0') AS protocol,u.customer_code,i.sku,i.model,i.manufacturer,i.quantity,
 COALESCE((SELECT sum(l.quantity) FROM return_factory_lines l JOIN return_factory_batches b ON b.id=l.batch_id WHERE l.item_id=i.id AND b.state='sent' AND b.voided_at IS NULL),0) AS sent,
 COALESCE((SELECT sum(p.quantity) FROM return_physical_receipts p WHERE p.item_id=i.id AND p.kind='original_returned' AND p.voided_at IS NULL),0) AS returned,
 COALESCE((SELECT sum(p.quantity) FROM return_physical_receipts p WHERE p.item_id=i.id AND p.kind='factory_retained' AND p.voided_at IS NULL),0) AS retained,
 COALESCE((SELECT sum(d.quantity) FROM return_deliveries d WHERE d.item_id=i.id AND d.asset='original' AND d.voided_at IS NULL),0) AS delivered,
 COALESCE((SELECT sum(d.quantity) FROM return_dispositions d WHERE d.item_id=i.id AND d.asset='original' AND d.voided_at IS NULL),0) AS destinations,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('destination',d.destination,'quantity',d.quantity,'location',d.to_location,'completed',d.completed_at IS NOT NULL)) FROM return_dispositions d WHERE d.item_id=i.id AND d.asset='original' AND d.voided_at IS NULL),'[]'::jsonb) AS movements
 FROM return_items i JOIN return_cases c ON c.id=i.case_id JOIN customers u ON u.id=c.customer_id
 WHERE c.stage<>'cancelled' AND (i.sku ILIKE $1 OR i.model ILIKE $1 OR i.manufacturer ILIKE $1 OR u.customer_code ILIKE $1)
 AND ($2::date IS NULL OR (c.received_at AT TIME ZONE 'America/Sao_Paulo')::date>=$2) AND ($3::date IS NULL OR (c.received_at AT TIME ZONE 'America/Sao_Paulo')::date<=$3)
 ) SELECT *,count(*) OVER()::int AS total FROM items ORDER BY sku,protocol LIMIT 50 OFFSET $4`,['%'+i.search+'%',i.from??null,i.to??null,(i.page-1)*50])).rows;
 return {page:i.page,total:rows[0]?.total??0,items:rows.map(r=>({id:r.id,caseId:r.case_id,protocol:r.protocol,customerCode:r.customer_code,sku:r.sku,model:r.model,manufacturer:r.manufacturer,quantity:Number(r.quantity),atFactory:Number(r.sent)-Number(r.returned)-Number(r.retained),retained:Number(r.retained),delivered:Number(r.delivered),awaitingDestination:Number(r.quantity)-Number(r.sent)+Number(r.returned)-Number(r.delivered)-Number(r.destinations),destinations:r.movements}))};
}
