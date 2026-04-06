import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function StatCard({ title, value, badge, helper, tone = "neutral", }) {
    return (_jsxs("article", { className: `stat-card tone-${tone}`, children: [_jsx("p", { className: "eyebrow", children: title }), _jsx("strong", { children: value }), badge ? _jsx("small", { className: "stat-card-badge", children: badge }) : null, helper ? _jsx("span", { children: helper }) : null] }));
}
