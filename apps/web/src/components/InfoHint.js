import { jsx as _jsx } from "react/jsx-runtime";
export function InfoHint({ text }) {
    return (_jsx("button", { className: "info-hint", type: "button", title: text, "aria-label": text, children: "i" }));
}
