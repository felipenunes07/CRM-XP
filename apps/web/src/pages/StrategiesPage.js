import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Crosshair, RefreshCw, ChevronDown, ChevronRight, Package, Users, ShieldAlert, UserX, Search, Layers, TrendingUp, Box, ArrowUpDown, ArrowUp, ArrowDown, Copy, Check, MessageSquareText, } from "lucide-react";
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
function generateReactivationMessage(customer, products) {
    const firstName = customer.displayName.split(" ")[0] || customer.displayName;
    // Filter products that are actually in stock
    const inStockProducts = products
        .filter(p => p.stockQuantity !== null && p.stockQuantity > 0);
    let productsListText = "";
    if (inStockProducts.length > 0) {
        productsListText = "\n\nOlha só os modelos que você costuma pedir e que temos a pronta entrega:\n" +
            inStockProducts.map(p => `• *${p.itemDescription}* (Disponível: ${p.stockQuantity} un)`).join("\n");
    }
    const daysInactiveText = customer.status === "INACTIVE"
        ? "um tempinho"
        : "alguns dias";
    return `Oi, ${firstName}! Tudo bem?\n\nReparei que já faz ${daysInactiveText} que você não faz um pedido com a gente.${productsListText}\n\nQue tal aproveitarmos para abastecer seu estoque? Bora fechar um novo pedido? 😊`;
}
function generateSlowMovingMessage(customer, products) {
    const firstName = customer.displayName.split(" ")[0] || customer.displayName;
    // Filter products that are actually in stock
    const inStockProducts = products
        .filter(p => p.stockQuantity !== null && p.stockQuantity > 0);
    let productsListText = "";
    if (inStockProducts.length > 0) {
        productsListText = "\n\nTenho alguns modelos em estoque que você comprou anteriormente e estão disponíveis para entrega imediata:\n" +
            inStockProducts.map(p => `• *${p.itemDescription}* (Média habitual de compra: ${Math.round(p.totalQuantityBought / (p.orderCount || 1))} un)`).join("\n");
    }
    return `Oi, ${firstName}! Tudo bem?\n\nEstou passando para te mostrar algumas excelentes oportunidades de reposição de modelos que você já trabalhou anteriormente conosco.${productsListText}\n\nConsegue receber um orçamento hoje para aproveitarmos essas peças em estoque? 😊`;
}
function CustomerCard({ customer, showStockFilter, strategyMode, }) {
    const [expanded, setExpanded] = useState(false);
    const products = showStockFilter ? customer.productsWithStock : customer.productsAll;
    const statusCfg = getStatusConfig(customer.status);
    const [sortKey, setSortKey] = useState("totalQuantityBought");
    const [sortOrder, setSortOrder] = useState("desc");
    const [copied, setCopied] = useState(false);
    const handleSort = (key) => {
        if (sortKey === key) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        }
        else {
            setSortKey(key);
            setSortOrder("desc");
        }
    };
    const handleCopyMessage = () => {
        const msg = strategyMode === "reactivation"
            ? generateReactivationMessage(customer, products)
            : generateSlowMovingMessage(customer, products);
        navigator.clipboard.writeText(msg).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    const sortedProducts = useMemo(() => {
        const list = [...products];
        list.sort((a, b) => {
            let valA = sortKey === "avgQuantityPerOrder"
                ? (a.totalQuantityBought / (a.orderCount || 1))
                : a[sortKey];
            let valB = sortKey === "avgQuantityPerOrder"
                ? (b.totalQuantityBought / (b.orderCount || 1))
                : b[sortKey];
            // Handle nulls / undefined
            if (valA === null || valA === undefined)
                return sortOrder === "desc" ? 1 : -1;
            if (valB === null || valB === undefined)
                return sortOrder === "desc" ? -1 : 1;
            if (typeof valA === "string" && typeof valB === "string") {
                return sortOrder === "desc"
                    ? valB.localeCompare(valA)
                    : valA.localeCompare(valB);
            }
            // Numbers or Dates
            return sortOrder === "desc"
                ? (valB > valA ? 1 : -1)
                : (valA > valB ? 1 : -1);
        });
        return list;
    }, [products, sortKey, sortOrder]);
    const renderSortIcon = (key) => {
        if (sortKey !== key) {
            return _jsx(ArrowUpDown, { size: 12, className: "strat-sort-icon-inactive", style: { marginLeft: "4px", display: "inline-block", opacity: 0.4 } });
        }
        return sortOrder === "asc"
            ? _jsx(ArrowUp, { size: 12, className: "strat-sort-icon-active", style: { marginLeft: "4px", display: "inline-block", color: "#6366f1" } })
            : _jsx(ArrowDown, { size: 12, className: "strat-sort-icon-active", style: { marginLeft: "4px", display: "inline-block", color: "#6366f1" } });
    };
    return (_jsxs("div", { className: `strat-customer-card ${expanded ? "strat-card-expanded" : ""}`, children: [_jsxs("button", { type: "button", className: "strat-customer-header", onClick: () => setExpanded(!expanded), "aria-expanded": expanded, children: [_jsxs("div", { className: "strat-customer-left", children: [expanded ? _jsx(ChevronDown, { size: 16 }) : _jsx(ChevronRight, { size: 16 }), _jsx("span", { className: "strat-status-dot", style: { backgroundColor: statusCfg.color } }), _jsxs("div", { className: "strat-customer-info", children: [_jsx("strong", { className: "strat-customer-name", children: customer.displayName }), _jsx("span", { className: "strat-customer-code", children: customer.customerCode })] })] }), _jsxs("div", { className: "strat-customer-stats", children: [_jsxs("span", { className: "strat-stat-pill", children: [_jsx(Package, { size: 12 }), products.length, " ", showStockFilter ? "em estoque" : "produtos"] }), _jsxs("span", { className: "strat-stat-pill", children: [_jsx(TrendingUp, { size: 12 }), formatNumber(customer.totalOrders), " pedidos"] }), _jsx("span", { className: "strat-stat-pill strat-stat-revenue", children: formatCurrency(customer.totalSpent) })] })] }), expanded && (_jsxs("div", { className: "strat-customer-body", children: [_jsxs("div", { className: "strat-message-banner", children: [_jsxs("div", { className: "strat-message-banner-left", children: [_jsx("div", { className: `strat-message-banner-icon ${strategyMode === "slowMoving" ? "strat-giro-icon" : ""}`, style: strategyMode === "slowMoving" ? { color: "#06b6d4", backgroundColor: "rgba(6, 182, 212, 0.08)" } : undefined, children: _jsx(MessageSquareText, { size: 18 }) }), _jsxs("div", { className: "strat-message-banner-text", children: [_jsx("strong", { className: "strat-message-banner-title", children: strategyMode === "reactivation" ? "Mensagem de Reativação WhatsApp" : "Oferta de Giro de Estoque (Modelos Parados)" }), _jsx("p", { className: "strat-message-banner-desc", children: strategyMode === "reactivation"
                                                    ? "Gere um texto personalizado com os modelos mais comprados por este cliente que estão em estoque no momento."
                                                    : "Gere uma mensagem oferecendo reposição desses modelos favoritos do cliente que estão parados no nosso estoque." })] })] }), _jsxs("button", { type: "button", className: `strat-btn ${copied ? "strat-btn-success" : "strat-btn-secondary"}`, onClick: handleCopyMessage, style: { gap: "0.5rem" }, children: [copied ? _jsx(Check, { size: 14 }) : _jsx(Copy, { size: 14 }), copied ? "Copiado!" : "Copiar Mensagem"] })] }), products.length === 0 ? (_jsxs("div", { className: "strat-empty-products", children: [_jsx(Box, { size: 20 }), _jsx("span", { children: showStockFilter
                                    ? "Nenhum produto comprado encontrado com estoque suficiente"
                                    : "Nenhum produto encontrado para este cliente" })] })) : (_jsx("div", { className: "strat-products-table-wrapper", children: _jsxs("table", { className: "strat-products-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsxs("th", { className: "strat-th-sortable", onClick: () => handleSort("sku"), children: ["SKU ", renderSortIcon("sku")] }), _jsxs("th", { className: "strat-th-sortable", onClick: () => handleSort("itemDescription"), children: ["Descri\u00E7\u00E3o ", renderSortIcon("itemDescription")] }), _jsxs("th", { className: "strat-th-sortable strat-th-right", onClick: () => handleSort("totalQuantityBought"), children: ["Qtd Comprada ", renderSortIcon("totalQuantityBought")] }), _jsxs("th", { className: "strat-th-sortable strat-th-right", onClick: () => handleSort("orderCount"), children: ["N\u00BA Pedidos ", renderSortIcon("orderCount")] }), _jsxs("th", { className: "strat-th-sortable strat-th-right", onClick: () => handleSort("avgQuantityPerOrder"), children: ["M\u00E9dia/Pedido ", renderSortIcon("avgQuantityPerOrder")] }), _jsxs("th", { className: "strat-th-sortable", onClick: () => handleSort("lastBoughtAt"), children: ["\u00DAltima Compra ", renderSortIcon("lastBoughtAt")] }), strategyMode === "slowMoving" && (_jsxs("th", { className: "strat-th-sortable", onClick: () => handleSort("daysWithoutSales"), children: ["Giro Geral ", renderSortIcon("daysWithoutSales")] })), _jsxs("th", { className: "strat-th-sortable strat-th-right", onClick: () => handleSort("stockQuantity"), children: ["Estoque Atual ", renderSortIcon("stockQuantity")] })] }) }), _jsx("tbody", { children: sortedProducts.map((product, index) => (_jsxs("tr", { children: [_jsx("td", { className: "strat-sku-cell", children: product.sku || "—" }), _jsx("td", { className: "strat-desc-cell", children: product.itemDescription }), _jsx("td", { className: "strat-td-right", children: _jsx("strong", { children: formatNumber(product.totalQuantityBought) }) }), _jsx("td", { className: "strat-td-right", children: formatNumber(product.orderCount) }), _jsx("td", { className: "strat-td-right", style: { color: "#475569", fontWeight: 500 }, children: product.orderCount > 0 ? Math.round(product.totalQuantityBought / product.orderCount) : 0 }), _jsx("td", { children: formatDate(product.lastBoughtAt) }), strategyMode === "slowMoving" && (_jsx("td", { style: { color: product.daysWithoutSales && product.daysWithoutSales >= 90 ? "#ef4444" : "#475569", fontWeight: 500 }, children: product.daysWithoutSales === 9999 ? "Nunca vendido" : `Há ${product.daysWithoutSales} dias` })), _jsx("td", { className: "strat-td-right", children: _jsx("span", { className: `strat-stock-badge ${getStockBadgeClass(product.stockQuantity)}`, children: product.stockQuantity !== null ? formatNumber(product.stockQuantity) : "N/A" }) })] }, `${product.sku}-${index}`))) })] }) }))] }))] }));
}
/* ── Main Page ── */
export function StrategiesPage() {
    const { token } = useAuth();
    const [strategyMode, setStrategyMode] = useState("reactivation");
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Strategy 1 (Reactivation) States
    const [minStock, setMinStock] = useState(50);
    const [minStockInput, setMinStockInput] = useState("50");
    const [limitProducts, setLimitProducts] = useState("top50");
    // Strategy 2 (Slow Moving) States
    const [minStockSlow, setMinStockSlow] = useState(1);
    const [minStockSlowInput, setMinStockSlowInput] = useState("1");
    const [daysWithoutSales, setDaysWithoutSales] = useState(30);
    const [showStockFilter, setShowStockFilter] = useState(true);
    const [activeTab, setActiveTab] = useState("ACTIVE");
    const [searchTerm, setSearchTerm] = useState("");
    const [customerSortKey, setCustomerSortKey] = useState("revenue");
    const [customerSortOrder, setCustomerSortOrder] = useState("desc");
    const fetchData = useCallback(async (mode, stockValue, extraValue) => {
        if (!token)
            return;
        setLoading(true);
        setError(null);
        try {
            if (mode === "reactivation") {
                const topN = extraValue === "all" ? 5000 : 50;
                const result = await api.strategyCrossSell(token, stockValue, topN);
                setData(result);
            }
            else {
                const result = await api.strategySlowMoving(token, stockValue, extraValue);
                setData(result);
            }
        }
        catch (err) {
            setError(err.message || "Erro ao carregar dados");
        }
        finally {
            setLoading(false);
        }
    }, [token]);
    useEffect(() => {
        if (strategyMode === "reactivation") {
            fetchData("reactivation", minStock, limitProducts);
        }
        else {
            fetchData("slowMoving", minStockSlow, daysWithoutSales);
        }
    }, [fetchData, strategyMode, minStock, limitProducts, minStockSlow, daysWithoutSales]);
    const handleRefresh = () => {
        if (strategyMode === "reactivation") {
            const parsed = parseInt(minStockInput, 10);
            const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
            setMinStock(safeValue);
            setMinStockInput(String(safeValue));
        }
        else {
            const parsed = parseInt(minStockSlowInput, 10);
            const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
            setMinStockSlow(safeValue);
            setMinStockSlowInput(String(safeValue));
        }
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
        // Sort customers
        customers.sort((a, b) => {
            let valA;
            let valB;
            if (customerSortKey === "revenue") {
                valA = a.totalSpent;
                valB = b.totalSpent;
            }
            else if (customerSortKey === "name") {
                valA = a.displayName;
                valB = b.displayName;
            }
            else if (customerSortKey === "orders") {
                valA = a.totalOrders;
                valB = b.totalOrders;
            }
            else if (customerSortKey === "matches") {
                valA = showStockFilter ? a.productsWithStock.length : a.productsAll.length;
                valB = showStockFilter ? b.productsWithStock.length : b.productsAll.length;
            }
            if (typeof valA === "string" && typeof valB === "string") {
                return customerSortOrder === "desc"
                    ? valB.localeCompare(valA)
                    : valA.localeCompare(valB);
            }
            return customerSortOrder === "desc"
                ? valB - valA
                : valA - valB;
        });
        return customers;
    }, [data, activeTab, searchTerm, showStockFilter, customerSortKey, customerSortOrder]);
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
    return (_jsxs("div", { className: "strat-page", children: [_jsxs("header", { className: "strat-header", children: [_jsxs("div", { className: "strat-header-left", children: [_jsx("div", { className: "strat-header-icon", style: strategyMode === "slowMoving" ? { background: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)", boxShadow: "0 4px 12px rgba(6, 182, 212, 0.15)" } : undefined, children: _jsx(Crosshair, { size: 24 }) }), _jsxs("div", { children: [_jsx("h1", { className: "strat-title", children: "Estrat\u00E9gias" }), _jsx("p", { className: "strat-subtitle", children: strategyMode === "reactivation"
                                            ? "Cruzamento de Dados — Produtos × Estoque"
                                            : "Giro de Estoque — Venda de Modelos Parados" })] })] }), data && (_jsxs("span", { className: "strat-generated-at", children: ["Gerado em ", new Date(data.generatedAt).toLocaleString("pt-BR")] }))] }), _jsxs("div", { className: "strat-mode-switcher", style: { display: "flex", gap: "0.2rem", background: "#f1f5f9", padding: "0.2rem", borderRadius: "10px", border: "1px solid #e2e8f0", width: "fit-content" }, children: [_jsxs("button", { type: "button", className: `strat-toggle-btn ${strategyMode === "reactivation" ? "strat-toggle-active" : ""}`, onClick: () => {
                            setStrategyMode("reactivation");
                            setData(null);
                        }, style: { height: "34px", padding: "0 1.25rem", borderRadius: "8px" }, children: [_jsx(Crosshair, { size: 14 }), "Reativa\u00E7\u00E3o (Modelos Preferidos)"] }), _jsxs("button", { type: "button", className: `strat-toggle-btn ${strategyMode === "slowMoving" ? "strat-toggle-active" : ""}`, onClick: () => {
                            setStrategyMode("slowMoving");
                            setData(null);
                        }, style: { height: "34px", padding: "0 1.25rem", borderRadius: "8px" }, children: [_jsx(TrendingUp, { size: 14 }), "Giro de Estoque (Modelos Parados)"] })] }), _jsx("div", { className: "strat-controls", children: _jsxs("div", { className: "strat-controls-row", children: [_jsxs("div", { className: "strat-control-group", children: [_jsx("label", { className: "strat-control-label", htmlFor: "strat-min-stock", children: "Estoque m\u00EDnimo" }), _jsxs("div", { className: "strat-input-group", children: [_jsx("input", { id: "strat-min-stock", type: "number", min: 0, value: strategyMode === "reactivation" ? minStockInput : minStockSlowInput, onChange: (e) => {
                                                if (strategyMode === "reactivation") {
                                                    setMinStockInput(e.target.value);
                                                }
                                                else {
                                                    setMinStockSlowInput(e.target.value);
                                                }
                                            }, onKeyDown: handleMinStockKeyDown, className: "strat-input", placeholder: strategyMode === "reactivation" ? "50" : "1" }), _jsxs("button", { type: "button", className: "strat-btn strat-btn-primary", onClick: handleRefresh, disabled: loading, style: strategyMode === "slowMoving" ? { backgroundColor: "#06b6d4" } : undefined, children: [_jsx(RefreshCw, { size: 14, className: loading ? "strat-spin" : "" }), "Atualizar"] })] })] }), strategyMode === "slowMoving" && (_jsxs("div", { className: "strat-control-group", children: [_jsx("label", { className: "strat-control-label", children: "Sem vendas h\u00E1" }), _jsx("div", { className: "strat-toggle-group", children: [30, 60, 90, 120].map((d) => (_jsx("button", { type: "button", className: `strat-toggle-btn ${daysWithoutSales === d ? "strat-toggle-active" : ""}`, onClick: () => setDaysWithoutSales(d), children: d === 120 ? "120+ dias" : `${d} dias` }, d))) })] })), _jsxs("div", { className: "strat-control-group", children: [_jsx("label", { className: "strat-control-label", children: "Modo de visualiza\u00E7\u00E3o" }), _jsxs("div", { className: "strat-toggle-group", children: [_jsxs("button", { type: "button", className: `strat-toggle-btn ${showStockFilter ? "strat-toggle-active" : ""}`, onClick: () => setShowStockFilter(true), children: [_jsx(Package, { size: 14 }), "Com estoque (\u2265 ", strategyMode === "reactivation" ? minStock : minStockSlow, ")"] }), _jsxs("button", { type: "button", className: `strat-toggle-btn ${!showStockFilter ? "strat-toggle-active" : ""}`, onClick: () => setShowStockFilter(false), children: [_jsx(Layers, { size: 14 }), "Todos os produtos"] })] })] }), strategyMode === "reactivation" && (_jsxs("div", { className: "strat-control-group", children: [_jsx("label", { className: "strat-control-label", children: "Quantidade de Produtos" }), _jsxs("div", { className: "strat-toggle-group", children: [_jsx("button", { type: "button", className: `strat-toggle-btn ${limitProducts === "top50" ? "strat-toggle-active" : ""}`, onClick: () => setLimitProducts("top50"), children: "Top 50" }), _jsx("button", { type: "button", className: `strat-toggle-btn ${limitProducts === "all" ? "strat-toggle-active" : ""}`, onClick: () => setLimitProducts("all"), children: "Ver todos" })] })] })), _jsxs("div", { className: "strat-control-group", children: [_jsx("label", { className: "strat-control-label", htmlFor: "strat-sort-customer", children: "Ordenar clientes" }), _jsxs("select", { id: "strat-sort-customer", value: `${customerSortKey}-${customerSortOrder}`, onChange: (e) => {
                                        const [key, order] = e.target.value.split("-");
                                        setCustomerSortKey(key);
                                        setCustomerSortOrder(order);
                                    }, className: "strat-input", style: { minWidth: "180px", cursor: "pointer" }, children: [_jsx("option", { value: "revenue-desc", children: "Maior Faturamento" }), _jsx("option", { value: "revenue-asc", children: "Menor Faturamento" }), _jsx("option", { value: "name-asc", children: "Nome (A-Z)" }), _jsx("option", { value: "name-desc", children: "Nome (Z-A)" }), _jsx("option", { value: "orders-desc", children: "Mais Pedidos" }), _jsx("option", { value: "orders-asc", children: "Menos Pedidos" }), _jsx("option", { value: "matches-desc", children: "Mais Oportunidades" }), _jsx("option", { value: "matches-asc", children: "Menos Oportunidades" })] })] }), _jsxs("div", { className: "strat-control-group strat-search-group", children: [_jsx("label", { className: "strat-control-label", htmlFor: "strat-search", children: "Buscar cliente" }), _jsxs("div", { className: "strat-search-input-wrapper", children: [_jsx(Search, { size: 14, className: "strat-search-icon" }), _jsx("input", { id: "strat-search", type: "text", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), className: "strat-input strat-search-input", placeholder: "Nome ou c\u00F3digo..." })] })] })] }) }), data && !loading && (_jsxs("div", { className: "strat-summary-cards", children: [_jsxs("div", { className: "strat-summary-card strat-summary-total", children: [_jsx("div", { className: "strat-summary-icon", style: { color: "#6366f1", backgroundColor: "rgba(99, 102, 241, 0.08)" }, children: _jsx(Users, { size: 20 }) }), _jsxs("div", { className: "strat-summary-content", children: [_jsx("span", { className: "strat-summary-value", children: formatNumber(data.summary.totalCustomers) }), _jsx("span", { className: "strat-summary-label", children: "Clientes com compras" })] })] }), tabs.map((tab) => {
                        const cfg = getStatusConfig(tab.status);
                        const Icon = cfg.icon;
                        return (_jsxs("div", { className: "strat-summary-card", children: [_jsx("div", { className: "strat-summary-icon", style: { color: cfg.color, backgroundColor: cfg.bgColor }, children: _jsx(Icon, { size: 20 }) }), _jsxs("div", { className: "strat-summary-content", children: [_jsx("span", { className: "strat-summary-value", children: formatNumber(tab.count) }), _jsx("span", { className: "strat-summary-label", children: tab.label })] })] }, tab.status));
                    }), _jsxs("div", { className: "strat-summary-card strat-summary-matches", children: [_jsx("div", { className: "strat-summary-icon", style: strategyMode === "slowMoving" ? { color: "#06b6d4", backgroundColor: "rgba(6, 182, 212, 0.08)" } : { color: "#06b6d4", backgroundColor: "rgba(6, 182, 212, 0.08)" }, children: _jsx(Crosshair, { size: 20 }) }), _jsxs("div", { className: "strat-summary-content", children: [_jsx("span", { className: "strat-summary-value", children: formatNumber(data.summary.totalProductMatches) }), _jsx("span", { className: "strat-summary-label", children: strategyMode === "reactivation" ? "Cruzamentos c/ estoque" : "Modelos parados c/ comprador" })] })] })] })), _jsx("div", { className: "strat-tabs", children: tabs.map((tab) => {
                    return (_jsxs("button", { type: "button", className: `strat-tab ${activeTab === tab.status ? "strat-tab-active" : ""}`, onClick: () => setActiveTab(tab.status), children: [tab.label, _jsx("span", { className: "strat-tab-count", children: formatNumber(tab.count) })] }, tab.status));
                }) }), _jsxs("div", { className: "strat-content", children: [loading && (_jsxs("div", { className: "strat-loading", children: [_jsx(RefreshCw, { size: 28, className: "strat-spin" }), _jsx("span", { children: "Carregando cruzamento de dados..." })] })), error && !loading && (_jsxs("div", { className: "strat-error", children: [_jsx(ShieldAlert, { size: 20 }), _jsx("span", { children: error }), _jsx("button", { type: "button", className: "strat-btn strat-btn-primary", onClick: handleRefresh, children: "Tentar novamente" })] })), !loading && !error && filteredCustomers.length === 0 && (_jsxs("div", { className: "strat-empty", children: [_jsx(Box, { size: 32 }), _jsx("strong", { children: "Nenhum cliente encontrado" }), _jsx("span", { children: searchTerm
                                    ? "Tente outro termo de busca"
                                    : showStockFilter
                                        ? `Nenhum cliente ${getStatusConfig(activeTab).label.toLowerCase()} possui produtos correspondentes`
                                        : `Nenhum cliente ${getStatusConfig(activeTab).label.toLowerCase()} encontrado` })] })), !loading && !error && filteredCustomers.length > 0 && (_jsxs("div", { className: "strat-customers-list", children: [_jsx("div", { className: "strat-list-info", children: _jsxs("span", { children: [formatNumber(filteredCustomers.length), " clientes"] }) }), filteredCustomers.map((customer) => (_jsx(CustomerCard, { customer: customer, showStockFilter: showStockFilter, strategyMode: strategyMode }, customer.customerId)))] }))] })] }));
}
