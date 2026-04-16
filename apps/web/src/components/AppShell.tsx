import { NavLink, Outlet } from "react-router-dom";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  MessageSquareText,
  RadioTower,
  SearchCheck,
  Star,
  Tags,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const links = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/atendentes", icon: TrendingUp, label: "Atendentes" },
  { to: "/clientes", icon: Users, label: "Clientes" },
  { to: "/embaixadores", icon: Star, label: "Embaixadores" },
  { to: "/segmentos", icon: BarChart3, label: "Segmentos" },
  { to: "/agenda", icon: ClipboardList, label: "Agenda" },
  { to: "/clientes-novos", icon: UserPlus, label: "Clientes novos" },
  { to: "/reativacao", icon: Trophy, label: "Reativacao" },
  { to: "/mensagens", icon: MessageSquareText, label: "Mensagens" },
  { to: "/disparador", icon: RadioTower, label: "Disparador" },
  { to: "/prospeccao", icon: SearchCheck, label: "Prospeccao" },
  { to: "/rotulos", icon: Tags, label: "Rotulos" },
];

export function AppShell() {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand premium-brand">
            <div className="brand-copy premium-brand-copy">
              <p className="eyebrow">XP Factory</p>
              <h1>XP CRM</h1>
            </div>
          </div>

          <nav className="nav">
            {links.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div>
            <p className="eyebrow">Sessao interna</p>
            <strong>{user?.name}</strong>
            <p>{user?.role}</p>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
