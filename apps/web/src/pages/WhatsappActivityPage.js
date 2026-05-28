import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, BarChart3, Clock3, Download, MessageCircle, RefreshCw, Smartphone, TrendingDown, TrendingUp, Users, UserCheck, Calendar, Copy, Check, ChevronDown, ChevronUp, Award, DollarSign, Package } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
const windowOptions = [1, 7, 14, 30];
const tabs = [
    { id: "overview", label: "Visao geral" },
    { id: "conversations", label: "Conversas" },
    { id: "agents", label: "Agentes" },
    { id: "daily-summary", label: "Resumo do Dia" },
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
    receivedUniqueMessages: 0,
    receivedUniqueMessagesPrivate: 0,
    receivedUniqueMessagesGroup: 0,
    sentUniqueMessages: 0,
    sentUniqueMessagesPrivate: 0,
    sentUniqueMessagesGroup: 0,
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
        current.sentMessages = (current.sentMessages || 0) + (conversation.sentMessages || 0);
        current.receivedMessages = (current.receivedMessages || 0) + (conversation.receivedMessages || 0);
        merged.set(conversation.remoteJid, current);
    }
    return Array.from(merged.values())
        .sort((left, right) => right.sentMessages - left.sentMessages || left.name.localeCompare(right.name))
        .slice(0, 100);
}
function summarizeCells(cells) {
    const conversations = mergeConversations(cells.flatMap((cell) => cell.conversations || []));
    const responseSecondsTotal = cells.reduce((sum, cell) => sum + (cell.averageFirstResponseSeconds ?? 0) * (cell.responseCount || 0), 0);
    const responseCount = cells.reduce((sum, cell) => sum + (cell.responseCount || 0), 0);
    const sentMessages = cells.reduce((sum, cell) => sum + (cell.sentMessages || 0), 0);
    const receivedMessages = cells.reduce((sum, cell) => sum + (cell.receivedMessages || 0), 0);
    const receivedUniqueMessages = conversations.filter((c) => (c.receivedMessages || 0) > 0 && c.kind !== "internal_group").length;
    const receivedUniqueMessagesPrivate = conversations.filter((c) => c.kind === "private" && (c.receivedMessages || 0) > 0).length;
    const receivedUniqueMessagesGroup = conversations.filter((c) => (c.kind === "customer_group" || c.kind === "other_group") && (c.receivedMessages || 0) > 0).length;
    const sentUniqueMessages = conversations.filter((c) => (c.sentMessages || 0) > 0 && c.kind !== "internal_group").length;
    const sentUniqueMessagesPrivate = conversations.filter((c) => c.kind === "private" && (c.sentMessages || 0) > 0).length;
    const sentUniqueMessagesGroup = conversations.filter((c) => (c.kind === "customer_group" || c.kind === "other_group") && (c.sentMessages || 0) > 0).length;
    const attended = conversations.filter((conversation) => (conversation.sentMessages || 0) > 0 && (conversation.receivedMessages || 0) > 0);
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
        receivedUniqueMessages,
        receivedUniqueMessagesPrivate,
        receivedUniqueMessagesGroup,
        sentUniqueMessages,
        sentUniqueMessagesPrivate,
        sentUniqueMessagesGroup,
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
            receivedUniqueMessages: summary.receivedUniqueMessages,
            receivedUniqueMessagesPrivate: summary.receivedUniqueMessagesPrivate,
            receivedUniqueMessagesGroup: summary.receivedUniqueMessagesGroup,
            sentUniqueMessages: summary.sentUniqueMessages,
            sentUniqueMessagesPrivate: summary.sentUniqueMessagesPrivate,
            sentUniqueMessagesGroup: summary.sentUniqueMessagesGroup,
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
    const [isUniqueMetric, setIsUniqueMetric] = useState(false);
    const [typeFilter, setTypeFilter] = useState("all");
    const [conversationSearch, setConversationSearch] = useState("");
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
            receivedUniqueMessages: typeFilter === "private" ? summary.receivedUniqueMessagesPrivate : summary.receivedUniqueMessagesGroup,
            sentUniqueMessages: typeFilter === "private" ? (summary.sentUniqueMessagesPrivate ?? 0) : (summary.sentUniqueMessagesGroup ?? 0),
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
            receivedUniqueMessages: typeFilter === "private" ? item.receivedUniqueMessagesPrivate : item.receivedUniqueMessagesGroup,
            sentUniqueMessages: typeFilter === "private" ? (item.sentUniqueMessagesPrivate ?? 0) : (item.sentUniqueMessagesGroup ?? 0),
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
        if (typeFilter === "private") {
            if (heatmapMetric === "sent")
                return isUniqueMetric ? (cell.sentUniqueMessagesPrivate ?? 0) : cell.sentMessagesPrivate;
            if (heatmapMetric === "received")
                return isUniqueMetric ? (cell.receivedUniqueMessagesPrivate ?? 0) : cell.receivedMessagesPrivate;
            if (heatmapMetric === "conversations")
                return cell.attendedPrivates;
            return (cell.sentMessagesPrivate || 0) + (cell.receivedMessagesPrivate || 0);
        }
        if (typeFilter === "group") {
            if (heatmapMetric === "sent")
                return isUniqueMetric ? (cell.sentUniqueMessagesGroup ?? 0) : cell.sentMessagesGroup;
            if (heatmapMetric === "received")
                return isUniqueMetric ? (cell.receivedUniqueMessagesGroup ?? 0) : cell.receivedMessagesGroup;
            if (heatmapMetric === "conversations")
                return cell.attendedGroups;
            return (cell.sentMessagesGroup || 0) + (cell.receivedMessagesGroup || 0);
        }
        if (heatmapMetric === "sent")
            return isUniqueMetric ? (cell.sentUniqueMessages ?? 0) : cell.sentMessages;
        if (heatmapMetric === "received")
            return isUniqueMetric ? (cell.receivedUniqueMessages ?? 0) : cell.receivedMessages;
        if (heatmapMetric === "conversations")
            return cell.attendedConversations;
        return isUniqueMetric
            ? (cell.sentUniqueMessages ?? 0) + (cell.receivedUniqueMessages ?? 0)
            : (cell.sentMessages || 0) + (cell.receivedMessages || 0);
    })), [cellMap, heatmapMetric, typeFilter]);
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
            receivedUniqueMessages: calculateGrowth(s.receivedUniqueMessages, p.receivedUniqueMessages),
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
            value: visibleSummary.attendedPrivates || 0,
            previous: selectedAgentId === "all" ? report?.previousSummary?.attendedPrivates : undefined,
            detail: "Conversas individuais",
            icon: Smartphone,
        },
        {
            key: "responses",
            label: "Mensagens enviadas",
            value: visibleSummary.sentMessages || 0,
            previous: selectedAgentId === "all"
                ? (typeFilter === "private" ? report?.previousSummary?.sentMessagesPrivate : typeFilter === "group" ? report?.previousSummary?.sentMessagesGroup : report?.previousSummary?.sentMessages)
                : undefined,
            detail: "Total de respostas enviadas",
            icon: BarChart3,
        },
        {
            key: "received",
            label: "Mensagens recebidas",
            value: visibleSummary.receivedMessages || 0,
            previous: selectedAgentId === "all"
                ? (typeFilter === "private" ? report?.previousSummary?.receivedMessagesPrivate : typeFilter === "group" ? report?.previousSummary?.receivedMessagesGroup : report?.previousSummary?.receivedMessages)
                : undefined,
            detail: "Total de mensagens de entrada",
            icon: Clock3,
        },
        {
            key: "received_unique",
            label: "Contatos recebidos",
            value: visibleSummary.receivedUniqueMessages || 0,
            previous: selectedAgentId === "all"
                ? (typeFilter === "private" ? report?.previousSummary?.receivedUniqueMessagesPrivate : typeFilter === "group" ? report?.previousSummary?.receivedUniqueMessagesGroup : report?.previousSummary?.receivedUniqueMessages)
                : undefined,
            detail: "Clientes/grupos que enviaram",
            icon: Users,
        },
        {
            key: "sent_unique",
            label: "Contatos enviados",
            value: visibleSummary.sentUniqueMessages || 0,
            previous: selectedAgentId === "all"
                ? (typeFilter === "private" ? report?.previousSummary?.sentUniqueMessagesPrivate : typeFilter === "group" ? report?.previousSummary?.sentUniqueMessagesGroup : report?.previousSummary?.sentUniqueMessages)
                : undefined,
            detail: "Clientes/grupos que receberam",
            icon: UserCheck,
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
    return (_jsxs("div", { className: "whatsapp-activity-page", children: [_jsxs("div", { className: "activity-report-header", children: [_jsxs("div", { children: [_jsx("h1", { children: activeTab === "overview"
                                    ? "Visão Geral"
                                    : activeTab === "conversations"
                                        ? "Conversas"
                                        : activeTab === "agents"
                                            ? "Visão Geral de Agentes"
                                            : "Resumo do Dia" }), _jsx("span", { children: activeTab === "agents"
                                    ? "Acompanhe desempenho por agente e clique em uma vendedora para filtrar."
                                    : activeTab === "daily-summary"
                                        ? "Acompanhe os principais acontecimentos comerciais consolidados do dia."
                                        : "Acompanhe o atendimento por hora, agente e tipo de conversa." })] }), activeTab !== "daily-summary" && (_jsxs("div", { className: "activity-actions", children: [_jsxs("button", { type: "button", className: "activity-primary-button", onClick: () => downloadReportCsv(report, selectedAgent?.agentName ?? "Todos os agentes", dailySeries), children: [_jsx(Download, { size: 16 }), "Baixar relatorios de agentes"] }), _jsx("label", { className: "activity-select", children: _jsx("select", { value: days, onChange: (event) => setDays(Number(event.target.value)), children: windowOptions.map((option) => (_jsx("option", { value: option, children: option === 1 ? "Hoje" : `Ultimos ${option} dias` }, option))) }) }), _jsx("label", { className: "activity-select", children: _jsxs("select", { value: selectedAgentId, onChange: (event) => setSelectedAgentId(event.target.value), children: [_jsx("option", { value: "all", children: "Todos os agentes" }), report.agents.map((agent) => (_jsx("option", { value: agent.agentId, children: agent.agentName }, agent.agentId)))] }) }), _jsxs("div", { className: "activity-heatmap-toggles", children: [_jsx("button", { type: "button", className: typeFilter === "all" ? "active" : "", onClick: () => setTypeFilter("all"), children: "Todas" }), _jsx("button", { type: "button", className: typeFilter === "private" ? "active" : "", onClick: () => setTypeFilter("private"), children: "Privado" }), _jsx("button", { type: "button", className: typeFilter === "group" ? "active" : "", onClick: () => setTypeFilter("group"), children: "Grupos" })] }), _jsx("button", { type: "button", className: "activity-icon-button", onClick: () => reportQuery.refetch(), title: "Atualizar", children: _jsx(RefreshCw, { size: 17 }) })] }))] }), _jsx("div", { className: "activity-tabs", role: "tablist", "aria-label": "Relatorios WhatsApp", children: tabs.map((tab) => (_jsx("button", { type: "button", className: activeTab === tab.id ? "active" : "", onClick: () => setActiveTab(tab.id), children: tab.label }, tab.id))) }), activeTab === "overview" ? (_jsxs(_Fragment, { children: [_jsx("section", { className: "activity-metric-grid", children: cards.map(({ key, label, value, previous, detail, icon: Icon, isTime, inverse }) => (_jsxs("div", { className: "activity-metric-card", children: [_jsx("div", { className: "activity-metric-icon", children: _jsx(Icon, { size: 18 }) }), _jsx("span", { children: label }), _jsxs("div", { className: "activity-metric-value", children: [_jsx("strong", { children: isTime ? formatSeconds(value) : formatNumber(value) }), _jsx(GrowthIndicator, { current: typeof value === "number" ? value : 0, previous: previous, inverse: inverse })] }), _jsx("small", { children: detail })] }, key))) }), _jsxs("section", { className: "activity-panel heatmap-panel", children: [_jsxs("div", { className: "activity-panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Trafego de conversa" }), _jsxs("span", { children: [selectedAgent ? selectedAgent.agentName : "Todos os agentes", " - grupos unicos e privados atendidos"] })] }), _jsxs("div", { className: "activity-heatmap-controls", children: [_jsxs("div", { className: "activity-heatmap-toggles", children: [_jsx("button", { type: "button", className: !showHeatmapNumbers ? "active" : "", onClick: () => setShowHeatmapNumbers(false), children: "Cor" }), _jsx("button", { type: "button", className: showHeatmapNumbers ? "active" : "", onClick: () => setShowHeatmapNumbers(true), children: "Numero" })] }), _jsxs("div", { className: "activity-heatmap-toggles", children: [_jsx("button", { type: "button", className: heatmapMetric === "sent" ? "active" : "", onClick: () => setHeatmapMetric("sent"), children: "Enviada" }), _jsx("button", { type: "button", className: heatmapMetric === "received" ? "active" : "", onClick: () => setHeatmapMetric("received"), children: "Recebida" })] }), _jsx("div", { className: "activity-heatmap-toggles", children: _jsx("button", { type: "button", className: isUniqueMetric ? "active" : "", onClick: () => setIsUniqueMetric(!isUniqueMetric), children: isUniqueMetric ? "Único: ON" : "Único: OFF" }) }), _jsxs("div", { className: "activity-heatmap-toggles", children: [_jsx("button", { type: "button", className: heatmapMetric === "total" ? "active" : "", onClick: () => setHeatmapMetric("total"), children: "Total" }), _jsx("button", { type: "button", className: heatmapMetric === "conversations" ? "active" : "", onClick: () => setHeatmapMetric("conversations"), children: "Conversas" })] }), _jsx("div", { className: "activity-live-chip", children: "Em tempo real" })] })] }), _jsx("div", { className: "activity-heatmap-wrap", children: _jsxs("div", { className: "activity-heatmap", children: [_jsx("div", { className: "activity-heatmap-corner" }), report.hours.map((hour) => (_jsx("div", { className: "activity-hour-label", children: hour }, hour))), report.days.map((day) => (_jsxs("div", { className: "activity-day-row", children: [_jsxs("div", { className: "activity-day-label", children: [_jsx("strong", { children: shortWeekday(day.weekday) }), _jsx("span", { children: day.label })] }), report.hours.map((hour) => {
                                                    const key = `${day.date}:${hour}`;
                                                    const cell = cellMap.get(key) ?? { ...EMPTY_SUMMARY, conversations: [] };
                                                    const value = (() => {
                                                        if (typeFilter === "private") {
                                                            if (heatmapMetric === "sent")
                                                                return isUniqueMetric ? (cell.sentUniqueMessagesPrivate ?? 0) : cell.sentMessagesPrivate;
                                                            if (heatmapMetric === "received")
                                                                return isUniqueMetric ? (cell.receivedUniqueMessagesPrivate ?? 0) : cell.receivedMessagesPrivate;
                                                            if (heatmapMetric === "conversations")
                                                                return cell.attendedPrivates;
                                                            return (cell.sentMessagesPrivate || 0) + (cell.receivedMessagesPrivate || 0);
                                                        }
                                                        if (typeFilter === "group") {
                                                            if (heatmapMetric === "sent")
                                                                return isUniqueMetric ? (cell.sentUniqueMessagesGroup ?? 0) : cell.sentMessagesGroup;
                                                            if (heatmapMetric === "received")
                                                                return isUniqueMetric ? (cell.receivedUniqueMessagesGroup ?? 0) : cell.receivedMessagesGroup;
                                                            if (heatmapMetric === "conversations")
                                                                return cell.attendedGroups;
                                                            return (cell.sentMessagesGroup || 0) + (cell.receivedMessagesGroup || 0);
                                                        }
                                                        if (heatmapMetric === "sent")
                                                            return isUniqueMetric ? (cell.sentUniqueMessages ?? 0) : cell.sentMessages;
                                                        if (heatmapMetric === "received")
                                                            return isUniqueMetric ? (cell.receivedUniqueMessages ?? 0) : cell.receivedMessages;
                                                        if (heatmapMetric === "conversations")
                                                            return cell.attendedConversations;
                                                        return isUniqueMetric
                                                            ? (cell.sentUniqueMessages ?? 0) + (cell.receivedUniqueMessages ?? 0)
                                                            : (cell.sentMessages || 0) + (cell.receivedMessages || 0);
                                                    })();
                                                    const level = heatLevel(value, maxCellValue);
                                                    const sentCount = isUniqueMetric ? (cell.sentUniqueMessages ?? 0) : cell.sentMessages;
                                                    const receivedCount = isUniqueMetric ? (cell.receivedUniqueMessages ?? 0) : cell.receivedMessages;
                                                    const countLabel = isUniqueMetric ? "unicos" : "";
                                                    const title = `${day.label} ${String(hour).padStart(2, "0")}h - ${cell.attendedConversations} conversas, ${sentCount} enviados ${countLabel}, ${receivedCount} recebidos ${countLabel}`;
                                                    return (_jsx("button", { type: "button", className: `activity-heat-cell level-${level} ${selectedCellKey === key ? "selected" : ""}`, title: title, onClick: () => setSelectedCellKey(key), children: value && showHeatmapNumbers ? value : "" }, key));
                                                })] }, day.date)))] }) })] }), _jsxs("section", { className: "activity-detail-grid", children: [_jsxs("div", { className: "activity-panel", children: [_jsx("div", { className: "activity-panel-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Detalhe do horario" }), _jsx("span", { children: selectedCellKey ? selectedCellKey.replace(":", " - ") : "Clique em um quadrado do mapa" })] }) }), selectedCellSummary ? (_jsxs("div", { className: "activity-cell-detail", children: [_jsxs("div", { className: "activity-cell-stats", children: [_jsxs("span", { children: [_jsx("strong", { children: formatNumber(selectedCellSummary.attendedGroups) }), "grupos"] }), _jsxs("span", { children: [_jsx("strong", { children: formatNumber(selectedCellSummary.attendedPrivates) }), "privados"] }), _jsxs("span", { children: [_jsx("strong", { children: formatNumber(selectedCellSummary.sentMessages) }), "respostas"] }), _jsxs("span", { children: [_jsx("strong", { children: formatNumber(selectedCellSummary.receivedMessages) }), "recebidas"] }), _jsxs("span", { children: [_jsx("strong", { children: formatNumber(selectedCellSummary.receivedUniqueMessages) }), "\u00FAnicas"] })] }), _jsxs("div", { className: "activity-detail-columns", children: [_jsxs("div", { children: [_jsx("h3", { children: "Agentes com trafego" }), (selectedCellRows ?? []).filter((cell) => cell.sentMessages > 0 || cell.receivedMessages > 0).length ? ((selectedCellRows ?? [])
                                                                .filter((cell) => cell.sentMessages > 0 || cell.receivedMessages > 0)
                                                                .sort((left, right) => (right.sentMessages + right.receivedMessages) - (left.sentMessages + left.receivedMessages))
                                                                .map((cell) => {
                                                                const val = heatmapMetric === "sent" ? cell.sentMessages :
                                                                    heatmapMetric === "received" ? cell.receivedMessages :
                                                                        heatmapMetric === "received_unique" ? cell.receivedUniqueMessages :
                                                                            heatmapMetric === "conversations" ? cell.attendedConversations :
                                                                                cell.sentMessages + cell.receivedMessages;
                                                                return (_jsxs("button", { type: "button", className: "activity-detail-row", onClick: () => setSelectedAgentId(cell.agentId), children: [_jsx("span", { children: cell.agentName }), _jsx("strong", { children: formatNumber(val) })] }, `${cell.agentId}-${cell.date}-${cell.hour}`));
                                                            })) : (_jsx("p", { children: "Nenhuma atividade nesse horario." }))] }), _jsxs("div", { children: [_jsx("h3", { children: "Conversas" }), (() => {
                                                                const filtered = selectedCellSummary.conversations.filter((c) => {
                                                                    if (typeFilter === "private")
                                                                        return c.kind === "private";
                                                                    if (typeFilter === "group")
                                                                        return c.kind !== "private";
                                                                    return true;
                                                                }).filter((c) => c.sentMessages > 0 || c.receivedMessages > 0);
                                                                if (!filtered.length) {
                                                                    return _jsx("p", { children: "Nenhuma conversa atendida nesse horario." });
                                                                }
                                                                return filtered.slice(0, 8).map((conversation) => {
                                                                    const val = heatmapMetric === "sent" ? conversation.sentMessages :
                                                                        heatmapMetric === "received" ? conversation.receivedMessages :
                                                                            heatmapMetric === "received_unique" ? (conversation.receivedMessages > 0 ? 1 : 0) :
                                                                                conversation.sentMessages + conversation.receivedMessages;
                                                                    return (_jsxs("div", { className: "activity-detail-row static", children: [_jsxs("span", { children: [conversation.name, _jsx("small", { children: conversationKindLabel(conversation.kind) })] }), _jsx("strong", { children: formatNumber(val) })] }, conversation.remoteJid));
                                                                });
                                                            })()] })] })] })) : (_jsx("div", { className: "activity-empty", children: "Selecione uma celula para ver agentes, grupos e privados atendidos." }))] }), _jsxs("div", { className: "activity-panel", children: [_jsx("div", { className: "activity-panel-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Conversas por agentes" }), _jsx("span", { children: "Clique para filtrar o mapa" })] }) }), _jsx("div", { className: "activity-agent-list", children: report.agents.slice(0, 6).map((agent) => (_jsxs("button", { type: "button", className: `activity-agent-list-row ${selectedAgentId === agent.agentId ? "selected" : ""}`, onClick: () => setSelectedAgentId(agent.agentId), children: [_jsx("span", { className: "activity-avatar", children: initials(agent.agentName) || "WA" }), _jsxs("span", { children: [_jsx("strong", { children: agent.agentName }), _jsx("small", { children: formatPhone(agent.phoneNumber) })] }), _jsx("em", { children: formatNumber(agent.attendedConversations) })] }, agent.agentId))) })] })] })] })) : null, activeTab === "conversations" ? (_jsx("div", { className: "activity-conversations-layout", children: _jsxs("section", { className: "activity-panel activity-chart-panel", children: [_jsx(ActivityChart, { title: "Conversas atendidas", value: formatNumber(visibleSummary.attendedConversations), dataKey: "attendedConversations", data: dailySeries, growth: selectedAgentId === "all" ? growthMetrics?.attendedConversations : null }), _jsx(ActivityChart, { title: "Mensagens Recebidas", value: formatNumber(visibleSummary.receivedMessages), dataKey: "receivedMessages", data: dailySeries, growth: selectedAgentId === "all" ? growthMetrics?.receivedMessages : null }), _jsx(ActivityChart, { title: "Mensagens enviadas", value: formatNumber(visibleSummary.sentMessages), dataKey: "sentMessages", data: dailySeries, growth: selectedAgentId === "all" ? growthMetrics?.sentMessages : null }), _jsx(ActivityChart, { title: "Contatos Recebidos", value: formatNumber(visibleSummary.receivedUniqueMessages), dataKey: "receivedUniqueMessages", data: dailySeries, growth: selectedAgentId === "all" ? growthMetrics?.receivedUniqueMessages : null }), _jsx(ActivityChart, { title: "Tempo de Primeira Resposta", value: formatSeconds(visibleSummary.averageFirstResponseSeconds), dataKey: "averageFirstResponseSeconds", data: dailySeries, response: true, growth: selectedAgentId === "all" ? growthMetrics?.averageFirstResponseSeconds : null })] }) })) : null, activeTab === "agents" ? (_jsx("section", { className: "activity-panel", children: _jsx("div", { className: "activity-table-wrap", children: _jsxs("table", { className: "activity-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Agente" }), _jsx("th", { children: "N de Conversas" }), _jsx("th", { children: "Grupos atendidos" }), _jsx("th", { children: "Privados" }), _jsx("th", { children: "Mensagens enviadas" }), _jsx("th", { children: "Mensagens recebidas" }), _jsx("th", { children: "Recebidas (\u00DAnicas)" }), _jsx("th", { children: "Tempo medio de primeira resposta" })] }) }), _jsx("tbody", { children: report.agents.length ? (report.agents.map((agent) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("button", { type: "button", className: "activity-agent-button", onClick: () => {
                                                    setSelectedAgentId(agent.agentId);
                                                    setActiveTab("overview");
                                                }, children: [_jsx("span", { className: "activity-avatar", children: initials(agent.agentName) || "WA" }), _jsxs("span", { children: [_jsx("strong", { children: agent.agentName }), _jsx("small", { children: formatPhone(agent.phoneNumber) })] })] }) }), _jsx("td", { children: formatNumber(agent.attendedConversations) }), _jsx("td", { children: formatNumber(agent.attendedGroups) }), _jsx("td", { children: formatNumber(agent.attendedPrivates) }), _jsx("td", { children: formatNumber(agent.sentMessages) }), _jsx("td", { children: formatNumber(agent.receivedMessages) }), _jsx("td", { children: formatNumber(agent.receivedUniqueMessages) }), _jsx("td", { children: formatSeconds(agent.averageFirstResponseSeconds) })] }, agent.agentId)))) : (_jsx("tr", { children: _jsx("td", { colSpan: 8, children: "Nao ha dados disponiveis" }) })) })] }) }) })) : null, activeTab === "daily-summary" ? (_jsx(DailySummaryTab, { token: token })) : null] }));
}
function DailySummaryTab({ token }) {
    const [selectedDate, setSelectedDate] = useState(() => {
        return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
    });
    const [copySuccess, setCopySuccess] = useState(false);
    const [expandedAgents, setExpandedAgents] = useState({});
    const summaryQuery = useQuery({
        queryKey: ["whatsapp-daily-summary", selectedDate],
        queryFn: () => api.whatsappDailySummary(token, selectedDate),
        enabled: Boolean(token),
        refetchInterval: 60000,
        refetchOnWindowFocus: true,
    });
    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };
    const toggleAgent = (agentId) => {
        setExpandedAgents((prev) => ({
            ...prev,
            [agentId]: !prev[agentId],
        }));
    };
    const [isDetailed, setIsDetailed] = useState(false);
    const [useUniqueMessages, setUseUniqueMessages] = useState(false);
    const data = summaryQuery.data;
    const [selectedAgents, setSelectedAgents] = useState({});
    useEffect(() => {
        if (data?.agents) {
            const initial = {};
            data.agents.forEach((agent) => {
                initial[agent.agentId] = true;
            });
            setSelectedAgents(initial);
        }
    }, [data]);
    const activeAgentsList = useMemo(() => {
        if (!data?.agents)
            return [];
        return data.agents.filter((agent) => selectedAgents[agent.agentId] !== false);
    }, [data?.agents, selectedAgents]);
    const totalUniqueContactsSent = useMemo(() => {
        if (!activeAgentsList)
            return 0;
        const uniqueJids = new Set();
        activeAgentsList.forEach((agent) => {
            agent.attendedPrivateClients.forEach((c) => {
                if (c.sent > 0)
                    uniqueJids.add(c.jid);
            });
            agent.attendedGroupClients.forEach((g) => {
                if (g.sent > 0)
                    uniqueJids.add(g.jid);
            });
        });
        return uniqueJids.size;
    }, [activeAgentsList]);
    const messageText = useMemo(() => {
        if (!data)
            return "";
        const [year, month, day] = data.date.split("-");
        const formattedDate = `${day}/${month}/${year}`;
        // Calculate Top Active Agent
        let topAgentName = "";
        let topAgentValue = 0;
        activeAgentsList.forEach((agent) => {
            const val = useUniqueMessages
                ? (agent.attendedPrivateClients.filter((c) => c.sent > 0).length + agent.attendedGroupClients.filter((g) => g.sent > 0).length)
                : agent.sentMessages;
            if (val > topAgentValue) {
                topAgentValue = val;
                topAgentName = agent.agentName;
            }
        });
        let text = `📅 *Relatório de Atendimento XP*\n_${formattedDate}_\n\n`;
        text += `📱 *Clientes Novos no Dia:* ${data.newCustomersCount}\n`;
        text += `🔄 *Clientes Recuperados no Dia:* ${data.recoveredCustomersCount}\n\n`;
        if (useUniqueMessages) {
            text += `💬 *Resumo de Mensagens:*\n`;
            text += `📱 Mensagens Únicas Enviadas: ${totalUniqueContactsSent.toLocaleString("pt-BR")}\n`;
            text += `🧾 Mensagens Recebidas: ${data.totalMessagesReceived.toLocaleString("pt-BR")}\n`;
        }
        else {
            text += `💬 *Resumo de Mensagens:*\n`;
            text += `📱 Mensagens Enviadas: ${data.totalMessagesSent.toLocaleString("pt-BR")}\n`;
            text += `🧾 Mensagens Recebidas: ${data.totalMessagesReceived.toLocaleString("pt-BR")}\n`;
        }
        if (data.averageFirstResponseSeconds !== null && data.averageFirstResponseSeconds !== undefined) {
            text += `⏱️ *Tempo Médio de Resposta (SLA):* ${formatSeconds(data.averageFirstResponseSeconds)}\n`;
        }
        text += `\n`;
        if (topAgentName && topAgentValue > 0) {
            text += `🌟 *Vendedora Mais Ativa:* ${topAgentName} (${topAgentValue.toLocaleString("pt-BR")} ${useUniqueMessages ? "mensagens únicas" : "mensagens enviadas"})\n\n`;
        }
        text += `🏆 *Ranking de Vendedoras e Atendimentos:*\n\n`;
        activeAgentsList.forEach((agent, index) => {
            const medals = ["🥇", "🥈", "🥉"];
            const emoji = index < 3 ? medals[index] : "❤️";
            text += `${emoji} *${agent.agentName}*\n`;
            if (useUniqueMessages) {
                const agentUniqueContactsSent = agent.attendedPrivateClients.filter((c) => c.sent > 0).length +
                    agent.attendedGroupClients.filter((g) => g.sent > 0).length;
                text += `💬 Mensagens Únicas Enviadas: ${agentUniqueContactsSent.toLocaleString("pt-BR")}\n`;
            }
            else {
                text += `💬 Mensagens Enviadas: ${agent.sentMessages.toLocaleString("pt-BR")}\n`;
            }
            text += `📱 Atendimentos Particular: ${agent.privateChatsCount}\n`;
            text += `👥 Atendimentos em Grupo: ${agent.groupChatsCount}\n`;
            text += `✨ Conversas Iniciadas: ${agent.initiatedCount}\n`;
            if (isDetailed && (agent.attendedPrivateClients.length > 0 || agent.attendedGroupClients.length > 0)) {
                text += `👥 *Clientes Atendidos:*\n`;
                // Particular
                agent.attendedPrivateClients.forEach((c) => {
                    const initiatedTag = c.initiated ? " _[Iniciada]_" : "";
                    text += `* ${c.name} (Particular)${initiatedTag}\n`;
                });
                // Grupos
                agent.attendedGroupClients.forEach((g) => {
                    text += `* ${g.name} (Grupo)\n`;
                });
            }
            text += `\n`;
        });
        return text;
    }, [data, activeAgentsList, isDetailed, useUniqueMessages, totalUniqueContactsSent]);
    if (summaryQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando resumo do dia..." });
    }
    if (summaryQuery.isError || !data) {
        return (_jsxs("div", { className: "activity-panel", style: { padding: "2rem", textAlign: "center" }, children: [_jsx("p", { className: "muted", style: { marginBottom: "1rem" }, children: "N\u00E3o foi poss\u00EDvel carregar o resumo di\u00E1rio." }), _jsx("button", { type: "button", className: "premium-button primary", onClick: () => summaryQuery.refetch(), children: "Tentar novamente" })] }));
    }
    return (_jsxs("div", { className: "daily-summary-tab animate-in", style: { display: "flex", flexDirection: "column", gap: "2rem" }, children: [_jsx("div", { className: "panel", style: { padding: "1.5rem" }, children: _jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.75rem" }, children: [_jsx(Calendar, { className: "muted", size: 20 }), _jsxs("div", { children: [_jsx("h3", { style: { margin: 0, fontSize: "1.1rem" }, children: "Selecione a data do relat\u00F3rio" }), _jsx("p", { className: "muted", style: { margin: 0, fontSize: "0.85rem" }, children: "Visualizando acontecimentos comerciais consolidados do dia" })] })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "1rem" }, children: [_jsx("input", { type: "date", className: "form-input", style: { padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", width: "auto" }, value: selectedDate, onChange: (e) => setSelectedDate(e.target.value) }), _jsxs("button", { type: "button", className: "premium-button ghost", onClick: () => summaryQuery.refetch(), style: { display: "flex", alignItems: "center", gap: "0.5rem" }, children: [_jsx(RefreshCw, { size: 16 }), "Atualizar"] })] })] }) }), _jsxs("section", { className: "daily-summary-grid", children: [_jsxs("div", { className: "daily-summary-card", style: { '--card-theme': '#287ee7', '--card-theme-rgb': '40, 126, 231' }, children: [_jsxs("div", { className: "daily-summary-card-header", children: [_jsx("div", { className: "daily-summary-card-icon", children: _jsx(Smartphone, { size: 20 }) }), _jsx("span", { className: "daily-summary-card-title", children: "Clientes Novos" })] }), _jsx("div", { className: "daily-summary-card-value", children: _jsx("strong", { children: data.newCustomersCount }) }), _jsx("p", { className: "daily-summary-card-subtitle", children: "Primeira compra no dia" })] }), _jsxs("div", { className: "daily-summary-card", style: { '--card-theme': '#10b981', '--card-theme-rgb': '16, 185, 129' }, children: [_jsxs("div", { className: "daily-summary-card-header", children: [_jsx("div", { className: "daily-summary-card-icon", children: _jsx(RefreshCw, { size: 20 }) }), _jsx("span", { className: "daily-summary-card-title", children: "Clientes Recuperados" })] }), _jsx("div", { className: "daily-summary-card-value", children: _jsx("strong", { children: data.recoveredCustomersCount }) }), _jsx("p", { className: "daily-summary-card-subtitle", children: "Voltou a comprar ap\u00F3s 90+ dias" })] }), _jsxs("div", { className: "daily-summary-card", style: { '--card-theme': '#f59e0b', '--card-theme-rgb': '245, 158, 11' }, children: [_jsxs("div", { className: "daily-summary-card-header", children: [_jsx("div", { className: "daily-summary-card-icon", children: _jsx(Package, { size: 20 }) }), _jsx("span", { className: "daily-summary-card-title", children: "Telas Vendidas" })] }), _jsx("div", { className: "daily-summary-card-value", children: _jsx("strong", { children: data.totalTelasSold.toLocaleString("pt-BR") }) }), _jsx("p", { className: "daily-summary-card-subtitle", children: "Volume total de itens" })] }), _jsxs("div", { className: "daily-summary-card", style: { '--card-theme': '#8b5cf6', '--card-theme-rgb': '139, 92, 246' }, children: [_jsxs("div", { className: "daily-summary-card-header", children: [_jsx("div", { className: "daily-summary-card-icon", children: _jsx(DollarSign, { size: 20 }) }), _jsx("span", { className: "daily-summary-card-title", children: "Faturamento" })] }), _jsx("div", { className: "daily-summary-card-value long-value", children: _jsxs("strong", { children: ["R$ ", data.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })] }) }), _jsx("p", { className: "daily-summary-card-subtitle", children: "Pedidos faturados no dia" })] }), _jsxs("div", { className: "daily-summary-card", style: { '--card-theme': '#06b6d4', '--card-theme-rgb': '6, 182, 212' }, children: [_jsxs("div", { className: "daily-summary-card-header", children: [_jsx("div", { className: "daily-summary-card-icon", children: _jsx(MessageCircle, { size: 20 }) }), _jsx("span", { className: "daily-summary-card-title", children: "Respostas Enviadas" })] }), _jsx("div", { className: "daily-summary-card-value", children: _jsx("strong", { children: data.totalMessagesSent.toLocaleString("pt-BR") }) }), _jsx("p", { className: "daily-summary-card-subtitle", children: "Mensagens ativas do time" })] }), _jsxs("div", { className: "daily-summary-card", style: { '--card-theme': '#6366f1', '--card-theme-rgb': '99, 102, 241' }, children: [_jsxs("div", { className: "daily-summary-card-header", children: [_jsx("div", { className: "daily-summary-card-icon", children: _jsx(Clock3, { size: 20 }) }), _jsx("span", { className: "daily-summary-card-title", children: "Mensagens Recebidas" })] }), _jsx("div", { className: "daily-summary-card-value", children: _jsx("strong", { children: data.totalMessagesReceived.toLocaleString("pt-BR") }) }), _jsx("p", { className: "daily-summary-card-subtitle", children: "Entradas enviadas por clientes" })] }), _jsxs("div", { className: "daily-summary-card", style: { '--card-theme': '#f43f5e', '--card-theme-rgb': '244, 63, 94' }, children: [_jsxs("div", { className: "daily-summary-card-header", children: [_jsx("div", { className: "daily-summary-card-icon", children: _jsx(Clock3, { size: 20 }) }), _jsx("span", { className: "daily-summary-card-title", children: "Tempo de Resposta (SLA)" })] }), _jsx("div", { className: "daily-summary-card-value", children: _jsx("strong", { children: formatSeconds(data.averageFirstResponseSeconds) }) }), _jsx("p", { className: "daily-summary-card-subtitle", children: "Tempo m\u00E9dio de resposta" })] })] }), _jsxs("div", { className: "panel", style: { padding: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }, children: [_jsxs("div", { children: [_jsx("h3", { style: { margin: 0, fontSize: "1.2rem", fontWeight: 600 }, children: "Relat\u00F3rio Formatado para WhatsApp" }), _jsx("p", { className: "muted", style: { margin: "0.25rem 0 0 0", fontSize: "0.875rem" }, children: "Copie o relat\u00F3rio consolidado com cliques e publique direto no grupo da empresa." })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }, children: [_jsxs("label", { style: { display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-color)" }, children: [_jsx("input", { type: "checkbox", checked: isDetailed, onChange: (e) => setIsDetailed(e.target.checked), style: { width: "1.1rem", height: "1.1rem", cursor: "pointer", accentColor: "var(--primary)" } }), "Relat\u00F3rio Detalhado"] }), _jsxs("label", { style: { display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem", fontWeight: 500, color: "var(--text-color)" }, children: [_jsx("input", { type: "checkbox", checked: useUniqueMessages, onChange: (e) => setUseUniqueMessages(e.target.checked), style: { width: "1.1rem", height: "1.1rem", cursor: "pointer", accentColor: "var(--primary)" } }), "Mensagens \u00DAnicas Enviadas (vs Total)"] }), _jsxs("button", { type: "button", className: `premium-button ${copySuccess ? "success" : "primary"}`, onClick: () => handleCopy(messageText), style: { display: "flex", alignItems: "center", gap: "0.5rem", transition: "all 0.2s ease" }, children: [copySuccess ? _jsx(Check, { size: 18 }) : _jsx(Copy, { size: 18 }), copySuccess ? "Copiado! ✅" : "Copiar para WhatsApp 📱"] })] })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }, children: [_jsxs("span", { style: { fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.25rem" }, children: [_jsx(UserCheck, { size: 14 }), " Selecionar vendedoras para incluir no relat\u00F3rio:"] }), _jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.5rem" }, children: data.agents.map((agent) => {
                                    const isSelected = selectedAgents[agent.agentId] !== false;
                                    return (_jsxs("button", { type: "button", onClick: () => {
                                            setSelectedAgents((prev) => ({
                                                ...prev,
                                                [agent.agentId]: !isSelected,
                                            }));
                                        }, style: {
                                            padding: "0.35rem 0.75rem",
                                            borderRadius: "20px",
                                            border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                                            background: isSelected ? "rgba(40, 126, 231, 0.08)" : "transparent",
                                            color: isSelected ? "var(--primary)" : "var(--text-muted)",
                                            fontSize: "0.825rem",
                                            fontWeight: 500,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "0.35rem",
                                            transition: "all 0.15s ease",
                                        }, children: [_jsx("input", { type: "checkbox", checked: isSelected, readOnly: true, style: { accentColor: "var(--primary)", cursor: "pointer", margin: 0, width: "0.85rem", height: "0.85rem" } }), agent.agentName] }, agent.agentId));
                                }) })] }), _jsx("div", { style: {
                            background: "rgba(0, 0, 0, 0.02)",
                            border: "1px solid var(--border-color)",
                            borderRadius: "12px",
                            padding: "1.5rem",
                            maxHeight: "350px",
                            overflowY: "auto",
                            fontFamily: "monospace",
                            whiteSpace: "pre-wrap",
                            fontSize: "0.9rem",
                            color: "var(--text-color)",
                            lineHeight: 1.5,
                        }, children: messageText })] }), _jsxs("div", { className: "panel", style: { padding: "2rem" }, children: [_jsxs("div", { style: { marginBottom: "1.5rem" }, children: [_jsx("h3", { style: { margin: 0, fontSize: "1.2rem", fontWeight: 600 }, children: "Desempenho por Vendedora" }), _jsx("p", { className: "muted", style: { margin: "0.25rem 0 0 0", fontSize: "0.875rem" }, children: "Produtividade comercial e lista detalhada de atendimentos no dia." })] }), _jsx("div", { style: { display: "flex", flexDirection: "column", gap: "1rem" }, children: activeAgentsList.length ? (activeAgentsList.map((agent, index) => {
                            const medals = ["🥇", "🥈", "🥉"];
                            const emoji = index < 3 ? medals[index] : "❤️";
                            const isExpanded = expandedAgents[agent.agentId];
                            return (_jsxs("div", { style: {
                                    border: "1px solid var(--border-color)",
                                    borderRadius: "12px",
                                    overflow: "hidden",
                                    background: "var(--card-background)",
                                    transition: "all 0.2s ease",
                                }, children: [_jsxs("div", { onClick: () => toggleAgent(agent.agentId), style: {
                                            padding: "1.25rem 1.5rem",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            cursor: "pointer",
                                            background: "rgba(0,0,0,0.01)",
                                            userSelect: "none",
                                            flexWrap: "wrap",
                                            gap: "1rem",
                                        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.75rem" }, children: [_jsx("span", { style: { fontSize: "1.5rem" }, children: emoji }), _jsxs("div", { children: [_jsx("strong", { style: { fontSize: "1.05rem" }, children: agent.agentName }), _jsxs("div", { className: "muted", style: { fontSize: "0.8rem", marginTop: "0.2rem" }, children: ["\uD83D\uDCF1 Telas: ", _jsx("strong", { children: agent.screensSold }), " | \uD83E\uDDFE Pedidos: ", _jsx("strong", { children: agent.ordersCount }), " | \uD83D\uDCB0 Faturamento: ", _jsxs("strong", { children: ["R$ ", agent.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })] })] })] })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "2rem" }, children: [_jsxs("div", { style: { display: "flex", gap: "1.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }, children: [_jsxs("div", { children: ["\uD83D\uDCAC Msg Enviadas: ", _jsx("strong", { style: { color: "var(--text-color)" }, children: agent.sentMessages })] }), _jsxs("div", { children: ["\uD83D\uDCF1 Particular: ", _jsx("strong", { style: { color: "var(--text-color)" }, children: agent.privateChatsCount })] }), _jsxs("div", { children: ["\uD83D\uDC65 Grupo: ", _jsx("strong", { style: { color: "var(--text-color)" }, children: agent.groupChatsCount })] }), _jsxs("div", { children: ["\u2728 Iniciadas: ", _jsx("strong", { style: { color: "var(--text-color)" }, children: agent.initiatedCount })] })] }), isExpanded ? _jsx(ChevronUp, { size: 20, className: "muted" }) : _jsx(ChevronDown, { size: 20, className: "muted" })] })] }), isExpanded && (_jsx("div", { style: { padding: "1.5rem", borderTop: "1px solid var(--border-color)", background: "rgba(0,0,0,0.005)" }, children: _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }, children: [_jsxs("div", { children: [_jsxs("h4", { style: { margin: "0 0 0.75rem 0", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }, children: [_jsx(Smartphone, { size: 16, className: "muted" }), "Contatos Particulares (", agent.attendedPrivateClients.length, ")"] }), agent.attendedPrivateClients.length ? (_jsx("ul", { style: { margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.875rem" }, children: agent.attendedPrivateClients.map((client) => (_jsxs("li", { style: { lineHeight: 1.4 }, children: [_jsx("strong", { children: client.name }), _jsxs("span", { className: "muted", style: { fontSize: "0.75rem", marginLeft: "0.4rem" }, children: ["(\uD83D\uDCAC ", client.sent, " env / ", client.received, " rec)"] }), client.initiated && (_jsx("span", { style: {
                                                                            marginLeft: "0.5rem",
                                                                            fontSize: "0.7rem",
                                                                            background: "rgba(16, 185, 129, 0.15)",
                                                                            color: "#10b981",
                                                                            padding: "1px 6px",
                                                                            borderRadius: "10px",
                                                                            fontWeight: 600
                                                                        }, children: "Iniciada" }))] }, client.jid))) })) : (_jsx("p", { className: "muted", style: { margin: 0, fontSize: "0.85rem", fontStyle: "italic" }, children: "Nenhum particular atendido." }))] }), _jsxs("div", { children: [_jsxs("h4", { style: { margin: "0 0 0.75rem 0", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }, children: [_jsx(Users, { size: 16, className: "muted" }), "Grupos Atendidos (", agent.attendedGroupClients.length, ")"] }), agent.attendedGroupClients.length ? (_jsx("ul", { style: { margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.875rem" }, children: agent.attendedGroupClients.map((group) => (_jsxs("li", { style: { lineHeight: 1.4 }, children: [_jsx("strong", { children: group.name }), _jsxs("span", { className: "muted", style: { fontSize: "0.75rem", marginLeft: "0.4rem" }, children: ["(\uD83D\uDCAC ", group.sent, " env / ", group.received, " rec)"] })] }, group.jid))) })) : (_jsx("p", { className: "muted", style: { margin: 0, fontSize: "0.85rem", fontStyle: "italic" }, children: "Nenhum grupo atendido." }))] })] }) }))] }, agent.agentId));
                        })) : (_jsx("div", { style: { textAlign: "center", padding: "2rem" }, children: _jsx("p", { className: "muted", style: { margin: 0 }, children: "Nenhuma vendedora registrou atividade nesta data." }) })) })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "2rem" }, children: [_jsxs("div", { className: "panel", style: { padding: "2rem" }, children: [_jsxs("div", { style: { marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }, children: [_jsx(Award, { className: "accent-primary", size: 20 }), _jsxs("div", { children: [_jsxs("h3", { style: { margin: 0, fontSize: "1.15rem", fontWeight: 600 }, children: ["Clientes Novos do Dia (", data.newCustomersCount, ")"] }), _jsx("p", { className: "muted", style: { margin: 0, fontSize: "0.8rem" }, children: "Registraram a primeira compra na empresa hoje" })] })] }), data.newCustomersList.length ? (_jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table", style: { fontSize: "0.85rem" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "C\u00F3digo" }), _jsx("th", { children: "Nome" }), _jsx("th", { children: "Valor" }), _jsx("th", { children: "Pe\u00E7as" }), _jsx("th", { children: "Vendedora" })] }) }), _jsx("tbody", { children: data.newCustomersList.map((c) => (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 600, color: "var(--primary)" }, children: c.customer_code }), _jsx("td", { children: c.display_name }), _jsxs("td", { children: ["R$ ", Number(c.total_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })] }), _jsx("td", { children: c.item_count }), _jsx("td", { className: "muted", children: c.last_attendant })] }, c.customer_code))) })] }) })) : (_jsx("p", { className: "muted", style: { margin: 0, fontStyle: "italic", fontSize: "0.875rem" }, children: "Nenhum novo cliente registrado nesta data." }))] }), _jsxs("div", { className: "panel", style: { padding: "2rem" }, children: [_jsxs("div", { style: { marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }, children: [_jsx(RefreshCw, { className: "accent-success", size: 20 }), _jsxs("div", { children: [_jsxs("h3", { style: { margin: 0, fontSize: "1.15rem", fontWeight: 600 }, children: ["Clientes Recuperados (", data.recoveredCustomersCount, ")"] }), _jsx("p", { className: "muted", style: { margin: 0, fontSize: "0.8rem" }, children: "Voltaram a comprar depois de 90+ dias inativos" })] })] }), data.recoveredCustomersList.length ? (_jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table", style: { fontSize: "0.85rem" }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "C\u00F3digo" }), _jsx("th", { children: "Nome" }), _jsx("th", { children: "Valor" }), _jsx("th", { children: "Inatividade" }), _jsx("th", { children: "Vendedora" })] }) }), _jsx("tbody", { children: data.recoveredCustomersList.map((c) => (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 600, color: "var(--success)" }, children: c.customer_code }), _jsx("td", { children: c.display_name }), _jsxs("td", { children: ["R$ ", Number(c.total_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })] }), _jsxs("td", { children: [_jsxs("strong", { style: { color: "var(--success)" }, children: [c.days_inactive, " dias"] }), _jsxs("div", { style: { fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }, children: ["Desde ", c.previous_order_date.split("-").reverse().join("/")] })] }), _jsx("td", { className: "muted", children: c.last_attendant })] }, c.customer_code))) })] }) })) : (_jsx("p", { className: "muted", style: { margin: 0, fontStyle: "italic", fontSize: "0.875rem" }, children: "Nenhum cliente recuperado registrado nesta data." }))] })] })] }));
}
