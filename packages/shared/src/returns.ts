export const RETURN_STAGE_LABELS = {
  received: "Recebido",
  triage: "Em triagem",
  triage_completed: "Triagem concluída",
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
export interface ReturnPerson { id: string; name: string }
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
}
export interface ReturnItem extends Omit<ReturnItemInput, "version"> { id: string }
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
}
export interface ReturnAttachment { id: string; name: string; contentType: string; size: number; createdAt: string; authorName: string }
export interface ReturnEvent { id: string; action: string; authorName: string; createdAt: string; data: Record<string, unknown> }
export interface ReturnDetail extends ReturnCase { items: ReturnItem[]; attachments: ReturnAttachment[]; events: ReturnEvent[] }
export interface ReturnQueue {
  items: ReturnCase[];
  total: number;
  page: number;
  summary: { received: number; triage: number; triageCompleted: number; overdue: number };
}
