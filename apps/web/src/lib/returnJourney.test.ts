import {describe,it,expect} from 'vitest';
import type {ReturnDetail} from '@olist-crm/shared';
import {returnNextStep} from './returnJourney';
const fixture=()=>({stage:'triage_completed',receivedQuantity:1,itemQuantity:1,pendingQuantity:0,items:[{id:'item',quantity:1}],execution:{pools:[],receipts:[],resolutions:[],results:[],credits:[],factoryLines:[],deliveries:[],dispositions:[],progress:{canClose:false,factoryPendingQuantity:0,financePendingCount:0,internalPendingQuantity:0,supplierPendingQuantity:0,customerComplete:false}}} as unknown as ReturnDetail);
describe('next action for a return',()=>{
 it('asks for a responsible technician before suggesting tests',()=>{const d=fixture();d.stage='received';expect(returnNextStep(d).step).toBe('receber');d.assignee={id:'tech',name:'Rick'};d.dueAt='2026-12-10T12:00:00Z';expect(returnNextStep(d).step).toBe('testar');});
 it('prioritizes a factory decision over customer settlement',()=>{const d=fixture();d.execution.progress.factoryPendingQuantity=1;d.execution.pools=[{remainingQuantity:1} as any];expect(returnNextStep(d).area).toBe('factory');});
 it('sends an original ready for pickup to delivery instead of repair',()=>{const d=fixture();d.execution.progress.internalPendingQuantity=1;d.execution.resolutions=[{id:'solution',itemId:'item',kind:'return_original',quantity:1,voidedAt:null} as any];expect(returnNextStep(d).step).toBe('entregar');});
 it('does not suggest delivery while the original is still at the factory',()=>{const d=fixture();d.execution.progress.internalPendingQuantity=1;d.execution.resolutions=[{id:'solution',itemId:'item',kind:'return_original',quantity:1,voidedAt:null} as any];d.execution.factoryLines=[{itemId:'item',quantity:1,voidedAt:null} as any];expect(returnNextStep(d).step).toBe('resolver');});
 it('shows financial confirmation before claiming readiness to close',()=>{const d=fixture();d.execution.progress.financePendingCount=1;expect(returnNextStep(d).area).toBe('finance');d.execution.progress.canClose=true;expect(returnNextStep(d).step).toBe('concluir');});
 it('keeps an already closed case at its conclusion',()=>{const d=fixture();d.stage='closed';expect(returnNextStep(d).title).toBe('Atendimento concluído');});
 it('asks for the factory return rather than internal repair when originals are still outside',()=>{const d=fixture();d.execution.factoryLines=[{id:'line',itemId:'item',state:'sent',quantity:1,voidedAt:null} as any];d.execution.progress.internalPendingQuantity=1;expect(returnNextStep(d).area).toBe('factory');});
 it('routes an unrecorded supplier credit to finance',()=>{const d=fixture();d.execution.results=[{id:'result',compensation:'credit',voidedAt:null} as any];expect(returnNextStep(d).area).toBe('finance');});
});
