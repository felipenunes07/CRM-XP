import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Users, UserCheck, UserMinus, UserX, Activity } from "lucide-react";
export function StatCard({ title, value, badge, helper, tone = "neutral", }) {
    const Icon = tone === "success"
        ? UserCheck
        : tone === "warning"
            ? UserMinus
            : tone === "danger"
                ? UserX
                : tone === "primary"
                    ? Activity
                    : title.toLowerCase().includes("frequencia")
                        ? Activity
                        : Users;
    return (_jsxs("article", { className: `stat-card tone-${tone}`, children: [_jsxs("div", { className: "stat-card-header", children: [_jsx("p", { className: "stat-card-title", children: title }), _jsx("div", { className: `stat-card-icon tone-${tone}`, children: _jsx(Icon, { size: 20, strokeWidth: 2.5 }) })] }), _jsxs("div", { className: "stat-card-body", children: [_jsx("strong", { children: value }), _jsxs("div", { className: "stat-card-footer", children: [badge ? _jsx("span", { className: `stat-card-badge tone-${tone}`, children: badge }) : null, helper ? _jsx("span", { className: "stat-card-helper", children: helper }) : null] })] })] }));
}
