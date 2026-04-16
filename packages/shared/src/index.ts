export type SourceSystem = "history_xls" | "olist_v2" | "supabase_2026";

export type CustomerStatus = "ACTIVE" | "ATTENTION" | "INACTIVE";
export const AMBASSADOR_LABEL_NAME = "Embaixador";
export const AMBASSADOR_LABEL_COLOR = "#d09a29";

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
  agendaEligibleCount: number;
  reactivationLeaderboard: ReactivationLeaderboardEntry[];
  portfolioTrend: PortfolioTrendPoint[];
  salesPerformance: SalesPerformanceEntry[];
}

export interface SalesPerformanceEntry {
  attendant: string;
  totalOrders: number;
  uniqueCustomers: number;
  totalRevenue: number;
  totalItems: number;
}

export interface AttendantMetricSnapshot {
  revenue: number;
  orders: number;
  pieces: number;
  uniqueCustomers: number;
  avgTicket: number;
  piecesPerOrder: number;
  revenuePerCustomer: number;
  lastOrderAt: string | null;
}

export interface AttendantGrowthRatios {
  revenue: number | null;
  orders: number | null;
  pieces: number | null;
  uniqueCustomers: number | null;
  avgTicket: number | null;
  piecesPerOrder: number | null;
  revenuePerCustomer: number | null;
}

export interface AttendantPortfolioSnapshot {
  totalCustomers: number;
  statusCounts: Record<CustomerStatus, number>;
}

export interface AttendantTrendPoint {
  month: string;
  revenue: number;
  orders: number;
  pieces: number;
  uniqueCustomers: number;
}

export interface AttendantTopCustomer {
  customerId: string;
  customerCode: string;
  displayName: string;
  revenue: number;
  orders: number;
  pieces: number;
  lastOrderAt: string | null;
  status: CustomerStatus;
  priorityScore: number;
}

export interface AttendantSummary {
  totalAttendants: number;
  activeAttendants: number;
  currentPeriodRevenue: number;
  currentPeriodOrders: number;
  currentPeriodPieces: number;
  currentPeriodCustomers: number;
  previousPeriodRevenue: number;
  revenueGrowthRatio: number | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
}

export interface AttendantListItem {
  attendant: string;
  currentPeriod: AttendantMetricSnapshot;
  previousPeriod: AttendantMetricSnapshot;
  growth: AttendantGrowthRatios;
  portfolio: AttendantPortfolioSnapshot;
  monthlyTrend: AttendantTrendPoint[];
  topCustomers: AttendantTopCustomer[];
  topProducts: TopProduct[];
}

export interface AttendantsResponse {
  windowMonths: 3 | 6 | 12 | 24;
  summary: AttendantSummary;
  attendants: AttendantListItem[];
}

export interface ReactivationLeaderboardEntry {
  attendant: string;
  recoveredCustomers: number;
  recoveredRevenue: number;
  recoveredClients: ReactivationRecoveredClient[];
}

export interface ReactivationRecoveredClient {
  customerId: string;
  customerCode: string;
  displayName: string;
  status: CustomerStatus;
  priorityScore: number;
  previousOrderDate: string | null;
  reactivationOrderDate: string | null;
  daysInactiveBeforeReturn: number;
  reactivatedOrderAmount: number;
}

export interface AcquisitionSummary {
  today: number;
  yesterday: number;
  currentMonth: number;
  previousMonth: number;
  historicalTotal: number;
}

export interface AcquisitionDailyPoint {
  date: string;
  newCustomers: number;
}

export interface AcquisitionMonthlyPoint {
  month: string;
  newCustomers: number;
}

export interface NewCustomerListItem {
  customerId: string;
  customerCode: string;
  displayName: string;
  firstOrderDate: string;
  firstOrderAmount: number;
  firstAttendant: string | null;
}

export interface AcquisitionMetrics {
  summary: AcquisitionSummary;
  dailySeries: AcquisitionDailyPoint[];
  monthlySeries: AcquisitionMonthlyPoint[];
  recentCustomers: NewCustomerListItem[];
}

export interface PortfolioTrendPoint {
  date: string;
  totalCustomers: number;
  activeCount: number;
  attentionCount: number;
  inactiveCount: number;
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
  isAmbassador: boolean;
  ambassadorAssignedAt: string | null;
}

export interface CustomerDetail extends CustomerListItem {
  totalOrders: number;
  avgDaysBetweenOrders: number | null;
  purchaseFrequency90d: number;
  frequencyDropRatio: number;
  predictedNextPurchaseAt: string | null;
  internalNotes: string;
  topProducts: TopProduct[];
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

export interface CustomerDocInsightSummary {
  customersWithDoc: number;
  docOrders: number;
  docQuantity: number;
  docRevenue: number;
}

export interface CustomerDocInsightListItem {
  id: string;
  customerCode: string;
  displayName: string;
  status: CustomerStatus;
  docQuantity: number;
  docOrderCount: number;
  docRevenue: number;
  lastDocPurchaseAt: string | null;
}

export interface CustomerDocInsightsResponse {
  summary: CustomerDocInsightSummary;
  ranking: CustomerDocInsightListItem[];
}

export type CustomerCreditRiskLevel = "OK" | "MONITORAR" | "ATENCAO" | "CRITICO";
export type CustomerCreditOperationalState =
  | "OWES"
  | "HAS_CREDIT_BALANCE"
  | "SETTLED"
  | "UNUSED_CREDIT"
  | "OVER_CREDIT";

export interface CustomerCreditSnapshotMeta {
  id: string;
  sourceFileName: string;
  sourceFilePath: string;
  sourceFileUpdatedAt: string;
  sourceFileSizeBytes: number;
  importedAt: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
}

export interface CustomerCreditRow {
  id: string;
  customerId: string | null;
  customerCode: string;
  customerDisplayName: string;
  sourceDisplayName: string | null;
  matched: boolean;
  balanceAmount: number;
  debtAmount: number;
  creditBalanceAmount: number;
  creditLimit: number;
  availableCreditAmount: number;
  withinCreditLimit: boolean;
  operationalState: CustomerCreditOperationalState;
  riskLevel: CustomerCreditRiskLevel;
  observation: string;
  lastOrderDate: string | null;
  lastPaymentDate: string | null;
  daysSinceLastOrder: number | null;
  daysSinceLastPayment: number | null;
  paymentTerm: number | null;
  riskScore: number | null;
  flags: string[];
  hasOverCredit: boolean;
  hasOverduePayment: boolean;
  hasSeverelyOverduePayment: boolean;
  hasNoPayment: boolean;
  hasNoOrder: boolean;
  hasNegativeCredit: boolean;
  hasDebtWithoutCredit: boolean;
}

export interface CustomerCreditOverviewSummary {
  totalLinkedCustomers: number;
  totalUnmatchedRows: number;
  totalDebtAmount: number;
  totalCreditBalanceAmount: number;
  customersOwing: number;
  customersWithCreditLimit: number;
  customersWithUnusedCredit: number;
  customersCritical: number;
  customersAttention: number;
  customersMonitoring: number;
  customersOverCredit: number;
  customersOverdue: number;
}

export interface CustomerCreditOverviewResponse {
  snapshot: CustomerCreditSnapshotMeta | null;
  summary: CustomerCreditOverviewSummary;
  linkedRows: CustomerCreditRow[];
  unmatchedRows: CustomerCreditRow[];
}

export interface CustomerCreditDetailResponse {
  snapshot: CustomerCreditSnapshotMeta | null;
  row: CustomerCreditRow | null;
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
    monthlyPotentialRevenue: number;
    monthlyPotentialPieces: number;
  };
  customers: CustomerListItem[];
}

export interface AgendaItem extends CustomerListItem {
  avgDaysBetweenOrders: number | null;
  predictedNextPurchaseAt: string | null;
  suggestedAction: string;
  reason: string;
}

export interface AgendaResponse {
  items: AgendaItem[];
  totalEligible: number;
  hasMore: boolean;
}

export interface TopProduct {
  sku: string | null;
  itemDescription: string;
  totalQuantity: number;
  orderCount: number;
  lastBoughtAt: string | null;
}

export interface SavedSegment {
  id: string;
  name: string;
  definition: SegmentDefinition;
  createdAt: string;
  updatedAt: string;
}

export interface AmbassadorSummary {
  totalAmbassadors: number;
  currentPeriodRevenue: number;
  currentPeriodOrders: number;
  currentPeriodPieces: number;
  currentPeriodAvgTicket: number;
  previousPeriodRevenue: number;
  revenueGrowthRatio: number | null;
  withoutOrdersThisMonth: number;
  statusCounts: Record<CustomerStatus, number>;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
}

export interface AmbassadorTrendPoint {
  month: string;
  revenue: number;
  orders: number;
  pieces: number;
}

export interface AmbassadorListItem extends CustomerListItem {
  currentPeriodRevenue: number;
  currentPeriodOrders: number;
  currentPeriodPieces: number;
  previousPeriodRevenue: number;
  revenueGrowthRatio: number | null;
  topProducts: TopProduct[];
  alerts: string[];
  monthlyTrend: AmbassadorTrendPoint[];
}

export interface AmbassadorResponse {
  summary: AmbassadorSummary;
  monthlyTrend: AmbassadorTrendPoint[];
  ambassadors: AmbassadorListItem[];
}

export type ProspectLeadStatus = "NEW" | "CLAIMED" | "CONTACTED" | "DISCARDED";
export type ProspectContactChannel = "WHATSAPP" | "PHONE" | "SITE" | "OTHER";
export type ProspectContactType = "FIRST_CONTACT" | "FOLLOW_UP" | "NO_RESPONSE" | "INTERESTED" | "DISQUALIFIED";

export interface ProspectLeadAssignee {
  id: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "SELLER";
}

export interface ProspectKeywordPreset {
  id: string;
  label: string;
  keyword: string;
  description: string;
  sortOrder: number;
}

export interface ProspectQuotaBucket {
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  monthlyLimit: number;
  monthlyUsed: number;
  monthlyRemaining: number;
}

export interface ProspectQuotaSnapshot {
  googleEnabled: boolean;
  searchPageSize: number;
  snapshotCacheHours: number;
  detailCacheHours: number;
  textSearch: ProspectQuotaBucket;
  placeDetails: ProspectQuotaBucket;
}

export interface ProspectLead {
  id: string;
  googlePlaceId: string;
  source: "GOOGLE_PLACES";
  displayName: string;
  primaryCategory: string | null;
  rating: number | null;
  reviewCount: number;
  phone: string | null;
  normalizedPhone: string | null;
  whatsappUrl: string | null;
  websiteUrl: string | null;
  address: string | null;
  state: string;
  city: string | null;
  mapsUrl: string | null;
  score: number;
  status: ProspectLeadStatus;
  assignedTo: ProspectLeadAssignee | null;
  claimedAt: string | null;
  firstContactAt: string | null;
  lastContactAt: string | null;
  lastContactByName: string | null;
  discardReason: string | null;
  lastGoogleBasicSyncAt: string | null;
  lastGoogleDetailSyncAt: string | null;
  isAvailable: boolean;
  hasCachedContact: boolean;
  isWorked: boolean;
}

export interface ProspectContactAttempt {
  id: string;
  leadId: string;
  seller: ProspectLeadAssignee;
  channel: ProspectContactChannel;
  contactType: ProspectContactType;
  notes: string;
  createdAt: string;
}

export interface ProspectContactAttemptResult {
  attempt: ProspectContactAttempt;
  lead: ProspectLead;
  summary: ProspectingDailySummary;
}

export interface ProspectSearchQuery {
  keyword: string;
  state: string;
  city?: string;
  onlyNew?: boolean;
  onlyUnassigned?: boolean;
  hasPhone?: boolean;
  myLeads?: boolean;
  includeWorked?: boolean;
  limit?: number;
  refresh?: boolean;
}

export interface ProspectSearchResponse {
  query: {
    keyword: string;
    state: string;
    city: string | null;
  };
  source: "google" | "snapshot" | "local";
  cacheHit: boolean;
  notice: string | null;
  quota: ProspectQuotaSnapshot;
  items: ProspectLead[];
}

export interface ProspectingDailySummary {
  date: string;
  seller: ProspectLeadAssignee;
  dailyTarget: number;
  uniqueContactsToday: number;
  claimedLeadCount: number;
  remainingToGoal: number;
  quota: ProspectQuotaSnapshot;
}

export interface ProspectingConfig {
  apiEnabled: boolean;
  defaultDailyTarget: number;
  defaultSearchFilters: {
    onlyNew: boolean;
    onlyUnassigned: boolean;
    includeWorked: boolean;
    hasPhone: boolean;
    myLeads: boolean;
    limit: number;
  };
  quota: ProspectQuotaSnapshot;
  presets: ProspectKeywordPreset[];
  guardrails: string[];
}

export type WhatsappGroupClassification = "WITH_ORDER" | "NO_ORDER_EXCEL" | "OTHER";
export type WhatsappGroupMappingStatus =
  | "AUTO_MAPPED"
  | "MANUAL_MAPPED"
  | "PENDING_REVIEW"
  | "CONFIRMED_UNMATCHED"
  | "IGNORED";
export type WhatsappGroupMatchMethod = "CODE" | "NAME" | "MANUAL" | "CONFIRMED_NONE" | "IGNORED";
export type WhatsappCampaignStatus = "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type WhatsappCampaignRecipientStatus =
  | "PENDING"
  | "BLOCKED_RECENT"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "SKIPPED";

export interface WhatsappGroup {
  id: string;
  jid: string;
  sourceName: string;
  sourceCode: string | null;
  classification: WhatsappGroupClassification;
  mappingStatus: WhatsappGroupMappingStatus;
  matchMethod: WhatsappGroupMatchMethod | null;
  customerId: string | null;
  customerCode: string | null;
  customerDisplayName: string | null;
  customerStatus: CustomerStatus | null;
  lastAttendant: string | null;
  lastContactAt: string | null;
  lastCampaignId: string | null;
  lastMessagePreview: string | null;
  lastImportedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isRecentlyBlocked: boolean;
  recentBlockUntil: string | null;
}

export interface WhatsappGroupsResponse {
  items: WhatsappGroup[];
  total: number;
}

export interface WhatsappImportSummary {
  totalGroups: number;
  importedCount: number;
  insertedCount: number;
  updatedCount: number;
  autoMappedCount: number;
  pendingReviewCount: number;
  classificationCounts: Record<WhatsappGroupClassification, number>;
  mappingCounts: Record<WhatsappGroupMappingStatus, number>;
  lastImportedAt: string | null;
}

export interface WhatsappMappingSummary {
  totalGroups: number;
  mappedGroups: number;
  pendingReviewGroups: number;
  confirmedUnmatchedGroups: number;
  ignoredGroups: number;
  recentlyBlockedGroups: number;
  lastImportedAt: string | null;
  classificationCounts: Record<WhatsappGroupClassification, number>;
  mappingCounts: Record<WhatsappGroupMappingStatus, number>;
}

export interface WhatsappCampaignProgress {
  totalRecipients: number;
  pendingCount: number;
  blockedRecentCount: number;
  sendingCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  completedCount: number;
  remainingCount: number;
  completionRatio: number;
  nextScheduledAt: string | null;
  estimatedFinishAt: string | null;
}

export interface WhatsappCampaignRecipient {
  id: string;
  campaignId: string;
  groupId: string;
  jid: string;
  sourceName: string;
  sourceCode: string | null;
  classification: WhatsappGroupClassification;
  mappingStatus: WhatsappGroupMappingStatus;
  customerId: string | null;
  customerCode: string | null;
  customerDisplayName: string | null;
  status: WhatsappCampaignRecipientStatus;
  scheduledFor: string | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  skippedAt: string | null;
  lastError: string | null;
  providerMessageId: string | null;
  providerStatus: string | null;
  responsePayload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsappCampaignListItem {
  id: string;
  name: string;
  status: WhatsappCampaignStatus;
  templateId: string | null;
  templateTitle: string | null;
  savedSegmentId: string | null;
  savedSegmentName: string | null;
  messageText: string;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  overrideRecentBlock: boolean;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  filtersSnapshot: Record<string, unknown>;
  progress: WhatsappCampaignProgress;
}

export interface WhatsappCampaignDetail extends WhatsappCampaignListItem {
  recipients: WhatsappCampaignRecipient[];
  recipientsPage: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}
