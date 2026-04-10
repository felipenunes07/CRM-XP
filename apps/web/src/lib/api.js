const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
async function request(path, options = {}, token) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(options.headers ?? {}),
        },
    });
    if (!response.ok) {
        const payload = (await response.json().catch(() => ({ message: "Request failed" })));
        throw new Error(payload.message ?? "Request failed");
    }
    if (response.status === 204) {
        return undefined;
    }
    return response.json();
}
export const api = {
    login(email, password) {
        return request("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
        });
    },
    me(token) {
        return request("/api/auth/me", {}, token);
    },
    /**
     * Get dashboard metrics
     * @param token Authentication token
     * @param trendDays Optional number of days for portfolio trend data (1-730, default: 90)
     */
    dashboard(token, trendDays) {
        const search = new URLSearchParams();
        if (trendDays !== undefined) {
            search.set("trendDays", String(trendDays));
        }
        return request(`/api/dashboard/metrics${search.toString() ? `?${search.toString()}` : ""}`, {}, token);
    },
    attendants(token, windowMonths = 12) {
        const search = new URLSearchParams({
            windowMonths: String(windowMonths),
        });
        return request(`/api/attendants?${search.toString()}`, {}, token);
    },
    ambassadors(token) {
        return request("/api/ambassadors", {}, token);
    },
    agenda(token, limit, offset, query = {}) {
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
        return request(`/api/agenda${search.toString() ? `?${search.toString()}` : ""}`, {}, token);
    },
    customers(token, query) {
        const search = new URLSearchParams();
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== "") {
                search.set(key, String(value));
            }
        });
        return request(`/api/customers?${search.toString()}`, {}, token);
    },
    customer(token, id) {
        return request(`/api/customers/${id}`, {}, token);
    },
    customerLabels(token) {
        return request("/api/customer-labels", {}, token);
    },
    createCustomerLabel(token, name) {
        return request("/api/customer-labels", {
            method: "POST",
            body: JSON.stringify({ name }),
        }, token);
    },
    updateCustomerLabel(token, id, color) {
        return request(`/api/customer-labels/${id}`, {
            method: "PUT",
            body: JSON.stringify({ color }),
        }, token);
    },
    deleteCustomerLabel(token, id) {
        return request(`/api/customer-labels/${id}`, {
            method: "DELETE",
        }, token);
    },
    updateCustomerLabels(token, id, input) {
        return request(`/api/customers/${id}/labels`, {
            method: "PUT",
            body: JSON.stringify(input),
        }, token);
    },
    updateCustomerAmbassador(token, id, isAmbassador) {
        return request(`/api/customers/${id}/ambassador`, {
            method: "PUT",
            body: JSON.stringify({ isAmbassador }),
        }, token);
    },
    previewSegment(token, definition) {
        return request("/api/segments/preview", {
            method: "POST",
            body: JSON.stringify(definition),
        }, token);
    },
    savedSegments(token) {
        return request("/api/segments/saved", {}, token);
    },
    createSavedSegment(token, input) {
        return request("/api/segments/saved", {
            method: "POST",
            body: JSON.stringify(input),
        }, token);
    },
    updateSavedSegment(token, id, input) {
        return request(`/api/segments/saved/${id}`, {
            method: "PUT",
            body: JSON.stringify(input),
        }, token);
    },
    deleteSavedSegment(token, id) {
        return request(`/api/segments/saved/${id}`, {
            method: "DELETE",
        }, token);
    },
    messageTemplates(token) {
        return request("/api/messages/templates", {}, token);
    },
    createMessageTemplate(token, input) {
        return request("/api/messages/templates", {
            method: "POST",
            body: JSON.stringify(input),
        }, token);
    },
    updateMessageTemplate(token, id, input) {
        return request(`/api/messages/templates/${id}`, {
            method: "PUT",
            body: JSON.stringify(input),
        }, token);
    },
    deleteMessageTemplate(token, id) {
        return request(`/api/messages/templates/${id}`, {
            method: "DELETE",
        }, token);
    },
    prospectingConfig(token) {
        return request("/api/prospecting/config", {}, token);
    },
    createProspectPreset(token, keyword) {
        return request("/api/prospecting/presets", {
            method: "POST",
            body: JSON.stringify({ keyword }),
        }, token);
    },
    prospectingSearch(token, query) {
        const search = new URLSearchParams();
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== "") {
                search.set(key, String(value));
            }
        });
        return request(`/api/prospecting/search?${search.toString()}`, {}, token);
    },
    prospectingSummary(token) {
        return request("/api/prospecting/summary", {}, token);
    },
    claimProspectLead(token, id) {
        return request(`/api/prospecting/leads/${id}/claim`, {
            method: "POST",
        }, token);
    },
    releaseProspectLead(token, id) {
        return request(`/api/prospecting/leads/${id}/release`, {
            method: "POST",
        }, token);
    },
    createProspectContactAttempt(token, id, input) {
        return request(`/api/prospecting/leads/${id}/contact-attempts`, {
            method: "POST",
            body: JSON.stringify(input),
        }, token);
    },
    discardProspectLead(token, id, reason) {
        return request(`/api/prospecting/leads/${id}/discard`, {
            method: "POST",
            body: JSON.stringify({ reason }),
        }, token);
    },
    users(token) {
        return request("/api/admin/users", {}, token);
    },
    syncData(token, mode = "direct") {
        return request("/api/admin/sync", {
            method: "POST",
            body: JSON.stringify({ mode }),
        }, token);
    },
};
