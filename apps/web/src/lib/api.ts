import type {
  AcquisitionMetrics,
  AmbassadorResponse,
  AgendaResponse,
  AttendantsResponse,
  AttendantPortfolioResponse,
  CarouselSlide,
  CustomerDetail,
  CustomerOpportunityDetail,
  CustomerOpportunityQueueResponse,
  CustomerCreditDetailResponse,
  CustomerCreditSettingsUpdate,
  CustomerDefectCustomerDetailResponse,
  CustomerCreditOverviewResponse,
  CustomerDefectOverviewResponse,
  CustomerDefectProductsResponse,
  CustomerDocInsightsResponse,
  CustomerLabel,
  CustomerListItem,
  DashboardMetrics,
  ExecutiveDashboardMetrics,
  DealActivity,
  DealDetail,
  DealPriority,
  DealActivityType,
  GeographicSalesResponse,
  IdeaBoardDetail,
  IdeaBoardItem,
  IdeaVoteFeedback,
  InventoryBuyingResponse,
  InventoryIntelligenceDetailResponse,
  InventoryIntelligenceResponse,
  InventoryModelDetailResponse,
  InventoryModelsResponse,
  InventorySalesReportResponse,
  InventoryOverviewResponse,
  InventoryRestockResponse,
  InventorySnapshotMeta,
  InventoryStaleResponse,
  MessageTemplate,
  MessageAutomation,
  MessageAutomationRun,
  MonthlyTarget,
  MonthlyTargetActual,
  PipelineSummary,
  ProspectContactAttemptResult,
  ProspectKeywordPreset,
  ProspectLead,
  ProspectSearchQuery,
  ProspectSearchResponse,
  ProspectingConfig,
  ProspectingDailySummary,
  SavedSegment,
  SegmentDefinition,
  SegmentResult,
  TrendRangeAnalysisResponse,
  CustomerMovementsResponse,
  WhatsappCampaignDetail,
  WhatsappCampaignListItem,
  WhatsappCampaignMessageType,
  WhatsappMenuData,
  WhatsappGroup,
  WhatsappGroupsResponse,
  WhatsappImportSummary,
  WhatsappInstanceItem,
  WhatsappInstanceProvider,
  WhatsappAgentActivityReport,
  WhatsappConversationReadStateResponse,
  WhatsappMonitorAgent,
  WhatsappMappingSummary,
  WhatsappMonitorConversationDetail,
  WhatsappMonitorConversationsResponse,
  WhatsappMonitorMetrics,
  EventsMetrics,
  EventsFilters,
  EventsIntelligenceResponse,
  MessageEvent,
  DailySentiment,
  ConversationInsight,
  ConversationInsightsListResponse,
  EventsIntelligenceProgress,
  RadarWhatsappPreview,
  RadarWhatsappSendResult,
  RadarWhatsappOptions,
  EventsOverviewResponse,
} from "@olist-crm/shared";

export interface ChartAnnotation {
  id?: string;
  date: string;
  label: string;
  description: string;
}

import type { AuthUser } from "../hooks/useAuth";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
export const API_REQUEST_TIMEOUT_MS = 30_000;
// A primeira leitura do snapshot financeiro reprocessa a planilha de saldos
// (60MB+), o que pode levar mais de 1 minuto. Damos uma folga maior so para
// essas chamadas; depois o resultado fica em cache e responde em milissegundos.
export const CREDIT_REQUEST_TIMEOUT_MS = 180_000;

type EventsQuery = EventsFilters & {
  eventType?: EventsFilters["eventType"] | string;
  severity?: EventsFilters["severity"] | string;
};

function appendEventsQuery(search: URLSearchParams, query: EventsQuery) {
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    search.set(key, Array.isArray(value) ? value.join(",") : String(value));
  });
}

export class ApiAuthError extends Error {
  status = 401;

  constructor(message = "Sessao invalida") {
    super(message);
    this.name = "ApiAuthError";
  }
}

export function isApiAuthError(error: unknown) {
  return error instanceof ApiAuthError || (
    error instanceof Error &&
    error.name === "ApiAuthError"
  );
}

export interface PermissionDefinition {
  key: string;
  name: string;
  description: string;
}

export interface UserPermissionOverride {
  permissionKey: string;
  allowed: boolean;
}

export interface OffboardingCustomer {
  customerId: string;
  customerCode: string;
  displayName: string;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number;
  avgPiecesPerMonth: number;
  totalOrders: number;
}

export type LifecycleStage = "ATENCAO_1" | "ATENCAO_2" | "INATIVO" | "INATIVO_30";

export interface LifecycleStageConfig {
  stage: LifecycleStage;
  label: string;
  templateId: string | null;
  templateTitle: string | null;
  enabled: boolean;
}

export interface ScheduledLifecycleEntry {
  customerId: string;
  customerCode: string;
  displayName: string;
  daysSinceLastPurchase: number;
  targetStage: LifecycleStage;
  daysUntil: number;
  crossDate: string;
  templateId: string | null;
  templateTitle: string | null;
}

export interface RecoveredCustomer {
  customerId: string;
  displayName: string;
  stage: LifecycleStage;
  recoverDate: string;
  daysToRecover: number;
}

export interface LifecycleRecovery {
  contacted: number;
  recoveredCount: number;
  recoveryRate: number;
  messagesSent: number;
  recovered: RecoveredCustomer[];
}

export interface JourneyStep {
  stage: LifecycleStage;
  action: string;
  templateTitle: string | null;
  sentAt: string;
}

export interface CustomerJourney {
  customerId: string;
  displayName: string;
  customerCode: string;
  steps: JourneyStep[];
  recoverDate: string | null;
  attributedStage: LifecycleStage | null;
  repliedAt: string | null;
  discarded: boolean;
  daysSinceLastPurchase: number | null;
  currentStage: LifecycleStage | "ATIVO" | null;
  status: "RECUPERADO" | "RESPONDEU" | "DESCARTADO" | "AGUARDANDO";
}

export interface LifecycleOverview {
  stageCounts: Record<LifecycleStage, number>;
  discardedCount: number;
  pendingCandidates: number;
  automationEnabled: boolean;
  simulationOnly: boolean;
  runHour: number;
  timezone: string;
  totalWatched: number;
  recentEvents: {
    customerId: string;
    displayName: string;
    stage: LifecycleStage;
    action: string;
    templateTitle: string | null;
    daysSinceLastPurchase: number | null;
    createdAt: string;
  }[];
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "vendas" | "financeiro" | "operacional" | "viewer";
  is_active: boolean;
  isActive?: boolean;
  created_at: string;
  updated_at: string;
  last_sign_in_at?: string | null;
  permission_overrides?: UserPermissionOverride[];
  permissions: string[];
}

export interface AdminUserInput {
  email: string;
  fullName: string;
  role: "admin" | "vendas" | "financeiro" | "operacional" | "viewer";
  isActive: boolean;
  permissionOverrides: UserPermissionOverride[];
  password?: string;
}

export interface ProductComplaintsFilters {
  model?: string;
  exact?: boolean;
  category?: "reclamacao" | "defeito";
  dateFrom?: string;
  dateTo?: string;
}

export interface ProductComplaintModelRow {
  model: string;
  total: number;
  distinctClients: number;
  complaints: number;
  defects: number;
  firstDate: string;
  lastDate: string;
  worstSeverity: string;
  monthly: number[];
}

export interface ProductComplaintsModelReport {
  months: string[];
  models: ProductComplaintModelRow[];
}

export interface ProductComplaintItem {
  id: string;
  windowDate: string;
  dealId: string | null;
  isGroup: boolean;
  chatName: string | null;
  agentName: string | null;
  customerName: string | null;
  modelRaw: string;
  modelNormalized: string;
  category: string;
  severity: string;
  detail: string;
  quote: string | null;
  source: string;
  occurredAt: string | null;
}

export interface ProductComplaintsListResponse {
  items: ProductComplaintItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductComplaintsOverview {
  summary: {
    total: number;
    distinctClients: number;
    distinctModels: number;
    complaints: number;
    defects: number;
    lastDate: string | null;
  };
  monthly: Array<{ month: string; total: number; distinctClients: number }>;
  topModels: Array<{ model: string; total: number; distinctClients: number; lastDate: string }>;
  topClients: Array<{ client: string; total: number; distinctModels: number; lastDate: string }>;
}

export interface GeneralComplaintsFilters {
  category?: "atendimento" | "vendedora" | "entrega" | "cobranca" | "outro";
  agentName?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface GeneralComplaintItem {
  id: string;
  windowDate: string;
  conversationKey: string;
  dealId: string | null;
  isGroup: boolean;
  chatName: string | null;
  customerName: string | null;
  agentName: string | null;
  category: string;
  severity: string;
  detail: string;
  quote: string | null;
  source: string;
  occurredAt: string | null;
}

export interface GeneralComplaintsListResponse {
  items: GeneralComplaintItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GeneralComplaintsOverview {
  summary: {
    total: number;
    distinctClients: number;
    distinctAgents: number;
    lastDate: string | null;
  };
  agentRanking: Array<{ agent: string; total: number; distinctClients: number; lastDate: string }>;
  byCategory: Array<{ category: string; total: number }>;
  monthly: Array<{ month: string; total: number }>;
}

function createRequestSignal(upstreamSignal?: AbortSignal | null, timeoutMs: number = API_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  const abortFromUpstream = () => controller.abort();
  if (upstreamSignal?.aborted) {
    controller.abort();
  } else {
    upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      globalThis.clearTimeout(timeoutId);
      upstreamSignal?.removeEventListener("abort", abortFromUpstream);
    },
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  didRefreshAuth = false,
  timeoutMs: number = API_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const { signal, cleanup } = createRequestSignal(options.signal, timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        const payload = (await response.json().catch(() => ({ message: "Sessao invalida" }))) as { message?: string };
        const message = payload.message ?? "Sessao invalida";

        if (token && !didRefreshAuth) {
          try {
            const { supabase } = await import("./supabase");
            const { data, error } = await supabase.auth.refreshSession();
            const refreshedToken = data.session?.access_token;
            if (!error && refreshedToken && refreshedToken !== token) {
              return request<T>(path, options, refreshedToken, true, timeoutMs);
            }
          } catch {
            // Renovacao falhou (rede/transitorio): NAO apagar a sessao aqui.
          }
        }

        // Nunca chamamos supabase.auth.signOut() aqui: um 401 isolado (soluco do
        // Supabase Auth, token momentaneamente expirado, etc.) nao deve destruir a
        // sessao persistida. Apenas sinalizamos o erro; quem decide deslogar e o
        // fluxo de autenticacao (useAuth), que so descarta a sessao apos confirmar
        // que ela e realmente invalida.
        throw new ApiAuthError(message);
      }
      const payload = (await response.json().catch(() => ({ message: "Request failed" }))) as { message?: string };
      throw new Error(payload.message ?? "Request failed");
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError" && !options.signal?.aborted) {
      throw new Error("Tempo limite excedido ao conectar com a API");
    }
    throw error;
  } finally {
    cleanup();
  }
}

export const api = {
  login(email: string, password: string) {
    return request<{ token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  me(token: string) {
    return request<{ user: AuthUser }>("/api/auth/me", {}, token);
  },
  /**
   * Get dashboard metrics
   * @param token Authentication token
   * @param trendDays Optional number of days for portfolio trend data (1-3650, default: 90)
   */
  dashboard(token: string, trendDays?: number, customerPrefix?: string) {
    const search = new URLSearchParams();
    if (trendDays !== undefined) {
      search.set("trendDays", String(trendDays));
    }
    if (customerPrefix !== undefined) {
      search.set("customerPrefix", customerPrefix);
    }
    return request<DashboardMetrics>(`/api/dashboard/metrics${search.toString() ? `?${search.toString()}` : ""}`, {}, token);
  },
  executiveDashboard(filters: { year: number; month: number; day: number | null }) {
    const search = new URLSearchParams({
      year: String(filters.year),
      month: String(filters.month),
    });
    if (filters.day !== null) {
      search.set("day", String(filters.day));
    }
    return request<ExecutiveDashboardMetrics>(`/api/dashboard/executive?${search.toString()}`);
  },
  dashboardTrendRangeAnalysis(token: string, startDate: string, endDate: string) {
    const search = new URLSearchParams({
      startDate,
      endDate,
    });
    return request<TrendRangeAnalysisResponse>(`/api/dashboard/trend-range-analysis?${search.toString()}`, {}, token);
  },
  customerMovements(token: string, days: number = 7) {
    const search = new URLSearchParams({
      days: String(days),
    });
    return request<CustomerMovementsResponse>(`/api/dashboard/movements?${search.toString()}`, {}, token);
  },
  getMonthlyTargets(token: string, year?: number) {
    const search = new URLSearchParams();
    if (year) search.set("year", String(year));
    return request<MonthlyTarget[]>(`/api/dashboard/targets${search.toString() ? `?${search.toString()}` : ""}`, {}, token);
  },
  getMonthlyTargetActuals(token: string, year: number) {
    const search = new URLSearchParams({ year: String(year) });
    return request<MonthlyTargetActual[]>(`/api/dashboard/target-actuals?${search.toString()}`, {}, token);
  },
  saveMonthlyTarget(
    token: string,
    year: number,
    month: number,
    targetAmount: number,
    attendant = 'TOTAL',
    targetRevenue = 0,
    targetBatteries = 0,
    targetScreenXp = 0,
    targetScreenVv = 0,
    targetScreenDe = 0,
    targetChargingDocks = 0,
  ) {
    return request<void>("/api/dashboard/targets", {
      method: "POST",
      body: JSON.stringify({
        year,
        month,
        targetAmount,
        targetBatteries,
        targetScreenXp,
        targetScreenVv,
        targetScreenDe,
        targetChargingDocks,
        attendant,
        targetRevenue,
      }),
    }, token);
  },
  deleteMonthlyTarget(token: string, year: number, month: number, attendant: string) {
    const search = new URLSearchParams({ year: String(year), month: String(month), attendant });
    return request<void>(`/api/dashboard/targets?${search.toString()}`, {
      method: "DELETE",
    }, token);
  },
  acquisition(token: string) {
    return request<AcquisitionMetrics>("/api/dashboard/acquisition", {}, token);
  },
  attendants(token: string, windowMonths: 3 | 6 | 12 | 24 = 12) {
    const search = new URLSearchParams({
      windowMonths: String(windowMonths),
    });
    return request<AttendantsResponse>(`/api/attendants?${search.toString()}`, {}, token);
  },
  attendantPortfolio(token: string, attendant: string, windowMonths: 3 | 6 | 12 | 24 = 12) {
    const search = new URLSearchParams({ windowMonths: String(windowMonths) });
    return request<AttendantPortfolioResponse>(
      `/api/attendants/${encodeURIComponent(attendant)}/portfolio?${search.toString()}`,
      {},
      token,
    );
  },
  ambassadors(token: string) {
    return request<AmbassadorResponse>("/api/ambassadors", {}, token);
  },
  agenda(token: string, limit?: number, offset?: number, query: Record<string, string | number | boolean | undefined> = {}) {
    const search = new URLSearchParams();
    if (limit !== undefined) {
      search.set("limit", String(limit));
    }
    if (offset !== undefined) {
      search.set("offset", String(offset));
    }
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        search.set(key, String(value));
      }
    });
    return request<AgendaResponse>(`/api/agenda${search.toString() ? `?${search.toString()}` : ""}`, {}, token);
  },
  customers(token: string, query: Record<string, string | number | boolean | undefined>) {
    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        search.set(key, String(value));
      }
    });
    return request<CustomerListItem[]>(`/api/customers?${search.toString()}`, {}, token);
  },
  customerDocInsights(token: string) {
    return request<CustomerDocInsightsResponse>("/api/customer-insights/doc", {}, token);
  },
  customerDefectOverview(token: string) {
    return request<CustomerDefectOverviewResponse>("/api/customer-defects/overview", {}, token, false, CREDIT_REQUEST_TIMEOUT_MS);
  },
  customerDefectCustomerDetail(token: string, customerCode: string) {
    return request<CustomerDefectCustomerDetailResponse>(
      `/api/customer-defects/customers/${encodeURIComponent(customerCode)}`,
      {},
      token,
      false,
      CREDIT_REQUEST_TIMEOUT_MS,
    );
  },
  customerDefectProducts(token: string, year: number) {
    return request<CustomerDefectProductsResponse>(
      `/api/customer-defects/products?year=${encodeURIComponent(year)}`,
      {},
      token,
      false,
      CREDIT_REQUEST_TIMEOUT_MS,
    );
  },
  refreshCustomerDefectOverview(token: string) {
    return request<CustomerDefectOverviewResponse>("/api/customer-defects/refresh", {
      method: "POST",
    }, token, false, CREDIT_REQUEST_TIMEOUT_MS);
  },
  getGeographicSalesStats(token: string) {
    return request<GeographicSalesResponse>("/api/geographic/sales", {}, token);
  },
  getGeographicModelSales(token: string, options: { state?: string; city?: string; year?: number }) {
    const params = new URLSearchParams();
    if (options.state) params.set("state", options.state);
    if (options.city) params.set("city", options.city);
    if (options.year) params.set("year", String(options.year));
    return request<{
      regionName: string;
      state: string | null;
      city: string | null;
      year: number;
      isFallback: boolean;
      data: Array<{ model: string; quantitySold: number; totalRevenue: number }>;
    }>(`/api/geographic/model-sales?${params.toString()}`, {}, token);
  },
  customerCreditOverview(token: string) {
    return request<CustomerCreditOverviewResponse>("/api/customer-credit/overview", {}, token, false, CREDIT_REQUEST_TIMEOUT_MS);
  },
  refreshCustomerCreditOverview(token: string) {
    return request<CustomerCreditOverviewResponse>("/api/customer-credit/refresh", {
      method: "POST",
    }, token, false, CREDIT_REQUEST_TIMEOUT_MS);
  },
  customerCreditOpportunities(token: string) {
    return request<CustomerOpportunityQueueResponse>("/api/customer-credit/opportunities", {}, token, false, CREDIT_REQUEST_TIMEOUT_MS);
  },
  inventorySnapshot(token: string) {
    return request<InventorySnapshotMeta | null>("/api/inventory/snapshot", {}, token);
  },
  refreshInventorySnapshot(token: string) {
    return request<InventorySnapshotMeta | null>("/api/inventory/refresh", {
      method: "POST",
    }, token);
  },
  inventoryIntelligence(
    token: string,
    query: Record<string, string | number | boolean | undefined> = {},
  ) {
    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        search.set(key, String(value));
      }
    });
    return request<InventoryIntelligenceResponse>(
      `/api/inventory/intelligence${search.toString() ? `?${search.toString()}` : ""}`,
      {},
      token,
    );
  },
  inventoryItemDetail(token: string, sku: string) {
    return request<InventoryIntelligenceDetailResponse>(`/api/inventory/items/${encodeURIComponent(sku)}`, {}, token);
  },
  inventoryOverview(token: string) {
    return request<InventoryOverviewResponse>("/api/inventory/overview", {}, token);
  },
  inventoryBuying(token: string) {
    return request<InventoryBuyingResponse>("/api/inventory/buying", {}, token);
  },
  inventoryRestock(token: string) {
    return request<InventoryRestockResponse>("/api/inventory/restock", {}, token);
  },
  inventoryStale(token: string) {
    return request<InventoryStaleResponse>("/api/inventory/stale", {}, token);
  },
  inventorySalesReport(token: string) {
    return request<InventorySalesReportResponse>("/api/inventory/sales-report", {}, token);
  },
  inventoryModels(token: string) {
    return request<InventoryModelsResponse>("/api/inventory/models", {}, token);
  },
  inventoryModelDetail(token: string, modelKey: string) {
    return request<InventoryModelDetailResponse>(`/api/inventory/models/${encodeURIComponent(modelKey)}`, {}, token);
  },
  customer(token: string, id: string) {
    return request<CustomerDetail>(`/api/customers/${id}`, {}, token);
  },
  customerCreditDetail(
    token: string,
    id: string,
    pagination: { ordersOffset?: number; paymentsOffset?: number; pageSize?: number } = {},
  ) {
    const search = new URLSearchParams();
    if (pagination.ordersOffset) search.set("ordersOffset", String(pagination.ordersOffset));
    if (pagination.paymentsOffset) search.set("paymentsOffset", String(pagination.paymentsOffset));
    if (pagination.pageSize) search.set("pageSize", String(pagination.pageSize));
    const query = search.toString();
    return request<CustomerCreditDetailResponse>(
      `/api/customers/${id}/credit${query ? `?${query}` : ""}`,
      {},
      token,
      false,
      CREDIT_REQUEST_TIMEOUT_MS,
    );
  },
  updateCustomerCreditSettings(token: string, id: string, input: CustomerCreditSettingsUpdate) {
    return request<CustomerCreditDetailResponse>(`/api/customers/${id}/credit-settings`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }, token);
  },
  customerOpportunity(token: string, id: string) {
    return request<CustomerOpportunityDetail>(`/api/customers/${id}/opportunity`, {}, token);
  },
  customerLabels(token: string) {
    return request<CustomerLabel[]>("/api/customer-labels", {}, token);
  },
  createCustomerLabel(token: string, name: string) {
    return request<CustomerLabel>("/api/customer-labels", {
      method: "POST",
      body: JSON.stringify({ name }),
    }, token);
  },
  updateCustomerLabel(token: string, id: string, color: string) {
    return request<CustomerLabel>(`/api/customer-labels/${id}`, {
      method: "PUT",
      body: JSON.stringify({ color }),
    }, token);
  },
  deleteCustomerLabel(token: string, id: string) {
    return request<void>(`/api/customer-labels/${id}`, {
      method: "DELETE",
    }, token);
  },
  updateCustomerLabels(token: string, id: string, input: { labels?: string[]; internalNotes?: string }) {
    return request<CustomerDetail>(`/api/customers/${id}/labels`, {
      method: "PUT",
      body: JSON.stringify(input),
    }, token);
  },
  updateCustomerAmbassador(token: string, id: string, isAmbassador: boolean) {
    return request<CustomerDetail>(`/api/customers/${id}/ambassador`, {
      method: "PUT",
      body: JSON.stringify({ isAmbassador }),
    }, token);
  },
  previewSegment(token: string, definition: SegmentDefinition) {
    return request<SegmentResult>("/api/segments/preview", {
      method: "POST",
      body: JSON.stringify(definition),
    }, token);
  },
  savedSegments(token: string) {
    return request<SavedSegment[]>("/api/segments/saved", {}, token);
  },
  createSavedSegment(token: string, input: { name: string; definition: SegmentDefinition }) {
    return request<SavedSegment>("/api/segments/saved", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  updateSavedSegment(token: string, id: string, input: { name: string; definition: SegmentDefinition }) {
    return request<SavedSegment>(`/api/segments/saved/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }, token);
  },
  deleteSavedSegment(token: string, id: string) {
    return request<void>(`/api/segments/saved/${id}`, {
      method: "DELETE",
    }, token);
  },
  automations(token: string) {
    return request<MessageAutomation[]>("/api/automations", {}, token);
  },
  createAutomation(
    token: string,
    input: {
      name: string;
      status: "ACTIVE" | "PAUSED";
      channel: "WHATSAPP_GROUP";
      sendMode?: "AUTOMATIC" | "APPROVAL";
      triggerMode?: "SCHEDULED" | "ON_STAGE_ENTRY";
      savedSegmentId?: string | null;
      segmentDefinition: SegmentDefinition;
      flowDefinition?: Record<string, unknown>;
      whatsappInstanceId?: string | null;
      templateId?: string | null;
      messageText: string;
      schedule: {
        frequency: "DAILY" | "WEEKLY";
        weekdays?: number[];
        time: string;
        timezone: string;
      };
      overrideRecentBlock?: boolean;
      minDelaySeconds?: number;
      maxDelaySeconds?: number;
    },
  ) {
    return request<MessageAutomation>("/api/automations", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  updateAutomation(
    token: string,
    id: string,
    input: {
      name: string;
      status: "ACTIVE" | "PAUSED";
      channel: "WHATSAPP_GROUP";
      sendMode?: "AUTOMATIC" | "APPROVAL";
      triggerMode?: "SCHEDULED" | "ON_STAGE_ENTRY";
      savedSegmentId?: string | null;
      segmentDefinition: SegmentDefinition;
      flowDefinition?: Record<string, unknown>;
      whatsappInstanceId?: string | null;
      templateId?: string | null;
      messageText: string;
      schedule: {
        frequency: "DAILY" | "WEEKLY";
        weekdays?: number[];
        time: string;
        timezone: string;
      };
      overrideRecentBlock?: boolean;
      minDelaySeconds?: number;
      maxDelaySeconds?: number;
    },
  ) {
    return request<MessageAutomation>(`/api/automations/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }, token);
  },
  deleteAutomation(token: string, id: string) {
    return request<void>(`/api/automations/${id}`, {
      method: "DELETE",
    }, token);
  },
  runAutomationNow(token: string, id: string, sendMode?: "AUTOMATIC" | "APPROVAL") {
    return request<MessageAutomationRun>(`/api/automations/${id}/run-now`, {
      method: "POST",
      body: JSON.stringify(sendMode ? { sendMode } : {}),
    }, token);
  },
  automationRuns(token: string, limit = 100) {
    return request<MessageAutomationRun[]>(`/api/automations/runs?limit=${limit}`, {}, token);
  },
  approveAutomationRun(token: string, id: string) {
    return request<MessageAutomationRun>(`/api/automations/runs/${id}/approve`, {
      method: "POST",
    }, token);
  },
  rejectAutomationRun(token: string, id: string) {
    return request<MessageAutomationRun>(`/api/automations/runs/${id}/reject`, {
      method: "POST",
    }, token);
  },
  messageTemplates(token: string) {
    return request<MessageTemplate[]>("/api/messages/templates", {}, token);
  },
  createMessageTemplate(token: string, input: Pick<MessageTemplate, "category" | "title" | "content" | "messageType" | "mediaUrl">) {
    return request<MessageTemplate>("/api/messages/templates", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  updateMessageTemplate(token: string, id: string, input: Pick<MessageTemplate, "category" | "title" | "content" | "messageType" | "mediaUrl">) {
    return request<MessageTemplate>(`/api/messages/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }, token);
  },
  deleteMessageTemplate(token: string, id: string) {
    return request<void>(`/api/messages/templates/${id}`, {
      method: "DELETE",
    }, token);
  },
  offboardingUpcoming(token: string, days = 1) {
    return request<{ days: number; customers: OffboardingCustomer[] }>(
      `/api/offboarding-alert/upcoming?days=${days}`,
      {},
      token,
    );
  },
  offboardingByDay(token: string, offset: number) {
    return request<{ offset: number; customers: OffboardingCustomer[] }>(
      `/api/offboarding-alert/day?offset=${offset}`,
      {},
      token,
    );
  },
  offboardingBacklog(token: string, withinDays: number | "all") {
    const qs = withinDays === "all" ? "all" : String(withinDays);
    return request<{ withinDays: number | null; customers: OffboardingCustomer[] }>(
      `/api/offboarding-alert/backlog?withinDays=${qs}`,
      {},
      token,
    );
  },
  offboardingSend(token: string, customerIds: string[]) {
    return request<{
      customers: OffboardingCustomer[];
      messages: string[];
      sent: boolean;
      skippedCustomerIds?: string[];
      skippedReason?: "recent_duplicate";
    }>(
      "/api/offboarding-alert/send",
      { method: "POST", body: JSON.stringify({ customerIds }) },
      token,
    );
  },
  lifecycleOverview(token: string) {
    return request<LifecycleOverview>("/api/lifecycle/overview", {}, token);
  },
  lifecycleConfig(token: string) {
    return request<LifecycleStageConfig[]>("/api/lifecycle/config", {}, token);
  },
  setLifecycleConfig(token: string, stage: LifecycleStage, templateId: string | null, enabled: boolean) {
    return request<LifecycleStageConfig[]>(
      `/api/lifecycle/config/${stage}`,
      { method: "PUT", body: JSON.stringify({ templateId, enabled }) },
      token,
    );
  },
  lifecycleRun(token: string) {
    return request<{ processed: number; simulated: number; sent: number; skipped: number; simulationOnly: boolean }>(
      "/api/lifecycle/run",
      { method: "POST" },
      token,
    );
  },
  lifecycleScheduled(token: string, days = 7) {
    return request<{ days: number; entries: ScheduledLifecycleEntry[] }>(
      `/api/lifecycle/scheduled?days=${days}`,
      {},
      token,
    );
  },
  lifecycleRecovery(token: string) {
    return request<LifecycleRecovery>("/api/lifecycle/recovery", {}, token);
  },
  lifecycleJourneys(token: string, limit = 100) {
    return request<{ journeys: CustomerJourney[] }>(`/api/lifecycle/journeys?limit=${limit}`, {}, token);
  },
  lifecycleHandoff(token: string, customerId: string) {
    return request<{ sent: boolean; detail: string }>(
      "/api/lifecycle/handoff",
      { method: "POST", body: JSON.stringify({ customerId }) },
      token,
    );
  },
  lifecycleTriggerIndividual(token: string, customerId: string, targetStage: LifecycleStage) {
    return request<{ success: boolean; detail: string }>(
      "/api/lifecycle/trigger-individual",
      { method: "POST", body: JSON.stringify({ customerId, targetStage }) },
      token,
    );
  },
  lifecycleSkipIndividual(token: string, customerId: string, targetStage: LifecycleStage) {
    return request<{ success: boolean }>(
      "/api/lifecycle/skip-individual",
      { method: "POST", body: JSON.stringify({ customerId, targetStage }) },
      token,
    );
  },
  sendTestMessage(token: string, input: { messageText: string; messageType: string; carouselData?: any; menuData?: WhatsappMenuData; videoUrl?: string; imageUrl?: string; whatsappInstanceId?: string }) {
    return request<{ success: boolean; result: any }>("/api/messages/test", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  sendWhatsappMessage(token: string, input: { instanceId: string; jid: string; message: string; campaignId?: string | null }) {
    return request<{ success: boolean; messageId: string }>("/api/whatsapp/send-message", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  listIdeas(token: string) {
    return request<IdeaBoardItem[]>("/api/ideas", {}, token);
  },
  createIdea(
    token: string,
    input: { title: string; description: string; isAnonymous: boolean; authorDisplayName?: string },
  ) {
    return request<IdeaBoardDetail>("/api/ideas", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  getIdea(token: string, id: string) {
    return request<IdeaBoardDetail>(`/api/ideas/${id}`, {}, token);
  },
  deleteIdea(token: string, id: string) {
    return request<void>(`/api/ideas/${id}`, {
      method: "DELETE",
    }, token);
  },
  moveIdeaLane(token: string, id: string, input: { laneId: "INBOX" | "SUPPORT" | "REFINE" | "STOP" | null }) {
    return request<IdeaBoardDetail>(`/api/ideas/${id}/lane`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }, token);
  },
  notifyIdeaWhatsapp(token: string, id: string) {
    return request<void>(`/api/ideas/${id}/notify-whatsapp`, {
      method: "POST",
    }, token);
  },
  submitIdeaVote(
    token: string,
    id: string,
    input: { option: "LIKE" | "MAYBE" | "NO"; comment?: string },
  ) {
    return request<IdeaBoardDetail>(`/api/ideas/${id}/vote`, {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  ideaFeedbacks(token: string, id: string) {
    return request<IdeaVoteFeedback[]>(`/api/ideas/${id}/feedback`, {}, token);
  },
  prospectingConfig(token: string) {
    return request<ProspectingConfig>("/api/prospecting/config", {}, token);
  },
  createProspectPreset(token: string, keyword: string) {
    return request<ProspectKeywordPreset>("/api/prospecting/presets", {
      method: "POST",
      body: JSON.stringify({ keyword }),
    }, token);
  },
  prospectingSearch(token: string, query: ProspectSearchQuery) {
    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        search.set(key, String(value));
      }
    });
    return request<ProspectSearchResponse>(`/api/prospecting/search?${search.toString()}`, {}, token);
  },
  prospectingSummary(token: string) {
    return request<ProspectingDailySummary>("/api/prospecting/summary", {}, token);
  },
  claimProspectLead(token: string, id: string) {
    return request<ProspectLead>(`/api/prospecting/leads/${id}/claim`, {
      method: "POST",
    }, token);
  },
  releaseProspectLead(token: string, id: string) {
    return request<ProspectLead>(`/api/prospecting/leads/${id}/release`, {
      method: "POST",
    }, token);
  },
  createProspectContactAttempt(
    token: string,
    id: string,
    input: { channel: "WHATSAPP" | "PHONE" | "SITE" | "OTHER"; contactType: "FIRST_CONTACT" | "FOLLOW_UP" | "NO_RESPONSE" | "INTERESTED" | "DISQUALIFIED"; notes?: string },
  ) {
    return request<ProspectContactAttemptResult>(`/api/prospecting/leads/${id}/contact-attempts`, {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  discardProspectLead(token: string, id: string, reason?: string) {
    return request<ProspectLead>(`/api/prospecting/leads/${id}/discard`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }, token);
  },
  permissions(token: string) {
    return request<PermissionDefinition[]>("/api/admin/permissions", {}, token);
  },
  users(token: string) {
    return request<AdminUser[]>("/api/admin/users", {}, token);
  },
  createUser(token: string, input: AdminUserInput) {
    return request<AdminUser[]>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  updateUser(token: string, id: string, input: AdminUserInput) {
    return request<AdminUser[]>(`/api/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }, token);
  },
  setUserActive(token: string, id: string, isActive: boolean) {
    return request<AdminUser[]>(`/api/admin/users/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }, token);
  },
  resetUserPassword(token: string, id: string) {
    return request<{ email: string; actionLink: string | null }>(`/api/admin/users/${id}/reset-password`, {
      method: "POST",
    }, token);
  },
  setUserPassword(token: string, id: string, password: string) {
    return request<{ ok: boolean }>(`/api/admin/users/${id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    }, token);
  },
  syncData(token: string, mode: "queue" | "direct" = "direct") {
    return request<{ mode: string; jobId?: string | number; result?: unknown }>("/api/admin/sync", {
      method: "POST",
      body: JSON.stringify({ mode }),
    }, token);
  },
  whatsappGroups(
    token: string,
    query: Record<string, string | number | boolean | undefined> = {},
  ) {
    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        search.set(key, String(value));
      }
    });
    return request<WhatsappGroupsResponse>(`/api/whatsapp-groups${search.toString() ? `?${search.toString()}` : ""}`, {}, token);
  },
  whatsappGroupMappingSummary(
    token: string,
    query: Record<string, string | number | boolean | undefined> = {},
  ) {
    const search = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        search.set(key, String(value));
      }
    });
    return request<WhatsappMappingSummary>(
      `/api/whatsapp-groups/mapping-summary${search.toString() ? `?${search.toString()}` : ""}`,
      {},
      token,
    );
  },
  importWhatsappGroups(token: string, input: { fileName: string; fileBase64: string }) {
    return request<WhatsappImportSummary>("/api/whatsapp-groups/import", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  importWhatsappGroupsDefault(token: string) {
    return request<WhatsappImportSummary>("/api/whatsapp-groups/import-default", {
      method: "POST",
    }, token);
  },
  updateWhatsappGroupMatch(
    token: string,
    id: string,
    input: {
      customerId?: string | null;
      mappingStatus: "MANUAL_MAPPED" | "CONFIRMED_UNMATCHED" | "IGNORED";
      note?: string;
    },
  ) {
    return request<WhatsappGroup>(`/api/whatsapp-groups/${id}/match`, {
      method: "PUT",
      body: JSON.stringify(input),
    }, token);
  },
  whatsappCampaigns(token: string, limit = 20) {
    return request<WhatsappCampaignListItem[]>(`/api/whatsapp-campaigns?limit=${limit}`, {}, token);
  },
  whatsappCampaign(token: string, id: string, query: { limit?: number; offset?: number; excludePerformance?: boolean } = {}) {
    const search = new URLSearchParams();
    if (query.limit !== undefined) {
      search.set("limit", String(query.limit));
    }
    if (query.offset !== undefined) {
      search.set("offset", String(query.offset));
    }
    if (query.excludePerformance !== undefined) {
      search.set("excludePerformance", String(query.excludePerformance));
    }
    return request<WhatsappCampaignDetail>(
      `/api/whatsapp-campaigns/${id}${search.toString() ? `?${search.toString()}` : ""}`,
      {},
      token,
    );
  },
  createWhatsappCampaign(
    token: string,
    input: {
      name: string;
      templateId?: string | null;
      savedSegmentId?: string | null;
      whatsappInstanceId?: string | null;
      messageText: string;
      messageType?: WhatsappCampaignMessageType;
      carouselData?: CarouselSlide[] | null;
      menuData?: WhatsappMenuData | null;
      videoUrl?: string | null;
      imageUrl?: string | null;
      autoReplyText?: string | null;
      filtersSnapshot?: Record<string, unknown>;
      groupIds: string[];
      overrideRecentBlock?: boolean;
      minDelaySeconds?: number;
      maxDelaySeconds?: number;
      scheduledStartAt?: string | null;
    },
  ) {
    return request<WhatsappCampaignDetail>("/api/whatsapp-campaigns", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  whatsappCampaignRecipientChat(token: string, campaignId: string, recipientId: string) {
    return request<{ messages: Array<{
      id: string;
      direction: "INBOUND" | "OUTBOUND";
      content: string;
      senderName: string | null;
      senderAvatarUrl: string | null;
      source: string;
      createdAt: string;
    }> }>(`/api/whatsapp-campaigns/${campaignId}/recipients/${recipientId}/chat`, {}, token);
  },
  cancelWhatsappCampaign(token: string, id: string) {
    return request<WhatsappCampaignDetail | null>(`/api/whatsapp-campaigns/${id}/cancel`, {
      method: "POST",
    }, token);
  },
  deleteCampaign(token: string, id: string) {
    return request<void>(`/api/whatsapp-campaigns/${id}`, {
      method: "DELETE",
    }, token);
  },
  resumeWhatsappCampaign(token: string, id: string) {
    return request<WhatsappCampaignDetail | null>(`/api/whatsapp-campaigns/${id}/resume`, {
      method: "POST",
    }, token);
  },
  pauseWhatsappCampaign(token: string, id: string) {
    return request<WhatsappCampaignDetail | null>(`/api/whatsapp-campaigns/${id}/pause`, {
      method: "POST",
    }, token);
  },
  retryAllFailedWhatsappCampaign(token: string, id: string) {
    return request<(WhatsappCampaignDetail & { retried: number }) | null>(`/api/whatsapp-campaigns/${id}/retry-failed`, {
      method: "POST",
    }, token);
  },
  skipWhatsappCampaignRecipient(token: string, id: string, recipientId: string) {
    return request<{ skipped: boolean; recipientId: string }>(`/api/whatsapp-campaigns/${id}/recipients/${recipientId}/skip`, {
      method: "POST",
    }, token);
  },
  retryWhatsappCampaignRecipient(token: string, id: string, recipientId: string) {
    return request<{ retried: boolean; recipientId: string }>(`/api/whatsapp-campaigns/${id}/recipients/${recipientId}/retry`, {
      method: "POST",
    }, token);
  },

  whatsappMonitorConversations(
    token: string,
    query: {
      instanceId?: string;
      search?: string;
      contactName?: string;
      contactPhone?: string;
      period?: "today" | "yesterday" | "7d" | "30d";
      status?: "unread" | "risk";
      group?: "groups" | "contacts";
      agentInteraction?: "sent";
      limit?: number;
      cursor?: string;
      updatedSince?: string;
    } = {},
    options: { signal?: AbortSignal } = {},
  ) {
    const search = new URLSearchParams();
    if (query.instanceId) {
      search.set("instanceId", query.instanceId);
    }
    if (query.search) {
      search.set("search", query.search);
    }
    if (query.contactName) {
      search.set("contactName", query.contactName);
    }
    if (query.contactPhone) {
      search.set("contactPhone", query.contactPhone);
    }
    if (query.period) {
      search.set("period", query.period);
    }
    if (query.status) {
      search.set("status", query.status);
    }
    if (query.group) {
      search.set("group", query.group);
    }
    if (query.agentInteraction) {
      search.set("agentInteraction", query.agentInteraction);
    }
    if (query.limit) {
      search.set("limit", String(query.limit));
    }
    if (query.cursor) {
      search.set("cursor", query.cursor);
    }
    if (query.updatedSince) {
      search.set("updatedSince", query.updatedSince);
    }
    return request<WhatsappMonitorConversationsResponse>(
      `/api/whatsapp-monitor/conversations${search.toString() ? `?${search.toString()}` : ""}`,
      { signal: options.signal },
      token,
    );
  },

  whatsappMonitorAgents(
    token: string,
    options: { includeStats?: boolean; signal?: AbortSignal } = {},
  ) {
    const search = new URLSearchParams();
    if (options.includeStats !== undefined) {
      search.set("includeStats", String(options.includeStats));
    }
    return request<WhatsappMonitorAgent[]>(
      `/api/whatsapp-monitor/agents${search.toString() ? `?${search.toString()}` : ""}`,
      { signal: options.signal },
      token,
    );
  },

  whatsappMonitorConversation(
    token: string,
    id: string,
    query: {
      instanceId?: string;
      limit?: number;
      before?: string;
      after?: string;
    } = {},
    options: { signal?: AbortSignal } = {},
  ) {
    const search = new URLSearchParams();
    if (query.instanceId) {
      search.set("instanceId", query.instanceId);
    }
    if (query.limit) {
      search.set("limit", String(query.limit));
    }
    if (query.before) {
      search.set("before", query.before);
    }
    if (query.after) {
      search.set("after", query.after);
    }
    return request<WhatsappMonitorConversationDetail>(
      `/api/whatsapp-monitor/conversations/${id}${search.toString() ? `?${search.toString()}` : ""}`,
      { signal: options.signal },
      token,
    );
  },

  whatsappMonitorMetrics(token: string) {
    return request<WhatsappMonitorMetrics>("/api/whatsapp-monitor/metrics", {}, token);
  },

  whatsappAgentActivityReport(token: string, query: { days?: number } = {}) {
    const search = new URLSearchParams();
    if (query.days) {
      search.set("days", String(query.days));
    }
    return request<WhatsappAgentActivityReport>(
      `/api/whatsapp-monitor/activity-report${search.toString() ? `?${search.toString()}` : ""}`,
      {},
      token,
    );
  },

  whatsappDailySummary(token: string, date?: string) {
    const search = new URLSearchParams();
    if (date) {
      search.set("date", date);
    }
    return request<any>(
      `/api/whatsapp-monitor/daily-summary${search.toString() ? `?${search.toString()}` : ""}`,
      {},
      token,
    );
  },

  setWhatsappMonitorReadState(token: string, id: string, input: { unread: boolean }) {
    return request<WhatsappConversationReadStateResponse>(
      `/api/whatsapp-monitor/conversations/${id}/read-state`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
      token,
    );
  },

  sendWhatsappMonitorReply(token: string, id: string, input: { messageText: string }) {
    return request<WhatsappMonitorConversationDetail>(
      `/api/whatsapp-monitor/conversations/${id}/replies`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      token,
    );
  },
  sendWhatsappMonitorMediaReply(
    token: string,
    id: string,
    input: {
      mediaBase64: string;
      mediaType: "image" | "video" | "audio" | "document";
      fileName?: string;
      caption?: string;
    },
  ) {
    return request<WhatsappMonitorConversationDetail>(
      `/api/whatsapp-monitor/conversations/${id}/media-replies`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      token,
    );
  },

  refreshWhatsappMonitorProfiles(token: string) {
    return request<{ scanned: number; refreshed: number; refreshedInstances: number }>(
      "/api/whatsapp-monitor/refresh-profiles",
      { method: "POST" },
      token,
    );
  },

  getChartAnnotations(token: string) {
    return request<ChartAnnotation[]>("/api/dashboard/annotations", {}, token);
  },
  saveChartAnnotation(token: string, input: ChartAnnotation) {
    return request<ChartAnnotation>("/api/dashboard/annotations", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  deleteChartAnnotation(token: string, id: string) {
    return request<void>(`/api/dashboard/annotations/${id}`, {
      method: "DELETE",
    }, token);
  },

  // ── Pipeline / Kanban ──────────────────────────────────────────

  pipelineSummary(token: string, includeClosed = false) {
    const q = includeClosed ? "?includeClosed=true" : "";
    return request<PipelineSummary>(`/api/pipeline/summary${q}`, {}, token);
  },
  createDeal(token: string, input: {
    title: string;
    customerId?: string | null;
    stageId: string;
    expectedValue?: number;
    expectedCloseDate?: string | null;
    priority?: DealPriority;
    notes?: string;
    whatsappInstanceId?: string | null;
    whatsappJid?: string | null;
  }) {
    return request<DealDetail>("/api/pipeline/deals", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  getDeal(token: string, id: string) {
    return request<DealDetail>(`/api/pipeline/deals/${id}`, {}, token);
  },
  updateDeal(token: string, id: string, input: Record<string, unknown>) {
    return request<DealDetail>(`/api/pipeline/deals/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }, token);
  },
  moveDealStage(token: string, id: string, stageId: string) {
    return request<DealDetail>(`/api/pipeline/deals/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stageId }),
    }, token);
  },
  addDealActivity(token: string, id: string, input: { activityType: DealActivityType; content: string }) {
    return request<DealActivity>(`/api/pipeline/deals/${id}/activities`, {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },

  // ── WhatsApp Instances ─────────────────────────────────────────

  whatsappInstanceDefaults(token: string) {
    return request<{ baseUrl: string; apiKey: string }>("/api/whatsapp-instances/defaults", {}, token);
  },
  whatsappInstances(token: string) {
    return request<WhatsappInstanceItem[]>("/api/whatsapp-instances", {}, token);
  },
  // Hospeda o vídeo no backend e devolve uma URL pública. Usa fetch dedicado com
  // timeout longo (upload pode demorar) em vez do request() compartilhado de 30s.
  async uploadCampaignVideo(
    token: string,
    input: { fileBase64: string; fileName?: string },
  ): Promise<{ url: string }> {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/upload-video`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? `Falha no upload do vídeo (status ${response.status})`);
      }
      return (await response.json()) as { url: string };
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  },
  async uploadCampaignImage(
    token: string,
    input: { fileBase64: string; fileName?: string },
  ): Promise<{ url: string }> {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(`${API_BASE_URL}/api/messages/upload-image`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? `Falha no upload da imagem (status ${response.status})`);
      }
      return (await response.json()) as { url: string };
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  },
  createWhatsappInstance(token: string, input: {
    provider?: WhatsappInstanceProvider;
    instanceName: string;
    displayLabel: string;
    phoneNumber?: string;
    evolutionBaseUrl?: string;
    evolutionApiKey?: string;
    uazapiBaseUrl?: string;
    uazapiToken?: string;
    isDefault?: boolean;
    messagesEnabled?: boolean;
  }) {
    return request<WhatsappInstanceItem>("/api/whatsapp-instances", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  deleteWhatsappInstance(token: string, id: string) {
    return request<void>(`/api/whatsapp-instances/${id}`, {
      method: "DELETE",
    }, token);
  },
  configureWhatsappInstance(token: string, id: string) {
    return request<void>(`/api/whatsapp-instances/${id}/configure`, {
      method: "POST",
    }, token);
  },
  updateWhatsappInstanceMessagesSetting(token: string, id: string, messagesEnabled: boolean) {
    return request<WhatsappInstanceItem>(`/api/whatsapp-instances/${id}/messages-setting`, {
      method: "PATCH",
      body: JSON.stringify({ messagesEnabled }),
    }, token);
  },
  whatsappInstanceConnection(token: string, id: string) {
    return request<{ state: string; lastHealthStatus: string | null; lastHealthCheckAt: string | null }>(
      `/api/whatsapp-instances/${id}/connection`,
      {},
      token,
    );
  },
  connectWhatsappInstance(token: string, id: string) {
    return request<{ state: string; base64: string | null; pairingCode: string | null; code: string | null }>(
      `/api/whatsapp-instances/${id}/connect`,
      { method: "POST" },
      token,
    );
  },
  getEventsMetrics(token: string, query: EventsQuery = {}) {
    const search = new URLSearchParams();
    appendEventsQuery(search, query);
    return request<EventsMetrics>(`/api/events/metrics?${search.toString()}`, {}, token);
  },
  getEventsIntelligence(token: string, query: EventsQuery = {}) {
    const search = new URLSearchParams();
    appendEventsQuery(search, query);
    return request<EventsIntelligenceResponse>(`/api/events/intelligence?${search.toString()}`, {}, token);
  },
  listEvents(token: string, filters: any, pagination: { page: number; pageSize: number }) {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    search.set("page", String(pagination.page));
    search.set("pageSize", String(pagination.pageSize));
    return request<{ events: MessageEvent[]; total: number }>(`/api/events?${search.toString()}`, {}, token);
  },
  runEventsAiBatch(token: string) {
    return request<{ status: "SKIPPED" | "SUCCEEDED" | "FAILED"; reason?: string; eventCount?: number; error?: string }>(
      "/api/events/ai-batch/run",
      { method: "POST" },
      token,
    );
  },
  getEventsOverview(token: string, query: { dateFrom?: string; dateTo?: string } = {}) {
    const search = new URLSearchParams();
    if (query.dateFrom) search.set("dateFrom", query.dateFrom);
    if (query.dateTo) search.set("dateTo", query.dateTo);
    return request<EventsOverviewResponse>(`/api/events/overview?${search.toString()}`, {}, token);
  },
  listConversationInsights(
    token: string,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      attention?: string;
      flag?: string;
      topic?: string;
      search?: string;
      isGroup?: boolean;
      agentName?: string;
      onlyOpen?: boolean;
      acknowledged?: boolean;
    },
    pagination: { page: number; pageSize: number },
  ) {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    search.set("page", String(pagination.page));
    search.set("pageSize", String(pagination.pageSize));
    return request<ConversationInsightsListResponse>(`/api/events/conversations?${search.toString()}`, {}, token);
  },
  runEventsAnalysis(token: string, date?: string) {
    return request<EventsIntelligenceProgress>(
      "/api/events/intelligence/run",
      { method: "POST", body: JSON.stringify(date ? { date } : {}) },
      token,
    );
  },
  getEventsAnalysisProgress(token: string) {
    return request<EventsIntelligenceProgress | null>(
      "/api/events/intelligence/progress",
      {},
      token,
    );
  },
  ackConversationInsight(token: string, id: string, note?: string) {
    return request<ConversationInsight>(`/api/events/conversations/${id}/ack`, {
      method: "PATCH",
      body: JSON.stringify({ note }),
    }, token);
  },
  previewRadarWhatsapp(token: string, query: { dateFrom?: string; dateTo?: string } & RadarWhatsappOptions) {
    const search = new URLSearchParams();
    if (query.dateFrom) search.set("dateFrom", query.dateFrom);
    if (query.dateTo) search.set("dateTo", query.dateTo);
    search.set("detailLevel", query.detailLevel);
    search.set("alertLimit", String(query.alertLimit));
    return request<RadarWhatsappPreview>(`/api/events/radar-whatsapp/preview?${search.toString()}`, {}, token);
  },
  sendRadarWhatsapp(token: string, input: { dateFrom?: string; dateTo?: string } & RadarWhatsappOptions) {
    return request<RadarWhatsappSendResult>("/api/events/radar-whatsapp/send", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  resolveEvent(token: string, id: string, input: { resolutionNote: string }) {
    return request<MessageEvent>(`/api/events/${id}/resolve`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }, token);
  },
  getDailySentiments(token: string, query: { from?: string; to?: string }) {
    const from = query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] as string;
    const to = query.to || new Date().toISOString().split('T')[0] as string;
    const search = new URLSearchParams();
    search.set("dateFrom", from);
    search.set("dateTo", to);
    return request<DailySentiment[]>(`/api/events/sentiments/daily?${search.toString()}`, {}, token);
  },

  // ── Reclamacoes por produto ─────────────────────────────────

  getProductComplaintsModelReport(token: string, filters: Omit<ProductComplaintsFilters, "model" | "exact"> = {}) {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<ProductComplaintsModelReport>(`/api/product-complaints/models?${search.toString()}`, {}, token);
  },
  getProductComplaintsOverview(token: string, filters: ProductComplaintsFilters = {}) {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<ProductComplaintsOverview>(`/api/product-complaints/overview?${search.toString()}`, {}, token);
  },
  listProductComplaints(
    token: string,
    filters: ProductComplaintsFilters,
    pagination: { page: number; pageSize: number },
  ) {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    search.set("page", String(pagination.page));
    search.set("pageSize", String(pagination.pageSize));
    return request<ProductComplaintsListResponse>(`/api/product-complaints?${search.toString()}`, {}, token);
  },

  // ── Reclamacoes gerais (nao ligadas a produto) ──────────────

  getGeneralComplaintsOverview(token: string, filters: GeneralComplaintsFilters = {}) {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    return request<GeneralComplaintsOverview>(`/api/general-complaints/overview?${search.toString()}`, {}, token);
  },
  listGeneralComplaints(
    token: string,
    filters: GeneralComplaintsFilters,
    pagination: { page: number; pageSize: number },
  ) {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") search.set(key, String(value));
    });
    search.set("page", String(pagination.page));
    search.set("pageSize", String(pagination.pageSize));
    return request<GeneralComplaintsListResponse>(`/api/general-complaints?${search.toString()}`, {}, token);
  },

  // ── Strategies ──────────────────────────────────────────────

  strategyCrossSell(token: string, minStock = 50, topN = 50) {
    const search = new URLSearchParams();
    search.set("minStock", String(minStock));
    search.set("topN", String(topN));
    return request<{
      summary: {
        totalCustomers: number;
        activeCount: number;
        attentionCount: number;
        inactiveCount: number;
        totalProductMatches: number;
      };
      customers: Array<{
        customerId: string;
        customerCode: string;
        displayName: string;
        status: "ACTIVE" | "ATTENTION" | "INACTIVE";
        totalOrders: number;
        totalSpent: number;
        lastPurchaseAt: string | null;
        productsWithStock: Array<{
          sku: string | null;
          itemDescription: string;
          totalQuantityBought: number;
          orderCount: number;
          lastBoughtAt: string | null;
          stockQuantity: number | null;
          stockModel: string | null;
        }>;
        productsAll: Array<{
          sku: string | null;
          itemDescription: string;
          totalQuantityBought: number;
          orderCount: number;
          lastBoughtAt: string | null;
          stockQuantity: number | null;
          stockModel: string | null;
        }>;
      }>;
      minStock: number;
      topN: number;
      generatedAt: string;
    }>(`/api/strategies/cross-sell?${search.toString()}`, {}, token);
  },

  strategySlowMoving(token: string, minStock = 1, daysWithoutSales = 30) {
    const search = new URLSearchParams();
    search.set("minStock", String(minStock));
    search.set("daysWithoutSales", String(daysWithoutSales));
    return request<{
      summary: {
        totalCustomers: number;
        activeCount: number;
        attentionCount: number;
        inactiveCount: number;
        totalProductMatches: number;
      };
      customers: Array<{
        customerId: string;
        customerCode: string;
        displayName: string;
        status: "ACTIVE" | "ATTENTION" | "INACTIVE";
        totalOrders: number;
        totalSpent: number;
        lastPurchaseAt: string | null;
        productsWithStock: Array<{
          sku: string | null;
          itemDescription: string;
          totalQuantityBought: number;
          orderCount: number;
          lastBoughtAt: string | null;
          stockQuantity: number | null;
          stockModel: string | null;
          daysWithoutSales: number;
          lastSoldOverall: string | null;
        }>;
        productsAll: Array<{
          sku: string | null;
          itemDescription: string;
          totalQuantityBought: number;
          orderCount: number;
          lastBoughtAt: string | null;
          stockQuantity: number | null;
          stockModel: string | null;
          daysWithoutSales: number;
          lastSoldOverall: string | null;
        }>;
      }>;
      minStock: number;
      daysWithoutSales: number;
      generatedAt: string;
    }>(`/api/strategies/slow-moving?${search.toString()}`, {}, token);
  },
  bulkAssignLabelToCustomers(token: string, customerIds: string[], labelName: string) {
    return request<{ success: boolean }>("/api/customers/batch/labels", {
      method: "POST",
      body: JSON.stringify({ customerIds, labelName }),
    }, token);
  },
};

