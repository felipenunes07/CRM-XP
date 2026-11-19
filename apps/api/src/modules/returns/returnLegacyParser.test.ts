import {describe,it,expect} from 'vitest';
import XLSX from 'xlsx';
import {parseReturnLegacy} from './returnLegacyParser.js';
const workbook=(rows:unknown[][],sheet='DEFEITOS')=>{const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet(rows),sheet);return XLSX.write(b,{type:'buffer',bookType:'xlsx'}) as Buffer;};
const header=['COD','OK','CL','DATA','UND.','Descrição','SKU','Valor','Total','Cliente','Nota','Recusadas','TelaBateria','STAUS'];
describe('live returns legacy parser',()=>{
 it('preserves signed raw values and non-OK rows without declaring them approved',()=>{
  const rows=parseReturnLegacy(workbook([header,['DEF CL01',null,'CL01',45971,-2,'Tela','SKU',50,-100,'Cliente',null,null,'T','EM ANALISE']]));
  expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({signed_quantity:-2,amount_cents:-10000,raw_status:'EM ANALISE',sheet:'DEFEITOS',row_number:2});expect(rows[0]!.raw_payload.E).toBe(-2);
 });
 it('identifies equal rows as ambiguous and keeps identity stable when rows move',()=>{
  const row=['DEF CL01','OK','CL01',45971,-1,'Tela','SKU',50,-50,'Cliente'];
  const a=parseReturnLegacy(workbook([header,row,row]));expect(a[0]!.fingerprint).toBe(a[1]!.fingerprint);expect(a.map(r=>r.occurrence)).toEqual([1,2]);
  const b=parseReturnLegacy(workbook([header,[],row]));expect(b[0]!.fingerprint).toBe(a[0]!.fingerprint);expect(b[0]!.row_number).toBe(3);
  const changed=parseReturnLegacy(workbook([header,[...row.slice(0,4),-2,...row.slice(5)]]));expect(changed[0]!.fingerprint).not.toBe(a[0]!.fingerprint);expect(changed[0]!.anchor).toBe(a[0]!.anchor);
 });
 it('rejects missing headers, empty replacement and invalid quantities',()=>{
  expect(()=>parseReturnLegacy(workbook([header],'SALDO'))).toThrow('DEFEITOS');expect(()=>parseReturnLegacy(workbook([header]))).toThrow('vazia');
  expect(()=>parseReturnLegacy(workbook([header,['DEF','OK','CL1',45971,'N/A','Tela']]))).toThrow('inválido');
 });
});
