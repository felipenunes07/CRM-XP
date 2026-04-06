import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId } from "react";
export function InfoHint({ text }) {
    const tooltipId = useId();
    return (_jsxs("span", { className: "info-tooltip", children: [_jsx("button", { className: "info-hint", type: "button", "aria-label": text, "aria-describedby": tooltipId, children: "i" }), _jsx("span", { id: tooltipId, role: "tooltip", className: "info-tooltip-bubble", children: text })] }));
}
