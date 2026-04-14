import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, LoaderCircle, RefreshCw, Send, ShieldAlert, UploadCloud, XCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDateTime, formatNumber, formatPercent } from "../lib/format";
const quickFilters = [
    { value: "ALL", label: "Todos", description: "Toda a base importada." },
    { value: "WITH_ORDER", label: "Com pedido", description: "Grupos CL e KH." },
    { value: "NO_ORDER_EXCEL", label: "Nunca comprou", description: "Grupos do Excel marcados como Cliente." },
    { value: "OTHER", label: "Outros", description: "LJ, internos e demais grupos." },
    { value: "PENDING_REVIEW", label: "Pendentes", description: "Sem mapeamento fechado." },
];
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string") {
                reject(new Error("Nao foi possivel ler o arquivo selecionado."));
                return;
            }
            resolve(reader.result);
        };
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo selecionado."));
        reader.readAsDataURL(file);
    });
}
function buildGroupsQueryParams(input) {
    const params = {
        search: input.search || undefined,
        savedSegmentId: input.savedSegmentId || undefined,
        onlyRecentlyBlocked: input.onlyRecentlyBlocked || undefined,
    };
    if (input.quickFilter === "WITH_ORDER" || input.quickFilter === "NO_ORDER_EXCEL" || input.quickFilter === "OTHER") {
        params.classification = input.quickFilter;
    }
    if (input.quickFilter === "PENDING_REVIEW") {
        params.mappingStatus = "PENDING_REVIEW";
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
function quickFilterCount(filter, summary) {
    if (!summary)
        return "--";
    if (filter === "ALL")
        return formatNumber(summary.totalGroups);
    if (filter === "PENDING_REVIEW")
        return formatNumber(summary.pendingReviewGroups);
    return formatNumber(summary.classificationCounts[filter]);
}
export function DisparadorPage() {
    const auth = useAuth();
    const { token, user } = auth;
    const canImport = ["ADMIN", "MANAGER"].includes(user?.role ?? "");
    const queryClient = useQueryClient();
    const [selectedFile, setSelectedFile] = useState(null);
    const [quickFilter, setQuickFilter] = useState("ALL");
    const [search, setSearch] = useState("");
    const [savedSegmentId, setSavedSegmentId] = useState("");
    const [recentBlockFilter, setRecentBlockFilter] = useState("AVAILABLE_ONLY");
    const [selectedGroupIds, setSelectedGroupIds] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState("");
    const [campaignName, setCampaignName] = useState("");
    const [messageText, setMessageText] = useState("");
    const [overrideRecentBlock, setOverrideRecentBlock] = useState(false);
    const [minDelaySeconds, setMinDelaySeconds] = useState(183);
    const [maxDelaySeconds, setMaxDelaySeconds] = useState(304);
    const [selectedCampaignId, setSelectedCampaignId] = useState(null);
    const [attemptedAutoImport, setAttemptedAutoImport] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());
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
    const importFileMutation = useMutation({
        mutationFn: async () => {
            if (!selectedFile) {
                throw new Error("Escolha um arquivo antes de importar.");
            }
            const fileBase64 = await readFileAsBase64(selectedFile);
            return api.importWhatsappGroups(token, {
                fileName: selectedFile.name,
                fileBase64,
            });
        },
        onSuccess: async () => {
            setSelectedFile(null);
            await invalidateWhatsappQueries();
        },
    });
    const createCampaignMutation = useMutation({
        mutationFn: () => api.createWhatsappCampaign(token, {
            name: campaignName.trim() || `Disparo ${new Date().toLocaleDateString("pt-BR")}`,
            templateId: selectedTemplateId || null,
            savedSegmentId: savedSegmentId || null,
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
        if (!selectedCampaignId && campaignsQuery.data?.[0]) {
            setSelectedCampaignId(campaignsQuery.data[0].id);
        }
    }, [campaignsQuery.data, selectedCampaignId]);
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
        if (!canImport || !mappingSummaryQuery.data || attemptedAutoImport || importDefaultMutation.isPending) {
            return;
        }
        if (mappingSummaryQuery.data.totalGroups === 0) {
            setAttemptedAutoImport(true);
            importDefaultMutation.mutate();
        }
    }, [attemptedAutoImport, canImport, importDefaultMutation, mappingSummaryQuery.data]);
    useEffect(() => {
        const timer = window.setInterval(() => {
            setNowMs(Date.now());
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);
    const loadedGroups = groupsQuery.data?.items ?? [];
    const filteredGroups = useMemo(() => {
        if (recentBlockFilter !== "AVAILABLE_ONLY") {
            return loadedGroups;
        }
        return loadedGroups.filter((group) => !group.isRecentlyBlocked);
    }, [loadedGroups, recentBlockFilter]);
    const selectedGroupCount = selectedGroupIds.length;
    const allVisibleSelected = filteredGroups.length > 0 && filteredGroups.every((group) => selectedGroupIds.includes(group.id));
    const selectedSavedSegment = savedSegmentsQuery.data?.find((segment) => segment.id === savedSegmentId) ?? null;
    const selectedTemplate = templatesQuery.data?.find((template) => template.id === selectedTemplateId) ?? null;
    const importSummary = importDefaultMutation.data ?? importFileMutation.data;
    const importError = (importDefaultMutation.error ?? importFileMutation.error);
    const isImporting = importDefaultMutation.isPending || importFileMutation.isPending;
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
    function handleFileChange(event) {
        setSelectedFile(event.target.files?.[0] ?? null);
    }
    function toggleGroupSelection(groupId) {
        setSelectedGroupIds((current) => current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId]);
    }
    function toggleVisibleSelection() {
        const visibleIds = filteredGroups.map((group) => group.id);
        setSelectedGroupIds((current) => {
            if (allVisibleSelected) {
                return current.filter((groupId) => !visibleIds.includes(groupId));
            }
            return [...new Set([...current, ...visibleIds])];
        });
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "panel whatsapp-workspace-header", children: [_jsxs("div", { className: "whatsapp-workspace-copy", children: [_jsx("p", { className: "eyebrow", children: "Disparador WhatsApp" }), _jsx("h2", { children: "Disparador" }), _jsx("p", { className: "panel-subcopy", children: "Escolha os grupos, revise a mensagem e acompanhe a fila sem sair desta tela." })] }), _jsxs("div", { className: "whatsapp-inline-stats", children: [_jsxs("div", { className: "whatsapp-inline-stat is-highlight", children: [_jsx("span", { children: "Selecionados" }), _jsx("strong", { children: formatNumber(selectedGroupCount) })] }), _jsxs("div", { className: "whatsapp-inline-stat", children: [_jsx("span", { children: "Base" }), _jsx("strong", { children: mappingSummaryQuery.data ? formatNumber(mappingSummaryQuery.data.totalGroups) : "--" })] }), _jsxs("div", { className: "whatsapp-inline-stat", children: [_jsx("span", { children: "Nunca compraram" }), _jsx("strong", { children: mappingSummaryQuery.data
                                            ? formatNumber(mappingSummaryQuery.data.classificationCounts.NO_ORDER_EXCEL)
                                            : "--" })] }), _jsxs("div", { className: "whatsapp-inline-stat", children: [_jsx("span", { children: "Pendentes" }), _jsx("strong", { children: mappingSummaryQuery.data ? formatNumber(mappingSummaryQuery.data.pendingReviewGroups) : "--" })] }), _jsxs("div", { className: "whatsapp-inline-stat", children: [_jsx("span", { children: "Ultima atualizacao" }), _jsx("strong", { children: formatDateTime(mappingSummaryQuery.data?.lastImportedAt ?? null) })] })] })] }), _jsxs("section", { className: "grid-two whatsapp-simple-grid", children: [_jsxs("article", { className: "panel whatsapp-source-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Base" }), _jsx("h3", { children: "Base de grupos" }), _jsx("p", { className: "panel-subcopy", children: "A planilha padrao do desktop ja alimenta a tela. Atualize so quando quiser recarregar." })] }) }), _jsxs("div", { className: "whatsapp-source-actions", children: [canImport ? (_jsxs("button", { className: "primary-button", type: "button", onClick: () => importDefaultMutation.mutate(), disabled: isImporting, children: [isImporting ? _jsx(LoaderCircle, { size: 16, className: "spin" }) : _jsx(RefreshCw, { size: 16 }), isImporting ? "Atualizando..." : "Usar planilha padrao"] })) : null, canImport ? (_jsxs("label", { className: "whatsapp-file-input", children: [_jsx(UploadCloud, { size: 16 }), _jsx("span", { children: selectedFile ? selectedFile.name : "Escolher outro arquivo" }), _jsx("input", { type: "file", accept: ".xlsx,.xls", onChange: handleFileChange })] })) : null, canImport && selectedFile ? (_jsx("button", { className: "ghost-button", type: "button", onClick: () => importFileMutation.mutate(), disabled: isImporting, children: "Importar arquivo escolhido" })) : null] }), importSummary ? (_jsxs("div", { className: "whatsapp-summary-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Linhas validas" }), _jsx("strong", { children: formatNumber(importSummary.importedCount) })] }), _jsxs("div", { children: [_jsx("span", { children: "Inseridos" }), _jsx("strong", { children: formatNumber(importSummary.insertedCount) })] }), _jsxs("div", { children: [_jsx("span", { children: "Atualizados" }), _jsx("strong", { children: formatNumber(importSummary.updatedCount) })] }), _jsxs("div", { children: [_jsx("span", { children: "Auto mapeados" }), _jsx("strong", { children: formatNumber(importSummary.autoMappedCount) })] })] })) : null, importError ? _jsx("div", { className: "page-error", children: importError.message }) : null, mappingSummaryQuery.data?.pendingReviewGroups ? (_jsxs("div", { className: "whatsapp-inline-note", children: [_jsxs("strong", { children: [formatNumber(mappingSummaryQuery.data.pendingReviewGroups), " pendentes."] }), _jsx("span", { children: "Continuam na tabela, mas nao entram em publico salvo ate fechar o mapeamento." })] })) : null, liveCampaign && liveCampaignIsRunning ? (_jsxs("div", { className: "whatsapp-live-card whatsapp-live-queue-card", children: [_jsxs("div", { className: "whatsapp-live-card-header", children: [_jsx("strong", { children: "Fila do disparo agora" }), _jsx("span", { className: `status-badge status-${campaignStatusTone(liveCampaign.status)}`, children: liveCampaign.status })] }), _jsxs("div", { className: "whatsapp-live-card-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Campanha" }), _jsx("strong", { children: liveCampaign.name })] }), _jsxs("div", { children: [_jsx("span", { children: "Proximo envio" }), _jsx("strong", { children: formatDateTime(liveCampaign.progress.nextScheduledAt) })] }), _jsxs("div", { children: [_jsx("span", { children: "Enviados" }), _jsx("strong", { children: formatNumber(liveCampaign.progress.sentCount) })] }), _jsxs("div", { children: [_jsx("span", { children: "Pendentes" }), _jsx("strong", { children: formatNumber(liveCampaign.progress.pendingCount) })] })] }), _jsxs("div", { className: "whatsapp-countdown-card", children: [_jsx("span", { children: "Proximo disparo em" }), _jsx("strong", { children: liveCampaign.progress.nextScheduledAt
                                                    ? nextDispatchCountdown ?? formatDateTime(liveCampaign.progress.nextScheduledAt)
                                                    : liveCampaign.status === "IN_PROGRESS"
                                                        ? "Enviando agora"
                                                        : "Fila concluida" }), _jsx("small", { children: liveCampaign.progress.nextScheduledAt
                                                    ? `Horario previsto: ${formatDateTime(liveCampaign.progress.nextScheduledAt)}`
                                                    : "Nao ha mais contatos aguardando na fila." })] }), _jsx("div", { className: "whatsapp-live-recipient-list", children: liveRecipients.map((recipient) => (_jsxs("article", { className: `whatsapp-live-recipient tone-${recipientTone(recipient.status)}`, children: [_jsxs("div", { children: [_jsx("strong", { children: recipient.sourceName }), _jsx("p", { children: recipient.status === "PENDING" && recipient.scheduledFor
                                                                ? `${recipientLiveLabel(recipient)}${formatCountdown(recipient.scheduledFor, nowMs) ? ` - faltam ${formatCountdown(recipient.scheduledFor, nowMs)}` : ""}`
                                                                : recipientLiveLabel(recipient) })] }), _jsx("span", { className: `status-badge status-${recipientTone(recipient.status)}`, children: recipient.status })] }, recipient.id))) }), _jsxs("p", { className: "panel-subcopy", children: ["Delay ativo: ", liveCampaign.minDelaySeconds, "s a ", liveCampaign.maxDelaySeconds, "s entre envios."] }), liveCampaignFirstFailure ? (_jsxs("div", { className: "empty-state", children: ["Ultima falha: ", liveCampaignFirstFailure.sourceName, " - ", liveCampaignFirstFailure.lastError || "falha no envio", "."] })) : null] })) : liveCampaign ? (_jsxs("div", { className: "whatsapp-live-card whatsapp-live-card-compact", children: [_jsxs("div", { className: "whatsapp-live-card-header", children: [_jsx("strong", { children: "Ultimo disparo" }), _jsx("span", { className: `status-badge status-${campaignStatusTone(liveCampaign.status)}`, children: liveCampaign.status })] }), _jsxs("div", { className: "whatsapp-live-card-grid whatsapp-live-card-grid-compact", children: [_jsxs("div", { children: [_jsx("span", { children: "Campanha" }), _jsx("strong", { children: liveCampaign.name })] }), _jsxs("div", { children: [_jsx("span", { children: "Enviados" }), _jsx("strong", { children: formatNumber(liveCampaign.progress.sentCount) })] }), _jsxs("div", { children: [_jsx("span", { children: "Falhas" }), _jsx("strong", { children: formatNumber(liveCampaign.progress.failedCount) })] }), _jsxs("div", { children: [_jsx("span", { children: "Finalizado" }), _jsx("strong", { children: formatDateTime(liveCampaign.finishedAt || liveCampaign.createdAt) })] })] })] })) : (_jsx("div", { className: "empty-state", children: "A fila aparece aqui assim que um disparo entrar em andamento." }))] }), _jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Mensagem" }), _jsx("h3", { children: "Mensagem e disparo" }), _jsx("p", { className: "panel-subcopy", children: "Escolha um template ou escreva a mensagem final para os grupos marcados." })] }) }), _jsxs("div", { className: "filters-grid", children: [_jsxs("label", { children: ["Nome da campanha", _jsx("input", { value: campaignName, onChange: (event) => setCampaignName(event.target.value), placeholder: "Ex: Reativacao clientes inativos" })] }), _jsxs("label", { children: ["Template de mensagem", _jsxs("select", { value: selectedTemplateId, onChange: (event) => setSelectedTemplateId(event.target.value), children: [_jsx("option", { value: "", children: "Mensagem livre" }), (templatesQuery.data ?? []).map((template) => (_jsx("option", { value: template.id, children: template.title }, template.id)))] })] }), _jsxs("label", { children: ["Delay minimo", _jsx("input", { type: "number", min: 1, value: minDelaySeconds, onChange: (event) => setMinDelaySeconds(Number(event.target.value) || 1) })] }), _jsxs("label", { children: ["Delay maximo", _jsx("input", { type: "number", min: 1, value: maxDelaySeconds, onChange: (event) => setMaxDelaySeconds(Number(event.target.value) || 1) })] }), _jsxs("label", { className: "full-span", children: ["Mensagem final", _jsx("textarea", { rows: 10, value: messageText, onChange: (event) => setMessageText(event.target.value), placeholder: "Digite a mensagem que sera enviada..." })] })] }), !templatesQuery.data?.length ? (_jsx("div", { className: "empty-state", children: "Nenhum template salvo ainda. A mensagem livre abaixo sera usada normalmente." })) : null, _jsx("div", { className: "message-preview whatsapp-message-preview", children: messageText || "A mensagem final vai aparecer aqui assim que voce escrever ou escolher um template." }), _jsxs("div", { className: "whatsapp-compose-summary", children: [_jsxs("div", { children: [_jsx("span", { children: "Template" }), _jsx("strong", { children: selectedTemplate?.title ?? "Mensagem livre" })] }), _jsxs("div", { children: [_jsx("span", { children: "Publico salvo" }), _jsx("strong", { children: selectedSavedSegment?.name ?? "Nao selecionado" })] }), _jsxs("div", { children: [_jsx("span", { children: "Selecionados" }), _jsxs("strong", { children: [formatNumber(selectedGroupCount), " grupos"] })] }), _jsxs("div", { children: [_jsx("span", { children: "Anti-spam" }), _jsx("strong", { children: overrideRecentBlock ? "Bloqueio ignorado" : "Bloqueio de 7 dias ativo" })] })] }), _jsxs("label", { className: "whatsapp-checkbox-row", children: [_jsx("input", { type: "checkbox", checked: overrideRecentBlock, onChange: (event) => setOverrideRecentBlock(event.target.checked) }), _jsx("span", { children: "Ignorar o bloqueio de 7 dias para contatos recentes" })] }), _jsx("div", { className: "inline-actions", children: _jsxs("button", { className: "primary-button", type: "button", onClick: () => createCampaignMutation.mutate(), disabled: createCampaignMutation.isPending || !messageText.trim() || selectedGroupCount === 0, children: [createCampaignMutation.isPending ? _jsx(LoaderCircle, { size: 16, className: "spin" }) : _jsx(Send, { size: 16 }), createCampaignMutation.isPending ? "Criando campanha..." : "Disparar para selecionados"] }) }), createCampaignMutation.isError ? (_jsx("div", { className: "page-error", children: createCampaignMutation.error.message })) : null] })] }), _jsxs("section", { className: "panel table-panel", children: [_jsxs("div", { className: "panel-header whatsapp-selection-summary", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Selecao" }), _jsx("h3", { children: "Grupos para disparo" }), _jsx("p", { className: "panel-subcopy", children: "Filtre e marque os grupos que vao receber." })] }), _jsxs("div", { className: "whatsapp-inline-stats whatsapp-inline-stats-compact", children: [_jsxs("div", { className: "whatsapp-inline-stat", children: [_jsx("span", { children: "Mostrados" }), _jsx("strong", { children: formatNumber(filteredGroups.length) })] }), _jsxs("div", { className: "whatsapp-inline-stat is-highlight", children: [_jsx("span", { children: "Selecionados" }), _jsx("strong", { children: formatNumber(selectedGroupCount) })] })] })] }), _jsxs("div", { className: "filters-grid filters-grid-four whatsapp-selection-toolbar", children: [_jsxs("label", { children: ["Publico salvo", _jsxs("select", { value: savedSegmentId, onChange: (event) => setSavedSegmentId(event.target.value), children: [_jsx("option", { value: "", children: "Todos os grupos" }), (savedSegmentsQuery.data ?? []).map((segment) => (_jsx("option", { value: segment.id, children: segment.name }, segment.id)))] })] }), _jsxs("label", { children: ["Buscar", _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Nome do grupo, cliente ou codigo" })] }), _jsxs("div", { className: "whatsapp-filter-segment", children: [_jsx("span", { children: "Bloqueio" }), _jsxs("div", { className: "whatsapp-segmented-control", children: [_jsx("button", { type: "button", className: recentBlockFilter === "AVAILABLE_ONLY" ? "active" : "", onClick: () => setRecentBlockFilter("AVAILABLE_ONLY"), children: "Disponiveis" }), _jsx("button", { type: "button", className: recentBlockFilter === "ALL" ? "active" : "", onClick: () => setRecentBlockFilter("ALL"), children: "Todos" }), _jsx("button", { type: "button", className: recentBlockFilter === "BLOCKED_ONLY" ? "active" : "", onClick: () => setRecentBlockFilter("BLOCKED_ONLY"), children: "Bloqueados" })] })] })] }), hiddenBlockedCount ? (_jsxs("div", { className: "whatsapp-selection-hint", children: [formatNumber(hiddenBlockedCount), " grupos bloqueados estao ocultos no filtro `Disponiveis`."] })) : null, _jsx("div", { className: "whatsapp-quick-filter-row", children: quickFilters.map((filter) => (_jsxs("button", { type: "button", className: `chart-switch-button ${quickFilter === filter.value ? "active" : ""}`, onClick: () => setQuickFilter(filter.value), children: [_jsx("strong", { children: filter.label }), _jsx("small", { children: quickFilterCount(filter.value, mappingSummaryQuery.data) })] }, filter.value))) }), _jsxs("div", { className: "inline-actions whatsapp-selection-actions", children: [_jsx("button", { className: "ghost-button", type: "button", onClick: toggleVisibleSelection, disabled: !filteredGroups.length, children: allVisibleSelected ? "Desmarcar visiveis" : "Selecionar visiveis" }), _jsx("button", { className: "ghost-button", type: "button", onClick: () => setSelectedGroupIds([]), disabled: !selectedGroupCount, children: "Limpar selecao" })] }), groupsQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando grupos..." }) : null, groupsQuery.isError ? _jsx("div", { className: "page-error", children: "Nao foi possivel carregar os grupos." }) : null, groupsQuery.data?.items.length ? (_jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table whatsapp-groups-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Enviar" }), _jsx("th", { children: "Grupo do Excel" }), _jsx("th", { children: "Cliente mapeado" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Ultimo contato" }), _jsx("th", { children: "Status" })] }) }), _jsx("tbody", { children: groupsQuery.data.items.map((group) => (_jsxs("tr", { className: selectedGroupIds.includes(group.id) ? "is-selected" : "", children: [_jsx("td", { children: _jsx("input", { type: "checkbox", checked: selectedGroupIds.includes(group.id), onChange: () => toggleGroupSelection(group.id) }) }), _jsx("td", { children: _jsxs("div", { className: "table-link", children: [_jsx("strong", { children: group.sourceName }), _jsx("span", { children: group.jid })] }) }), _jsx("td", { children: _jsxs("div", { className: "table-link", children: [_jsx("strong", { children: group.customerDisplayName || "Sem cliente mapeado" }), _jsx("span", { children: group.customerCode || "Grupo sem codigo no CRM" })] }) }), _jsx("td", { children: _jsxs("div", { className: "table-link", children: [_jsx("strong", { children: classificationLabel(group.classification) }), _jsx("span", { children: mappingStatusLabel(group.mappingStatus) })] }) }), _jsx("td", { children: _jsxs("div", { className: "table-link", children: [_jsx("strong", { children: formatDateTime(group.lastContactAt) }), _jsx("span", { className: "table-truncate", children: truncateText(group.lastMessagePreview || (group.isRecentlyBlocked ? "Contato recente." : "Sem historico de envio.")) })] }) }), _jsx("td", { children: _jsx("div", { className: "whatsapp-table-status", children: group.isRecentlyBlocked ? (_jsxs("div", { className: "table-link whatsapp-status-stack", children: [_jsx("span", { className: "status-badge status-warning", children: "Bloqueado" }), _jsxs("span", { children: ["ate ", formatDateTime(group.recentBlockUntil)] })] })) : (_jsx("span", { className: "status-badge status-success", children: "Disponivel" })) }) })] }, group.id))) })] }) })) : (_jsx("div", { className: "empty-panel", children: _jsx("div", { className: "empty-state", children: savedSegmentId
                                ? "Esse publico salvo ainda nao tem grupos mapeados na base importada."
                                : "Nenhum grupo encontrado com o filtro atual." }) }))] }), _jsxs("section", { className: "grid-two whatsapp-campaign-grid", children: [_jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Historico" }), _jsx("h3", { children: "Fila e historico" })] }) }), _jsx("div", { className: "whatsapp-campaign-list", children: (campaignsQuery.data ?? []).map((campaign) => (_jsxs("button", { type: "button", className: `queue-card whatsapp-campaign-card ${selectedCampaignId === campaign.id ? "is-selected" : ""}`, onClick: () => setSelectedCampaignId(campaign.id), children: [_jsxs("div", { className: "queue-card-top", children: [_jsxs("div", { className: "queue-card-heading", children: [_jsx("strong", { children: campaign.name }), _jsxs("p", { className: "muted-copy", children: [campaign.templateTitle || "Mensagem livre", " - ", formatDateTime(campaign.createdAt)] })] }), _jsx("span", { className: `status-badge status-${campaignStatusTone(campaign.status)}`, children: campaign.status })] }), _jsxs("div", { className: "queue-card-meta", children: [_jsxs("span", { children: [formatNumber(campaign.progress.sentCount), " enviados"] }), _jsxs("span", { children: [formatNumber(campaign.progress.failedCount), " falhas"] }), _jsxs("span", { children: [formatNumber(campaign.progress.blockedRecentCount), " bloqueados"] })] })] }, campaign.id))) })] }), _jsxs("article", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Tempo real" }), _jsx("h3", { children: "Progresso da campanha" })] }), selectedCampaignQuery.data && ["QUEUED", "IN_PROGRESS"].includes(selectedCampaignQuery.data.status) ? (_jsx("button", { className: "ghost-button danger", type: "button", onClick: () => cancelCampaignMutation.mutate(selectedCampaignQuery.data.id), disabled: cancelCampaignMutation.isPending, children: "Cancelar campanha" })) : null] }), selectedCampaignQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando campanha..." }) : null, selectedCampaignQuery.isError ? _jsx("div", { className: "page-error", children: "Nao foi possivel carregar a campanha." }) : null, selectedCampaignQuery.data ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "whatsapp-progress-header", children: [_jsxs("div", { children: [_jsx("strong", { children: selectedCampaignQuery.data.name }), _jsxs("p", { className: "muted-copy", children: ["Criada por ", selectedCampaignQuery.data.createdByName, " -", " ", formatDateTime(selectedCampaignQuery.data.createdAt)] })] }), _jsx("span", { className: `status-badge status-${campaignStatusTone(selectedCampaignQuery.data.status)}`, children: selectedCampaignQuery.data.status })] }), _jsx("div", { className: "whatsapp-progress-bar", children: _jsx("div", { className: "whatsapp-progress-bar-fill", style: {
                                                width: `${Math.max(0, Math.min(100, selectedCampaignQuery.data.progress.completionRatio * 100))}%`,
                                            } }) }), _jsxs("div", { className: "whatsapp-summary-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Conclusao" }), _jsx("strong", { children: formatPercent(selectedCampaignQuery.data.progress.completionRatio) })] }), _jsxs("div", { children: [_jsx("span", { children: "Enviados" }), _jsx("strong", { children: formatNumber(selectedCampaignQuery.data.progress.sentCount) })] }), _jsxs("div", { children: [_jsx("span", { children: "Falhas" }), _jsx("strong", { children: formatNumber(selectedCampaignQuery.data.progress.failedCount) })] }), _jsxs("div", { children: [_jsx("span", { children: "Bloqueados" }), _jsx("strong", { children: formatNumber(selectedCampaignQuery.data.progress.blockedRecentCount) })] }), _jsxs("div", { children: [_jsx("span", { children: "Proximo envio" }), _jsx("strong", { children: formatDateTime(selectedCampaignQuery.data.progress.nextScheduledAt) })] }), _jsxs("div", { children: [_jsx("span", { children: "Previsao final" }), _jsx("strong", { children: formatDateTime(selectedCampaignQuery.data.progress.estimatedFinishAt) })] })] }), _jsx("div", { className: "whatsapp-recipient-list", children: selectedCampaignQuery.data.recipients.map((recipient) => (_jsxs("article", { className: `queue-card compact whatsapp-recipient-card tone-${recipientTone(recipient.status)}`, children: [_jsxs("div", { className: "queue-card-top", children: [_jsxs("div", { className: "queue-card-heading", children: [_jsx("strong", { children: recipient.sourceName }), _jsx("p", { className: "muted-copy", children: recipient.customerDisplayName || recipient.customerCode || recipient.jid })] }), _jsx("span", { className: `status-badge status-${recipientTone(recipient.status)}`, children: recipient.status })] }), _jsxs("div", { className: "queue-card-meta", children: [recipient.status === "SENT" ? _jsxs("span", { children: [_jsx(CheckCircle2, { size: 14 }), " Enviado ", formatDateTime(recipient.sentAt)] }) : null, recipient.status === "FAILED" ? _jsxs("span", { children: [_jsx(XCircle, { size: 14 }), " ", recipient.lastError || "Falha no envio"] }) : null, recipient.status === "PENDING" ? _jsxs("span", { children: [_jsx(Clock3, { size: 14 }), " Agendado para ", formatDateTime(recipient.scheduledFor)] }) : null, recipient.status === "BLOCKED_RECENT" ? _jsxs("span", { children: [_jsx(ShieldAlert, { size: 14 }), " Bloqueado por contato recente"] }) : null, recipient.status === "SENDING" ? _jsxs("span", { children: [_jsx(LoaderCircle, { size: 14, className: "spin" }), " Enviando agora"] }) : null, recipient.status === "SKIPPED" ? _jsx("span", { children: "Pulado" }) : null] })] }, recipient.id))) })] })) : (_jsx("div", { className: "empty-state", children: "Selecione uma campanha para acompanhar o progresso em tempo real." }))] })] })] }));
}
