import { useUiLanguage } from "../i18n";

interface PeriodSelectorProps {
  value: "90d" | "6m" | "1y" | "max";
  onChange: (period: "90d" | "6m" | "1y" | "max") => void;
  disabled?: boolean;
}

export function PeriodSelector({ value, onChange, disabled }: PeriodSelectorProps) {
  const { tx } = useUiLanguage();
  const periodOptions = [
    { value: "90d" as const, label: tx("90 dias", "90天") },
    { value: "6m" as const, label: tx("6 meses", "6个月") },
    { value: "1y" as const, label: tx("1 ano", "1年") },
    { value: "max" as const, label: tx("Periodo Maximo", "最长周期") },
  ];

  return (
    <div className="period-selector" role="radiogroup" aria-label={tx("Selecionar periodo do grafico", "选择图表周期")}>
      {periodOptions.map((option) => (
        <label key={option.value} className={`period-option ${value === option.value ? "active" : ""}`}>
          <input
            type="radio"
            name="period"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            disabled={disabled}
            aria-label={option.label}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
