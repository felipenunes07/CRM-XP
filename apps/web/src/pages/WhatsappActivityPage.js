import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Clock3, MessageCircle, Monitor, Moon, RefreshCw, Smartphone, Users, } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
const windowOptions = [1, 7, 14, 30];
function formatNumber(value) {
    return new Intl.NumberFormat("pt-BR").format(value);
}
function initials(name) {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
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
function mergeCells(cells) {
    return cells.reduce((total, cell) => ({
        sentMessages: total.sentMessages + cell.sentMessages,
        receivedMessages: total.receivedMessages + cell.receivedMessages,
        privateMessages: total.privateMessages + cell.privateMessages,
        groupMessages: total.groupMessages + cell.groupMessages,
        customerGroupMessages: total.customerGroupMessages + cell.customerGroupMessages,
        internalGroupMessages: total.internalGroupMessages + cell.internalGroupMessages,
        otherGroupMessages: total.otherGroupMessages + cell.otherGroupMessages,
        nightMessages: total.nightMessages + cell.nightMessages,
        crmMessages: total.crmMessages + cell.crmMessages,
        whatsappMessages: total.whatsappMessages + cell.whatsappMessages,
    }), {
        sentMessages: 0,
        receivedMessages: 0,
        privateMessages: 0,
        groupMessages: 0,
        customerGroupMessages: 0,
        internalGroupMessages: 0,
        otherGroupMessages: 0,
        nightMessages: 0,
        crmMessages: 0,
        whatsappMessages: 0,
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
function metricCards(summary) {
    const nonInternalGroups = summary.customerGroupMessages + summary.otherGroupMessages;
    return [
        {
            key: "sent",
            label: "Respostas",
            value: summary.sentMessages,
            detail: `${formatNumber(summary.whatsappMessages)} pelo WhatsApp`,
            icon: MessageCircle,
        },
        {
            key: "private",
            label: "Privado",
            value: summary.privateMessages,
            detail: `${formatNumber(summary.receivedMessages)} recebidas`,
            icon: Smartphone,
        },
        {
            key: "groups",
            label: "Grupos clientes",
            value: nonInternalGroups,
            detail: `${formatNumber(summary.internalGroupMessages)} internos separados`,
            icon: Users,
        },
        {
            key: "night",
            label: "Noturno",
            value: summary.nightMessages,
            detail: "18h ate 08h",
            icon: Moon,
        },
        {
            key: "crm",
            label: "Pelo CRM",
            value: summary.crmMessages,
            detail: `${formatNumber(summary.whatsappMessages)} fora do CRM`,
            icon: Monitor,
        },
    ];
}
export function WhatsappActivityPage() {
    const { token } = useAuth();
    const [days, setDays] = useState(7);
    const [selectedAgentId, setSelectedAgentId] = useState("all");
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
    const visibleSummary = useMemo(() => mergeCells(visibleCells), [visibleCells]);
    const cellMap = useMemo(() => {
        const map = new Map();
        if (!report)
            return map;
        for (const day of report.days) {
            for (const hour of report.hours) {
                map.set(`${day.date}:${hour}`, mergeCells([]));
            }
        }
        for (const cell of visibleCells) {
            const key = `${cell.date}:${cell.hour}`;
            const current = map.get(key) ?? mergeCells([]);
            map.set(key, mergeCells([current, cell]));
        }
        return map;
    }, [report, visibleCells]);
    const maxCellValue = useMemo(() => Math.max(1, ...Array.from(cellMap.values()).map((cell) => cell.sentMessages)), [cellMap]);
    useEffect(() => {
        if (!report || selectedAgentId === "all")
            return;
        if (!report.agents.some((agent) => agent.agentId === selectedAgentId)) {
            setSelectedAgentId("all");
        }
    }, [report, selectedAgentId]);
    if (reportQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: "Carregando atividade..." });
    }
    if (reportQuery.isError || !report) {
        return (_jsxs("div", { className: "whatsapp-activity-page", children: [_jsxs("div", { className: "activity-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "WhatsApp" }), _jsx("h1", { children: "Atividade dos agentes" })] }), _jsxs("button", { type: "button", className: "secondary-button", onClick: () => reportQuery.refetch(), children: [_jsx(RefreshCw, { size: 16 }), "Tentar novamente"] })] }), _jsx("div", { className: "activity-empty", children: "Nao foi possivel carregar o relatorio agora." })] }));
    }
    const cards = metricCards(selectedAgent ? visibleSummary : report.summary);
    return (_jsxs("div", { className: "whatsapp-activity-page", children: [_jsxs("div", { className: "activity-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "WhatsApp" }), _jsx("h1", { children: "Atividade dos agentes" })] }), _jsxs("div", { className: "activity-actions", children: [_jsxs("label", { className: "activity-select", children: [_jsx(Clock3, { size: 16 }), _jsx("select", { value: days, onChange: (event) => setDays(Number(event.target.value)), children: windowOptions.map((option) => (_jsx("option", { value: option, children: option === 1 ? "Hoje" : `Ultimos ${option} dias` }, option))) })] }), _jsxs("label", { className: "activity-select", children: [_jsx(Users, { size: 16 }), _jsxs("select", { value: selectedAgentId, onChange: (event) => setSelectedAgentId(event.target.value), children: [_jsx("option", { value: "all", children: "Todos os agentes" }), report.agents.map((agent) => (_jsx("option", { value: agent.agentId, children: agent.agentName }, agent.agentId)))] })] }), _jsx("button", { type: "button", className: "activity-icon-button", onClick: () => reportQuery.refetch(), title: "Atualizar", children: _jsx(RefreshCw, { size: 17 }) })] })] }), _jsx("section", { className: "activity-metric-grid", children: cards.map(({ key, label, value, detail, icon: Icon }) => (_jsxs("div", { className: "activity-metric-card", children: [_jsx("div", { className: "activity-metric-icon", children: _jsx(Icon, { size: 18 }) }), _jsx("span", { children: label }), _jsx("strong", { children: formatNumber(value) }), _jsx("small", { children: detail })] }, key))) }), _jsxs("section", { className: "activity-panel", children: [_jsxs("div", { className: "activity-panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Respostas por hora" }), _jsx("span", { children: selectedAgent ? selectedAgent.agentName : "Todos os numeros conectados" })] }), _jsxs("div", { className: "activity-live-chip", children: [_jsx(BarChart3, { size: 14 }), "Atualiza em tempo real"] })] }), _jsx("div", { className: "activity-heatmap-wrap", children: _jsxs("div", { className: "activity-heatmap", children: [_jsx("div", { className: "activity-heatmap-corner" }), report.hours.map((hour) => (_jsx("div", { className: "activity-hour-label", children: hour }, hour))), report.days.map((day) => (_jsxs("div", { className: "activity-day-row", children: [_jsxs("div", { className: "activity-day-label", children: [_jsx("strong", { children: shortWeekday(day.weekday) }), _jsx("span", { children: day.label })] }), report.hours.map((hour) => {
                                            const cell = cellMap.get(`${day.date}:${hour}`) ?? mergeCells([]);
                                            const level = heatLevel(cell.sentMessages, maxCellValue);
                                            const title = `${day.label} ${String(hour).padStart(2, "0")}h - ${cell.sentMessages} respostas, ${cell.privateMessages} privado, ${cell.customerGroupMessages + cell.otherGroupMessages} grupos clientes`;
                                            return (_jsx("div", { className: `activity-heat-cell level-${level} ${isNightHour(hour, report) ? "night" : ""}`, title: title, children: cell.sentMessages ? cell.sentMessages : "" }, `${day.date}:${hour}`));
                                        })] }, day.date)))] }) })] }), _jsxs("section", { className: "activity-panel", children: [_jsx("div", { className: "activity-panel-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Vendedoras" }), _jsxs("span", { children: [formatNumber(report.summary.activeAgents), " agentes com respostas no periodo"] })] }) }), report.agents.length ? (_jsx("div", { className: "activity-table-wrap", children: _jsxs("table", { className: "activity-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Agente" }), _jsx("th", { children: "Respostas" }), _jsx("th", { children: "Privado" }), _jsx("th", { children: "Grupos clientes" }), _jsx("th", { children: "Outros grupos" }), _jsx("th", { children: "Internos" }), _jsx("th", { children: "Noturno" }), _jsx("th", { children: "WhatsApp" }), _jsx("th", { children: "CRM" }), _jsx("th", { children: "Horas ativas" })] }) }), _jsx("tbody", { children: report.agents.map((agent) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("button", { type: "button", className: "activity-agent-button", onClick: () => setSelectedAgentId(agent.agentId), children: [_jsx("span", { className: "activity-avatar", children: initials(agent.agentName) || "WA" }), _jsxs("span", { children: [_jsx("strong", { children: agent.agentName }), _jsx("small", { children: formatPhone(agent.phoneNumber) })] })] }) }), _jsx("td", { children: formatNumber(agent.sentMessages) }), _jsx("td", { children: formatNumber(agent.privateMessages) }), _jsx("td", { children: formatNumber(agent.customerGroupMessages) }), _jsx("td", { children: formatNumber(agent.otherGroupMessages) }), _jsx("td", { children: formatNumber(agent.internalGroupMessages) }), _jsx("td", { children: formatNumber(agent.nightMessages) }), _jsx("td", { children: formatNumber(agent.whatsappMessages) }), _jsx("td", { children: formatNumber(agent.crmMessages) }), _jsx("td", { children: formatNumber(agent.activeHours) })] }, agent.agentId))) })] }) })) : (_jsx("div", { className: "activity-empty", children: "Nenhuma resposta registrada nesse periodo." }))] })] }));
}
function isNightHour(hour, report) {
    return hour >= report.period.nightStartHour || hour < report.period.nightEndHour;
}
