import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, Boxes, ClipboardList, LayoutDashboard, Lightbulb, MessageSquareText, RadioTower, SearchCheck, Star, Tags, TrendingUp, Trophy, UserPlus, Users, } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useUiLanguage } from "../i18n";
export const appShellLinks = [
    { to: "/", icon: LayoutDashboard, labelPt: "Dashboard", labelZh: "仪表盘" },
    { to: "/metas", icon: Trophy, labelPt: "Metas", labelZh: "目标" },
    { to: "/atendentes", icon: TrendingUp, labelPt: "Atendentes", labelZh: "销售团队" },
    { to: "/clientes", icon: Users, labelPt: "Clientes", labelZh: "客户" },
    { to: "/estoque", icon: Boxes, labelPt: "Estoque", labelZh: "库存" },
    { to: "/embaixadores", icon: Star, labelPt: "Embaixadores", labelZh: "品牌大使" },
    { to: "/segmentos", icon: BarChart3, labelPt: "Segmentos", labelZh: "分群" },
    { to: "/agenda", icon: ClipboardList, labelPt: "Agenda", labelZh: "日程" },
    { to: "/clientes-novos", icon: UserPlus, labelPt: "Clientes novos", labelZh: "新客户" },
    { to: "/reativacao", icon: Trophy, labelPt: "Reativacao", labelZh: "唤醒" },
    { to: "/ideias-votacao", icon: Lightbulb, labelPt: "Ideias/Votacao", labelZh: "想法/投票" },
    { to: "/mensagens", icon: MessageSquareText, labelPt: "Mensagens", labelZh: "消息模板" },
    { to: "/disparador", icon: RadioTower, labelPt: "Disparador", labelZh: "批量发送" },
    { to: "/prospeccao", icon: SearchCheck, labelPt: "Prospeccao", labelZh: "获客开发" },
    { to: "/rotulos", icon: Tags, labelPt: "Rotulos", labelZh: "标签" },
];
export function AppShell() {
    const { user } = useAuth();
    const { language, setLanguage, tx } = useUiLanguage();
    const userInitials = user?.name
        ?.split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "sidebar-top", children: [_jsx("div", { className: "brand premium-brand", children: _jsxs("div", { className: "brand-copy premium-brand-copy", children: [_jsx("p", { className: "eyebrow", children: "XP Factory" }), _jsx("h1", { children: "XP CRM" })] }) }), _jsxs("div", { className: "sidebar-language-card", children: [_jsx("span", { className: "sidebar-language-label", children: tx("Idioma", "语言") }), _jsxs("div", { className: "language-switch", role: "radiogroup", "aria-label": tx("Selecionar idioma da interface", "选择界面语言"), children: [_jsx("button", { type: "button", className: `language-switch-button ${language === "pt-BR" ? "active" : ""}`, onClick: () => setLanguage("pt-BR"), "aria-pressed": language === "pt-BR", "aria-label": tx("Exibir em português do Brasil", "切换为巴西葡萄牙语"), children: "PT" }), _jsx("button", { type: "button", className: `language-switch-button ${language === "zh-CN" ? "active" : ""}`, onClick: () => setLanguage("zh-CN"), "aria-pressed": language === "zh-CN", "aria-label": tx("Exibir em chinês mandarim", "切换为中文"), children: "\u4E2D\u6587" })] })] }), _jsx("nav", { className: "nav", children: appShellLinks.map(({ to, icon: Icon, labelPt, labelZh }) => (_jsxs(NavLink, { to: to, end: to === "/", className: ({ isActive }) => `nav-link ${isActive ? "active" : ""}`, children: [_jsx(Icon, { size: 18 }), _jsx("span", { children: language === "zh-CN" ? labelZh : labelPt })] }, to))) })] }), _jsx("div", { className: "sidebar-footer", children: _jsxs("div", { className: "sidebar-user-card", children: [_jsx("div", { className: "sidebar-user-avatar", children: userInitials || "XP" }), _jsxs("div", { className: "sidebar-user-copy", children: [_jsx("p", { className: "eyebrow", children: tx("Sessao interna", "内部会话") }), _jsx("strong", { children: user?.name || tx("Usuario interno", "内部用户") }), _jsx("span", { className: "sidebar-user-role", children: user?.role || tx("Sem perfil", "未设置角色") })] })] }) })] }), _jsx("main", { className: "main-content", children: _jsx(Outlet, {}) })] }));
}
