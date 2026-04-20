import { useEffect, useMemo, useRef, useState } from "react";
import { AMBASSADOR_LABEL_NAME } from "@olist-crm/shared";
import type { CustomerListItem } from "@olist-crm/shared";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { InfoHint } from "./InfoHint";
import { formatCurrency, formatDate, formatDaysSince, statusLabel } from "../lib/format";

type SortableColumnId =
  | "customer"
  | "lastPurchaseAt"
  | "daysSinceLastPurchase"
  | "totalOrders"
  | "avgTicket"
  | "totalSpent"
  | "avgDaysBetweenOrders"
  | "priorityScore";

type ColumnId = SortableColumnId | "status" | "labels" | "insight";
type SortDirection = "asc" | "desc";

type TableColumn = {
  id: ColumnId;
  label: string;
  width: number;
  minWidth: number;
  sortable?: boolean;
  defaultDirection?: SortDirection;
  hint?: string;
  getValue?: (customer: CustomerListItem) => number | string | null;
};

const columns: TableColumn[] = [
  {
    id: "customer",
    label: "Cliente",
    width: 260,
    minWidth: 220,
    sortable: true,
    defaultDirection: "asc",
    getValue: (customer) => `${customer.displayName} ${customer.customerCode}`.trim().toLocaleLowerCase("pt-BR"),
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
];

const initialColumnWidths = columns.reduce(
  (accumulator, column) => ({ ...accumulator, [column.id]: column.width }),
  {} as Record<ColumnId, number>,
);

function SortIndicator({ direction }: { direction?: SortDirection }) {
  if (direction === "asc") {
    return <ArrowUp size={14} />;
  }

  if (direction === "desc") {
    return <ArrowDown size={14} />;
  }

  return <ArrowUpDown size={14} />;
}

function compareValues(left: number | string | null, right: number | string | null, direction: SortDirection) {
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
    return direction === "asc" ? left.localeCompare(right, "pt-BR") : right.localeCompare(left, "pt-BR");
  }

  const leftNumber = Number(left);
  const rightNumber = Number(right);

  return direction === "asc" ? leftNumber - rightNumber : rightNumber - leftNumber;
}

export function CustomerTable({ customers }: { customers: CustomerListItem[] }) {
  const [sortState, setSortState] = useState<{ columnId: SortableColumnId; direction: SortDirection } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(initialColumnWidths);
  const resizeStateRef = useRef<{ columnId: ColumnId; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!resizeStateRef.current) {
        return;
      }

      const activeColumn = columns.find((column) => column.id === resizeStateRef.current?.columnId);
      if (!activeColumn) {
        return;
      }

      const nextWidth = Math.max(activeColumn.minWidth, resizeStateRef.current.startWidth + event.clientX - resizeStateRef.current.startX);
      setColumnWidths((current) =>
        current[activeColumn.id] === nextWidth ? current : { ...current, [activeColumn.id]: nextWidth },
      );
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
  }, []);

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
        const comparison = compareValues(
          activeColumn.getValue?.(left.customer) ?? null,
          activeColumn.getValue?.(right.customer) ?? null,
          sortState.direction,
        );

        return comparison === 0 ? left.index - right.index : comparison;
      })
      .map((entry) => entry.customer);
  }, [customers, sortState]);

  const tableWidth = columns.reduce((total, column) => total + (columnWidths[column.id] ?? column.width), 0);

  function toggleSort(column: TableColumn) {
    const defaultDirection = column.defaultDirection;

    if (!column.sortable || !defaultDirection) {
      return;
    }

    setSortState((current) => {
      if (!current || current.columnId !== column.id) {
        return { columnId: column.id as SortableColumnId, direction: defaultDirection };
      }

      if (current.direction === defaultDirection) {
        return {
          columnId: column.id as SortableColumnId,
          direction: defaultDirection === "desc" ? "asc" : "desc",
        };
      }

      return null;
    });
  }

  function startResize(event: React.MouseEvent<HTMLButtonElement>, columnId: ColumnId) {
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
    return (
      <div className="panel table-panel empty-panel">
        <div className="empty-state">Nenhum cliente encontrado para esse filtro.</div>
      </div>
    );
  }

  return (
    <div className="panel table-panel">
      <div className="table-scroll">
        <table className="data-table" style={{ minWidth: `${tableWidth}px` }}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.id} style={{ width: `${columnWidths[column.id]}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => {
                const isSorted = sortState?.columnId === column.id;
                const activeDirection = isSorted ? sortState.direction : undefined;

                return (
                  <th key={column.id}>
                    <div className="table-head-cell">
                      <div className="table-header-group">
                        {column.sortable ? (
                          <button
                            className={`table-sort-button ${isSorted ? "active" : ""}`}
                            type="button"
                            onClick={() => toggleSort(column)}
                          >
                            <span>{column.label}</span>
                            <SortIndicator direction={activeDirection} />
                          </button>
                        ) : (
                          <span className="table-head-static">{column.label}</span>
                        )}
                        {column.hint ? <InfoHint text={column.hint} /> : null}
                      </div>
                      <button
                        className="resize-handle"
                        type="button"
                        aria-label={`Redimensionar coluna ${column.label}`}
                        onMouseDown={(event) => startResize(event, column.id)}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedCustomers.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <Link className="table-link" to={`/clientes/${customer.id}`}>
                    <strong>{customer.displayName}</strong>
                    <span>{customer.customerCode}</span>
                    {customer.isAmbassador ? <small className="table-inline-badge">{AMBASSADOR_LABEL_NAME}</small> : null}
                  </Link>
                </td>
                <td>
                  <span className={`status-badge status-${customer.status.toLowerCase()}`}>{statusLabel(customer.status)}</span>
                </td>
                <td>{formatDate(customer.lastPurchaseAt)}</td>
                <td>{formatDaysSince(customer.daysSinceLastPurchase)}</td>
                <td>{customer.totalOrders}</td>
                 <td>
                  {customer.avgDaysBetweenOrders !== null && customer.avgDaysBetweenOrders !== undefined ? (
                    `${Math.round(customer.avgDaysBetweenOrders)} dias`
                  ) : (
                    <span className="muted-copy">—</span>
                  )}
                </td>
                <td>{formatCurrency(customer.avgTicket)}</td>
                <td>{formatCurrency(customer.totalSpent)}</td>
                <td>
                  <div className="tag-row compact">
                    {customer.labels.length ? (
                      customer.labels.map((label) => (
                        <span
                          key={label.id}
                          className="tag"
                          style={{ background: `${label.color}14`, color: label.color, borderColor: `${label.color}33` }}
                        >
                          {label.name}
                        </span>
                      ))
                    ) : (
                      <span className="muted-copy">Sem rotulo</span>
                    )}
                  </div>
                </td>
                <td>{customer.priorityScore.toFixed(1)}</td>
                <td>{customer.primaryInsight ?? "Sem alerta"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
