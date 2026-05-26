import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Crosshair,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Package,
  Users,
  ShieldAlert,
  UserX,
  Search,
  Layers,
  TrendingUp,
  Box,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  MessageSquareText,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

/* ── Types ── */

type CustomerStatus = "ACTIVE" | "ATTENTION" | "INACTIVE";

interface ProductItem {
  sku: string | null;
  itemDescription: string;
  totalQuantityBought: number;
  orderCount: number;
  lastBoughtAt: string | null;
  stockQuantity: number | null;
  stockModel: string | null;
}

interface CustomerEntry {
  customerId: string;
  customerCode: string;
  displayName: string;
  status: CustomerStatus;
  totalOrders: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
  productsWithStock: ProductItem[];
  productsAll: ProductItem[];
}

interface CrossSellData {
  summary: {
    totalCustomers: number;
    activeCount: number;
    attentionCount: number;
    inactiveCount: number;
    totalProductMatches: number;
  };
  customers: CustomerEntry[];
  minStock: number;
  topN: number;
  generatedAt: string;
}

/* ── Helpers ── */

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function getStockBadgeClass(qty: number | null): string {
  if (qty === null || qty === undefined) return "strat-stock-none";
  if (qty >= 50) return "strat-stock-high";
  if (qty >= 20) return "strat-stock-medium";
  if (qty > 0) return "strat-stock-low";
  return "strat-stock-out";
}

function getStatusConfig(status: CustomerStatus) {
  switch (status) {
    case "ACTIVE":
      return { label: "Ativos", icon: Users, color: "#22c55e", bgColor: "rgba(34,197,94,0.12)" };
    case "ATTENTION":
      return { label: "Atenção", icon: ShieldAlert, color: "#f59e0b", bgColor: "rgba(245,158,11,0.12)" };
    case "INACTIVE":
      return { label: "Inativos", icon: UserX, color: "#ef4444", bgColor: "rgba(239,68,68,0.12)" };
  }
}

function generateReactivationMessage(customer: CustomerEntry, products: ProductItem[]): string {
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

/* ── Customer Card Component ── */

type ProductSortKey = "sku" | "itemDescription" | "totalQuantityBought" | "orderCount" | "avgQuantityPerOrder" | "lastBoughtAt" | "stockQuantity";

function CustomerCard({
  customer,
  showStockFilter,
}: {
  customer: CustomerEntry;
  showStockFilter: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const products = showStockFilter ? customer.productsWithStock : customer.productsAll;
  const statusCfg = getStatusConfig(customer.status);

  const [sortKey, setSortKey] = useState<ProductSortKey>("totalQuantityBought");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [copied, setCopied] = useState(false);

  const handleSort = (key: ProductSortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const handleCopyMessage = () => {
    // Generate based on the current view's list of products
    const msg = generateReactivationMessage(customer, products);
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sortedProducts = useMemo(() => {
    const list = [...products];
    list.sort((a, b) => {
      let valA = sortKey === "avgQuantityPerOrder" ? (a.totalQuantityBought / (a.orderCount || 1)) : a[sortKey];
      let valB = sortKey === "avgQuantityPerOrder" ? (b.totalQuantityBought / (b.orderCount || 1)) : b[sortKey];

      // Handle nulls / undefined
      if (valA === null || valA === undefined) return sortOrder === "desc" ? 1 : -1;
      if (valB === null || valB === undefined) return sortOrder === "desc" ? -1 : 1;

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

  const renderSortIcon = (key: ProductSortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown size={12} className="strat-sort-icon-inactive" style={{ marginLeft: "4px", display: "inline-block", opacity: 0.4 }} />;
    }
    return sortOrder === "asc"
      ? <ArrowUp size={12} className="strat-sort-icon-active" style={{ marginLeft: "4px", display: "inline-block", color: "#6366f1" }} />
      : <ArrowDown size={12} className="strat-sort-icon-active" style={{ marginLeft: "4px", display: "inline-block", color: "#6366f1" }} />;
  };

  return (
    <div className={`strat-customer-card ${expanded ? "strat-card-expanded" : ""}`}>
      <button
        type="button"
        className="strat-customer-header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className="strat-customer-left">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span
            className="strat-status-dot"
            style={{ backgroundColor: statusCfg.color }}
          />
          <div className="strat-customer-info">
            <strong className="strat-customer-name">{customer.displayName}</strong>
            <span className="strat-customer-code">{customer.customerCode}</span>
          </div>
        </div>
        <div className="strat-customer-stats">
          <span className="strat-stat-pill">
            <Package size={12} />
            {products.length} {showStockFilter ? "em estoque" : "produtos"}
          </span>
          <span className="strat-stat-pill">
            <TrendingUp size={12} />
            {formatNumber(customer.totalOrders)} pedidos
          </span>
          <span className="strat-stat-pill strat-stat-revenue">
            {formatCurrency(customer.totalSpent)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="strat-customer-body">
          {/* ── Activation Message Banner ── */}
          <div className="strat-message-banner">
            <div className="strat-message-banner-left">
              <div className="strat-message-banner-icon">
                <MessageSquareText size={18} />
              </div>
              <div className="strat-message-banner-text">
                <strong className="strat-message-banner-title">
                  Mensagem de Reativação WhatsApp
                </strong>
                <p className="strat-message-banner-desc">
                  Gere um texto personalizado com os modelos mais comprados por este cliente que estão em estoque no momento.
                </p>
              </div>
            </div>
            <button
              type="button"
              className={`strat-btn ${copied ? "strat-btn-success" : "strat-btn-secondary"}`}
              onClick={handleCopyMessage}
              style={{ gap: "0.5rem" }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copiado!" : "Copiar Mensagem"}
            </button>
          </div>

          {products.length === 0 ? (
            <div className="strat-empty-products">
              <Box size={20} />
              <span>
                {showStockFilter
                  ? "Nenhum produto comprado encontrado com estoque suficiente"
                  : "Nenhum produto encontrado para este cliente"}
              </span>
            </div>
          ) : (
            <div className="strat-products-table-wrapper">

              <table className="strat-products-table">
                <thead>
                  <tr>
                    <th className="strat-th-sortable" onClick={() => handleSort("sku")}>
                      SKU {renderSortIcon("sku")}
                    </th>
                    <th className="strat-th-sortable" onClick={() => handleSort("itemDescription")}>
                      Descrição {renderSortIcon("itemDescription")}
                    </th>
                    <th className="strat-th-sortable strat-th-right" onClick={() => handleSort("totalQuantityBought")}>
                      Qtd Comprada {renderSortIcon("totalQuantityBought")}
                    </th>
                    <th className="strat-th-sortable strat-th-right" onClick={() => handleSort("orderCount")}>
                      Nº Pedidos {renderSortIcon("orderCount")}
                    </th>
                    <th className="strat-th-sortable strat-th-right" onClick={() => handleSort("avgQuantityPerOrder")}>
                      Média/Pedido {renderSortIcon("avgQuantityPerOrder")}
                    </th>
                    <th className="strat-th-sortable" onClick={() => handleSort("lastBoughtAt")}>
                      Última Compra {renderSortIcon("lastBoughtAt")}
                    </th>
                    <th className="strat-th-sortable strat-th-right" onClick={() => handleSort("stockQuantity")}>
                      Estoque Atual {renderSortIcon("stockQuantity")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProducts.map((product, index) => (
                    <tr key={`${product.sku}-${index}`}>
                      <td className="strat-sku-cell">{product.sku || "—"}</td>
                      <td className="strat-desc-cell">{product.itemDescription}</td>
                      <td className="strat-td-right">
                        <strong>{formatNumber(product.totalQuantityBought)}</strong>
                      </td>
                      <td className="strat-td-right">{formatNumber(product.orderCount)}</td>
                      <td className="strat-td-right" style={{ color: "#475569", fontWeight: 500 }}>
                        {product.orderCount > 0 ? Math.round(product.totalQuantityBought / product.orderCount) : 0}
                      </td>
                      <td>{formatDate(product.lastBoughtAt)}</td>
                      <td className="strat-td-right">
                        <span className={`strat-stock-badge ${getStockBadgeClass(product.stockQuantity)}`}>
                          {product.stockQuantity !== null ? formatNumber(product.stockQuantity) : "N/A"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ── */

export function StrategiesPage() {
  const { token } = useAuth();
  const [data, setData] = useState<CrossSellData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minStock, setMinStock] = useState(50);
  const [minStockInput, setMinStockInput] = useState("50");
  const [showStockFilter, setShowStockFilter] = useState(true);
  const [activeTab, setActiveTab] = useState<CustomerStatus>("ACTIVE");
  const [searchTerm, setSearchTerm] = useState("");
  const [customerSortKey, setCustomerSortKey] = useState<"revenue" | "name" | "orders" | "matches">("revenue");
  const [customerSortOrder, setCustomerSortOrder] = useState<"asc" | "desc">("desc");
  const [limitProducts, setLimitProducts] = useState<"top50" | "all">("top50");

  const fetchData = useCallback(
    async (stockValue: number, limitValue: "top50" | "all") => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const topN = limitValue === "all" ? 2000 : 50;
        const result = await api.strategyCrossSell(token, stockValue, topN);
        setData(result);
      } catch (err: any) {
        setError(err.message || "Erro ao carregar dados");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    fetchData(minStock, limitProducts);
  }, [fetchData, minStock, limitProducts]);

  const handleRefresh = () => {
    const parsed = parseInt(minStockInput, 10);
    const safeValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 50;
    setMinStock(safeValue);
    setMinStockInput(String(safeValue));
  };

  const handleMinStockKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRefresh();
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!data) return [];
    let customers = data.customers.filter((c) => c.status === activeTab);

    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      customers = customers.filter(
        (c) =>
          c.displayName.toLowerCase().includes(lower) ||
          c.customerCode.toLowerCase().includes(lower),
      );
    }

    // Filter out customers that have no products in the current view mode
    if (showStockFilter) {
      customers = customers.filter((c) => c.productsWithStock.length > 0);
    }

    // Sort customers
    customers.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (customerSortKey === "revenue") {
        valA = a.totalSpent;
        valB = b.totalSpent;
      } else if (customerSortKey === "name") {
        valA = a.displayName;
        valB = b.displayName;
      } else if (customerSortKey === "orders") {
        valA = a.totalOrders;
        valB = b.totalOrders;
      } else if (customerSortKey === "matches") {
        valA = showStockFilter ? a.productsWithStock.length : a.productsAll.length;
        valB = showStockFilter ? b.productsWithStock.length : b.productsAll.length;
      }

      if (typeof valA === "string" && typeof valB === "string") {
        return customerSortOrder === "desc"
          ? valB.localeCompare(valA)
          : valA.localeCompare(valB);
      }

      return customerSortOrder === "desc"
        ? (valB as number) - (valA as number)
        : (valA as number) - (valB as number);
    });

    return customers;
  }, [data, activeTab, searchTerm, showStockFilter, customerSortKey, customerSortOrder]);

  const tabs: Array<{ status: CustomerStatus; label: string; count: number }> = [
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

  return (
    <div className="strat-page">
      {/* ── Header ── */}
      <header className="strat-header">
        <div className="strat-header-left">
          <div className="strat-header-icon">
            <Crosshair size={24} />
          </div>
          <div>
            <h1 className="strat-title">Estratégias</h1>
            <p className="strat-subtitle">Cruzamento de Dados — Produtos × Estoque</p>
          </div>
        </div>
        {data && (
          <span className="strat-generated-at">
            Gerado em {new Date(data.generatedAt).toLocaleString("pt-BR")}
          </span>
        )}
      </header>

      {/* ── Controls ── */}
      <div className="strat-controls">
        <div className="strat-controls-row">
          <div className="strat-control-group">
            <label className="strat-control-label" htmlFor="strat-min-stock">
              Estoque mínimo
            </label>
            <div className="strat-input-group">
              <input
                id="strat-min-stock"
                type="number"
                min={0}
                value={minStockInput}
                onChange={(e) => setMinStockInput(e.target.value)}
                onKeyDown={handleMinStockKeyDown}
                className="strat-input"
                placeholder="50"
              />
              <button
                type="button"
                className="strat-btn strat-btn-primary"
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? "strat-spin" : ""} />
                Atualizar
              </button>
            </div>
          </div>

          <div className="strat-control-group">
            <label className="strat-control-label">Modo de visualização</label>
            <div className="strat-toggle-group">
              <button
                type="button"
                className={`strat-toggle-btn ${showStockFilter ? "strat-toggle-active" : ""}`}
                onClick={() => setShowStockFilter(true)}
              >
                <Package size={14} />
                Com estoque (≥ {minStock})
              </button>
              <button
                type="button"
                className={`strat-toggle-btn ${!showStockFilter ? "strat-toggle-active" : ""}`}
                onClick={() => setShowStockFilter(false)}
              >
                <Layers size={14} />
                Todos os produtos
              </button>
            </div>
          </div>

          <div className="strat-control-group">
            <label className="strat-control-label">Quantidade de Produtos</label>
            <div className="strat-toggle-group">
              <button
                type="button"
                className={`strat-toggle-btn ${limitProducts === "top50" ? "strat-toggle-active" : ""}`}
                onClick={() => setLimitProducts("top50")}
              >
                Top 50
              </button>
              <button
                type="button"
                className={`strat-toggle-btn ${limitProducts === "all" ? "strat-toggle-active" : ""}`}
                onClick={() => setLimitProducts("all")}
              >
                Ver todos
              </button>
            </div>
          </div>

          <div className="strat-control-group">
            <label className="strat-control-label" htmlFor="strat-sort-customer">
              Ordenar clientes
            </label>
            <select
              id="strat-sort-customer"
              value={`${customerSortKey}-${customerSortOrder}`}
              onChange={(e) => {
                const [key, order] = e.target.value.split("-") as [any, any];
                setCustomerSortKey(key);
                setCustomerSortOrder(order);
              }}
              className="strat-input"
              style={{ minWidth: "180px", cursor: "pointer" }}
            >
              <option value="revenue-desc">Maior Faturamento</option>
              <option value="revenue-asc">Menor Faturamento</option>
              <option value="name-asc">Nome (A-Z)</option>
              <option value="name-desc">Nome (Z-A)</option>
              <option value="orders-desc">Mais Pedidos</option>
              <option value="orders-asc">Menos Pedidos</option>
              <option value="matches-desc">Mais Oportunidades</option>
              <option value="matches-asc">Menos Oportunidades</option>
            </select>
          </div>

          <div className="strat-control-group strat-search-group">
            <label className="strat-control-label" htmlFor="strat-search">
              Buscar cliente
            </label>
            <div className="strat-search-input-wrapper">
              <Search size={14} className="strat-search-icon" />
              <input
                id="strat-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="strat-input strat-search-input"
                placeholder="Nome ou código..."
              />
            </div>
          </div>
        </div>
      </div>


      {/* ── Summary Cards ── */}
      {data && !loading && (
        <div className="strat-summary-cards">
          <div className="strat-summary-card strat-summary-total">
            <div className="strat-summary-icon" style={{ color: "#6366f1", backgroundColor: "rgba(99, 102, 241, 0.08)" }}>
              <Users size={20} />
            </div>
            <div className="strat-summary-content">
              <span className="strat-summary-value">{formatNumber(data.summary.totalCustomers)}</span>
              <span className="strat-summary-label">Clientes com compras</span>
            </div>
          </div>

          {tabs.map((tab) => {
            const cfg = getStatusConfig(tab.status);
            const Icon = cfg.icon;
            return (
              <div
                key={tab.status}
                className="strat-summary-card"
              >
                <div className="strat-summary-icon" style={{ color: cfg.color, backgroundColor: cfg.bgColor }}>
                  <Icon size={20} />
                </div>
                <div className="strat-summary-content">
                  <span className="strat-summary-value">
                    {formatNumber(tab.count)}
                  </span>
                  <span className="strat-summary-label">{tab.label}</span>
                </div>
              </div>
            );
          })}

          <div className="strat-summary-card strat-summary-matches">
            <div className="strat-summary-icon" style={{ color: "#06b6d4", backgroundColor: "rgba(6, 182, 212, 0.08)" }}>
              <Crosshair size={20} />
            </div>
            <div className="strat-summary-content">
              <span className="strat-summary-value">{formatNumber(data.summary.totalProductMatches)}</span>
              <span className="strat-summary-label">Cruzamentos c/ estoque</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Status Tabs ── */}
      <div className="strat-tabs">
        {tabs.map((tab) => {
          return (
            <button
              key={tab.status}
              type="button"
              className={`strat-tab ${activeTab === tab.status ? "strat-tab-active" : ""}`}
              onClick={() => setActiveTab(tab.status)}
            >
              {tab.label}
              <span className="strat-tab-count">{formatNumber(tab.count)}</span>
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div className="strat-content">
        {loading && (
          <div className="strat-loading">
            <RefreshCw size={28} className="strat-spin" />
            <span>Carregando cruzamento de dados...</span>
          </div>
        )}

        {error && !loading && (
          <div className="strat-error">
            <ShieldAlert size={20} />
            <span>{error}</span>
            <button type="button" className="strat-btn strat-btn-primary" onClick={handleRefresh}>
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && filteredCustomers.length === 0 && (
          <div className="strat-empty">
            <Box size={32} />
            <strong>Nenhum cliente encontrado</strong>
            <span>
              {searchTerm
                ? "Tente outro termo de busca"
                : showStockFilter
                  ? `Nenhum cliente ${getStatusConfig(activeTab).label.toLowerCase()} possui produtos com estoque ≥ ${minStock}`
                  : `Nenhum cliente ${getStatusConfig(activeTab).label.toLowerCase()} encontrado`}
            </span>
          </div>
        )}

        {!loading && !error && filteredCustomers.length > 0 && (
          <div className="strat-customers-list">
            <div className="strat-list-info">
              <span>{formatNumber(filteredCustomers.length)} clientes</span>
            </div>
            {filteredCustomers.map((customer) => (
              <CustomerCard
                key={customer.customerId}
                customer={customer}
                showStockFilter={showStockFilter}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
