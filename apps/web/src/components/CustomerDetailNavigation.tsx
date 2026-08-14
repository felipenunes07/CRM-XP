import { ChartNoAxesCombined, LayoutDashboard, ShoppingBag } from "lucide-react";
import { NavLink } from "react-router-dom";

export function CustomerDetailNavigation({ customerId }: { customerId: string }) {
  return (
    <nav className="customer-detail-navigation" aria-label="Seções do cliente">
      <NavLink to={`/clientes/${customerId}`} end>
        <LayoutDashboard size={16} />
        <span>Perfil e últimos pedidos</span>
      </NavLink>
      <NavLink to={`/clientes/${customerId}/compras`}>
        <ShoppingBag size={16} />
        <span>Histórico completo</span>
      </NavLink>
      <NavLink to={`/clientes/${customerId}/analises`}>
        <ChartNoAxesCombined size={16} />
        <span>Análises</span>
      </NavLink>
    </nav>
  );
}
