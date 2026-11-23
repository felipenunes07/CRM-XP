import {describe,it,expect} from 'vitest';
import type {ReturnDetail} from '@olist-crm/shared';
import {deriveReturnWork} from './returnWork.js';
const isis={id:'isis',name:'Isis'},rick={id:'rick',name:'Rick'},kevin={id:'kevin',name:'Kevin'};
function detail():ReturnDetail{return {id:'case',stage:'triage_completed',assignee:kevin,items:[{id:'item',model:'IP11',quantity:5,outcome:'approved'}],execution:{factoryLines:[],results:[],receipts:[],resolutions:[],credits:[],deliveries:[],dispositions:[],notices:[],reviews:[],pools:[],progress:{canClose:false,customerComplete:false,internalPendingQuantity:5,financePendingCount:0,blockers:[]}}} as unknown as ReturnDetail;}
describe('responsibilities from real work',()=>{
 it('keeps two parallel technicians despite the case assignee being overwritten',()=>{
  const d=detail();d.execution.dispositions=[{id:'inspect',itemId:'item',quantity:3,destination:'technical_review',completedAt:null,voidedAt:null},{id:'repair',itemId:'item',quantity:2,destination:'reconditioning',completedAt:null,voidedAt:null}] as any;
  const job=(id:string,assignee:typeof rick,kind:'inspection'|'repair')=>({id,caseId:d.id,dispositionId:id,kind,assignee,coordinator:isis,dueAt:'2026-12-10T12:00:00Z',completedAt:null});
  const jobs=[job('inspect',rick,'inspection'),job('repair',kevin,'repair')];let work=deriveReturnWork(d,isis,jobs);expect(work.tasks.filter(t=>t.id.startsWith('job-')).map(t=>t.owner?.name)).toEqual(['Rick','Kevin']);
  jobs[0]!.completedAt='2026-11-23T12:00:00Z' as any;work=deriveReturnWork(d,isis,jobs);expect(work.tasks.find(t=>t.id==='physical-inspect')?.owner).toEqual(isis);expect(work.tasks.find(t=>t.id==='job-repair')?.owner).toEqual(kevin);
  d.execution.dispositions[1]!.voidedAt='2026-11-23T12:00:00Z';expect(deriveReturnWork(d,isis,jobs).tasks.some(t=>t.id==='job-repair')).toBe(false);
 });
 it('names the batch follower while distinguishing external wait and finance team',()=>{
  const d=detail();d.items[0]!.outcome='external_analysis';d.execution.factoryLines=[{id:'line',batchId:'batch',itemId:'item',quantity:5,state:'sent',voidedAt:null,responsibleId:'lucas',responsibleName:'Lucas',manufacturer:'D.E.',batchCode:'EF-1'}] as any;
  d.execution.results=[{id:'result',lineId:'line',itemId:'item',quantity:1,compensation:'credit',voidedAt:null}] as any;
  const work=deriveReturnWork(d,isis,[]);expect(work.tasks.find(t=>t.id==='batch-batch')).toMatchObject({state:'external_wait',owner:{name:'Lucas'}});expect(work.tasks.find(t=>t.id==='supplier-credit-result')).toMatchObject({owner:null,team:'returns.finance',state:'action'});
 });
 it('requires a new repair after inspection recommends recovery, then hands physical confirmation back',()=>{
  const d=detail();d.execution.dispositions=[{id:'same',itemId:'item',quantity:5,destination:'reconditioning',completedAt:null,voidedAt:null}] as any;
  const inspection={id:'inspection',caseId:d.id,dispositionId:'same',kind:'inspection' as const,assignee:rick,coordinator:isis,dueAt:'2026-12-10T12:00:00Z',completedAt:'2026-11-23T12:00:00Z'};
  let work=deriveReturnWork(d,isis,[inspection]);expect(work.tasks.find(t=>t.id==='assign-same')?.title).toBe('Atribuir recondicionamento');expect(work.tasks.some(t=>t.id==='physical-same')).toBe(false);
  const repair={...inspection,id:'repair',kind:'repair' as const,assignee:kevin,completedAt:null as string|null};work=deriveReturnWork(d,isis,[inspection,repair]);expect(work.tasks.find(t=>t.id==='job-repair')?.owner).toEqual(kevin);
  repair.completedAt='2026-11-23T13:00:00Z';work=deriveReturnWork(d,isis,[inspection,repair]);expect(work.tasks.find(t=>t.id==='physical-same')?.owner).toEqual(isis);
 });
 it('does not fabricate assignments or hide stock and historical blockers',()=>{
  const d=detail();d.execution.dispositions=[{id:'unassigned',itemId:'item',quantity:5,destination:'technical_review',voidedAt:null,completedAt:null}] as any;
  d.execution.progress.stockPending=true;d.execution.progress.legacyConflict=true;const work=deriveReturnWork(d,null,[]);expect(work.coordinator).toBeNull();expect(work.tasks.find(t=>t.id==='assign-unassigned')?.state).toBe('unassigned');expect(work.tasks.map(t=>t.id)).toContain('stock');expect(work.tasks.map(t=>t.id)).toContain('legacy');expect(work.tasks.map(t=>t.id)).not.toContain('close');
 });
 it('shows the real next handoff during triage and no pending task on a closed case',()=>{
  const d=detail();d.stage='triage';d.assignee=rick;d.dueAt='2026-12-10T12:00:00Z';expect(deriveReturnWork(d,isis,[]).tasks[0]!).toMatchObject({owner:rick,target:{section:'testar'}});expect(deriveReturnWork(d,isis,[]).tasks[0]!.description).toContain('Isis');d.stage='closed';expect(deriveReturnWork(d,isis,[]).tasks).toEqual([]);
 });
});
