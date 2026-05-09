import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, CirclePlus, Plus, Trophy, X, XCircle, } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDateTime } from "../lib/format";
const PRIORITY_LABELS = { LOW: "Baixa", MEDIUM: "Media", HIGH: "Alta" };
const PRIORITY_TONES = { LOW: "neutral", MEDIUM: "warning", HIGH: "danger" };
function daysSince(dateStr) {
    return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)));
}
function activityIcon(type) {
    if (type === "WHATSAPP_SENT" || type === "WHATSAPP_RECEIVED")
        return "💬";
    if (type === "CALL")
        return "📞";
    if (type === "MEETING")
        return "🤝";
    if (type === "STAGE_CHANGE")
        return "➡️";
    if (type === "TASK")
        return "✅";
    if (type === "CREATED")
        return "🆕";
    return "📝";
}
export function PipelinePage() {
    const auth = useAuth();
    const { token } = auth;
    const queryClient = useQueryClient();
    const [showNewDealModal, setShowNewDealModal] = useState(false);
    const [selectedDealId, setSelectedDealId] = useState(null);
    const [dragOverStageId, setDragOverStageId] = useState(null);
    const [draggingDealId, setDraggingDealId] = useState(null);
    const [showClosed, setShowClosed] = useState(false);
    const [searchFilter, setSearchFilter] = useState("");
    const summaryQuery = useQuery({
        queryKey: ["pipeline-summary", showClosed],
        queryFn: () => api.pipelineSummary(token, showClosed),
        enabled: Boolean(token),
    });
    const dealDetailQuery = useQuery({
        queryKey: ["pipeline-deal", selectedDealId],
        queryFn: () => api.getDeal(token, selectedDealId),
        enabled: Boolean(token && selectedDealId),
    });
    const moveStageMutation = useMutation({
        mutationFn: ({ dealId, stageId }) => api.moveDealStage(token, dealId, stageId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] });
            void queryClient.invalidateQueries({ queryKey: ["pipeline-deal"] });
        },
    });
    const stages = summaryQuery.data?.stages ?? [];
    const allDeals = summaryQuery.data?.deals ?? [];
    const filteredDeals = useMemo(() => {
        if (!searchFilter.trim())
            return allDeals;
        const q = searchFilter.toLowerCase();
        return allDeals.filter((d) => d.title.toLowerCase().includes(q) ||
            (d.customerDisplayName ?? "").toLowerCase().includes(q) ||
            (d.customerCode ?? "").toLowerCase().includes(q) ||
            (d.assignedToName ?? "").toLowerCase().includes(q));
    }, [allDeals, searchFilter]);
    const visibleStages = useMemo(() => {
        if (showClosed)
            return stages;
        return stages.filter((s) => !s.isWon && !s.isLost);
    }, [stages, showClosed]);
    function dealsByStage(stageId) {
        return filteredDeals.filter((d) => d.stageId === stageId);
    }
    function handleDragStart(event, dealId) {
        event.dataTransfer.setData("text/plain", dealId);
        event.dataTransfer.effectAllowed = "move";
        setDraggingDealId(dealId);
    }
    function handleDragOver(event, stageId) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDragOverStageId(stageId);
    }
    function handleDragLeave() {
        setDragOverStageId(null);
    }
    function handleDrop(event, stageId) {
        event.preventDefault();
        setDragOverStageId(null);
        setDraggingDealId(null);
        const dealId = event.dataTransfer.getData("text/plain");
        if (!dealId)
            return;
        const deal = allDeals.find((d) => d.id === dealId);
        if (!deal || deal.stageId === stageId)
            return;
        moveStageMutation.mutate({ dealId, stageId });
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "panel pipeline-header", children: [_jsxs("div", { className: "pipeline-header-copy", children: [_jsx("p", { className: "eyebrow", children: "Pipeline de Vendas" }), _jsx("h2", { className: "premium-header-title", children: "Kanban" }), _jsx("p", { className: "panel-subcopy", children: "Arraste os deals entre os estagios para atualizar o status." })] }), _jsxs("div", { className: "pipeline-header-actions", children: [_jsxs("div", { className: "pipeline-kpis", children: [_jsxs("div", { children: [_jsx("span", { children: "Deals ativos" }), _jsx("strong", { children: summaryQuery.data?.totalDeals ?? 0 })] }), _jsxs("div", { children: [_jsx("span", { children: "Valor total" }), _jsx("strong", { children: formatCurrency(summaryQuery.data?.totalValue ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Ganhos" }), _jsx("strong", { children: summaryQuery.data?.wonDeals ?? 0 })] })] }), _jsxs("div", { className: "pipeline-toolbar", children: [_jsx("input", { className: "pipeline-search", placeholder: "Buscar deal, cliente...", value: searchFilter, onChange: (e) => setSearchFilter(e.target.value) }), _jsxs("label", { className: "pipeline-toggle", children: [_jsx("input", { type: "checkbox", checked: showClosed, onChange: (e) => setShowClosed(e.target.checked) }), _jsx("span", { children: "Mostrar encerrados" })] }), _jsxs("button", { className: "primary-button", type: "button", onClick: () => setShowNewDealModal(true), children: [_jsx(Plus, { size: 16 }), "Novo Deal"] })] })] })] }), _jsx("section", { className: "pipeline-board", children: visibleStages.map((stage) => {
                    const stageDeals = dealsByStage(stage.id);
                    const isDragOver = dragOverStageId === stage.id;
                    return (_jsxs("div", { className: `pipeline-column ${isDragOver ? "pipeline-column-dragover" : ""}`, style: { backgroundColor: `${stage.color}15`, borderColor: `${stage.color}22` }, onDragOver: (e) => handleDragOver(e, stage.id), onDragLeave: handleDragLeave, onDrop: (e) => handleDrop(e, stage.id), children: [_jsx("div", { className: "pipeline-column-header", children: _jsxs("div", { className: "pipeline-column-title", children: [_jsx("span", { className: "pipeline-column-dot", style: { background: stage.color } }), _jsx("strong", { children: stage.name }), _jsx("span", { className: "pipeline-column-count", style: { color: stage.color, backgroundColor: `${stage.color}22` }, children: stageDeals.length })] }) }), _jsxs("div", { className: "pipeline-column-cards", children: [stageDeals.map((deal) => (_jsx(DealCard, { deal: deal, stageColor: stage.color, isDragging: draggingDealId === deal.id, onDragStart: (e) => handleDragStart(e, deal.id), onDragEnd: () => setDraggingDealId(null), onClick: () => setSelectedDealId(deal.id) }, deal.id))), stageDeals.length === 0 && (_jsx("div", { className: "pipeline-empty-col", style: { borderColor: `${stage.color}33`, color: stage.color }, children: "Nenhum deal neste estagio" }))] })] }, stage.id));
                }) }), showNewDealModal && (_jsx(NewDealModal, { stages: stages, onClose: () => setShowNewDealModal(false) })), selectedDealId && dealDetailQuery.data && (_jsx(DealDetailModal, { deal: dealDetailQuery.data, stages: stages, onClose: () => setSelectedDealId(null) }))] }));
}
// ── Deal Card ─────────────────────────────────────────────────────
function DealCard({ deal, stageColor, isDragging, onDragStart, onDragEnd, onClick, }) {
    const inactiveDays = daysSince(deal.lastActivityAt);
    const initials = deal.title.substring(0, 2).toUpperCase().replace(/[^a-zA-Z0-9]/g, '');
    return (_jsxs("article", { className: `pipeline-card ${isDragging ? "pipeline-card-dragging" : ""}`, draggable: true, onDragStart: onDragStart, onDragEnd: onDragEnd, onClick: onClick, children: [_jsx("div", { className: "pipeline-card-avatar", style: { backgroundColor: `${stageColor}22`, color: stageColor }, children: initials || "U" }), _jsxs("div", { className: "pipeline-card-body", children: [_jsx("strong", { className: "pipeline-card-title", children: deal.title }), deal.customerDisplayName && (_jsx("span", { className: "pipeline-card-customer", children: deal.customerDisplayName })), _jsxs("div", { className: "pipeline-card-meta", children: [_jsx("span", { className: `status-badge status-${PRIORITY_TONES[deal.priority]}`, children: PRIORITY_LABELS[deal.priority] }), inactiveDays > 7 && (_jsxs("span", { className: "status-badge status-danger", children: [inactiveDays, "d inativo"] }))] })] })] }));
}
// ── New Deal Modal ────────────────────────────────────────────────
function NewDealModal({ stages, onClose, }) {
    const auth = useAuth();
    const queryClient = useQueryClient();
    const [title, setTitle] = useState("");
    const [stageId, setStageId] = useState(stages.find((s) => !s.isWon && !s.isLost)?.id ?? "");
    const [expectedValue, setExpectedValue] = useState(0);
    const [priority, setPriority] = useState("MEDIUM");
    const [whatsappJid, setWhatsappJid] = useState("");
    const createMutation = useMutation({
        mutationFn: () => api.createDeal(auth.token, {
            title,
            stageId,
            expectedValue,
            priority,
            whatsappJid: whatsappJid ? `${whatsappJid.replace(/\D/g, "")}@s.whatsapp.net` : undefined,
        }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] });
            onClose();
        },
    });
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, children: _jsxs("div", { className: "modal-container pipeline-modal", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "modal-header", children: [_jsx("h3", { children: "Novo Deal" }), _jsx("button", { type: "button", className: "modal-close", onClick: onClose, children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "modal-body", children: [_jsxs("label", { children: ["Titulo *", _jsx("input", { value: title, onChange: (e) => setTitle(e.target.value), placeholder: "Ex: Pedido 500 pecas cliente X" })] }), _jsxs("label", { children: ["Estagio", _jsx("select", { value: stageId, onChange: (e) => setStageId(e.target.value), children: stages.filter((s) => !s.isWon && !s.isLost).map((s) => (_jsx("option", { value: s.id, children: s.name }, s.id))) })] }), _jsxs("label", { children: ["WhatsApp do Cliente (Apenas n\u00FAmeros)", _jsx("input", { value: whatsappJid, onChange: (e) => setWhatsappJid(e.target.value), placeholder: "Ex: 5511999999999" })] }), _jsxs("label", { children: ["Valor esperado (R$)", _jsx("input", { type: "number", min: 0, value: expectedValue, onChange: (e) => setExpectedValue(Number(e.target.value) || 0) })] }), _jsxs("label", { children: ["Prioridade", _jsxs("select", { value: priority, onChange: (e) => setPriority(e.target.value), children: [_jsx("option", { value: "LOW", children: "Baixa" }), _jsx("option", { value: "MEDIUM", children: "Media" }), _jsx("option", { value: "HIGH", children: "Alta" })] })] }), createMutation.isError && (_jsx("div", { className: "page-error", children: createMutation.error.message }))] }), _jsxs("div", { className: "modal-footer", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: onClose, children: "Cancelar" }), _jsxs("button", { type: "button", className: "primary-button", disabled: !title.trim() || !stageId || createMutation.isPending, onClick: () => createMutation.mutate(), children: [_jsx(CirclePlus, { size: 16 }), createMutation.isPending ? "Criando..." : "Criar Deal"] })] })] }) }));
}
// ── Deal Detail Modal ─────────────────────────────────────────────
function DealDetailModal({ deal, stages, onClose, }) {
    const auth = useAuth();
    const queryClient = useQueryClient();
    const [activityContent, setActivityContent] = useState("");
    const [activityType, setActivityType] = useState("NOTE");
    const currentStage = stages.find((s) => s.id === deal.stageId);
    const addActivityMutation = useMutation({
        mutationFn: () => api.addDealActivity(auth.token, deal.id, {
            activityType: activityType,
            content: activityContent,
        }),
        onSuccess: () => {
            setActivityContent("");
            void queryClient.invalidateQueries({ queryKey: ["pipeline-deal", deal.id] });
            void queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] });
        },
    });
    const moveStageMutation = useMutation({
        mutationFn: (stageId) => api.moveDealStage(auth.token, deal.id, stageId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["pipeline-deal", deal.id] });
            void queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] });
        },
    });
    const wonStage = stages.find((s) => s.isWon);
    const lostStage = stages.find((s) => s.isLost);
    return (_jsx("div", { className: "modal-backdrop", onClick: onClose, children: _jsxs("div", { className: "modal-container pipeline-detail-modal", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "modal-header", children: [_jsxs("div", { children: [_jsx("h3", { children: deal.title }), currentStage && (_jsx("span", { className: "status-badge", style: { background: currentStage.color, color: "#fff" }, children: currentStage.name }))] }), _jsx("button", { type: "button", className: "modal-close", onClick: onClose, children: _jsx(X, { size: 20 }) })] }), _jsxs("div", { className: "modal-body pipeline-detail-body", children: [_jsxs("div", { className: "pipeline-detail-info", children: [_jsxs("div", { className: "pipeline-detail-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Cliente" }), _jsx("strong", { children: deal.customerDisplayName || "Sem cliente vinculado" })] }), _jsxs("div", { children: [_jsx("span", { children: "Valor esperado" }), _jsx("strong", { children: formatCurrency(deal.expectedValue) })] }), _jsxs("div", { children: [_jsx("span", { children: "Responsavel" }), _jsx("strong", { children: deal.assignedToName || "Nao atribuido" })] }), _jsxs("div", { children: [_jsx("span", { children: "WhatsApp" }), _jsx("strong", { children: deal.whatsappJid ? deal.whatsappJid.replace("@s.whatsapp.net", "") : "Não cadastrado" })] }), _jsxs("div", { children: [_jsx("span", { children: "Criado em" }), _jsx("strong", { children: formatDateTime(deal.createdAt) })] })] }), _jsxs("div", { className: "pipeline-detail-actions", children: [wonStage && !currentStage?.isWon && !currentStage?.isLost && (_jsxs("button", { type: "button", className: "primary-button pipeline-btn-won", onClick: () => moveStageMutation.mutate(wonStage.id), disabled: moveStageMutation.isPending, children: [_jsx(Trophy, { size: 16 }), "Marcar como ganho"] })), lostStage && !currentStage?.isLost && !currentStage?.isWon && (_jsxs("button", { type: "button", className: "secondary-button pipeline-btn-lost", onClick: () => moveStageMutation.mutate(lostStage.id), disabled: moveStageMutation.isPending, children: [_jsx(XCircle, { size: 16 }), "Marcar como perdido"] })), !currentStage?.isWon && !currentStage?.isLost && (_jsxs("div", { className: "pipeline-move-selector", children: [_jsx(ArrowRightLeft, { size: 14 }), _jsx("select", { value: deal.stageId, onChange: (e) => moveStageMutation.mutate(e.target.value), disabled: moveStageMutation.isPending, children: stages.filter((s) => !s.isWon && !s.isLost).map((s) => (_jsx("option", { value: s.id, children: s.name }, s.id))) })] }))] })] }), _jsxs("div", { className: "pipeline-detail-timeline", children: [_jsx("h4", { children: "Atividades" }), _jsx("div", { className: "pipeline-add-activity", children: _jsxs("div", { className: "pipeline-activity-input-row", children: [_jsxs("select", { value: activityType, onChange: (e) => setActivityType(e.target.value), children: [_jsx("option", { value: "NOTE", children: "\uD83D\uDCDD Nota" }), _jsx("option", { value: "CALL", children: "\uD83D\uDCDE Ligacao" }), _jsx("option", { value: "MEETING", children: "\uD83E\uDD1D Reuniao" }), _jsx("option", { value: "WHATSAPP_SENT", children: "\uD83D\uDCAC WhatsApp" }), _jsx("option", { value: "TASK", children: "\u2705 Tarefa" })] }), _jsx("input", { value: activityContent, onChange: (e) => setActivityContent(e.target.value), placeholder: "Descreva a atividade...", onKeyDown: (e) => {
                                                    if (e.key === "Enter" && activityContent.trim()) {
                                                        addActivityMutation.mutate();
                                                    }
                                                } }), _jsx("button", { type: "button", className: "primary-button", disabled: !activityContent.trim() || addActivityMutation.isPending, onClick: () => addActivityMutation.mutate(), children: _jsx(Plus, { size: 16 }) })] }) }), _jsxs("div", { className: "pipeline-activity-list", children: [deal.activities.map((activity) => (_jsxs("div", { className: "pipeline-activity-item", children: [_jsx("span", { className: "pipeline-activity-icon", children: activityIcon(activity.activityType) }), _jsxs("div", { className: "pipeline-activity-content", children: [_jsx("p", { children: activity.content }), _jsxs("small", { children: [activity.actorName && _jsx("strong", { children: activity.actorName }), " · ", formatDateTime(activity.createdAt)] })] })] }, activity.id))), deal.activities.length === 0 && (_jsx("div", { className: "empty-state", children: "Nenhuma atividade registrada ainda." }))] })] })] })] }) }));
}
