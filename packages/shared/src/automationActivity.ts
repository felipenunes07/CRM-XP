export type AutomationActivityStatus = "SENT" | "PENDING" | "SENDING" | "PAUSED" | "FAILED" | "SKIPPED" | "BLOCKED_RECENT" | "PENDING_APPROVAL";
export type AutomationActivityFilter = "ALL" | "SENT" | "WAITING" | "FAILED" | "NOT_SENT" | "PENDING_APPROVAL";
export type AutomationActivityKind = "ALL" | "REACTIVATION" | "PROSPECT" | "CUSTOM";
export interface AutomationActivityQuery {
  date: string;
  status?: AutomationActivityFilter;
  kind?: AutomationActivityKind;
  search?: string;
  runId?: string;
  limit?: number;
  offset?: number;
}
export interface AutomationActivityItem {
  id: string;
  runId: string | null;
  customerId: string | null;
  customerCode: string | null;
  customerName: string;
  groupName: string;
  groupJid: string;
  ruleName: string;
  kind: Exclude<AutomationActivityKind, "ALL">;
  status: AutomationActivityStatus;
  eventAt: string;
  sentAt: string | null;
  scheduledFor: string | null;
  message: string | null;
  lastError: string | null;
}
export interface AutomationActivityResponse {
  date: string;
  summary: { sent: number; waiting: number; failed: number; notSent: number; awaitingApproval: number };
  items: AutomationActivityItem[];
  total: number;
}
