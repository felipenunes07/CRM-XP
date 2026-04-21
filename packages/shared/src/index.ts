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

export interface ItemsSoldTrendPoint {
  year: number;
  month: number;
  totalItems: number;
  totalOrders: number;
  totalRevenue: number;
  targetAmount?: number | null;
}

export interface MonthlyTarget {
  year: number;
  month: number;
  attendant: string; // 'TOTAL' for global, otherwise attendant name
  targetAmount: number;
  targetRevenue: number;
}

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
  reactivationHistory: HistoricalReactivationEntry[];
  portfolioTrend: PortfolioTrendPoint[];
  salesPerformance: SalesPerformanceEntry[];
  itemsSoldTrend: ItemsSoldTrendPoint[];
  currentMonthTarget: number | null;
  currentMonthItemsSold: number;
  estimatedLtv?: number;
  estimatedLifespanMonths?: number;
}

export interface HistoricalReactivationEntry {
  month: string;
  attendant: string;
  recoveredCustomers: number;
  recoveredRevenue: number;
  recoveredItems: number;
  recoveredClients: ReactivationRecoveredClient[];
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
  recoveredItems: number;
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
  reactivatedItems: number;
}

export interface AcquisitionSummary {
  today: number;
  yesterday: number;
  currentMonth: number;
  previousMonth: number;
  historicalTotal: number;
  currentMonthSpend: number;
  previousMonthSpend: number;
  currentMonthCac: number | null;
  previousMonthCac: number | null;
  currentMonthPieces: number;
  previousMonthPieces: number;
  currentMonthAvgTicket: number | null;
  previousMonthAvgTicket: number | null;
  currentMonthSpendSource?: "api" | "fallback";
  previousMonthSpendSource?: "api" | "fallback";
  estimatedLtv?: number;
  ltvCacRatio?: number | null;
  estimatedLifespanMonths?: number;
  monthlyChurnRate?: number | null;
}

export interface AcquisitionDailyPoint {
  date: string;
  newCustomers: number;
}

export interface AcquisitionMonthlyPoint {
  month: string;
  newCustomers: number;
  spend: number;
  cac: number | null;
  spendSource?: "api" | "fallback";
}

export interface NewCustomerListItem {
  customerId: string;
  customerCode: string;
  displayName: string;
  firstOrderDate: string;
  firstOrderAmount: number;
  firstItemCount: number;
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
  avgDaysBetweenOrders: number | null;
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

export interface InventorySnapshotMeta {
  id: string;
  sourceName: string;
  sourceUrl: string;
  importedAt: string;
  totalRows: number;
  inStockRows: number;
  matchedSkuRows: number;
}

export interface InventoryItem {
  id: string;
  snapshotId: string;
  sku: string;
  model: string;
  color: string | null;
  quality: string | null;
  price: number;
  stockQuantity: number;
  promotionLabel: string | null;
  isInStock: boolean;
}

export type InventoryStockStatus = "NEGATIVE" | "OUT" | "LOW" | "HEALTHY" | "HIGH";
export type InventoryDemandStatus = "NO_SALES" | "COLD" | "WARM" | "HOT";
export type InventoryQuadrant = "DRIVE_NOW" | "REPLENISH_URGENT" | "MONITOR" | "STALLED";
export type InventorySellerActionType = "PUSH_STAGNANT" | "ANNOUNCE_ARRIVAL" | "HOLD_BACK";
export type InventoryCustomerMatchType = "SKU" | "FAMILY";
export type InventoryProductKind = "DOC_DE_CARGA" | "TELA";

export interface InventoryDepositInfo {
  id: string | null;
  name: string;
  companyName: string | null;
  balance: number;
  reservedBalance: number | null;
  includesInTotal: boolean | null;
}

export interface InventoryProductEnrichment {
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  matchMethod: "SKU" | "MODEL" | "NONE";
  categoryTree: string | null;
  supplierName: string | null;
  price: number | null;
  promotionalPrice: number | null;
  costPrice: number | null;
  averageCostPrice: number | null;
  location: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  contactId: string | null;
  sellerId: string | null;
  sellerName: string | null;
  city: string | null;
  state: string | null;
  reservedStock: number | null;
  deposits: InventoryDepositInfo[];
  cachedAt: string | null;
  stale: boolean;
}

export interface InventoryCustomerSuggestion {
  customerId: string;
  customerCode: string;
  customerDisplayName: string;
  matchType: InventoryCustomerMatchType;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number | null;
  lastAttendant: string | null;
  availableCreditAmount: number;
  creditBalanceAmount: number;
  sellerName: string | null;
  reason: string;
}

export interface InventoryIntelligenceItem {
  sku: string;
  model: string;
  brand: string;
  family: string;
  productKind: InventoryProductKind;
  color: string | null;
  quality: string | null;
  price: number;
  promotionLabel: string | null;
  stockCurrent: number;
  previousStock: number;
  deltaNet: number;
  deltaEntry: number;
  deltaExit: number;
  sales30: number;
  sales90: number;
  orders30: number;
  orders90: number;
  coverageDays: number | null;
  stockStatus: InventoryStockStatus;
  demandStatus: InventoryDemandStatus;
  quadrant: InventoryQuadrant;
  isHotRupture: boolean;
  isLowCoverage: boolean;
  isOverstockCold: boolean;
  isNewArrival: boolean;
  isStrongOutgoing: boolean;
  depositNames: string[];
  sellerNames: string[];
  enrichment: InventoryProductEnrichment | null;
}

export interface InventoryStockHistoryPoint {
  snapshotId: string;
  importedAt: string;
  stockQuantity: number;
  deltaNet: number;
}

export interface InventoryQuadrantCell {
  quadrant: InventoryQuadrant;
  label: string;
  itemCount: number;
  totalUnits: number;
  topItems: Array<{
    sku: string;
    model: string;
  }>;
}

export interface InventoryIntelligenceSummary {
  activeSkus: number;
  totalUnits: number;
  hotRuptureCount: number;
  lowCoverageCount: number;
  newArrivalCount: number;
  stagnantCount: number;
  negativeStockCount: number;
}

export interface InventoryIntelligenceTables {
  hotRuptures: InventoryIntelligenceItem[];
  lowCoverage: InventoryIntelligenceItem[];
  arrivals: InventoryIntelligenceItem[];
  departures: InventoryIntelligenceItem[];
  overstockCold: InventoryIntelligenceItem[];
}

export interface InventorySellerActionItem {
  actionType: InventorySellerActionType;
  item: InventoryIntelligenceItem;
  headline: string;
  reason: string;
  suggestedCustomers: InventoryCustomerSuggestion[];
}

export interface InventorySellerQueues {
  pushStagnant: InventorySellerActionItem[];
  announceArrival: InventorySellerActionItem[];
  holdBack: InventorySellerActionItem[];
}

export interface InventoryIntelligenceFilters {
  brands: string[];
  families: string[];
  qualities: string[];
  stockStatuses: InventoryStockStatus[];
  demandStatuses: InventoryDemandStatus[];
  depositNames: string[];
  sellers: string[];
}

export interface InventoryIntelligenceAppliedFilters {
  brand: string | null;
  family: string | null;
  quality: string | null;
  stockStatus: InventoryStockStatus | null;
  demandStatus: InventoryDemandStatus | null;
  newArrivalOnly: boolean;
  depositName: string | null;
  seller: string | null;
}

export interface InventoryIntelligenceResponse {
  snapshot: InventorySnapshotMeta | null;
  previousSnapshot: InventorySnapshotMeta | null;
  summary: InventoryIntelligenceSummary;
  filters: InventoryIntelligenceFilters;
  appliedFilters: InventoryIntelligenceAppliedFilters;
  matrix: InventoryQuadrantCell[];
  tables: InventoryIntelligenceTables;
  sellerQueues: InventorySellerQueues;
}

export interface InventoryIntelligenceDetailResponse {
  snapshot: InventorySnapshotMeta | null;
  item: InventoryIntelligenceItem | null;
  stockHistory: InventoryStockHistoryPoint[];
  familyItems: InventoryIntelligenceItem[];
  suggestedCustomers: InventoryCustomerSuggestion[];
}

export type InventoryBuyRecommendation = "BUY_NOW" | "WATCH" | "DO_NOT_BUY";
export type InventoryRestockStatus = "ARRIVED_TODAY" | "BACK_TO_SELLING" | "NO_REACTION_YET" | "RESTOCK_AGAIN";
export type InventoryStaleAction = "MONITOR" | "COMMERCIAL_PUSH" | "PROMOTION" | "LIQUIDATE_REVIEW";
export type InventoryOverviewCardKey = "BUY_URGENT" | "ENDING_SOON" | "RESTOCKED_TODAY" | "STALE_90" | "HOLD_SALES";

export interface InventoryDailySeriesPoint {
  date: string;
  totalStockUnits: number;
  activeModelCount: number;
  salesUnits: number;
  restockUnits: number;
  stockUnits: number | null;
  activeSkuCount: number | null;
}

export interface InventoryOverviewCard {
  key: InventoryOverviewCardKey;
  title: string;
  helper: string;
  count: number;
  tone: "neutral" | "success" | "warning" | "danger";
  targetTab: "buying" | "restock" | "stale";
  targetFilter: string | null;
}

export interface InventoryOverviewResponse {
  snapshot: InventorySnapshotMeta | null;
  previousSnapshot: InventorySnapshotMeta | null;
  cards: InventoryOverviewCard[];
  dailySeries: InventoryDailySeriesPoint[];
  highlights: string[];
  totals: {
    totalStockUnits: number;
    activeModelCount: number;
    activeSkuCount: number;
    sales30: number;
    sales90: number;
    trappedValue: number;
  };
}

export interface InventoryBuyingListItem {
  modelKey: string;
  modelLabel: string;
  brand: string;
  family: string;
  productKind: InventoryProductKind;
  stockUnits: number;
  activeSkuCount: number;
  totalSkuCount: number;
  sales7: number;
  sales30: number;
  sales90: number;
  orders30: number;
  orders90: number;
  lastSaleAt: string | null;
  daysSinceLastSale: number | null;
  lastRestockAt: string | null;
  coverageDays: number | null;
  deltaIn: number;
  deltaOut: number;
  trappedValue: number;
  trappedValueEstimated: boolean;
  buyPriority: number;
  buyRecommendation: InventoryBuyRecommendation;
  holdSales: boolean;
  qualityLabels: string[];
  sampleSkus: string[];
}

export interface InventoryBuyingResponse {
  snapshot: InventorySnapshotMeta | null;
  items: InventoryBuyingListItem[];
}

export interface InventoryRestockListItem {
  modelKey: string;
  modelLabel: string;
  brand: string;
  family: string;
  productKind: InventoryProductKind;
  lastRestockAt: string | null;
  restockUnits: number;
  stockBefore: number;
  stockAfter: number;
  stockUnits: number;
  activeSkuCount: number;
  sales7Before: number;
  sales7After: number;
  sales30: number;
  coverageDays: number | null;
  buyRecommendation: InventoryBuyRecommendation;
  status: InventoryRestockStatus;
}

export interface InventoryRestockResponse {
  snapshot: InventorySnapshotMeta | null;
  counts: {
    arrivedToday: number;
    backToSelling: number;
    noReactionYet: number;
    restockAgain: number;
  };
  items: InventoryRestockListItem[];
}

export interface InventoryStaleListItem {
  modelKey: string;
  modelLabel: string;
  brand: string;
  family: string;
  productKind: InventoryProductKind;
  stockUnits: number;
  activeSkuCount: number;
  totalSkuCount: number;
  lastSaleAt: string | null;
  daysSinceLastSale: number | null;
  trappedValue: number;
  trappedValueEstimated: boolean;
  sales90: number;
  lastRestockAt: string | null;
  suggestedAction: InventoryStaleAction;
  staleBucket: "30_PLUS" | "60_PLUS" | "90_PLUS" | "120_PLUS";
}

export interface InventoryStaleResponse {
  snapshot: InventorySnapshotMeta | null;
  counts: {
    stale30: number;
    stale60: number;
    stale90: number;
    stale120: number;
  };
  items: InventoryStaleListItem[];
}

export interface InventoryModelListItem {
  modelKey: string;
  modelLabel: string;
  brand: string;
  family: string;
  productKind: InventoryProductKind;
  stockUnits: number;
  activeSkuCount: number;
  totalSkuCount: number;
  sales30: number;
  sales90: number;
  lastSaleAt: string | null;
  daysSinceLastSale: number | null;
  qualityLabels: string[];
  sampleSkus: string[];
  buyRecommendation: InventoryBuyRecommendation;
}

export interface InventoryModelsResponse {
  snapshot: InventorySnapshotMeta | null;
  filters: {
    brands: string[];
    families: string[];
    qualities: string[];
  };
  items: InventoryModelListItem[];
}

export interface InventoryModelTopCustomer {
  customerId: string;
  customerCode: string;
  customerDisplayName: string;
  totalQuantity: number;
  totalOrders: number;
  lastPurchaseAt: string | null;
  lastAttendant: string | null;
}

export interface InventoryModelDepositBalance {
  name: string;
  companyName: string | null;
  balance: number;
  reservedBalance: number;
}

export interface InventoryModelBenchmarks {
  lowStockAvgSales: number | null;
  highStockAvgSales: number | null;
  shortMixAvgSales: number | null;
  wideMixAvgSales: number | null;
}

export interface InventoryModelDetailResponse {
  snapshot: InventorySnapshotMeta | null;
  model: InventoryBuyingListItem | null;
  dailySeries: InventoryDailySeriesPoint[];
  benchmarks: InventoryModelBenchmarks;
  highlights: string[];
  skus: InventoryIntelligenceItem[];
  topCustomers: InventoryModelTopCustomer[];
  deposits: InventoryModelDepositBalance[];
}

export type OpportunityPrimarySource = "CREDIT_BALANCE" | "AVAILABLE_CREDIT";
export type OpportunityMatchType = "SKU" | "MODEL";

export interface OpportunitySuggestedLine {
  inventoryItemId: string;
  matchType: OpportunityMatchType;
  sku: string;
  model: string;
  color: string | null;
  quality: string | null;
  promotionLabel: string | null;
  unitPrice: number;
  availableStock: number;
  historicalTotalQuantity: number;
  historicalOrderCount: number;
  historicalLastBoughtAt: string | null;
  suggestedQuantity: number;
  lineSubtotal: number;
}

export interface OpportunityMessagePreview {
  templateId: string | null;
  templateTitle: string | null;
  messageText: string;
  itemsSummary: string;
  usedFallback: boolean;
}

export interface CustomerOpportunityQueueItem {
  customerId: string;
  customerCode: string;
  customerDisplayName: string;
  primarySource: OpportunityPrimarySource;
  targetAmount: number;
  creditBalanceAmount: number;
  availableCreditAmount: number;
  suggestedAmount: number;
  remainingGapAmount: number;
  coverageRatio: number;
  matchedProductCount: number;
  suggestedLineCount: number;
  topModelsInStock: string[];
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number | null;
  lastAttendant: string | null;
}

export interface CustomerOpportunityDetail {
  customerId: string;
  customerCode: string;
  customerDisplayName: string;
  creditSnapshot: CustomerCreditSnapshotMeta | null;
  inventorySnapshot: InventorySnapshotMeta | null;
  isEligible: boolean;
  reason: string | null;
  primarySource: OpportunityPrimarySource;
  targetAmount: number;
  creditBalanceAmount: number;
  availableCreditAmount: number;
  suggestedAmount: number;
  remainingGapAmount: number;
  coverageRatio: number;
  availableProducts: OpportunitySuggestedLine[];
  suggestedLines: OpportunitySuggestedLine[];
  messagePreview: OpportunityMessagePreview;
}

export interface CustomerOpportunityQueueResponse {
  creditSnapshot: CustomerCreditSnapshotMeta | null;
  inventorySnapshot: InventorySnapshotMeta | null;
  summary: {
    totalCustomers: number;
    prioritizedCustomers: number;
    totalTargetAmount: number;
    totalSuggestedAmount: number;
    customersWithBalance: number;
    customersWithAvailableCredit: number;
  };
  items: CustomerOpportunityQueueItem[];
}

export interface MessageTemplate {
  id: string;
  category: "reativacao" | "follow_up" | "promocao" | "credito";
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

export type IdeaBoardStatus = "OPEN" | "CLOSED";
export type IdeaVoteOption = "LIKE" | "MAYBE" | "NO";

export interface IdeaVoteSummary {
  likeCount: number;
  maybeCount: number;
  noCount: number;
  totalVotes: number;
}

export interface IdeaUserVote {
  option: IdeaVoteOption;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaVoteFeedback {
  id: string;
  ideaId: string;
  option: IdeaVoteOption;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaBoardItem {
  id: string;
  title: string;
  description: string;
  status: IdeaBoardStatus;
  isAnonymous: boolean;
  authorDisplayName: string;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
  voteSummary: IdeaVoteSummary;
  feedbackCount: number;
  currentUserVote: IdeaUserVote | null;
}

export interface IdeaBoardDetail extends IdeaBoardItem {
  feedbacks: IdeaVoteFeedback[];
}
