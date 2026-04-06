import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
    const [definition, setDefinition] = useState(initialDefinition);
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
        previewMutation.mutate(definition);
        setSegmentMessage("");
    }
    function openSavedSegment(segment) {
        setDefinition(segment.definition);
        setSegmentName(segment.name);
        setActiveSegmentId(segment.id);
        setSegmentMessage("");
        previewMutation.mutate(segment.definition);
    }
    function handleSaveSegment() {
        const cleanedName = segmentName.trim();
        if (!cleanedName) {
            setSegmentMessage("Dê um nome ao publico antes de salvar.");
            return;
        }
        saveSegmentMutation.mutate({
            name: cleanedName,
            definition,
        });
    }
    function handleDuplicateSegment() {
        const baseName = segmentName.trim() || "Publico acionavel";
        duplicateSegmentMutation.mutate({
            name: `${baseName} copia`,
            definition,
        });
    }
    function handleDeleteSegment() {
        if (!activeSegmentId) {
            return;
        }
        deleteSegmentMutation.mutate(activeSegmentId);
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "grid-two", children: [_jsxs("form", { className: "panel", onSubmit: handleSubmit, children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Segmentacao inteligente" }), _jsx("h2", { children: "Monte um publico acionavel" })] }) }), _jsxs("div", { className: "filters-grid filters-grid-four", children: [_jsxs("label", { className: "full-span", children: ["Nome do publico", _jsx("input", { value: segmentName, onChange: (event) => {
                                                    setSegmentName(event.target.value);
                                                    setSegmentMessage("");
                                                }, placeholder: "Ex: Reativacao premium do mes" })] }), _jsxs("label", { children: ["Status", _jsxs("select", { value: definition.status?.[0] ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    status: event.target.value ? [event.target.value] : undefined,
                                                })), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "ACTIVE", children: "Ativos" }), _jsx("option", { value: "ATTENTION", children: "Atencao" }), _jsx("option", { value: "INACTIVE", children: "Inativos" })] })] }), _jsxs("label", { children: ["Minimo de dias inativo", _jsx("input", { type: "number", value: definition.minDaysInactive ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    minDaysInactive: event.target.value ? Number(event.target.value) : undefined,
                                                })) })] }), _jsxs("label", { children: ["Ticket minimo", _jsx("input", { type: "number", value: definition.minAvgTicket ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    minAvgTicket: event.target.value ? Number(event.target.value) : undefined,
                                                })) })] }), _jsxs("label", { children: ["Total gasto minimo", _jsx("input", { type: "number", value: definition.minTotalSpent ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    minTotalSpent: event.target.value ? Number(event.target.value) : undefined,
                                                })) })] }), _jsxs("label", { children: ["Queda minima de frequencia", _jsx("input", { type: "number", step: "0.1", value: definition.frequencyDropRatio ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    frequencyDropRatio: event.target.value ? Number(event.target.value) : undefined,
                                                })) })] }), _jsxs("label", { children: ["Com rotulo", _jsxs("select", { value: definition.labels?.[0] ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    labels: event.target.value ? [event.target.value] : undefined,
                                                })), children: [_jsx("option", { value: "", children: "Todos" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { children: ["Excluir rotulo", _jsxs("select", { value: definition.excludeLabels?.[0] ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    excludeLabels: event.target.value ? [event.target.value] : undefined,
                                                })), children: [_jsx("option", { value: "", children: "Nenhum" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] })] }), _jsxs("div", { className: "inline-actions", children: [_jsx("button", { className: "primary-button", type: "submit", children: "Pre-visualizar segmento" }), _jsx("button", { className: "ghost-button", type: "button", onClick: handleSaveSegment, disabled: saveSegmentMutation.isPending, children: saveSegmentMutation.isPending ? "Salvando..." : activeSegmentId ? "Atualizar publico" : "Salvar publico" }), _jsx("button", { className: "ghost-button", type: "button", onClick: handleDuplicateSegment, disabled: duplicateSegmentMutation.isPending, children: duplicateSegmentMutation.isPending ? "Duplicando..." : "Duplicar" }), activeSegmentId ? (_jsx("button", { className: "ghost-button danger", type: "button", onClick: handleDeleteSegment, disabled: deleteSegmentMutation.isPending, children: deleteSegmentMutation.isPending ? "Excluindo..." : "Excluir" })) : null, segmentMessage ? _jsx("span", { className: "save-ok", children: segmentMessage }) : null] })] }), _jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Biblioteca compartilhada" }), _jsx("h3", { children: "Publicos salvos" })] }) }), savedSegmentsQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando publicos..." }) : null, savedSegmentsQuery.isError ? _jsx("div", { className: "page-error", children: "Nao foi possivel carregar os publicos salvos." }) : null, !savedSegmentsQuery.isLoading && !savedSegmentsQuery.isError ? (savedSegmentsQuery.data?.length ? (_jsx("div", { className: "saved-segment-list", children: savedSegmentsQuery.data.map((segment) => (_jsxs("button", { type: "button", className: `saved-segment-card ${segment.id === activeSegmentId ? "is-active" : ""}`, onClick: () => openSavedSegment(segment), children: [_jsx("strong", { children: segment.name }), _jsx("span", { children: summarizeSegment(segment) })] }, segment.id))) })) : (_jsx("div", { className: "empty-state", children: "Nenhum publico salvo ainda. Monte um filtro e salve para a equipe reaproveitar." }))) : null] })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Resumo" }), _jsx("h3", { children: "Resultado esperado" })] }) }), previewMutation.data ? (_jsxs("div", { className: "detail-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Clientes" }), _jsx("strong", { children: formatNumber(previewMutation.data.summary.totalCustomers) })] }), _jsxs("div", { children: [_jsx("span", { children: "Prioridade media" }), _jsx("strong", { children: Number(previewMutation.data.summary.averagePriorityScore ?? 0).toFixed(1) })] }), _jsxs("div", { children: [_jsx("span", { children: "Potencial de faturamento" }), _jsx("strong", { children: formatCurrency(previewMutation.data.summary.potentialRecoveredRevenue ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Pecas potenciais" }), _jsx("strong", { children: formatNumber(previewMutation.data.summary.potentialRecoveredPieces ?? 0) })] })] })) : (_jsx("p", { className: "muted-copy", children: "Monte o filtro e gere a previa para ver a populacao do segmento." })), previewMutation.data ? (_jsx("p", { className: "panel-subcopy", children: "O potencial de faturamento mostra quanto a empresa pode voltar a movimentar se conseguir reativar esse publico, usando como base o ticket medio historico de cada cliente do segmento. As pecas potenciais usam a media de pecas por pedido desse mesmo publico." })) : null] }), previewMutation.data ? _jsx(CustomerTable, { customers: previewMutation.data.customers }) : null] }));
}
