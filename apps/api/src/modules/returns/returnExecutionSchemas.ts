import { z } from 'zod';
import type { ReturnExecutionInputMap,ReturnBatchInput } from '@olist-crm/shared';
const id=z.string().uuid(),q=z.number().int().min(1).max(100000),text=z.string().trim().max(4000),required=text.min(1),ref=z.string().trim().min(1).max(250);
const occurred=z.string().datetime({offset:true}).refine(v=>Date.parse(v)<=Date.now()+60000,'O movimento não pode estar no futuro');
const base={requestId:id,version:q,evidenceId:id.nullable().optional()};
const schema=<T>(value:z.ZodType<T>)=>value;
export const batchSchema=schema<ReturnBatchInput>(z.object({requestId:id,manufacturer:z.string().trim().min(1).max(100),sentAt:occurred,dueAt:z.string().datetime({offset:true}),reference:ref,carrier:text,fromLocation:ref,lines:z.array(z.object({caseId:id,itemId:id,quantity:q,version:q}).strict()).min(1).max(100),mode:z.enum(['batch','individual']).optional(),state:z.enum(['assembling','sent']).optional(),lotReference:text.optional(),responsibleId:id.nullable().optional()}).strict().refine(i=>i.state==='assembling'||Boolean(i.carrier.trim()),'Saída física exige transportadora ou responsável pela entrega'));
export const batchLinesSchema=z.object({requestId:id,version:q,cases:z.array(z.object({id,version:q}).strict()).min(1).max(100),lines:z.array(z.object({caseId:id,itemId:id,quantity:q,version:q}).strict()).min(1).max(100)}).strict();
export const batchSendSchema=z.object({requestId:id,version:q,cases:z.array(z.object({id,version:q}).strict()).min(1).max(100),sentAt:occurred,reference:ref,carrier:ref,fromLocation:ref,dueAt:z.string().datetime({offset:true})}).strict();
export const batchCancelSchema=z.object({requestId:id,reason:required,cases:z.array(z.object({id,version:q}).strict()).min(1).max(100)}).strict();
export const executionSchemas={
 factory_result:schema<ReturnExecutionInputMap['factory_result']>(z.object({...base,lineId:id,quantity:q,decision:z.enum(['approved','refused']),compensation:z.enum(['replacement','credit','none']),reason:required,originalReport:required,translation:required,reference:ref,occurredAt:occurred,approvalReference:text}).strict()),
 physical_receipt:schema<ReturnExecutionInputMap['physical_receipt']>(z.object({...base,itemId:id,lineId:id.nullable(),resultId:id.nullable(),kind:z.enum(['original_returned','supplier_replacement','factory_retained','stock_replacement']),quantity:q,location:ref,receivedBy:ref,reference:ref,reason:required,approvalReference:text,occurredAt:occurred}).strict()),
 resolution:schema<ReturnExecutionInputMap['resolution']>(z.object({...base,itemId:id,resultId:id.nullable(),quantity:q,kind:z.enum(['credit','replacement','return_original','not_applicable']),reason:required,approvalReference:text}).strict()),
 credit_authorize:schema<ReturnExecutionInputMap['credit_authorize']>(z.object({...base,party:z.enum(['customer','supplier']),sourceId:id,amountCents:z.number().int().min(1).max(1000000000000),currency:z.enum(['BRL','USD','CNY']),priceBasis:required,approvalReference:ref,useCalculation:z.boolean().optional(),quoteRevision:z.string().nullable().optional()}).strict()),
 credit_post:schema<ReturnExecutionInputMap['credit_post']>(z.object({...base,creditId:id,officialSystem:ref,officialReference:ref,occurredAt:occurred}).strict()),
 credit_reverse:schema<ReturnExecutionInputMap['credit_reverse']>(z.object({...base,creditId:id,reason:required,officialSystem:text,officialReference:text,occurredAt:occurred}).strict()),
 delivery:schema<ReturnExecutionInputMap['delivery']>(z.object({...base,resolutionId:id,receiptId:id.nullable(),quantity:q,method:z.enum(['pickup','dispatch']),recipient:ref,tracking:text,reference:ref,sentAt:occurred,deliveryProof:text}).strict()),
 delivery_confirm:schema<ReturnExecutionInputMap['delivery_confirm']>(z.object({...base,deliveryId:id,occurredAt:occurred,recipient:ref,proof:ref}).strict()),
 disposition:schema<ReturnExecutionInputMap['disposition']>(z.object({...base,itemId:id,receiptId:id.nullable(),asset:z.enum(['original','replacement']),quantity:q,destination:z.enum(['technical_review','reconditioning','outlet','stock','china','disposal']),fromLocation:ref,toLocation:ref,custodian:ref,reference:ref,reason:required,testNotes:required,occurredAt:occurred}).strict()),
 disposition_confirm:schema<ReturnExecutionInputMap['disposition_confirm']>(z.object({...base,dispositionId:id,occurredAt:occurred,receivedBy:ref,proof:ref}).strict()),
 notice:schema<ReturnExecutionInputMap['notice']>(z.object({...base,channel:z.enum(['whatsapp','phone','email','in_person']),recipient:ref,summary:required,reference:ref,occurredAt:occurred}).strict()),
 review:schema<ReturnExecutionInputMap['review']>(z.object({...base,reason:required}).strict()),
 review_resolve:schema<ReturnExecutionInputMap['review_resolve']>(z.object({...base,reviewId:id,resolution:required}).strict()),
 close:schema<ReturnExecutionInputMap['close']>(z.object({...base,reason:required}).strict()),
 reopen:schema<ReturnExecutionInputMap['reopen']>(z.object({...base,reason:required}).strict()),
 void_record:schema<ReturnExecutionInputMap['void_record']>(z.object({...base,recordType:z.enum(['result','receipt','resolution','delivery','disposition']),recordId:id,reason:required}).strict()),
} satisfies {[K in keyof ReturnExecutionInputMap]:z.ZodType<ReturnExecutionInputMap[K]>};
export const executionOperation=z.enum(Object.keys(executionSchemas) as [keyof ReturnExecutionInputMap,...Array<keyof ReturnExecutionInputMap>]);
