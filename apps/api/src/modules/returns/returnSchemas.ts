import { z } from "zod";
import { RETURN_OUTCOME_LABELS } from "@olist-crm/shared";

const text = (max: number) => z.string().trim().max(max);
const quantity = z.number().int().min(1).max(100000);
const timestamp = z.string().datetime({ offset: true });
export const returnIdSchema = z.string().uuid();
export const receiptSchema = z.object({
  requestId: returnIdSchema,
  customerId: returnIdSchema,
  receivedAt: timestamp.refine(value => new Date(value).getTime() <= Date.now() + 60000, "Recebimento não pode estar no futuro"),
  declaredQuantity: z.number().int().min(0).max(100000).nullable(),
  receivedQuantity: quantity,
  volumes: quantity,
  location: text(250).min(1),
  notes: text(4000),
}).strict();
export const assignmentSchema = z.object({
  version: quantity,
  assigneeId: returnIdSchema.nullable(),
  dueAt: timestamp.nullable(),
  nextAction: text(500).min(1),
  location: text(250).min(1),
  receivedQuantity: quantity,
  correctionReason: text(2000),
}).strict();
export const itemSchema = z.object({
  version: quantity,
  model: text(500), sku: text(100), quantity,
  frame: text(50), color: text(100), manufacturer: text(100),
  outcome: z.enum(Object.keys(RETURN_OUTCOME_LABELS) as [keyof typeof RETURN_OUTCOME_LABELS, ...Array<keyof typeof RETURN_OUTCOME_LABELS>]),
  reason: text(2000), testNotes: text(4000),
  factoryCode:text(30).optional(),seal:text(100).optional(),routingOverride:text(2000).optional(),reasonCode:text(250).optional(),
  customerReportedDefect:text(2000).optional(),customerEvidenceReference:text(1000).optional(),testFinding:z.enum(['reproduced','not_reproduced','not_tested']).optional(),
}).strict().superRefine((item, ctx) => {
  const required = (key: "model" | "testNotes" | "reason" | "manufacturer", message: string) => {
    if (!item[key]) ctx.addIssue({ code: "custom", path: [key], message });
  };
  if (!["pending", "review"].includes(item.outcome)) {
    required("model", "Identifique o modelo");
    required("testNotes", "Registre o teste ou a inspeção realizada");
    required("manufacturer", "Identifique a fábrica ou origem da peça");
  }
  if (["refused", "no_defect", "resale"].includes(item.outcome)&&!item.reasonCode) required("reason", "Informe o motivo");
  if (item.outcome === "external_analysis") required("manufacturer", "Informe a fábrica");
});
export const actionSchema = z.object({
  version: quantity,
  action: z.enum(["start_triage", "complete_triage", "reopen_triage"]),
  reason: text(2000).default(""),
}).strict().refine(value => value.action !== "reopen_triage" || Boolean(value.reason), "Informe o motivo da reabertura");
export const itemSheetSchema=z.object({requestId:returnIdSchema,version:quantity,changes:z.array(z.union([
  z.object({kind:z.enum(['add','update']),id:returnIdSchema,fields:z.record(z.unknown())}).strict(),
  z.object({kind:z.literal('remove'),id:returnIdSchema}).strict(),
])).min(1).max(100)}).strict().refine(v=>new Set(v.changes.map(c=>c.id)).size===v.changes.length,'A mesma linha aparece mais de uma vez');
export const queueSchema = z.object({
  search: text(150).default(""),
  stage: z.enum(["active", "all", "received", "triage", "triage_completed", "closed", "overdue"]).default("active"),
  mine: z.enum(["true", "false"]).default("false"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  factory:z.string().regex(/^[A-Z0-9_]*$/).max(30).default(''),
});
export const attachmentSchema = z.object({
  version: quantity,
  name: text(200).min(1).refine(value => !/[\\/\x00-\x1f]/.test(value), "Nome de arquivo inválido"),
  contentType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  contentBase64: z.string().min(4).max(6990508).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict();
