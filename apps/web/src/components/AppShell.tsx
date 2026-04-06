import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, ClipboardList, LayoutDashboard, MessageSquareText, Tags, Users } from "lucide-react";
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
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-mark">
              <img className="brand-logo" src="/xp-factory-logo.png" alt="XP Factory" />
            </div>
            <div className="brand-copy">
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
            <p className="eyebrow">Sessão interna</p>
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
