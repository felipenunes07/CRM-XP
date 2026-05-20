import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Sparkles, Wrench, ShieldAlert, Calendar, Clock, RefreshCw, PartyPopper } from "lucide-react";
import { useUiLanguage } from "../i18n";
const changelogData = [
    {
        date: "2026-05-20",
        version: "1.1.0",
        title: "Central de Changelog & Otimizações no WhatsApp",
        changes: [
            {
                type: "feature",
                title: "Changelog do Sistema",
                description: "Lançamento da central de Changelog integrada sob o menu 'Mais' para permitir que toda a equipe acompanhe as novas funcionalidades, melhorias e correções de bugs em tempo real."
            },
            {
                type: "improvement",
                title: "Visualização Limpa da Atividade do WhatsApp",
                description: "Reestruturação da aba de Conversas nos Relatórios do WhatsApp. A tabela lateral de lista de conversas foi removida para foco exclusivo nos gráficos estatísticos, que agora ocupam 100% da largura útil da tela em um grid elegante de 2 colunas."
            }
        ]
    },
    {
        date: "2026-05-15",
        version: "1.0.8",
        title: "Otimizações de Kanban & Filtros Avançados",
        changes: [
            {
                type: "improvement",
                title: "Filtros Rápidos no Pipeline",
                description: "Melhorias significativas no tempo de resposta e filtros do funil de vendas (Pipeline) para agilizar a consulta de contatos em aberto."
            },
            {
                type: "bugfix",
                title: "Correção de Movimentação de Cards",
                description: "Corrigido um bug onde o arrastar e soltar (drag and drop) de cards congelava em telas de menor resolução."
            }
        ]
    },
    {
        date: "2026-05-08",
        version: "1.0.5",
        title: "Lançamento da Tela de Metas Integradas",
        changes: [
            {
                type: "feature",
                title: "Painel Dinâmico de Metas",
                description: "Nova tela de gerenciamento de objetivos comerciais por atendente, com barras de progresso interativas e cálculo automático de comissões estimadas."
            }
        ]
    }
];
function formatDate(dateStr) {
    const parts = dateStr.split("-");
    if (parts.length !== 3)
        return dateStr;
    const year = parts[0];
    const monthStr = parts[1];
    const day = parts[2];
    if (!year || !monthStr || !day)
        return dateStr;
    const monthNames = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const month = monthNames[parseInt(monthStr, 10) - 1] || monthStr;
    return `${day} de ${month} de ${year}`;
}
export function NovidadesPage() {
    const { tx } = useUiLanguage();
    const [filter, setFilter] = useState("all");
    const filteredEntries = changelogData
        .map(entry => {
        const changes = entry.changes.filter(c => filter === "all" || c.type === filter);
        return { ...entry, changes };
    })
        .filter(entry => entry.changes.length > 0);
    return (_jsxs("div", { className: "changelog-page", children: [_jsxs("header", { className: "changelog-header", children: [_jsxs("div", { children: [_jsxs("div", { className: "changelog-eyebrow", children: [_jsx(PartyPopper, { size: 14, style: { marginRight: "4px", display: "inline" } }), _jsx("span", { children: "CENTRAL DE ATUALIZA\u00C7\u00D5ES" })] }), _jsx("h1", { children: tx("Changelog do Sistema", "系统更新日志") }), _jsx("p", { children: tx("Acompanhe o histórico de novas funcionalidades, melhorias e correções no CRM XP", "追踪 CRM XP 的新功能、系统改进 with 缺陷修复") })] }), _jsxs("div", { className: "changelog-badge", children: [_jsx(Clock, { size: 16 }), _jsx("span", { children: "Vers\u00E3o Atual: v1.1.0" })] })] }), _jsxs("div", { className: "changelog-filters", children: [_jsx("button", { type: "button", className: filter === "all" ? "active" : "", onClick: () => setFilter("all"), children: tx("Todas", "全部") }), _jsxs("button", { type: "button", className: filter === "feature" ? "active feature" : "", onClick: () => setFilter("feature"), children: [_jsx(Sparkles, { size: 14 }), tx("Features", "新功能")] }), _jsxs("button", { type: "button", className: filter === "improvement" ? "active improvement" : "", onClick: () => setFilter("improvement"), children: [_jsx(Wrench, { size: 14 }), tx("Melhorias", "功能改进")] }), _jsxs("button", { type: "button", className: filter === "bugfix" ? "active bugfix" : "", onClick: () => setFilter("bugfix"), children: [_jsx(ShieldAlert, { size: 14 }), tx("Correções", "问题修复")] })] }), _jsx("div", { className: "changelog-timeline-container", children: filteredEntries.length > 0 ? (_jsx("div", { className: "changelog-timeline", children: filteredEntries.map((entry) => (_jsxs("div", { className: "changelog-timeline-item", children: [_jsxs("div", { className: "changelog-timeline-date", children: [_jsxs("div", { className: "changelog-date-badge", children: [_jsx(Calendar, { size: 14 }), _jsx("span", { children: formatDate(entry.date) })] }), _jsxs("span", { className: "changelog-version-tag", children: ["v", entry.version] })] }), _jsx("div", { className: "changelog-timeline-content", children: _jsxs("div", { className: "changelog-card", children: [_jsx("h2", { className: "changelog-card-title", children: entry.title }), _jsx("div", { className: "changelog-change-list", children: entry.changes.map((change, idx) => (_jsxs("div", { className: `changelog-change-item ${change.type}`, children: [_jsxs("div", { className: "changelog-change-header", children: [_jsxs("span", { className: `changelog-tag ${change.type}`, children: [change.type === "feature" && _jsx(Sparkles, { size: 12 }), change.type === "improvement" && _jsx(Wrench, { size: 12 }), change.type === "bugfix" && _jsx(ShieldAlert, { size: 12 }), change.type === "feature" && "Feature", change.type === "improvement" && "Melhoria", change.type === "bugfix" && "Correção"] }), _jsx("h3", { children: change.title })] }), _jsx("p", { children: change.description })] }, idx))) })] }) })] }, entry.date))) })) : (_jsxs("div", { className: "changelog-empty", children: [_jsx(RefreshCw, { size: 24 }), _jsx("p", { children: tx("Nenhum registro encontrado para o filtro selecionado.", "未找到该筛选条件下的更新记录。") })] })) })] }));
}
