import type { MessageAutomationRunStatus, MessageAutomationSendMode, SegmentDefinition } from "@olist-crm/shared";

export type InactivityAutomationStageId = "ATTENTION_1" | "ATTENTION_2" | "INACTIVE_1" | "INACTIVE_2";

export interface InactivityAutomationStage {
  id: InactivityAutomationStageId;
  label: string;
  description: string;
  status: SegmentDefinition["status"];
  minDaysInactive: number;
  maxDaysInactive?: number;
}

export const INACTIVITY_AUTOMATION_STAGES: InactivityAutomationStage[] = [
  {
    id: "ATTENTION_1",
    label: "Atencao 1",
    description: "30-59 dias sem comprar",
    status: ["ATTENTION"],
    minDaysInactive: 30,
    maxDaysInactive: 59,
  },
  {
    id: "ATTENTION_2",
    label: "Atencao 2",
    description: "60-89 dias sem comprar",
    status: ["ATTENTION"],
    minDaysInactive: 60,
    maxDaysInactive: 89,
  },
  {
    id: "INACTIVE_1",
    label: "Inativo 1",
    description: "90-179 dias sem comprar",
    status: ["INACTIVE"],
    minDaysInactive: 90,
    maxDaysInactive: 179,
  },
  {
    id: "INACTIVE_2",
    label: "Inativo 2",
    description: "180+ dias sem comprar",
    status: ["INACTIVE"],
    minDaysInactive: 180,
  },
];

export function buildInactivitySegmentDefinition(stageId: InactivityAutomationStageId): SegmentDefinition {
  const stage = INACTIVITY_AUTOMATION_STAGES.find((entry) => entry.id === stageId);

  if (!stage) {
    throw new Error(`Unknown inactivity automation stage: ${stageId}`);
  }

  return {
    status: stage.status,
    minDaysInactive: stage.minDaysInactive,
    ...(stage.maxDaysInactive === undefined ? {} : { maxDaysInactive: stage.maxDaysInactive }),
  };
}

export function resolveEligibleRunStatus(sendMode: MessageAutomationSendMode): MessageAutomationRunStatus {
  return sendMode === "AUTOMATIC" ? "ENQUEUED" : "PENDING_APPROVAL";
}

export function buildStageEntryEventKey(definition: SegmentDefinition): string {
  const status = definition.status?.[0] ?? "ANY";
  const minDays = definition.minDaysInactive ?? "any";
  const maxDays = definition.maxDaysInactive ?? "any";

  return `stage-entry:${status}:${minDays}:${maxDays}`;
}

export function filterUnhandledStageEntryCustomerIds(customerIds: string[], handledCustomerIds: Set<string>) {
  return customerIds.filter((customerId) => !handledCustomerIds.has(customerId));
}
