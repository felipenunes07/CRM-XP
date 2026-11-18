import {describe,it,expect} from 'vitest';
import {centsFromInput} from './returnMoney';
describe('return credit decimal input',()=>{
 it('converts decimal digits to exact cents without floating point rounding',()=>{
  expect(centsFromInput('125,50')).toBe(12550);expect(centsFromInput('0.29')).toBe(29);
  expect(centsFromInput(' 9,9 ')).toBe(990);expect(centsFromInput('125')).toBe(12500);
 });
 it('rejects ambiguous thousands, fractional cents, negative values and overflow',()=>{
  for(const raw of ['1.234,56','1,234.56','0.001','1e3','-1','0','Infinity','99999999999'])expect(()=>centsFromInput(raw)).toThrow();
 });
});
