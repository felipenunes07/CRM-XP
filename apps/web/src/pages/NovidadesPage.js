import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Sparkles, Wrench, ShieldAlert, Calendar, Clock, RefreshCw, PartyPopper, ThumbsUp, Plus, Trash2, MessageSquare, Send, Check, RotateCcw } from "lucide-react";
import { useUiLanguage } from "../i18n";
// ── Seeded Commit-based Changelog ──
const changelogData = [
    {
        date: "2026-05-20",
        version: "1.1.0",
        title: "Central de Changelog & Otimizações no WhatsApp",
        changes: [
            {
                type: "feature",
                title: "Changelog do Sistema",
                description: "Lançamento da central de Changelog integrada ao menu 'Mais' para permitir que toda a equipe acompanhe as novas funcionalidades, melhorias e correções feitas no CRM XP em tempo real."
            },
            {
                type: "improvement",
                title: "Visualização Limpa da Atividade do WhatsApp",
                description: "Reestruturação da aba de Conversas nos Relatórios do WhatsApp. A tabela lateral de lista de conversas foi removida para foco exclusivo nos gráficos estatísticos, que agora ocupam 100% da largura útil da tela em um grid elegante de 2 colunas."
            }
        ]
    },
    {
        date: "2026-05-18",
        version: "1.0.8",
        title: "Relatório de Métricas do WhatsApp",
        changes: [
            {
                type: "feature",
                title: "Página WhatsappActivityPage",
                description: "Implementação do painel avançado para visualizar e reportar métricas detalhadas de conversas, fluxos e interações ativas do WhatsApp."
            },
            {
                type: "improvement",
                title: "Estrutura do Cliente da API do CRM",
                description: "Otimização das conexões internas de rede e do módulo de API cliente no frontend para consultas mais eficientes ao backend."
            }
        ]
    },
    {
        date: "2026-05-12",
        version: "1.0.4",
        title: "Dashboard de Vendas Geográficas & Segurança",
        changes: [
            {
                type: "feature",
                title: "Dashboard Geográfico Interativo",
                description: "Lançamento do mapa de vendas com estatísticas regionais, facilitando a identificação da distribuição física dos contatos e clientes."
            },
            {
                type: "improvement",
                title: "Migração para Variáveis de Ambiente",
                description: "Correção de segurança crucial removendo credenciais estáticas de banco de dados e padronizando a autenticação via variáveis de ambiente (.env)."
            }
        ]
    }
];
// ── Initial Seed Suggestions ──
const initialSuggestions = [
    {
        id: "sug-1",
        type: "feature",
        title: "Integração Bidirecional com Google Calendar",
        description: "Sincronizar tarefas e lembretes criados na Agenda do CRM XP diretamente com a conta Google do atendente.",
        urgency: "medium",
        status: "pending",
        votes: 8,
        votedBy: [],
        createdAt: "2026-05-19"
    },
    {
        id: "sug-2",
        type: "bugfix",
        title: "Delay nas notificações sonoras do chat",
        description: "Ocasionalmente o som de nova mensagem recebida toca com 5 a 10 segundos de atraso no navegador Chrome.",
        urgency: "high",
        status: "pending",
        votes: 12,
        votedBy: [],
        createdAt: "2026-05-20"
    },
    {
        id: "sug-3",
        type: "improvement",
        title: "Filtro de tags múltiplas no Kanban",
        description: "Permitir selecionar mais de um rótulo simultaneamente para filtrar os cards no Pipeline.",
        urgency: "low",
        status: "completed",
        votes: 5,
        votedBy: [],
        createdAt: "2026-05-15"
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
    // Tabs State: "changelog" | "suggestions"
    const [activeTab, setActiveTab] = useState("changelog");
    // Changelog Filtering
    const [changelogFilter, setChangelogFilter] = useState("all");
    // Suggestions State
    const [suggestions, setSuggestions] = useState([]);
    // Form State
    const [newTitle, setNewTitle] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [newType, setNewType] = useState("feature");
    const [newUrgency, setNewUrgency] = useState("medium");
    const [showForm, setShowForm] = useState(false);
    const [suggestionFilter, setSuggestionFilter] = useState("all");
    // Load Suggestions
    useEffect(() => {
        const cached = localStorage.getItem("crm_xp_changelog_suggestions");
        if (cached) {
            try {
                setSuggestions(JSON.parse(cached));
            }
            catch (e) {
                setSuggestions(initialSuggestions);
            }
        }
        else {
            setSuggestions(initialSuggestions);
            localStorage.setItem("crm_xp_changelog_suggestions", JSON.stringify(initialSuggestions));
        }
    }, []);
    // Save Suggestions helper
    const saveSuggestions = (updated) => {
        setSuggestions(updated);
        localStorage.setItem("crm_xp_changelog_suggestions", JSON.stringify(updated));
    };
    // Handle Add Suggestion
    const handleAddSuggestion = (e) => {
        e.preventDefault();
        if (!newTitle.trim() || !newDescription.trim())
            return;
        const newItem = {
            id: `sug-${Date.now()}`,
            type: newType,
            title: newTitle.trim(),
            description: newDescription.trim(),
            urgency: newUrgency,
            status: "pending",
            votes: 1,
            votedBy: ["me"], // Automatically voted by creator
            createdAt: new Date().toISOString().split("T")[0] || "2026-05-20"
        };
        const nextSuggestions = [newItem, ...suggestions];
        saveSuggestions(nextSuggestions);
        // Clear form
        setNewTitle("");
        setNewDescription("");
        setNewType("feature");
        setNewUrgency("medium");
        setShowForm(false);
    };
    // Upvote
    const handleUpvote = (id) => {
        const next = suggestions.map(item => {
            if (item.id === id) {
                const hasVoted = item.votedBy.includes("me");
                return {
                    ...item,
                    votes: hasVoted ? item.votes - 1 : item.votes + 1,
                    votedBy: hasVoted
                        ? item.votedBy.filter(u => u !== "me")
                        : [...item.votedBy, "me"]
                };
            }
            return item;
        });
        saveSuggestions(next);
    };
    // Toggle Status (Felipe/Admin marks completed)
    const handleToggleStatus = (id) => {
        const next = suggestions.map(item => {
            if (item.id === id) {
                return {
                    ...item,
                    status: item.status === "completed" ? "pending" : "completed"
                };
            }
            return item;
        });
        saveSuggestions(next);
    };
    // Delete Suggestion
    const handleDeleteSuggestion = (id) => {
        if (window.confirm(tx("Deseja realmente remover esta sugestão?", "确认要删除此建议吗？"))) {
            const next = suggestions.filter(item => item.id !== id);
            saveSuggestions(next);
        }
    };
    // Filtered Changelog
    const filteredChangelog = changelogData
        .map(entry => {
        const changes = entry.changes.filter(c => changelogFilter === "all" || c.type === changelogFilter);
        return { ...entry, changes };
    })
        .filter(entry => entry.changes.length > 0);
    // Filtered & Sorted Suggestions
    const filteredSuggestions = suggestions
        .filter(item => {
        if (suggestionFilter === "all")
            return true;
        return item.status === suggestionFilter;
    })
        .sort((a, b) => b.votes - a.votes); // Most voted first
    return (_jsxs("div", { className: "changelog-page", children: [_jsxs("header", { className: "changelog-header", children: [_jsxs("div", { className: "changelog-header-left", children: [_jsxs("div", { className: "changelog-eyebrow", children: [_jsx(PartyPopper, { size: 14 }), _jsx("span", { children: "CENTRAL DO SISTEMA" })] }), _jsx("h1", { children: tx("Changelog & Sugestões", "更新日志与功能建议") }), _jsx("p", { children: tx("Acompanhe o que foi lançado e ajude a decidir o que deve ser priorizado no CRM XP", "追踪已发布功能并共同决定 CRM XP 的未来开发优先级") })] }), _jsxs("div", { className: "changelog-badge", children: [_jsx(Clock, { size: 16 }), _jsx("span", { children: "Vers\u00E3o Atual: v1.1.0" })] })] }), _jsxs("div", { className: "changelog-tab-switcher", children: [_jsxs("button", { type: "button", className: `tab-btn ${activeTab === "changelog" ? "active" : ""}`, onClick: () => setActiveTab("changelog"), children: [_jsx(Clock, { size: 16 }), _jsx("span", { children: tx("Histórico de Atualizações", "系统更新日志") })] }), _jsxs("button", { type: "button", className: `tab-btn ${activeTab === "suggestions" ? "active" : ""}`, onClick: () => setActiveTab("suggestions"), children: [_jsx(MessageSquare, { size: 16 }), _jsx("span", { children: tx("Sugestões & Roadmap", "建议反馈与路线图") }), suggestions.filter(s => s.status === "pending").length > 0 && (_jsx("span", { className: "pending-badge", children: suggestions.filter(s => s.status === "pending").length }))] })] }), activeTab === "changelog" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "changelog-filters", children: [_jsx("button", { type: "button", className: changelogFilter === "all" ? "active" : "", onClick: () => setChangelogFilter("all"), children: tx("Todas", "全部") }), _jsxs("button", { type: "button", className: changelogFilter === "feature" ? "active feature" : "", onClick: () => setChangelogFilter("feature"), children: [_jsx(Sparkles, { size: 14 }), tx("Features", "新功能")] }), _jsxs("button", { type: "button", className: changelogFilter === "improvement" ? "active improvement" : "", onClick: () => setChangelogFilter("improvement"), children: [_jsx(Wrench, { size: 14 }), tx("Melhorias", "功能改进")] }), _jsxs("button", { type: "button", className: changelogFilter === "bugfix" ? "active bugfix" : "", onClick: () => setChangelogFilter("bugfix"), children: [_jsx(ShieldAlert, { size: 14 }), tx("Correções", "问题修复")] })] }), _jsx("div", { className: "changelog-timeline-container", children: filteredChangelog.length > 0 ? (_jsx("div", { className: "changelog-timeline", children: filteredChangelog.map((entry) => (_jsxs("div", { className: "changelog-timeline-item", children: [_jsx("div", { className: "changelog-timeline-marker" }), _jsxs("div", { className: "changelog-timeline-date", children: [_jsxs("div", { className: "changelog-date-badge", children: [_jsx(Calendar, { size: 14 }), _jsx("span", { children: formatDate(entry.date) })] }), _jsxs("span", { className: "changelog-version-tag", children: ["v", entry.version] })] }), _jsx("div", { className: "changelog-timeline-content", children: _jsxs("div", { className: "changelog-card", children: [_jsx("h2", { className: "changelog-card-title", children: entry.title }), _jsx("div", { className: "changelog-change-list", children: entry.changes.map((change, idx) => (_jsxs("div", { className: `changelog-change-item ${change.type}`, children: [_jsxs("div", { className: "changelog-change-header", children: [_jsxs("span", { className: `changelog-tag ${change.type}`, children: [change.type === "feature" && _jsx(Sparkles, { size: 12 }), change.type === "improvement" && _jsx(Wrench, { size: 12 }), change.type === "bugfix" && _jsx(ShieldAlert, { size: 12 }), change.type === "feature" && "Feature", change.type === "improvement" && "Melhoria", change.type === "bugfix" && "Correção"] }), _jsx("h3", { children: change.title })] }), _jsx("p", { children: change.description })] }, idx))) })] }) })] }, entry.date))) })) : (_jsxs("div", { className: "changelog-empty", children: [_jsx(RefreshCw, { size: 24, className: "spin-icon" }), _jsx("h3", { children: tx("Nenhum registro", "没有记录") }), _jsx("p", { children: tx("Nenhum registro encontrado para o filtro selecionado.", "未找到该筛选条件下的更新记录。") })] })) })] })), activeTab === "suggestions" && (_jsxs("div", { className: "roadmap-section", children: [_jsxs("div", { className: "roadmap-toolbar", children: [_jsxs("div", { className: "roadmap-filters", children: [_jsx("button", { type: "button", className: suggestionFilter === "all" ? "active" : "", onClick: () => setSuggestionFilter("all"), children: tx("Todas as Sugestões", "所有建议") }), _jsx("button", { type: "button", className: suggestionFilter === "pending" ? "active" : "", onClick: () => setSuggestionFilter("pending"), children: tx("Em Aberto", "待处理") }), _jsx("button", { type: "button", className: suggestionFilter === "completed" ? "active" : "", onClick: () => setSuggestionFilter("completed"), children: tx("Concluídas", "已完成") })] }), _jsxs("button", { type: "button", className: "add-suggestion-trigger-btn", onClick: () => setShowForm(!showForm), children: [showForm ? _jsx(RotateCcw, { size: 16 }) : _jsx(Plus, { size: 16 }), _jsx("span", { children: showForm ? tx("Fechar Formulário", "关闭表单") : tx("Nova Sugestão / Aviso", "提交新建议/报告") })] })] }), showForm && (_jsxs("form", { onSubmit: handleAddSuggestion, className: "roadmap-form-card", children: [_jsx("h3", { children: tx("O que podemos melhorar no sistema?", "为系统提交新建议") }), _jsx("p", { className: "form-helper", children: tx("Registre uma nova sugestão de melhoria, aviso de bug ou feature. Toda a equipe poderá ver e votar para ajudar na priorização.", "提交功能建议或报告缺陷，全团队都可参与投票帮助优先级决策。") }), _jsxs("div", { className: "form-grid", children: [_jsxs("div", { className: "form-group full-width", children: [_jsx("label", { htmlFor: "sug-title", children: tx("Título Objetivo", "建议标题") }), _jsx("input", { id: "sug-title", type: "text", required: true, placeholder: tx("Ex: Integração automática com WhatsApp API", "例如：与 WhatsApp 接口自动同步"), value: newTitle, onChange: (e) => setNewTitle(e.target.value) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "sug-type", children: tx("Tipo de Registro", "反馈类型") }), _jsxs("select", { id: "sug-type", value: newType, onChange: (e) => setNewType(e.target.value), children: [_jsx("option", { value: "feature", children: "\u2728 Feature (Nova Funcionalidade)" }), _jsx("option", { value: "improvement", children: "\uD83D\uDD27 Melhoria (Otimiza\u00E7\u00E3o)" }), _jsx("option", { value: "bugfix", children: "\u26A0\uFE0F Bug (Aviso de Problema)" })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { htmlFor: "sug-urgency", children: tx("Grau de Urgência", "紧急程度") }), _jsxs("select", { id: "sug-urgency", value: newUrgency, onChange: (e) => setNewUrgency(e.target.value), children: [_jsx("option", { value: "low", children: "\uD83D\uDD35 Baixa (Pode esperar)" }), _jsx("option", { value: "medium", children: "\uD83D\uDFE1 M\u00E9dia (Importante)" }), _jsx("option", { value: "high", children: "\uD83D\uDD34 Alta (Urgente / Impeditivo)" })] })] }), _jsxs("div", { className: "form-group full-width", children: [_jsx("label", { htmlFor: "sug-desc", children: tx("Descrição Detalhada", "详细描述") }), _jsx("textarea", { id: "sug-desc", required: true, rows: 4, placeholder: tx("Explique o que é, o benefício prático e como deve funcionar...", "请详细说明该建议的实际应用场景、预期效果或问题复现步骤..."), value: newDescription, onChange: (e) => setNewDescription(e.target.value) })] })] }), _jsx("div", { className: "form-actions", children: _jsxs("button", { type: "submit", className: "form-submit-btn", children: [_jsx(Send, { size: 14 }), _jsx("span", { children: tx("Enviar Registro para o Quadro", "发布到看板") })] }) })] })), _jsx("div", { className: "roadmap-list", children: filteredSuggestions.length > 0 ? (_jsx("div", { className: "roadmap-list-container", children: filteredSuggestions.map((item) => {
                                const hasVoted = item.votedBy.includes("me");
                                return (_jsxs("div", { className: `roadmap-list-row ${item.status === "completed" ? "completed" : ""}`, children: [_jsx("div", { className: "row-vote-col", children: _jsxs("button", { type: "button", className: `row-vote-btn ${hasVoted ? "voted" : ""}`, onClick: () => handleUpvote(item.id), title: hasVoted ? "Remover voto útil" : "Votar como útil", children: [_jsx(ThumbsUp, { size: 12 }), _jsx("span", { children: item.votes })] }) }), _jsx("div", { className: "row-type-col", children: _jsxs("span", { className: `changelog-tag compact ${item.type}`, children: [item.type === "feature" && _jsx(Sparkles, { size: 10 }), item.type === "improvement" && _jsx(Wrench, { size: 10 }), item.type === "bugfix" && _jsx(ShieldAlert, { size: 10 }), item.type === "feature" && tx("Feature", "新功能"), item.type === "improvement" && tx("Melhoria", "改进"), item.type === "bugfix" && tx("Bug", "问题")] }) }), _jsxs("div", { className: "row-info-col", children: [_jsxs("div", { className: "row-title-row", children: [_jsx("h4", { children: item.title }), _jsxs("span", { className: `urgency-badge compact ${item.urgency}`, children: [item.urgency === "high" && "🔴 Alta", item.urgency === "medium" && "🟡 Média", item.urgency === "low" && "🔵 Baixa"] }), _jsx("span", { className: `status-badge compact ${item.status}`, children: item.status === "completed" ? tx("Concluída", "已完成") : tx("Pendente", "待处理") })] }), _jsx("p", { children: item.description }), _jsxs("span", { className: "row-date", children: [tx("Registrado em", "提交于"), ": ", formatDate(item.createdAt)] })] }), _jsxs("div", { className: "row-actions-col", children: [_jsxs("button", { type: "button", className: `toggle-status-btn compact ${item.status === "completed" ? "undo" : ""}`, onClick: () => handleToggleStatus(item.id), title: item.status === "completed" ? "Reabrir sugestão" : "Marcar como concluída", children: [item.status === "completed" ? _jsx(RotateCcw, { size: 12 }) : _jsx(Check, { size: 12 }), _jsx("span", { children: item.status === "completed" ? tx("Reabrir", "重新开启") : tx("Concluir", "完成") })] }), _jsx("button", { type: "button", className: "delete-sug-btn compact", onClick: () => handleDeleteSuggestion(item.id), title: "Remover do quadro", children: _jsx(Trash2, { size: 12 }) })] })] }, item.id));
                            }) })) : (_jsxs("div", { className: "roadmap-empty-board", children: [_jsx(MessageSquare, { size: 36 }), _jsx("h3", { children: tx("Nenhuma sugestão registrada", "尚无任何反馈建议") }), _jsx("p", { children: tx("Seja o primeiro a enviar uma ideia ou reportar um bug para melhorarmos o CRM XP!", "点击右上角按钮提交第一份功能建议或缺陷报告！") })] })) })] }))] }));
}
