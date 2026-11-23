import type {Pool,PoolClient} from 'pg';
import type {CustomerCreditRow} from '@olist-crm/shared';
export function isReturnCreditPaymentType(value:string){
 const kind=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z]/g,'');
 return ['TROCA','TROCAS','DEFEITO','DEFEITOS','DEF','CANCELAMENTO','CREDITODETROCA','CREDITOPORDEFEITO'].includes(kind);
}
type Ledger={id:string;credit_id:string;customer_id:string;kind:string;amount_cents:string|number;reference:string;legacy_evidence?:{payment_key?:string;amount?:string|number;payment_type?:string}};
type Payment={customer_id:string;payment_key:string;payment_number:string;amount:string|number;payment_type:string};
export interface ReturnFinancialContribution {adjustmentCents:number;availableCents:number;heldCents:number;appliedCents:number;issues:string[]}
const normalized=(s:string)=>s.trim().toLowerCase();
export function deriveReturnContribution(entries:Ledger[],payments:Payment[]):ReturnFinancialContribution{
 const result:ReturnFinancialContribution={adjustmentCents:0,availableCents:0,heldCents:0,appliedCents:0,issues:[]};
 for(const grant of entries.filter(e=>e.kind==='grant')){
  const group=entries.filter(e=>e.credit_id===grant.credit_id),balance=group.reduce((n,e)=>n+Number(e.amount_cents),0),transfers=group.filter(e=>e.kind==='legacy_transfer');
  const recognized=group.filter(e=>['grant','credit_reversal','legacy_transfer'].includes(e.kind)).reduce((n,e)=>n+Number(e.amount_cents),0);
  const used=-group.filter(e=>['application','application_reversal'].includes(e.kind)).reduce((n,e)=>n+Number(e.amount_cents),0);
  const matches=payments.filter(p=>p.customer_id===grant.customer_id&&normalized(p.payment_number)===normalized(grant.reference));
  let adjustment=recognized,issue='';
  if(transfers.length){
   for(const transfer of transfers){const evidence=transfer.legacy_evidence;const match=matches.filter(p=>p.payment_key===evidence?.payment_key&&Number(p.amount)===Number(evidence?.amount)&&p.payment_type===evidence?.payment_type);if(match.length!==1)issue='Crédito transferido ao legado mudou ou desapareceu: '+grant.reference;}
   if(matches.length!==1)issue='Referência transferida não é única na origem: '+grant.reference;
  }else if(matches.length){
   const mirror=matches[0]!,amount=Math.round(Number(mirror.amount)*100);
   if(matches.length!==1||!isReturnCreditPaymentType(mirror.payment_type)||amount<=0||amount>recognized||![Number(grant.amount_cents),balance].includes(amount))issue='Crédito também encontrado no legado com dados divergentes: '+grant.reference;
   else adjustment-=amount;
  }
  if(![balance,recognized,used,adjustment].every(Number.isSafeInteger)||balance<0||recognized<0)issue='Saldo nativo inconsistente: '+grant.reference;
  if(issue){result.issues.push(issue);adjustment=0;}
  result.adjustmentCents+=adjustment;result.appliedCents+=used;
  if(matches.length||issue)result.heldCents+=Math.max(0,balance);else result.availableCents+=Math.max(0,balance);
 }
 return result;
}
export async function getReturnFinancialContributions(client:Pool|PoolClient,customerIds:string[]){
 const ids=[...new Set(customerIds)];const result=new Map<string,ReturnFinancialContribution>();if(!ids.length)return result;
 const rows=(await client.query('SELECT * FROM return_customer_financial_totals WHERE customer_id=ANY($1::uuid[])',[ids])).rows;
 for(const row of rows)result.set(row.customer_id,{adjustmentCents:Number(row.adjustment_cents),availableCents:Number(row.available_cents),heldCents:Number(row.held_cents),appliedCents:Number(row.applied_cents),issues:row.issues});
 return result;
}
export function applyReturnFinancialContribution(row:CustomerCreditRow,contribution:ReturnFinancialContribution|undefined):CustomerCreditRow{
 if(!contribution)return row;
 const imported=row.returnsFinance?.importedBalanceAmount??row.balanceAmount,conflict=contribution.issues.length>0;
 const returnsFinance={importedBalanceAmount:imported,adjustmentAmount:contribution.adjustmentCents/100,availableAmount:contribution.availableCents/100,heldAmount:contribution.heldCents/100,appliedAmount:contribution.appliedCents/100,reconciliationRequired:conflict,issues:contribution.issues};
 if(row.id.startsWith('customer-'))return {...row,availableCreditAmount:0,returnsFinance:{...returnsFinance,adjustmentAmount:0,reconciliationRequired:true,issues:['Saldo financeiro importado não localizado para este cliente; confira a posição antes de cobrar ou liberar limite',...contribution.issues]}};
 if(!contribution.adjustmentCents&&!conflict)return {...row,returnsFinance};
 const balanceAmount=(Math.round(imported*100)+(conflict?0:contribution.adjustmentCents))/100,debtAmount=Math.max(0,-balanceAmount),creditBalanceAmount=Math.max(0,balanceAmount);
 const hasOverCredit=row.creditLimit>0&&debtAmount>row.creditLimit;
 const operationalState=creditBalanceAmount>0?'HAS_CREDIT_BALANCE':debtAmount>0?hasOverCredit?'OVER_CREDIT':'OWES':row.creditLimit>0?'UNUSED_CREDIT':'SETTLED';
 return {...row,balanceAmount,debtAmount,creditBalanceAmount,hasOverCredit,hasDebtWithoutCredit:debtAmount>0&&row.creditLimit<=0,operationalState,availableCreditAmount:conflict?0:row.creditLimit>0?row.creditLimit-debtAmount:0,withinCreditLimit:!conflict&&debtAmount>0&&row.creditLimit>0&&debtAmount<=row.creditLimit,hasOverduePayment:debtAmount>0&&row.hasOverduePayment,hasSeverelyOverduePayment:debtAmount>0&&row.hasSeverelyOverduePayment,riskLevel:debtAmount===0&&!conflict?'OK':row.riskLevel,flags:row.flags.filter(flag=>(hasOverCredit||!/(ultrapassou cr[eé]dito|deve al[eé]m do cr[eé]dito)/i.test(flag))&&(debtAmount>0||!/(pagamento.*vencido|deve e n[aã]o tem cr[eé]dito)/i.test(flag))),returnsFinance};
}
