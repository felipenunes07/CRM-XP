import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, ClipboardList, LayoutDashboard, MessageSquareText, Star, Tags, Trophy, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
const links = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/clientes", icon: Users, label: "Clientes" },
    { to: "/embaixadores", icon: Star, label: "Embaixadores" },
    { to: "/segmentos", icon: BarChart3, label: "Segmentos" },
    { to: "/agenda", icon: ClipboardList, label: "Agenda" },
    { to: "/reativacao", icon: Trophy, label: "Reativacao" },
    { to: "/mensagens", icon: MessageSquareText, label: "Mensagens" },
    { to: "/rotulos", icon: Tags, label: "Rotulos" },
];
export function AppShell() {
    const { user } = useAuth();
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "sidebar-top", children: [_jsxs("div", { className: "brand", children: [_jsx("div", { className: "brand-mark", children: _jsx("img", { className: "brand-logo", src: "/xp-factory-logo.png", alt: "XP Factory" }) }), _jsxs("div", { className: "brand-copy", children: [_jsx("p", { className: "eyebrow", children: "XP Factory" }), _jsx("h1", { children: "XP CRM" })] })] }), _jsx("nav", { className: "nav", children: links.map(({ to, icon: Icon, label }) => (_jsxs(NavLink, { to: to, end: to === "/", className: ({ isActive }) => `nav-link ${isActive ? "active" : ""}`, children: [_jsx(Icon, { size: 18 }), _jsx("span", { children: label })] }, to))) })] }), _jsx("div", { className: "sidebar-footer", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Sessao interna" }), _jsx("strong", { children: user?.name }), _jsx("p", { children: user?.role })] }) })] }), _jsx("main", { className: "main-content", children: _jsx(Outlet, {}) })] }));
}
