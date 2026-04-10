import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ContactQueueCard } from "../components/ContactQueueCard";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatNumber } from "../lib/format";
const PAGE_SIZE = 15;
export function AgendaPage() {
    const { token } = useAuth();
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [label, setLabel] = useState("");
    const [excludeLabel, setExcludeLabel] = useState("");
    const [ambassadorOnly, setAmbassadorOnly] = useState("");
    const labelsQuery = useQuery({
        queryKey: ["customer-labels"],
        queryFn: () => api.customerLabels(token),
        enabled: Boolean(token),
    });
    const agendaQuery = useInfiniteQuery({
        queryKey: ["agenda", search, status, label, excludeLabel, ambassadorOnly],
        queryFn: ({ pageParam = 0 }) => api.agenda(token, PAGE_SIZE, pageParam, {
            search,
            status,
            labels: label,
            excludeLabels: excludeLabel,
            isAmbassador: ambassadorOnly === "true" ? true : undefined,
        }),
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
    return (_jsx("div", { className: "page-stack", children: _jsxs("section", { className: "panel", children: [_jsxs("div", { style: {
                        background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                        borderRadius: '24px',
                        padding: '2rem',
                        color: 'white',
                        marginBottom: '1.5rem',
                        boxShadow: 'var(--shadow)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '1.5rem',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }, children: [_jsxs("div", { style: { maxWidth: '600px' }, children: [_jsx("p", { style: { color: 'rgba(255,255,255,0.85)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, margin: '0 0 0.5rem 0' }, children: "Agenda de Contato" }), _jsx("h2", { style: { fontSize: '2rem', fontWeight: 800, margin: '0 0 0.5rem 0', color: 'white', letterSpacing: '-0.03em' }, children: "Fila automatica do dia" }), _jsx("p", { style: { color: 'rgba(255,255,255,0.9)', margin: 0, lineHeight: 1.5, fontSize: '0.95rem' }, children: "Entram clientes com recompra prevista vencida ou risco de churn, ordenados pela prioridade comercial." })] }), _jsxs("div", { style: { display: 'flex', gap: '1rem', flexWrap: 'wrap' }, children: [_jsxs("div", { style: {
                                        background: 'rgba(255,255,255,0.15)',
                                        backdropFilter: 'blur(12px)',
                                        padding: '1rem 1.5rem',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        textAlign: 'center',
                                        minWidth: '130px'
                                    }, children: [_jsx("p", { style: { margin: '0 0 0.25rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }, children: "Elegiveis na Fila" }), _jsx("span", { style: { fontSize: '2rem', fontWeight: 800, color: 'white', lineHeight: 1 }, children: formatNumber(totalEligible) })] }), highestPriorityItem ? (_jsxs("div", { style: {
                                        background: 'rgba(255,255,255,0.15)',
                                        backdropFilter: 'blur(12px)',
                                        padding: '1rem 1.5rem',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        textAlign: 'center',
                                        minWidth: '130px'
                                    }, children: [_jsx("p", { style: { margin: '0 0 0.25rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }, children: "Maior Score \uD83D\uDD25" }), _jsx("span", { style: { fontSize: '2rem', fontWeight: 800, color: '#fef08a', lineHeight: 1 }, children: highestPriorityItem.priorityScore.toFixed(1) })] })) : null] })] }), _jsxs("div", { style: {
                        background: 'rgba(41, 86, 215, 0.04)',
                        border: '1px solid var(--line)',
                        padding: '1.25rem',
                        borderRadius: '16px',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        gap: '1rem',
                        alignItems: 'flex-start'
                    }, children: [_jsx("div", { style: {
                                background: 'white',
                                borderRadius: '10px',
                                padding: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 4px 12px rgba(41,86,215,0.08)'
                            }, children: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "var(--accent)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("line", { x1: "12", y1: "16", x2: "12", y2: "12" }), _jsx("line", { x1: "12", y1: "8", x2: "12.01", y2: "8" })] }) }), _jsxs("div", { children: [_jsx("h4", { style: { margin: '0 0 0.35rem', color: 'var(--text)', fontSize: '0.95rem', fontWeight: 600 }, children: "Entendendo o Score (Priority Score)" }), _jsxs("p", { style: { margin: 0, color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.5 }, children: ["O ", _jsx("strong", { children: "Score de Prioridade" }), " varia de ", _jsx("strong", { children: "0 a 100" }), " e sugere quem deve ser contatado com maior urgencia. Nossa IA calcula essa nota priorizando clientes de alto valor (bom historico ou recorrencia) que estao sumindo (risco de churn) ou com a data media de recompra atrasada. Quanto mais alto, mais estrategico e fecha-lo hoje!"] })] })] }), _jsxs("div", { style: {
                        background: 'white',
                        borderRadius: '16px',
                        padding: '1.25rem',
                        border: '1px solid var(--line)',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem'
                    }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }, children: [_jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "var(--muted)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polygon", { points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" }) }), _jsx("h4", { style: { margin: 0, fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }, children: "Filtros" })] }), _jsxs("div", { style: {
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: '1rem'
                            }, children: [_jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }, children: ["Buscar cliente", _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: "Nome ou codigo...", style: { padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg-soft)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s' } })] }), _jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }, children: ["Status", _jsxs("select", { value: status, onChange: (event) => setStatus(event.target.value), style: { padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg-soft)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s', cursor: 'pointer' }, children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "ACTIVE", children: "Ativos" }), _jsx("option", { value: "ATTENTION", children: "Atencao" }), _jsx("option", { value: "INACTIVE", children: "Inativos" })] })] }), _jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }, children: ["R\u00F3tulo principal", _jsxs("select", { value: label, onChange: (event) => setLabel(event.target.value), style: { padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg-soft)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s', cursor: 'pointer' }, children: [_jsx("option", { value: "", children: "Qualquer rotulo" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }, children: ["Excluir r\u00F3tulo", _jsxs("select", { value: excludeLabel, onChange: (event) => setExcludeLabel(event.target.value), style: { padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg-soft)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s', cursor: 'pointer' }, children: [_jsx("option", { value: "", children: "Nenhum (nao excluir)" }), labelsQuery.data?.map((item) => (_jsx("option", { value: item.name, children: item.name }, item.id)))] })] }), _jsxs("label", { style: { display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }, children: ["Embaixador", _jsxs("select", { value: ambassadorOnly, onChange: (event) => setAmbassadorOnly(event.target.value), style: { padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg-soft)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s', cursor: 'pointer' }, children: [_jsx("option", { value: "", children: "Mostrar todos" }), _jsx("option", { value: "true", children: "Somente parceiros" })] })] })] })] }), agendaItems.length ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "queue-list", children: agendaItems.map((item) => (_jsx(ContactQueueCard, { item: item }, item.id))) }), agendaQuery.hasNextPage ? (_jsx("div", { className: "load-more-row", children: _jsx("button", { className: "ghost-button", type: "button", onClick: () => void agendaQuery.fetchNextPage(), disabled: agendaQuery.isFetchingNextPage, children: agendaQuery.isFetchingNextPage ? "Carregando mais..." : "Carregar mais 15" }) })) : null] })) : (_jsx("div", { className: "empty-state", children: "Nenhum cliente entrou na fila automatica hoje." }))] }) }));
}
