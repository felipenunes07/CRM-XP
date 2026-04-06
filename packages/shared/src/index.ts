export type SourceSystem = "history_xls" | "olist_v2" | "supabase_2026";

export type CustomerStatus = "ACTIVE" | "ATTENTION" | "INACTIVE";

export interface CustomerLabel {
  id: string;
  name: string;
  color: string;
}

export type InsightTag =
  | "alto_valor"
  | "reativacao"
  | "recorrente"
  | "queda_frequencia"
  | "risco_churn"
  | "compra_prevista_vencida"
  | "novo_cliente";

export interface DashboardMetrics {
  totalCustomers: number;
  statusCounts: Record<CustomerStatus, number>;
  inactivityBuckets: Array<{
    label: string;
    count: number;
  }>;
  averageTicket: number;
  averageFrequencyDays: number;
  lastSyncAt: string | null;
  topCustomers: CustomerListItem[];
  dailyAgendaCount: number;
}

export interface CustomerListItem {
  id: string;
  customerCode: string;
  displayName: string;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number | null;
  totalOrders: number;
  totalSpent: number;
  avgTicket: number;
  status: CustomerStatus;
  priorityScore: number;
  valueScore: number;
  primaryInsight: InsightTag | null;
  insightTags: InsightTag[];
  lastAttendant: string | null;
  labels: CustomerLabel[];
}

export interface CustomerDetail extends CustomerListItem {
  totalOrders: number;
  avgDaysBetweenOrders: number | null;
  purchaseFrequency90d: number;
  frequencyDropRatio: number;
  predictedNextPurchaseAt: string | null;
  internalNotes: string;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    orderDate: string;
    sourceSystem: SourceSystem;
    totalAmount: number;
    status: string;
    itemCount: number;
  }>;
}

export interface MessageTemplate {
  id: string;
  category: "reativacao" | "follow_up" | "promocao";
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SegmentDefinition {
  status?: CustomerStatus[];
  minDaysInactive?: number;
  maxDaysInactive?: number;
  minAvgTicket?: number;
  minTotalSpent?: number;
  frequencyDropRatio?: number;
  newCustomersWithinDays?: number;
  stoppedTopCustomers?: boolean;
  labels?: string[];
  excludeLabels?: string[];
}

export interface SegmentResult {
  summary: {
    totalCustomers: number;
    averagePriorityScore: number;
    potentialRecoveredRevenue: number;
    potentialRecoveredPieces: number;
  };
  customers: CustomerListItem[];
}

export interface AgendaItem extends CustomerListItem {
  avgDaysBetweenOrders: number | null;
  predictedNextPurchaseAt: string | null;
  suggestedAction: string;
  reason: string;
}
