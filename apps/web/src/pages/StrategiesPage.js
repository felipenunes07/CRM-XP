import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Crosshair, RefreshCw, ChevronDown, ChevronRight, Package, Users, ShieldAlert, UserX, Search, Layers, TrendingUp, Box, } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
/* ── Helpers ── */
function formatNumber(value) {
    return value.toLocaleString("pt-BR");
}
function formatCurrency(value) {
    return value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}
function formatDate(dateStr) {
    if (!dateStr)
        return "—";
    try {
        const date = new Date(dateStr + "T00:00:00");
        return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
    catch {
        return dateStr;
    }
}
function getStockBadgeClass(qty) {
    if (qty === null || qty === undefined)
        return "strat-stock-none";
    if (qty >= 50)
        return "strat-stock-high";
    if (qty >= 20)
        return "strat-stock-medium";
    if (qty > 0)
        return "strat-stock-low";
    return "strat-stock-out";
}
function getStatusConfig(status) {
    switch (status) {
        case "ACTIVE":
            return { label: "Ativos", icon: Users, color: "#22c55e", bgColor: "rgba(34,197,94,0.12)" };
        case "ATTENTION":
            return { label: "Atenção", icon: ShieldAlert, color: "#f59e0b", bgColor: "rgba(245,158,11,0.12)" };
        case "INACTIVE":
            return { label: "Inativos", icon: UserX, color: "#ef4444", bgColor: "rgba(239,68,68,0.12)" };
    }
}
/* ── Customer Card Component ── */
function CustomerCard({ customer, showStockFilter, }) {
    const [expanded, setExpanded] = useState(false);
    const products = showStockFilter ? customer.productsWithStock : customer.productsAll;
    const statusCfg = getStatusConfig(customer.status);
    return (_jsxs("div", { className: `strat-customer-card ${expanded ? "strat-card-expanded" : ""}`, children: [_jsxs("button", { type: "button", className: "strat-customer-header", onClick: () => setExpanded(!expanded), "aria-expanded": expanded, children: [_jsxs("div", { className: "strat-customer-left", children: [expanded ? _jsx(ChevronDown, { size: 16 }) : _jsx(ChevronRight, { size: 16 }), _jsx("span", { className: "strat-status-dot", style: { backgroundColor: statusCfg.color } }), _jsxs("div", { className: "strat-customer-info", children: [_jsx("strong", { className: "strat-customer-name", children: customer.displayName }), _jsx("span", { className: "strat-customer-code", children: customer.customerCode })] })] }), _jsxs("div", { className: "strat-customer-stats", children: [_jsxs("span", { className: "strat-stat-pill", children: [_jsx(Package, { size: 12 }), products.length, " ", showStockFilter ? "em estoque" : "produtos"] }), _jsxs("span", { className: "strat-stat-pill", children: [_jsx(TrendingUp, { size: 12 }), formatNumber(customer.totalOrders), " pedidos"] }), _jsx("span", { className: "strat-stat-pill strat-stat-revenue", children: formatCurrency(customer.totalSpent) })] })] }), expanded && (_jsx("div", { className: "strat-customer-body", children: products.length === 0 ? (_jsxs("div", { className: "strat-empty-products", children: [_jsx(Box, { size: 20 }), _jsx("span", { children: showStockFilter
                                ? "Nenhum produto comprado encontrado com estoque suficiente"
                                : "Nenhum produto encontrado para este cliente" })] })) : (_jsx("div", { className: "strat-products-table-wrapper", children: _jsxs("table", { className: "strat-products-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "SKU" }), _jsx("th", { children: "Descri\u00E7\u00E3o" }), _jsx("th", { className: "strat-th-right", children: "Qtd Comprada" }), _jsx("th", { className: "strat-th-right", children: "N\u00BA Pedidos" }), _jsx("th", { children: "\u00DAltima Compra" }), _jsx("th", { className: "strat-th-right", children: "Estoque Atual" })] }) }), _jsx("tbody", { children: products.map((product, index) => (_jsxs("tr", { children: [_jsx("td", { className: "strat-sku-cell", children: product.sku || "—" }), _jsx("td", { className: "strat-desc-cell", children: product.itemDescription }), _jsx("td", { className: "strat-td-right", children: _jsx("strong", { children: formatNumber(product.totalQuantityBought) }) }), _jsx("td", { className: "strat-td-right", children: formatNumber(product.orderCount) }), _jsx("td", { children: formatDate(product.lastBoughtAt) }), _jsx("td", { className: "strat-td-right", children: _jsx("span", { className: `strat-stock-badge ${getStockBadgeClass(product.stockQuantity)}`, children: product.stockQuantity !== null ? formatNumber(product.stockQuantity) : "N/A" }) })] }, `${product.sku}-${index}`))) })] }) })) }))] }));
}
/* ── Main Page ── */
export function StrategiesPage() {
    const { token } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [minStock, setMinStock] = useState(50);
    const [minStockInput, setMinStockInput] = useState("50");
    const [showStockFilter, setShowStockFilter] = useState(true);
    const [activeTab, setActiveTab] = useState("ACTIVE");
    const [searchTerm, setSearchTerm] = useState("");
    const fetchData = useCallback(async (stockValue) => {
        if (!token)
            return;
        setLoading(true);
        setError(null);
        try {
            const result = await api.strategyCrossSell(token, stockValue, 50);
            setData(result);
        }
        catch (err) {
            setError(err.message || "Erro ao carregar dados");
        }
        finally {
            setLoading(false);
        }
    }, [token]);
    useEffect(() => {
        fetchData(minStock);
    }, [fetchData, minStock]);
    const handleRefresh = () => {
        const parsed = parseInt(minStockInput, 10);
        const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
        setMinStock(safeValue);
        setMinStockInput(String(safeValue));
    };
    const handleMinStockKeyDown = (e) => {
        if (e.key === "Enter") {
            handleRefresh();
        }
    };
    const filteredCustomers = useMemo(() => {
        if (!data)
            return [];
        let customers = data.customers.filter((c) => c.status === activeTab);
        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase();
            customers = customers.filter((c) => c.displayName.toLowerCase().includes(lower) ||
                c.customerCode.toLowerCase().includes(lower));
        }
        // Filter out customers that have no products in the current view mode
        if (showStockFilter) {
            customers = customers.filter((c) => c.productsWithStock.length > 0);
        }
        return customers;
    }, [data, activeTab, searchTerm, showStockFilter]);
    const tabs = [
        {
            status: "ACTIVE",
            label: "Ativos",
            count: data?.summary.activeCount ?? 0,
        },
        {
            status: "ATTENTION",
            label: "Atenção",
            count: data?.summary.attentionCount ?? 0,
        },
        {
            status: "INACTIVE",
            label: "Inativos",
            count: data?.summary.inactiveCount ?? 0,
        },
    ];
    return (_jsxs("div", { className: "strat-page", children: [_jsxs("header", { className: "strat-header", children: [_jsxs("div", { className: "strat-header-left", children: [_jsx("div", { className: "strat-header-icon", children: _jsx(Crosshair, { size: 24 }) }), _jsxs("div", { children: [_jsx("h1", { className: "strat-title", children: "Estrat\u00E9gias" }), _jsx("p", { className: "strat-subtitle", children: "Cruzamento de Dados \u2014 Produtos \u00D7 Estoque" })] })] }), data && (_jsxs("span", { className: "strat-generated-at", children: ["Gerado em ", new Date(data.generatedAt).toLocaleString("pt-BR")] }))] }), _jsx("div", { className: "strat-controls", children: _jsxs("div", { className: "strat-controls-row", children: [_jsxs("div", { className: "strat-control-group", children: [_jsx("label", { className: "strat-control-label", htmlFor: "strat-min-stock", children: "Estoque m\u00EDnimo" }), _jsxs("div", { className: "strat-input-group", children: [_jsx("input", { id: "strat-min-stock", type: "number", min: 0, value: minStockInput, onChange: (e) => setMinStockInput(e.target.value), onKeyDown: handleMinStockKeyDown, className: "strat-input", placeholder: "50" }), _jsxs("button", { type: "button", className: "strat-btn strat-btn-primary", onClick: handleRefresh, disabled: loading, children: [_jsx(RefreshCw, { size: 14, className: loading ? "strat-spin" : "" }), "Atualizar"] })] })] }), _jsxs("div", { className: "strat-control-group", children: [_jsx("label", { className: "strat-control-label", children: "Modo de visualiza\u00E7\u00E3o" }), _jsxs("div", { className: "strat-toggle-group", children: [_jsxs("button", { type: "button", className: `strat-toggle-btn ${showStockFilter ? "strat-toggle-active" : ""}`, onClick: () => setShowStockFilter(true), children: [_jsx(Package, { size: 14 }), "Com estoque (\u2265 ", minStock, ")"] }), _jsxs("button", { type: "button", className: `strat-toggle-btn ${!showStockFilter ? "strat-toggle-active" : ""}`, onClick: () => setShowStockFilter(false), children: [_jsx(Layers, { size: 14 }), "Todos os produtos"] })] })] }), _jsxs("div", { className: "strat-control-group strat-search-group", children: [_jsx("label", { className: "strat-control-label", htmlFor: "strat-search", children: "Buscar cliente" }), _jsxs("div", { className: "strat-search-input-wrapper", children: [_jsx(Search, { size: 14, className: "strat-search-icon" }), _jsx("input", { id: "strat-search", type: "text", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "strat-input strat-search-input", placeholder: "Nome ou c\u00F3digo..." })] })] })] }) }), data && !loading && (_jsxs("div", { className: "strat-summary-cards", children: [_jsxs("div", { className: "strat-summary-card strat-summary-total", children: [_jsx("div", { className: "strat-summary-icon", children: _jsx(Users, { size: 20 }) }), _jsxs("div", { className: "strat-summary-content", children: [_jsx("span", { className: "strat-summary-value", children: formatNumber(data.summary.totalCustomers) }), _jsx("span", { className: "strat-summary-label", children: "Clientes com compras" })] })] }), tabs.map((tab) => {
                        const cfg = getStatusConfig(tab.status);
                        const Icon = cfg.icon;
                        return (_jsxs("div", { className: "strat-summary-card", style: { borderColor: cfg.color }, children: [_jsx("div", { className: "strat-summary-icon", style: { color: cfg.color, backgroundColor: cfg.bgColor }, children: _jsx(Icon, { size: 20 }) }), _jsxs("div", { className: "strat-summary-content", children: [_jsx("span", { className: "strat-summary-value", style: { color: cfg.color }, children: formatNumber(tab.count) }), _jsx("span", { className: "strat-summary-label", children: tab.label })] })] }, tab.status));
                    }), _jsxs("div", { className: "strat-summary-card strat-summary-matches", children: [_jsx("div", { className: "strat-summary-icon", children: _jsx(Crosshair, { size: 20 }) }), _jsxs("div", { className: "strat-summary-content", children: [_jsx("span", { className: "strat-summary-value", children: formatNumber(data.summary.totalProductMatches) }), _jsx("span", { className: "strat-summary-label", children: "Cruzamentos c/ estoque" })] })] })] })), _jsx("div", { className: "strat-tabs", children: tabs.map((tab) => {
                    const cfg = getStatusConfig(tab.status);
                    return (_jsxs("button", { type: "button", className: `strat-tab ${activeTab === tab.status ? "strat-tab-active" : ""}`, onClick: () => setActiveTab(tab.status), style: activeTab === tab.status
                            ? { borderBottomColor: cfg.color, color: cfg.color }
                            : {}, children: [tab.label, _jsx("span", { className: "strat-tab-count", children: formatNumber(tab.count) })] }, tab.status));
                }) }), _jsxs("div", { className: "strat-content", children: [loading && (_jsxs("div", { className: "strat-loading", children: [_jsx(RefreshCw, { size: 28, className: "strat-spin" }), _jsx("span", { children: "Carregando cruzamento de dados..." })] })), error && !loading && (_jsxs("div", { className: "strat-error", children: [_jsx(ShieldAlert, { size: 20 }), _jsx("span", { children: error }), _jsx("button", { type: "button", className: "strat-btn strat-btn-primary", onClick: handleRefresh, children: "Tentar novamente" })] })), !loading && !error && filteredCustomers.length === 0 && (_jsxs("div", { className: "strat-empty", children: [_jsx(Box, { size: 32 }), _jsx("strong", { children: "Nenhum cliente encontrado" }), _jsx("span", { children: searchTerm
                                    ? "Tente outro termo de busca"
                                    : showStockFilter
                                        ? `Nenhum cliente ${getStatusConfig(activeTab).label.toLowerCase()} possui produtos com estoque ≥ ${minStock}`
                                        : `Nenhum cliente ${getStatusConfig(activeTab).label.toLowerCase()} encontrado` })] })), !loading && !error && filteredCustomers.length > 0 && (_jsxs("div", { className: "strat-customers-list", children: [_jsx("div", { className: "strat-list-info", children: _jsxs("span", { children: [formatNumber(filteredCustomers.length), " clientes"] }) }), filteredCustomers.map((customer) => (_jsx(CustomerCard, { customer: customer, showStockFilter: showStockFilter }, customer.customerId)))] }))] })] }));
}
