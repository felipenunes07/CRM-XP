import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, Boxes, ClipboardList, LayoutDashboard, Lightbulb, LogOut, MessageSquareText, RadioTower, SearchCheck, Star, Tags, TrendingUp, Trophy, UserPlus, Users, } from "lucide-react";
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
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "sidebar-top", children: [_jsx("div", { className: "brand premium-brand", children: _jsxs("div", { className: "brand-copy premium-brand-copy", children: [_jsx("p", { className: "eyebrow", children: "XP Factory" }), _jsx("h1", { children: "XP CRM" })] }) }), _jsxs("div", { className: "sidebar-language-card", children: [_jsx("span", { className: "sidebar-language-label", children: tx("Idioma", "Idioma") }), _jsxs("div", { className: "language-switch", role: "radiogroup", "aria-label": tx("Selecionar idioma da interface", "Selecionar idioma da interface"), children: [_jsx("button", { type: "button", className: `language-switch-button ${language === "pt-BR" ? "active" : ""}`, onClick: () => setLanguage("pt-BR"), "aria-pressed": language === "pt-BR", "aria-label": tx("Exibir em portugues do Brasil", "Exibir em portugues do Brasil"), children: "PT" }), _jsx("button", { type: "button", className: `language-switch-button ${language === "zh-CN" ? "active" : ""}`, onClick: () => setLanguage("zh-CN"), "aria-pressed": language === "zh-CN", "aria-label": tx("Exibir em chines mandarim", "Exibir em chines mandarim"), children: "\u4E2D\u6587" })] })] }), _jsx("nav", { className: "nav", children: appShellLinks.map(({ to, icon: Icon, labelPt }) => (_jsxs(NavLink, { to: to, end: to === "/", className: ({ isActive }) => `nav-link ${isActive ? "active" : ""}`, children: [_jsx(Icon, { size: 18 }), _jsx("span", { children: tx(labelPt, labelPt) })] }, to))) })] }), _jsx("div", { className: "sidebar-footer", children: _jsxs("div", { className: "sidebar-session-card", children: [_jsx("span", { className: "sidebar-user-avatar", children: userInitials || "XP" }), _jsxs("div", { className: "sidebar-user-summary", children: [_jsx("strong", { className: "sidebar-user-name", children: user?.name || tx("Usuario interno", "Usuario interno") }), _jsx("span", { className: "sidebar-user-email", children: user?.email || tx("Sem email", "Sem email") })] }), _jsx("button", { type: "button", className: "sidebar-logout-link", onClick: logout, "aria-label": tx("Encerrar sessao", "Encerrar sessao"), title: tx("Sair", "Sair"), children: _jsx(LogOut, { size: 16 }) })] }) })] }), _jsx("main", { className: "main-content", children: _jsx("div", { className: "main-scroll-content", children: _jsx(Outlet, {}) }) })] }));
}
