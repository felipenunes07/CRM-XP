import type {
  AmbassadorResponse,
  AgendaResponse,
  AttendantsResponse,
  CustomerDetail,
  CustomerLabel,
  CustomerListItem,
  DashboardMetrics,
  MessageTemplate,
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
} from "@olist-crm/shared";
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
  dashboard(token: string, trendDays?: number) {
    const search = new URLSearchParams();
    if (trendDays !== undefined) {
      search.set("trendDays", String(trendDays));
    }
    return request<DashboardMetrics>(`/api/dashboard/metrics${search.toString() ? `?${search.toString()}` : ""}`, {}, token);
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
  customer(token: string, id: string) {
    return request<CustomerDetail>(`/api/customers/${id}`, {}, token);
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
};
