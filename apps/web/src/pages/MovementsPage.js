import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { CustomerMovementsPanel } from "../components/CustomerMovementsPanel";
import { useUiLanguage } from "../i18n";
export function MovementsPage() {
    const { tx } = useUiLanguage();
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("section", { className: "dashboard-hero-premium", style: { minHeight: "auto", padding: "2rem 2.5rem", borderRadius: "12px", overflow: "hidden" }, children: [_jsx("div", { className: "hero-premium-bg", children: _jsx("div", { className: "hero-premium-gradient" }) }), _jsx("div", { className: "hero-premium-content", children: _jsxs("div", { className: "hero-premium-copy", children: [_jsx("div", { className: "premium-badge", children: tx("Inteligência de Base", "Base Intelligence") }), _jsx("h2", { className: "premium-title", children: tx("Movimentação da Base", "Customer Movements") }), _jsx("p", { className: "premium-subtitle", children: tx("Acompanhe as mudanças de status da sua carteira para identificar riscos e recuperações em tempo real.", "Track status changes in your portfolio to identify risks and recoveries in real-time.") })] }) })] }), _jsx("div", { style: { marginTop: "-0.5rem" }, children: _jsx(CustomerMovementsPanel, { initialDays: 7 }) })] }));
}
