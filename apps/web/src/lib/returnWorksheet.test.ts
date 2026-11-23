import {describe,it,expect} from 'vitest';
import {webcrypto} from 'node:crypto';
import {pasteSheetRows,rowErrors,sheetChanges,itemFields,rowChanged} from './returnWorksheet';
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
describe('worksheet entry',()=>{
 it('reads familiar approved/refused columns without inventing tests or a factory',()=>{
  const rows=pasteSheetRows('MODELO\tSKU\tARO\tCOR\tTROCA\tNÃO TROCA\tMOTIVO\nIP11\tCX156-1\tS/A\tPreto\t2\t3\tSem imagem');expect(rows.map(r=>[r.fields.quantity,r.fields.outcome])).toEqual([[2,'approved'],[3,'refused']]);expect(rows[0]!.fields.testNotes).toBe('');expect(rowErrors(rows[0]!)).toContain('Registre o teste realizado.');expect(rowErrors(rows[0]!)).toContain('Escolha a fábrica.');expect(new Set(rows.map(r=>r.id)).size).toBe(2);
 });
 it('preserves quoted multiline diagnostics and rejects unknown results',()=>{
  const rows=pasteSheetRows('Modelo\tSKU\tQuantidade\tResultado\tFábrica\tTeste\nIP11\tX\t1\taprovado\tXP\t"Imagem ok\nTouch ok"');expect(rows[0]!.fields.testNotes).toBe('Imagem ok\nTouch ok');expect(rowErrors(rows[0]!)).toEqual([]);expect(()=>pasteSheetRows('IP11\tX\t\t\t1\tINVENTADO')).toThrow('resultado não reconhecido');
 });
 it('sends only actual changes and keeps a deletion distinct from an empty draft',()=>{
  const f=itemFields({model:'IP11'}),existing={id:'existing',base:f,fields:{...f},removed:false};expect(rowChanged(existing)).toBe(false);expect(sheetChanges([existing])).toEqual([]);expect(sheetChanges([{...existing,removed:true}])).toEqual([{kind:'remove',id:'existing'}]);expect(rowChanged({id:'blank',base:null,fields:itemFields(),removed:false})).toBe(false);
 });
 it('keeps invalid pasted quantities out of drafts and does not invent a missing count',()=>{expect(()=>pasteSheetRows('Modelo\tQuantidade\nIP11\ttexto')).toThrow('quantidade');expect(pasteSheetRows('Modelo\tQuantidade\nIP11\t')[0]!.fields.quantity).toBe(0);});
 it('allows an unfinished identification to be saved without inventing a factory or a diagnostic',()=>{expect(rowErrors({id:'pending',base:null,fields:itemFields({model:'Modelo a conferir',outcome:'pending'}),removed:false})).toEqual([]);});
});
