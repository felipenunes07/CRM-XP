import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { InfoHint } from "../components/InfoHint";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, formatPercent, statusLabel } from "../lib/format";
const insightLabels = {
    alto_valor: "Alto valor",
    reativacao: "Reativacao",
    recorrente: "Recorrente",
    queda_frequencia: "Queda de frequencia",
    risco_churn: "Risco de churn",
    compra_prevista_vencida: "Compra prevista vencida",
    novo_cliente: "Novo cliente",
};
function insightExplanation(tag, customer) {
    switch (tag) {
        case "risco_churn":
            return `Considera queda de frequencia a partir de 50% entre os ultimos 90 dias e os 90 dias anteriores, com o cliente ja fora do status ativo. Hoje a queda estimada e ${formatPercent(customer.frequencyDropRatio)}.`;
        case "queda_frequencia":
            return `O ritmo de compra caiu na comparacao entre os ultimos 90 dias e a janela anterior. A queda atual estimada e ${formatPercent(customer.frequencyDropRatio)}.`;
        case "reativacao":
            return "Cliente esta inativo e vale abordagem de retorno, principalmente quando ja teve boa recorrencia ou bom historico de compra.";
        case "recorrente":
            return "Cliente ativo, com intervalo medio de compra curto e sem queda relevante de frequencia.";
        case "alto_valor":
            return "Cliente com gasto total acima da faixa alta da base. Merece prioridade de relacionamento.";
        case "compra_prevista_vencida":
            return "A previsao simples de proxima compra ja passou e ainda nao houve novo pedido.";
        case "novo_cliente":
            return "Cliente recente, com ate 2 pedidos e compra nos ultimos 30 dias.";
        default:
            return "Insight calculado automaticamente com base em recencia, frequencia e valor.";
    }
}
function primaryInsightLabel(customer) {
    if (!customer.primaryInsight) {
        return "sem alerta";
    }
    return insightLabels[customer.primaryInsight];
}
export function CustomerDetailPage() {
    const { id } = useParams();
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [selectedLabels, setSelectedLabels] = useState([]);
    const [newLabel, setNewLabel] = useState("");
    const [internalNotes, setInternalNotes] = useState("");
    const [saveMessage, setSaveMessage] = useState("");
    const detailQuery = useQuery({
        queryKey: ["customer", id],
        queryFn: () => api.customer(token, id),
        enabled: Boolean(token && id),
    });
    const labelsQuery = useQuery({
        queryKey: ["customer-labels"],
        queryFn: () => api.customerLabels(token),
        enabled: Boolean(token),
    });
    const customer = detailQuery.data ?? null;
    const knownLabels = useMemo(() => labelsQuery.data?.map((label) => label.name) ?? [], [labelsQuery.data]);
    const availableLabels = useMemo(() => knownLabels.filter((labelName) => !selectedLabels.includes(labelName)), [knownLabels, selectedLabels]);
    useEffect(() => {
        if (!customer) {
            return;
        }
        setSelectedLabels(customer.labels.map((label) => label.name));
        setInternalNotes(customer.internalNotes);
    }, [customer]);
    const saveLabelsMutation = useMutation({
        mutationFn: (input) => api.updateCustomerLabels(token, id, input),
        onSuccess: (updatedCustomer) => {
            queryClient.setQueryData(["customer", updatedCustomer.id], updatedCustomer);
            void queryClient.invalidateQueries({ queryKey: ["customers"] });
            setSaveMessage("Classificacao salva com sucesso.");
        },
    });
    if (detailQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando ficha do cliente..." });
    }
    if (detailQuery.isError || !customer) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel carregar a ficha do cliente." });
    }
    function addExistingLabel(labelName) {
        if (selectedLabels.includes(labelName)) {
            return;
        }
        setSelectedLabels((current) => [...current, labelName]);
        setSaveMessage("");
    }
    function addNewLabel() {
        const cleaned = newLabel.trim();
        if (!cleaned || selectedLabels.includes(cleaned)) {
            return;
        }
        setSelectedLabels((current) => [...current, cleaned]);
        setNewLabel("");
        setSaveMessage("");
    }
    function removeLabel(labelName) {
        setSelectedLabels((current) => current.filter((item) => item !== labelName));
        setSaveMessage("");
    }
    function handleSave(event) {
        event.preventDefault();
        saveLabelsMutation.mutate({
            labels: selectedLabels,
            internalNotes,
        });
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsx("section", { className: "hero-panel", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Ficha do cliente" }), _jsx("h2", { children: customer.displayName }), _jsxs("p", { children: [customer.customerCode, " | ", statusLabel(customer.status), " | Insight principal: ", primaryInsightLabel(customer)] })] }) }), _jsxs("section", { className: "stats-grid detail-stats-grid", children: [_jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Ultima compra" }), _jsx("strong", { children: formatDate(customer.lastPurchaseAt) })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Tempo desde a ultima compra" }), _jsx("strong", { children: formatDaysSince(customer.daysSinceLastPurchase) })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Pedidos com a gente" }), _jsx("strong", { children: customer.totalOrders })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Ticket medio" }), _jsx("strong", { children: formatCurrency(customer.avgTicket) })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Total gasto" }), _jsx("strong", { children: formatCurrency(customer.totalSpent) })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Score de valor" }), _jsx("strong", { children: customer.valueScore.toFixed(1) })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsxs("span", { className: "label-with-info", children: ["Score de prioridade", _jsx(InfoHint, { text: "Pontuacao de prioridade: 40% recencia, 25% valor do cliente, 20% queda de frequencia e 15% compra prevista vencida." })] }), _jsx("strong", { children: customer.priorityScore.toFixed(1) })] })] }), _jsxs("section", { className: "grid-two", children: [_jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Sinais analiticos" }), _jsx("h3", { children: "Leitura comercial rapida" })] }) }), _jsxs("div", { className: "detail-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Frequencia nos ultimos 90 dias" }), _jsx("strong", { children: customer.purchaseFrequency90d.toFixed(1) })] }), _jsxs("div", { children: [_jsx("span", { children: "Media entre pedidos" }), _jsx("strong", { children: customer.avgDaysBetweenOrders?.toFixed(1) ?? "Sem base" })] }), _jsxs("div", { children: [_jsx("span", { children: "Queda de frequencia" }), _jsx("strong", { children: formatPercent(customer.frequencyDropRatio) })] }), _jsxs("div", { children: [_jsx("span", { children: "Proxima compra prevista" }), _jsx("strong", { children: formatDate(customer.predictedNextPurchaseAt) })] }), _jsxs("div", { children: [_jsx("span", { children: "Atendente mais recente" }), _jsx("strong", { children: customer.lastAttendant ?? "Nao informado" })] }), _jsxs("div", { children: [_jsx("span", { children: "Status comercial" }), _jsx("strong", { children: statusLabel(customer.status) })] })] })] }), _jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Como ler os insights" }), _jsx("h3", { children: "Explicacao do que o sistema esta vendo" })] }) }), _jsx("p", { className: "panel-subcopy", children: "Para churn, o sistema compara os ultimos 90 dias com os 90 dias anteriores. Quando a queda de frequencia chega em 50% ou mais e o cliente sai da zona ativa, ele entra em risco de churn." }), _jsx("div", { className: "insight-list", children: customer.insightTags.length ? (customer.insightTags.map((tag) => (_jsxs("article", { className: "insight-card", children: [_jsx("strong", { children: insightLabels[tag] }), _jsx("p", { children: insightExplanation(tag, customer) })] }, tag)))) : (_jsxs("article", { className: "insight-card", children: [_jsx("strong", { children: "Sem alerta no momento" }), _jsx("p", { children: "O cliente nao bateu nenhum gatilho especial de prioridade ou risco agora." })] })) })] })] }), _jsxs("section", { className: "grid-two", children: [_jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Classificacao interna" }), _jsx("h3", { children: "Rotulos e observacoes do comercial" })] }) }), _jsxs("form", { className: "stack-list", onSubmit: handleSave, children: [_jsxs("div", { className: "label-block", children: [_jsx("span", { className: "label-block-title", children: "Rotulos atuais" }), _jsx("p", { className: "panel-subcopy", children: "Clique no x para remover. Depois clique em salvar." }), _jsx("div", { className: "tag-row", children: selectedLabels.length ? (selectedLabels.map((labelName) => (_jsxs("span", { className: "tag removable-tag", children: [_jsx("span", { children: labelName }), _jsx("button", { type: "button", className: "tag-remove-button", onClick: () => removeLabel(labelName), children: "x" })] }, labelName)))) : (_jsx("span", { className: "muted-copy", children: "Nenhum rotulo selecionado." })) })] }), _jsxs("div", { className: "label-block", children: [_jsx("span", { className: "label-block-title", children: "Adicionar rotulo existente" }), _jsx("div", { className: "tag-row", children: availableLabels.length ? (availableLabels.map((labelName) => (_jsxs("button", { type: "button", className: "tag-selector", onClick: () => addExistingLabel(labelName), children: ["+ ", labelName] }, labelName)))) : (_jsx("span", { className: "muted-copy", children: "Todos os rotulos existentes ja estao aplicados." })) })] }), _jsxs("div", { className: "label-block", children: [_jsx("span", { className: "label-block-title", children: "Criar novo rotulo" }), _jsxs("div", { className: "label-create-row", children: [_jsx("input", { value: newLabel, onChange: (event) => setNewLabel(event.target.value), placeholder: "Ex: Cliente estrategico" }), _jsx("button", { type: "button", className: "ghost-button", onClick: addNewLabel, children: "Adicionar" })] })] }), _jsxs("label", { children: ["Observacao interna", _jsx("textarea", { rows: 5, value: internalNotes, onChange: (event) => {
                                                    setInternalNotes(event.target.value);
                                                    setSaveMessage("");
                                                }, placeholder: "Ex: cliente pede credito, esta bloqueado, e parceiro bom para reativacao, historico sensivel..." })] }), _jsxs("div", { className: "inline-actions", children: [_jsx("button", { type: "submit", className: "primary-button", disabled: saveLabelsMutation.isPending, children: saveLabelsMutation.isPending ? "Salvando..." : "Salvar rotulos e observacao" }), _jsx("span", { className: "muted-copy", children: "Para criar ou apagar r\u00F3tulos do sistema, use a tela Rotulos no menu." }), saveLabelsMutation.isError ? (_jsx("span", { className: "inline-error", children: "Nao foi possivel salvar essa classificacao." })) : null, saveMessage ? _jsx("span", { className: "save-ok", children: saveMessage }) : null] })] })] }), _jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Historico recente" }), _jsx("h3", { children: "Pedidos mais recentes" })] }) }), _jsx("div", { className: "stack-list", children: customer.recentOrders.map((order) => (_jsxs("div", { className: "history-card", children: [_jsxs("div", { children: [_jsx("strong", { children: order.orderNumber }), _jsx("p", { children: formatDate(order.orderDate) })] }), _jsxs("div", { className: "history-card-meta", children: [_jsxs("span", { children: [order.itemCount, " itens"] }), _jsx("strong", { children: formatCurrency(order.totalAmount) })] })] }, order.id))) })] })] })] }));
}
