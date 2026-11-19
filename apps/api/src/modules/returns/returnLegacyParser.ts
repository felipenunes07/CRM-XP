import {createHash} from 'node:crypto';
import XLSX from 'xlsx';
import fs from 'node:fs';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function parseReturnLegacy(buffer:Buffer){
 const book=XLSX.read(buffer,{type:'buffer',sheets:['DEFEITOS'],cellDates:false});
 const sheet=book.Sheets.DEFEITOS;if(!sheet)throw Error('A aba DEFEITOS não foi encontrada; a versão anterior foi preservada');
 const rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,defval:null});
 const heading=rows.findIndex(r=>String(r[0]??'').trim().toUpperCase()==='COD'&&String(r[4]??'').toUpperCase().includes('UND'));
 if(heading<0)throw Error('Cabeçalho DEFEITOS incompatível; nenhuma linha foi substituída');
 const occurrences=new Map<string,number>();
 const result=rows.slice(heading+1).flatMap((r,index)=>{
  const str=(i:number)=>String(r[i]??'').trim();const quantity=Number(r[4]);
  if(!str(0)&&!str(2)&&!str(5)&&!str(6))return [];
  if(!Number.isFinite(quantity)||!Number.isFinite(Number(r[8])))throw Error(`Quantidade ou valor inválido na linha ${index+heading+2}`);
  const raw=Object.fromEntries(r.map((value,i)=>[XLSX.utils.encode_col(i),value]));
  const fingerprint=hash(raw),occurrence=(occurrences.get(fingerprint)??0)+1;occurrences.set(fingerprint,occurrence);
  const date=typeof r[3]==='number'?XLSX.SSF.format('yyyy-mm-dd',r[3]):str(3);
  return [{sheet:'DEFEITOS',row_number:index+heading+2,fingerprint,anchor:hash([str(0),str(2),str(6)]),occurrence,document:str(0),customer_code:str(2),customer_name:str(9),occurred_on:date,sku:str(6),description:str(5),signed_quantity:quantity,amount_cents:Math.round(Number(r[8])*100),raw_status:[str(1),str(13),str(15)].filter(Boolean).join(' / '),raw_payload:raw}];
 });
 if(!result.length)throw Error('A origem ficou vazia; a versão anterior foi preservada');
 return result;
}
export function readReturnLegacyFile(file:string){return parseReturnLegacy(fs.readFileSync(file));}
