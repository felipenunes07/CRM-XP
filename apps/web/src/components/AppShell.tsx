import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, ClipboardList, LayoutDashboard, LogOut, MessageSquareText, Tags, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const links = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/clientes", icon: Users, label: "Clientes" },
  { to: "/segmentos", icon: BarChart3, label: "Segmentos" },
  { to: "/agenda", icon: ClipboardList, label: "Agenda" },
  { to: "/mensagens", icon: MessageSquareText, label: "Mensagens" },
  { to: "/rotulos", icon: Tags, label: "Rotulos" },
];

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <img className="brand-logo" src="/xp-factory-logo.png" alt="XP Factory" />
            <div>
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
          <button className="ghost-button" type="button" onClick={logout}>
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
