import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CustomerTable } from "../components/CustomerTable";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
const initialDefinition = {
    status: ["INACTIVE"],
    minDaysInactive: 90,
    minTotalSpent: 0,
};
function sanitizeSegmentDefinition(definition) {
    const { frequencyDropRatio: _frequencyDropRatio, ...cleanDefinition } = definition;
    return cleanDefinition;
}
function summarizeSegment(segment) {
    const parts = [];
    if (segment.definition.status?.length) {
        const status = segment.definition.status[0];
        parts.push(status === "ACTIVE" ? "Ativos" : status === "ATTENTION" ? "Atencao" : "Inativos");
    }
    if (segment.definition.minDaysInactive !== undefined) {
        parts.push(`${segment.definition.minDaysInactive}+ dias`);
    }
    if (segment.definition.labels?.length) {
        parts.push(`Rotulo: ${segment.definition.labels[0]}`);
    }
    return parts.length ? parts.join(" | ") : "Filtro dinamico salvo";
}
export function SegmentsPage() {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [definition, setDefinition] = useState(() => sanitizeSegmentDefinition(initialDefinition));
    const [segmentName, setSegmentName] = useState("");
    const [activeSegmentId, setActiveSegmentId] = useState(null);
    const [segmentMessage, setSegmentMessage] = useState("");
    const labelsQuery = useQuery({
        queryKey: ["customer-labels"],
        queryFn: () => api.customerLabels(token),
        enabled: Boolean(token),
    });
    const savedSegmentsQuery = useQuery({
        queryKey: ["saved-segments"],
        queryFn: () => api.savedSegments(token),
        enabled: Boolean(token),
    });
    const previewMutation = useMutation({
        mutationFn: (input) => api.previewSegment(token, input),
    });
    const saveSegmentMutation = useMutation({
        mutationFn: (input) => activeSegmentId ? api.updateSavedSegment(token, activeSegmentId, input) : api.createSavedSegment(token, input),
        onSuccess: (savedSegment) => {
            setActiveSegmentId(savedSegment.id);
            setSegmentName(savedSegment.name);
            setSegmentMessage(activeSegmentId ? "Publico atualizado com sucesso." : "Publico salvo com sucesso.");
            void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
        },
    });
    const duplicateSegmentMutation = useMutation({
        mutationFn: (input) => api.createSavedSegment(token, input),
        onSuccess: (savedSegment) => {
            setActiveSegmentId(savedSegment.id);
            setSegmentName(savedSegment.name);
            setSegmentMessage("Publico duplicado com sucesso.");
            void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
        },
    });
    const deleteSegmentMutation = useMutation({
        mutationFn: (id) => api.deleteSavedSegment(token, id),
        onSuccess: () => {
            setActiveSegmentId(null);
            setSegmentName("");
            setSegmentMessage("Publico excluido.");
            void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
        },
    });
    function handleSubmit(event) {
        event.preventDefault();
        const cleanDefinition = sanitizeSegmentDefinition(definition);
        setDefinition(cleanDefinition);
        previewMutation.mutate(cleanDefinition);
        setSegmentMessage("");
    }
    function openSavedSegment(segment) {
        const cleanDefinition = sanitizeSegmentDefinition(segment.definition);
        setDefinition(cleanDefinition);
        setSegmentName(segment.name);
        setActiveSegmentId(segment.id);
        setSegmentMessage("");
        previewMutation.mutate(cleanDefinition);
    }
    function handleSaveSegment() {
        const cleanedName = segmentName.trim();
        if (!cleanedName) {
            setSegmentMessage("Dê um nome ao publico antes de salvar.");
            return;
        }
        saveSegmentMutation.mutate({
            name: cleanedName,
            definition: sanitizeSegmentDefinition(definition),
        });
    }
    function handleDuplicateSegment() {
        const baseName = segmentName.trim() || "Publico acionavel";
        duplicateSegmentMutation.mutate({
            name: `${baseName} copia`,
            definition: sanitizeSegmentDefinition(definition),
        });
    }
    function handleDeleteSegment() {
        if (!activeSegmentId) {
            return;
        }
        deleteSegmentMutation.mutate(activeSegmentId);
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "grid-two", children: [_jsxs("form", { className: "panel", onSubmit: handleSubmit, children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Segmentacao inteligente" }), _jsx("h2", { className: "premium-header-title", children: "Monte um publico acionavel" })] }) }), _jsxs("div", { className: "filters-grid filters-grid-four segment-filters-grid", children: [_jsxs("label", { className: "full-span", children: ["Nome do publico", _jsx("input", { value: segmentName, onChange: (event) => {
                                                    setSegmentName(event.target.value);
                                                    setSegmentMessage("");
                                                }, placeholder: "Ex: Reativacao premium do mes" })] }), _jsxs("label", { className: "segment-filter-half", children: ["Status", _jsxs("select", { value: definition.status?.[0] ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    status: event.target.value ? [event.target.value] : undefined,
                                                })), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "ACTIVE", children: "Ativos" }), _jsx("option", { value: "ATTENTION", children: "Atencao" }), _jsx("option", { value: "INACTIVE", children: "Inativos" })] })] }), _jsxs("label", { className: "segment-filter-half", children: ["Minimo de dias inativo", _jsx("input", { type: "number", value: definition.minDaysInactive ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    minDaysInactive: event.target.value ? Number(event.target.value) : undefined,
                                                })) })] }), _jsxs("label", { className: "segment-filter-half", children: ["Ticket minimo", _jsx("input", { type: "number", value: definition.minAvgTicket ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    minAvgTicket: event.target.value ? Number(event.target.value) : undefined,
                                                })) })] }), _jsxs("label", { className: "segment-filter-half", children: ["Total gasto minimo", _jsx("input", { type: "number", value: definition.minTotalSpent ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    minTotalSpent: event.target.value ? Number(event.target.value) : undefined,
                                                })) })] }), _jsxs("label", { className: "segment-filter-half", children: ["Com rotulo", _jsxs("select", { value: definition.labels?.[0] ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    labels: event.target.value ? [event.target.value] : undefined,
                                                })), children: [_jsx("option", { value: "", children: "Todos" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { className: "segment-filter-half", children: ["Excluir rotulo", _jsxs("select", { value: definition.excludeLabels?.[0] ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    excludeLabels: event.target.value ? [event.target.value] : undefined,
                                                })), children: [_jsx("option", { value: "", children: "Nenhum" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] })] }), _jsxs("div", { className: "inline-actions segment-actions-bar", children: [_jsx("button", { className: "primary-button", type: "submit", children: "Pre-visualizar segmento" }), _jsx("button", { className: "ghost-button", type: "button", onClick: handleSaveSegment, disabled: saveSegmentMutation.isPending, children: saveSegmentMutation.isPending ? "Salvando..." : activeSegmentId ? "Atualizar publico" : "Salvar publico" }), _jsx("button", { className: "ghost-button", type: "button", onClick: handleDuplicateSegment, disabled: duplicateSegmentMutation.isPending, children: duplicateSegmentMutation.isPending ? "Duplicando..." : "Duplicar" }), activeSegmentId ? (_jsx("button", { className: "ghost-button danger", type: "button", onClick: handleDeleteSegment, disabled: deleteSegmentMutation.isPending, children: deleteSegmentMutation.isPending ? "Excluindo..." : "Excluir" })) : null, segmentMessage ? _jsx("span", { className: "save-ok", children: segmentMessage }) : null] })] }), _jsxs("article", { className: "panel segment-summary-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Resumo" }), _jsx("h3", { children: "Resultado esperado" }), _jsx("p", { className: "panel-subcopy", children: "A previa aparece aqui para voc\u00EA decidir se esse publico vale salvar e acionar." })] }) }), previewMutation.data ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "detail-grid segment-summary-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Clientes" }), _jsx("strong", { children: formatNumber(previewMutation.data.summary.totalCustomers) })] }), _jsxs("div", { children: [_jsx("span", { children: "Prioridade media" }), _jsx("strong", { children: Number(previewMutation.data.summary.averagePriorityScore ?? 0).toFixed(1) })] }), _jsxs("div", { children: [_jsx("span", { children: "Faturamento" }), _jsx("strong", { children: formatCurrency(previewMutation.data.summary.potentialRecoveredRevenue ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Media de pecas/pedido" }), _jsx("strong", { children: formatNumber(previewMutation.data.summary.potentialRecoveredPieces ?? 0) })] })] }), _jsxs("div", { className: "detail-grid segment-summary-grid", style: { marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }, children: [_jsx("div", { style: { gridColumn: '1 / -1' }, children: _jsx("span", { style: { fontSize: '0.875rem', fontWeight: 600, color: '#2563eb' }, children: "Potencial mensal se recuperarmos" }) }), _jsxs("div", { children: [_jsx("span", { children: "Faturamento/mes" }), _jsx("strong", { style: { color: '#2563eb' }, children: formatCurrency(previewMutation.data.summary.monthlyPotentialRevenue ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Pecas/mes" }), _jsx("strong", { style: { color: '#2563eb' }, children: formatNumber(previewMutation.data.summary.monthlyPotentialPieces ?? 0) })] })] }), _jsx("p", { className: "panel-subcopy segment-summary-note", children: "A primeira linha mostra dados historicos: media de pecas por pedido e soma dos tickets medios de cada cliente. A segunda linha projeta o potencial mensal caso consigamos recuperar esses clientes, baseado no historico de compras (frequencia e valor) de cada um." })] })) : (_jsx("div", { className: "empty-state", children: "Gere a previa para ver quantos clientes entram no publico, qual a prioridade media e o potencial estimado." }))] })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Biblioteca compartilhada" }), _jsx("h3", { children: "Publicos salvos" }), _jsx("p", { className: "panel-subcopy", children: "Guarde filtros que funcionam bem para a equipe reaproveitar depois." })] }) }), savedSegmentsQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando publicos..." }) : null, savedSegmentsQuery.isError ? _jsx("div", { className: "page-error", children: "Nao foi possivel carregar os publicos salvos." }) : null, !savedSegmentsQuery.isLoading && !savedSegmentsQuery.isError ? (savedSegmentsQuery.data?.length ? (_jsx("div", { className: "saved-segment-list", children: savedSegmentsQuery.data.map((segment) => (_jsxs("button", { type: "button", className: `saved-segment-card ${segment.id === activeSegmentId ? "is-active" : ""}`, onClick: () => openSavedSegment(segment), children: [_jsx("strong", { children: segment.name }), _jsx("span", { children: summarizeSegment(segment) })] }, segment.id))) })) : null) : null, !savedSegmentsQuery.isLoading && !savedSegmentsQuery.isError && !savedSegmentsQuery.data?.length ? (_jsx("div", { className: "empty-state", children: "Nenhum publico salvo ainda. Monte um filtro e salve para a equipe reaproveitar." })) : null] }), previewMutation.data ? _jsx(CustomerTable, { customers: previewMutation.data.customers }) : null] }));
}
