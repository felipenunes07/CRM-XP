import type {
  AcquisitionMetrics,
  AmbassadorResponse,
  AgendaResponse,
  AttendantsResponse,
  CustomerDetail,
  CustomerOpportunityDetail,
  CustomerOpportunityQueueResponse,
  CustomerCreditDetailResponse,
  CustomerCreditOverviewResponse,
  CustomerDocInsightsResponse,
  CustomerLabel,
  CustomerListItem,
  DashboardMetrics,
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
  MonthlyTarget,
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
  WhatsappCampaignDetail,
  WhatsappCampaignListItem,
  WhatsappGroup,
  WhatsappGroupsResponse,
  WhatsappImportSummary,
  WhatsappMappingSummary,
} from "@olist-crm/shared";

export interface ChartAnnotation {
  id?: string;
  date: string;
  label: string;
  description: string;
}

import type { AuthUser } from "../hooks/useAuth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ message: "Request failed" }))) as { message?: string };
    throw new Error(payload.message ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
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
  users(token: string) {
    return request<Array<{ id: string; email: string; role: "ADMIN" | "MANAGER" | "SELLER"; name: string }>>(
      "/api/admin/users",
      {},
      token,
    );
  },
  syncData(token: string, mode: "queue" | "direct" = "direct") {
    return request<{ mode: string; result?: unknown }>("/api/admin/sync", {
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
  whatsappCampaign(token: string, id: string, query: { limit?: number; offset?: number } = {}) {
    const search = new URLSearchParams();
    if (query.limit !== undefined) {
      search.set("limit", String(query.limit));
    }
    if (query.offset !== undefined) {
      search.set("offset", String(query.offset));
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
      messageText: string;
      filtersSnapshot?: Record<string, unknown>;
      groupIds: string[];
      overrideRecentBlock?: boolean;
      minDelaySeconds?: number;
      maxDelaySeconds?: number;
    },
  ) {
    return request<WhatsappCampaignDetail>("/api/whatsapp-campaigns", {
      method: "POST",
      body: JSON.stringify(input),
    }, token);
  },
  cancelWhatsappCampaign(token: string, id: string) {
    return request<WhatsappCampaignDetail | null>(`/api/whatsapp-campaigns/${id}/cancel`, {
      method: "POST",
    }, token);
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
};

