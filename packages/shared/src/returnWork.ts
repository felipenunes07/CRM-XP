import type {ReturnPerson} from './returns.js';

export const RETURN_SECTIONS=[{key:'receber',label:'Recebimento'},{key:'testar',label:'Peças e testes'},{key:'resolver',label:'Trabalhos e resolução'},{key:'entregar',label:'Entrega'},{key:'concluir',label:'Conferência final'}] as const;
export type ReturnSection=typeof RETURN_SECTIONS[number]['key'];
export type ReturnWorkArea='customer'|'factory'|'technical'|'finance';
export interface ReturnTask {
 id:string; title:string; description:string;
 owner:ReturnPerson|null; team:'returns.manage'|'returns.logistics'|'returns.finance';
 state:'action'|'external_wait'|'blocked'|'unassigned'; dueAt:string|null;
 target:{section:ReturnSection;area?:ReturnWorkArea;entityId?:string};
}
export interface ReturnWork {coordinator:ReturnPerson|null;phase:string;tasks:ReturnTask[]}
export type ReturnItemChange=
 | {kind:'add'|'update';id:string;fields:Omit<import('./returns.js').ReturnItemInput,'version'>}
 | {kind:'remove';id:string};
export interface ReturnItemSheetInput {requestId:string;version:number;changes:ReturnItemChange[]}
