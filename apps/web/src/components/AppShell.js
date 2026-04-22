import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, Boxes, ChevronDown, ClipboardList, LayoutDashboard, Lightbulb, LogOut, MessageSquareText, RadioTower, SearchCheck, Star, Tags, TrendingUp, Trophy, UserPlus, Users, } from "lucide-react";
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
    const location = useLocation();
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef(null);
    const userInitials = user?.name
        ?.split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
    const currentSectionLabel = useMemo(() => {
        const matchedLink = [...appShellLinks]
            .sort((a, b) => b.to.length - a.to.length)
            .find(({ to }) => (to === "/" ? location.pathname === "/" : location.pathname.startsWith(to)));
        if (matchedLink) {
            return tx(matchedLink.labelPt, matchedLink.labelPt);
        }
        if (location.pathname.startsWith("/clientes/")) {
            return tx("Ficha do cliente", "客户详情");
        }
        return tx("Painel interno", "内部面板");
    }, [language, location.pathname, tx]);
    useEffect(() => {
        setIsProfileMenuOpen(false);
    }, [location.pathname]);
    useEffect(() => {
        function handlePointerDown(event) {
            if (!profileMenuRef.current?.contains(event.target)) {
                setIsProfileMenuOpen(false);
            }
        }
        function handleEscape(event) {
            if (event.key === "Escape") {
                setIsProfileMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);
    return (_jsxs("div", { className: "app-shell", children: [_jsx("aside", { className: "sidebar", children: _jsxs("div", { className: "sidebar-top", children: [_jsx("div", { className: "brand premium-brand", children: _jsxs("div", { className: "brand-copy premium-brand-copy", children: [_jsx("p", { className: "eyebrow", children: "XP Factory" }), _jsx("h1", { children: "XP CRM" })] }) }), _jsxs("div", { className: "sidebar-language-card", children: [_jsx("span", { className: "sidebar-language-label", children: tx("Idioma", "语言") }), _jsxs("div", { className: "language-switch", role: "radiogroup", "aria-label": tx("Selecionar idioma da interface", "é€‰æ‹©ç•Œé¢语言"), children: [_jsx("button", { type: "button", className: `language-switch-button ${language === "pt-BR" ? "active" : ""}`, onClick: () => setLanguage("pt-BR"), "aria-pressed": language === "pt-BR", "aria-label": tx("Exibir em portugues do Brasil", "åˆ‡æ¢ä¸ºå·´è¥¿è‘¡è„ç‰™è¯­"), children: "PT" }), _jsx("button", { type: "button", className: `language-switch-button ${language === "zh-CN" ? "active" : ""}`, onClick: () => setLanguage("zh-CN"), "aria-pressed": language === "zh-CN", "aria-label": tx("Exibir em chines mandarim", "åˆ‡æ¢ä¸ºä¸­æ–‡"), children: "\u4E2D\u6587" })] })] }), _jsx("nav", { className: "nav", children: appShellLinks.map(({ to, icon: Icon, labelPt, labelZh }) => (_jsxs(NavLink, { to: to, end: to === "/", className: ({ isActive }) => `nav-link ${isActive ? "active" : ""}`, children: [_jsx(Icon, { size: 18 }), _jsx("span", { children: language === "zh-CN" ? labelZh : labelPt })] }, to))) })] }) }), _jsxs("main", { className: "main-content", children: [_jsx("header", { className: "app-topbar", children: _jsxs("div", { className: "app-topbar-copy", children: [_jsx("p", { className: "eyebrow", children: tx("Sessao protegida", "å—ä¿æŠ¤ä¼šè¯") }), _jsxs("div", { className: "app-topbar-heading", children: [_jsxs("div", { children: [_jsx("h2", { children: currentSectionLabel }), _jsx("p", { children: tx("Acesso interno por usuario e permissao da equipe.", "æŒ‰ç”¨æˆ·ä¸Žæƒé™è¿›è¡Œå†…éƒ¨è®¿é—®æŽ§åˆ¶ã€‚") })] }), _jsxs("div", { className: "topbar-profile", ref: profileMenuRef, children: [_jsxs("button", { type: "button", className: `topbar-profile-trigger ${isProfileMenuOpen ? "is-open" : ""}`, onClick: () => setIsProfileMenuOpen((current) => !current), "aria-haspopup": "menu", "aria-expanded": isProfileMenuOpen, children: [_jsx("div", { className: "topbar-profile-avatar", children: userInitials || "XP" }), _jsxs("div", { className: "topbar-profile-copy", children: [_jsx("strong", { children: user?.name || tx("Usuario interno", "内部用户") }), _jsx("span", { children: user?.email || tx("Sem email", "无邮箱") })] }), _jsx(ChevronDown, { size: 18 })] }), isProfileMenuOpen ? (_jsxs("div", { className: "topbar-profile-menu", role: "menu", children: [_jsxs("div", { className: "topbar-profile-menu-hero", children: [_jsx("div", { className: "topbar-profile-menu-avatar", children: userInitials || "XP" }), _jsxs("div", { className: "topbar-profile-menu-copy", children: [_jsx("p", { className: "eyebrow", children: tx("Perfil ativo", "å½“å‰è´¦å·") }), _jsx("strong", { children: user?.name || tx("Usuario interno", "内部用户") }), _jsx("span", { children: user?.email || tx("Sem email", "无邮箱") })] })] }), _jsx("div", { className: "topbar-profile-role-pill", children: user?.role || tx("Sem perfil", "æœªè®¾ç½®è§’è‰²") }), _jsx("p", { className: "topbar-profile-hint", children: tx("Avatar simples por enquanto, com espaco preparado para foto real no futuro.", "å½“å‰ä¸ºç®€åŒ–å¤´åƒï¼Œå·²ä¸ºæœªæ¥çœŸå®žç…§ç‰‡é¢„ç•™ä½ç½®ã€‚") }), _jsxs("button", { type: "button", className: "topbar-profile-logout", role: "menuitem", onClick: logout, children: [_jsx(LogOut, { size: 16 }), _jsx("span", { children: tx("Sair", "退出") })] })] })) : null] })] })] }) }), _jsx("div", { className: "main-scroll-content", children: _jsx(Outlet, {}) })] })] }));
}
