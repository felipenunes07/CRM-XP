import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, TrendingDown, TrendingUp, ExternalLink, Search, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { useUiLanguage } from "../i18n";
import { useAuth } from "../hooks/useAuth";
export function CustomerMovementsPanel({ initialDays = 7 }) {
    const { tx } = useUiLanguage();
    const { token } = useAuth();
    const [days, setDays] = useState(initialDays);
    const [filter, setFilter] = useState("");
    const [activeTab, setActiveTab] = useState("deterioration");
    const { data, isLoading } = useQuery({
        queryKey: ["dashboard", "movements", days],
        queryFn: async () => {
            if (!token)
                return null;
            return api.customerMovements(token, days);
        },
        enabled: !!token,
    });
    const movements = data?.movements ?? [];
    const filteredMovements = movements.filter((m) => {
        const searchMatch = m.displayName.toLowerCase().includes(filter.toLowerCase()) ||
            m.customerCode.toLowerCase().includes(filter.toLowerCase());
        if (!searchMatch)
            return false;
        if (activeTab === "deterioration") {
            return (m.fromStatus === "ACTIVE" && m.toStatus === "ATTENTION") ||
                (m.fromStatus === "ATTENTION" && m.toStatus === "INACTIVE") ||
                (m.fromStatus === "ACTIVE" && m.toStatus === "INACTIVE");
        }
        else {
            return (m.toStatus === "ACTIVE" && (m.fromStatus === "ATTENTION" || m.fromStatus === "INACTIVE" || m.fromStatus === "NEW"));
        }
    });
    const getStatusBadge = (status) => {
        switch (status) {
            case "ACTIVE":
                return _jsx("span", { className: "badge-active", children: tx("Ativo", "Active") });
            case "ATTENTION":
                return _jsx("span", { className: "badge-attention", children: tx("Atenção", "Attention") });
            case "INACTIVE":
                return _jsx("span", { className: "badge-inactive", children: tx("Inativo", "Inactive") });
            case "NEW":
                return _jsx("span", { className: "badge-new", children: tx("Novo", "New") });
            default:
                return _jsx("span", { children: status });
        }
    };
    return (_jsxs("section", { className: "customer-movements-panel", children: [_jsxs("div", { className: "panel-header", style: { marginBottom: "1.5rem" }, children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", style: { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }, children: [_jsx(TrendingDown, { className: "text-blue-500", size: 20, style: { color: "#2956d7" } }), _jsx("p", { className: "eyebrow", children: tx("Monitoramento de Status", "Status Monitoring") })] }), _jsx("h4", { children: tx("Movimentação da Base", "Customer Movements") }), _jsx("p", { className: "panel-subcopy", children: tx("Acompanhe quem mudou de status nos últimos dias para agir rápido.", "Track who changed status in the last few days to act fast.") })] }), _jsx("div", { className: "flex items-center gap-4", style: { display: "flex", alignItems: "center", gap: "1rem" }, children: _jsxs("div", { className: "period-loss-chart-toggle", style: { margin: 0 }, children: [_jsx("button", { type: "button", className: `chart-switch-button ${days === 7 ? "active" : ""}`, onClick: () => setDays(7), children: _jsx("strong", { children: "7d" }) }), _jsx("button", { type: "button", className: `chart-switch-button ${days === 15 ? "active" : ""}`, onClick: () => setDays(15), children: _jsx("strong", { children: "15d" }) }), _jsx("button", { type: "button", className: `chart-switch-button ${days === 30 ? "active" : ""}`, onClick: () => setDays(30), children: _jsx("strong", { children: "30d" }) })] }) })] }), _jsxs("div", { className: "movements-tabs-container", children: [_jsxs("div", { className: "movements-tabs", role: "tablist", children: [_jsxs("button", { className: `movements-tab ${activeTab === "deterioration" ? "active" : ""}`, onClick: () => setActiveTab("deterioration"), children: [_jsx(TrendingDown, { size: 18 }), _jsx("span", { children: tx("Perda de Status", "Status Loss") }), _jsx("span", { className: "tab-count", children: movements.filter(m => (m.fromStatus === "ACTIVE" && m.toStatus === "ATTENTION") ||
                                            (m.fromStatus === "ATTENTION" && m.toStatus === "INACTIVE") ||
                                            (m.fromStatus === "ACTIVE" && m.toStatus === "INACTIVE")).length })] }), _jsxs("button", { className: `movements-tab ${activeTab === "recovery" ? "active" : ""}`, onClick: () => setActiveTab("recovery"), children: [_jsx(TrendingUp, { size: 18 }), _jsx("span", { children: tx("Novos e Recuperados", "New & Recovered") }), _jsx("span", { className: "tab-count", children: movements.filter(m => (m.toStatus === "ACTIVE" && (m.fromStatus === "ATTENTION" || m.fromStatus === "INACTIVE" || m.fromStatus === "NEW"))).length })] })] }), _jsxs("div", { className: "movements-search", children: [_jsx(Search, { size: 16 }), _jsx("input", { type: "text", placeholder: tx("Buscar cliente...", "Search customer..."), value: filter, onChange: (e) => setFilter(e.target.value) })] })] }), isLoading ? (_jsx("div", { className: "empty-state", children: tx("Carregando...", "Loading...") })) : filteredMovements.length === 0 ? (_jsxs("div", { className: "empty-state", style: { padding: "3rem", textAlign: "center" }, children: [_jsx(Users, { size: 48, style: { marginBottom: "1rem", opacity: 0.2, margin: "0 auto" } }), _jsx("p", { style: { color: "#64748b" }, children: tx("Nenhuma movimentação encontrada para este período.", "No movements found for this period.") })] })) : (_jsx("div", { className: "period-loss-table-wrap", children: _jsxs("table", { className: "period-loss-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: tx("Cliente", "Customer") }), _jsx("th", { children: tx("De", "From") }), _jsx("th", {}), _jsx("th", { children: tx("Para", "To") }), _jsx("th", { children: tx("Última Compra", "Last Purchase") }), _jsx("th", { children: tx("Dias sem comprar", "Days Inactive") }), _jsx("th", { style: { textAlign: "right" }, children: tx("Ação", "Action") })] }) }), _jsx("tbody", { children: filteredMovements.map((m) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("div", { className: "period-loss-customer-cell", children: [_jsx(Link, { to: `/clientes/${m.customerId}`, children: m.displayName }), _jsx("span", { className: "customer-code-sub", children: m.customerCode })] }) }), _jsx("td", { children: getStatusBadge(m.fromStatus) }), _jsx("td", { children: _jsx(ArrowRight, { size: 14, style: { opacity: 0.4 } }) }), _jsx("td", { children: getStatusBadge(m.toStatus) }), _jsx("td", { children: m.lastPurchaseAt ? formatDate(m.lastPurchaseAt) : "--" }), _jsx("td", { children: _jsxs("span", { className: `days-badge ${m.daysSinceLastPurchase > 30 ? "text-danger" : ""}`, children: [m.daysSinceLastPurchase, " ", tx("dias", "days")] }) }), _jsx("td", { style: { textAlign: "right" }, children: _jsxs(Link, { to: `/clientes/${m.customerId}`, className: "btn-action-small", children: [_jsx(ExternalLink, { size: 14 }), tx("Ver", "View")] }) })] }, m.customerId))) })] }) })), _jsx("style", { dangerouslySetInnerHTML: { __html: `
        .customer-movements-panel {
          background: #fff;
          border-radius: 12px;
          padding: 1.5rem;
          margin-top: 2rem;
          border: 1px solid rgba(41, 86, 215, 0.1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        }
        .movements-tabs-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .movements-tabs {
          display: flex;
          gap: 0.5rem;
          background: #f8fafc;
          padding: 0.25rem;
          border-radius: 8px;
        }
        .movements-tab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-weight: 500;
          color: #64748b;
          transition: all 0.2s;
        }
        .movements-tab.active {
          background: #fff;
          color: #2956d7;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .tab-count {
          background: rgba(100, 116, 139, 0.1);
          padding: 0.1rem 0.5rem;
          border-radius: 99px;
          font-size: 0.75rem;
          margin-left: 0.25rem;
        }
        .movements-tab.active .tab-count {
          background: rgba(41, 86, 215, 0.1);
        }
        .movements-search {
          position: relative;
          display: flex;
          align-items: center;
          background: #f8fafc;
          border-radius: 8px;
          padding: 0 0.75rem;
          border: 1px solid transparent;
          transition: all 0.2s;
          flex: 1;
          max-width: 300px;
        }
        .movements-search:focus-within {
          border-color: rgba(41, 86, 215, 0.3);
          background: #fff;
          box-shadow: 0 0 0 3px rgba(41, 86, 215, 0.05);
        }
        .movements-search input {
          border: none;
          background: transparent;
          padding: 0.5rem;
          outline: none;
          width: 100%;
          font-size: 0.875rem;
        }
        .customer-code-sub {
          font-size: 0.7rem;
          color: #94a3b8;
          display: block;
          margin-top: 0.1rem;
        }
        .btn-action-small {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.3rem 0.75rem;
          background: #f1f5f9;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #475569;
          text-decoration: none;
          transition: all 0.2s;
        }
        .btn-action-small:hover {
          background: #e2e8f0;
          color: #1e293b;
        }
        .badge-active { background: #dcfce7; color: #15803d; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
        .badge-attention { background: #fef9c3; color: #854d0e; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
        .badge-inactive { background: #fee2e2; color: #991b1b; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
        .badge-new { background: #e0f2fe; color: #0369a1; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
        .days-badge { font-weight: 600; font-size: 0.875rem; }
        .text-danger { color: #ef4444; }
      ` } })] }));
}
