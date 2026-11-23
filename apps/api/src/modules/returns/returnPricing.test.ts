import {describe,it,expect} from 'vitest';
import {calculateReturnUnit,exactCents,parseReturnPriceIndex} from './returnPricing.js';
import XLSX from 'xlsx';
describe('return credit spreadsheet rule',()=>{
 it('matches weighted sales ROUND to whole reais including signed return rows and half rounding',()=>{
  expect(calculateReturnUnit({quantity:'3',weightedCents:'14100',invalid:false},null).unitCents).toBe(4700);
  expect(calculateReturnUnit({quantity:'-2',weightedCents:'-9500',invalid:false},null).unitCents).toBe(4800);
  expect(calculateReturnUnit({quantity:'10',weightedCents:'47499',invalid:false},null).unitCents).toBe(4700);
 });
 it('uses catalogue cents only when the average has no denominator, and preserves missing versus zero',()=>{
  expect(calculateReturnUnit({quantity:'0',weightedCents:'1500',invalid:false},{unitCents:3610,ambiguous:false}).unitCents).toBe(3610);
  expect(calculateReturnUnit(null,{unitCents:3610,ambiguous:true}).unitCents).toBeNull();
  expect(calculateReturnUnit(null,{unitCents:0,ambiguous:false}).unitCents).toBeNull();
  expect(calculateReturnUnit(null,null).unitCents).toBeNull();
  expect(calculateReturnUnit({quantity:'2',weightedCents:'10000',invalid:true},{unitCents:3610,ambiguous:false}).unitCents).toBeNull();
 });
 it('honors the spreadsheet NOVO boundary and rejects unexpected monetary precision',()=>{
  expect(calculateReturnUnit(null,{unitCents:250000,ambiguous:false}).unitCents).toBe(250000);
  expect(calculateReturnUnit(null,{unitCents:250001,ambiguous:false}).issue).toContain('NOVO');
  expect(exactCents(36.10)).toBe(3610n);expect(exactCents(36.123)).toBeNull();
 });
 it('rejects unknown formulas instead of silently applying a different financial rule',()=>{
  const b=XLSX.utils.book_new();for(const s of ['VL MANUAL','VL AUTO','OUT','SISTEMA'])XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['COD']]),s);
  expect(()=>parseReturnPriceIndex(b)).toThrow('fórmula');
 });
});
