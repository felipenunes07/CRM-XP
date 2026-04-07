import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AMBASSADOR_LABEL_NAME } from "@olist-crm/shared";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { InfoHint } from "../components/InfoHint";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatDaysSince, formatPercent, formatNumber, statusLabel } from "../lib/format";
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
            return "A previsao simples da proxima compra usa a media de dias corridos entre pedidos. Quando essa data passa e nao entra pedido novo, o cliente sobe de prioridade.";
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
    const [labelSearch, setLabelSearch] = useState("");
    const [internalNotes, setInternalNotes] = useState("");
    const [labelMessage, setLabelMessage] = useState("");
    const [notesMessage, setNotesMessage] = useState("");
    const [ambassadorMessage, setAmbassadorMessage] = useState("");
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
    const availableLabels = useMemo(() => knownLabels.filter((labelName) => {
        if (labelName === AMBASSADOR_LABEL_NAME || selectedLabels.includes(labelName)) {
            return false;
        }
        return labelName.toLowerCase().includes(labelSearch.trim().toLowerCase());
    }), [knownLabels, selectedLabels, labelSearch]);
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
            void queryClient.invalidateQueries({ queryKey: ["ambassadors"] });
            setLabelMessage("Rotulos salvos com sucesso.");
        },
    });
    const saveNotesMutation = useMutation({
        mutationFn: (input) => api.updateCustomerLabels(token, id, input),
        onSuccess: (updatedCustomer) => {
            queryClient.setQueryData(["customer", updatedCustomer.id], updatedCustomer);
            void queryClient.invalidateQueries({ queryKey: ["customers"] });
            setNotesMessage("Observacao salva com sucesso.");
        },
    });
    const ambassadorMutation = useMutation({
        mutationFn: (isAmbassador) => api.updateCustomerAmbassador(token, id, isAmbassador),
        onSuccess: (updatedCustomer) => {
            queryClient.setQueryData(["customer", updatedCustomer.id], updatedCustomer);
            void queryClient.invalidateQueries({ queryKey: ["customers"] });
            void queryClient.invalidateQueries({ queryKey: ["ambassadors"] });
            setAmbassadorMessage(updatedCustomer.isAmbassador ? "Cliente marcado como embaixador." : "Cliente removido da aba de embaixadores.");
        },
    });
    if (detailQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando ficha do cliente..." });
    }
    if (detailQuery.isError || !customer) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel carregar a ficha do cliente." });
    }
    function addExistingLabel(labelName) {
        if (selectedLabels.includes(labelName) || labelName === AMBASSADOR_LABEL_NAME) {
            return;
        }
        setSelectedLabels((current) => [...current, labelName]);
        setLabelSearch("");
        setLabelMessage("");
    }
    function addNewLabel() {
        const cleaned = newLabel.trim();
        if (!cleaned || selectedLabels.includes(cleaned)) {
            return;
        }
        if (cleaned.toLowerCase() === AMBASSADOR_LABEL_NAME.toLowerCase()) {
            setLabelMessage(`Use o botao dedicado para marcar ${AMBASSADOR_LABEL_NAME}.`);
            return;
        }
        setSelectedLabels((current) => [...current, cleaned]);
        setNewLabel("");
        setLabelMessage("");
    }
    function removeLabel(labelName) {
        if (labelName === AMBASSADOR_LABEL_NAME) {
            return;
        }
        setSelectedLabels((current) => current.filter((item) => item !== labelName));
        setLabelMessage("");
    }
    function handleSaveLabels(event) {
        event.preventDefault();
        saveLabelsMutation.mutate({
            labels: selectedLabels,
        });
    }
    function handleSaveNotes(event) {
        event.preventDefault();
        saveNotesMutation.mutate({
            internalNotes,
        });
    }
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "hero-panel", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Ficha do cliente" }), _jsx("h2", { children: customer.displayName }), _jsxs("p", { children: [customer.customerCode, " | ", statusLabel(customer.status), " | Insight principal: ", primaryInsightLabel(customer)] })] }), _jsxs("div", { className: "hero-actions", children: [customer.isAmbassador ? (_jsxs("span", { className: "tag ambassador-tag", children: [AMBASSADOR_LABEL_NAME, customer.ambassadorAssignedAt ? ` desde ${formatDate(customer.ambassadorAssignedAt)}` : ""] })) : null, _jsx("button", { type: "button", className: customer.isAmbassador ? "ghost-button" : "primary-button", disabled: ambassadorMutation.isPending, onClick: () => {
                                    setAmbassadorMessage("");
                                    ambassadorMutation.mutate(!customer.isAmbassador);
                                }, children: ambassadorMutation.isPending
                                    ? "Salvando..."
                                    : customer.isAmbassador
                                        ? "Remover de embaixadores"
                                        : "Marcar como embaixador" }), ambassadorMessage ? _jsx("span", { className: "save-ok", children: ambassadorMessage }) : null] })] }), _jsxs("section", { className: "stats-grid detail-stats-grid", children: [_jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Ultima compra" }), _jsx("strong", { children: formatDate(customer.lastPurchaseAt) })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Tempo desde a ultima compra" }), _jsx("strong", { children: formatDaysSince(customer.daysSinceLastPurchase) })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Pedidos com a gente" }), _jsx("strong", { children: customer.totalOrders })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Ticket medio" }), _jsx("strong", { children: formatCurrency(customer.avgTicket) })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Total gasto" }), _jsx("strong", { children: formatCurrency(customer.totalSpent) })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsx("span", { children: "Score de valor" }), _jsx("strong", { children: customer.valueScore.toFixed(1) })] }), _jsxs("div", { className: "panel metric-tile", children: [_jsxs("span", { className: "label-with-info", children: ["Score de prioridade", _jsx(InfoHint, { text: "Pontuacao de prioridade: 40% recencia, 25% valor do cliente, 20% queda de frequencia e 15% compra prevista vencida." })] }), _jsx("strong", { children: customer.priorityScore.toFixed(1) })] })] }), _jsxs("section", { className: "grid-two", children: [_jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Sinais analiticos" }), _jsx("h3", { children: "Leitura comercial rapida" })] }) }), _jsxs("div", { className: "detail-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Frequencia nos ultimos 90 dias" }), _jsx("strong", { children: customer.purchaseFrequency90d.toFixed(1) })] }), _jsxs("div", { children: [_jsx("span", { children: "Media entre pedidos" }), _jsx("strong", { children: customer.avgDaysBetweenOrders?.toFixed(1) ?? "Sem base" })] }), _jsxs("div", { children: [_jsx("span", { children: "Queda de frequencia" }), _jsx("strong", { children: formatPercent(customer.frequencyDropRatio) })] }), _jsxs("div", { children: [_jsx("span", { children: "Proxima compra prevista" }), _jsx("strong", { children: formatDate(customer.predictedNextPurchaseAt) })] }), _jsxs("div", { children: [_jsx("span", { children: "Atendente mais recente" }), _jsx("strong", { children: customer.lastAttendant ?? "Nao informado" })] }), _jsxs("div", { children: [_jsx("span", { children: "Status comercial" }), _jsx("strong", { children: statusLabel(customer.status) })] })] })] }), _jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Como ler os insights" }), _jsx("h3", { children: "Explicacao do que o sistema esta vendo" })] }) }), _jsx("p", { className: "panel-subcopy", children: "Para churn, o sistema compara os ultimos 90 dias com os 90 dias anteriores. Quando a queda de frequencia chega em 50% ou mais e o cliente sai da zona ativa, ele entra em risco de churn." }), _jsx("div", { className: "insight-list", children: customer.insightTags.length ? (customer.insightTags.map((tag) => (_jsxs("article", { className: "insight-card", children: [_jsx("strong", { children: insightLabels[tag] }), _jsx("p", { children: insightExplanation(tag, customer) })] }, tag)))) : (_jsxs("article", { className: "insight-card", children: [_jsx("strong", { children: "Sem alerta no momento" }), _jsx("p", { children: "O cliente nao bateu nenhum gatilho especial de prioridade ou risco agora." })] })) })] })] }), _jsxs("section", { className: "grid-two", children: [_jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Classificacao interna" }), _jsx("h3", { children: "Rotulos e observacoes do comercial" })] }) }), _jsxs("div", { className: "stack-list", children: [_jsxs("form", { className: "label-block", onSubmit: handleSaveLabels, children: [_jsx("span", { className: "label-block-title", children: "Rotulos do cliente" }), _jsx("p", { className: "panel-subcopy", children: "Adicione, remova e salve os rotulos sem misturar essa acao com as notas." }), _jsx("div", { className: "tag-row compact", children: selectedLabels.length ? (selectedLabels.map((labelName) => (_jsxs("span", { className: `tag ${labelName === AMBASSADOR_LABEL_NAME ? "ambassador-tag" : "removable-tag"}`, children: [_jsx("span", { children: labelName }), labelName !== AMBASSADOR_LABEL_NAME ? (_jsx("button", { type: "button", className: "tag-remove-button", onClick: () => removeLabel(labelName), children: "x" })) : null] }, labelName)))) : (_jsx("span", { className: "muted-copy", children: "Nenhum rotulo aplicado." })) }), _jsx("div", { className: "label-create-row", children: _jsx("input", { value: labelSearch, onChange: (event) => setLabelSearch(event.target.value), placeholder: "Buscar rotulo existente" }) }), _jsx("div", { className: "tag-row compact", children: availableLabels.length ? (availableLabels.slice(0, 12).map((labelName) => (_jsxs("button", { type: "button", className: "tag-selector", onClick: () => addExistingLabel(labelName), children: ["+ ", labelName] }, labelName)))) : (_jsx("span", { className: "muted-copy", children: "Nenhum rotulo disponivel para esse filtro." })) }), _jsxs("div", { className: "label-create-row", children: [_jsx("input", { value: newLabel, onChange: (event) => setNewLabel(event.target.value), placeholder: "Criar novo rotulo" }), _jsx("button", { type: "button", className: "ghost-button", onClick: addNewLabel, children: "Adicionar" })] }), _jsxs("div", { className: "inline-actions", children: [_jsx("button", { type: "submit", className: "primary-button", disabled: saveLabelsMutation.isPending, children: saveLabelsMutation.isPending ? "Salvando..." : "Salvar rotulos" }), saveLabelsMutation.isError ? _jsx("span", { className: "inline-error", children: "Nao foi possivel salvar os rotulos." }) : null, labelMessage ? _jsx("span", { className: "save-ok", children: labelMessage }) : null] })] }), _jsxs("form", { className: "label-block", onSubmit: handleSaveNotes, children: [_jsx("span", { className: "label-block-title", children: "Observacao interna" }), _jsx("textarea", { rows: 5, value: internalNotes, onChange: (event) => {
                                                    setInternalNotes(event.target.value);
                                                    setNotesMessage("");
                                                }, placeholder: "Ex: cliente pede credito, esta bloqueado, e parceiro bom para reativacao, historico sensivel..." }), _jsxs("div", { className: "inline-actions", children: [_jsx("button", { type: "submit", className: "ghost-button", disabled: saveNotesMutation.isPending, children: saveNotesMutation.isPending ? "Salvando..." : "Salvar observacao" }), saveNotesMutation.isError ? _jsx("span", { className: "inline-error", children: "Nao foi possivel salvar a observacao." }) : null, notesMessage ? _jsx("span", { className: "save-ok", children: notesMessage }) : null] })] })] })] }), _jsxs("article", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Mix de compra" }), _jsx("h3", { children: "Pecas que esse cliente mais compra" })] }) }), customer.topProducts.length ? (_jsx("div", { className: "top-products-list", children: customer.topProducts.map((product) => (_jsxs("article", { className: "top-product-card", children: [_jsxs("div", { className: "top-product-copy", children: [_jsx("strong", { children: product.itemDescription }), _jsx("span", { children: product.sku ? `SKU ${product.sku}` : "SKU nao informado" })] }), _jsxs("div", { className: "top-product-metrics", children: [_jsxs("span", { children: [formatNumber(product.totalQuantity), " pecas"] }), _jsxs("span", { children: [formatNumber(product.orderCount), " pedidos"] }), _jsxs("span", { children: ["Ultima compra: ", formatDate(product.lastBoughtAt)] })] })] }, `${product.sku ?? product.itemDescription}`))) })) : (_jsx("div", { className: "empty-state", children: "Ainda nao ha base suficiente para montar o mix de compra." }))] })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Historico recente" }), _jsx("h3", { children: "Pedidos mais recentes" })] }) }), _jsx("div", { className: "stack-list", children: customer.recentOrders.map((order) => (_jsxs("div", { className: "history-card", children: [_jsxs("div", { children: [_jsx("strong", { children: order.orderNumber }), _jsx("p", { children: formatDate(order.orderDate) })] }), _jsxs("div", { className: "history-card-meta", children: [_jsxs("span", { children: [order.itemCount, " itens"] }), _jsx("strong", { children: formatCurrency(order.totalAmount) })] })] }, order.id))) })] })] }));
}
