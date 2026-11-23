import {Worker} from 'node:worker_threads';
import type {ReturnPriceIndex} from './returnPricing.js';
import type {parseReturnLegacy} from './returnLegacyParser.js';
export interface ReturnWorkbookBundle {rows:ReturnType<typeof parseReturnLegacy>;pricing:ReturnPriceIndex;auxiliary:Array<{sheet:string;rowNumber:number;searchText:string;rawPayload:Record<string,unknown>}>}
export function readReturnWorkbook(localPath:string):Promise<ReturnWorkbookBundle>{
 // Parsing OUT is CPU-heavy. Keep it off the HTTP event loop during Dropbox refreshes.
 const extension=import.meta.url.endsWith('.ts')?'.ts':'.js';
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./returnWorkbookWorker'+extension,import.meta.url),{workerData:{localPath}});
  let received=false;
  const timeout=setTimeout(()=>{void worker.terminate();reject(Error('A leitura da planilha excedeu três minutos; a versão anterior foi preservada'));},180000);timeout.unref();
  worker.once('message',(bundle:ReturnWorkbookBundle)=>{received=true;clearTimeout(timeout);resolve(bundle);});
  worker.once('error',error=>{clearTimeout(timeout);reject(error);});
  worker.once('exit',code=>{clearTimeout(timeout);if(!received)reject(Error('Leitor da planilha terminou sem resultado, código '+code));});
 });
}
