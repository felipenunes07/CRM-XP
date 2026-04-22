import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useUiLanguage } from "../i18n";
export function PeriodSelector({ value, onChange, disabled }) {
    const { tx } = useUiLanguage();
    const periodOptions = [
        { value: "90d", label: tx("90 dias", "90天") },
        { value: "6m", label: tx("6 meses", "6个月") },
        { value: "1y", label: tx("1 ano", "1年") },
        { value: "max", label: tx("Periodo Maximo", "最长周期") },
    ];
    return (_jsx("div", { className: "period-selector", role: "radiogroup", "aria-label": tx("Selecionar periodo do grafico", "选择图表周期"), children: periodOptions.map((option) => (_jsxs("label", { className: `period-option ${value === option.value ? "active" : ""}`, children: [_jsx("input", { type: "radio", name: "period", value: option.value, checked: value === option.value, onChange: () => onChange(option.value), disabled: disabled, "aria-label": option.label }), _jsx("span", { children: option.label })] }, option.value))) }));
}
