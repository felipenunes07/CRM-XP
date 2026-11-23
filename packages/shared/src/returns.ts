export const RETURN_STAGE_LABELS = {
  received: "Recebido",
  triage: "Em triagem",
  triage_completed: "Triagem concluída",
  closed: "Encerrado",
} as const;

export const RETURN_OUTCOME_LABELS = {
  pending: "A identificar / testar",
  approved: "Troca aprovada",
  refused: "Recusada",
  external_analysis: "Análise de fábrica",
  no_defect: "Sem defeito constatado — devolver",
  resale: "Conferência para vender de novo",
  review: "Revisão técnica pendente",
} as const;

export type ReturnStage = keyof typeof RETURN_STAGE_LABELS;
export type ReturnOutcome = keyof typeof RETURN_OUTCOME_LABELS;
export interface ReturnPerson { id: string; name: string; canTriage?:boolean;canLogistics?:boolean }
export interface ReturnCustomer { id: string; code: string | null; name: string }
export interface ReturnReceiptInput {
  requestId: string;
  customerId: string;
  receivedAt: string;
  declaredQuantity: number | null;
  receivedQuantity: number;
  volumes: number;
  location: string;
  notes: string;
}
export interface ReturnAssignmentInput {
  version: number;
  assigneeId: string | null;
  dueAt: string | null;
  nextAction: string;
  location: string;
  receivedQuantity: number;
  correctionReason: string;
}
export interface ReturnItemInput {
  reasonCode?:string;
  customerReportedDefect?:string;
  customerEvidenceReference?:string;
  testFinding?:'reproduced'|'not_reproduced'|'not_tested';
  version: number;
  model: string;
  sku: string;
  quantity: number;
  frame: string;
  color: string;
  manufacturer: string;
  outcome: ReturnOutcome;
  reason: string;
  testNotes: string;
  factoryCode?:string;
  seal?:string;
  routingOverride?:string;
}
export interface ReturnItem extends Omit<ReturnItemInput, "version"> { id: string;factoryWorkflow?:import('./returnFactories.js').ReturnFactoryWorkflow }
export interface ReturnCase {
  id: string;
  protocol: string;
  customer: ReturnCustomer;
  stage: ReturnStage;
  receivedAt: string;
  receiverName: string;
  declaredQuantity: number | null;
  receivedQuantity: number;
  volumes: number;
  location: string;
  notes: string;
  assignee: ReturnPerson | null;
  dueAt: string | null;
  nextAction: string;
  version: number;
  itemQuantity: number;
  pendingQuantity: number;
  overdue: boolean;
  updatedAt: string;
  closedAt: string | null;
  progress?: ReturnProgress;
}
export interface ReturnAttachment { id: string; name: string; contentType: string; size: number; createdAt: string; authorName: string }
export interface ReturnEvent { id: string; action: string; authorName: string; createdAt: string; data: Record<string, unknown> }
export interface ReturnDetail extends ReturnCase { items: ReturnItem[]; attachments: ReturnAttachment[]; events: ReturnEvent[]; execution: ReturnExecution }
export interface ReturnQueue {
  items: ReturnCase[];
  total: number;
  page: number;
  summary: { received: number; triage: number; triageCompleted: number; overdue: number; closed: number };
}

export const RETURN_REMEDY_LABELS = { credit:"Crédito ao cliente", sale_cancellation:"Cancelamento de venda", replacement:"Entregar substituta", return_original:"Devolver peça original", not_applicable:"Sem obrigação com o cliente · autorizado" } as const;
export const RETURN_RECEIPT_LABELS = { original_returned:"Original recebida da fábrica", supplier_replacement:"Substituta recebida da fábrica", factory_retained:"Original retida definitivamente na fábrica", stock_replacement:"Substituta separada do estoque XP" } as const;
export const RETURN_DESTINATION_LABELS = { technical_review:"Separação e reteste interno", reconditioning:"Recondicionamento", outlet:"Outlet", stock:"Estoque após conferência", china:"Envio à China", disposal:"Descarte autorizado" } as const;
export interface ReturnCommand { requestId: string; version: number; evidenceId?:string|null }
export interface ReturnFact { id: string; caseId: string; itemId: string; quantity: number; createdAt: string; authorName: string; voidedAt: string | null }
export interface ReturnFactoryLine { id: string; batchId: string; caseId: string; itemId: string; quantity: number; batchCode: string; manufacturer: string; dueAt: string; sentAt: string|null; reference: string; voidedAt: string | null;state:'assembling'|'sent';mode:'batch'|'individual';lotReference:string }
export interface ReturnFactoryResult extends ReturnFact { lineId: string; decision: "approved"|"refused"; compensation: "replacement"|"credit"|"none"; reason: string; originalReport: string; translation: string; reference: string; occurredAt: string; approvalReference: string }
export interface ReturnPhysicalReceipt extends ReturnFact { lineId: string|null; resultId: string|null; kind: keyof typeof RETURN_RECEIPT_LABELS; location: string; receivedBy: string; reference: string; reason: string; occurredAt: string; approvalReference: string }
export interface ReturnResolution extends ReturnFact { resultId: string|null; kind: keyof typeof RETURN_REMEDY_LABELS; reason: string; approvalReference: string }
export interface ReturnCredit { id: string; caseId: string; itemId: string; resolutionId: string|null; resultId: string|null; party: "customer"|"supplier"; amountCents: number; currency: "BRL"|"USD"|"CNY"; priceBasis: string; approvalReference: string; status: "approved"|"posted"|"voided"|"reversed"; officialSystem: string; officialReference: string; postedAt: string|null; reversalReference: string; reversalReason: string; authorName: string; createdAt: string }
export interface ReturnDelivery extends ReturnFact { resolutionId: string; receiptId: string|null; method: "pickup"|"dispatch"; asset: "original"|"replacement"; recipient: string; tracking: string; reference: string; sentAt: string; deliveredAt: string|null; deliveryProof: string }
export interface ReturnDisposition extends ReturnFact { asset: "original"|"replacement"; receiptId: string|null; destination: keyof typeof RETURN_DESTINATION_LABELS; fromLocation: string; toLocation: string; custodian: string; reference: string; reason: string; testNotes: string; occurredAt: string; completedAt: string|null; completionProof: string; receivedBy: string }
export interface ReturnNotice { id: string; channel: "whatsapp"|"phone"|"email"|"in_person"; recipient: string; summary: string; reference: string; occurredAt: string; authorName: string }
export interface ReturnReview { id: string; reason: string; authorName: string; createdAt: string; resolvedAt: string|null; resolution: string }
export interface ReturnSourcePool { key: string; itemId: string; resultId: string|null; model: string; outcome: string; quantity: number; remainingQuantity: number }
export interface ReturnProgress { factoryPendingQuantity: number; supplierPendingQuantity: number; customerPendingQuantity: number; financePendingCount: number; deliveryPendingQuantity: number; internalPendingQuantity: number; reviewCount: number; customerComplete: boolean; internalComplete: boolean; canClose: boolean; blockers: string[] }
export interface ReturnExecution { factoryLines: ReturnFactoryLine[]; results: ReturnFactoryResult[]; receipts: ReturnPhysicalReceipt[]; resolutions: ReturnResolution[]; credits: ReturnCredit[]; deliveries: ReturnDelivery[]; dispositions: ReturnDisposition[]; notices: ReturnNotice[]; reviews: ReturnReview[]; pools: ReturnSourcePool[]; progress: ReturnProgress }
export interface ReturnFactoryAvailable { itemId: string; caseId: string; version: number; protocol: string; customerCode: string; customerName: string; model: string; manufacturer: string; availableQuantity: number }
export interface ReturnFactoryBatch { id: string; code: string; manufacturer: string; sentAt: string|null; dueAt: string; reference: string; carrier: string; fromLocation: string; authorName: string; voidedAt: string|null;state:'assembling'|'sent';mode:'batch'|'individual';lotReference:string;responsibleId:string|null;version:number; lines: Array<ReturnFactoryAvailable & { id: string; quantity: number; decidedQuantity: number }> }
export interface ReturnFactoryBatchList {items:ReturnFactoryBatch[];total:number;page:number}
export interface ReturnBatchInput { requestId:string; manufacturer:string; sentAt:string; dueAt:string; reference:string; carrier:string; fromLocation:string; lines:Array<{caseId:string;itemId:string;quantity:number;version:number}>;mode?:'batch'|'individual';state?:'assembling'|'sent';lotReference?:string;responsibleId?:string|null }
export interface ReturnExecutionInputMap {
 factory_result: ReturnCommand & {lineId:string;quantity:number;decision:"approved"|"refused";compensation:"replacement"|"credit"|"none";reason:string;originalReport:string;translation:string;reference:string;occurredAt:string;approvalReference:string};
 physical_receipt: ReturnCommand & {itemId:string;lineId:string|null;resultId:string|null;kind:ReturnPhysicalReceipt["kind"];quantity:number;location:string;receivedBy:string;reference:string;reason:string;approvalReference:string;occurredAt:string};
 resolution: ReturnCommand & {itemId:string;resultId:string|null;quantity:number;kind:ReturnResolution["kind"];reason:string;approvalReference:string};
 credit_authorize: ReturnCommand & {party:"customer"|"supplier";sourceId:string;amountCents:number;currency:ReturnCredit["currency"];priceBasis:string;approvalReference:string;useCalculation?:boolean;quoteRevision?:string|null};
 credit_post: ReturnCommand & {creditId:string;officialSystem:string;officialReference:string;occurredAt:string};
 credit_reverse: ReturnCommand & {creditId:string;reason:string;officialSystem:string;officialReference:string;occurredAt:string};
 delivery: ReturnCommand & {resolutionId:string;receiptId:string|null;quantity:number;method:"pickup"|"dispatch";recipient:string;tracking:string;reference:string;sentAt:string;deliveryProof:string};
 delivery_confirm: ReturnCommand & {deliveryId:string;occurredAt:string;recipient:string;proof:string};
 disposition: ReturnCommand & {itemId:string;receiptId:string|null;asset:"original"|"replacement";quantity:number;destination:ReturnDisposition["destination"];fromLocation:string;toLocation:string;custodian:string;reference:string;reason:string;testNotes:string;occurredAt:string};
 disposition_confirm: ReturnCommand & {dispositionId:string;occurredAt:string;receivedBy:string;proof:string};
 notice: ReturnCommand & {channel:ReturnNotice["channel"];recipient:string;summary:string;reference:string;occurredAt:string};
 review: ReturnCommand & {reason:string};
 review_resolve: ReturnCommand & {reviewId:string;resolution:string};
 close: ReturnCommand & {reason:string};
 reopen: ReturnCommand & {reason:string};
 void_record: ReturnCommand & {recordType:"result"|"receipt"|"resolution"|"delivery"|"disposition";recordId:string;reason:string};
}
