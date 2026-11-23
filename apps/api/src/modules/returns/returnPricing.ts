import XLSX from 'xlsx';
import fs from 'node:fs';
export const RETURN_PRICE_FORMULA_VERSION='weighted-out-round-0-catalog-6-v1';
const expected='IF(E2="","",IFERROR(ROUND(SUMPRODUCT((OUT[COD]=A2)*(OUT[SKU]=E2),OUT[N],OUT[VALOR])/SUMPRODUCT((OUT[COD]=A2)*(OUT[SKU]=E2),OUT[N]),0),VLOOKUP(E2,SISTEMA,6,FALSE)))';
const compact=(s:string)=>s.replace(/\s+/g,'').toUpperCase();
export const priceKey=(customer:string,sku:string)=>JSON.stringify([customer.trim().toUpperCase(),sku.trim().toUpperCase()]);
export interface ReturnPriceIndex {formulaVersion:string;sourceFormula:string;catalogRange:string;salesThrough:string|null;history:Array<{customerCode:string;sku:string;quantity:string;weightedCents:string;invalid:boolean}>;catalog:Array<{sku:string;unitCents:number|null;ambiguous:boolean;model:string;color:string;quality:string}>;reasons:Array<{code:string;label:string;outcome:'refused'|'external_analysis'|'no_defect'|'resale'}>;skuAliases:Array<{sku:string;canonicalSku:string;ambiguous:boolean}>}
export function exactCents(value:unknown):bigint|null{
 if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e10)return null;
 const n=Math.round(value*100);return Math.abs(value*100-n)<0.00001&&Number.isSafeInteger(n)?BigInt(n):null;
}
export function parseReturnPriceIndex(book:XLSX.WorkBook):ReturnPriceIndex{
 const manual=book.Sheets['VL MANUAL'],out=book.Sheets.OUT,catalogSheet=book.Sheets.SISTEMA;
 if(!manual||!out||!catalogSheet)throw Error('Faltam VL MANUAL, OUT ou SISTEMA para calcular o crédito');
 if(compact(manual.F2?.f??'')!==compact(expected)||compact(manual.G2?.f??'')!==compact('IF(F2="","",IF(F2>2500,"NOVO",IFERROR(C2*F2,"")))'))throw Error('A fórmula de preço da planilha mudou; a regra precisa ser conferida');
 const range=book.Workbook?.Names?.find(n=>n.Name==='SISTEMA')?.Ref??'';
 if(compact(range.replaceAll("'",''))!=='SISTEMA!$B:$G')throw Error('A tabela SISTEMA mudou; confira a coluna do preço');
 const rows=XLSX.utils.sheet_to_json<unknown[]>(out,{header:1,raw:true,defval:null});
 if(rows[0]?.slice(0,6).map(String).join('|')!=='COD|DATA|N|DESCRIÇÃO|SKU|VALOR')throw Error('Cabeçalho OUT incompatível com a regra de preço');
 const aggregates=new Map<string,{customerCode:string;sku:string;quantity:bigint;weightedCents:bigint;invalid:boolean}>();
 let salesThrough:string|null=null;
 for(const r of rows.slice(1)){
  const customer=String(r[0]??'').trim().toUpperCase(),sku=String(r[4]??'').trim().toUpperCase();if(!customer||!sku)continue;
  if(typeof r[1]==='number'){const date=XLSX.SSF.parse_date_code(r[1]);if(date){const day=`${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;if(!salesThrough||day>salesThrough)salesThrough=day;}}
  const key=priceKey(customer,sku),a=aggregates.get(key)??{customerCode:customer,sku,quantity:0n,weightedCents:0n,invalid:false};
  const price=exactCents(r[5]),n=r[2];
  if(price===null||typeof n!=='number'||!Number.isSafeInteger(n))a.invalid=true;
  else{a.quantity+=BigInt(n);a.weightedCents+=BigInt(n)*price;}aggregates.set(key,a);
 }
 const catalog=new Map<string,ReturnPriceIndex['catalog'][number]>();
 for(const r of XLSX.utils.sheet_to_json<unknown[]>(catalogSheet,{header:1,raw:true,defval:null}).slice(1)){
  const sku=String(r[1]??'').trim().toUpperCase();if(!sku)continue;const price=exactCents(r[6]),unitCents=price===null?null:Number(price),old=catalog.get(sku);
  if(old){if(old.unitCents!==unitCents)old.ambiguous=true;}else catalog.set(sku,{sku,unitCents,ambiguous:false,model:String(r[0]??r[2]??'').trim(),color:String(r[3]??'').trim(),quality:String(r[4]??'').trim()});
 }
 const auto=book.Sheets['VL AUTO'];if(!auto)throw Error('Falta a tabela de motivos da aba VL AUTO');
 const reasons:ReturnPriceIndex['reasons']=[];
 for(let row=2;row<=34;row++){const code=String(auto['AE'+row]?.v??'').trim(),label=String(auto['AC'+row]?.v??'').trim();if(!code||!label)continue;
  const outcome=code.includes('Vender de novo')?'resale':label==='Peças em Análise Do Técnico'?'external_analysis':code.includes('Novo')?'no_defect':'refused';
  reasons.push({code,label,outcome});
 }
 if(!reasons.some(r=>r.outcome==='external_analysis')||!reasons.some(r=>r.outcome==='resale'))throw Error('Tabela de motivos incompleta; confira os códigos da planilha');
 const aliases=new Map<string,{sku:string;canonicalSku:string;ambiguous:boolean}>(),inactive=book.Sheets.Inativo;
 if(!inactive)throw Error('Falta a tabela de equivalência de SKU da aba Inativo');
 const aliasRows=XLSX.utils.sheet_to_json<unknown[]>(inactive,{header:1,raw:true,defval:null});
 if(String(aliasRows[0]?.[0]).trim()!=='Mudar'||String(aliasRows[0]?.[1]).trim()!=='Usar esse')throw Error('Cabeçalho Inativo mudou; confira a equivalência dos SKUs');
 for(const r of aliasRows.slice(1)){const sku=String(r[0]??'').trim().toUpperCase(),canonicalSku=String(r[1]??'').trim().toUpperCase();if(!sku||!canonicalSku||sku===canonicalSku)continue;const old=aliases.get(sku);if(old&&old.canonicalSku!==canonicalSku)old.ambiguous=true;else if(!old)aliases.set(sku,{sku,canonicalSku,ambiguous:false});}
 return {formulaVersion:RETURN_PRICE_FORMULA_VERSION,sourceFormula:manual.F2.f,catalogRange:range,salesThrough,history:[...aggregates.values()].map(a=>({...a,quantity:String(a.quantity),weightedCents:String(a.weightedCents)})),catalog:[...catalog.values()],reasons,skuAliases:[...aliases.values()]};
}
export function readReturnPricing(file:string){return parseReturnPriceIndex(XLSX.read(fs.readFileSync(file),{type:'buffer',sheets:['VL MANUAL','VL AUTO','OUT','SISTEMA','Inativo'],cellDates:false}));}
export function calculateReturnUnit(history:{quantity:string;weightedCents:string;invalid:boolean}|null,catalog:{unitCents:number|null;ambiguous:boolean}|null){
 let unitCents:number|null=null,basis='';
 if(history?.invalid)return {unitCents:null,basis,issue:'Vendas com quantidade ou preço inválido; confira a origem'};
 if(history&&BigInt(history.quantity)!==0n){
  let numerator=BigInt(history.weightedCents),denominator=BigInt(history.quantity)*100n;
  if(denominator<0n){numerator=-numerator;denominator=-denominator;}
  const sign=numerator<0n?-1n:1n,absolute=numerator*sign;
  unitCents=Number(sign*((absolute*2n+denominator)/(denominator*2n))*100n);basis='Média ponderada OUT do cliente e SKU, arredondada para reais inteiros';
 }else if(catalog&&!catalog.ambiguous&&catalog.unitCents!==null){unitCents=catalog.unitCents;basis='Preço do catálogo SISTEMA, coluna 6 da faixa B:G';}
 else return {unitCents:null,basis,issue:catalog?.ambiguous?'SKU com preços diferentes no catálogo; Isis precisa conferir':'Sem vendas utilizáveis e sem preço de catálogo para este SKU'};
 if(!Number.isSafeInteger(unitCents)||unitCents<=0)return {unitCents:null,basis,issue:'A fórmula resultou em preço zero ou negativo; confira a base'};
 if(unitCents>250000)return {unitCents:null,basis,issue:'A planilha classifica preço acima de R$ 2.500 como NOVO; não libera crédito automático'};
 return {unitCents,basis,issue:null};
}
