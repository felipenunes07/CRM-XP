import { NavLink, Outlet } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Lightbulb,
  LogOut,
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
import { useUiLanguage } from "../i18n";

export const appShellLinks = [
  { to: "/", icon: LayoutDashboard, labelPt: "Dashboard" },
  { to: "/metas", icon: Trophy, labelPt: "Metas" },
  { to: "/atendentes", icon: TrendingUp, labelPt: "Atendentes" },
  { to: "/clientes", icon: Users, labelPt: "Clientes" },
  { to: "/estoque", icon: Boxes, labelPt: "Estoque" },
  { to: "/embaixadores", icon: Star, labelPt: "Embaixadores" },
  { to: "/segmentos", icon: BarChart3, labelPt: "Segmentos" },
  { to: "/agenda", icon: ClipboardList, labelPt: "Agenda" },
  { to: "/clientes-novos", icon: UserPlus, labelPt: "Clientes novos" },
  { to: "/reativacao", icon: Trophy, labelPt: "Reativacao" },
  { to: "/ideias-votacao", icon: Lightbulb, labelPt: "Ideias/Votacao" },
  { to: "/mensagens", icon: MessageSquareText, labelPt: "Mensagens" },
  { to: "/disparador", icon: RadioTower, labelPt: "Disparador" },
  { to: "/prospeccao", icon: SearchCheck, labelPt: "Prospeccao" },
  { to: "/rotulos", icon: Tags, labelPt: "Rotulos" },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const { language, setLanguage, tx } = useUiLanguage();
  const userInitials = user?.name
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

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

          <div className="sidebar-language-card">
            <span className="sidebar-language-label">{tx("Idioma", "Idioma")}</span>
            <div
              className="language-switch"
              role="radiogroup"
              aria-label={tx("Selecionar idioma da interface", "Selecionar idioma da interface")}
            >
              <button
                type="button"
                className={`language-switch-button ${language === "pt-BR" ? "active" : ""}`}
                onClick={() => setLanguage("pt-BR")}
                aria-pressed={language === "pt-BR"}
                aria-label={tx("Exibir em portugues do Brasil", "Exibir em portugues do Brasil")}
              >
                PT
              </button>
              <button
                type="button"
                className={`language-switch-button ${language === "zh-CN" ? "active" : ""}`}
                onClick={() => setLanguage("zh-CN")}
                aria-pressed={language === "zh-CN"}
                aria-label={tx("Exibir em chines mandarim", "Exibir em chines mandarim")}
              >
                中文
              </button>
            </div>
          </div>

          <nav className="nav">
            {appShellLinks.map(({ to, icon: Icon, labelPt }) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <Icon size={18} />
                <span>{tx(labelPt, labelPt)}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-session-card">
            <span className="sidebar-user-avatar">{userInitials || "XP"}</span>
            <div className="sidebar-user-summary">
              <strong className="sidebar-user-name">{user?.name || tx("Usuario interno", "Usuario interno")}</strong>
              <span className="sidebar-user-email">{user?.email || tx("Sem email", "Sem email")}</span>
            </div>
            <button
              type="button"
              className="sidebar-logout-link"
              onClick={logout}
              aria-label={tx("Encerrar sessao", "Encerrar sessao")}
              title={tx("Sair", "Sair")}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="main-scroll-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
