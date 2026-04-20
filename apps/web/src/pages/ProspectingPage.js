import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ExternalLink, MapPinned, Phone, Save, Search, ShieldAlert, Target, UserCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDate, formatNumber } from "../lib/format";
const BRAZIL_STATES = [
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
    "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];
const DEFAULT_PRESET_KEYWORDS = new Set(["assistencia tecnica", "distribuidora de telas", "troca de tela"]);
const defaultFilters = {
    keyword: "",
    state: "SP",
    city: "",
    onlyNew: true,
    onlyUnassigned: false,
    hasPhone: false,
    myLeads: false,
    includeWorked: false,
    limit: 10,
};
function leadStatusLabel(status) {
    if (status === "NEW")
        return "Novo";
    if (status === "CLAIMED")
        return "Assumido";
    if (status === "CONTACTED")
        return "Contatado";
    return "Descartado";
}
function quotaProgress(used, limit) {
    if (!limit)
        return 0;
    return Math.min(100, Math.round((used / limit) * 100));
}
function quotaTone(used, limit) {
    const percentage = quotaProgress(used, limit);
    if (percentage >= 85)
        return "tone-danger";
    if (percentage >= 70)
        return "tone-warning";
    return "";
}
function splitPresets(presets) {
    const base = [];
    const saved = [];
    for (const preset of presets ?? []) {
        if (DEFAULT_PRESET_KEYWORDS.has(preset.keyword)) {
            base.push(preset);
        }
        else {
            saved.push(preset);
        }
    }
    base.sort((left, right) => left.sortOrder - right.sortOrder);
    saved.sort((left, right) => left.sortOrder - right.sortOrder);
    return { base, saved };
}
export function ProspectingPage() {
    const { token, user } = useAuth();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState("buscar");
    const [filters, setFilters] = useState(defaultFilters);
    const [submittedFilters, setSubmittedFilters] = useState(null);
    const [activeContactLeadId, setActiveContactLeadId] = useState(null);
    const [contactForm, setContactForm] = useState({
        channel: "WHATSAPP",
        contactType: "FIRST_CONTACT",
        notes: "",
    });
    const configQuery = useQuery({
        queryKey: ["prospecting-config"],
        queryFn: () => api.prospectingConfig(token),
        enabled: Boolean(token),
    });
    const summaryQuery = useQuery({
        queryKey: ["prospecting-summary"],
        queryFn: () => api.prospectingSummary(token),
        enabled: Boolean(token),
    });
    const searchMutation = useMutation({
        mutationFn: (query) => api.prospectingSearch(token, query),
    });
    const rerunSearch = async (nextFilters) => {
        const filtersToUse = nextFilters ?? submittedFilters;
        if (!filtersToUse) {
            return;
        }
        try {
            await searchMutation.mutateAsync(filtersToUse);
        }
        catch {
            // O erro fica exposto pela mutation e renderizado na tela.
        }
    };
    const invalidateProspecting = async (nextFilters) => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["prospecting-summary"] }),
            queryClient.invalidateQueries({ queryKey: ["prospecting-config"] }),
        ]);
        await rerunSearch(nextFilters);
    };
    const savePresetMutation = useMutation({
        mutationFn: (keyword) => api.createProspectPreset(token, keyword),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["prospecting-config"] });
        },
    });
    const claimMutation = useMutation({
        mutationFn: (leadId) => api.claimProspectLead(token, leadId),
        onSuccess: async () => {
            await invalidateProspecting();
        },
    });
    const releaseMutation = useMutation({
        mutationFn: (leadId) => api.releaseProspectLead(token, leadId),
        onSuccess: async () => {
            setActiveContactLeadId(null);
            await invalidateProspecting();
        },
    });
    const discardMutation = useMutation({
        mutationFn: (leadId) => api.discardProspectLead(token, leadId),
        onSuccess: async () => {
            setActiveContactLeadId(null);
            await invalidateProspecting();
        },
    });
    const contactMutation = useMutation({
        mutationFn: (leadId) => api.createProspectContactAttempt(token, leadId, contactForm),
        onSuccess: async () => {
            setActiveContactLeadId(null);
            setContactForm({
                channel: "WHATSAPP",
                contactType: "FIRST_CONTACT",
                notes: "",
            });
            await invalidateProspecting();
        },
    });
    const quota = summaryQuery.data?.quota ?? configQuery.data?.quota;
    const searchResponse = searchMutation.data;
    const searchErrorMessage = searchMutation.error instanceof Error ? searchMutation.error.message : null;
    const results = searchResponse?.items ?? [];
    const canSearch = Boolean(filters.keyword?.trim() && filters.state?.trim());
    const { base: basePresets, saved: savedPresets } = useMemo(() => splitPresets(configQuery.data?.presets), [configQuery.data?.presets]);
    const monthlyStats = useMemo(() => {
        if (!quota) {
            return [];
        }
        return [
            {
                title: "Buscas no mes",
                value: `${formatNumber(quota.textSearch.monthlyUsed)} / ${formatNumber(quota.textSearch.monthlyLimit)}`,
                progress: quotaProgress(quota.textSearch.monthlyUsed, quota.textSearch.monthlyLimit),
                tone: quotaTone(quota.textSearch.monthlyUsed, quota.textSearch.monthlyLimit),
            },
            {
                title: "Detalhes no mes",
                value: `${formatNumber(quota.placeDetails.monthlyUsed)} / ${formatNumber(quota.placeDetails.monthlyLimit)}`,
                progress: quotaProgress(quota.placeDetails.monthlyUsed, quota.placeDetails.monthlyLimit),
                tone: quotaTone(quota.placeDetails.monthlyUsed, quota.placeDetails.monthlyLimit),
            },
        ];
    }, [quota]);
    const handleSearch = async () => {
        if (!canSearch) {
            return;
        }
        const nextFilters = {
            keyword: filters.keyword?.trim(),
            state: filters.state?.trim(),
            city: filters.city?.trim() || "",
            onlyNew: true,
            onlyUnassigned: false,
            hasPhone: false,
            myLeads: false,
            includeWorked: false,
            limit: 10,
        };
        setSubmittedFilters(nextFilters);
        await rerunSearch(nextFilters);
    };
    return (_jsxs("div", {
        className: "page-stack", children: [_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Prospeccao" }), _jsx("h2", { className: "premium-header-title", children: "Leads do Google Places" }), _jsx("p", { className: "panel-subcopy", children: "Busca direta por palavra-chave, estado e cidade opcional. A tela principal ficou mais limpa, e o painel operacional foi para a aba ao lado." })] }) }), _jsxs("div", { style: { display: "flex", gap: "0.75rem", flexWrap: "wrap" }, children: [_jsx("button", { type: "button", className: activeTab === "buscar" ? "primary-button" : "ghost-button", onClick: () => setActiveTab("buscar"), children: "Buscar Leads" }), _jsx("button", { type: "button", className: activeTab === "painel" ? "primary-button" : "ghost-button", onClick: () => setActiveTab("painel"), children: "Painel Operacional" })] })] }), activeTab === "buscar" ? (_jsxs(_Fragment, {
            children: [!configQuery.data?.apiEnabled ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "queue-card compact", children: _jsx("div", { className: "queue-card-meta", children: _jsxs("span", { children: [_jsx(ShieldAlert, { size: 14 }), "Google Places ainda nao esta habilitado neste ambiente. Reinicie a API depois de configurar o `.env` para liberar a busca real."] }) }) }) })) : null, _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Sugestoes" }), _jsx("h3", { children: "Palavras prontas" })] }) }), _jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.65rem", marginBottom: savedPresets.length ? "1rem" : 0 }, children: basePresets.map((preset) => (_jsx("button", { type: "button", className: "ghost-button small", onClick: () => setFilters((current) => ({ ...current, keyword: preset.keyword })), children: preset.label }, preset.id))) }), savedPresets.length ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "eyebrow", style: { marginTop: 0 }, children: "Buscas salvas" }), _jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.65rem" }, children: savedPresets.map((preset) => (_jsx("button", { type: "button", className: "ghost-button small", onClick: () => setFilters((current) => ({ ...current, keyword: preset.keyword })), children: preset.label }, preset.id))) })] })) : null] }), _jsxs("section", {
                className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Busca" }), _jsx("h3", { children: "Pesquisar leads" }), _jsx("p", { className: "panel-subcopy", children: "Somente novos continua padrao por baixo, sem ficar aparecendo como filtro." })] }) }), _jsxs("form", {
                    className: "filters-grid filters-grid-four", onSubmit: (event) => {
                        event.preventDefault();
                        void handleSearch();
                    }, children: [_jsxs("label", { children: ["Palavra-chave", _jsx("input", { value: filters.keyword ?? "", onChange: (event) => setFilters((current) => ({ ...current, keyword: event.target.value })), placeholder: "Ex.: distribuicao de telas" })] }), _jsxs("label", { children: ["Estado", _jsx("select", { value: filters.state ?? "SP", onChange: (event) => setFilters((current) => ({ ...current, state: event.target.value })), children: BRAZIL_STATES.map((state) => (_jsx("option", { value: state, children: state }, state))) })] }), _jsxs("label", { children: ["Cidade opcional", _jsx("input", { value: filters.city ?? "", onChange: (event) => setFilters((current) => ({ ...current, city: event.target.value })), placeholder: "Ex.: Campinas" })] }), _jsxs("div", { style: { display: "flex", alignItems: "end", gap: "0.65rem", flexWrap: "wrap" }, children: [_jsxs("button", { type: "submit", className: "primary-button", disabled: !canSearch || searchMutation.isPending, children: [_jsx(Search, { size: 16 }), searchMutation.isPending ? "Buscando..." : "Buscar"] }), _jsxs("button", { type: "button", className: "ghost-button", onClick: () => savePresetMutation.mutate(filters.keyword ?? ""), disabled: !filters.keyword?.trim() || savePresetMutation.isPending, children: [_jsx(Save, { size: 16 }), "Salvar palavra-chave"] })] })]
                })]
            }), _jsxs("section", {
                className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Resultados" }), _jsx("h3", { children: "Leads priorizados para prospeccao" }), _jsx("p", { className: "panel-subcopy", children: searchResponse?.notice ?? "Faca uma busca para carregar os leads." })] }) }), searchMutation.isPending ? _jsx("div", { className: "page-loading", children: "Buscando leads..." }) : null, searchErrorMessage ? _jsx("div", { className: "page-error", children: searchErrorMessage }) : null, !submittedFilters && !searchMutation.isPending ? (_jsx("div", { className: "empty-state", children: "Escolha a palavra-chave, estado e clique em Buscar." })) : null, submittedFilters && !searchMutation.isPending && !searchErrorMessage && !results.length ? (_jsx("div", {
                    className: "empty-state", children: configQuery.data?.apiEnabled
                        ? "Nenhum lead apareceu com essa combinacao."
                        : "Sem Google configurado nesse ambiente, a busca so consegue mostrar leads ja salvos localmente."
                })) : null, _jsx("div", {
                    className: "queue-list", children: results.map((lead) => {
                        const isMine = lead.assignedTo?.id === user?.id;
                        return (_jsxs("article", { className: "queue-card", children: [_jsxs("div", { className: "queue-card-top", children: [_jsxs("div", { className: "queue-card-heading", children: [_jsxs("div", { className: "agenda-title", children: [_jsx("h3", { children: lead.displayName }), _jsxs("span", { className: "score-pill", children: ["Score ", lead.score.toFixed(0)] }), _jsx("span", { className: `status-badge status-${lead.status.toLowerCase()}`, children: leadStatusLabel(lead.status) })] }), _jsxs("p", { className: "queue-card-note", children: [lead.primaryCategory || "Categoria principal nao informada", " \u2022 ", lead.city || "Cidade livre", ", ", lead.state] }), _jsx("p", { className: "queue-card-note", children: lead.address || "Endereco ainda nao carregado nessa etapa." })] }), _jsxs("div", { className: "queue-card-score", children: [_jsx("strong", { children: lead.assignedTo ? lead.assignedTo.name : "Livre" }), _jsx("small", { children: lead.assignedTo ? "Responsavel atual" : "Disponivel" })] })] }), _jsxs("div", { className: "queue-card-meta", children: [_jsxs("span", { children: [_jsx(Building2, { size: 14 }), lead.primaryCategory || "Sem categoria"] }), _jsxs("span", { children: [_jsx(Target, { size: 14 }), lead.reviewCount ? `${formatNumber(lead.reviewCount)} avaliacoes` : "Avaliacoes sob demanda"] }), _jsxs("span", { children: [_jsx(Phone, { size: 14 }), lead.phone || "Telefone ao assumir o lead"] }), _jsxs("span", { children: [_jsx(UserCheck, { size: 14 }), lead.firstContactAt ? `Primeiro contato em ${formatDate(lead.firstContactAt)}` : "Ainda nao trabalhado"] })] }), _jsxs("div", { className: "queue-card-actions", children: [lead.mapsUrl ? (_jsxs("a", { className: "ghost-button small", href: lead.mapsUrl, target: "_blank", rel: "noreferrer", children: [_jsx(MapPinned, { size: 14 }), "Abrir no Maps"] })) : null, lead.websiteUrl ? (_jsxs("a", { className: "ghost-button small", href: lead.websiteUrl, target: "_blank", rel: "noreferrer", children: [_jsx(ExternalLink, { size: 14 }), "Site"] })) : null, lead.whatsappUrl ? (_jsxs("a", { className: "ghost-button small", href: lead.whatsappUrl, target: "_blank", rel: "noreferrer", children: [_jsx(Phone, { size: 14 }), "WhatsApp"] })) : null, !lead.assignedTo ? (_jsx("button", { type: "button", className: "primary-button", onClick: () => claimMutation.mutate(lead.id), disabled: claimMutation.isPending, children: "Assumir lead" })) : null, isMine ? (_jsx("button", { type: "button", className: "ghost-button", onClick: () => setActiveContactLeadId((current) => (current === lead.id ? null : lead.id)), children: "Registrar contato" })) : null, isMine && !lead.firstContactAt ? (_jsx("button", { type: "button", className: "ghost-button", onClick: () => releaseMutation.mutate(lead.id), disabled: releaseMutation.isPending, children: "Liberar lead" })) : null, (isMine || !lead.assignedTo) ? (_jsx("button", { type: "button", className: "ghost-button danger", onClick: () => discardMutation.mutate(lead.id), disabled: discardMutation.isPending, children: "Descartar" })) : null] }), activeContactLeadId === lead.id && isMine ? (_jsxs("div", { style: { borderTop: "1px solid var(--line)", paddingTop: "1rem", display: "grid", gap: "0.85rem" }, children: [_jsxs("div", { className: "filters-grid filters-grid-four", children: [_jsxs("label", { children: ["Canal", _jsxs("select", { value: contactForm.channel, onChange: (event) => setContactForm((current) => ({ ...current, channel: event.target.value })), children: [_jsx("option", { value: "WHATSAPP", children: "WhatsApp" }), _jsx("option", { value: "PHONE", children: "Ligacao" }), _jsx("option", { value: "SITE", children: "Site" }), _jsx("option", { value: "OTHER", children: "Outro" })] })] }), _jsxs("label", { children: ["Tipo", _jsxs("select", { value: contactForm.contactType, onChange: (event) => setContactForm((current) => ({ ...current, contactType: event.target.value })), children: [_jsx("option", { value: "FIRST_CONTACT", children: "Primeiro contato" }), _jsx("option", { value: "FOLLOW_UP", children: "Follow-up" }), _jsx("option", { value: "NO_RESPONSE", children: "Sem resposta" }), _jsx("option", { value: "INTERESTED", children: "Interessado" }), _jsx("option", { value: "DISQUALIFIED", children: "Desqualificado" })] })] }), _jsxs("label", { className: "full-span", children: ["Observacao", _jsx("textarea", { rows: 3, value: contactForm.notes, onChange: (event) => setContactForm((current) => ({ ...current, notes: event.target.value })), placeholder: "Ex.: pediu retorno depois do almoco." })] })] }), _jsxs("div", { className: "inline-actions", children: [_jsx("button", { type: "button", className: "primary-button", onClick: () => contactMutation.mutate(lead.id), disabled: contactMutation.isPending, children: "Salvar tentativa" }), _jsx("button", { type: "button", className: "ghost-button", onClick: () => setActiveContactLeadId(null), children: "Cancelar" })] })] })) : null] }, lead.id));
                    })
                })]
            })]
        })) : (_jsxs("section", {
            className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Painel operacional" }), _jsx("h3", { children: "Meta, uso e protecao da franquia" })] }) }), _jsxs("div", { className: "stats-grid", children: [_jsxs("div", { className: "stat-card", children: [_jsx("span", { className: "stat-card-badge", children: "Meta do dia" }), _jsx("strong", { children: summaryQuery.data ? `${summaryQuery.data.uniqueContactsToday}/${summaryQuery.data.dailyTarget}` : "--" }), _jsx("span", { children: summaryQuery.data ? `${summaryQuery.data.remainingToGoal} para bater a meta` : "Carregando..." })] }), _jsxs("div", { className: "stat-card", children: [_jsx("span", { className: "stat-card-badge", children: "Leads assumidos" }), _jsx("strong", { children: summaryQuery.data ? formatNumber(summaryQuery.data.claimedLeadCount) : "--" }), _jsxs("span", { children: [user?.name ?? "Vendedora", " em operacao hoje"] })] }), _jsxs("div", { className: `stat-card ${quota ? quotaTone(quota.textSearch.dailyUsed, quota.textSearch.dailyLimit) : ""}`, children: [_jsx("span", { className: "stat-card-badge", children: "Busca hoje" }), _jsx("strong", { children: quota ? `${formatNumber(quota.textSearch.dailyUsed)}/${formatNumber(quota.textSearch.dailyLimit)}` : "--" }), _jsx("span", { children: "Trava diaria para nao estourar a faixa gratis" })] }), _jsxs("div", { className: `stat-card ${quota ? quotaTone(quota.placeDetails.dailyUsed, quota.placeDetails.dailyLimit) : ""}`, children: [_jsx("span", { className: "stat-card-badge", children: "Detalhes hoje" }), _jsx("strong", { children: quota ? `${formatNumber(quota.placeDetails.dailyUsed)}/${formatNumber(quota.placeDetails.dailyLimit)}` : "--" }), _jsx("span", { children: "Telefone e site aparecem sob demanda" })] })] }), _jsx("div", {
                className: "stats-grid", style: { marginTop: "0.85rem" }, children: monthlyStats.map((item) => (_jsxs("div", {
                    className: `stat-card ${item.tone}`, children: [_jsx("strong", { children: item.value }), _jsx("span", { children: item.title }), _jsx("div", {
                        style: { marginTop: "0.75rem", height: "8px", borderRadius: "999px", background: "rgba(41, 86, 215, 0.08)", overflow: "hidden" }, children: _jsx("div", {
                            style: {
                                width: `${item.progress}%`,
                                height: "100%",
                                borderRadius: "999px",
                                background: item.progress >= 85 ? "var(--danger)" : item.progress >= 70 ? "var(--warning)" : "var(--accent)",
                            }
                        })
                    })]
                }, item.title)))
            }), configQuery.data?.guardrails.length ? (_jsx("div", { className: "stack-list", style: { marginTop: "1rem" }, children: configQuery.data.guardrails.map((item) => (_jsx("div", { className: "queue-card compact", children: _jsx("div", { className: "queue-card-meta", children: _jsx("span", { children: item }) }) }, item))) })) : null]
        }))]
    }));
}
