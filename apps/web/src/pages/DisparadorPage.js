import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, LoaderCircle, Send, ShieldAlert, Plus, ArrowRight, Check, Trash2, Users, Smartphone, PlusCircle, Sparkles, ChevronRight, ChevronLeft, ClipboardList, Save } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDateTime, formatNumber, formatPercent } from "../lib/format";
const quickFilters = [
    { value: "ALL", label: "Todos", description: "Toda a base importada." },
    { value: "WITH_ORDER", label: "Clientes", description: "Clientes com pedido." },
    { value: "NO_ORDER_EXCEL", label: "Nunca comprou", description: "Nunca comprou." },
    { value: "ATTENTION", label: "Atenção", description: "Clientes que necessitam de atenção." },
    { value: "INACTIVE", label: "Inativos", description: "Clientes inativos." },
    { value: "OTHER", label: "Outros", description: "LJ, internos e demais grupos." },
    { value: "BLOQUEADOS", label: "Bloqueados", description: "Grupos sob bloqueio recente." },
    { value: "ULTIMO_CONTATO", label: "Último contato", description: "Histórico de envio recente." },
    { value: "SELECTED", label: "Selecionados", description: "Visualizar apenas contatos selecionados para envio." },
];
function buildGroupsQueryParams(input) {
    const params = {
        search: input.search || undefined,
        savedSegmentId: input.savedSegmentId || undefined,
        onlyRecentlyBlocked: input.onlyRecentlyBlocked || undefined,
    };
    if (input.quickFilter === "WITH_ORDER" || input.quickFilter === "NO_ORDER_EXCEL" || input.quickFilter === "OTHER") {
        params.classification = input.quickFilter;
    }
    if (input.quickFilter === "ATTENTION" || input.quickFilter === "INACTIVE") {
        params.customerStatus = input.quickFilter;
    }
    if (input.quickFilter === "BLOQUEADOS") {
        params.onlyRecentlyBlocked = true;
    }
    return params;
}
function classificationLabel(value) {
    if (value === "WITH_ORDER")
        return "Cliente com pedido";
    if (value === "NO_ORDER_EXCEL")
        return "Nunca comprou";
    return "Outro grupo";
}
function mappingStatusLabel(value) {
    if (value === "AUTO_MAPPED")
        return "Mapeado auto";
    if (value === "MANUAL_MAPPED")
        return "Mapeado manual";
    if (value === "CONFIRMED_UNMATCHED")
        return "Sem cliente";
    if (value === "IGNORED")
        return "Ignorado";
    return "Pendente";
}
function campaignStatusTone(status) {
    if (status === "COMPLETED")
        return "success";
    if (status === "CANCELLED")
        return "danger";
    return "warning";
}
function recipientTone(status) {
    if (status === "SENT")
        return "success";
    if (status === "FAILED")
        return "danger";
    if (status === "BLOCKED_RECENT" || status === "SKIPPED")
        return "warning";
    return "neutral";
}
function renderRecipientIdentifier(recipient) {
    const displayName = recipient.customerDisplayName || recipient.customerCode;
    const isGroup = recipient.jid.endsWith("@g.us") || recipient.jid.includes("-");
    const jidNum = recipient.jid.split("@")[0] || recipient.jid;
    const formattedJid = isGroup
        ? `👥 Grupo: ${jidNum}`
        : `📞 +${jidNum.slice(0, 2)} (${jidNum.slice(2, 4)}) ${jidNum.slice(4, 9)}-${jidNum.slice(9)}`;
    return (_jsxs("div", { className: "wp-recipient-info-col", children: [_jsx("strong", { className: "wp-recipient-row-name", style: { color: "#0f172a", fontSize: "0.92rem", fontWeight: 700 }, children: displayName || recipient.sourceName || (isGroup ? "Grupo de WhatsApp" : "Cliente WhatsApp") }), _jsx("span", { className: "wp-recipient-row-jid", style: { fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }, children: formattedJid })] }));
}
function recipientLiveLabel(recipient) {
    if (recipient.status === "SENT") {
        return `Enviado ${formatDateTime(recipient.sentAt)}`;
    }
    if (recipient.status === "FAILED") {
        return recipient.lastError || "Falha no envio";
    }
    if (recipient.status === "SENDING") {
        return "Enviando agora";
    }
    if (recipient.status === "PENDING") {
        return `Agendado para ${formatDateTime(recipient.scheduledFor)}`;
    }
    if (recipient.status === "BLOCKED_RECENT") {
        return "Bloqueado por contato recente";
    }
    return "Pulado";
}
function formatCountdown(targetAt, nowMs) {
    if (!targetAt) {
        return null;
    }
    const targetMs = new Date(targetAt).getTime();
    if (!Number.isFinite(targetMs)) {
        return null;
    }
    const diffMs = Math.max(0, targetMs - nowMs);
    const totalSeconds = Math.ceil(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function truncateText(value, maxLength = 96) {
    if (!value) {
        return "";
    }
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}
function quickFilterCount(filter, summary, loadedItems, selectedCount) {
    if (filter === "SELECTED")
        return formatNumber(selectedCount ?? 0);
    if (!summary)
        return "--";
    if (filter === "ATTENTION") {
        return formatNumber(summary.attentionCount ?? 0);
    }
    if (filter === "INACTIVE") {
        return formatNumber(summary.inactiveCount ?? 0);
    }
    if (filter === "ALL")
        return formatNumber(summary.totalGroups);
    if (filter === "WITH_ORDER")
        return formatNumber(summary.classificationCounts["WITH_ORDER"]);
    if (filter === "NO_ORDER_EXCEL")
        return formatNumber(summary.classificationCounts["NO_ORDER_EXCEL"]);
    if (filter === "OTHER")
        return formatNumber(summary.classificationCounts["OTHER"]);
    if (filter === "BLOQUEADOS")
        return formatNumber(summary.recentlyBlockedGroups);
    if (filter === "ULTIMO_CONTATO") {
        return formatNumber(loadedItems.filter(g => g.lastContactAt !== null).length);
    }
    return "--";
}
export function DisparadorPage() {
    const auth = useAuth();
    const { token, user } = auth;
    const canImport = ["ADMIN", "MANAGER"].includes(user?.role ?? "");
    const queryClient = useQueryClient();
    const [quickFilter, setQuickFilter] = useState("ALL");
    const [currentPage, setCurrentPage] = useState(1);
    const [dispatchesFilter, setDispatchesFilter] = useState("ALL");
    const [search, setSearch] = useState("");
    const [savedSegmentId, setSavedSegmentId] = useState("");
    const [recentBlockFilter, setRecentBlockFilter] = useState("AVAILABLE_ONLY");
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState("");
    const [pastedClsText, setPastedClsText] = useState("");
    const [newSegmentName, setNewSegmentName] = useState("");
    const [showClPasteArea, setShowClPasteArea] = useState(false);
    const [campaignName, setCampaignName] = useState("");
    const [messageText, setMessageText] = useState("");
    const [overrideRecentBlock, setOverrideRecentBlock] = useState(false);
    const [minDelaySeconds, setMinDelaySeconds] = useState(183);
    const [maxDelaySeconds, setMaxDelaySeconds] = useState(304);
    const [selectedCampaignId, setSelectedCampaignId] = useState(null);
    const [attemptedAutoImport, setAttemptedAutoImport] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());
    // Step-by-step states
    const [activeTab, setActiveTab] = useState("NEW_CAMPAIGN");
    const [currentStep, setCurrentStep] = useState(3); // Start at step 3 to align with user's tab "Destinatários" or step 1
    const [abTestActive, setAbTestActive] = useState(false);
    const [abMessageText, setAbMessageText] = useState("");
    const [selectedAbTemplateId, setSelectedAbTemplateId] = useState("");
    const whatsappInstancesQuery = useQuery({
        queryKey: ["whatsapp-instances"],
        queryFn: () => api.whatsappInstances(token),
        enabled: Boolean(token),
    });
    // Real Senders derived from the backend whatsappInstancesQuery
    const senders = useMemo(() => {
        const list = whatsappInstancesQuery.data ?? [];
        if (list.length === 0) {
            return [
                { id: "default", name: "Carregando...", role: "WhatsApp", phone: "", avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80", status: "DISCONNECTED" }
            ];
        }
        return list.map(instance => ({
            id: instance.id,
            name: instance.displayLabel || instance.instanceName || "Canal WhatsApp",
            role: instance.assignedUserName || "Conexão",
            phone: instance.phoneNumber || "Sem número",
            avatarUrl: instance.profilePictureUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
            status: instance.status
        }));
    }, [whatsappInstancesQuery.data]);
    const [selectedSenderIds, setSelectedSenderIds] = useState([]);
    // Auto-select all active senders when loaded
    useEffect(() => {
        if (whatsappInstancesQuery.data && whatsappInstancesQuery.data.length > 0) {
            const activeIds = whatsappInstancesQuery.data
                .filter(inst => inst.status === "ACTIVE")
                .map(inst => inst.id);
            const firstId = whatsappInstancesQuery.data[0]?.id;
            if (firstId) {
                setSelectedSenderIds(activeIds.length ? activeIds : [firstId]);
            }
        }
    }, [whatsappInstancesQuery.data]);
    const [recipientSenderMapping, setRecipientSenderMapping] = useState({}); // groupId -> senderId
    // Tooltip tracking
    const [hoveredGroupId, setHoveredGroupId] = useState(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const groupQueryParams = useMemo(() => buildGroupsQueryParams({
        quickFilter,
        search,
        savedSegmentId,
        onlyRecentlyBlocked: recentBlockFilter === "BLOCKED_ONLY",
    }), [quickFilter, recentBlockFilter, savedSegmentId, search]);
    async function invalidateWhatsappQueries() {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["whatsapp-group-mapping-summary"] }),
            queryClient.invalidateQueries({ queryKey: ["whatsapp-groups"] }),
            queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
        ]);
    }
    const templatesQuery = useQuery({
        queryKey: ["message-templates"],
        queryFn: () => api.messageTemplates(token),
        enabled: Boolean(token),
    });
    const savedSegmentsQuery = useQuery({
        queryKey: ["saved-segments"],
        queryFn: () => api.savedSegments(token),
        enabled: Boolean(token),
    });
    const mappingSummaryQuery = useQuery({
        queryKey: ["whatsapp-group-mapping-summary"],
        queryFn: () => api.whatsappGroupMappingSummary(token),
        enabled: Boolean(token),
    });
    const groupsQuery = useQuery({
        queryKey: ["whatsapp-groups", groupQueryParams],
        queryFn: () => api.whatsappGroups(token, groupQueryParams),
        enabled: Boolean(token),
    });
    const campaignsQuery = useQuery({
        queryKey: ["whatsapp-campaigns"],
        queryFn: () => api.whatsappCampaigns(token, 20),
        enabled: Boolean(token),
        refetchInterval: (query) => query.state.data?.some((campaign) => ["QUEUED", "IN_PROGRESS"].includes(campaign.status)) ? 5000 : false,
    });
    const selectedCampaignQuery = useQuery({
        queryKey: ["whatsapp-campaign", selectedCampaignId],
        queryFn: () => api.whatsappCampaign(token, selectedCampaignId, { limit: 80, offset: 0 }),
        enabled: Boolean(token && selectedCampaignId),
        refetchInterval: (query) => query.state.data && ["QUEUED", "IN_PROGRESS"].includes(query.state.data.status) ? 3000 : false,
    });
    const importDefaultMutation = useMutation({
        mutationFn: () => api.importWhatsappGroupsDefault(token),
        onSuccess: async () => {
            await invalidateWhatsappQueries();
        },
    });
    const createSavedSegmentMutation = useMutation({
        mutationFn: (input) => api.createSavedSegment(token, input),
        onSuccess: (savedSegment) => {
            void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
            setSavedSegmentId(savedSegment.id);
            setShowClPasteArea(false);
            setPastedClsText("");
            setNewSegmentName("");
        },
        onError: (err) => {
            alert(`Erro ao criar grupo: ${err.message || err}`);
        }
    });
    const createCampaignMutation = useMutation({
        mutationFn: () => api.createWhatsappCampaign(token, {
            name: campaignName.trim() || `Disparo ${new Date().toLocaleDateString("pt-BR")}`,
            templateId: selectedTemplateId || null,
            savedSegmentId: savedSegmentId || null,
            whatsappInstanceId: selectedSenderIds[0] || null,
            messageText,
            filtersSnapshot: {
                quickFilter,
                search,
                savedSegmentId: savedSegmentId || null,
                recentBlockFilter,
                selectedCount: selectedGroupIds.length,
            },
            groupIds: selectedGroupIds,
            overrideRecentBlock,
            minDelaySeconds,
            maxDelaySeconds,
        }),
        onSuccess: async (campaign) => {
            setSelectedCampaignId(campaign?.id ?? null);
            setSelectedGroupIds([]);
            await invalidateWhatsappQueries();
            setActiveTab("HISTORY");
        },
    });
    const activeCampaignId = useMemo(() => {
        if (createCampaignMutation.data?.id) {
            return createCampaignMutation.data.id;
        }
        const activeCampaign = campaignsQuery.data?.find((campaign) => ["QUEUED", "IN_PROGRESS"].includes(campaign.status));
        return activeCampaign?.id ?? selectedCampaignId ?? null;
    }, [campaignsQuery.data, createCampaignMutation.data?.id, selectedCampaignId]);
    const activeCampaignQuery = useQuery({
        queryKey: ["whatsapp-campaign-live", activeCampaignId],
        queryFn: () => api.whatsappCampaign(token, activeCampaignId, { limit: 20, offset: 0 }),
        enabled: Boolean(token && activeCampaignId),
        refetchInterval: (query) => query.state.data && ["QUEUED", "IN_PROGRESS"].includes(query.state.data.status) ? 1500 : false,
    });
    const cancelCampaignMutation = useMutation({
        mutationFn: (campaignId) => api.cancelWhatsappCampaign(token, campaignId),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
                queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign", selectedCampaignId] }),
            ]);
        },
    });
    useEffect(() => {
        if (!selectedTemplateId)
            return;
        const template = templatesQuery.data?.find((item) => item.id === selectedTemplateId);
        if (!template)
            return;
        setMessageText(template.content);
        setCampaignName((current) => current || `${template.title} ${new Date().toLocaleDateString("pt-BR")}`);
    }, [selectedTemplateId, templatesQuery.data]);
    useEffect(() => {
        if (!canImport || attemptedAutoImport || importDefaultMutation.isPending) {
            return;
        }
        setAttemptedAutoImport(true);
        importDefaultMutation.mutate();
    }, [attemptedAutoImport, canImport, importDefaultMutation]);
    useEffect(() => {
        const timer = window.setInterval(() => {
            setNowMs(Date.now());
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);
    const loadedGroups = groupsQuery.data?.items ?? [];
    const filteredGroups = useMemo(() => {
        let result = loadedGroups;
        if (quickFilter === "SELECTED") {
            result = result.filter((group) => selectedGroupIds.includes(group.id));
        }
        else if (quickFilter === "ULTIMO_CONTATO") {
            result = result.filter((group) => group.lastContactAt !== null);
        }
        else if (quickFilter === "ATTENTION") {
            result = result.filter((group) => group.customerStatus === "ATTENTION");
        }
        else if (quickFilter === "INACTIVE") {
            result = result.filter((group) => group.customerStatus === "INACTIVE");
        }
        if (dispatchesFilter === "ZERO") {
            result = result.filter((group) => (group.sentCampaignsCount ?? 0) === 0);
        }
        else if (dispatchesFilter === "SOME") {
            result = result.filter((group) => (group.sentCampaignsCount ?? 0) >= 1);
        }
        else if (dispatchesFilter === "FEW") {
            result = result.filter((group) => (group.sentCampaignsCount ?? 0) >= 1 && (group.sentCampaignsCount ?? 0) <= 2);
        }
        else if (dispatchesFilter === "MANY") {
            result = result.filter((group) => (group.sentCampaignsCount ?? 0) >= 3);
        }
        if (quickFilter !== "BLOQUEADOS" && quickFilter !== "SELECTED") {
            if (recentBlockFilter === "AVAILABLE_ONLY") {
                return result.filter((group) => !group.isRecentlyBlocked);
            }
            else if (recentBlockFilter === "BLOCKED_ONLY") {
                return result.filter((group) => group.isRecentlyBlocked);
            }
        }
        return result;
    }, [loadedGroups, quickFilter, recentBlockFilter, selectedGroupIds, dispatchesFilter]);
    const selectedGroupCount = selectedGroupIds.length;
    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [quickFilter, recentBlockFilter, savedSegmentId, search, dispatchesFilter]);
    const itemsPerPage = 50;
    const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);
    const paginatedGroups = useMemo(() => {
        return filteredGroups.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    }, [filteredGroups, currentPage]);
    const allVisibleSelected = paginatedGroups.length > 0 && paginatedGroups.every((group) => selectedGroupIds.includes(group.id));
    const selectedSavedSegment = savedSegmentsQuery.data?.find((segment) => segment.id === savedSegmentId) ?? null;
    const selectedTemplate = templatesQuery.data?.find((template) => template.id === selectedTemplateId) ?? null;
    const importSummary = importDefaultMutation.data;
    const importError = importDefaultMutation.error;
    const isImporting = importDefaultMutation.isPending;
    const liveCampaign = activeCampaignQuery.data ?? selectedCampaignQuery.data ?? createCampaignMutation.data ?? null;
    const liveCampaignFirstFailure = liveCampaign?.recipients.find((recipient) => recipient.status === "FAILED") ?? null;
    const liveCampaignIsRunning = liveCampaign ? ["QUEUED", "IN_PROGRESS"].includes(liveCampaign.status) : false;
    const nextDispatchCountdown = liveCampaign ? formatCountdown(liveCampaign.progress.nextScheduledAt, nowMs) : null;
    const hiddenBlockedCount = useMemo(() => {
        if (recentBlockFilter !== "AVAILABLE_ONLY") {
            return 0;
        }
        return loadedGroups.filter((group) => group.isRecentlyBlocked).length;
    }, [loadedGroups, recentBlockFilter]);
    const liveRecipients = useMemo(() => {
        if (!liveCampaign?.recipients.length) {
            return [];
        }
        const statusOrder = {
            SENDING: 0,
            PENDING: 1,
            FAILED: 2,
            BLOCKED_RECENT: 3,
            SENT: 4,
            SKIPPED: 5,
        };
        return [...liveCampaign.recipients]
            .sort((left, right) => {
            const orderDiff = statusOrder[left.status] - statusOrder[right.status];
            if (orderDiff !== 0) {
                return orderDiff;
            }
            const leftTime = left.scheduledFor ? new Date(left.scheduledFor).getTime() : 0;
            const rightTime = right.scheduledFor ? new Date(right.scheduledFor).getTime() : 0;
            return leftTime - rightTime;
        })
            .slice(0, 8);
    }, [liveCampaign]);
    const hasMessage = Boolean(messageText.trim());
    const isReadyToDispatch = hasMessage && selectedGroupCount > 0;
    const dispatchButtonLabel = createCampaignMutation.isPending
        ? "Criando campanha..."
        : selectedGroupCount > 0
            ? `Disparar para ${formatNumber(selectedGroupCount)} grupos`
            : "Selecione grupos para disparar";
    const composeHelperText = !hasMessage
        ? "Escreva ou escolha a mensagem final para liberar o disparo."
        : selectedGroupCount === 0
            ? "Selecione os grupos abaixo para habilitar o disparo."
            : `Delay configurado entre ${minDelaySeconds}s e ${maxDelaySeconds}s por envio.`;
    function toggleGroupSelection(groupId) {
        setSelectedGroupIds((current) => current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId]);
    }
    function toggleVisibleSelection() {
        const visibleIds = paginatedGroups.map((group) => group.id);
        setSelectedGroupIds((current) => {
            if (allVisibleSelected) {
                return current.filter((groupId) => !visibleIds.includes(groupId));
            }
            return [...new Set([...current, ...visibleIds])];
        });
    }
    function handleApplyPastedCls() {
        const codes = pastedClsText
            .split(/[\s,;\n]+/)
            .map(c => c.trim().toUpperCase())
            .filter(c => c.startsWith("CL"));
        if (codes.length === 0) {
            alert("Nenhum código válido (iniciando com CL) foi inserido.");
            return;
        }
        const matchingGroups = loadedGroups.filter(g => g.customerCode && codes.includes(g.customerCode.trim().toUpperCase()));
        const matchingIds = matchingGroups.map(g => g.id);
        if (matchingIds.length > 0) {
            setSelectedGroupIds(current => [...new Set([...current, ...matchingIds])]);
            // Clear filters and redirect straight to SELECTED tab to show them
            setSearch("");
            setSavedSegmentId("");
            setQuickFilter("SELECTED");
            alert(`${matchingIds.length} grupos mapeados para os códigos CL foram selecionados e exibidos na aba 'Selecionados'!`);
        }
        else {
            alert("Nenhum grupo correspondente aos códigos CL inseridos foi encontrado no filtro atual. Dica: Use a opção 'Criar & Salvar Novo Público' para salvar e filtrar todos os códigos CL da sua base de dados.");
        }
    }
    function handleCreateSegmentFromPastedCls() {
        const codes = pastedClsText
            .split(/[\s,;\n]+/)
            .map(c => c.trim().toUpperCase())
            .filter(c => c.startsWith("CL"));
        if (codes.length === 0) {
            alert("Nenhum código válido (iniciando com CL) foi inserido.");
            return;
        }
        if (!newSegmentName.trim()) {
            alert("Por favor, digite um nome para o novo público salvo.");
            return;
        }
        createSavedSegmentMutation.mutate({
            name: newSegmentName.trim(),
            definition: {
                customerCodes: codes
            }
        });
    }
    function changeGroupSender(groupId, senderId) {
        setRecipientSenderMapping(current => ({
            ...current,
            [groupId]: senderId
        }));
    }
    function toggleSenderSelection(id) {
        setSelectedSenderIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("div", { className: "z-tabs", style: { marginBottom: "1.5rem" }, children: [_jsxs("button", { type: "button", className: `z-tab ${activeTab === "NEW_CAMPAIGN" ? "active" : ""}`, onClick: () => setActiveTab("NEW_CAMPAIGN"), children: [_jsx(Plus, { size: 16 }), "Nova Campanha"] }), _jsxs("button", { type: "button", className: `z-tab ${activeTab === "HISTORY" ? "active" : ""}`, onClick: () => setActiveTab("HISTORY"), children: [_jsx(Clock3, { size: 16 }), "Hist\u00F3rico de Campanhas"] })] }), activeTab === "NEW_CAMPAIGN" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "wp-stepper", children: [_jsxs("button", { type: "button", className: `wp-step ${currentStep === 1 ? "active" : ""} ${currentStep > 1 ? "completed" : ""}`, onClick: () => setCurrentStep(1), children: [_jsx("span", { className: "wp-step-num", children: currentStep > 1 ? _jsx(Check, { size: 14 }) : "1" }), _jsx("span", { children: "Cria\u00E7\u00E3o" })] }), _jsx("span", { className: "wp-step-arrow", children: _jsx(ChevronRight, { size: 14 }) }), _jsxs("button", { type: "button", className: `wp-step ${currentStep === 2 ? "active" : ""} ${currentStep > 2 ? "completed" : ""}`, onClick: () => setCurrentStep(2), children: [_jsx("span", { className: "wp-step-num", children: currentStep > 2 ? _jsx(Check, { size: 14 }) : "2" }), _jsx("span", { children: "Remetentes" })] }), _jsx("span", { className: "wp-step-arrow", children: _jsx(ChevronRight, { size: 14 }) }), _jsxs("button", { type: "button", className: `wp-step ${currentStep === 3 ? "active" : ""} ${currentStep > 3 ? "completed" : ""}`, onClick: () => setCurrentStep(3), children: [_jsx("span", { className: "wp-step-num", children: currentStep > 3 ? _jsx(Check, { size: 14 }) : "3" }), _jsx("span", { children: "Destinat\u00E1rios" })] }), _jsx("span", { className: "wp-step-arrow", children: _jsx(ChevronRight, { size: 14 }) }), _jsxs("button", { type: "button", className: `wp-step ${currentStep === 4 ? "active" : ""} ${currentStep > 4 ? "completed" : ""}`, onClick: () => setCurrentStep(4), children: [_jsx("span", { className: "wp-step-num", children: currentStep > 4 ? _jsx(Check, { size: 14 }) : "4" }), _jsx("span", { children: "Mensagem" })] }), _jsx("span", { className: "wp-step-arrow", children: _jsx(ChevronRight, { size: 14 }) }), _jsxs("button", { type: "button", className: `wp-step ${currentStep === 5 ? "active" : ""} ${currentStep > 5 ? "completed" : ""}`, onClick: () => setCurrentStep(5), children: [_jsx("span", { className: "wp-step-num", children: "5" }), _jsx("span", { children: "Revis\u00E3o" })] }), _jsx("div", { className: "wp-stepper-progress", style: { width: `${((currentStep - 1) / 4) * 100}%` } })] }), _jsx("div", { className: "wp-wizard-layout full-width", children: _jsxs("div", { className: "wp-wizard-main", children: [currentStep === 1 && (_jsxs("div", { className: "wp-card-step", children: [_jsx("div", { className: "wp-card-step-badge", children: "01" }), _jsx("div", { className: "wp-card-step-header", children: _jsx("h3", { className: "wp-card-step-title", children: "Cria\u00E7\u00E3o" }) }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "12px", marginTop: "0.5rem" }, children: [_jsxs("label", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "0.95rem", fontWeight: 700, color: "#18181b" }, children: [_jsx(PlusCircle, { size: 18, style: { color: "#10b981" } }), "Digite o t\u00EDtulo da sua campanha"] }), _jsx("div", { className: "wp-card-input-container", children: _jsx("input", { value: campaignName, onChange: (event) => setCampaignName(event.target.value), placeholder: "Digite o nome da campanha...", className: "wp-card-input" }) })] }), canImport && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "1rem", background: "#f8fafc", padding: "1.25rem", borderRadius: "12px", border: "1px solid #e2e8f0", marginTop: "0.5rem" }, children: [_jsx("h4", { style: { margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "Configura\u00E7\u00F5es Anti-Spam (Recomendado)" }), _jsxs("div", { className: "whatsapp-delay-grid", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }, children: [_jsxs("div", { className: "whatsapp-delay-field", style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [_jsx("span", { style: { fontSize: "0.8rem", fontWeight: 600, color: "#475569" }, children: "Delay m\u00EDnimo (segundos)" }), _jsx("input", { type: "number", min: 1, value: minDelaySeconds, onChange: (event) => setMinDelaySeconds(Number(event.target.value) || 1), className: "wp-card-input", style: { padding: "0.5rem 0.75rem", fontSize: "0.9rem" } })] }), _jsxs("div", { className: "whatsapp-delay-field", style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [_jsx("span", { style: { fontSize: "0.8rem", fontWeight: 600, color: "#475569" }, children: "Delay m\u00E1ximo (segundos)" }), _jsx("input", { type: "number", min: 1, value: maxDelaySeconds, onChange: (event) => setMaxDelaySeconds(Number(event.target.value) || 1), className: "wp-card-input", style: { padding: "0.5rem 0.75rem", fontSize: "0.9rem" } })] })] }), _jsx("div", { style: { borderTop: "1px solid #e2e8f0", paddingTop: "1rem", marginTop: "0.5rem" }, children: _jsxs("div", { style: {
                                                            display: "flex",
                                                            gap: "12px",
                                                            alignItems: "flex-start",
                                                            background: overrideRecentBlock ? "rgba(239, 68, 68, 0.03)" : "transparent",
                                                            border: overrideRecentBlock ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid transparent",
                                                            padding: overrideRecentBlock ? "0.75rem 1rem" : "0.5rem 0",
                                                            borderRadius: "10px",
                                                            transition: "all 0.2s ease"
                                                        }, children: [_jsx("input", { type: "checkbox", id: "overrideRecentBlock", checked: overrideRecentBlock, onChange: (event) => setOverrideRecentBlock(event.target.checked), style: {
                                                                    marginTop: "4px",
                                                                    width: "16px",
                                                                    height: "16px",
                                                                    accentColor: "#ef4444",
                                                                    cursor: "pointer"
                                                                } }), _jsxs("label", { htmlFor: "overrideRecentBlock", style: { display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer", flex: 1 }, children: [_jsx("span", { style: { fontSize: "0.85rem", fontWeight: 700, color: overrideRecentBlock ? "#ef4444" : "#334155", transition: "color 0.2s" }, children: "Ignorar o bloqueio de prote\u00E7\u00E3o anti-spam de 7 dias" }), _jsx("span", { style: { fontSize: "0.75rem", color: overrideRecentBlock ? "#991b1b" : "#64748b", lineHeight: "1.4" }, children: "Use com modera\u00E7\u00E3o. For\u00E7ar disparos recentes aumenta riscos de block." })] })] }) })] })), _jsxs("div", { className: "wp-card-nav-row", children: [_jsx("button", { type: "button", className: "wp-card-btn-back", onClick: () => setActiveTab("HISTORY"), children: "\u2039 Voltar ao Hist\u00F3rico" }), _jsx("button", { type: "button", className: "wp-card-btn-next", onClick: () => setCurrentStep(2), disabled: !campaignName.trim(), style: { opacity: campaignName.trim() ? 1 : 0.6 }, children: "Continuar" })] }), _jsxs("div", { className: "wp-card-step-footer", children: [_jsx("h4", { className: "wp-card-step-footer-title", children: "Crie sua campanha" }), _jsx("p", { className: "wp-card-step-footer-subtitle", children: "Defina seu p\u00FAblico, conte\u00FAdo e objetivos." })] })] })), currentStep === 2 && (_jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("h3", { children: "Selecionar Remetentes" }), _jsx("p", { className: "panel-subcopy", children: "Marque as conex\u00F5es de WhatsApp reais que ser\u00E3o usadas para realizar os disparos desta campanha." })] }) }), whatsappInstancesQuery.isLoading ? (_jsx("div", { className: "page-loading", children: "Buscando conex\u00F5es de WhatsApp ativas..." })) : senders.length === 0 || (senders.length === 1 && senders[0]?.id === "default") ? (_jsx("div", { className: "empty-panel", style: { padding: "3rem 1rem" }, children: _jsx("div", { className: "empty-state", children: "Nenhuma linha de WhatsApp conectada encontrada no seu painel. Conecte uma linha na tela de Configura\u00E7\u00E3o de Usu\u00E1rios/WhatsApp para disparar!" }) })) : (_jsx("div", { className: "wp-senders-grid", style: { marginTop: "1.5rem" }, children: senders.map((sender) => (_jsxs("div", { className: `wp-sender-card ${selectedSenderIds.includes(sender.id) ? "selected" : ""}`, onClick: () => {
                                                    if (sender.status !== "ACTIVE")
                                                        return; // Only allow selecting active lines
                                                    toggleSenderSelection(sender.id);
                                                }, style: { opacity: sender.status === "ACTIVE" ? 1 : 0.6, cursor: sender.status === "ACTIVE" ? "pointer" : "not-allowed" }, children: [_jsx("img", { src: sender.avatarUrl, alt: sender.name, className: "wp-sender-avatar" }), _jsxs("div", { className: "wp-sender-info", children: [_jsx("h4", { className: "wp-sender-name", children: sender.name }), _jsxs("div", { style: { display: "flex", gap: "6px", alignItems: "center", marginTop: "2px" }, children: [_jsx("span", { className: "wp-sender-role", children: sender.role }), _jsx("span", { className: `status-badge ${sender.status === "ACTIVE" ? "status-success" : "status-danger"}`, style: { fontSize: "0.65rem", padding: "1px 6px" }, children: sender.status === "ACTIVE" ? "Ativo" : sender.status === "PAUSED" ? "Pausado" : "Inativo" })] }), _jsx("p", { className: "wp-profile-phone", style: { margin: "4px 0 0 0" }, children: sender.phone })] }), selectedSenderIds.includes(sender.id) && (_jsx("span", { className: "wp-sender-checked", children: _jsx(Check, { size: 12 }) }))] }, sender.id))) }))] })), currentStep === 3 && (_jsxs("article", { className: "panel", children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--line)", paddingBottom: "1rem", marginBottom: "1rem" }, children: [_jsxs("div", { children: [_jsxs("h3", { style: { display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "1.15rem", fontWeight: 700 }, children: [_jsx(Users, { size: 18, style: { color: "#10b981" } }), "Grupos para disparo"] }), _jsx("p", { className: "panel-subcopy", style: { margin: "2px 0 0 0" }, children: "Filtre e marque os grupos que v\u00E3o receber." })] }), _jsxs("div", { style: { display: "flex", gap: "10px" }, children: [_jsxs("div", { style: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.5rem 1rem", textAlign: "center", minWidth: "90px" }, children: [_jsx("span", { style: { display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }, children: "Mostrados" }), _jsx("strong", { style: { fontSize: "1.1rem", color: "#1e293b" }, children: formatNumber(filteredGroups.length) })] }), _jsxs("div", { style: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "0.5rem 1rem", textAlign: "center", minWidth: "90px" }, children: [_jsx("span", { style: { display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#1e40af", textTransform: "uppercase" }, children: "Selecionados" }), _jsx("strong", { style: { fontSize: "1.1rem", color: "#1e40af" }, children: formatNumber(selectedGroupCount) })] })] })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "1.25rem", margin: "1.25rem 0" }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [_jsx("span", { style: { fontSize: "0.85rem", fontWeight: 700, color: "#334155" }, children: "P\u00FAblico salvo" }), _jsxs("select", { value: savedSegmentId, onChange: (event) => {
                                                                setSavedSegmentId(event.target.value);
                                                                if (quickFilter === "SELECTED") {
                                                                    setQuickFilter("ALL");
                                                                }
                                                            }, className: "wp-card-input", style: { padding: "0.625rem 0.75rem", fontSize: "0.9rem", background: "#fff" }, children: [_jsx("option", { value: "", children: "Todos os grupos" }), (savedSegmentsQuery.data ?? []).map((segment) => (_jsx("option", { value: segment.id, children: segment.name }, segment.id)))] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [_jsx("span", { style: { fontSize: "0.85rem", fontWeight: 700, color: "#334155" }, children: "Buscar" }), _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Nome do grupo, cliente ou c\u00F3digo", className: "wp-card-input", style: { padding: "0.625rem 0.75rem", fontSize: "0.9rem" } })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [_jsx("span", { style: { fontSize: "0.85rem", fontWeight: 700, color: "#334155" }, children: "Bloqueio" }), _jsxs("div", { className: "z-tabs", style: { margin: 0, borderBottom: "none", background: "#f1f5f9", padding: "0.25rem", borderRadius: "8px", display: "flex", gap: "4px" }, children: [_jsx("button", { type: "button", className: `z-tab ${recentBlockFilter === "AVAILABLE_ONLY" ? "active" : ""}`, onClick: () => setRecentBlockFilter("AVAILABLE_ONLY"), style: { flex: 1, padding: "0.4rem", fontSize: "0.82rem", borderRadius: "6px", borderBottom: "none", justifyContent: "center", background: recentBlockFilter === "AVAILABLE_ONLY" ? "#fff" : "transparent" }, children: "Dispon\u00EDveis" }), _jsx("button", { type: "button", className: `z-tab ${recentBlockFilter === "ALL" ? "active" : ""}`, onClick: () => setRecentBlockFilter("ALL"), style: { flex: 1, padding: "0.4rem", fontSize: "0.82rem", borderRadius: "6px", borderBottom: "none", justifyContent: "center", background: recentBlockFilter === "ALL" ? "#fff" : "transparent" }, children: "Todos" }), _jsx("button", { type: "button", className: `z-tab ${recentBlockFilter === "BLOCKED_ONLY" ? "active" : ""}`, onClick: () => setRecentBlockFilter("BLOCKED_ONLY"), style: { flex: 1, padding: "0.4rem", fontSize: "0.82rem", borderRadius: "6px", borderBottom: "none", justifyContent: "center", background: recentBlockFilter === "BLOCKED_ONLY" ? "#fff" : "transparent" }, children: "Bloqueados" })] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [_jsx("span", { style: { fontSize: "0.85rem", fontWeight: 700, color: "#334155" }, children: "Qtd. Disparos" }), _jsxs("select", { value: dispatchesFilter, onChange: (e) => setDispatchesFilter(e.target.value), className: "wp-card-input", style: { padding: "0.625rem 0.75rem", fontSize: "0.9rem", background: "#fff", cursor: "pointer" }, children: [_jsx("option", { value: "ALL", children: "Qualquer quantidade" }), _jsx("option", { value: "ZERO", children: "Sem disparos (Novo)" }), _jsx("option", { value: "SOME", children: "Com disparos (1 ou mais)" }), _jsx("option", { value: "FEW", children: "Poucos disparos (1 a 2)" }), _jsx("option", { value: "MANY", children: "Muitos disparos (3 ou mais)" })] })] })] }), _jsx("div", { className: "z-tabs", style: { marginBottom: "1rem", display: "flex", gap: "10px", flexWrap: "wrap" }, children: quickFilters.map((filter) => {
                                                const count = quickFilterCount(filter.value, mappingSummaryQuery.data, loadedGroups, selectedGroupIds.length);
                                                const isActive = quickFilter === filter.value;
                                                return (_jsxs("button", { type: "button", className: `z-tab ${isActive ? "active" : ""}`, onClick: () => setQuickFilter(filter.value), style: {
                                                        padding: "0.6rem 1rem",
                                                        fontSize: "0.85rem",
                                                        fontWeight: isActive ? 700 : 500,
                                                        borderRadius: "8px",
                                                        backgroundColor: isActive ? "#eff6ff" : "transparent",
                                                        borderBottom: isActive ? "2px solid #3b82f6" : "2px solid transparent",
                                                        color: isActive ? "#1e40af" : "#64748b"
                                                    }, children: [filter.label, _jsx("span", { style: { fontSize: "0.72rem", background: isActive ? "#bfdbfe" : "#f1f5f9", padding: "2px 6px", borderRadius: "999px", marginLeft: "6px", color: isActive ? "#1e40af" : "#64748b" }, children: count })] }, filter.value));
                                            }) }), _jsxs("div", { style: { display: "flex", gap: "10px", alignItems: "center", margin: "1.25rem 0", flexWrap: "wrap" }, children: [_jsxs("button", { type: "button", onClick: toggleVisibleSelection, style: {
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "8px",
                                                        border: "1px solid #e4e4e7",
                                                        borderRadius: "8px",
                                                        padding: "0.625rem 1.25rem",
                                                        fontSize: "0.85rem",
                                                        fontWeight: 600,
                                                        backgroundColor: "#ffffff",
                                                        color: "#3f3f46",
                                                        cursor: "pointer",
                                                        transition: "all 0.2s ease",
                                                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
                                                    }, onMouseEnter: (e) => {
                                                        e.currentTarget.style.backgroundColor = "#f4f4f5";
                                                        e.currentTarget.style.borderColor = "#d4d4d8";
                                                    }, onMouseLeave: (e) => {
                                                        e.currentTarget.style.backgroundColor = "#ffffff";
                                                        e.currentTarget.style.borderColor = "#e4e4e7";
                                                    }, children: [_jsx(CheckCircle2, { size: 16, style: { color: "#10b981" } }), "Selecionar vis\u00EDveis"] }), _jsxs("button", { type: "button", onClick: () => {
                                                        setSelectedGroupIds([]);
                                                        if (quickFilter === "SELECTED") {
                                                            setQuickFilter("ALL");
                                                        }
                                                    }, disabled: selectedGroupCount === 0, style: {
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "8px",
                                                        border: "1px solid #e4e4e7",
                                                        borderRadius: "8px",
                                                        padding: "0.625rem 1.25rem",
                                                        fontSize: "0.85rem",
                                                        fontWeight: 600,
                                                        backgroundColor: "#ffffff",
                                                        color: selectedGroupCount === 0 ? "#a1a1aa" : "#ef4444",
                                                        cursor: selectedGroupCount === 0 ? "not-allowed" : "pointer",
                                                        opacity: selectedGroupCount === 0 ? 0.6 : 1,
                                                        transition: "all 0.2s ease",
                                                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
                                                    }, onMouseEnter: (e) => {
                                                        if (selectedGroupCount > 0) {
                                                            e.currentTarget.style.backgroundColor = "#fef2f2";
                                                            e.currentTarget.style.borderColor = "#fca5a5";
                                                        }
                                                    }, onMouseLeave: (e) => {
                                                        e.currentTarget.style.backgroundColor = "#ffffff";
                                                        e.currentTarget.style.borderColor = "#e4e4e7";
                                                    }, children: [_jsx(Trash2, { size: 16 }), "Limpar sele\u00E7\u00E3o"] }), _jsxs("button", { type: "button", onClick: () => setShowClPasteArea(!showClPasteArea), style: {
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "8px",
                                                        border: "1px solid",
                                                        borderColor: showClPasteArea ? "#18181b" : "#e4e4e7",
                                                        borderRadius: "8px",
                                                        padding: "0.625rem 1.25rem",
                                                        fontSize: "0.85rem",
                                                        fontWeight: 600,
                                                        backgroundColor: showClPasteArea ? "#18181b" : "#ffffff",
                                                        color: showClPasteArea ? "#ffffff" : "#18181b",
                                                        cursor: "pointer",
                                                        transition: "all 0.2s ease",
                                                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
                                                    }, onMouseEnter: (e) => {
                                                        if (!showClPasteArea) {
                                                            e.currentTarget.style.backgroundColor = "#f4f4f5";
                                                            e.currentTarget.style.borderColor = "#d4d4d8";
                                                        }
                                                        else {
                                                            e.currentTarget.style.backgroundColor = "#27272a";
                                                        }
                                                    }, onMouseLeave: (e) => {
                                                        if (!showClPasteArea) {
                                                            e.currentTarget.style.backgroundColor = "#ffffff";
                                                            e.currentTarget.style.borderColor = "#e4e4e7";
                                                        }
                                                        else {
                                                            e.currentTarget.style.backgroundColor = "#18181b";
                                                        }
                                                    }, children: [_jsx(ClipboardList, { size: 16, style: { color: showClPasteArea ? "#ffffff" : "#3b82f6" } }), showClPasteArea ? "✕ Fechar Importador CL" : "Importador de CLs"] })] }), showClPasteArea && (_jsxs("div", { style: {
                                                background: "#ffffff",
                                                border: "1px solid #e4e4e7",
                                                borderRadius: "16px",
                                                padding: "1.5rem",
                                                margin: "1.25rem 0",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "1.25rem",
                                                boxShadow: "0 4px 12px rgba(0,0,0,0.03)"
                                            }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [_jsx(ClipboardList, { size: 20, style: { color: "#3b82f6" } }), _jsx("h4", { style: { margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#18181b" }, children: "Importar Destinat\u00E1rios via C\u00F3digos CL" })] }), _jsxs("p", { style: { margin: 0, fontSize: "0.82rem", color: "#71717a", lineHeight: "1.5" }, children: ["Cole os c\u00F3digos de clientes (ex: ", _jsx("code", { style: { background: "#f4f4f5", padding: "2px 6px", borderRadius: "4px", color: "#0f766e" }, children: "CL1002, CL1003, CL1004" }), ") abaixo. Voc\u00EA pode selecionar os grupos na tabela atual ou ", _jsx("strong", { children: "criar e salvar esse grupo de clientes" }), " no banco de dados."] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [_jsx("span", { style: { fontSize: "0.8rem", fontWeight: 700, color: "#475569" }, children: "Nome do P\u00FAblico Salvo (Opcional - Necess\u00E1rio para Salvar)" }), _jsx("input", { value: newSegmentName, onChange: (e) => setNewSegmentName(e.target.value), placeholder: "Ex: Clientes VIP Regi\u00E3o Sul, Campanha de Inverno...", className: "wp-card-input", style: { padding: "0.625rem 0.75rem", fontSize: "0.9rem" } })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [_jsx("span", { style: { fontSize: "0.8rem", fontWeight: 700, color: "#475569" }, children: "C\u00F3digos dos Clientes" }), _jsx("textarea", { rows: 4, value: pastedClsText, onChange: (e) => setPastedClsText(e.target.value), placeholder: "CL1002, CL1003, CL1004...", className: "wp-card-input", style: { fontFamily: "monospace", fontSize: "0.85rem", background: "#fff", resize: "vertical" } })] }), _jsxs("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "0.25rem" }, children: [_jsxs("button", { type: "button", onClick: handleApplyPastedCls, style: {
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: "6px",
                                                                backgroundColor: "#3b82f6",
                                                                color: "#ffffff",
                                                                border: "none",
                                                                borderRadius: "8px",
                                                                padding: "0.625rem 1.25rem",
                                                                fontSize: "0.85rem",
                                                                fontWeight: 600,
                                                                cursor: "pointer",
                                                                transition: "background 0.2s"
                                                            }, onMouseEnter: (e) => e.currentTarget.style.backgroundColor = "#2563eb", onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "#3b82f6", children: [_jsx(CheckCircle2, { size: 16 }), "Selecionar na Tabela"] }), _jsx("button", { type: "button", onClick: handleCreateSegmentFromPastedCls, disabled: createSavedSegmentMutation.isPending || !newSegmentName.trim() || !pastedClsText.trim(), style: {
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: "6px",
                                                                backgroundColor: "#10b981",
                                                                color: "#ffffff",
                                                                border: "none",
                                                                borderRadius: "8px",
                                                                padding: "0.625rem 1.25rem",
                                                                fontSize: "0.85rem",
                                                                fontWeight: 600,
                                                                cursor: (createSavedSegmentMutation.isPending || !newSegmentName.trim() || !pastedClsText.trim()) ? "not-allowed" : "pointer",
                                                                opacity: (createSavedSegmentMutation.isPending || !newSegmentName.trim() || !pastedClsText.trim()) ? 0.6 : 1,
                                                                transition: "background 0.2s"
                                                            }, onMouseEnter: (e) => {
                                                                if (!createSavedSegmentMutation.isPending && newSegmentName.trim() && pastedClsText.trim()) {
                                                                    e.currentTarget.style.backgroundColor = "#059669";
                                                                }
                                                            }, onMouseLeave: (e) => {
                                                                if (!createSavedSegmentMutation.isPending && newSegmentName.trim() && pastedClsText.trim()) {
                                                                    e.currentTarget.style.backgroundColor = "#10b981";
                                                                }
                                                            }, children: createSavedSegmentMutation.isPending ? (_jsxs(_Fragment, { children: [_jsx(LoaderCircle, { size: 16, className: "animate-spin" }), "Salvando p\u00FAblico..."] })) : (_jsxs(_Fragment, { children: [_jsx(Save, { size: 16 }), "Criar & Salvar Novo P\u00FAblico"] })) })] })] })), groupsQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando grupos destinat\u00E1rios..." }) : null, groupsQuery.data?.items.length ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "table-scroll", style: { overflowX: "auto", border: "1px solid #e4e4e7", borderRadius: "12px", background: "#fff", marginTop: "1rem" }, children: _jsxs("table", { className: "z-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { width: "50px", padding: "1rem 1.5rem" }, children: _jsx("input", { type: "checkbox", checked: allVisibleSelected, onChange: toggleVisibleSelection }) }), _jsx("th", { style: { padding: "1rem 1.5rem" }, children: "REMETENTE (WHATSAPP CANAL)" }), _jsx("th", { style: { padding: "1rem 0.5rem", width: "40px", textAlign: "center" } }), _jsx("th", { style: { padding: "1rem 1.5rem" }, children: "DESTINAT\u00C1RIO (WHATSAPP & CRM)" }), _jsx("th", { style: { padding: "1rem 1.5rem" }, children: "TIPO & CLASSIFICA\u00C7\u00C3O" }), _jsx("th", { style: { padding: "1rem 1.5rem" }, children: "DISPAROS" }), _jsx("th", { style: { padding: "1rem 1.5rem" }, children: "STATUS (SPAM RISK)" })] }) }), _jsx("tbody", { children: paginatedGroups.map((group) => {
                                                                    const isSelected = selectedGroupIds.includes(group.id);
                                                                    // Risk configuration
                                                                    let riskClass = "low";
                                                                    let riskLabel = "Baixo risco";
                                                                    let riskTooltip = "Recomendada: essa interação não oferece riscos de bloqueio.";
                                                                    if (group.isRecentlyBlocked) {
                                                                        riskClass = "critical";
                                                                        riskLabel = "Crítico";
                                                                        riskTooltip = "Alerta: número foi bloqueado ou marcado recentemente. Risco altíssimo de bloqueio total!";
                                                                    }
                                                                    else if (group.lastContactAt) {
                                                                        const diffDays = (nowMs - new Date(group.lastContactAt).getTime()) / (1000 * 60 * 60 * 24);
                                                                        if (diffDays <= 7) {
                                                                            riskClass = "attention";
                                                                            riskLabel = "Atenção";
                                                                            riskTooltip = "Cuidado: interação feita nos últimos 7 dias. Disparos frequentes podem incomodar o cliente.";
                                                                        }
                                                                    }
                                                                    const mappedSenderId = recipientSenderMapping[group.id] || "default";
                                                                    const activeSender = senders.find(s => s.id === mappedSenderId) || senders[0] || {
                                                                        id: "default",
                                                                        name: "Instância Padrão",
                                                                        role: "WhatsApp",
                                                                        avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
                                                                        phone: ""
                                                                    };
                                                                    return (_jsxs("tr", { style: {
                                                                            borderBottom: "1px solid #e4e4e7",
                                                                            backgroundColor: isSelected ? "rgba(59, 130, 246, 0.01)" : "transparent"
                                                                        }, children: [_jsx("td", { style: { padding: "1.25rem 1.5rem" }, children: _jsx("input", { type: "checkbox", checked: isSelected, onChange: () => toggleGroupSelection(group.id) }) }), _jsx("td", { style: { padding: "1.25rem 1.5rem" }, children: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "10px" }, children: [_jsx("img", { src: activeSender.avatarUrl, alt: activeSender.name, style: { width: "36px", height: "36px", borderRadius: "50%", border: "1px solid rgba(0,0,0,0.06)", objectFit: "cover" } }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "2px" }, children: [_jsx("span", { style: { fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }, children: activeSender.name }), _jsxs("span", { style: { fontSize: "0.7rem", color: "#64748b", fontWeight: 500 }, children: [activeSender.role, " ", activeSender.phone && `• ${activeSender.phone}`] }), _jsx("select", { value: mappedSenderId, onChange: (e) => changeGroupSender(group.id, e.target.value), className: "ghost-button", style: { padding: "2px 6px", fontSize: "0.75rem", border: "1px solid var(--line)", marginTop: "4px", background: "#fff", cursor: "pointer", borderRadius: "6px", width: "fit-content" }, children: senders.filter(s => selectedSenderIds.includes(s.id)).map(s => (_jsxs("option", { value: s.id, children: ["Mapear para ", s.name] }, s.id))) })] })] }) }), _jsx("td", { style: { padding: "1.25rem 0.5rem", textAlign: "center" }, children: _jsx(ArrowRight, { size: 16, style: { color: "#10b981" } }) }), _jsx("td", { style: { padding: "1.25rem 1.5rem" }, children: _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "10px" }, children: [_jsx("div", { style: {
                                                                                                width: "36px",
                                                                                                height: "36px",
                                                                                                borderRadius: "50%",
                                                                                                background: "linear-gradient(135deg, #10b981, #059669)",
                                                                                                color: "#fff",
                                                                                                display: "grid",
                                                                                                placeItems: "center",
                                                                                                fontWeight: "bold",
                                                                                                fontSize: "0.85rem"
                                                                                            }, children: String(group.customerDisplayName || group.sourceName || "G").charAt(0).toUpperCase() }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "2px" }, children: [_jsx("strong", { style: { fontSize: "0.9rem", color: "#18181b", fontWeight: 700 }, children: group.sourceName }), _jsx("span", { style: { fontSize: "0.75rem", color: "#71717a", fontFamily: "monospace" }, children: group.jid }), _jsxs("div", { style: { display: "flex", gap: "6px", alignItems: "center", marginTop: "2px" }, children: [_jsxs("span", { style: { fontSize: "0.78rem", color: "#475569", fontWeight: 600 }, children: ["\uD83D\uDC64 ", group.customerDisplayName || "Sem cliente mapeado"] }), group.customerCode && (_jsx("span", { style: { fontSize: "0.72rem", background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", color: "#475569", fontWeight: 700 }, children: group.customerCode }))] })] })] }) }), _jsx("td", { style: { padding: "1.25rem 1.5rem" }, children: _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "4px" }, children: [_jsxs("div", { style: { display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }, children: [_jsx("span", { className: "status-badge", style: { fontSize: "0.72rem", background: "#f1f5f9", color: "#334155", fontWeight: 600, padding: "1px 6px", borderRadius: "4px" }, children: classificationLabel(group.classification) }), _jsx("span", { className: "status-badge", style: { fontSize: "0.72rem", background: "#eff6ff", color: "#1e40af", fontWeight: 600, padding: "1px 6px", borderRadius: "4px" }, children: mappingStatusLabel(group.mappingStatus) })] }), _jsxs("span", { style: { fontSize: "0.75rem", color: "#64748b" }, children: ["\u00DAltimo contato: ", _jsx("strong", { children: group.lastContactAt ? formatDateTime(group.lastContactAt) : "Sem registro" })] })] }) }), _jsx("td", { style: { padding: "1.25rem 1.5rem" }, children: _jsxs("span", { style: { fontSize: "0.82rem", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: "6px", color: "#166534", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }, children: ["\uD83D\uDE80 ", group.sentCampaignsCount ?? 0, " ", group.sentCampaignsCount === 1 ? 'disparo' : 'disparos'] }) }), _jsxs("td", { style: { padding: "1.25rem 1.5rem", position: "relative" }, children: [_jsx("span", { className: `wp-risk-badge ${riskClass}`, style: { cursor: "help", display: "inline-block" }, onMouseEnter: (e) => {
                                                                                            setHoveredGroupId(group.id);
                                                                                            setTooltipPosition({ x: e.clientX - 100, y: e.clientY - 65 });
                                                                                        }, onMouseLeave: () => setHoveredGroupId(null), children: riskLabel }), hoveredGroupId === group.id && (_jsx("div", { className: "wp-tooltip-box", style: {
                                                                                            position: "fixed",
                                                                                            left: `${tooltipPosition.x}px`,
                                                                                            top: `${tooltipPosition.y}px`,
                                                                                            zIndex: 1000
                                                                                        }, children: riskTooltip }))] })] }, group.id));
                                                                }) })] }) }), _jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", background: "#f8fafc", padding: "0.75rem 1.25rem", borderRadius: "12px", border: "1px solid #e4e4e7" }, children: [_jsxs("span", { style: { fontSize: "0.82rem", color: "#64748b", fontWeight: 500 }, children: ["Mostrando ", _jsxs("strong", { children: [filteredGroups.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1, "-", Math.min(filteredGroups.length, currentPage * itemsPerPage)] }), " de ", _jsx("strong", { children: formatNumber(filteredGroups.length) }), " destinat\u00E1rios"] }), totalPages > 1 && (_jsxs("div", { style: { display: "flex", gap: "8px", alignItems: "center" }, children: [_jsxs("button", { type: "button", onClick: () => setCurrentPage(prev => Math.max(1, prev - 1)), disabled: currentPage === 1, style: {
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        gap: "4px",
                                                                        padding: "0.4rem 0.8rem",
                                                                        fontSize: "0.82rem",
                                                                        fontWeight: 600,
                                                                        borderRadius: "6px",
                                                                        border: "1px solid #e4e4e7",
                                                                        backgroundColor: "#ffffff",
                                                                        color: currentPage === 1 ? "#a1a1aa" : "#3f3f46",
                                                                        cursor: currentPage === 1 ? "not-allowed" : "pointer",
                                                                        transition: "all 0.2s"
                                                                    }, children: [_jsx(ChevronLeft, { size: 16 }), "Anterior"] }), _jsxs("span", { style: { fontSize: "0.82rem", color: "#475569", fontWeight: 600, padding: "0 0.5rem" }, children: ["P\u00E1gina ", currentPage, " de ", totalPages] }), _jsxs("button", { type: "button", onClick: () => setCurrentPage(prev => Math.min(totalPages, prev + 1)), disabled: currentPage === totalPages, style: {
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        gap: "4px",
                                                                        padding: "0.4rem 0.8rem",
                                                                        fontSize: "0.82rem",
                                                                        fontWeight: 600,
                                                                        borderRadius: "6px",
                                                                        border: "1px solid #e4e4e7",
                                                                        backgroundColor: "#ffffff",
                                                                        color: currentPage === totalPages ? "#a1a1aa" : "#3f3f46",
                                                                        cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                                                                        transition: "all 0.2s"
                                                                    }, children: ["Pr\u00F3ximo", _jsx(ChevronRight, { size: 16 })] })] }))] })] })) : (_jsx("div", { className: "empty-panel", style: { padding: "3rem 1rem" }, children: _jsx("div", { className: "empty-state", children: "Nenhum destinat\u00E1rio encontrado com os filtros atuais." }) }))] })), currentStep === 4 && (_jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("h3", { children: "Conte\u00FAdo do Envio" }), _jsx("p", { className: "panel-subcopy", children: "Escolha ou crie a mensagem e confira o visual no simulador do smartphone." })] }) }), _jsxs("div", { className: "whatsapp-compose-editor-grid", style: { display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem" }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "1rem" }, children: [_jsxs("label", { children: ["Template de mensagem", _jsxs("select", { value: selectedTemplateId, onChange: (event) => setSelectedTemplateId(event.target.value), className: "wp-search-input", style: { paddingLeft: "12px", background: "#fff" }, children: [_jsx("option", { value: "", children: "Mensagem livre" }), (templatesQuery.data ?? []).map((template) => (_jsx("option", { value: template.id, children: template.title }, template.id)))] })] }), _jsxs("label", { className: "whatsapp-message-field", children: [_jsx("span", { children: "Texto da Mensagem (Vers\u00E3o A)" }), _jsx("textarea", { rows: 8, value: messageText, onChange: (event) => setMessageText(event.target.value), placeholder: "Digite a mensagem principal que ser\u00E1 enviada aos clientes..." })] }), abTestActive ? (_jsxs("div", { className: "wp-ab-split", children: [_jsxs("div", { className: "wp-ab-split-header", children: [_jsxs("span", { style: { fontWeight: 600, color: "#10b981", display: "flex", alignItems: "center", gap: "4px" }, children: [_jsx(Sparkles, { size: 14 }), "Mensagem Alternativa (Vers\u00E3o B)"] }), _jsx("button", { type: "button", className: "ghost-button danger", style: { padding: "4px 8px", fontSize: "0.75rem" }, onClick: () => setAbTestActive(false), children: "Remover B" })] }), _jsx("label", { className: "whatsapp-message-field", style: { marginTop: "0.5rem" }, children: _jsx("textarea", { rows: 6, value: abMessageText, onChange: (e) => setAbMessageText(e.target.value), placeholder: "Digite a varia\u00E7\u00E3o de texto para o teste A/B..." }) })] })) : null] }), _jsxs("div", { children: [_jsx("div", { className: "wp-preview-device", children: _jsxs("div", { className: "wp-preview-screen", children: [_jsxs("div", { className: "wp-preview-top-bar", children: [_jsx(Smartphone, { size: 14 }), _jsx("span", { children: "Previa do Envio" })] }), _jsxs("div", { className: "wp-preview-chat-area", children: [_jsxs("div", { className: "wp-preview-bubble", children: [messageText || "Escreva a mensagem na esquerda para visualizar a prévia aqui...", _jsx("div", { className: "wp-preview-bubble-meta", children: "Apenas agora" })] }), abTestActive && abMessageText && (_jsxs("div", { className: "wp-preview-bubble ab-split", children: [abMessageText, _jsx("div", { className: "wp-preview-bubble-meta", children: "Split A/B" })] }))] })] }) }), _jsx("p", { className: "panel-subcopy", style: { textAlign: "center", marginTop: "8px" }, children: "Simulador em tempo real de como a mensagem aparecer\u00E1 para o usu\u00E1rio final." })] })] })] })), currentStep === 5 && (_jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("h3", { children: "Revis\u00E3o da Campanha" }), _jsx("p", { className: "panel-subcopy", children: "Tudo pronto! Verifique se as informa\u00E7\u00F5es est\u00E3o corretas antes de lan\u00E7ar." })] }) }), _jsxs("div", { className: "whatsapp-compose-summary", style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", marginTop: "1rem" }, children: [_jsxs("div", { style: { background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }, children: [_jsx("span", { style: { display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }, children: "Campanha" }), _jsx("strong", { style: { fontSize: "1.05rem", color: "#0f172a" }, children: campaignName || "Disparo Geral" })] }), _jsxs("div", { style: { background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }, children: [_jsx("span", { style: { display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }, children: "Destinat\u00E1rios" }), _jsxs("strong", { style: { fontSize: "1.05rem", color: "#0f172a" }, children: [formatNumber(selectedGroupCount), " grupos mapeados"] }), selectedSavedSegment && (_jsxs("span", { style: { display: "block", fontSize: "0.75rem", color: "var(--muted)", marginTop: "2px" }, children: ["Segmento: ", selectedSavedSegment.name] }))] }), _jsxs("div", { style: { background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }, children: [_jsx("span", { style: { display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }, children: "Mensagem Ativa" }), _jsx("strong", { style: { fontSize: "1.05rem", color: "#0f172a" }, children: abTestActive ? "Teste A/B (2 variações)" : "Variação única" })] }), _jsxs("div", { style: { background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }, children: [_jsx("span", { style: { display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }, children: "Anti-spam Cadence" }), _jsxs("strong", { style: { fontSize: "1.05rem", color: "#0f172a" }, children: [minDelaySeconds, "s a ", maxDelaySeconds, "s"] }), _jsx("span", { style: { display: "block", fontSize: "0.75rem", color: overrideRecentBlock ? "var(--danger)" : "var(--success)", fontWeight: 600, marginTop: "2px" }, children: overrideRecentBlock ? "⚠ Proteção 7-dias inativa" : "✓ Proteção 7-dias ativa" })] })] }), _jsxs("div", { style: { marginTop: "1.5rem" }, children: [_jsx("h4", { style: { margin: "0 0 8px 0", fontSize: "0.9rem", fontWeight: 700 }, children: "Canais de Disparo Selecionados (Remetentes Reais)" }), _jsx("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: senders.filter(s => selectedSenderIds.includes(s.id)).map(s => (_jsxs("div", { className: "wp-review-sender-pill", style: { display: "flex", alignItems: "center", gap: "8px", background: "var(--bg-soft)", padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--line)" }, children: [_jsx("img", { src: s.avatarUrl, alt: s.name, className: "wp-avatar-sm", style: { width: "20px", height: "20px", borderRadius: "50%" } }), _jsxs("span", { style: { fontSize: "0.85rem", fontWeight: 600 }, children: [s.name, " (", s.phone, ")"] }), _jsx("span", { className: "status-badge status-success", style: { fontSize: "0.6rem", padding: "0 4px" }, children: "Ativo" })] }, s.id))) })] }), _jsxs("div", { style: { marginTop: "1.5rem" }, children: [_jsx("h4", { style: { margin: "0 0 8px 0", fontSize: "0.9rem", fontWeight: 700 }, children: "Conte\u00FAdo das Mensagens" }), _jsxs("div", { style: { background: "#f8fafc", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.75rem", fontWeight: 600, color: "var(--accent)" }, children: [_jsx("span", { children: "VERS\u00C3O A (PRINCIPAL)" }), _jsxs("span", { children: [messageText.length, " caracteres"] })] }), _jsx("div", { style: { whiteSpace: "pre-wrap", fontSize: "0.88rem", background: "#fff", border: "1px solid rgba(0,0,0,0.05)", padding: "10px 14px", borderRadius: "8px", color: "var(--text)" }, children: messageText || "Nenhuma mensagem definida." }), abTestActive && (_jsxs("div", { style: { marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed var(--line)" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.75rem", fontWeight: 600, color: "#10b981" }, children: [_jsx("span", { children: "VERS\u00C3O B (A/B SPLIT)" }), _jsxs("span", { children: [abMessageText.length, " caracteres"] })] }), _jsx("div", { style: { whiteSpace: "pre-wrap", fontSize: "0.88rem", background: "#fff", border: "1px solid rgba(0,0,0,0.05)", padding: "10px 14px", borderRadius: "8px", color: "var(--text)" }, children: abMessageText || "Nenhuma variação definida." })] }))] })] }), _jsxs("div", { style: { marginTop: "1.5rem", background: "rgba(16, 185, 129, 0.03)", padding: "1.25rem 1.5rem", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.15)" }, children: [_jsxs("h4", { style: { margin: "0 0 8px 0", color: "#059669", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }, children: [_jsx(ShieldAlert, { size: 16 }), "Verifica\u00E7\u00F5es de Seguran\u00E7a do Disparador"] }), _jsxs("ul", { style: { margin: 0, paddingLeft: "20px", display: "grid", gap: "4px", fontSize: "0.82rem", color: "var(--muted)" }, children: [_jsx("li", { children: "Cad\u00EAncia de delay configurada de forma natural para imitar o comportamento de digita\u00E7\u00E3o de agentes." }), _jsx("li", { children: "Contatos sob alto risco de prote\u00E7\u00E3o bloqueados ou sinalizados para evitar bloqueios da conta da empresa." }), _jsx("li", { children: abTestActive ? "Distribuição A/B ativada! Mensagens divididas reduzem o risco de algoritmos do WhatsApp rastrearem padrões." : "Dica: Considere ativar o teste A/B no passo anterior para reduzir o risco de bloqueios por texto repetitivo." })] })] }), _jsx("div", { className: "whatsapp-wizard-nav", style: { justifyContent: "center", border: "none", marginTop: "1.5rem" }, children: _jsxs("button", { className: "primary-button", type: "button", onClick: () => createCampaignMutation.mutate(), disabled: createCampaignMutation.isPending || !isReadyToDispatch, style: { padding: "1rem 2.5rem", fontSize: "1rem" }, children: [createCampaignMutation.isPending ? _jsx(LoaderCircle, { size: 18, className: "spin" }) : _jsx(Send, { size: 18 }), dispatchButtonLabel] }) })] })), _jsxs("div", { className: "wp-wizard-nav", children: [_jsxs("button", { type: "button", className: "ghost-button", onClick: () => setCurrentStep(current => Math.max(1, current - 1)), disabled: currentStep === 1, children: [_jsx(ChevronLeft, { size: 16 }), "Voltar"] }), _jsxs("span", { children: ["Etapa ", currentStep, " de 5"] }), currentStep < 5 ? (_jsxs("button", { type: "button", className: "wp-btn-action primary", onClick: () => setCurrentStep(current => Math.min(5, current + 1)), children: ["Avan\u00E7ar", _jsx(ChevronRight, { size: 16 })] })) : (_jsx("span", {}))] })] }) })] })), activeTab === "HISTORY" && (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "1.5rem" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsxs("div", { children: [_jsx("h2", { style: { fontSize: "1.75rem", fontWeight: 700, color: "#18181b", margin: 0 }, children: "Hist\u00F3rico de Campanhas" }), _jsx("p", { style: { fontSize: "0.9rem", color: "#71717a", margin: "0.25rem 0 0 0" }, children: "Acompanhe o desempenho e o status dos seus disparos." })] }), _jsxs("button", { type: "button", onClick: () => {
                                    setActiveTab("NEW_CAMPAIGN");
                                    setCurrentStep(1);
                                }, style: {
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    backgroundColor: "#18181b",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: "8px",
                                    padding: "0.625rem 1.25rem",
                                    fontSize: "0.9rem",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                                    transition: "all 0.2s"
                                }, onMouseEnter: (e) => e.currentTarget.style.backgroundColor = "#27272a", onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "#18181b", children: [_jsx(Plus, { size: 16 }), "Nova Campanha"] })] }), _jsx("div", { className: "z-table-wrapper", style: { border: "1px solid #e4e4e7", borderRadius: "12px", background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.02)" }, children: _jsxs("table", { className: "z-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { padding: "1rem 1.5rem" }, children: "CAMPANHA" }), _jsx("th", { style: { padding: "1rem 1.5rem" }, children: "STATUS" }), _jsx("th", { style: { padding: "1rem 1.5rem" }, children: "PROGRESSO GERAL" }), _jsx("th", { style: { padding: "1rem 1.5rem", textAlign: "right" }, children: "A\u00C7\u00D5ES" })] }) }), _jsx("tbody", { children: campaignsQuery.data && campaignsQuery.data.length > 0 ? (campaignsQuery.data.map((campaign) => {
                                        const isExpanded = selectedCampaignId === campaign.id;
                                        const completionRatio = campaign.progress.completionRatio;
                                        const pct = Math.round(completionRatio * 100);
                                        // Style attributes for Status
                                        let statusBg = "#f1f5f9";
                                        let statusColor = "#475569";
                                        let statusBorder = "rgba(0, 0, 0, 0.05)";
                                        let statusText = campaign.status;
                                        if (campaign.status === "COMPLETED") {
                                            statusBg = "#f0fdf4";
                                            statusColor = "#166534";
                                            statusBorder = "#bbf7d0";
                                            statusText = "CONCLUÍDO";
                                        }
                                        else if (campaign.status === "CANCELLED") {
                                            statusBg = "#fef2f2";
                                            statusColor = "#991b1b";
                                            statusBorder = "#fecaca";
                                            statusText = "CANCELLED";
                                        }
                                        else if (campaign.status === "IN_PROGRESS") {
                                            statusBg = "#eff6ff";
                                            statusColor = "#1e40af";
                                            statusBorder = "#bfdbfe";
                                            statusText = "EM PROGRESSO";
                                        }
                                        else if (campaign.status === "QUEUED") {
                                            statusBg = "#fffbeb";
                                            statusColor = "#854d0e";
                                            statusBorder = "#fef08a";
                                            statusText = "NA FILA";
                                        }
                                        // Progress bar color
                                        const progressBarColor = campaign.status === "CANCELLED" ? "#ef4444" : "#10b981";
                                        return (_jsxs(Fragment, { children: [_jsxs("tr", { style: { borderBottom: isExpanded ? "none" : "1px solid #e4e4e7" }, children: [_jsx("td", { style: { padding: "1.25rem 1.5rem" }, children: _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "4px" }, children: [_jsx("span", { style: { fontSize: "0.95rem", fontWeight: 700, color: "#18181b" }, children: campaign.name }), _jsxs("span", { style: { fontSize: "0.78rem", color: "#71717a" }, children: ["Criado em ", formatDateTime(campaign.createdAt)] })] }) }), _jsx("td", { style: { padding: "1.25rem 1.5rem" }, children: _jsx("span", { style: {
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    padding: "0.25rem 0.6rem",
                                                                    borderRadius: "9999px",
                                                                    fontSize: "0.7rem",
                                                                    fontWeight: 700,
                                                                    textTransform: "uppercase",
                                                                    backgroundColor: statusBg,
                                                                    color: statusColor,
                                                                    border: `1px solid ${statusBorder}`,
                                                                    letterSpacing: "0.025em"
                                                                }, children: statusText }) }), _jsx("td", { style: { padding: "1.25rem 1.5rem", width: "300px" }, children: _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [_jsx("div", { className: "z-progress-bar-bg", style: {
                                                                                    flex: 1,
                                                                                    height: "6px",
                                                                                    backgroundColor: "#f4f4f5",
                                                                                    borderRadius: "9999px",
                                                                                    overflow: "hidden"
                                                                                }, children: _jsx("div", { className: "z-progress-bar-fill", style: {
                                                                                        width: `${pct}%`,
                                                                                        backgroundColor: progressBarColor,
                                                                                        height: "100%",
                                                                                        borderRadius: "9999px",
                                                                                        transition: "width 0.3s ease"
                                                                                    } }) }), _jsxs("span", { style: { fontSize: "0.85rem", fontWeight: 600, color: "#18181b" }, children: [pct, "%"] })] }), _jsxs("div", { style: { fontSize: "0.75rem", color: "#71717a" }, children: ["Enviados: ", _jsx("strong", { style: { color: "#18181b", fontWeight: 600 }, children: formatNumber(campaign.progress.sentCount) }), " ", "Falhas: ", _jsx("strong", { style: { color: "#ef4444", fontWeight: 600 }, children: formatNumber(campaign.progress.failedCount) })] })] }) }), _jsx("td", { style: { padding: "1.25rem 1.5rem", textAlign: "right" }, children: _jsx("button", { type: "button", className: "z-btn-detail", onClick: () => {
                                                                    if (isExpanded) {
                                                                        setSelectedCampaignId(null);
                                                                    }
                                                                    else {
                                                                        setSelectedCampaignId(campaign.id);
                                                                    }
                                                                }, style: {
                                                                    background: "#ffffff",
                                                                    border: "1px solid #e4e4e7",
                                                                    padding: "0.5rem 1rem",
                                                                    borderRadius: "8px",
                                                                    fontSize: "0.85rem",
                                                                    fontWeight: 500,
                                                                    color: "#18181b",
                                                                    cursor: "pointer",
                                                                    transition: "all 0.2s"
                                                                }, children: isExpanded ? "Ocultar Detalhes" : "Ver Detalhes" }) })] }), isExpanded && (_jsx("tr", { children: _jsx("td", { colSpan: 4, style: { padding: "0 1.5rem 1.5rem 1.5rem", background: "#fafafa", borderBottom: "1px solid #e4e4e7" }, children: _jsx("div", { style: {
                                                                background: "#ffffff",
                                                                border: "1px solid #e4e4e7",
                                                                borderRadius: "12px",
                                                                padding: "1.5rem",
                                                                marginTop: "0.5rem",
                                                                boxShadow: "0 4px 12px rgba(0,0,0,0.02)"
                                                            }, children: selectedCampaignQuery.isLoading ? (_jsxs("div", { style: { textAlign: "center", padding: "2rem", color: "#71717a" }, children: [_jsx(LoaderCircle, { size: 24, className: "spin", style: { margin: "0 auto 8px" } }), "Carregando informa\u00E7\u00F5es da campanha..."] })) : selectedCampaignQuery.data ? (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "1.5rem" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsxs("div", { children: [_jsx("h4", { style: { fontSize: "1.1rem", fontWeight: 700, color: "#18181b", margin: 0 }, children: selectedCampaignQuery.data.name }), _jsxs("p", { style: { fontSize: "0.8rem", color: "#71717a", margin: "2px 0 0 0" }, children: ["Criada por ", selectedCampaignQuery.data.createdByName, " \u00E0s ", formatDateTime(selectedCampaignQuery.data.createdAt)] })] }), ["QUEUED", "IN_PROGRESS"].includes(selectedCampaignQuery.data.status) && (_jsx("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: _jsx("button", { className: "ghost-button danger", type: "button", onClick: () => cancelCampaignMutation.mutate(selectedCampaignQuery.data.id), disabled: cancelCampaignMutation.isPending, style: { padding: "6px 12px", fontSize: "0.8rem", borderRadius: "6px" }, children: "Cancelar campanha" }) }))] }), _jsxs("div", { className: "wp-progress-stats-grid", style: { marginTop: 0 }, children: [_jsxs("div", { className: "wp-stat-box", children: [_jsx("span", { className: "wp-stat-box-label", children: "\uD83D\uDCCA Conclus\u00E3o" }), _jsx("strong", { className: "wp-stat-box-value", children: formatPercent(selectedCampaignQuery.data.progress.completionRatio) })] }), _jsxs("div", { className: "wp-stat-box", children: [_jsx("span", { className: "wp-stat-box-label", children: "\uD83D\uDE80 Enviados" }), _jsx("strong", { className: "wp-stat-box-value", children: formatNumber(selectedCampaignQuery.data.progress.sentCount) })] }), _jsxs("div", { className: "wp-stat-box", children: [_jsx("span", { className: "wp-stat-box-label", children: "\u26A0\uFE0F Falhas" }), _jsx("strong", { className: "wp-stat-box-value", children: formatNumber(selectedCampaignQuery.data.progress.failedCount) })] }), _jsxs("div", { className: "wp-stat-box", children: [_jsx("span", { className: "wp-stat-box-label", children: "\uD83D\uDEE1\uFE0F Bloqueados" }), _jsx("strong", { className: "wp-stat-box-value", children: formatNumber(selectedCampaignQuery.data.progress.blockedRecentCount) })] }), _jsxs("div", { className: "wp-stat-box", children: [_jsx("span", { className: "wp-stat-box-label", children: "\u23F1\uFE0F Pr\u00F3ximo envio" }), _jsx("strong", { className: "wp-stat-box-value", style: { fontSize: "0.9rem", wordBreak: "break-all" }, children: formatDateTime(selectedCampaignQuery.data.progress.nextScheduledAt) || "Sem registro" })] }), _jsxs("div", { className: "wp-stat-box", children: [_jsx("span", { className: "wp-stat-box-label", children: "\uD83C\uDFC1 Previs\u00E3o final" }), _jsx("strong", { className: "wp-stat-box-value", style: { fontSize: "0.9rem", wordBreak: "break-all" }, children: formatDateTime(selectedCampaignQuery.data.progress.estimatedFinishAt) || "Sem registro" })] })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }, children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [_jsx("h5", { style: { margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "Mensagem Enviada" }), _jsx("div", { style: {
                                                                                            background: "#f4f4f5",
                                                                                            border: "1px solid #e4e4e7",
                                                                                            borderRadius: "8px",
                                                                                            padding: "1rem",
                                                                                            fontSize: "0.85rem",
                                                                                            color: "#18181b",
                                                                                            whiteSpace: "pre-wrap",
                                                                                            maxHeight: "350px",
                                                                                            overflowY: "auto",
                                                                                            lineHeight: "1.5"
                                                                                        }, children: selectedCampaignQuery.data.messageText || "Sem conteúdo de mensagem." })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [_jsx("h5", { style: { margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em" }, children: "Fluxo de Disparos ao Vivo" }), _jsx("div", { className: "whatsapp-recipient-list", style: { display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "350px", overflowY: "auto", paddingRight: "4px" }, children: selectedCampaignQuery.data.recipients.map((recipient) => (_jsxs("article", { className: `wp-recipient-row-card tone-${recipientTone(recipient.status)}`, style: { padding: "0.6rem 0.85rem", margin: 0, borderRadius: "8px" }, children: [renderRecipientIdentifier(recipient), _jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }, children: [_jsx("span", { className: `status-badge status-${recipientTone(recipient.status)}`, style: { fontSize: "0.6rem", padding: "1px 4px" }, children: recipient.status === "SENT" ? "✓ ENVIADO" : recipient.status === "FAILED" ? "✕ FALHA" : recipient.status === "PENDING" ? "⏱ AGENDADO" : recipient.status === "BLOCKED_RECENT" ? "🛡️ BLOQUEADO" : recipient.status }), _jsx("span", { style: { fontSize: "0.65rem", color: "#71717a" }, children: recipient.status === "SENT" && recipient.sentAt ? formatDateTime(recipient.sentAt) : recipient.status === "PENDING" && recipient.scheduledFor ? formatDateTime(recipient.scheduledFor) : "" })] })] }, recipient.id))) })] })] })] })) : (_jsx("div", { style: { textAlign: "center", padding: "1.5rem", color: "#ef4444" }, children: "Erro ao carregar detalhes." })) }) }) }))] }, campaign.id));
                                    })) : (_jsx("tr", { children: _jsx("td", { colSpan: 4, style: { padding: "3rem", textAlign: "center", color: "#71717a" }, children: "Nenhuma campanha encontrada. Comece criando uma nova campanha!" }) })) })] }) })] }))] }));
}
