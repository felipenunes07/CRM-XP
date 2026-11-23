// Re-run against the user's workbook, never changes it or any database.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import XLSX from 'xlsx';
import {parseReturnPriceIndex,calculateReturnUnit,priceKey} from '../apps/api/dist/modules/returns/returnPricing.js';
const [source,output]=process.argv.slice(2);assert(source&&output,'Usage: node scripts/verify-return-workbook-rules.mjs input.xlsx report.json');
const bytes=fs.readFileSync(source),book=XLSX.read(bytes,{type:'buffer',sheets:['VL MANUAL','VL AUTO','OUT','SISTEMA','Inativo'],cellDates:false});
const index=parseReturnPriceIndex(book),history=new Map(index.history.map(r=>[priceKey(r.customerCode,r.sku),r])),catalog=new Map(index.catalog.map(r=>[r.sku,r]));
// Independent floating point implementation of the actual SUMPRODUCT formula.
const oracle=new Map();let salesRows=0;
for(const r of XLSX.utils.sheet_to_json(book.Sheets.OUT,{header:1,raw:true,defval:null}).slice(1)){
 const customer=String(r[0]??'').trim().toUpperCase(),sku=String(r[4]??'').trim().toUpperCase();if(!customer||!sku)continue;
 const key=priceKey(customer,sku),a=oracle.get(key)??{customer,sku,n:0,total:0,invalid:false};
 if(typeof r[2]!=='number'||typeof r[5]!=='number')a.invalid=true;else{a.n+=r[2];a.total+=r[2]*r[5];}oracle.set(key,a);salesRows++;
}
const differences=[],unavailable=[];let compared=0,cachedCompared=0;
for(const [key,a] of oracle){
 const actual=calculateReturnUnit(history.get(key)??null,catalog.get(a.sku)??null);
 if(actual.issue){unavailable.push({customer:a.customer,sku:a.sku,issue:actual.issue});continue;}
 const expected=a.n!==0?Math.round(a.total/a.n)*100:catalog.get(a.sku)?.unitCents;
 compared++;if(actual.unitCents!==expected)differences.push({type:'independent-formula',customer:a.customer,sku:a.sku,expected,actual:actual.unitCents});
}
const manual=XLSX.utils.sheet_to_json(book.Sheets['VL MANUAL'],{header:1,raw:true,defval:null});
for(let n=1;n<manual.length;n++){
 const r=manual[n],customer=String(r[0]??'').trim().toUpperCase(),sku=String(r[4]??'').trim().toUpperCase();
 if(!customer||!sku||typeof r[5]!=='number'||!book.Sheets['VL MANUAL']['F'+(n+1)]?.f)continue;
 const actual=calculateReturnUnit(history.get(priceKey(customer,sku))??null,catalog.get(sku)??null);
 if(actual.issue)continue;cachedCompared++;if(actual.unitCents!==Math.round(r[5]*100))differences.push({type:'excel-cached-price',row:n+1,customer,sku,expected:Math.round(r[5]*100),actual:actual.unitCents});
}
const report={sourceSha256:createHash('sha256').update(bytes).digest('hex'),formulaVersion:index.formulaVersion,formula:index.sourceFormula,catalogRange:index.catalogRange,salesThrough:index.salesThrough,salesRows,customerSkuPairs:oracle.size,compared,cachedExcelPricesCompared:cachedCompared,catalogSkus:catalog.size,reasonRules:index.reasons.length,skuAliases:index.skuAliases.length,differences,unavailableCount:unavailable.length,unavailable};
fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,formula:undefined,differences:report.differences.slice(0,10),unavailable:undefined}));
assert.equal(differences.length,0,'Workbook parity differences require investigation');assert(compared>0&&cachedCompared>0,'No actual source values were verified');
