import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CustomerTable } from "../components/CustomerTable";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
const initialDefinition = {
    status: ["INACTIVE"],
    minDaysInactive: 90,
    minTotalSpent: 0,
};
export function SegmentsPage() {
    const { token } = useAuth();
    const [definition, setDefinition] = useState(initialDefinition);
    const labelsQuery = useQuery({
        queryKey: ["customer-labels"],
        queryFn: () => api.customerLabels(token),
        enabled: Boolean(token),
    });
    const previewMutation = useMutation({
        mutationFn: (input) => api.previewSegment(token, input),
    });
    function handleSubmit(event) {
        event.preventDefault();
        previewMutation.mutate(definition);
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "grid-two", children: [_jsxs("form", { className: "panel", onSubmit: handleSubmit, children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Segmentacao inteligente" }), _jsx("h2", { children: "Monte um publico acionavel" })] }) }), _jsxs("div", { className: "filters-grid filters-grid-four", children: [_jsxs("label", { children: ["Status", _jsxs("select", { value: definition.status?.[0] ?? "", onChange: (event) => setDefinition((current) => ({
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
                                                })) })] }), _jsxs("label", { children: ["Com r\u00F3tulo", _jsxs("select", { value: definition.labels?.[0] ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    labels: event.target.value ? [event.target.value] : undefined,
                                                })), children: [_jsx("option", { value: "", children: "Todos" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { children: ["Excluir r\u00F3tulo", _jsxs("select", { value: definition.excludeLabels?.[0] ?? "", onChange: (event) => setDefinition((current) => ({
                                                    ...current,
                                                    excludeLabels: event.target.value ? [event.target.value] : undefined,
                                                })), children: [_jsx("option", { value: "", children: "Nenhum" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] })] }), _jsx("button", { className: "primary-button", type: "submit", children: "Pre-visualizar segmento" })] }), _jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Resumo" }), _jsx("h3", { children: "Resultado esperado" })] }) }), previewMutation.data ? (_jsxs("div", { className: "detail-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Clientes" }), _jsx("strong", { children: formatNumber(previewMutation.data.summary.totalCustomers) })] }), _jsxs("div", { children: [_jsx("span", { children: "Prioridade media" }), _jsx("strong", { children: Number(previewMutation.data.summary.averagePriorityScore ?? 0).toFixed(1) })] }), _jsxs("div", { children: [_jsx("span", { children: "Potencial de faturamento" }), _jsx("strong", { children: formatCurrency(previewMutation.data.summary.potentialRecoveredRevenue ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Pecas potenciais" }), _jsx("strong", { children: formatNumber(previewMutation.data.summary.potentialRecoveredPieces ?? 0) })] })] })) : (_jsx("p", { className: "muted-copy", children: "Monte o filtro e gere a previa para ver a populacao do segmento." })), previewMutation.data ? (_jsx("p", { className: "panel-subcopy", children: "O potencial de faturamento mostra quanto a empresa pode voltar a movimentar se conseguir reativar esse publico, usando como base o ticket medio historico de cada cliente do segmento. As pecas potenciais usam a media de pecas por pedido desse mesmo publico." })) : null] })] }), previewMutation.data ? _jsx(CustomerTable, { customers: previewMutation.data.customers }) : null] }));
}
