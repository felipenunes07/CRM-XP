import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, BarChart3, Clock3, Download, MessageCircle, RefreshCw, Smartphone, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
const windowOptions = [1, 7, 14, 30];
const tabs = [
    { id: "overview", label: "Visao geral" },
    { id: "conversations", label: "Conversas" },
    { id: "agents", label: "Agentes" },
];
const EMPTY_SUMMARY = {
    attendedConversations: 0,
    attendedGroups: 0,
    attendedPrivates: 0,
    customerGroups: 0,
    internalGroups: 0,
    otherGroups: 0,
    sentMessages: 0,
    sentMessagesPrivate: 0,
    sentMessagesGroup: 0,
    receivedMessages: 0,
    receivedMessagesPrivate: 0,
    receivedMessagesGroup: 0,
    responseCount: 0,
    averageFirstResponseSeconds: null,
};
function formatNumber(value) {
    return new Intl.NumberFormat("pt-BR").format(value);
}
function formatSeconds(value) {
    if (value === null || !Number.isFinite(value)) {
        return "--";
    }
    if (value < 60) {
        return `${Math.round(value)} Sec`;
    }
    const minutes = Math.floor(value / 60);
    const seconds = Math.round(value % 60);
    if (minutes < 60) {
        return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
}
function initials(name) {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
}
function calculateGrowth(current, previous) {
    if (previous === null || previous === undefined || previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
}
function GrowthIndicator({ current, previous, inverse = false }) {
    const growth = calculateGrowth(current, previous);
    if (growth === 0)
        return null;
    const isPositive = growth > 0;
    const isGood = inverse ? !isPositive : isPositive;
    const Icon = isPositive ? ArrowUp : ArrowDown;
    return (_jsxs("div", { className: `activity-growth-badge ${isGood ? "positive" : "negative"}`, children: [_jsx(Icon, { size: 12 }), _jsxs("span", { children: [Math.abs(Math.round(growth)), "%"] })] }));
}
function formatPhone(value) {
    if (!value) {
        return "Sem telefone";
    }
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length >= 12) {
        const area = digits.slice(2, 4);
        const number = digits.slice(4);
        const prefix = number.length > 8 ? number.slice(0, 5) : number.slice(0, 4);
        const suffix = number.length > 8 ? number.slice(5) : number.slice(4);
        return `+55 (${area}) ${prefix}-${suffix}`;
    }
    return digits || value;
}
function shortWeekday(value) {
    return value.replace("-feira", "").slice(0, 3);
}
function mergeConversations(conversations) {
    const merged = new Map();
    for (const conversation of conversations) {
        const current = merged.get(conversation.remoteJid) ??
            {
                ...conversation,
                sentMessages: 0,
                receivedMessages: 0,
            };
        current.name = current.name || conversation.name;
        current.kind = current.kind === "internal_group" ? current.kind : conversation.kind;
        current.sentMessages += conversation.sentMessages;
        current.receivedMessages += conversation.receivedMessages;
        merged.set(conversation.remoteJid, current);
    }
    return Array.from(merged.values()).sort((left, right) => right.sentMessages - left.sentMessages || left.name.localeCompare(right.name));
}
function summarizeCells(cells) {
    const conversations = mergeConversations(cells.flatMap((cell) => cell.conversations));
    const responseSecondsTotal = cells.reduce((sum, cell) => sum + (cell.averageFirstResponseSeconds ?? 0) * cell.responseCount, 0);
    const responseCount = cells.reduce((sum, cell) => sum + cell.responseCount, 0);
    const sentMessages = cells.reduce((sum, cell) => sum + cell.sentMessages, 0);
    const receivedMessages = cells.reduce((sum, cell) => sum + cell.receivedMessages, 0);
    const attended = conversations.filter((conversation) => conversation.sentMessages > 0 && conversation.receivedMessages > 0);
    const attendedGroups = attended.filter((conversation) => conversation.kind === "customer_group" || conversation.kind === "other_group");
    const customerGroups = attended.filter((conversation) => conversation.kind === "customer_group");
    const internalGroups = attended.filter((conversation) => conversation.kind === "internal_group");
    const otherGroups = attended.filter((conversation) => conversation.kind === "other_group");
    const privates = attended.filter((conversation) => conversation.kind === "private");
    return {
        attendedConversations: attendedGroups.length + privates.length,
        attendedGroups: attendedGroups.length,
        attendedPrivates: privates.length,
        customerGroups: customerGroups.length,
        internalGroups: internalGroups.length,
        otherGroups: otherGroups.length,
        sentMessages,
        sentMessagesPrivate: cells.reduce((sum, cell) => sum + (cell.sentMessagesPrivate || 0), 0),
        sentMessagesGroup: cells.reduce((sum, cell) => sum + (cell.sentMessagesGroup || 0), 0),
        receivedMessages,
        receivedMessagesPrivate: cells.reduce((sum, cell) => sum + (cell.receivedMessagesPrivate || 0), 0),
        receivedMessagesGroup: cells.reduce((sum, cell) => sum + (cell.receivedMessagesGroup || 0), 0),
        responseCount,
        averageFirstResponseSeconds: responseCount ? responseSecondsTotal / responseCount : null,
        conversations,
    };
}
function buildDailySeries(report, cells) {
    return report.days.map((day) => {
        const summary = summarizeCells(cells.filter((cell) => cell.date === day.date));
        return {
            date: day.date,
            label: day.label,
            attendedConversations: summary.attendedConversations,
            attendedGroups: summary.attendedGroups,
            attendedPrivates: summary.attendedPrivates,
            sentMessages: summary.sentMessages,
            sentMessagesPrivate: summary.sentMessagesPrivate,
            sentMessagesGroup: summary.sentMessagesGroup,
            receivedMessages: summary.receivedMessages,
            receivedMessagesPrivate: summary.receivedMessagesPrivate,
            receivedMessagesGroup: summary.receivedMessagesGroup,
            averageFirstResponseSeconds: summary.averageFirstResponseSeconds,
        };
    });
}
function heatLevel(value, max) {
    if (!value)
        return 0;
    const ratio = value / Math.max(1, max);
    if (ratio >= 0.8)
        return 5;
    if (ratio >= 0.6)
        return 4;
    if (ratio >= 0.4)
        return 3;
    if (ratio >= 0.2)
        return 2;
    return 1;
}
function conversationKindLabel(kind) {
    if (kind === "private")
        return "Privado";
    if (kind === "customer_group")
        return "Grupo cliente";
    if (kind === "internal_group")
        return "Grupo interno";
    return "Grupo nao classificado";
}
function chartTicks(value) {
    return typeof value === "number" ? formatNumber(value) : value;
}
function responseTick(value) {
    return typeof value === "number" ? formatSeconds(value) : value;
}
function downloadReportCsv(report, agentLabel, data) {
    const header = [
        "Periodo",
        "Filtro",
        "Data",
        "Conversas atendidas",
        "Grupos atendidos",
        "Privados atendidos",
        "Mensagens enviadas",
        "Mensagens recebidas",
        "Tempo medio primeira resposta",
    ];
    const rows = data.map((item) => [
        `${report.period.startDate} ate ${report.period.endDate}`,
        agentLabel,
        item.date,
        String(item.attendedConversations),
        String(item.attendedGroups),
        String(item.attendedPrivates),
        String(item.sentMessages),
        String(item.receivedMessages),
        formatSeconds(item.averageFirstResponseSeconds),
    ]);
    const csv = [header, ...rows]
        .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","))
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `relatorio-whatsapp-${report.period.startDate}-${report.period.endDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
}
function ActivityChart({ title, value, dataKey, data, response, growth, }) {
    return (_jsxs("div", { className: "activity-chart-tile", children: [_jsxs("div", { className: "activity-chart-header", children: [_jsxs("div", { children: [_jsx("span", { children: title }), _jsx("strong", { children: value })] }), growth !== undefined && growth !== null && (_jsxs("div", { className: `activity-growth-pill ${growth >= 0 ? "positive" : "negative"}`, children: [growth >= 0 ? _jsx(TrendingUp, { size: 14 }) : _jsx(TrendingDown, { size: 14 }), Math.abs(Math.round(growth)), "%"] }))] }), _jsx(ResponsiveContainer, { width: "100%", height: 230, children: _jsxs(BarChart, { data: data, margin: { top: 18, right: 18, left: 0, bottom: 8 }, children: [_jsx(CartesianGrid, { stroke: "#edf0f5", vertical: false }), _jsx(XAxis, { dataKey: "label", tickLine: false, axisLine: { stroke: "#d8dde7" }, tick: { fontSize: 12 } }), _jsx(YAxis, { allowDecimals: false, tickLine: false, axisLine: { stroke: "#d8dde7" }, tickFormatter: response ? responseTick : chartTicks, tick: { fontSize: 12 }, width: response ? 48 : 32 }), _jsx(Tooltip, { formatter: (tooltipValue) => response ? formatSeconds(Number(tooltipValue ?? 0)) : formatNumber(Number(tooltipValue ?? 0)), labelFormatter: (label) => String(label), cursor: { fill: "#f1f4f9" } }), _jsx(Bar, { dataKey: dataKey, fill: "#287ee7", radius: [4, 4, 0, 0], maxBarSize: 40 })] }) })] }));
}
export function WhatsappActivityPage() {
    const { token } = useAuth();
    const [days, setDays] = useState(7);
    const [selectedAgentId, setSelectedAgentId] = useState("all");
    const [activeTab, setActiveTab] = useState("overview");
    const [selectedCellKey, setSelectedCellKey] = useState(null);
    const [showHeatmapNumbers, setShowHeatmapNumbers] = useState(true);
    const [heatmapMetric, setHeatmapMetric] = useState("total");
    const [typeFilter, setTypeFilter] = useState("all");
    const reportQuery = useQuery({
        queryKey: ["whatsapp-agent-activity-report", days],
        queryFn: () => api.whatsappAgentActivityReport(token, { days }),
        enabled: Boolean(token),
        refetchInterval: 60000,
        refetchOnWindowFocus: true,
    });
    const report = reportQuery.data;
    const selectedAgent = report?.agents.find((agent) => agent.agentId === selectedAgentId) ?? null;
    const visibleCells = useMemo(() => {
        if (!report)
            return [];
        if (selectedAgentId === "all")
            return report.hourlyCells;
        return report.hourlyCells.filter((cell) => cell.agentId === selectedAgentId);
    }, [report, selectedAgentId]);
    const visibleSummary = useMemo(() => {
        if (!report)
            return { ...EMPTY_SUMMARY, conversations: [] };
        const summary = selectedAgentId === "all"
            ? { ...report.summary, conversations: summarizeCells(report.hourlyCells).conversations }
            : summarizeCells(visibleCells);
        if (typeFilter === "all")
            return summary;
        return {
            ...summary,
            attendedConversations: typeFilter === "private" ? summary.attendedPrivates : summary.attendedGroups,
            attendedGroups: typeFilter === "private" ? 0 : summary.attendedGroups,
            attendedPrivates: typeFilter === "group" ? 0 : summary.attendedPrivates,
            customerGroups: typeFilter === "private" ? 0 : summary.customerGroups,
            internalGroups: typeFilter === "private" ? 0 : summary.internalGroups,
            otherGroups: typeFilter === "private" ? 0 : summary.otherGroups,
            sentMessages: typeFilter === "private" ? summary.sentMessagesPrivate : summary.sentMessagesGroup,
            receivedMessages: typeFilter === "private" ? summary.receivedMessagesPrivate : summary.receivedMessagesGroup,
        };
    }, [report, selectedAgentId, visibleCells, typeFilter]);
    const dailySeries = useMemo(() => {
        if (!report)
            return [];
        const series = selectedAgentId === "all" ? report.dailySeries : buildDailySeries(report, visibleCells);
        if (typeFilter === "all")
            return series;
        return series.map((item) => ({
            ...item,
            attendedConversations: typeFilter === "private" ? item.attendedPrivates : item.attendedGroups,
            attendedGroups: typeFilter === "private" ? 0 : item.attendedGroups,
            attendedPrivates: typeFilter === "group" ? 0 : item.attendedPrivates,
            sentMessages: typeFilter === "private" ? item.sentMessagesPrivate : item.sentMessagesGroup,
            receivedMessages: typeFilter === "private" ? item.receivedMessagesPrivate : item.receivedMessagesGroup,
        }));
    }, [report, selectedAgentId, visibleCells, typeFilter]);
    const cellsBySlot = useMemo(() => {
        const map = new Map();
        for (const cell of visibleCells) {
            const key = `${cell.date}:${cell.hour}`;
            map.set(key, [...(map.get(key) ?? []), cell]);
        }
        return map;
    }, [visibleCells]);
    const cellMap = useMemo(() => {
        const map = new Map();
        if (!report)
            return map;
        for (const day of report.days) {
            for (const hour of report.hours) {
                const key = `${day.date}:${hour}`;
                map.set(key, summarizeCells(cellsBySlot.get(key) ?? []));
            }
        }
        return map;
    }, [report, cellsBySlot]);
    const maxCellValue = useMemo(() => Math.max(1, ...Array.from(cellMap.values()).map((cell) => {
        if (heatmapMetric === "sent")
            return cell.sentMessages;
        if (heatmapMetric === "received")
            return cell.receivedMessages;
        if (heatmapMetric === "conversations")
            return cell.attendedConversations;
        return cell.sentMessages + cell.receivedMessages;
    })), [cellMap, heatmapMetric]);
    const selectedCellSummary = selectedCellKey ? cellMap.get(selectedCellKey) ?? null : null;
    const selectedCellRows = selectedCellKey ? cellsBySlot.get(selectedCellKey) ?? [] : null;
    const growthMetrics = useMemo(() => {
        if (!report?.previousSummary)
            return null;
        const s = report.summary;
        const p = report.previousSummary;
        return {
            attendedConversations: calculateGrowth(s.attendedConversations, p.attendedConversations),
            receivedMessages: calculateGrowth(s.receivedMessages, p.receivedMessages),
            sentMessages: calculateGrowth(s.sentMessages, p.sentMessages),
            averageFirstResponseSeconds: calculateGrowth(s.averageFirstResponseSeconds ?? 0, p.averageFirstResponseSeconds ?? 0),
            attendedGroups: calculateGrowth(s.attendedGroups, p.attendedGroups),
            attendedPrivates: calculateGrowth(s.attendedPrivates, p.attendedPrivates),
            activeAgents: calculateGrowth(s.activeAgents, p.activeAgents),
        };
    }, [report]);
    const cards = [
        {
            key: "conversations",
            label: "Conversas atendidas",
            value: visibleSummary.attendedConversations,
            previous: selectedAgentId === "all" ? report?.previousSummary?.attendedConversations : undefined,
            detail: "Privados e grupos de clientes",
            icon: MessageCircle,
        },
        {
            key: "groups",
            label: "Grupos atendidos",
            value: visibleSummary.attendedGroups,
            previous: selectedAgentId === "all" ? report?.previousSummary?.attendedGroups : undefined,
            detail: `${formatNumber(visibleSummary.otherGroups)} nao classificados`,
            icon: Users,
        },
        {
            key: "private",
            label: "Privados atendidos",
            value: visibleSummary.attendedPrivates,
            previous: selectedAgentId === "all" ? report?.previousSummary?.attendedPrivates : undefined,
            detail: "Conversas individuais",
            icon: Smartphone,
        },
        {
            key: "responses",
            label: "Mensagens enviadas",
            value: visibleSummary.sentMessages,
            previous: selectedAgentId === "all" ? report?.previousSummary?.sentMessages : undefined,
            detail: "Total de respostas enviadas",
            icon: BarChart3,
        },
        {
            key: "received",
            label: "Mensagens recebidas",
            value: visibleSummary.receivedMessages,
            previous: selectedAgentId === "all" ? report?.previousSummary?.receivedMessages : undefined,
            detail: "Total de mensagens de entrada",
            icon: Clock3, // Using Clock3 for now, maybe MessageSquare or something else?
        },
    ];
    useEffect(() => {
        if (!report || selectedAgentId === "all")
            return;
        if (!report.agents.some((agent) => agent.agentId === selectedAgentId)) {
            setSelectedAgentId("all");
        }
    }, [report, selectedAgentId]);
    useEffect(() => {
        setSelectedCellKey(null);
    }, [selectedAgentId, days]);
    if (reportQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando relatorios..." });
    }
    if (reportQuery.isError || !report) {
        return (_jsxs("div", { className: "whatsapp-activity-page", children: [_jsxs("div", { className: "activity-report-header", children: [_jsxs("div", { children: [_jsx("h1", { children: "Relatorios WhatsApp" }), _jsx("span", { children: "Visao geral, conversas e agentes" })] }), _jsxs("button", { type: "button", className: "activity-primary-button", onClick: () => reportQuery.refetch(), children: [_jsx(RefreshCw, { size: 16 }), "Tentar novamente"] })] }), _jsx("div", { className: "activity-empty", children: "Nao foi possivel carregar o relatorio agora." })] }));
    }
    return (_jsxs("div", { className: "whatsapp-activity-page", children: [_jsxs("div", { className: "activity-report-header", children: [_jsxs("div", { children: [_jsx("h1", { children: activeTab === "overview" ? "Visao geral" : activeTab === "conversations" ? "Conversas" : "Visao Geral de Agentes" }), _jsx("span", { children: activeTab === "agents"
                                    ? "Acompanhe desempenho por agente e clique em uma vendedora para filtrar."
                                    : "Acompanhe o atendimento por hora, agente e tipo de conversa." })] }), _jsxs("div", { className: "activity-actions", children: [_jsxs("button", { type: "button", className: "activity-primary-button", onClick: () => downloadReportCsv(report, selectedAgent?.agentName ?? "Todos os agentes", dailySeries), children: [_jsx(Download, { size: 16 }), "Baixar relatorios de agentes"] }), _jsx("label", { className: "activity-select", children: _jsx("select", { value: days, onChange: (event) => setDays(Number(event.target.value)), children: windowOptions.map((option) => (_jsx("option", { value: option, children: option === 1 ? "Hoje" : `Ultimos ${option} dias` }, option))) }) }), _jsx("label", { className: "activity-select", children: _jsxs("select", { value: selectedAgentId, onChange: (event) => setSelectedAgentId(event.target.value), children: [_jsx("option", { value: "all", children: "Todos os agentes" }), report.agents.map((agent) => (_jsx("option", { value: agent.agentId, children: agent.agentName }, agent.agentId)))] }) }), _jsxs("div", { className: "activity-heatmap-toggles", children: [_jsx("button", { type: "button", className: typeFilter === "all" ? "active" : "", onClick: () => setTypeFilter("all"), children: "Todas" }), _jsx("button", { type: "button", className: typeFilter === "private" ? "active" : "", onClick: () => setTypeFilter("private"), children: "Privado" }), _jsx("button", { type: "button", className: typeFilter === "group" ? "active" : "", onClick: () => setTypeFilter("group"), children: "Grupos" })] }), _jsx("button", { type: "button", className: "activity-icon-button", onClick: () => reportQuery.refetch(), title: "Atualizar", children: _jsx(RefreshCw, { size: 17 }) })] })] }), _jsx("div", { className: "activity-tabs", role: "tablist", "aria-label": "Relatorios WhatsApp", children: tabs.map((tab) => (_jsx("button", { type: "button", className: activeTab === tab.id ? "active" : "", onClick: () => setActiveTab(tab.id), children: tab.label }, tab.id))) }), activeTab === "overview" ? (_jsxs(_Fragment, { children: [_jsx("section", { className: "activity-metric-grid", children: cards.map(({ key, label, value, previous, detail, icon: Icon, isTime, inverse }) => (_jsxs("div", { className: "activity-metric-card", children: [_jsx("div", { className: "activity-metric-icon", children: _jsx(Icon, { size: 18 }) }), _jsx("span", { children: label }), _jsxs("div", { className: "activity-metric-value", children: [_jsx("strong", { children: isTime ? formatSeconds(value) : formatNumber(value) }), _jsx(GrowthIndicator, { current: typeof value === "number" ? value : 0, previous: previous, inverse: inverse })] }), _jsx("small", { children: detail })] }, key))) }), _jsxs("section", { className: "activity-panel heatmap-panel", children: [_jsxs("div", { className: "activity-panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Trafego de conversa" }), _jsxs("span", { children: [selectedAgent ? selectedAgent.agentName : "Todos os agentes", " - grupos unicos e privados atendidos"] })] }), _jsxs("div", { className: "activity-heatmap-controls", children: [_jsxs("div", { className: "activity-heatmap-toggles", children: [_jsx("button", { type: "button", className: !showHeatmapNumbers ? "active" : "", onClick: () => setShowHeatmapNumbers(false), children: "Cor" }), _jsx("button", { type: "button", className: showHeatmapNumbers ? "active" : "", onClick: () => setShowHeatmapNumbers(true), children: "Numero" })] }), _jsxs("div", { className: "activity-heatmap-toggles", children: [_jsx("button", { type: "button", className: heatmapMetric === "total" ? "active" : "", onClick: () => setHeatmapMetric("total"), children: "Total" }), _jsx("button", { type: "button", className: heatmapMetric === "sent" ? "active" : "", onClick: () => setHeatmapMetric("sent"), children: "Enviada" }), _jsx("button", { type: "button", className: heatmapMetric === "received" ? "active" : "", onClick: () => setHeatmapMetric("received"), children: "Recebida" }), _jsx("button", { type: "button", className: heatmapMetric === "conversations" ? "active" : "", onClick: () => setHeatmapMetric("conversations"), children: "Conversas" })] }), _jsx("div", { className: "activity-live-chip", children: "Em tempo real" })] })] }), _jsx("div", { className: "activity-heatmap-wrap", children: _jsxs("div", { className: "activity-heatmap", children: [_jsx("div", { className: "activity-heatmap-corner" }), report.hours.map((hour) => (_jsx("div", { className: "activity-hour-label", children: hour }, hour))), report.days.map((day) => (_jsxs("div", { className: "activity-day-row", children: [_jsxs("div", { className: "activity-day-label", children: [_jsx("strong", { children: shortWeekday(day.weekday) }), _jsx("span", { children: day.label })] }), report.hours.map((hour) => {
                                                    const key = `${day.date}:${hour}`;
                                                    const cell = cellMap.get(key) ?? { ...EMPTY_SUMMARY, conversations: [] };
                                                    const value = (() => {
                                                        if (typeFilter === "private") {
                                                            if (heatmapMetric === "sent")
                                                                return cell.sentMessagesPrivate;
                                                            if (heatmapMetric === "received")
                                                                return cell.receivedMessagesPrivate;
                                                            if (heatmapMetric === "conversations")
                                                                return cell.attendedPrivates;
                                                            return (cell.sentMessagesPrivate || 0) + (cell.receivedMessagesPrivate || 0);
                                                        }
                                                        if (typeFilter === "group") {
                                                            if (heatmapMetric === "sent")
                                                                return cell.sentMessagesGroup;
                                                            if (heatmapMetric === "received")
                                                                return cell.receivedMessagesGroup;
                                                            if (heatmapMetric === "conversations")
                                                                return cell.attendedGroups;
                                                            return (cell.sentMessagesGroup || 0) + (cell.receivedMessagesGroup || 0);
                                                        }
                                                        if (heatmapMetric === "sent")
                                                            return cell.sentMessages;
                                                        if (heatmapMetric === "received")
                                                            return cell.receivedMessages;
                                                        if (heatmapMetric === "conversations")
                                                            return cell.attendedConversations;
                                                        return cell.sentMessages + cell.receivedMessages;
                                                    })();
                                                    const level = heatLevel(value, maxCellValue);
                                                    const title = `${day.label} ${String(hour).padStart(2, "0")}h - ${cell.attendedConversations} conversas, ${cell.sentMessages} respostas, ${cell.receivedMessages} recebidas`;
                                                    return (_jsx("button", { type: "button", className: `activity-heat-cell level-${level} ${selectedCellKey === key ? "selected" : ""}`, title: title, onClick: () => setSelectedCellKey(key), children: value && showHeatmapNumbers ? value : "" }, key));
                                                })] }, day.date)))] }) })] }), _jsxs("section", { className: "activity-detail-grid", children: [_jsxs("div", { className: "activity-panel", children: [_jsx("div", { className: "activity-panel-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Detalhe do horario" }), _jsx("span", { children: selectedCellKey ? selectedCellKey.replace(":", " - ") : "Clique em um quadrado do mapa" })] }) }), selectedCellSummary ? (_jsxs("div", { className: "activity-cell-detail", children: [_jsxs("div", { className: "activity-cell-stats", children: [_jsxs("span", { children: [_jsx("strong", { children: formatNumber(selectedCellSummary.attendedGroups) }), "grupos"] }), _jsxs("span", { children: [_jsx("strong", { children: formatNumber(selectedCellSummary.attendedPrivates) }), "privados"] }), _jsxs("span", { children: [_jsx("strong", { children: formatNumber(selectedCellSummary.sentMessages) }), "respostas"] })] }), _jsxs("div", { className: "activity-detail-columns", children: [_jsxs("div", { children: [_jsx("h3", { children: "Agentes ativos" }), (selectedCellRows ?? []).filter((cell) => cell.sentMessages > 0).length ? ((selectedCellRows ?? [])
                                                                .filter((cell) => cell.sentMessages > 0)
                                                                .sort((left, right) => right.sentMessages - left.sentMessages)
                                                                .map((cell) => (_jsxs("button", { type: "button", className: "activity-detail-row", onClick: () => setSelectedAgentId(cell.agentId), children: [_jsx("span", { children: cell.agentName }), _jsx("strong", { children: formatNumber(cell.sentMessages) })] }, `${cell.agentId}-${cell.date}-${cell.hour}`)))) : (_jsx("p", { children: "Nenhuma resposta nesse horario." }))] }), _jsxs("div", { children: [_jsx("h3", { children: "Conversas" }), (() => {
                                                                const filtered = selectedCellSummary.conversations.filter((c) => {
                                                                    if (typeFilter === "private")
                                                                        return c.kind === "private";
                                                                    if (typeFilter === "group")
                                                                        return c.kind !== "private";
                                                                    return true;
                                                                }).filter((c) => c.sentMessages > 0);
                                                                if (!filtered.length) {
                                                                    return _jsx("p", { children: "Nenhuma conversa atendida nesse horario." });
                                                                }
                                                                return filtered.slice(0, 8).map((conversation) => (_jsxs("div", { className: "activity-detail-row static", children: [_jsxs("span", { children: [conversation.name, _jsx("small", { children: conversationKindLabel(conversation.kind) })] }), _jsx("strong", { children: formatNumber(conversation.sentMessages) })] }, conversation.remoteJid)));
                                                            })()] })] })] })) : (_jsx("div", { className: "activity-empty", children: "Selecione uma celula para ver agentes, grupos e privados atendidos." }))] }), _jsxs("div", { className: "activity-panel", children: [_jsx("div", { className: "activity-panel-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Conversas por agentes" }), _jsx("span", { children: "Clique para filtrar o mapa" })] }) }), _jsx("div", { className: "activity-agent-list", children: report.agents.slice(0, 6).map((agent) => (_jsxs("button", { type: "button", className: `activity-agent-list-row ${selectedAgentId === agent.agentId ? "selected" : ""}`, onClick: () => setSelectedAgentId(agent.agentId), children: [_jsx("span", { className: "activity-avatar", children: initials(agent.agentName) || "WA" }), _jsxs("span", { children: [_jsx("strong", { children: agent.agentName }), _jsx("small", { children: formatPhone(agent.phoneNumber) })] }), _jsx("em", { children: formatNumber(agent.attendedConversations) })] }, agent.agentId))) })] })] })] })) : null, activeTab === "conversations" ? (_jsxs("section", { className: "activity-panel activity-chart-panel", children: [_jsx(ActivityChart, { title: "Conversas", value: formatNumber(visibleSummary.attendedConversations), dataKey: "attendedConversations", data: dailySeries, growth: selectedAgentId === "all" ? growthMetrics?.attendedConversations : null }), _jsx(ActivityChart, { title: "Mensagens Recebidas", value: formatNumber(visibleSummary.receivedMessages), dataKey: "receivedMessages", data: dailySeries, growth: selectedAgentId === "all" ? growthMetrics?.receivedMessages : null }), _jsx(ActivityChart, { title: "Mensagens enviadas", value: formatNumber(visibleSummary.sentMessages), dataKey: "sentMessages", data: dailySeries, growth: selectedAgentId === "all" ? growthMetrics?.sentMessages : null }), _jsx(ActivityChart, { title: "Tempo de Primeira Resposta", value: formatSeconds(visibleSummary.averageFirstResponseSeconds), dataKey: "averageFirstResponseSeconds", data: dailySeries, response: true, growth: selectedAgentId === "all" ? growthMetrics?.averageFirstResponseSeconds : null })] })) : null, activeTab === "agents" ? (_jsx("section", { className: "activity-panel", children: _jsx("div", { className: "activity-table-wrap", children: _jsxs("table", { className: "activity-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Agente" }), _jsx("th", { children: "N de Conversas" }), _jsx("th", { children: "Grupos atendidos" }), _jsx("th", { children: "Privados" }), _jsx("th", { children: "Mensagens enviadas" }), _jsx("th", { children: "Mensagens recebidas" }), _jsx("th", { children: "Tempo medio de primeira resposta" })] }) }), _jsx("tbody", { children: report.agents.length ? (report.agents.map((agent) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("button", { type: "button", className: "activity-agent-button", onClick: () => {
                                                    setSelectedAgentId(agent.agentId);
                                                    setActiveTab("overview");
                                                }, children: [_jsx("span", { className: "activity-avatar", children: initials(agent.agentName) || "WA" }), _jsxs("span", { children: [_jsx("strong", { children: agent.agentName }), _jsx("small", { children: formatPhone(agent.phoneNumber) })] })] }) }), _jsx("td", { children: formatNumber(agent.attendedConversations) }), _jsx("td", { children: formatNumber(agent.attendedGroups) }), _jsx("td", { children: formatNumber(agent.attendedPrivates) }), _jsx("td", { children: formatNumber(agent.sentMessages) }), _jsx("td", { children: formatNumber(agent.receivedMessages) }), _jsx("td", { children: formatSeconds(agent.averageFirstResponseSeconds) })] }, agent.agentId)))) : (_jsx("tr", { children: _jsx("td", { colSpan: 7, children: "Nao ha dados disponiveis" }) })) })] }) }) })) : null] }));
}
