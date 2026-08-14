import type { CustomerDetail } from "@olist-crm/shared";
import { ChevronDown, PackageOpen, ReceiptText } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatDate, formatNumber } from "../lib/format";

type CustomerOrder = CustomerDetail["recentOrders"][number];

interface CustomerRecentOrdersProps {
  orders: CustomerOrder[];
  initialLimit?: number;
  title?: string;
  description?: string;
}

function orderStatusClass(status: string) {
  const normalized = status.toLocaleLowerCase("pt-BR");
  if (normalized.includes("cancel")) return "is-cancelled";
  if (normalized.includes("fat") || normalized.includes("valid") || normalized.includes("concl")) return "is-complete";
  return "is-neutral";
}

export function CustomerRecentOrders({
  orders,
  initialLimit = 4,
  title = "Últimos pedidos",
  description = "Produtos, quantidades e valores de cada compra.",
}: CustomerRecentOrdersProps) {
  const [visibleCount, setVisibleCount] = useState(initialLimit);
  const visibleOrders = orders.slice(0, visibleCount);
  const hasMore = visibleCount < orders.length;

  return (
    <section className="panel customer-recent-orders-panel" aria-labelledby="customer-recent-orders-title">
      <header className="customer-section-heading customer-orders-titlebar">
        <div>
          <p className="eyebrow">Histórico recente</p>
          <h2 id="customer-recent-orders-title">{title}</h2>
          <p className="panel-subcopy">{description}</p>
        </div>
        <span className="customer-order-count">{orders.length} pedidos carregados</span>
      </header>

      {visibleOrders.length ? (
        <div className="customer-order-cards">
          {visibleOrders.map((order) => (
            <article key={order.id} className="customer-order-card">
              <header className="customer-order-card-header">
                <div className="customer-order-primary">
                  <span className="customer-order-icon" aria-hidden="true"><ReceiptText size={18} /></span>
                  <div>
                    <strong>Pedido {order.orderNumber}</strong>
                    <span>{formatDate(order.orderDate)}</span>
                  </div>
                </div>
                <div className="customer-order-meta">
                  <span className={`customer-order-status ${orderStatusClass(order.status)}`}>{order.status}</span>
                  <span>{formatNumber(order.itemCount)} produtos · {formatNumber(order.totalQuantity)} peças</span>
                  <strong>{formatCurrency(order.totalAmount)}</strong>
                </div>
              </header>

              {order.items.length ? (
                <div className="customer-order-items" role="table" aria-label={`Itens do pedido ${order.orderNumber}`}>
                  <div className="customer-order-items-head" role="row">
                    <span role="columnheader">Produto</span>
                    <span role="columnheader">Qtd.</span>
                    <span role="columnheader">Unitário</span>
                    <span role="columnheader">Subtotal</span>
                  </div>
                  {order.items.map((item) => (
                    <div key={item.id} className="customer-order-item" role="row">
                      <div role="cell">
                        <strong>{item.itemDescription}</strong>
                        <span>{item.sku ? `SKU ${item.sku}` : "SKU não informado"}</span>
                      </div>
                      <span role="cell" data-label="Quantidade">{formatNumber(item.quantity)}</span>
                      <span role="cell" data-label="Valor unitário">{formatCurrency(item.unitPrice)}</span>
                      <strong role="cell" data-label="Subtotal">{formatCurrency(item.lineTotal)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="customer-order-items-empty">
                  <PackageOpen size={17} /> Os itens deste pedido não estão detalhados na origem.
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="customer-list-empty"><PackageOpen size={18} /> Nenhum pedido encontrado para este cliente.</div>
      )}

      {hasMore ? (
        <button type="button" className="customer-orders-more" onClick={() => setVisibleCount((count) => count + initialLimit)}>
          Mostrar mais pedidos <ChevronDown size={16} />
        </button>
      ) : null}
    </section>
  );
}
