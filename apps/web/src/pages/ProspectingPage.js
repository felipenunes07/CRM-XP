import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ExternalLink, Globe2, Layers3, Map, MapPinned, Phone, Save, Search, ShieldAlert, Sparkles, Star, Target, UserCheck, } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useUiLanguage } from "../i18n";
import { api } from "../lib/api";
import { formatDate, formatNumber } from "../lib/format";
const BRAZIL_STATES = [
    "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
    "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];
const DEFAULT_PRESET_KEYWORDS = new Set(["assistencia tecnica", "distribuidora de telas", "troca de tela"]);
const MAP_MARKER_POSITIONS = [
    { top: "17%", left: "18%" },
    { top: "24%", left: "48%" },
    { top: "31%", left: "72%" },
    { top: "44%", left: "34%" },
    { top: "52%", left: "62%" },
    { top: "61%", left: "22%" },
    { top: "68%", left: "78%" },
    { top: "76%", left: "46%" },
];
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
function leadStatusLabel(status, tx) {
    if (status === "NEW")
        return tx("Novo", "新线索");
    if (status === "CLAIMED")
        return tx("Assumido", "已领取");
    if (status === "CONTACTED")
        return tx("Contatado", "已联系");
    return tx("Descartado", "已丢弃");
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
function buildMapQuery(lead, filters) {
    if (lead?.address?.trim()) {
        return lead.address.trim();
    }
    if (lead?.city?.trim()) {
        return `${lead.city.trim()}, ${lead.state}`;
    }
    if (filters?.city?.trim()) {
        return `${filters.city.trim()}, ${filters.state}`;
    }
    if (filters?.keyword?.trim()) {
        return `${filters.keyword.trim()}, ${filters.state}`;
    }
    return "Sao Paulo, SP";
}
function leadMarkerTone(status) {
    if (status === "CONTACTED")
        return "contacted";
    if (status === "CLAIMED")
        return "claimed";
    if (status === "DISCARDED")
        return "discarded";
    return "new";
}
export function ProspectingPage() {
    const { token, user } = useAuth();
    const { tx } = useUiLanguage();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState("buscar");
    const [filters, setFilters] = useState(defaultFilters);
    const [submittedFilters, setSubmittedFilters] = useState(null);
    const [selectedLeadId, setSelectedLeadId] = useState(null);
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
    const apiEnabled = Boolean(configQuery.data?.apiEnabled);
    const searchResponse = searchMutation.data;
    const searchErrorMessage = searchMutation.error instanceof Error ? searchMutation.error.message : null;
    const results = searchResponse?.items ?? [];
    const isCacheOnlyMode = !apiEnabled;
    const canSearch = Boolean(filters.keyword?.trim() && filters.state?.trim());
    const { base: basePresets, saved: savedPresets } = useMemo(() => splitPresets(configQuery.data?.presets), [configQuery.data?.presets]);
    const selectedLead = useMemo(() => results.find((lead) => lead.id === selectedLeadId) ?? results[0] ?? null, [results, selectedLeadId]);
    const mapQuery = useMemo(() => buildMapQuery(selectedLead, submittedFilters ?? filters), [selectedLead, submittedFilters, filters]);
    const mapEmbedSrc = useMemo(() => `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=${selectedLead?.address ? 15 : 11}&output=embed`, [mapQuery, selectedLead]);
    const visibleMapLeads = useMemo(() => results.slice(0, MAP_MARKER_POSITIONS.length), [results]);
    const emptySearchNeedsSetup = Boolean(submittedFilters && isCacheOnlyMode && !results.length);
    const emptySearchWithoutSetupMessage = tx("Sem GOOGLE_MAPS_API_KEY e sem cache salvo para esta consulta. Nenhum lead novo pode aparecer neste ambiente ate a API ser configurada.", "当前环境没有 GOOGLE_MAPS_API_KEY，且这次查询没有本地缓存。在配置 API 之前，这里不会出现新的线索。");
    const searchStats = useMemo(() => {
        const availableCount = results.filter((lead) => !lead.assignedTo).length;
        const withPhoneCount = results.filter((lead) => Boolean(lead.phone)).length;
        const withSiteCount = results.filter((lead) => Boolean(lead.websiteUrl)).length;
        return [
            {
                label: tx("Leads na rota", "当前线索"),
                value: formatNumber(results.length),
                helper: submittedFilters ? `${submittedFilters.state}${submittedFilters.city ? ` - ${submittedFilters.city}` : ""}` : tx("Sem busca rodada", "尚未执行搜索"),
            },
            {
                label: tx("Livres para assumir", "可领取"),
                value: formatNumber(availableCount),
                helper: tx("Priorize os que estao sem responsavel", "优先处理没有负责人的线索"),
            },
            {
                label: tx("Com telefone", "有电话"),
                value: formatNumber(withPhoneCount),
                helper: tx("Contato mais rapido para a equipe", "适合团队快速联系"),
            },
            {
                label: tx("Com site", "有网站"),
                value: formatNumber(withSiteCount),
                helper: tx("Ajuda na qualificacao inicial", "有助于初步筛选"),
            },
        ];
    }, [results, submittedFilters, tx]);
    const monthlyStats = useMemo(() => {
        if (!quota) {
            return [];
        }
        return [
            {
                title: tx("Buscas no mes", "本月搜索"),
                value: `${formatNumber(quota.textSearch.monthlyUsed)} / ${formatNumber(quota.textSearch.monthlyLimit)}`,
                progress: quotaProgress(quota.textSearch.monthlyUsed, quota.textSearch.monthlyLimit),
                tone: quotaTone(quota.textSearch.monthlyUsed, quota.textSearch.monthlyLimit),
            },
            {
                title: tx("Detalhes no mes", "本月详情查询"),
                value: `${formatNumber(quota.placeDetails.monthlyUsed)} / ${formatNumber(quota.placeDetails.monthlyLimit)}`,
                progress: quotaProgress(quota.placeDetails.monthlyUsed, quota.placeDetails.monthlyLimit),
                tone: quotaTone(quota.placeDetails.monthlyUsed, quota.placeDetails.monthlyLimit),
            },
        ];
    }, [quota, tx]);
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
        setSelectedLeadId(null);
        await rerunSearch(nextFilters);
    };
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Prospeccao", "获客开发") }), _jsx("h2", { className: "premium-header-title", children: tx("Prospeccao Leads", "线索开发") }), _jsx("p", { className: "panel-subcopy", children: tx("A tela agora ficou com cara de central operacional: busca, mapa, fila lateral e acao rapida em um fluxo mais visual.", "这块页面现在是一个运营中枢：搜索、地图、侧边队列和快捷动作都整合在一个更直观的流程里。") })] }) }), _jsxs("div", { style: { display: "flex", gap: "0.75rem", flexWrap: "wrap" }, children: [_jsx("button", { type: "button", className: activeTab === "buscar" ? "primary-button" : "ghost-button", onClick: () => setActiveTab("buscar"), children: tx("Buscar Leads", "搜索线索") }), _jsx("button", { type: "button", className: activeTab === "painel" ? "primary-button" : "ghost-button", onClick: () => setActiveTab("painel"), children: tx("Painel Operacional", "运营面板") })] })] }), activeTab === "buscar" ? (_jsxs(_Fragment, { children: [!apiEnabled ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "queue-card compact", children: _jsx("div", { className: "queue-card-meta", children: _jsxs("span", { children: [_jsx(ShieldAlert, { size: 14 }), tx("Google Places ainda nao esta habilitado neste ambiente. Reinicie a API depois de configurar o `.env` para liberar a busca real.", "当前环境尚未启用 Google Places。配置好 `.env` 后请重启 API，才能开启真实搜索。")] }) }) }) })) : null, _jsx("section", { className: "panel prospecting-command-panel", children: _jsxs("div", { className: "prospecting-command-layout", children: [_jsxs("div", { className: "prospecting-command-copy", children: [_jsx("div", { className: "panel-header", style: { marginBottom: 0 }, children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Central de prospeccao", "获客指挥台") }), _jsx("h3", { children: tx("Mapa, fila e acao rapida na mesma tela", "地图、队列和快捷动作同屏协作") }), _jsx("p", { className: "panel-subcopy", children: tx("Monte a busca, visualize a regiao no mapa e clique no lead para ver detalhes sem sair da operacao.", "设置搜索条件，在地图上查看区域分布，并点击线索查看详情，无需离开当前操作页面。") })] }) }), _jsxs("form", { className: "prospecting-search-grid", onSubmit: (event) => {
                                                event.preventDefault();
                                                void handleSearch();
                                            }, children: [_jsxs("label", { className: "full-span", children: [tx("Palavra-chave", "关键词"), _jsx("input", { value: filters.keyword ?? "", onChange: (event) => setFilters((current) => ({ ...current, keyword: event.target.value })), placeholder: tx("Ex.: distribuicao de telas", "例：屏幕分销") })] }), _jsxs("label", { children: [tx("Estado", "州"), _jsx("select", { value: filters.state ?? "SP", onChange: (event) => setFilters((current) => ({ ...current, state: event.target.value })), children: BRAZIL_STATES.map((state) => (_jsx("option", { value: state, children: state }, state))) })] }), _jsxs("label", { children: [tx("Cidade opcional", "可选城市"), _jsx("input", { value: filters.city ?? "", onChange: (event) => setFilters((current) => ({ ...current, city: event.target.value })), placeholder: tx("Ex.: Campinas", "例：Campinas") })] }), _jsxs("div", { className: "prospecting-inline-actions", children: [_jsxs("button", { type: "submit", className: "primary-button", disabled: !canSearch || searchMutation.isPending, children: [_jsx(Search, { size: 16 }), searchMutation.isPending ? tx("Buscando...", "搜索中...") : tx("Buscar no mapa", "在地图中搜索")] }), _jsxs("button", { type: "button", className: "ghost-button", onClick: () => savePresetMutation.mutate(filters.keyword ?? ""), disabled: !filters.keyword?.trim() || savePresetMutation.isPending, children: [_jsx(Save, { size: 16 }), tx("Salvar busca", "保存搜索")] })] })] }), _jsx("div", { className: "prospecting-chip-group", children: basePresets.map((preset) => (_jsx("button", { type: "button", className: "ghost-button small", onClick: () => setFilters((current) => ({ ...current, keyword: preset.keyword })), children: preset.label }, preset.id))) }), savedPresets.length ? (_jsxs("div", { className: "prospecting-saved-block", children: [_jsx("p", { className: "eyebrow", children: tx("Buscas salvas", "已保存搜索") }), _jsx("div", { className: "prospecting-chip-group", children: savedPresets.map((preset) => (_jsx("button", { type: "button", className: "ghost-button small", onClick: () => setFilters((current) => ({ ...current, keyword: preset.keyword })), children: preset.label }, preset.id))) })] })) : null] }), _jsxs("aside", { className: "prospecting-command-sidebar", children: [_jsxs("div", { className: "prospecting-sidebar-card", children: [_jsxs("div", { className: "prospecting-sidebar-card-top", children: [_jsx("span", { className: "prospecting-sidebar-icon", children: _jsx(Layers3, { size: 18 }) }), _jsxs("div", { children: [_jsx("strong", { children: tx("Resumo da operacao", "运营摘要") }), _jsx("p", { children: searchResponse?.notice ?? tx("A busca aparece aqui com resumo operacional assim que voce rodar a consulta.", "执行搜索后，这里会显示本次检索的运营摘要。") })] })] }), _jsx("div", { className: `prospecting-mode-badge${isCacheOnlyMode ? " warning" : ""}`, children: isCacheOnlyMode
                                                        ? tx("Modo atual: cache local", "当前模式：本地缓存")
                                                        : tx("Modo atual: busca Google ativa", "当前模式：Google 搜索已启用") }), _jsx("div", { className: "prospecting-stat-grid", children: searchStats.map((item) => (_jsxs("div", { className: "prospecting-stat-tile", children: [_jsx("span", { children: item.label }), _jsx("strong", { children: item.value }), _jsx("small", { children: item.helper })] }, item.label))) })] }), _jsxs("div", { className: "prospecting-sidebar-card", children: [_jsxs("div", { className: "prospecting-sidebar-card-top", children: [_jsx("span", { className: "prospecting-sidebar-icon accent-soft", children: _jsx(Sparkles, { size: 18 }) }), _jsxs("div", { children: [_jsx("strong", { children: tx("Meta do dia", "今日目标") }), _jsx("p", { children: summaryQuery.data
                                                                        ? tx(`${summaryQuery.data.uniqueContactsToday} contatos feitos. Faltam ${summaryQuery.data.remainingToGoal} para bater a meta.`, `今天已完成 ${summaryQuery.data.uniqueContactsToday} 次联系。距离目标还差 ${summaryQuery.data.remainingToGoal}。`)
                                                                        : tx("Carregando leitura operacional do dia.", "正在加载今日运营读数。") })] })] }), _jsxs("div", { className: "prospecting-compact-kpis", children: [_jsxs("div", { children: [_jsx("span", { children: tx("Busca hoje", "今日搜索") }), _jsx("strong", { children: quota ? `${formatNumber(quota.textSearch.dailyUsed)}/${formatNumber(quota.textSearch.dailyLimit)}` : "--" })] }), _jsxs("div", { children: [_jsx("span", { children: tx("Detalhes hoje", "今日详情查询") }), _jsx("strong", { children: quota ? `${formatNumber(quota.placeDetails.dailyUsed)}/${formatNumber(quota.placeDetails.dailyLimit)}` : "--" })] })] })] })] })] }) }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Mapa de leads", "线索地图") }), _jsx("h3", { children: tx("Vista operacional da prospeccao", "获客运营视图") }), _jsx("p", { className: "panel-subcopy", children: selectedLead
                                                ? tx(`Foco atual em ${selectedLead.displayName}. Clique nos pinos ou na fila lateral para trocar o destaque.`, `当前焦点：${selectedLead.displayName}。点击地图标记或侧边队列可切换重点线索。`)
                                                : tx("Faca uma busca para carregar os leads e preencher o mapa com a fila priorizada.", "请先执行搜索，以加载线索并用优先队列填充地图。") })] }) }), searchMutation.isPending ? _jsx("div", { className: "page-loading", children: tx("Buscando leads...", "正在搜索线索...") }) : null, searchErrorMessage ? _jsx("div", { className: "page-error", children: searchErrorMessage }) : null, !submittedFilters && !searchMutation.isPending ? (_jsx("div", { className: "empty-state", children: tx("Escolha a palavra-chave, estado e clique em Buscar.", "请选择关键词和州，然后点击搜索。") })) : null, submittedFilters && !searchMutation.isPending && !searchErrorMessage && !results.length ? (_jsx("div", { className: "empty-state", children: apiEnabled
                                    ? tx("Nenhum lead apareceu com essa combinacao.", "这个组合条件下没有找到线索。")
                                    : emptySearchWithoutSetupMessage })) : null, !searchMutation.isPending && !searchErrorMessage ? (_jsxs("div", { className: "prospecting-operations-grid", children: [_jsxs("div", { className: "prospecting-map-card", children: [_jsxs("div", { className: "prospecting-map-toolbar", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Radar comercial", "销售雷达") }), _jsx("strong", { children: submittedFilters?.keyword || filters.keyword || tx("Mapa regional", "区域地图") })] }), _jsxs("div", { className: "prospecting-map-badges", children: [_jsx("span", { children: submittedFilters?.state || filters.state }), _jsx("span", { children: submittedFilters?.city || tx("Sem filtro de cidade", "未筛选城市") })] })] }), _jsxs("div", { className: "prospecting-map-frame", children: [_jsx("iframe", { title: tx("Mapa da prospeccao", "获客地图"), src: mapEmbedSrc, loading: "lazy", referrerPolicy: "no-referrer-when-downgrade" }), _jsx("div", { className: "prospecting-map-grid" }), _jsx("div", { className: "prospecting-map-overlay" }), visibleMapLeads.map((lead, index) => {
                                                        const position = MAP_MARKER_POSITIONS[index];
                                                        const isActive = lead.id === selectedLead?.id;
                                                        return (_jsxs("button", { type: "button", className: `prospecting-map-pin tone-${leadMarkerTone(lead.status)}${isActive ? " active" : ""}`, style: position, onClick: () => setSelectedLeadId(lead.id), "aria-label": tx(`Selecionar ${lead.displayName}`, `选择 ${lead.displayName}`), children: [_jsx(MapPinned, { size: 16 }), _jsx("span", { children: index + 1 })] }, lead.id));
                                                    }), _jsxs("div", { className: "prospecting-map-focus-card", children: [_jsx("span", { className: "prospecting-map-focus-kicker", children: tx("Lead em foco", "当前焦点线索") }), _jsx("strong", { children: selectedLead?.displayName ?? tx("Aguardando selecao", "等待选择") }), _jsx("small", { children: selectedLead?.address || mapQuery })] })] }), _jsxs("div", { className: "prospecting-map-footer", children: [_jsxs("div", { className: "prospecting-map-legend", children: [_jsxs("span", { children: [_jsx(Map, { size: 14 }), " ", tx("Novo", "新线索")] }), _jsxs("span", { children: [_jsx(Star, { size: 14 }), " ", tx("Assumido", "已领取")] }), _jsxs("span", { children: [_jsx(UserCheck, { size: 14 }), " ", tx("Contatado", "已联系")] })] }), selectedLead?.mapsUrl ? (_jsxs("a", { className: "ghost-button small", href: selectedLead.mapsUrl, target: "_blank", rel: "noreferrer", children: [_jsx(MapPinned, { size: 14 }), tx("Abrir local completo", "打开完整位置")] })) : null] })] }), _jsxs("aside", { className: "prospecting-focus-panel", children: [_jsxs("div", { className: "prospecting-focus-card", children: [_jsx("p", { className: "eyebrow", children: tx("Lead selecionado", "已选线索") }), _jsxs("div", { className: "prospecting-focus-header", children: [_jsxs("div", { children: [_jsx("h4", { children: selectedLead?.displayName ?? tx("Nenhum lead selecionado", "未选择线索") }), _jsx("p", { children: selectedLead?.primaryCategory || tx("Categoria principal nao informada", "未提供主营类别") })] }), selectedLead ? (_jsx("span", { className: `status-badge status-${selectedLead.status.toLowerCase()}`, children: leadStatusLabel(selectedLead.status, tx) })) : null] }), selectedLead ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "prospecting-focus-metrics", children: [_jsxs("div", { children: [_jsx("span", { children: tx("Score", "评分") }), _jsx("strong", { children: selectedLead.score.toFixed(0) })] }), _jsxs("div", { children: [_jsx("span", { children: tx("Avaliacoes", "评价数") }), _jsx("strong", { children: selectedLead.reviewCount ? formatNumber(selectedLead.reviewCount) : "--" })] }), _jsxs("div", { children: [_jsx("span", { children: tx("Responsavel", "负责人") }), _jsx("strong", { children: selectedLead.assignedTo?.name || tx("Livre", "空闲") })] })] }), _jsxs("div", { className: "prospecting-focus-details", children: [_jsxs("span", { children: [_jsx(Building2, { size: 14 }), " ", selectedLead.city || tx("Cidade livre", "城市未填写"), ", ", selectedLead.state] }), _jsxs("span", { children: [_jsx(Phone, { size: 14 }), " ", selectedLead.phone || tx("Telefone ao assumir o lead", "领取后查看电话")] }), _jsxs("span", { children: [_jsx(Globe2, { size: 14 }), " ", selectedLead.websiteUrl ? tx("Tem site para validar", "有网站可验证") : tx("Sem site carregado", "未加载网站")] })] }), _jsx("p", { className: "prospecting-focus-address", children: selectedLead.address || tx("Endereco ainda nao carregado nessa etapa.", "当前阶段尚未加载地址。") }), _jsxs("div", { className: "prospecting-focus-actions", children: [selectedLead.mapsUrl ? (_jsxs("a", { className: "ghost-button small", href: selectedLead.mapsUrl, target: "_blank", rel: "noreferrer", children: [_jsx(MapPinned, { size: 14 }), tx("Maps", "地图")] })) : null, selectedLead.websiteUrl ? (_jsxs("a", { className: "ghost-button small", href: selectedLead.websiteUrl, target: "_blank", rel: "noreferrer", children: [_jsx(ExternalLink, { size: 14 }), tx("Site", "网站")] })) : null, selectedLead.whatsappUrl ? (_jsxs("a", { className: "ghost-button small", href: selectedLead.whatsappUrl, target: "_blank", rel: "noreferrer", children: [_jsx(Phone, { size: 14 }), "WhatsApp"] })) : null] })] })) : (_jsxs("div", { className: "prospecting-focus-empty", children: [emptySearchNeedsSetup ? (_jsxs("div", { className: "prospecting-setup-callout", children: [_jsx("strong", { children: tx("Busca real indisponivel", "真实搜索不可用") }), _jsx("p", { children: emptySearchWithoutSetupMessage })] })) : null, _jsxs("span", { children: [_jsx(MapPinned, { size: 16 }), " ", tx("O mapa ja fica ativo com a regiao da busca.", "地图会根据当前搜索区域自动激活。")] }), _jsxs("span", { children: [_jsx(Search, { size: 16 }), " ", tx("Rode uma busca para preencher a fila lateral com leads reais.", "执行一次搜索后，侧边队列会显示真实线索。")] })] }))] }), _jsxs("div", { className: "prospecting-lead-rail", children: [_jsxs("div", { className: "prospecting-lead-rail-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Fila lateral", "侧边队列") }), _jsx("h4", { children: tx("Leads mais quentes", "最热线索") })] }), _jsx("span", { children: tx(`${formatNumber(results.length)} itens`, `${formatNumber(results.length)} 条`) })] }), _jsx("div", { className: "prospecting-lead-rail-list", children: results.length ? (results.slice(0, 6).map((lead, index) => (_jsxs("button", { type: "button", className: `prospecting-lead-rail-item${lead.id === selectedLead?.id ? " active" : ""}`, onClick: () => setSelectedLeadId(lead.id), children: [_jsx("span", { className: `prospecting-lead-rail-index tone-${leadMarkerTone(lead.status)}`, children: index + 1 }), _jsxs("div", { children: [_jsx("strong", { children: lead.displayName }), _jsxs("small", { children: [lead.city || tx("Cidade livre", "城市未填写"), ", ", lead.state] })] }), _jsx("span", { className: "score-pill", children: tx(`Score ${lead.score.toFixed(0)}`, `评分 ${lead.score.toFixed(0)}`) })] }, lead.id)))) : (_jsxs("div", { className: "prospecting-lead-rail-empty", children: [emptySearchNeedsSetup ? (_jsxs("div", { className: "prospecting-setup-callout", children: [_jsx("strong", { children: tx("Google Places nao configurado", "Google Places 未配置") }), _jsx("p", { children: emptySearchWithoutSetupMessage })] })) : null, _jsx("strong", { children: tx("Fila aguardando busca", "队列等待搜索") }), _jsx("p", { children: tx("Defina palavra-chave, estado e opcionalmente cidade para preencher o painel com leads da regiao.", "请设置关键词、州以及可选城市，以便用该地区线索填充面板。") })] })) })] })] })] })) : null] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Carteira priorizada", "优先线索池") }), _jsx("h3", { children: tx("Leads priorizados para prospeccao", "优先线索列表") }), _jsx("p", { className: "panel-subcopy", children: searchResponse?.notice ?? tx("Faca uma busca para carregar os leads.", "先执行一次搜索以加载线索。") })] }) }), _jsx("div", { className: "queue-list", children: results.map((lead) => {
                                    const isMine = lead.assignedTo?.id === user?.id;
                                    const isSelected = lead.id === selectedLead?.id;
                                    return (_jsxs("article", { className: `queue-card prospecting-lead-card${isSelected ? " is-selected" : ""}`, onMouseEnter: () => setSelectedLeadId(lead.id), children: [_jsxs("div", { className: "queue-card-top", children: [_jsxs("div", { className: "queue-card-heading", children: [_jsxs("div", { className: "agenda-title", children: [_jsx("h3", { children: lead.displayName }), _jsx("span", { className: "score-pill", children: tx(`Score ${lead.score.toFixed(0)}`, `评分 ${lead.score.toFixed(0)}`) }), _jsx("span", { className: `status-badge status-${lead.status.toLowerCase()}`, children: leadStatusLabel(lead.status, tx) })] }), _jsxs("p", { className: "queue-card-note", children: [lead.primaryCategory || tx("Categoria principal nao informada", "未提供主营类别"), " - ", lead.city || tx("Cidade livre", "城市未填写"), ", ", lead.state] }), _jsx("p", { className: "queue-card-note", children: lead.address || tx("Endereco ainda nao carregado nessa etapa.", "当前阶段尚未加载地址。") })] }), _jsxs("div", { className: "queue-card-score", children: [_jsx("strong", { children: lead.assignedTo ? lead.assignedTo.name : tx("Livre", "空闲") }), _jsx("small", { children: lead.assignedTo ? tx("Responsavel atual", "当前负责人") : tx("Disponivel", "可领取") })] })] }), _jsxs("div", { className: "queue-card-meta", children: [_jsxs("span", { children: [_jsx(Building2, { size: 14 }), lead.primaryCategory || tx("Sem categoria", "无类别")] }), _jsxs("span", { children: [_jsx(Target, { size: 14 }), lead.reviewCount ? tx(`${formatNumber(lead.reviewCount)} avaliacoes`, `${formatNumber(lead.reviewCount)} 条评价`) : tx("Avaliacoes sob demanda", "按需加载评价")] }), _jsxs("span", { children: [_jsx(Phone, { size: 14 }), lead.phone || tx("Telefone ao assumir o lead", "领取后查看电话")] }), _jsxs("span", { children: [_jsx(UserCheck, { size: 14 }), lead.firstContactAt ? tx(`Primeiro contato em ${formatDate(lead.firstContactAt)}`, `首次联系于 ${formatDate(lead.firstContactAt)}`) : tx("Ainda nao trabalhado", "尚未跟进")] })] }), _jsxs("div", { className: "queue-card-actions", children: [_jsxs("button", { type: "button", className: "ghost-button small", onClick: () => setSelectedLeadId(lead.id), children: [_jsx(MapPinned, { size: 14 }), tx("Ver no mapa", "在地图查看")] }), lead.mapsUrl ? (_jsxs("a", { className: "ghost-button small", href: lead.mapsUrl, target: "_blank", rel: "noreferrer", children: [_jsx(MapPinned, { size: 14 }), tx("Abrir no Maps", "打开地图")] })) : null, lead.websiteUrl ? (_jsxs("a", { className: "ghost-button small", href: lead.websiteUrl, target: "_blank", rel: "noreferrer", children: [_jsx(ExternalLink, { size: 14 }), tx("Site", "网站")] })) : null, lead.whatsappUrl ? (_jsxs("a", { className: "ghost-button small", href: lead.whatsappUrl, target: "_blank", rel: "noreferrer", children: [_jsx(Phone, { size: 14 }), "WhatsApp"] })) : null, !lead.assignedTo ? (_jsx("button", { type: "button", className: "primary-button", onClick: () => claimMutation.mutate(lead.id), disabled: claimMutation.isPending, children: tx("Assumir lead", "领取线索") })) : null, isMine ? (_jsx("button", { type: "button", className: "ghost-button", onClick: () => setActiveContactLeadId((current) => (current === lead.id ? null : lead.id)), children: tx("Registrar contato", "登记联系") })) : null, isMine && !lead.firstContactAt ? (_jsx("button", { type: "button", className: "ghost-button", onClick: () => releaseMutation.mutate(lead.id), disabled: releaseMutation.isPending, children: tx("Liberar lead", "释放线索") })) : null, (isMine || !lead.assignedTo) ? (_jsx("button", { type: "button", className: "ghost-button danger", onClick: () => discardMutation.mutate(lead.id), disabled: discardMutation.isPending, children: tx("Descartar", "丢弃") })) : null] }), activeContactLeadId === lead.id && isMine ? (_jsxs("div", { style: { borderTop: "1px solid var(--line)", paddingTop: "1rem", display: "grid", gap: "0.85rem" }, children: [_jsxs("div", { className: "filters-grid filters-grid-four", children: [_jsxs("label", { children: [tx("Canal", "渠道"), _jsxs("select", { value: contactForm.channel, onChange: (event) => setContactForm((current) => ({ ...current, channel: event.target.value })), children: [_jsx("option", { value: "WHATSAPP", children: "WhatsApp" }), _jsx("option", { value: "PHONE", children: tx("Ligacao", "电话") }), _jsx("option", { value: "SITE", children: "Site" }), _jsx("option", { value: "OTHER", children: tx("Outro", "其他") })] })] }), _jsxs("label", { children: [tx("Tipo", "类型"), _jsxs("select", { value: contactForm.contactType, onChange: (event) => setContactForm((current) => ({ ...current, contactType: event.target.value })), children: [_jsx("option", { value: "FIRST_CONTACT", children: tx("Primeiro contato", "首次联系") }), _jsx("option", { value: "FOLLOW_UP", children: "Follow-up" }), _jsx("option", { value: "NO_RESPONSE", children: tx("Sem resposta", "未回复") }), _jsx("option", { value: "INTERESTED", children: tx("Interessado", "有兴趣") }), _jsx("option", { value: "DISQUALIFIED", children: tx("Desqualificado", "不合格") })] })] }), _jsxs("label", { className: "full-span", children: [tx("Observacao", "备注"), _jsx("textarea", { rows: 3, value: contactForm.notes, onChange: (event) => setContactForm((current) => ({ ...current, notes: event.target.value })), placeholder: tx("Ex.: pediu retorno depois do almoco.", "例：要求午饭后回电。") })] })] }), _jsxs("div", { className: "inline-actions", children: [_jsx("button", { type: "button", className: "primary-button", onClick: () => contactMutation.mutate(lead.id), disabled: contactMutation.isPending, children: tx("Salvar tentativa", "保存记录") }), _jsx("button", { type: "button", className: "ghost-button", onClick: () => setActiveContactLeadId(null), children: tx("Cancelar", "取消") })] })] })) : null] }, lead.id));
                                }) })] })] })) : (_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Painel operacional", "运营面板") }), _jsx("h3", { children: tx("Meta, uso e protecao da franquia", "目标、使用情况与配额保护") })] }) }), _jsxs("div", { className: "stats-grid", children: [_jsxs("div", { className: "stat-card", children: [_jsx("span", { className: "stat-card-badge", children: tx("Meta do dia", "今日目标") }), _jsx("strong", { children: summaryQuery.data ? `${summaryQuery.data.uniqueContactsToday}/${summaryQuery.data.dailyTarget}` : "--" }), _jsx("span", { children: summaryQuery.data ? tx(`${summaryQuery.data.remainingToGoal} para bater a meta`, `距离目标还差 ${summaryQuery.data.remainingToGoal}`) : tx("Carregando...", "加载中...") })] }), _jsxs("div", { className: "stat-card", children: [_jsx("span", { className: "stat-card-badge", children: tx("Leads assumidos", "已领取线索") }), _jsx("strong", { children: summaryQuery.data ? formatNumber(summaryQuery.data.claimedLeadCount) : "--" }), _jsx("span", { children: tx(`${user?.name ?? "Vendedora"} em operacao hoje`, `${user?.name ?? "销售"} 今日在岗`) })] }), _jsxs("div", { className: `stat-card ${quota ? quotaTone(quota.textSearch.dailyUsed, quota.textSearch.dailyLimit) : ""}`, children: [_jsx("span", { className: "stat-card-badge", children: tx("Busca hoje", "今日搜索") }), _jsx("strong", { children: quota ? `${formatNumber(quota.textSearch.dailyUsed)}/${formatNumber(quota.textSearch.dailyLimit)}` : "--" }), _jsx("span", { children: tx("Trava diaria para nao estourar a faixa gratis", "每日限额，避免超出免费区间") })] }), _jsxs("div", { className: `stat-card ${quota ? quotaTone(quota.placeDetails.dailyUsed, quota.placeDetails.dailyLimit) : ""}`, children: [_jsx("span", { className: "stat-card-badge", children: tx("Detalhes hoje", "今日详情查询") }), _jsx("strong", { children: quota ? `${formatNumber(quota.placeDetails.dailyUsed)}/${formatNumber(quota.placeDetails.dailyLimit)}` : "--" }), _jsx("span", { children: tx("Telefone e site aparecem sob demanda", "电话和网站按需加载") })] })] }), _jsx("div", { className: "stats-grid", style: { marginTop: "0.85rem" }, children: monthlyStats.map((item) => (_jsxs("div", { className: `stat-card ${item.tone}`, children: [_jsx("strong", { children: item.value }), _jsx("span", { children: item.title }), _jsx("div", { style: { marginTop: "0.75rem", height: "8px", borderRadius: "999px", background: "rgba(41, 86, 215, 0.08)", overflow: "hidden" }, children: _jsx("div", { style: {
                                            width: `${item.progress}%`,
                                            height: "100%",
                                            borderRadius: "999px",
                                            background: item.progress >= 85 ? "var(--danger)" : item.progress >= 70 ? "var(--warning)" : "var(--accent)",
                                        } }) })] }, item.title))) }), configQuery.data?.guardrails.length ? (_jsx("div", { className: "stack-list", style: { marginTop: "1rem" }, children: configQuery.data.guardrails.map((item) => (_jsx("div", { className: "queue-card compact", children: _jsx("div", { className: "queue-card-meta", children: _jsx("span", { children: item }) }) }, item))) })) : null] }))] }));
}
