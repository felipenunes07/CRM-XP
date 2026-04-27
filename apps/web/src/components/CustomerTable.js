import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { AMBASSADOR_LABEL_NAME } from "@olist-crm/shared";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { InfoHint } from "./InfoHint";
import { formatCurrency, formatDate, formatDaysSince, getFormattingLocale, statusLabel } from "../lib/format";
import { useUiLanguage } from "../i18n";
const columns = [
    {
        id: "customer",
        label: "Cliente",
        width: 260,
        minWidth: 220,
        sortable: true,
        defaultDirection: "asc",
        getValue: (customer) => `${customer.displayName} ${customer.customerCode}`.trim().toLocaleLowerCase(getFormattingLocale()),
    },
    {
        id: "status",
        label: "Status",
        width: 120,
        minWidth: 110,
    },
    {
        id: "lastPurchaseAt",
        label: "Ultima compra",
        width: 130,
        minWidth: 120,
        sortable: true,
        defaultDirection: "desc",
        getValue: (customer) => (customer.lastPurchaseAt ? Date.parse(customer.lastPurchaseAt) : null),
    },
    {
        id: "daysSinceLastPurchase",
        label: "Tempo sem comprar",
        width: 150,
        minWidth: 140,
        sortable: true,
        defaultDirection: "desc",
        getValue: (customer) => customer.daysSinceLastPurchase,
    },
    {
        id: "totalOrders",
        label: "Pedidos",
        width: 90,
        minWidth: 90,
        sortable: true,
        defaultDirection: "desc",
        getValue: (customer) => customer.totalOrders,
    },
    {
        id: "avgDaysBetweenOrders",
        label: "Media pedidos",
        width: 120,
        minWidth: 110,
        sortable: true,
        defaultDirection: "desc",
        hint: "Intervalo medio entre pedidos do cliente.",
        getValue: (customer) => customer.avgDaysBetweenOrders,
    },
    {
        id: "avgTicket",
        label: "Ticket medio",
        width: 140,
        minWidth: 130,
        sortable: true,
        defaultDirection: "desc",
        getValue: (customer) => customer.avgTicket,
    },
    {
        id: "totalSpent",
        label: "Total gasto",
        width: 150,
        minWidth: 140,
        sortable: true,
        defaultDirection: "desc",
        getValue: (customer) => customer.totalSpent,
    },
    {
        id: "labels",
        label: "Rotulos",
        width: 220,
        minWidth: 180,
    },
    {
        id: "priorityScore",
        label: "Prioridade",
        width: 110,
        minWidth: 100,
        sortable: true,
        defaultDirection: "desc",
        hint: "Pontuacao de prioridade: 40% recencia, 25% valor do cliente, 20% queda de frequencia e 15% compra prevista vencida.",
        getValue: (customer) => customer.priorityScore,
    },
    {
        id: "insight",
        label: "Insight",
        width: 220,
        minWidth: 180,
    },
    {
        id: "location",
        label: "Região",
        width: 140,
        minWidth: 120,
        getValue: (customer) => `${customer.city || ""} ${customer.state || ""}`.trim(),
    },
];
const initialColumnWidths = columns.reduce((accumulator, column) => ({ ...accumulator, [column.id]: column.width }), {});
function SortIndicator({ direction }) {
    if (direction === "asc") {
        return _jsx(ArrowUp, { size: 14 });
    }
    if (direction === "desc") {
        return _jsx(ArrowDown, { size: 14 });
    }
    return _jsx(ArrowUpDown, { size: 14 });
}
function compareValues(left, right, direction) {
    if (left === null && right === null) {
        return 0;
    }
    if (left === null) {
        return 1;
    }
    if (right === null) {
        return -1;
    }
    if (typeof left === "string" && typeof right === "string") {
        const locale = getFormattingLocale();
        return direction === "asc" ? left.localeCompare(right, locale) : right.localeCompare(left, locale);
    }
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    return direction === "asc" ? leftNumber - rightNumber : rightNumber - leftNumber;
}
export function CustomerTable({ customers }) {
    const { tx } = useUiLanguage();
    const [sortState, setSortState] = useState(null);
    const [columnWidths, setColumnWidths] = useState(initialColumnWidths);
    const resizeStateRef = useRef(null);
    const locale = getFormattingLocale();
    const localizedColumns = useMemo(() => columns.map((column) => ({
        ...column,
        label: column.id === "customer"
            ? tx("Cliente", "客户")
            : column.id === "status"
                ? tx("Status", "状态")
                : column.id === "lastPurchaseAt"
                    ? tx("Ultima compra", "最近购买")
                    : column.id === "daysSinceLastPurchase"
                        ? tx("Tempo sem comprar", "距上次购买")
                        : column.id === "totalOrders"
                            ? tx("Pedidos", "订单数")
                            : column.id === "avgDaysBetweenOrders"
                                ? tx("Media pedidos", "平均下单间隔")
                                : column.id === "avgTicket"
                                    ? tx("Ticket medio", "平均客单价")
                                    : column.id === "totalSpent"
                                        ? tx("Total gasto", "累计消费")
                                        : column.id === "labels"
                                            ? tx("Rotulos", "标签")
                                            : column.id === "priorityScore"
                                                ? tx("Prioridade", "优先级")
                                                : column.id === "insight"
                                                    ? tx("Insight", "洞察")
                                                    : tx("Região", "地区"),
        hint: column.id === "avgDaysBetweenOrders"
            ? tx("Intervalo medio entre pedidos do cliente.", "客户两次下单之间的平均间隔。")
            : column.id === "priorityScore"
                ? tx("Pontuacao de prioridade: 40% recencia, 25% valor do cliente, 20% queda de frequencia e 15% compra prevista vencida.", "优先级评分：40% 最近活跃度、25% 客户价值、20% 频率下滑、15% 预计购买逾期。")
                : undefined,
    })), [tx]);
    useEffect(() => {
        function handleMouseMove(event) {
            if (!resizeStateRef.current) {
                return;
            }
            const activeColumn = localizedColumns.find((column) => column.id === resizeStateRef.current?.columnId);
            if (!activeColumn) {
                return;
            }
            const nextWidth = Math.max(activeColumn.minWidth, resizeStateRef.current.startWidth + event.clientX - resizeStateRef.current.startX);
            setColumnWidths((current) => current[activeColumn.id] === nextWidth ? current : { ...current, [activeColumn.id]: nextWidth });
        }
        function handleMouseUp() {
            if (!resizeStateRef.current) {
                return;
            }
            resizeStateRef.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [localizedColumns]);
    const sortedCustomers = useMemo(() => {
        if (!sortState) {
            return customers;
        }
        const activeColumn = columns.find((column) => column.id === sortState.columnId);
        if (!activeColumn?.getValue) {
            return customers;
        }
        return customers
            .map((customer, index) => ({ customer, index }))
            .sort((left, right) => {
            const comparison = compareValues(activeColumn.getValue?.(left.customer) ?? null, activeColumn.getValue?.(right.customer) ?? null, sortState.direction);
            return comparison === 0 ? left.index - right.index : comparison;
        })
            .map((entry) => entry.customer);
    }, [customers, sortState]);
    const tableWidth = localizedColumns.reduce((total, column) => total + (columnWidths[column.id] ?? column.width), 0);
    function toggleSort(column) {
        const defaultDirection = column.defaultDirection;
        if (!column.sortable || !defaultDirection) {
            return;
        }
        setSortState((current) => {
            if (!current || current.columnId !== column.id) {
                return { columnId: column.id, direction: defaultDirection };
            }
            if (current.direction === defaultDirection) {
                return {
                    columnId: column.id,
                    direction: defaultDirection === "desc" ? "asc" : "desc",
                };
            }
            return null;
        });
    }
    function startResize(event, columnId) {
        event.preventDefault();
        event.stopPropagation();
        resizeStateRef.current = {
            columnId,
            startX: event.clientX,
            startWidth: columnWidths[columnId],
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }
    if (!customers.length) {
        return (_jsx("div", { className: "panel table-panel empty-panel", children: _jsx("div", { className: "empty-state", children: tx("Nenhum cliente encontrado para esse filtro.", "当前筛选下没有找到客户。") }) }));
    }
    return (_jsx("div", { className: "panel table-panel", children: _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table", style: { minWidth: `${tableWidth}px` }, children: [_jsx("colgroup", { children: localizedColumns.map((column) => (_jsx("col", { style: { width: `${columnWidths[column.id]}px` } }, column.id))) }), _jsx("thead", { children: _jsx("tr", { children: localizedColumns.map((column) => {
                                const isSorted = Boolean(sortState && sortState.columnId === column.id);
                                const activeDirection = isSorted ? sortState?.direction : undefined;
                                return (_jsx("th", { children: _jsxs("div", { className: "table-head-cell", children: [_jsxs("div", { className: "table-header-group", children: [column.sortable ? (_jsxs("button", { className: `table-sort-button ${isSorted ? "active" : ""}`, type: "button", onClick: () => toggleSort(column), children: [_jsx("span", { children: column.label }), _jsx(SortIndicator, { direction: activeDirection })] })) : (_jsx("span", { className: "table-head-static", children: column.label })), column.hint ? _jsx(InfoHint, { text: column.hint }) : null] }), _jsx("button", { className: "resize-handle", type: "button", "aria-label": `${tx("Redimensionar coluna", "调整列宽")} ${column.label}`, onMouseDown: (event) => startResize(event, column.id) })] }) }, column.id));
                            }) }) }), _jsx("tbody", { children: sortedCustomers.map((customer) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs(Link, { className: "table-link", to: `/clientes/${customer.id}`, children: [_jsx("strong", { children: customer.displayName }), _jsx("span", { children: customer.customerCode }), customer.isAmbassador ? _jsx("small", { className: "table-inline-badge", children: AMBASSADOR_LABEL_NAME }) : null] }) }), _jsx("td", { children: _jsx("span", { className: `status-badge status-${customer.status.toLowerCase()}`, children: statusLabel(customer.status) }) }), _jsx("td", { children: formatDate(customer.lastPurchaseAt) }), _jsx("td", { children: formatDaysSince(customer.daysSinceLastPurchase) }), _jsx("td", { children: customer.totalOrders }), _jsx("td", { children: customer.avgDaysBetweenOrders !== null && customer.avgDaysBetweenOrders !== undefined ? (locale === "zh-CN"
                                        ? `${Math.round(customer.avgDaysBetweenOrders)}天`
                                        : `${Math.round(customer.avgDaysBetweenOrders)} dias`) : (_jsx("span", { className: "muted-copy", children: "-" })) }), _jsx("td", { children: formatCurrency(customer.avgTicket) }), _jsx("td", { children: formatCurrency(customer.totalSpent) }), _jsx("td", { children: _jsx("div", { className: "tag-row compact", children: customer.labels.length ? (customer.labels.map((label) => (_jsx("span", { className: "tag", style: { background: `${label.color}14`, color: label.color, borderColor: `${label.color}33` }, children: label.name }, label.id)))) : (_jsx("span", { className: "muted-copy", children: tx("Sem rotulo", "无标签") })) }) }), _jsx("td", { children: customer.priorityScore.toFixed(1) }), _jsx("td", { children: customer.primaryInsight ?? tx("Sem alerta", "无提醒") }), _jsx("td", { children: _jsxs("div", { className: "location-cell", children: [_jsx("span", { className: "city-text", children: customer.city || "-" }), customer.state && _jsx("span", { className: "state-badge", children: customer.state })] }) })] }, customer.id))) })] }) }) }));
}
