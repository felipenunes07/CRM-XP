import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ReturnTask,ReturnWork} from '@olist-crm/shared';
const viewer=vi.hoisted(()=>({id:'rick',permissions:['returns.view','returns.manage']}));
vi.mock('../hooks/useAuth',()=>({useAuth:()=>({user:{id:viewer.id}})}));
vi.mock('../hooks/usePermissions',()=>({usePermissions:()=>({canAccess:(p:string)=>viewer.permissions.includes(p)})}));
import {ReturnWorkSummary,taskRelation} from './ReturnWorkSummary';
const task=(id:string,owner:string|null,team:ReturnTask['team']='returns.manage',state:ReturnTask['state']='action'):ReturnTask=>({id,title:id,description:'Teste',owner:owner?{id:owner,name:owner}:null,team,state,dueAt:null,target:{section:'resolver',area:'technical'}});
describe('whose turn is visible',()=>{
 it('highlights the actual assigned technician while preserving parallel work',()=>{viewer.id='rick';viewer.permissions=['returns.view','returns.manage'];const work:ReturnWork={phase:'Em resolução',coordinator:{id:'isis',name:'Isis'},tasks:[task('Recondicionar','kevin'),task('Retestar','rick'),task('Crédito',null,'returns.finance')]};const text=renderToStaticMarkup(<ReturnWorkSummary work={work} onOpen={()=>{}}/>);expect(text).toContain('É sua vez: Retestar');expect(text).toContain('kevin');expect(text).toContain('Financeiro');expect(text).toContain('Coordenação:');});
 it('distinguishes team capability from personal assignment and external waits',()=>{const can=(p:string)=>p==='returns.finance';expect(taskRelation(task('credit',null,'returns.finance'),'finance',can)).toBe('team');expect(taskRelation(task('factory','rick','returns.logistics','external_wait'),'rick',()=>true)).toBe('waiting');expect(taskRelation(task('other','kevin'),'rick',()=>true)).toBe('other');});
 it('makes assigning a missing technician an actual action for the coordinator',()=>{expect(taskRelation(task('assign','isis','returns.manage','unassigned'),'isis',()=>true)).toBe('mine');});
});
