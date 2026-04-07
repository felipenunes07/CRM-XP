import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const periodOptions = [
    { value: '90d', label: '90 dias', days: 90 },
    { value: '6m', label: '6 meses', days: 180 },
    { value: '1y', label: '1 ano', days: 365 },
];
export function PeriodSelector({ value, onChange, disabled }) {
    return (_jsx("div", { className: "period-selector", role: "radiogroup", "aria-label": "Selecionar per\u00EDodo do gr\u00E1fico", children: periodOptions.map((option) => (_jsxs("label", { className: `period-option ${value === option.value ? 'active' : ''}`, children: [_jsx("input", { type: "radio", name: "period", value: option.value, checked: value === option.value, onChange: () => onChange(option.value), disabled: disabled, "aria-label": option.label }), _jsx("span", { children: option.label })] }, option.value))) }));
}
