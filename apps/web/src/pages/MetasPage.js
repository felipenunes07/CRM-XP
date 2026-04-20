import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trophy, Target, Calendar, ChevronLeft, ChevronRight, Plus, Save, Trash2, Users, Briefcase } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { formatNumber, formatCurrency } from "../lib/format";
export function MetasPage() {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [isAdding, setIsAdding] = useState(false);
    // Form State
    const [newTarget, setNewTarget] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        attendant: 'TOTAL',
        targetAmount: "",
        targetRevenue: ""
    });
    const { data: targets = [], isLoading: loadingTargets } = useQuery({
        queryKey: ["monthly-targets", selectedYear],
        queryFn: () => api.getMonthlyTargets(token, selectedYear),
        enabled: !!token
    });
    const { data: dashboardData } = useQuery({
        queryKey: ["dashboard", 730],
        queryFn: () => api.dashboard(token, 730),
        enabled: !!token
    });
    const { data: attendantsData } = useQuery({
        queryKey: ["attendants"],
        queryFn: () => api.attendants(token),
        enabled: !!token
    });
    const saveMutation = useMutation({
        mutationFn: (target) => api.saveMonthlyTarget(token, target.year, target.month, target.targetAmount, target.attendant, target.targetRevenue),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["monthly-targets"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            setIsAdding(false);
            setNewTarget(prev => ({ ...prev, targetAmount: "", targetRevenue: "" }));
        },
        onError: (err) => {
            alert("Falha ao salvar meta. Verifique se os dados estão corretos: " + String(err));
        }
    });
    const monthNames = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const attendants = ["TOTAL", ...(attendantsData?.attendants.map(a => a.attendant) || [])];
    const globalTargets = targets.filter(t => t.attendant === 'TOTAL');
    const sellerTargets = targets.filter(t => t.attendant !== 'TOTAL');
    const handleSave = () => {
        const amount = Number(newTarget.targetAmount) || 0;
        const revenue = Number(newTarget.targetRevenue) || 0;
        if (amount <= 0 && revenue <= 0) {
            alert("Defina pelo menos um valor de meta (telas ou faturamento).");
            return;
        }
        if (newTarget.attendant !== 'TOTAL') {
            const global = globalTargets.find(t => t.month === newTarget.month && t.year === newTarget.year);
            if (!global) {
                alert("Por favor, defina a Meta Global (Empresa) para este mês antes de registrar metas individuais das vendedoras.");
                return;
            }
            const others = sellerTargets.filter(t => t.month === newTarget.month && t.year === newTarget.year && t.attendant !== newTarget.attendant);
            const allocatedAmount = others.reduce((acc, t) => acc + t.targetAmount, 0);
            const allocatedRevenue = others.reduce((acc, t) => acc + Number(t.targetRevenue || 0), 0);
            const globalRevenue = Number(global.targetRevenue || 0);
            if (amount + allocatedAmount > global.targetAmount) {
                alert(`A soma de telas das vendedoras (${amount + allocatedAmount}) ultrapassa a Meta Global da Empresa (${global.targetAmount}). Restam ${global.targetAmount - allocatedAmount} telas para distribuir.`);
                return;
            }
            if (globalRevenue > 0 && revenue + allocatedRevenue > globalRevenue) {
                alert(`A soma de faturamento das vendedoras (${formatCurrency(revenue + allocatedRevenue)}) ultrapassa a Meta Global da Empresa (${formatCurrency(globalRevenue)}). Restam ${formatCurrency(globalRevenue - allocatedRevenue)} para distribuir.`);
                return;
            }
        }
        saveMutation.mutate({
            year: newTarget.year,
            month: newTarget.month,
            attendant: newTarget.attendant,
            targetAmount: amount,
            targetRevenue: revenue
        });
    };
    const getActualsFor = (year, month, attendant) => {
        if (attendant === 'TOTAL') {
            const point = dashboardData?.itemsSoldTrend.find(p => p.year === year && p.month === month);
            return {
                amount: point?.totalItems || 0,
                revenue: point?.totalRevenue || 0
            };
        }
        else {
            const seller = attendantsData?.attendants.find(a => a.attendant === attendant);
            const point = seller?.monthlyTrend.find(p => {
                const [pYear, pMonth] = p.month.split('-').map(Number);
                return pYear === year && pMonth === month;
            });
            return {
                amount: point?.pieces || 0,
                revenue: point?.revenue || 0
            };
        }
    };
    const renderTargetRow = (target) => {
        const actuals = getActualsFor(target.year, target.month, target.attendant);
        const progress = target.targetAmount > 0 ? Math.round((actuals.amount / target.targetAmount) * 100) : 0;
        const revenueProgress = target.targetRevenue > 0 ? Math.round((actuals.revenue / target.targetRevenue) * 100) : 0;
        return (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' }, children: [_jsx(Calendar, { size: 14, className: "muted" }), _jsx("strong", { children: monthNames[target.month - 1] })] }) }), _jsx("td", { children: _jsx("span", { className: `badge ${target.attendant === 'TOTAL' ? 'primary' : 'neutral'}`, children: target.attendant === 'TOTAL' ? 'EMPRESA' : target.attendant }) }), _jsx("td", { children: formatNumber(target.targetAmount) }), _jsx("td", { style: { color: progress >= 100 ? 'var(--success)' : 'inherit', fontWeight: progress >= 100 ? 600 : 400 }, children: formatNumber(actuals.amount) }), _jsx("td", { children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' }, children: [_jsx("div", { className: "progress-bar-small", style: { width: '60px', height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', overflow: 'hidden' }, children: _jsx("div", { style: { width: `${Math.min(100, progress)}%`, height: '100%', background: progress >= 100 ? '#10b981' : '#3b82f6' } }) }), _jsxs("small", { children: [progress, "%"] })] }) }), _jsx("td", { style: { color: revenueProgress >= 100 ? 'var(--success)' : 'inherit', fontWeight: revenueProgress >= 100 ? 600 : 400 }, children: formatCurrency(actuals.revenue) }), _jsx("td", { children: _jsx("button", { className: "ghost-btn icon-only danger", title: "Remover Meta", onClick: () => {
                            if (window.confirm("Remover esta meta?")) {
                                saveMutation.mutate({
                                    year: target.year,
                                    month: target.month,
                                    attendant: target.attendant,
                                    targetAmount: 0,
                                    targetRevenue: 0
                                });
                            }
                        }, children: _jsx(Trash2, { size: 16 }) }) })] }, `${target.year}-${target.month}-${target.attendant}`));
    };
    const tableHeader = (_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "M\u00EAs / Ano" }), _jsx("th", { children: "Vendedora" }), _jsx("th", { children: "Meta Telas (un)" }), _jsx("th", { children: "Realizado Telas" }), _jsx("th", { children: "Progresso" }), _jsx("th", { children: "Faturamento (Realizado)" }), _jsx("th", { children: "A\u00E7\u00F5es" })] }) }));
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "dashboard-hero-premium", children: [_jsx("div", { className: "hero-premium-bg", children: _jsx("div", { className: "hero-premium-gradient" }) }), _jsxs("div", { className: "hero-premium-content", children: [_jsxs("div", { className: "hero-premium-copy", children: [_jsx("div", { className: "premium-badge", children: "Gest\u00E3o Comercial" }), _jsx("h2", { className: "premium-title", children: "Planejamento de Metas" }), _jsx("p", { className: "premium-subtitle", children: "Defina objetivos mensais para o time e acompanhe o desempenho hist\u00F3rico com detalhamento por vendedora." }), _jsxs("div", { className: "premium-actions", style: { display: 'flex', gap: '1rem', flexWrap: 'wrap' }, children: [_jsxs("button", { className: "premium-button primary", onClick: () => setIsAdding(!isAdding), children: [_jsx(Plus, { size: 18 }), isAdding ? "Cancelar" : "Nova Meta"] }), _jsxs("div", { className: "year-selector", style: {
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    background: '#fff',
                                                    border: '1px solid rgba(0,0,0,0.1)',
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '8px',
                                                    color: 'var(--text-color, #1e293b)',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                                }, children: [_jsx("button", { onClick: () => setSelectedYear(y => y - 1), style: { background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', padding: '0.25rem' }, children: _jsx(ChevronLeft, { size: 18 }) }), _jsx("strong", { style: { minWidth: '60px', textAlign: 'center', fontSize: '1.1rem' }, children: selectedYear }), _jsx("button", { onClick: () => setSelectedYear(y => y + 1), style: { background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', padding: '0.25rem' }, children: _jsx(ChevronRight, { size: 18 }) })] })] })] }), _jsxs("div", { className: "hero-premium-stats", children: [_jsxs("div", { className: "premium-stat-card", children: [_jsx("div", { className: "premium-stat-icon accent-success", children: _jsx(Trophy, { size: 20 }) }), _jsxs("div", { className: "premium-stat-info", children: [_jsx("span", { children: "Metas Globais Definidas" }), _jsxs("strong", { children: [globalTargets.length, " meses"] })] })] }), _jsxs("div", { className: "premium-stat-card", children: [_jsx("div", { className: "premium-stat-icon accent-primary", children: _jsx(Target, { size: 20 }) }), _jsxs("div", { className: "premium-stat-info", children: [_jsx("span", { children: "Metas de Vendedoras" }), _jsxs("strong", { children: [sellerTargets.length, " definidos"] })] })] })] })] })] }), isAdding && (_jsxs("section", { className: "panel animate-in", children: [_jsx("div", { className: "panel-header", children: _jsx("h3", { children: "Registrar Nova Meta" }) }), _jsxs("div", { style: { marginBottom: '2rem' }, children: [_jsx("label", { style: { display: 'block', fontWeight: 600, marginBottom: '1rem', fontSize: '1.1rem' }, children: "Que tipo de meta deseja cadastrar?" }), _jsxs("div", { className: "grid-responsive", style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }, children: [_jsxs("div", { onClick: () => setNewTarget({ ...newTarget, attendant: 'TOTAL' }), style: {
                                            border: `2px solid ${newTarget.attendant === 'TOTAL' ? 'var(--primary)' : 'rgba(0,0,0,0.1)'}`,
                                            borderRadius: '12px',
                                            padding: '1.25rem',
                                            cursor: 'pointer',
                                            background: newTarget.attendant === 'TOTAL' ? 'rgba(59, 130, 246, 0.05)' : '#fff',
                                            transition: 'all 0.2s ease-in-out'
                                        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }, children: [_jsx("input", { type: "radio", checked: newTarget.attendant === 'TOTAL', readOnly: true, style: { margin: 0, width: '1.2rem', height: '1.2rem', accentColor: 'var(--primary)' } }), _jsx("strong", { style: { fontSize: '1.1rem', color: newTarget.attendant === 'TOTAL' ? 'var(--primary)' : 'inherit' }, children: "Meta da Empresa" })] }), _jsx("p", { className: "muted", style: { margin: 0, paddingLeft: '2rem', fontSize: '0.9rem', lineHeight: 1.4 }, children: "Define o objetivo global consolidado de vendas para o m\u00EAs." })] }), _jsxs("div", { onClick: () => {
                                            const firstSeller = attendants.find(a => a !== 'TOTAL') || 'TOTAL';
                                            setNewTarget({ ...newTarget, attendant: firstSeller });
                                        }, style: {
                                            border: `2px solid ${newTarget.attendant !== 'TOTAL' ? 'var(--primary)' : 'rgba(0,0,0,0.1)'}`,
                                            borderRadius: '12px',
                                            padding: '1.25rem',
                                            cursor: 'pointer',
                                            background: newTarget.attendant !== 'TOTAL' ? 'rgba(59, 130, 246, 0.05)' : '#fff',
                                            transition: 'all 0.2s ease-in-out'
                                        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }, children: [_jsx("input", { type: "radio", checked: newTarget.attendant !== 'TOTAL', readOnly: true, style: { margin: 0, width: '1.2rem', height: '1.2rem', accentColor: 'var(--primary)' } }), _jsx("strong", { style: { fontSize: '1.1rem', color: newTarget.attendant !== 'TOTAL' ? 'var(--primary)' : 'inherit' }, children: "Meta Individual (Vendedora)" })] }), _jsx("p", { className: "muted", style: { margin: 0, paddingLeft: '2rem', fontSize: '0.9rem', lineHeight: 1.4 }, children: "Define uma cota espec\u00EDfica e individual para uma vendedora do time." })] })] })] }), _jsx("div", { style: { height: '1px', background: 'var(--border-color)', margin: '0 0 2rem 0' } }), _jsxs("div", { className: "grid-responsive", style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }, children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "M\u00EAs de Refer\u00EAncia" }), _jsx("select", { value: newTarget.month, onChange: e => setNewTarget({ ...newTarget, month: parseInt(e.target.value) }), className: "form-input", children: monthNames.map((name, i) => _jsx("option", { value: i + 1, children: name }, i)) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Ano de Refer\u00EAncia" }), _jsx("input", { type: "number", value: newTarget.year, onChange: e => setNewTarget({ ...newTarget, year: parseInt(e.target.value) }), className: "form-input" })] }), newTarget.attendant !== 'TOTAL' && (_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Selecione a Vendedora" }), _jsx("select", { value: newTarget.attendant, onChange: e => setNewTarget({ ...newTarget, attendant: e.target.value }), className: "form-input", style: { borderColor: 'var(--primary)' }, children: attendants.filter(a => a !== 'TOTAL').map(a => _jsx("option", { value: a, children: a }, a)) })] })), newTarget.attendant === 'TOTAL' && (_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Vis\u00E3o" }), _jsx("input", { className: "form-input", value: "Todas as Vendedoras (Global)", disabled: true, style: { opacity: 0.6, background: 'rgba(0,0,0,0.02)' } })] })), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Meta de Telas (un)" }), _jsx("input", { type: "number", value: newTarget.targetAmount, onChange: e => setNewTarget({ ...newTarget, targetAmount: e.target.value }), className: "form-input", placeholder: "Ex: 500" })] })] }), _jsxs("div", { style: { marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }, children: [_jsx("button", { className: "premium-button ghost", onClick: () => setIsAdding(false), children: "Cancelar" }), _jsxs("button", { className: "premium-button primary", onClick: handleSave, disabled: saveMutation.isPending, children: [_jsx(Save, { size: 18 }), saveMutation.isPending ? "Salvando..." : "Salvar Meta"] })] })] })), _jsxs("div", { style: { display: 'grid', gap: '2rem', marginTop: '2rem' }, children: [_jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.75rem' }, children: [_jsx(Briefcase, { className: "muted", size: 20 }), _jsxs("div", { children: [_jsx("h3", { children: "Metas da Empresa (Globais)" }), _jsxs("p", { className: "muted", children: ["An\u00E1lise de desempenho total da empresa consolidada ao longo de ", selectedYear] })] })] }) }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table", children: [tableHeader, _jsx("tbody", { children: loadingTargets ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, style: { textAlign: 'center', padding: '2rem' }, children: "Carregando metas globais..." }) })) : globalTargets.length === 0 ? (_jsx("tr", { children: _jsxs("td", { colSpan: 8, style: { textAlign: 'center', padding: '2rem' }, children: ["Nenhuma meta global registrada para a empresa em ", selectedYear, "."] }) })) : (globalTargets.map(renderTargetRow)) })] }) })] }), _jsxs("section", { className: "panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '0.75rem' }, children: [_jsx(Users, { className: "muted", size: 20 }), _jsxs("div", { children: [_jsx("h3", { children: "Metas por Vendedora" }), _jsxs("p", { className: "muted", children: ["An\u00E1lise de desempenho individual da equipe comercial em ", selectedYear] })] })] }) }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table", children: [tableHeader, _jsx("tbody", { children: loadingTargets ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, style: { textAlign: 'center', padding: '2rem' }, children: "Carregando metas das vendedoras..." }) })) : sellerTargets.length === 0 ? (_jsx("tr", { children: _jsxs("td", { colSpan: 8, style: { textAlign: 'center', padding: '2rem' }, children: ["Nenhuma meta individual registrada para a equipe em ", selectedYear, "."] }) })) : (sellerTargets.map(renderTargetRow)) })] }) })] })] })] }));
}
