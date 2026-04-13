import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, ClipboardList, LayoutDashboard, MessageSquareText, RadioTower, SearchCheck, Star, Tags, TrendingUp, Trophy, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
const links = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/atendentes", icon: TrendingUp, label: "Atendentes" },
    { to: "/clientes", icon: Users, label: "Clientes" },
    { to: "/embaixadores", icon: Star, label: "Embaixadores" },
    { to: "/segmentos", icon: BarChart3, label: "Segmentos" },
    { to: "/agenda", icon: ClipboardList, label: "Agenda" },
    { to: "/reativacao", icon: Trophy, label: "Reativacao" },
    { to: "/mensagens", icon: MessageSquareText, label: "Mensagens" },
    { to: "/disparador", icon: RadioTower, label: "Disparador" },
    { to: "/prospeccao", icon: SearchCheck, label: "Prospeccao" },
    { to: "/rotulos", icon: Tags, label: "Rotulos" },
];
export function AppShell() {
    const { user } = useAuth();
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "sidebar-top", children: [_jsx("div", { className: "brand premium-brand", children: _jsxs("div", { className: "brand-copy premium-brand-copy", children: [_jsx("p", { className: "eyebrow", children: "XP Factory" }), _jsx("h1", { children: "XP CRM" })] }) }), _jsx("nav", { className: "nav", children: links.map(({ to, icon: Icon, label }) => (_jsxs(NavLink, { to: to, end: to === "/", className: ({ isActive }) => `nav-link ${isActive ? "active" : ""}`, children: [_jsx(Icon, { size: 18 }), _jsx("span", { children: label })] }, to))) })] }), _jsx("div", { className: "sidebar-footer", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Sessao interna" }), _jsx("strong", { children: user?.name }), _jsx("p", { children: user?.role })] }) })] }), _jsx("main", { className: "main-content", children: _jsx(Outlet, {}) })] }));
}
