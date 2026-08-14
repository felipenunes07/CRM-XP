import type { CustomerDetail } from "@olist-crm/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, MapPin, PackageOpen, ShoppingBag, UserRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { CustomerDetailNavigation } from "../components/CustomerDetailNavigation";
import { CustomerRecentOrders } from "../components/CustomerRecentOrders";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDate, formatNumber, statusLabel } from "../lib/format";

function customerStatusClass(status: CustomerDetail["status"]) {
  if (status === "ACTIVE" || status === "NEW") return "status-active";
  if (status === "ATTENTION") return "status-attention";
  return "status-inactive";
}

export function CustomerPurchasesContent({ customer }: { customer: CustomerDetail }) {
  const locationLabel = [customer.city, customer.state].filter(Boolean).join(" / ") || "Não informado";

  return (
    <div className="page-stack customer-detail-page customer-purchases-page">
      <Link to="/clientes" className="customer-back-link">
        <ArrowLeft size={16} /> Voltar para clientes
      </Link>

      <section className="customer-detail-hero">
        <div className="customer-identity">
          <div className="customer-avatar" aria-hidden="true"><ShoppingBag size={23} /></div>
          <div>
            <p className="eyebrow">Compras do cliente</p>
            <h1>{customer.displayName}</h1>
            <div className="customer-identity-meta">
              <span className={`status-badge ${customerStatusClass(customer.status)}`}>{statusLabel(customer.status)}</span>
              <span>{customer.customerCode || "Sem código"}</span>
              <span><MapPin size={14} /> {locationLabel}</span>
              <span><UserRound size={14} /> {customer.lastAttendant ?? "Sem vendedora informada"}</span>
            </div>
          </div>
        </div>
        <Link to={`/clientes/${customer.id}`} className="ghost-button">
          Ver ficha e observações
        </Link>
      </section>

      <CustomerDetailNavigation customerId={customer.id} />

      <section className="customer-purchase-summary" aria-label="Resumo das compras">
        <article>
          <span><ShoppingBag size={17} /></span>
          <div><small>Total comprado</small><strong>{formatCurrency(customer.totalSpent)}</strong></div>
        </article>
        <article>
          <span><PackageOpen size={17} /></span>
          <div><small>Pedidos no histórico</small><strong>{formatNumber(customer.totalOrders)}</strong></div>
        </article>
        <article>
          <span><ShoppingBag size={17} /></span>
          <div><small>Ticket médio</small><strong>{formatCurrency(customer.avgTicket)}</strong></div>
        </article>
        <article>
          <span><CalendarDays size={17} /></span>
          <div><small>Última compra</small><strong>{formatDate(customer.lastPurchaseAt)}</strong></div>
        </article>
      </section>

      <CustomerRecentOrders
        orders={customer.recentOrders}
        initialLimit={20}
        title="Histórico completo de pedidos"
        description="Os 20 pedidos mais recentes com todos os produtos disponíveis na origem."
      />
    </div>
  );
}

export function CustomerPurchasesPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const detailQuery = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.customer(token!, id!),
    enabled: Boolean(token && id),
  });

  if (detailQuery.isLoading) return <div className="page-loading">Carregando compras do cliente...</div>;
  if (detailQuery.isError || !detailQuery.data) return <div className="page-error">Não foi possível carregar as compras do cliente.</div>;

  return <CustomerPurchasesContent customer={detailQuery.data} />;
}
