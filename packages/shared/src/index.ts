export type SourceSystem = "history_xls" | "olist_v2" | "supabase_2026";

export type CustomerStatus = "ACTIVE" | "ATTENTION" | "INACTIVE" | "NEW";
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
  clItems?: number;
  khItems?: number;
  ljItems?: number;
  otherItems?: number;
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
  newCustomerLeaderboard: NewCustomerLeaderboardEntry[];
  prospectingLeaderboard: ProspectingLeaderboardEntry[];
  itemsSoldTrend: ItemsSoldTrendPoint[];
  currentMonthTarget: number | null;
  currentMonthItemsSold: number;
  estimatedLtv?: number;
  estimatedLifespanMonths?: number;
  todaySalesAmount: number;
  todayItemsSold: number;
  todayOrdersCount: number;
  todayItemsByCategory: {
    screens: number;
    batteries: number;
    chargingDocks: number;
    unclassified: number;
    screensByFactory: {
      xp: number;
      vv: number;
      de: number;
    };
  };
  todaySalesPerformance: SalesPerformanceEntry[];
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

export interface NewCustomerDetail {
  customerId: string;
  customerCode: string;
  displayName: string;
  firstOrderDate: string | null;
  firstOrderAmount: number;
  firstItemCount: number;
}

export interface NewCustomerLeaderboardEntry {
  attendant: string;
  newCustomers: number;
  totalRevenue: number;
  totalItems: number;
  customers: NewCustomerDetail[];
}

export interface ProspectingLeaderboardEntry {
  attendant: string;
  contactedLeads: number;
  contactAttempts: number;
  firstContacts: number;
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

export interface AttendantPortfolioCustomer {
  customerId: string;
  customerCode: string;
  displayName: string;
  status: CustomerStatus;
  periodPieces: number;
  periodOrders: number;
  periodRevenue: number;
  lastOrderAt: string | null;
  daysSinceLastPurchase: number | null;
  totalOrders: number;
  totalSpent: number;
  priorityScore: number;
}

export interface AttendantPortfolioResponse {
  attendant: string;
  windowMonths: 3 | 6 | 12 | 24;
  periodStart: string;
  periodEnd: string;
  customers: AttendantPortfolioCustomer[];
}

export interface AttendantTrendPoint {
  month: string;
  revenue: number;
  orders: number;
  pieces: number;
  uniqueCustomers: number;
  newCustomers: number;
  recoveredCustomers: number;
  lostCustomers: number;
  lostCustomerDetails: AttendantLostCustomer[];
  sentMessages: number;
  receivedMessages: number;
  attendedConversations: number;
  targetPieces: number | null;
  targetRevenue: number | null;
}

export interface AttendantLostCustomer {
  customerId: string;
  displayName: string;
  lastPurchaseMonth: string;
  piecesInLastPurchaseMonth: number;
}

export interface AttendantWhatsappIdentity {
  instanceName: string | null;
  displayLabel: string | null;
  phoneNumber: string | null;
  profilePictureUrl: string | null;
}

export interface AttendantActivitySnapshot {
  sentMessages: number;
  receivedMessages: number;
  attendedConversations: number;
  activeDays: number;
  averageFirstResponseSeconds: number | null;
}

export interface AttendantActivityHeatmapCell {
  date: string;
  hour: number;
  sentMessages: number;
  receivedMessages: number;
}

export interface AttendantGoalSnapshot {
  targetPieces: number | null;
  targetRevenue: number | null;
  piecesProgressRatio: number | null;
  revenueProgressRatio: number | null;
}

export interface AttendantTeamGoal {
  month: string;
  targetPieces: number | null;
  targetRevenue: number | null;
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
  whatsapp: AttendantWhatsappIdentity;
  currentPeriod: AttendantMetricSnapshot;
  previousPeriod: AttendantMetricSnapshot;
  growth: AttendantGrowthRatios;
  portfolio: AttendantPortfolioSnapshot;
  currentActivity: AttendantActivitySnapshot;
  currentNewCustomers: number;
  currentRecoveredCustomers: number;
  currentLostCustomers: number;
  currentRecoveredRevenue: number;
  goal: AttendantGoalSnapshot;
  activityHeatmap: AttendantActivityHeatmapCell[];
  monthlyTrend: AttendantTrendPoint[];
  topCustomers: AttendantTopCustomer[];
  topProducts: TopProduct[];
}

export interface AttendantsResponse {
  windowMonths: 3 | 6 | 12 | 24;
  summary: AttendantSummary;
  teamGoals: AttendantTeamGoal[];
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
  todaySalesAmount: number;
  todayItemsSold: number;
  todayOrdersCount: number;
  todaySalesPerformance: SalesPerformanceEntry[];
  monthlyChurnRate?: number | null;
  currentMonthGroupsCreated: number;
  previousMonthGroupsCreated: number;
  currentMonthConvertedGroups?: number;
  previousMonthConvertedGroups?: number;
}

export interface AcquisitionDailyPoint {
  date: string;
  newCustomers: number;
  groupsCreated: number;
  convertedGroups?: number;
}

export interface AcquisitionMonthlyPoint {
  month: string;
  newCustomers: number;
  spend: number;
  cac: number | null;
  spendSource?: "api" | "fallback";
  groupsCreated: number;
  convertedGroups?: number;
  conversionRate: number | null;
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

export interface UnconvertedGroup {
  name: string;
  date: string;
}

export interface AcquisitionMetrics {
  summary: AcquisitionSummary;
  dailySeries: AcquisitionDailyPoint[];
  monthlySeries: AcquisitionMonthlyPoint[];
  recentCustomers: NewCustomerListItem[];
  unconvertedGroups: UnconvertedGroup[];
  allGroups?: Array<{ name: string; date: string; isConverted: boolean }>;
}

export interface PortfolioTrendPoint {
  date: string;
  totalCustomers: number;
  activeCount: number;
  attentionCount: number;
  inactiveCount: number;
  newCount: number;
  trafficSpend?: number;
  dailyItemsSold?: number;
}
  
export interface CustomerMovement {
  customerId: string;
  customerCode: string;
  displayName: string;
  fromStatus: CustomerStatus;
  toStatus: CustomerStatus;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number;
}

export interface CustomerMovementsResponse {
  startDate: string;
  endDate: string;
  movements: CustomerMovement[];
}

export type TrendRangeCustomerStatus = Extract<CustomerStatus, "ATTENTION" | "INACTIVE">;

export interface TrendRangeSelection {
  startDate: string;
  endDate: string;
}

export interface TrendRangeAnalysisSummary {
  startDate: string;
  endDate: string;
  totalCustomers: number;
  attentionCustomers: number;
  inactiveCustomers: number;
  neverReturnedCustomers: number;
  averageTicket: number;
  estimatedMonthlyRevenueLoss: number;
  estimatedMonthlyPiecesLoss: number;
}

export interface TrendRangeLostCustomer {
  customerId: string;
  customerCode: string;
  displayName: string;
  worstStatus: TrendRangeCustomerStatus;
  firstCriticalDate: string;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number | null;
  avgTicket: number;
  totalSpent: number;
  lastAttendant: string | null;
  estimatedMonthlyRevenueLoss: number;
  estimatedMonthlyPiecesLoss: number;
}

export interface TrendRangeRecoveredSummary {
  recoveredCustomers: number;
  recoveredRevenue: number;
  recoveredPieces: number;
}

export interface TrendRangeMonthlyLossPoint {
  month: string;
  expectedRevenue: number;
  actualRevenue: number;
  lostRevenue: number;
  expectedPieces: number;
  actualPieces: number;
  lostPieces: number;
}

export interface TrendRangeAnalysisResponse {
  selection: TrendRangeSelection;
  summary: TrendRangeAnalysisSummary;
  lostCustomers: TrendRangeLostCustomer[];
  recoveredSummary: TrendRangeRecoveredSummary;
  monthlyLossSeries: TrendRangeMonthlyLossPoint[];
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
  state: string | null;
  city: string | null;
}

export interface CustomerDetail extends CustomerListItem {
  purchaseFrequency90d: number;
  frequencyDropRatio: number;
  predictedNextPurchaseAt: string | null;
  internalNotes: string;
  monthlyTrend: AmbassadorTrendPoint[];
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
  state: string | null;
  city: string | null;
}

export interface CustomerDocInsightsResponse {
  summary: CustomerDocInsightSummary;
  ranking: CustomerDocInsightListItem[];
}

export interface CustomerDefectSnapshotSourceFile {
  fileName: string;
  sourcePath: string;
  fileUpdatedAt: string;
  fileSizeBytes: number;
}

export interface CustomerDefectSnapshotMeta {
  id: string;
  sourceFileName: string;
  sourceFilePath: string;
  sourceFileUpdatedAt: string;
  sourceFileSizeBytes: number;
  sourceFiles: CustomerDefectSnapshotSourceFile[];
  importedAt: string;
  periodStartDate: string;
  periodEndDate: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
}

export interface CustomerDefectRow {
  id: string;
  customerId: string | null;
  customerCode: string;
  customerDisplayName: string;
  sourceDisplayName: string | null;
  matched: boolean;
  revenue: number;
  orderCount: number;
  purchasedPieces: number;
  returnedPieces: number;
  replacementPieces: number;
  returnedAmount: number;
  returnRate: number | null;
  defectSkuCount: number;
  firstDefectDate: string | null;
  lastDefectDate: string | null;
  yearlyBreakdown: CustomerDefectYearBreakdown[];
}

export interface CustomerDefectYearBreakdown {
  year: number;
  revenue: number;
  orderCount: number;
  purchasedPieces: number;
  returnedPieces: number;
  replacementPieces: number;
  returnedAmount: number;
  returnRate: number | null;
  defectSkuCount: number;
  firstDefectDate: string | null;
  lastDefectDate: string | null;
}

export interface CustomerDefectMovementRow {
  defectDate: string;
  returnedPieces: number;
  replacementPieces: number;
  returnedAmount: number;
  sku: string | null;
  description: string | null;
}

export interface CustomerDefectOverviewSummary {
  totalCustomers: number;
  matchedCustomers: number;
  unmatchedCustomers: number;
  totalRevenue: number;
  totalPurchasedPieces: number;
  totalReturnedPieces: number;
  totalReplacementPieces: number;
  totalReturnedAmount: number;
  overallReturnRate: number | null;
  highReturnCustomers: number;
  zeroPurchaseReturnCustomers: number;
}

export interface CustomerDefectOverviewResponse {
  snapshot: CustomerDefectSnapshotMeta | null;
  summary: CustomerDefectOverviewSummary;
  rows: CustomerDefectRow[];
  unmatchedRows: CustomerDefectRow[];
}

export interface CustomerDefectCustomerDetailResponse {
  snapshot: CustomerDefectSnapshotMeta;
  row: CustomerDefectRow;
  defectRows: CustomerDefectMovementRow[];
}

export interface CustomerDefectProductRow {
  sku: string;
  model: string;
  brand: string;
  factory: "XP" | "VV" | "DE" | "BATERIA";
  quality: string;
  isVv: boolean;
  soldPieces: number;
  returnedPieces: number;
  returnedAmount: number;
  returnRate: number | null;
}

export interface CustomerDefectProductSummary {
  products: number;
  soldPieces: number;
  returnedPieces: number;
  returnedAmount: number;
  returnRate: number | null;
}

export interface CustomerDefectQualitySummary extends CustomerDefectProductSummary {
  quality: string;
}

export interface CustomerDefectProductsResponse {
  snapshot: CustomerDefectSnapshotMeta;
  year: number;
  periodStartDate: string;
  periodEndDate: string;
  summary: CustomerDefectProductSummary;
  vvSummary: CustomerDefectProductSummary;
  qualities: CustomerDefectQualitySummary[];
  rows: CustomerDefectProductRow[];
}

export interface GeographicStateStat {
  state: string;
  customerCount: number;
  orderCount: number;
  cityCount: number;
  totalPieces: number;
  totalRevenue: number;
  activeCustomerCount: number;
  attentionCustomerCount: number;
  inactiveCustomerCount: number;
}

export interface GeographicCityStat {
  state: string;
  city: string;
  customerCount: number;
  orderCount: number;
  totalPieces: number;
  totalRevenue: number;
  activeCustomerCount: number;
  attentionCustomerCount: number;
  inactiveCustomerCount: number;
}

export interface GeographicCustomerStat {
  customerId: string;
  customerCode: string;
  displayName: string;
  state: string;
  city: string;
  status: CustomerStatus;
  daysSinceLastPurchase: number | null;
  orderCount: number;
  totalPieces: number;
  totalRevenue: number;
}

export interface GeographicSalesSummary {
  totalStates: number;
  totalCities: number;
  totalCustomers: number;
  totalOrders: number;
  totalPieces: number;
  totalRevenue: number;
}

export interface GeographicSalesResponse {
  summary: GeographicSalesSummary;
  stateStats: GeographicStateStat[];
  cityStats: GeographicCityStat[];
  customerStats: GeographicCustomerStat[];
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
  creditLimitSource?: "SPREADSHEET" | "MANUAL";
  paymentTermSource?: "SPREADSHEET" | "MANUAL";
  manualOverrideUpdatedAt?: string | null;
  manualOverrideUpdatedByName?: string | null;
}

export interface CustomerCreditSettingsUpdate {
  creditLimit?: number | null;
  paymentTerm?: number | null;
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

export interface CustomerCreditOrderEntry {
  id: string;
  customerId: string | null;
  customerCode: string;
  customerDisplayName: string;
  sourceDisplayName: string | null;
  orderNumber: string;
  orderDate: string | null;
  totalAmount: number;
  units: number;
  seller: string | null;
  doc: string | null;
  status: string;
  lineCount: number;
}

export interface CustomerCreditPaymentEntry {
  id: string;
  customerId: string | null;
  customerCode: string;
  customerDisplayName: string;
  sourceDisplayName: string | null;
  paymentNumber: string;
  paymentDate: string | null;
  amount: number;
  paymentType: string;
  observation: string;
}

export interface CustomerCreditDetailResponse {
  snapshot: CustomerCreditSnapshotMeta | null;
  row: CustomerCreditRow | null;
  orders: CustomerCreditOrderEntry[];
  payments: CustomerCreditPaymentEntry[];
  totalOrders: number;
  totalPayments: number;
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
export type InventoryProductKind = "DOC_DE_CARGA" | "BATERIA" | "TELA";

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
  totalStockUnitsTela?: number;
  totalStockUnitsDoc?: number;
  totalStockUnitsBattery?: number;
  activeModelCount: number;
  salesUnits: number;
  salesUnitsTela?: number;
  salesUnitsDoc?: number;
  salesUnitsBattery?: number;
  restockUnits: number;
  restockUnitsTela?: number;
  restockUnitsDoc?: number;
  restockUnitsBattery?: number;
  stockUnits: number | null;
  stockIsEstimated?: boolean;
  activeSkuCount: number | null;
  activeSkuCountTela?: number | null;
  activeSkuCountDoc?: number | null;
  activeSkuCountBattery?: number | null;
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
    totalStockUnitsTela?: number;
    totalStockUnitsDoc?: number;
    totalStockUnitsBattery?: number;
    activeModelCount: number;
    activeSkuCount: number;
    activeSkuCountTela?: number;
    activeSkuCountDoc?: number;
    activeSkuCountBattery?: number;
    sales30: number;
    sales90: number;
    trappedValue: number;
  };
}

export interface InventoryBuyingListItem {
  sku: string;
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
  sku: string;
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
  sku: string;
  modelKey: string;
  modelLabel: string;
  color: string | null;
  quality: string | null;
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
  unitPrice: number;
  lastRestockAt: string | null;
  suggestedAction: InventoryStaleAction;
  staleBucket: "30_PLUS" | "60_PLUS" | "90_PLUS" | "120_PLUS";
}

export interface InventoryStaleResponse {
  snapshot: InventorySnapshotMeta | null;
  counts: {
    stale15_30: number;
    stale30_60: number;
    stale60_90: number;
    stale90_120: number;
    stale120plus: number;
  };
  items: InventoryStaleListItem[];
}

export interface InventoryModelListItem {
  sku: string;
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

export type InventorySalesCategory = "TELA" | "DOC_DE_CARGA" | "BATERIA" | "OUTROS";

export interface InventorySalesReportItem {
  sku: string;
  modelKey: string | null;
  modelLabel: string;
  brand: string;
  factory: "XP" | "VV" | "DE" | "BATERIA";
  family: string;
  category: InventorySalesCategory;
  quality: string | null;
  color: string | null;
  inCatalog: boolean;
  stockUnits: number;
  totalUnits: number;
  totalRevenue: number;
  totalOrders: number;
  lastSaleAt: string | null;
  monthlyUnits: number[];
  monthlyRevenue: number[];
}

export interface InventorySalesReportResponse {
  snapshot: InventorySnapshotMeta | null;
  months: string[];
  items: InventorySalesReportItem[];
  filters: {
    brands: string[];
    factories: Array<"XP" | "VV" | "DE" | "BATERIA">;
    families: string[];
    qualities: string[];
  };
}

export interface InventoryModelTopCustomer {
  customerId: string;
  customerCode: string;
  customerDisplayName: string;
  phone: string | null;
  totalQuantity: number;
  totalOrders: number;
  totalRevenue: number;
  quantity12Months: number;
  orders12Months: number;
  revenue12Months: number;
  quantity90Days: number;
  orders90Days: number;
  revenue90Days: number;
  previous90DaysQuantity: number;
  quantity30Days: number;
  orders30Days: number;
  revenue30Days: number;
  observedMonths: number;
  averageMonthlyQuantity: number;
  averageOrderQuantity: number;
  averageUnitPrice: number;
  averageDaysBetweenPurchases: number | null;
  predictedNextPurchaseAt: string | null;
  trend90dPercent: number | null;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  lastAttendant: string | null;
  customerTotalSpent: number;
  customerAverageTicket: number;
  customerStatus: string;
  customerPriorityScore: number;
  monthlyHistory: InventoryModelCustomerMonthlyPoint[];
}

export interface InventoryModelCustomerMonthlyPoint {
  month: string;
  quantity: number;
  orders: number;
  revenue: number;
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
  topInactiveCustomers?: InventoryModelTopCustomer[];
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

export type MessageTemplateType = "TEXT" | "IMAGE" | "VIDEO";

export interface MessageTemplate {
  id: string;
  category: "reativacao" | "follow_up" | "promocao" | "credito";
  title: string;
  content: string;
  messageType: MessageTemplateType;
  mediaUrl: string | null;
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
  customerPrefix?: string;
  state?: string;
  city?: string;
  customerCodes?: string[];
  minTotalOrders?: number;
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

export type MessageAutomationStatus = "ACTIVE" | "PAUSED";
export type MessageAutomationChannel = "WHATSAPP_GROUP";
export type MessageAutomationSendMode = "AUTOMATIC" | "APPROVAL";
export type MessageAutomationTriggerMode = "SCHEDULED" | "ON_STAGE_ENTRY";
export type MessageAutomationScheduleFrequency = "DAILY" | "WEEKLY";

export interface MessageAutomationSchedule {
  frequency: MessageAutomationScheduleFrequency;
  weekdays?: number[];
  time: string;
  timezone: string;
}

export interface MessageAutomation {
  id: string;
  name: string;
  status: MessageAutomationStatus;
  channel: MessageAutomationChannel;
  sendMode: MessageAutomationSendMode;
  triggerMode: MessageAutomationTriggerMode;
  savedSegmentId: string | null;
  savedSegmentName: string | null;
  segmentDefinition: SegmentDefinition;
  flowDefinition: Record<string, unknown>;
  whatsappInstanceId: string | null;
  whatsappInstanceName: string | null;
  whatsappInstanceLabel: string | null;
  templateId: string | null;
  templateTitle: string | null;
  messageText: string;
  schedule: MessageAutomationSchedule;
  overrideRecentBlock: boolean;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageAutomationRunStatus =
  | "PENDING_APPROVAL"
  | "ENQUEUED"
  | "APPROVED"
  | "REJECTED"
  | "NO_MATCH"
  | "FAILED";

export interface MessageAutomationRunAudienceSnapshot {
  totalCustomerCount: number;
  customerIds: string[];
  eligibleGroupIds: string[];
  blockedGroupIds: string[];
  unmappedCustomerIds: string[];
}

export interface MessageAutomationRun {
  id: string;
  automationId: string;
  automationName: string;
  status: MessageAutomationRunStatus;
  scheduledFor: string;
  resolvedAt: string | null;
  audienceSnapshot: MessageAutomationRunAudienceSnapshot;
  mappedGroupCount: number;
  unmappedCustomerCount: number;
  blockedRecentCount: number;
  campaignId: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  rejectedAt: string | null;
  rejectedByUserId: string | null;
  errorMessage: string | null;
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
export type WhatsappCampaignStatus = "QUEUED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type WhatsappCampaignMessageType = "TEXT" | "IMAGE" | "CAROUSEL" | "VIDEO" | "MENU";
export type WhatsappInstanceProvider = "EVOLUTION" | "UAZAPI";

export interface CarouselSlide {
  text: string;
  image: string;
  buttons: { id: string; text: string; type: string }[];
}

export type WhatsappMenuType = "button" | "list" | "poll";

export interface WhatsappMenuData {
  menuType: WhatsappMenuType;
  choices: string[];
  footerText?: string | null;
  listButton?: string | null;
  selectableCount?: number | null;
  imageButton?: string | null;
}

export type WhatsappCampaignRecipientStatus =
  | "PENDING"
  | "BLOCKED_RECENT"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "SKIPPED";

export interface WhatsappGroupPurchasePoint {
  /** Mês no formato 'YYYY-MM'. */
  month: string;
  /** Peças compradas pelo cliente naquele mês. */
  pieces: number;
}

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
  state: string | null;
  city: string | null;
  lastAttendant: string | null;
  lastContactAt: string | null;
  lastCampaignId: string | null;
  lastMessagePreview: string | null;
  lastImportedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isRecentlyBlocked: boolean;
  recentBlockUntil: string | null;
  sentCampaignsCount?: number;
  /**
   * Série de peças compradas por mês (meses com compra, ordem crescente) nos
   * últimos 12 meses. Usada no mini-gráfico do Disparador para identificar quem
   * compra/comprava muito. Ausente em endpoints que não calculam a série.
   */
  purchaseTrend?: WhatsappGroupPurchasePoint[];
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
  activeCount?: number;
  attentionCount?: number;
  inactiveCount?: number;
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
  responded: boolean;
  firstResponseAt: string | null;
  responseCount: number;
  purchased: boolean;
  firstOrderAt: string | null;
  ordersCount: number;
  pieces: number;
  revenue: number;
  createdAt: string;
  updatedAt: string;
}

export type WhatsappCampaignAttributedMessageDirection = "OUTBOUND" | "INBOUND";
export type WhatsappCampaignAttributedMessageSource = "message_logs" | "deal_activities" | "whatsapp_incoming_messages";

export interface WhatsappCampaignRecipientPerformance {
  recipientId: string;
  responded: boolean;
  firstResponseAt: string | null;
  responseCount: number;
  purchased: boolean;
  firstOrderAt: string | null;
  ordersCount: number;
  pieces: number;
  revenue: number;
}

export interface WhatsappCampaignAttributedMessage {
  id: string;
  recipientId: string | null;
  campaignId: string;
  customerId: string | null;
  customerCode: string | null;
  customerDisplayName: string | null;
  jid: string | null;
  direction: WhatsappCampaignAttributedMessageDirection;
  source: WhatsappCampaignAttributedMessageSource;
  senderName: string | null;
  content: string;
  createdAt: string;
}

export interface WhatsappCampaignPerformanceDiagnosis {
  tone: "success" | "warning" | "danger" | "neutral";
  title: string;
  description: string;
}

export interface WhatsappCampaignPerformance {
  attributionWindowDays: number;
  totalRecipients: number;
  eligibleRecipients: number;
  sentRecipients: number;
  blockedRecipients: number;
  failedRecipients: number;
  skippedRecipients: number;
  respondedRecipients: number;
  notRespondedRecipients: number;
  purchasedRecipients: number;
  responseRate: number;
  purchaseRate: number;
  orderCount: number;
  pieces: number;
  revenue: number;
  sentMessages: number;
  receivedMessages: number;
  diagnosis: WhatsappCampaignPerformanceDiagnosis;
  recipients: WhatsappCampaignRecipientPerformance[];
  messages: WhatsappCampaignAttributedMessage[];
}

export interface WhatsappCampaignListItem {
  id: string;
  name: string;
  status: WhatsappCampaignStatus;
  whatsappInstanceId: string | null;
  templateId: string | null;
  templateTitle: string | null;
  savedSegmentId: string | null;
  savedSegmentName: string | null;
  messageText: string;
  messageType: WhatsappCampaignMessageType;
  carouselData: CarouselSlide[] | null;
  menuData: WhatsappMenuData | null;
  videoUrl: string | null;
  imageUrl: string | null;
  autoReplyText: string | null;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  overrideRecentBlock: boolean;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  scheduledStartAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  filtersSnapshot: Record<string, unknown>;
  progress: WhatsappCampaignProgress;
}

export interface WhatsappCampaignRecipientChatMessage {
  id: string;
  direction: WhatsappCampaignAttributedMessageDirection;
  content: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  source: string;
  createdAt: string;
}

export interface WhatsappCampaignDetail extends WhatsappCampaignListItem {
  recipients: WhatsappCampaignRecipient[];
  performance: WhatsappCampaignPerformance;
  recipientsPage: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}

export type IdeaBoardStatus = "OPEN" | "CLOSED";
export type IdeaVoteOption = "LIKE" | "MAYBE" | "NO";
export type IdeaBoardColumnId = "INBOX" | "SUPPORT" | "REFINE" | "STOP";

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
  laneOverride: IdeaBoardColumnId | null;
  createdAt: string;
  updatedAt: string;
  voteSummary: IdeaVoteSummary;
  feedbackCount: number;
  currentUserVote: IdeaUserVote | null;
}

export interface IdeaBoardDetail extends IdeaBoardItem {
  feedbacks: IdeaVoteFeedback[];
}

// ── Pipeline / Kanban ──────────────────────────────────────────────

export type DealPriority = "LOW" | "MEDIUM" | "HIGH";
export type DealActivityType =
  | "STAGE_CHANGE"
  | "NOTE"
  | "WHATSAPP_SENT"
  | "WHATSAPP_RECEIVED"
  | "CALL"
  | "MEETING"
  | "TASK"
  | "CREATED";

export interface PipelineStage {
  id: string;
  name: string;
  sortOrder: number;
  color: string;
  isWon: boolean;
  isLost: boolean;
  dealCount: number;
  totalValue: number;
}

export interface DealListItem {
  id: string;
  title: string;
  customerId: string | null;
  customerCode: string | null;
  customerDisplayName: string | null;
  stageId: string;
  assignedTo: string | null;
  assignedToName: string | null;
  whatsappInstanceId: string | null;
  expectedValue: number;
  expectedCloseDate: string | null;
  priority: DealPriority;
  lastActivityAt: string;
  createdAt: string;
  customerStatus?: CustomerStatus | null;
}

export interface DealDetail extends DealListItem {
  notes: string;
  lostReason: string | null;
  wonAt: string | null;
  lostAt: string | null;
  whatsappJid: string | null;
  activities: DealActivity[];
}

export interface DealActivity {
  id: string;
  dealId: string;
  activityType: DealActivityType;
  actorName: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PipelineSummary {
  totalDeals: number;
  totalValue: number;
  wonDeals: number;
  wonValue: number;
  lostDeals: number;
  avgDealAge: number;
  stages: PipelineStage[];
  deals: DealListItem[];
}

// ── WhatsApp Instances ─────────────────────────────────────────────

export interface WhatsappInstanceItem {
  id: string;
  instanceName: string;
  displayLabel: string;
  phoneNumber: string | null;
  profilePictureUrl: string | null;
  provider: WhatsappInstanceProvider;
  status: "ACTIVE" | "PAUSED" | "DISCONNECTED";
  isDefault: boolean;
  messagesEnabled: boolean;
  assignedUserId: string | null;
  assignedUserName: string | null;
  lastHealthStatus: string | null;
  lastHealthCheckAt: string | null;
}

export type WhatsappRiskSeverity = "LOW" | "MODERATE" | "HIGH";

export interface WhatsappMessageRisk {
  label: string;
  severity: WhatsappRiskSeverity;
  keyword: string;
}

export type WhatsappMonitorMessageDirection = "INBOUND" | "OUTBOUND" | "SYSTEM";

export interface WhatsappMonitorMessage {
  id: string;
  dealId: string;
  direction: WhatsappMonitorMessageDirection;
  senderName: string | null;
  senderJid: string | null;
  senderProfilePictureUrl: string | null;
  content: string;
  createdAt: string;
  remoteJid: string | null;
  isGroup: boolean;
  metadata: Record<string, unknown>;
  risk: WhatsappMessageRisk | null;
}

export interface WhatsappMonitorAgent extends WhatsappInstanceItem {
  profilePictureUrl: string | null;
  conversationCount: number;
  riskCount: number;
  lastMessageAt: string | null;
  sector: string | null;
  managerName: string | null;
  contactEmail: string | null;
}

export interface WhatsappMonitorConversation {
  id: string;
  dealId: string;
  title: string;
  contactName: string;
  contactPhone: string;
  remoteJid: string | null;
  isGroup: boolean;
  profilePictureUrl: string | null;
  whatsappInstanceId: string | null;
  instanceName: string | null;
  agentName: string | null;
  stageName: string | null;
  priority: DealPriority;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
  isUnread: boolean;
  markedUnread: boolean;
  lastReadAt: string | null;
  eventCount: number;
  risk: WhatsappMessageRisk | null;
}

export interface WhatsappMonitorSummaryMetrics {
  totalConversations: number;
  receivedMessages: number;
  sentMessages: number;
  mediaMessages: number;
  riskEvents: number;
  medianFirstResponseMinutes: number | null;
  averageFirstResponseMinutes: number | null;
}

export interface WhatsappMonitorAgilityLeader {
  agentId: string | null;
  agentName: string;
  profilePictureUrl: string | null;
  conversationCount: number;
  responseCount: number;
  medianFirstResponseMinutes: number | null;
  averageFirstResponseMinutes: number | null;
}

export interface WhatsappMonitorMetrics {
  summary: WhatsappMonitorSummaryMetrics;
  agilityLeaders: WhatsappMonitorAgilityLeader[];
}

export interface WhatsappAgentActivityDay {
  date: string;
  label: string;
  weekday: string;
}

export type WhatsappAgentActivityConversationKind = "private" | "customer_group" | "internal_group" | "other_group";

export interface WhatsappAgentActivityConversation {
  remoteJid: string;
  name: string;
  kind: WhatsappAgentActivityConversationKind;
  sentMessages: number;
  receivedMessages: number;
}

export interface WhatsappAgentActivityDailyPoint {
  date: string;
  label: string;
  attendedConversations: number;
  attendedGroups: number;
  attendedPrivates: number;
  sentMessages: number;
  sentMessagesPrivate: number;
  sentMessagesGroup: number;
  receivedMessages: number;
  receivedMessagesPrivate: number;
  receivedMessagesGroup: number;
  receivedUniqueMessages: number;
  receivedUniqueMessagesPrivate: number;
  receivedUniqueMessagesGroup: number;
  sentUniqueMessages: number;
  sentUniqueMessagesPrivate: number;
  sentUniqueMessagesGroup: number;
  averageFirstResponseSeconds: number | null;
}

export interface WhatsappAgentActivitySummary {
  agentId: string;
  agentName: string;
  instanceName: string | null;
  displayLabel: string | null;
  phoneNumber: string | null;
  profilePictureUrl: string | null;
  attendedConversations: number;
  attendedGroups: number;
  attendedPrivates: number;
  customerGroups: number;
  internalGroups: number;
  otherGroups: number;
  sentMessages: number;
  sentMessagesPrivate: number;
  sentMessagesGroup: number;
  receivedMessages: number;
  receivedMessagesPrivate: number;
  receivedMessagesGroup: number;
  receivedUniqueMessages: number;
  receivedUniqueMessagesPrivate: number;
  receivedUniqueMessagesGroup: number;
  sentUniqueMessages: number;
  sentUniqueMessagesPrivate: number;
  sentUniqueMessagesGroup: number;
  activeHours: number;
  responseCount: number;
  averageFirstResponseSeconds: number | null;
  lastMessageAt: string | null;
}

export interface WhatsappAgentActivityCell {
  agentId: string;
  agentName: string;
  date: string;
  hour: number;
  attendedConversations: number;
  attendedGroups: number;
  attendedPrivates: number;
  customerGroups: number;
  internalGroups: number;
  otherGroups: number;
  sentMessages: number;
  sentMessagesPrivate: number;
  sentMessagesGroup: number;
  receivedMessages: number;
  receivedMessagesPrivate: number;
  receivedMessagesGroup: number;
  receivedUniqueMessages: number;
  receivedUniqueMessagesPrivate: number;
  receivedUniqueMessagesGroup: number;
  sentUniqueMessages: number;
  sentUniqueMessagesPrivate: number;
  sentUniqueMessagesGroup: number;
  responseCount: number;
  averageFirstResponseSeconds: number | null;
  conversations: WhatsappAgentActivityConversation[];
}

export interface WhatsappAgentActivityReport {
  period: {
    startDate: string;
    endDate: string;
    days: number;
    timezone: string;
    nightStartHour: number;
    nightEndHour: number;
  };
  summary: {
    attendedConversations: number;
    attendedGroups: number;
    attendedPrivates: number;
    customerGroups: number;
    internalGroups: number;
    otherGroups: number;
    sentMessages: number;
    sentMessagesPrivate: number;
    sentMessagesGroup: number;
    receivedMessages: number;
    receivedMessagesPrivate: number;
    receivedMessagesGroup: number;
    receivedUniqueMessages: number;
    receivedUniqueMessagesPrivate: number;
    receivedUniqueMessagesGroup: number;
    sentUniqueMessages: number;
    sentUniqueMessagesPrivate: number;
    sentUniqueMessagesGroup: number;
    activeAgents: number;
    responseCount: number;
    averageFirstResponseSeconds: number | null;
  };
  previousSummary: {
    attendedConversations: number;
    attendedGroups: number;
    attendedPrivates: number;
    customerGroups: number;
    internalGroups: number;
    otherGroups: number;
    sentMessages: number;
    sentMessagesPrivate: number;
    sentMessagesGroup: number;
    receivedMessages: number;
    receivedMessagesPrivate: number;
    receivedMessagesGroup: number;
    receivedUniqueMessages: number;
    receivedUniqueMessagesPrivate: number;
    receivedUniqueMessagesGroup: number;
    sentUniqueMessages: number;
    sentUniqueMessagesPrivate: number;
    sentUniqueMessagesGroup: number;
    activeAgents: number;
    responseCount: number;
    averageFirstResponseSeconds: number | null;
  } | null;
  days: WhatsappAgentActivityDay[];
  hours: number[];
  agents: WhatsappAgentActivitySummary[];
  dailySeries: WhatsappAgentActivityDailyPoint[];
  hourlyCells: WhatsappAgentActivityCell[];
}

export interface WhatsappMonitorConversationsResponse {
  pageInfo: {
    hasNextPage: boolean;
    nextCursor: string | null;
    limit: number;
  };
  conversations: WhatsappMonitorConversation[];
}

export interface WhatsappMonitorConversationDetail extends WhatsappMonitorConversation {
  pageInfo: {
    hasPreviousPage: boolean;
    previousCursor: string | null;
    hasNextPage: boolean;
    nextCursor: string | null;
    limit: number;
  };
  messages: WhatsappMonitorMessage[];
}

export interface WhatsappConversationReadStateResponse {
  id: string;
  isUnread: boolean;
  unreadCount: number;
  markedUnread: boolean;
  lastReadAt: string | null;
}

// ── Event Types ─────────────────────────────────────────────

export type EventType =
  | "RISK"
  | "POSITIVE_FEEDBACK"
  | "NEGATIVE_FEEDBACK"
  | "COMPLAINT"
  | "PRAISE"
  | "QUESTION"
  | "ESCALATION"
  | "GREETING"
  | "NEUTRAL"
  | "CHURN_RISK"
  | "SALES_OPPORTUNITY";

export type EventSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface ConversationContext {
  contactName: string;
  contactPhone: string;
  agentName: string | null;
  instanceName: string | null;
  isGroup: boolean;
}

export interface MessageEvent {
  id: string;
  dealId: string;
  messageId: string;
  eventType: EventType;
  severity: EventSeverity;
  label: string;
  content: string;
  metadata: Record<string, unknown>;
  detectedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  conversationContext: ConversationContext;
}

// ── Sentiment Analysis ─────────────────────────────────────

export interface DailySentiment {
  date: string;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  averageScore: number;
  totalMessages: number;
}

export interface SentimentTrend {
  daily: DailySentiment[];
  weeklyAverage: number;
  monthlyAverage: number;
  trend: "IMPROVING" | "DECLINING" | "STABLE";
}

// ── Metrics ────────────────────────────────────────────────

export interface EventsSummary {
  totalEvents: number;
  unresolvedEvents: number;
  riskEvents: number;
  positiveFeedbacks: number;
  negativeFeedbacks: number;
  complaintsCount: number;
  opportunitiesCount: number;
  questionCount: number;
  actionRequiredEvents: number;
  informationalEvents: number;
  filteredNoiseCount: number;
  resolutionRate: number;
  bySeverity: Record<string, number>;
  averageSentiment: number;
}

export interface BottleneckAgent {
  agentId: string | null;
  agentName: string;
  unresolvedCount: number;
  averageResponseMinutes: number | null;
  conversationCount: number;
}

export interface OperationalEfficiency {
  averageResponseTimeMinutes: number | null;
  medianResponseTimeMinutes: number | null;
  averageResolutionTimeHours: number | null;
  messagesPerAgent: number | null;
  peakHourStart: number | null;
  peakHourEnd: number | null;
  bottleneckAgents: BottleneckAgent[];
}

export interface TopEvent {
  eventType: EventType;
  label: string;
  count: number;
  severity: EventSeverity;
  lastOccurrence: string;
}

export interface EventsExecutiveSummary {
  complaintsCount: number;
  vipComplaintsCount: number;
  opportunitiesCount: number;
  questionCount: number;
  actionRequiredEvents: number;
  informationalEvents: number;
  filteredNoiseCount: number;
  unansweredOpportunitiesCount: number;
  bottleneckAgentText: string | null;
}

export interface EventsMetrics {
  summary: EventsSummary;
  operationalEfficiency: OperationalEfficiency;
  sentimentAnalysis: SentimentTrend;
  topEvents: TopEvent[];
  executiveSummary?: EventsExecutiveSummary;
}

export interface MessageInsightExample {
  eventId: string;
  dealId: string;
  content: string;
  contactName: string;
  agentName: string | null;
  detectedAt: string;
  isGroup: boolean;
}

export interface MessageInsightTheme {
  key: string;
  title: string;
  category: "negative" | "positive" | "opportunity" | "risk";
  severity: EventSeverity;
  count: number;
  sampleCount: number;
  unresolvedCount: number;
  groupCount: number;
  privateCount: number;
  examples: MessageInsightExample[];
  lastDetectedAt: string;
}

export interface EventsCriticalAlert {
  eventId: string;
  title: string;
  severity: EventSeverity;
  content: string;
  contactName: string;
  agentName: string | null;
  detectedAt: string;
  isGroup: boolean;
}

export interface EventsAiBatchStatus {
  enabled: boolean;
  provider: string;
  model: string;
  businessHours: {
    timezone: string;
    startHour: number;
    endHour: number;
    days: number[];
  };
  dailyUsage: {
    requestCount: number;
    tokenCount: number;
    lastRunAt: string | null;
  };
  canRunNow: boolean;
  blockedReason: string | null;
  nextEligibleAt: string | null;
  canRunManually: boolean;
  manualBlockedReason: string | null;
  manualNextEligibleAt: string | null;
  latestBatch: {
    status: string;
    reason: string;
    runSource: "manual" | "automatic";
    provider: string;
    model: string;
    eventCount: number;
    periodFrom: string | null;
    periodTo: string | null;
    finishedAt: string | null;
    errorMessage: string | null;
    summary: Record<string, unknown> | null;
  } | null;
  recentBatches: Array<{
    status: string;
    reason: string;
    runSource: "manual" | "automatic";
    provider: string;
    model: string;
    eventCount: number;
    periodFrom: string | null;
    periodTo: string | null;
    finishedAt: string | null;
    errorMessage: string | null;
  }>;
}

export interface EventsIntelligenceResponse {
  generatedAt: string;
  period: {
    from: string;
    to: string;
  };
  executiveSummary: string;
  summary: {
    totalEvents: number;
    criticalOpen: number;
    negativeSignals: number;
    positiveSignals: number;
    opportunities: number;
    unresolvedEvents: number;
  };
  sourceSplit: {
    groups: number;
    private: number;
  };
  topThemes: MessageInsightTheme[];
  criticalAlerts: EventsCriticalAlert[];
  aiBatch: EventsAiBatchStatus | null;
}

// ── Filters ────────────────────────────────────────────────

export interface EventsFilters {
  eventType?: EventType[];
  severity?: EventSeverity[];
  resolved?: boolean;
  dateFrom?: string;
  dateTo?: string;
  agentId?: string;
  search?: string;
  isGroup?: boolean;
}

// ── API Responses ──────────────────────────────────────────

export interface EventsListResponse {
  events: MessageEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export interface EventResolutionInput {
  resolutionNote: string;
}

// ── Conversation Intelligence (Inteligencia de Mensagens v2) ──

export type ConversationAttentionLevel = "none" | "low" | "medium" | "high" | "critical";

export interface ConversationInsightHighlight {
  autor: string;
  texto: string;
  tipo: string;
}

export interface ConversationInsight {
  id: string;
  conversationKey: string;
  dealId: string | null;
  remoteJid: string | null;
  isGroup: boolean;
  chatName: string | null;
  agentName: string | null;
  windowDate: string;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  customerMessageCount: number;
  analyzedAt: string;
  provider: string | null;
  model: string | null;
  summary: string;
  sentimentScore: number | null;
  sentimentLabel: string | null;
  attentionLevel: ConversationAttentionLevel;
  attentionReason: string | null;
  flags: Record<string, boolean>;
  topics: string[];
  highlights: ConversationInsightHighlight[];
  actionItems: string[];
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  ackNote: string | null;
}

export type BriefingItem = string | { titulo?: string; detalhe?: string };

export interface DailyBriefing {
  id: string;
  briefingDate: string;
  generatedAt: string;
  provider: string | null;
  model: string | null;
  narrative: string;
  payload: Record<string, unknown>;
  stats: Record<string, unknown>;
}

export interface ConversationTopicStat {
  topic: string;
  count: number;
  negativeCount: number;
}

export interface ConversationAgentStat {
  agentName: string;
  conversations: number;
  complaints: number;
  opportunities: number;
  praises: number;
  averageSentiment: number | null;
}

export interface EventsIntelligenceStatus {
  enabled: boolean;
  provider: string;
  model: string;
  lastAnalysisAt: string | null;
  conversationsAnalyzedToday: number;
  messagesToday: number;
  usage: {
    requestCount: number;
    tokenCount: number;
    requestLimit: number;
    tokenLimit: number;
  };
  canRunManually: boolean;
  manualBlockedReason: string | null;
  retentionDays: number;
  lastError: string | null;
  scheduleMode: "daily" | "hourly";
  dailyRunHour: number;
}

export interface EventsOverviewStats {
  conversations: number;
  byAttention: Record<ConversationAttentionLevel, number>;
  complaints: number;
  churnRisks: number;
  unanswered: number;
  opportunities: number;
  praises: number;
  groups: number;
  privates: number;
  averageSentiment: number | null;
  openRadar: number;
}

export interface EventsCaptureHourPoint {
  hour: number;
  count: number;
}

/** Prova de que a captura e a leitura estao funcionando (sempre do dia atual). */
export interface EventsCaptureStats {
  messagesToday: number;
  lastMessageAt: string | null;
  groupConversations: number;
  privateConversations: number;
  conversationsWithCustomer: number;
  analyzedToday: number;
  pendingToday: number;
  hourly: EventsCaptureHourPoint[];
}

export interface EventsAiRunSummary {
  kind: string;
  runSource: string;
  status: string;
  eventCount: number;
  finishedAt: string | null;
  errorMessage: string | null;
}

export interface EventsOverviewResponse {
  generatedAt: string;
  period: { from: string; to: string };
  briefing: DailyBriefing | null;
  status: EventsIntelligenceStatus;
  stats: EventsOverviewStats;
  capture: EventsCaptureStats;
  runs: EventsAiRunSummary[];
  radar: ConversationInsight[];
  topics: ConversationTopicStat[];
  agents: ConversationAgentStat[];
}

export type RadarWhatsappDetailLevel = "summary" | "standard" | "complete";
export type RadarWhatsappAlertLimit = 3 | 5 | 10 | 20;

export interface RadarWhatsappOptions {
  detailLevel: RadarWhatsappDetailLevel;
  alertLimit: RadarWhatsappAlertLimit;
}

export interface RadarWhatsappPreview extends RadarWhatsappOptions {
  destinationPhone: string;
  destinationLabel: string;
  instanceLabel: string;
  period: { from: string; to: string };
  radarCount: number;
  includedAlertCount: number;
  message: string;
}

export interface RadarWhatsappSendResult {
  ok: true;
  sentAt: string;
  destinationPhone: string;
  instanceLabel: string;
  provider: string;
  providerPayload: unknown;
}

export interface ConversationInsightsListResponse {
  insights: ConversationInsight[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ConversationIntelligenceRunResult {
  status: "SKIPPED" | "SUCCEEDED" | "FAILED";
  reason?: string;
  analyzedConversations?: number;
  briefingUpdated?: boolean;
  error?: string;
}

export type EventsIntelligenceProgressPhase =
  | "queued"
  | "selecting"
  | "reading"
  | "analyzing"
  | "briefing"
  | "done"
  | "error";

export interface EventsIntelligenceProgress {
  runId: string;
  active: boolean;
  startedAt: string;
  finishedAt: string | null;
  phase: EventsIntelligenceProgressPhase;
  message: string;
  totalConversations: number;
  analyzedConversations: number;
  chunkIndex: number;
  chunkCount: number;
  result: ConversationIntelligenceRunResult | null;
}
