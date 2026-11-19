export type ReturnFactoryWorkflow='vv_batch'|'external_individual'|'internal';
export interface ReturnFactoryProfile {code:string;name:string;aliases:string[];workflow:ReturnFactoryWorkflow;defaultAssigneeId:string|null;instructions:string;isActive:boolean;version:number}
export const RETURN_FACTORY_WORKFLOW_LABELS={vv_batch:'VV · formação de lote e análise da fábrica',external_individual:'Encaminhamento individual da fábrica',internal:'Análise interna direta'} as const;
export function normalizeFactoryToken(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
export function isAnalysisSeal(value:string){const text=value.trim().toUpperCase();return ['J','S','Y','JSY','J/S/Y'].includes(text)||/(?:^|[\s,;/\[\]-])[JSY](?:$|[\s,;/\[\]-])/.test(text);}
export function findFactoryProfile(profiles:ReturnFactoryProfile[],manufacturer:string,code?:string){
 const token=normalizeFactoryToken(manufacturer);
 const named=profiles.find(p=>p.code!=='OTHER'&&p.code!=='UNKNOWN'&&[p.code,p.name,...p.aliases].some(alias=>normalizeFactoryToken(alias)===token));
 return named??profiles.find(p=>p.code===code)??profiles.find(p=>p.code==='OTHER');
}
export interface ReturnTransitionSettings {sourcePath:string;sourceEnabled:boolean;authority:'parallel'|'crm';version:number;cutoverAt:string|null;cutoverReason:string;lastCheckedAt:string|null;lastSuccessAt:string|null;lastError:string}
export interface ReturnLegacyRevision {id:string;sourcePath:string;sourceRevision:string;sourceModifiedAt:string;importedAt:string;rowCount:number}
export interface ReturnLegacyRow {id:string;sheet:string;rowNumber:number;fingerprint:string;document:string;customerCode:string;customerName:string;occurredOn:string;sku:string;description:string;signedQuantity:number;amountCents:number;rawStatus:string;rawPayload:Record<string,unknown>;linkedCaseId:string|null;conflict:boolean}
export interface ReturnLegacyPage {settings:ReturnTransitionSettings;revision:ReturnLegacyRevision|null;items:Array<ReturnLegacyRow&{exclusionReason:string|null}>;total:number;page:number;unresolved:number;conflicts:Array<{id:string;caseId:string;sourceRevision:string;document:string;rowNumber:number}>}
