import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { BarChart3, Boxes, ChevronDown, ClipboardList, Kanban, LayoutDashboard, Lightbulb, LogOut, MessageSquareText, Activity, RadioTower, SearchCheck, Star, Tags, TrendingUp, Trophy, UserCog, UserPlus, Users, } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useUiLanguage } from "../i18n";
/* ── link structure for external tests ── */
export const appShellLinks = [
    { to: "/", icon: LayoutDashboard, labelPt: "Dashboard" },
    { to: "/pipeline", icon: Kanban, labelPt: "Pipeline" },
    { to: "/metas", icon: Trophy, labelPt: "Metas" },
    { to: "/atendentes", icon: TrendingUp, labelPt: "Atendentes" },
    { to: "/clientes", icon: Users, labelPt: "Clientes" },
    { to: "/clientes/financeiro", icon: Users, labelPt: "Financeiro" },
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
function isGroup(entry) {
    return "children" in entry;
}
/* ── Sidebar menu structure ── */
const sidebarMenu = [
    { to: "/", icon: LayoutDashboard, labelPt: "Dashboard" },
    { to: "/pipeline", icon: Kanban, labelPt: "Pipeline" },
    { to: "/metas", icon: Trophy, labelPt: "Metas" },
    { to: "/atendentes", icon: TrendingUp, labelPt: "Atendentes" },
    {
        labelPt: "Clientes",
        icon: Users,
        children: [
            { to: "/clientes", labelPt: "Todos os Clientes" },
            { to: "/clientes/financeiro", labelPt: "Financeiro" },
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
function SidebarGroupItem({ group, tx, }) {
    const location = useLocation();
    const childPaths = group.children.map((c) => c.to);
    const isChildActive = childPaths.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"));
    const [open, setOpen] = useState(isChildActive);
    // Auto-open when a child route becomes active
    useEffect(() => {
        if (isChildActive && !open)
            setOpen(true);
    }, [isChildActive]);
    const Icon = group.icon;
    return (_jsxs("li", { className: "cw-group", children: [_jsxs("button", { type: "button", className: `cw-group-toggle ${isChildActive ? "is-active" : ""}`, onClick: () => setOpen(!open), "aria-expanded": open, children: [_jsx(Icon, { size: 16 }), _jsx("span", { className: "cw-label", children: tx(group.labelPt, group.labelPt) }), _jsx(ChevronDown, { size: 14, className: `cw-chevron ${open ? "open" : ""}` })] }), open && (_jsx("ul", { className: "cw-group-children", children: group.children.map((child) => (_jsx("li", { className: "cw-child-item", children: _jsx(NavLink, { to: child.to, end: child.to === "/" || child.to === "/clientes", className: ({ isActive }) => `cw-child-link ${isActive ? "active" : ""}`, children: tx(child.labelPt, child.labelPt) }) }, child.to))) }))] }));
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
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "cw-sidebar", children: [_jsxs("section", { className: "cw-header", children: [_jsx("div", { className: "cw-premium-brand", children: _jsx("img", { src: "/xp-factory-logo.png", alt: "XP CRM", className: "cw-logo-image" }) }), _jsxs("div", { className: "sidebar-language-card", children: [_jsx("span", { className: "sidebar-language-label", children: "Idioma" }), _jsxs("div", { className: "language-switch", role: "radiogroup", "aria-label": tx("Selecionar idioma da interface", "Selecionar idioma da interface"), children: [_jsx("button", { type: "button", className: `language-switch-button ${language === "pt-BR" ? "active" : ""}`, onClick: () => setLanguage("pt-BR"), "aria-pressed": language === "pt-BR", "aria-label": tx("Exibir em portugues do Brasil", "Exibir em portugues do Brasil"), children: "PT" }), _jsx("button", { type: "button", className: `language-switch-button ${language === "zh-CN" ? "active" : ""}`, onClick: () => setLanguage("zh-CN"), "aria-pressed": language === "zh-CN", "aria-label": tx("Exibir em chines mandarim", "Exibir em chines mandarim"), children: "\u4E2D\u6587" })] })] })] }), _jsx("nav", { className: "cw-nav", children: _jsx("ul", { className: "cw-menu", children: sidebarMenu
                                .filter((entry) => {
                                if (isGroup(entry)) {
                                    return !entry.adminOnly || isAdminLike;
                                }
                                return !entry.adminOnly || isAdminLike;
                            })
                                .map((entry) => {
                                if (isGroup(entry)) {
                                    return (_jsx(SidebarGroupItem, { group: entry, tx: tx }, entry.labelPt));
                                }
                                const Icon = entry.icon;
                                return (_jsx("li", { className: "cw-item", children: _jsxs(NavLink, { to: entry.to, end: entry.to === "/", className: ({ isActive }) => `cw-link ${isActive ? "active" : ""}`, children: [_jsx(Icon, { size: 16 }), _jsx("span", { className: "cw-label", children: tx(entry.labelPt, entry.labelPt) })] }) }, entry.to));
                            }) }) }), _jsx("section", { className: "cw-footer", children: _jsxs("div", { className: "cw-user-card", children: [_jsx("span", { className: "cw-user-avatar", children: userInitials || "XP" }), _jsxs("div", { className: "cw-user-info", children: [_jsx("strong", { children: user?.name || tx("Usuario interno", "Usuario interno") }), _jsx("span", { children: user?.email || tx("Sem email", "Sem email") })] }), _jsx("button", { type: "button", className: "cw-logout-btn", onClick: logout, "aria-label": tx("Encerrar sessao", "Encerrar sessao"), title: tx("Sair", "Sair"), children: _jsx(LogOut, { size: 14 }) })] }) })] }), _jsx("main", { className: "main-content", children: _jsx("div", { className: "main-scroll-content", children: _jsx(Outlet, {}) }) })] }));
}
