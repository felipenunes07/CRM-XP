import type {
  AcquisitionMetrics,
  AmbassadorResponse,
  AgendaResponse,
  AttendantsResponse,
  CarouselSlide,
  CustomerDetail,
  CustomerOpportunityDetail,
  CustomerOpportunityQueueResponse,
  CustomerCreditDetailResponse,
  CustomerCreditOverviewResponse,
  CustomerDocInsightsResponse,
  CustomerLabel,
  CustomerListItem,
  DashboardMetrics,
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
  InventoryOverviewResponse,
  InventoryRestockResponse,
  InventorySnapshotMeta,
  InventoryStaleResponse,
  MessageTemplate,
  MessageAutomation,
  MessageAutomationRun,
  MonthlyTarget,
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
  MessageEvent,
  DailySentiment,
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

function createRequestSignal(upstreamSignal?: AbortSignal | null) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

  const abortFromUpstream = () => controller.abort();
  upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true });

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
): Promise<T> {
  const { signal, cleanup } = createRequestSignal(options.signal);

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
              return request<T>(path, options, refreshedToken, true);
            }
          } catch {
            // Fall through to sign-out below.
          }
        }

        import("./supabase")
          .then(({ supabase }) => {
            supabase.auth.signOut().catch(() => {});
          })
          .catch(() => {});
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
   * @param trendDays Optional number of days for portfolio trend data (1-730, default: 90)
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
  saveMonthlyTarget(token: string, year: number, month: number, targetAmount: number, attendant = 'TOTAL', targetRevenue = 0) {
    return request<void>("/api/dashboard/targets", {
      method: "POST",
      body: JSON.stringify({ year, month, targetAmount, attendant, targetRevenue }),
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
    return request<CustomerCreditOverviewResponse>("/api/customer-credit/overview", {}, token);
  },
  refreshCustomerCreditOverview(token: string) {
    return request<CustomerCreditOverviewResponse>("/api/customer-credit/refresh", {
      method: "POST",
    }, token);
  },
  customerCreditOpportunities(token: string) {
    return request<CustomerOpportunityQueueResponse>("/api/customer-credit/opportunities", {}, token);
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
  inventoryModels(token: string) {
    return request<InventoryModelsResponse>("/api/inventory/models", {}, token);
  },
  inventoryModelDetail(token: string, modelKey: string) {
    return request<InventoryModelDetailResponse>(`/api/inventory/models/${encodeURIComponent(modelKey)}`, {}, token);
  },
  customer(token: string, id: string) {
    return request<CustomerDetail>(`/api/customers/${id}`, {}, token);
  },
  customerCreditDetail(token: string, id: string) {
    return request<CustomerCreditDetailResponse>(`/api/customers/${id}/credit`, {}, token);
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
  createMessageTemplate(token: string, input: Pick<MessageTemplate, "category" | "title" | "content">) {
    return request<MessageTemplate>("/api/messages/templates", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  updateMessageTemplate(token: string, id: string, input: Pick<MessageTemplate, "category" | "title" | "content">) {
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
  sendTestMessage(token: string, input: { messageText: string; messageType: string; carouselData?: any; menuData?: WhatsappMenuData; videoUrl?: string; whatsappInstanceId?: string }) {
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
  whatsappGroupMappingSummary(token: string) {
    return request<WhatsappMappingSummary>("/api/whatsapp-groups/mapping-summary", {}, token);
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
  skipWhatsappCampaignRecipient(token: string, id: string, recipientId: string) {
    return request<{ skipped: boolean; recipientId: string }>(`/api/whatsapp-campaigns/${id}/recipients/${recipientId}/skip`, {
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
      agentInteraction?: "sent";
      limit?: number;
      cursor?: string;
      updatedSince?: string;
    } = {},
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
      {},
      token,
    );
  },

  whatsappMonitorAgents(token: string) {
    return request<WhatsappMonitorAgent[]>("/api/whatsapp-monitor/agents", {}, token);
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
      {},
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
  getEventsMetrics(token: string, query: { dateFrom?: string; dateTo?: string; isGroup?: boolean } = {}) {
    const search = new URLSearchParams();
    if (query.dateFrom) search.set("dateFrom", query.dateFrom);
    if (query.dateTo) search.set("dateTo", query.dateTo);
    if (query.isGroup !== undefined) search.set("isGroup", String(query.isGroup));
    return request<EventsMetrics>(`/api/events/metrics?${search.toString()}`, {}, token);
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

