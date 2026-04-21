import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, Boxes, ClipboardList, LayoutDashboard, Lightbulb, MessageSquareText, RadioTower, SearchCheck, Star, Tags, TrendingUp, Trophy, UserPlus, Users, } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
export const appShellLinks = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/metas", icon: Trophy, label: "Metas" },
    { to: "/atendentes", icon: TrendingUp, label: "Atendentes" },
    { to: "/clientes", icon: Users, label: "Clientes" },
    { to: "/estoque", icon: Boxes, label: "Estoque" },
    { to: "/embaixadores", icon: Star, label: "Embaixadores" },
    { to: "/segmentos", icon: BarChart3, label: "Segmentos" },
    { to: "/agenda", icon: ClipboardList, label: "Agenda" },
    { to: "/clientes-novos", icon: UserPlus, label: "Clientes novos" },
    { to: "/reativacao", icon: Trophy, label: "Reativacao" },
    { to: "/ideias-votacao", icon: Lightbulb, label: "Ideias/Votacao" },
    { to: "/mensagens", icon: MessageSquareText, label: "Mensagens" },
    { to: "/disparador", icon: RadioTower, label: "Disparador" },
    { to: "/prospeccao", icon: SearchCheck, label: "Prospeccao" },
    { to: "/rotulos", icon: Tags, label: "Rotulos" },
];
export function AppShell() {
    const { user } = useAuth();
    const userInitials = user?.name
        ?.split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "sidebar-top", children: [_jsx("div", { className: "brand premium-brand", children: _jsxs("div", { className: "brand-copy premium-brand-copy", children: [_jsx("p", { className: "eyebrow", children: "XP Factory" }), _jsx("h1", { children: "XP CRM" })] }) }), _jsx("nav", { className: "nav", children: appShellLinks.map(({ to, icon: Icon, label }) => (_jsxs(NavLink, { to: to, end: to === "/", className: ({ isActive }) => `nav-link ${isActive ? "active" : ""}`, children: [_jsx(Icon, { size: 18 }), _jsx("span", { children: label })] }, to))) })] }), _jsx("div", { className: "sidebar-footer", children: _jsxs("div", { className: "sidebar-user-card", children: [_jsx("div", { className: "sidebar-user-avatar", children: userInitials || "XP" }), _jsxs("div", { className: "sidebar-user-copy", children: [_jsx("p", { className: "eyebrow", children: "Sessao interna" }), _jsx("strong", { children: user?.name || "Usuario interno" }), _jsx("span", { className: "sidebar-user-role", children: user?.role || "Sem perfil" })] })] }) })] }), _jsx("main", { className: "main-content", children: _jsx(Outlet, {}) })] }));
}
