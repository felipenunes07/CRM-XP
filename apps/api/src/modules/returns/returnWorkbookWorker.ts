import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';
import XLSX from 'xlsx';
import {parseReturnLegacyBook} from './returnLegacyParser.js';
import {parseReturnPriceIndex} from './returnPricing.js';
try{
 const book=XLSX.read(fs.readFileSync(workerData.localPath),{type:'buffer',sheets:['DEFEITOS','VL MANUAL','VL AUTO','OUT','SISTEMA','Inativo','Recondicionado','Estoque Defeitos','CHINA'],cellDates:false});
 const rows=parseReturnLegacyBook(book),pricing=parseReturnPriceIndex(book);
 const auxiliary=['Recondicionado','Estoque Defeitos','CHINA'].flatMap(sheet=>{
  const source=book.Sheets[sheet];if(!source)throw Error('Aba interna ausente: '+sheet);
  return XLSX.utils.sheet_to_json<unknown[]>(source,{header:1,raw:true,defval:null}).flatMap((r,i)=>r.some(v=>v!==null&&v!=='')?[{sheet,rowNumber:i+1,searchText:r.filter(v=>v!==null).join(' ').slice(0,10000),rawPayload:Object.fromEntries(r.map((v,j)=>[XLSX.utils.encode_col(j),v]))}]:[]);
 });
 parentPort!.postMessage({rows,pricing,auxiliary});
}catch(error){throw Error(String(error));}
