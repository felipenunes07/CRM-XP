import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatNumber } from "../lib/format";
const PAGE_SIZE = 15;
export function AgendaPage() {
    const { token } = useAuth();
    const agendaQuery = useInfiniteQuery({
        queryKey: ["agenda"],
        queryFn: ({ pageParam = 0 }) => api.agenda(token, PAGE_SIZE, pageParam),
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage.hasMore) {
                return undefined;
            }
            return allPages.reduce((total, page) => total + page.items.length, 0);
        },
        enabled: Boolean(token),
    });
    if (agendaQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Montando agenda diaria..." });
    }
    if (agendaQuery.isError || !agendaQuery.data) {
        return _jsx("div", { className: "page-error", children: "Nao foi possivel montar a agenda." });
    }
    const agendaItems = agendaQuery.data.pages.flatMap((page) => page.items);
    const totalEligible = agendaQuery.data.pages[0]?.totalEligible ?? 0;
    const highestPriorityItem = agendaItems[0];
    return (_jsx("div", { className: "page-stack", children: _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Agenda de contato" }), _jsx("h2", { children: "Fila automatica do dia" }), _jsx("p", { className: "panel-subcopy", children: "Entram clientes com recompra prevista vencida ou risco de churn, ordenados pela prioridade comercial." })] }), _jsxs("div", { className: "inline-actions", children: [_jsxs("span", { className: "agenda-metric", children: [formatNumber(totalEligible), " clientes elegiveis"] }), highestPriorityItem ? _jsxs("span", { className: "agenda-metric", children: ["Maior score: ", highestPriorityItem.priorityScore.toFixed(1)] }) : null] })] }), agendaItems.length ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "queue-list", children: agendaItems.map((item) => (_jsx(ContactQueueCard, { item: item }, item.id))) }), agendaQuery.hasNextPage ? (_jsx("div", { className: "load-more-row", children: _jsx("button", { className: "ghost-button", type: "button", onClick: () => void agendaQuery.fetchNextPage(), disabled: agendaQuery.isFetchingNextPage, children: agendaQuery.isFetchingNextPage ? "Carregando mais..." : "Carregar mais 15" }) })) : null] })) : (_jsx("div", { className: "empty-state", children: "Nenhum cliente entrou na fila automatica hoje." }))] }) }));
}
