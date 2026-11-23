import type {PoolClient} from 'pg';
import type {JwtUser} from '../platform/authService.js';
import {HttpError} from '../../lib/httpError.js';
import {isReturnCreditPaymentType} from './returnFinancialProjection.js';
const ensure:(condition:unknown,message:string)=>asserts condition=(condition,message)=>{if(!condition)throw new HttpError(409,message);};

export async function returnCreditPayments(client:PoolClient,customerId:string,caseId:string,reference:string){
 return (await client.query(`SELECT p.snapshot_id,p.payment_key,p.amount,p.payment_number,p.payment_type FROM customer_credit_payment_entries p JOIN customer_credit_snapshots s ON s.id=p.snapshot_id AND s.is_active WHERE p.customer_id=$1 AND (lower(trim(p.payment_number))=lower(trim($3)) OR EXISTS(SELECT 1 FROM return_legacy_links l JOIN return_legacy_rows r ON r.id=l.source_row_id WHERE l.active AND l.case_id=$2 AND trim(r.document)<>'' AND lower(trim(r.document))=lower(trim(p.payment_number))))`,[customerId,caseId,reference])).rows;
}
export async function reconcileReturnCredit(client:PoolClient,caseId:string,creditId:string,paymentReference:string,reason:string,actor:JwtUser){
 const credit=(await client.query('SELECT * FROM return_credits WHERE id=$1 AND case_id=$2 FOR UPDATE',[creditId,caseId])).rows[0];
 ensure(credit&&['approved','posted'].includes(credit.status)&&credit.party==='customer'&&credit.currency==='BRL','Selecione crédito de cliente autorizado em BRL');
 const parent=(await client.query('SELECT customer_id FROM return_cases WHERE id=$1',[caseId])).rows[0];
 const reference='CRM-TROCA-'+creditId;
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['return-credit-payment:'+parent.customer_id]);
 const matches=(await returnCreditPayments(client,parent.customer_id,caseId,reference)).filter(p=>p.payment_number.trim().toLowerCase()===paymentReference.trim().toLowerCase());
 ensure(matches.length===1,'Localize um lançamento único do mesmo cliente: referência CRM ou documento da planilha vinculado a este protocolo');
 const payment=matches[0];ensure(isReturnCreditPaymentType(payment.payment_type)&&Number(payment.amount)>0,'O lançamento deve ser crédito positivo de troca, defeito ou cancelamento');
 ensure(!(await client.query('SELECT id FROM return_credit_reconciliations WHERE credit_id=$1 AND active',[creditId])).rowCount,'Crédito já conciliado');
 ensure(!(await client.query("SELECT id FROM return_wallet_entries WHERE credit_id=$1 AND kind IN ('legacy_transfer','credit_reversal')",[creditId])).rowCount,'Crédito transferido ou estornado não pode receber outra conciliação');
 const allocated=Number((await client.query('SELECT COALESCE(sum(coverage_cents),0) AS n FROM return_credit_reconciliations WHERE customer_id=$1 AND lower(trim(payment_number))=lower(trim($2)) AND active',[parent.customer_id,payment.payment_number])).rows[0].n);
 const transferred=Number((await client.query("SELECT -COALESCE(sum(amount_cents),0) AS n FROM return_wallet_entries WHERE customer_id=$1 AND kind='legacy_transfer' AND lower(trim(legacy_evidence->>'payment_number'))=lower(trim($2))",[parent.customer_id,payment.payment_number])).rows[0].n);
 ensure(allocated+transferred+Number(credit.amount_cents)<=Math.round(Number(payment.amount)*100),'As conciliações excedem o valor comprovado no lançamento importado');
 const grant=(await client.query("SELECT id FROM return_wallet_entries WHERE credit_id=$1 AND kind='grant'",[creditId])).rows[0];
 if(!grant){
  ensure(credit.status==='approved','O crédito foi lançado fora da carteira; confira o lançamento existente');
  const item=(await client.query('SELECT factory_code FROM return_items WHERE id=$1',[credit.item_id])).rows[0];
  await client.query("INSERT INTO return_wallet_entries(case_id,credit_id,customer_id,factory_code,party,currency,kind,amount_cents,reference,reason,author_id) VALUES($1,$2,$3,$4,'customer','BRL','grant',$5,$6,$7,$8)",[caseId,creditId,parent.customer_id,item.factory_code,credit.amount_cents,reference,reason,actor.id]);
  await client.query("UPDATE return_credits SET status='posted',official_system='CRM XP · carteira de trocas',official_reference=$2,posted_at=NOW() WHERE id=$1",[creditId,reference]);
 }
 await client.query('INSERT INTO return_credit_reconciliations(credit_id,customer_id,payment_number,payment_key,payment_amount,payment_type,coverage_cents,source_evidence,reason,author_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[creditId,parent.customer_id,payment.payment_number,payment.payment_key,payment.amount,payment.payment_type,credit.amount_cents,JSON.stringify(payment),reason,actor.id]);
}
export async function releaseReturnCreditReconciliation(client:PoolClient,caseId:string,creditId:string,reason:string){
 const row=(await client.query('SELECT r.* FROM return_credit_reconciliations r JOIN return_credits c ON c.id=r.credit_id WHERE r.credit_id=$1 AND c.case_id=$2 AND r.active FOR UPDATE OF r',[creditId,caseId])).rows[0];ensure(row,'Conciliação ativa não encontrada');
 ensure(!(await client.query(`SELECT 1 FROM customer_credit_payment_entries p JOIN customer_credit_snapshots s ON s.id=p.snapshot_id AND s.is_active WHERE p.customer_id=$1 AND lower(trim(p.payment_number))=lower(trim($2))`,[row.customer_id,row.payment_number])).rowCount,'O crédito ainda existe na origem financeira; corrija a origem e atualize antes de devolver a autoridade ao CRM');
 await client.query('UPDATE return_credit_reconciliations SET active=false,released_at=NOW(),release_reason=$2 WHERE id=$1',[row.id,reason]);
}
