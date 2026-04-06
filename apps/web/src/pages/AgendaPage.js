import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
export function AgendaPage() {
    const { token } = useAuth();
    const agendaQuery = useQuery({
        queryKey: ["agenda"],
        queryFn: () => api.agenda(token),
        enabled: Boolean(token),
    });
    if (agendaQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Montando agenda diaria..." });
    }
    if (agendaQuery.isError || !agendaQuery.data) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel montar a agenda." });
    }
    const highestPriorityItem = agendaQuery.data[0];
    return (_jsx("div", { className: "page-stack", children: _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Agenda de contato" }), _jsx("h2", { children: "Fila automatica do dia" }), _jsx("p", { className: "panel-subcopy", children: "A ordem considera recencia, valor do cliente, queda de frequencia e recompra atrasada." })] }), _jsxs("div", { className: "inline-actions", children: [_jsxs("span", { className: "agenda-metric", children: [agendaQuery.data.length, " clientes hoje"] }), highestPriorityItem ? _jsxs("span", { className: "agenda-metric", children: ["Maior score: ", highestPriorityItem.priorityScore.toFixed(1)] }) : null] })] }), agendaQuery.data.length ? (_jsx("div", { className: "queue-list", children: agendaQuery.data.map((item) => (_jsx(ContactQueueCard, { item: item }, item.id))) })) : (_jsx("div", { className: "empty-state", children: "Nenhum cliente entrou na fila automatica hoje." }))] }) }));
}
