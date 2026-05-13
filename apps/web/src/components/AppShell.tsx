import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  ClipboardList,
  Kanban,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  MessageSquareText,
  Activity,
  RadioTower,
  Search,
  SearchCheck,
  Star,
  Tags,
  TrendingUp,
  Trophy,
  UserCog,
  UserPlus,
  Users,
  Hexagon,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useUiLanguage } from "../i18n";

/* ── link structure for external tests ── */
export const appShellLinks = [
  { to: "/", icon: LayoutDashboard, labelPt: "Dashboard" },
  { to: "/pipeline", icon: Kanban, labelPt: "Pipeline" },
  { to: "/metas", icon: Trophy, labelPt: "Metas" },
  { to: "/atendentes", icon: TrendingUp, labelPt: "Atendentes" },
  { to: "/clientes", icon: Users, labelPt: "Clientes" },
// { to: "/clientes/financeiro", icon: Users, labelPt: "Financeiro" },
  { to: "/estoque", icon: Boxes, labelPt: "Estoque" },
  { to: "/embaixadores", icon: Star, labelPt: "Embaixadores" },
  { to: "/segmentos", icon: BarChart3, labelPt: "Segmentos" },
  { to: "/agenda", icon: ClipboardList, labelPt: "Agenda" },
  { to: "/clientes-novos", icon: UserPlus, labelPt: "Clientes novos" },
  { to: "/reativacao", icon: Trophy, labelPt: "Reativacao" },
  { to: "/ideias-votacao", icon: Lightbulb, labelPt: "Ideias/Votacao" },
  { to: "/mensagens", icon: MessageSquareText, labelPt: "Mensagens" },
  { to: "/atividade-whatsapp", icon: Activity, labelPt: "Atividade WhatsApp" },
  { to: "/disparador", icon: RadioTower, labelPt: "Disparador" },
  { to: "/prospeccao", icon: SearchCheck, labelPt: "Prospeccao" },
  { to: "/rotulos", icon: Tags, labelPt: "Rotulos" },
  { to: "/usuarios", icon: UserCog, labelPt: "Usuarios", adminOnly: true },
];

/* ── Types ── */
interface SidebarItem {
  to: string;
  labelPt: string;
  icon?: React.ComponentType<{ size?: number }>;
  adminOnly?: boolean;
}

interface SidebarGroup {
  labelPt: string;
  icon: React.ComponentType<{ size?: number }>;
  children: SidebarItem[];
  adminOnly?: boolean;
}

type SidebarEntry = SidebarItem | SidebarGroup;

function isGroup(entry: SidebarEntry): entry is SidebarGroup {
  return "children" in entry;
}

/* ── Sidebar menu structure ── */
const sidebarMenu: SidebarEntry[] = [
  { to: "/", icon: LayoutDashboard, labelPt: "Dashboard" },
  { to: "/pipeline", icon: Kanban, labelPt: "Pipeline" },
  { to: "/metas", icon: Trophy, labelPt: "Metas" },
  { to: "/atendentes", icon: TrendingUp, labelPt: "Atendentes" },
  {
    labelPt: "Clientes",
    icon: Users,
    children: [
      { to: "/clientes", labelPt: "Todos os Clientes" },
// { to: "/clientes/financeiro", labelPt: "Financeiro" },
      { to: "/clientes-novos", labelPt: "Clientes Novos" },
      { to: "/reativacao", labelPt: "Reativação" },
      { to: "/embaixadores", labelPt: "Embaixadores" },
    ],
  },
  {
    labelPt: "Comunicação",
    icon: MessageSquareText,
    children: [
      { to: "/mensagens", labelPt: "Mensagens" },
      { to: "/disparador", labelPt: "Disparador" },
    ],
  },
  {
    labelPt: "Relatórios",
    icon: BarChart3,
    children: [
      { to: "/atividade-whatsapp", labelPt: "Relatorios WhatsApp" },
      { to: "/estoque", labelPt: "Estoque" },
      { to: "/segmentos", labelPt: "Segmentos" },
      { to: "/rotulos", labelPt: "Rótulos" },
    ],
  },
  {
    labelPt: "Mais",
    icon: ClipboardList,
    children: [
      { to: "/agenda", labelPt: "Agenda" },
      { to: "/ideias-votacao", labelPt: "Ideias / Votação" },
      { to: "/prospeccao", labelPt: "Prospecção" },
    ],
  },
  { to: "/usuarios", icon: UserCog, labelPt: "Usuários", adminOnly: true },
];

/* ── Collapsible group component ── */
function SidebarGroupItem({
  group,
  tx,
}: {
  group: SidebarGroup;
  tx: (pt: string, fallback: string) => string;
}) {
  const location = useLocation();
  const childPaths = group.children.map((c) => c.to);
  const isChildActive = childPaths.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + "/")
  );
  const [open, setOpen] = useState(isChildActive);

  // Auto-open when a child route becomes active
  useEffect(() => {
    if (isChildActive && !open) setOpen(true);
  }, [isChildActive]);

  const Icon = group.icon;

  return (
    <li className="cw-group">
      <button
        type="button"
        className={`cw-group-toggle ${isChildActive ? "is-active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Icon size={16} />
        <span className="cw-label">{tx(group.labelPt, group.labelPt)}</span>
        <ChevronDown size={14} className={`cw-chevron ${open ? "open" : ""}`} />
      </button>
      {open && (
        <ul className="cw-group-children">
          {group.children.map((child) => (
            <li key={child.to} className="cw-child-item">
              <NavLink
                to={child.to}
                end={child.to === "/" || child.to === "/clientes"}
                className={({ isActive }) =>
                  `cw-child-link ${isActive ? "active" : ""}`
                }
              >
                {tx(child.labelPt, child.labelPt)}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* ── Main AppShell ── */
export function AppShell() {
  const { user, logout } = useAuth();
  const { language, setLanguage, tx } = useUiLanguage();
  const userInitials = user?.name
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const isAdminLike = user?.role === "ADMIN" || user?.role === "MANAGER";

  return (
    <div className="app-shell">
      <aside className="cw-sidebar">
        {/* ── Header ── */}
        <section className="cw-header">
          <div className="cw-premium-brand">
            <img src="/xp-factory-logo.png" alt="XP CRM" className="cw-logo-image" />
          </div>

          <div className="sidebar-language-card">
            <span className="sidebar-language-label">Idioma</span>
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
        </section>

        {/* ── Navigation ── */}
        <nav className="cw-nav">
          <ul className="cw-menu">
            {sidebarMenu
              .filter((entry) => {
                if (isGroup(entry)) {
                  return !entry.adminOnly || isAdminLike;
                }
                return !entry.adminOnly || isAdminLike;
              })
              .map((entry) => {
                if (isGroup(entry)) {
                  return (
                    <SidebarGroupItem
                      key={entry.labelPt}
                      group={entry}
                      tx={tx}
                    />
                  );
                }
                const Icon = entry.icon!;
                return (
                  <li key={entry.to} className="cw-item">
                    <NavLink
                      to={entry.to}
                      end={entry.to === "/"}
                      className={({ isActive }) =>
                        `cw-link ${isActive ? "active" : ""}`
                      }
                    >
                      <Icon size={16} />
                      <span className="cw-label">
                        {tx(entry.labelPt, entry.labelPt)}
                      </span>
                    </NavLink>
                  </li>
                );
              })}
          </ul>
        </nav>

        {/* ── Footer / User ── */}
        <section className="cw-footer">
          <div className="cw-user-card">
            <span className="cw-user-avatar">{userInitials || "XP"}</span>
            <div className="cw-user-info">
              <strong>{user?.name || tx("Usuario interno", "Usuario interno")}</strong>
              <span>{user?.email || tx("Sem email", "Sem email")}</span>
            </div>
            <button
              type="button"
              className="cw-logout-btn"
              onClick={logout}
              aria-label={tx("Encerrar sessao", "Encerrar sessao")}
              title={tx("Sair", "Sair")}
            >
              <LogOut size={14} />
            </button>
          </div>
        </section>
      </aside>

      <main className="main-content">
        <div className="main-scroll-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
