interface PeriodSelectorProps {
  value: '90d' | '6m' | '1y' | 'max';
  onChange: (period: '90d' | '6m' | '1y' | 'max') => void;
  disabled?: boolean;
}

const periodOptions = [
  { value: '90d' as const, label: '90 dias' },
  { value: '6m' as const, label: '6 meses' },
  { value: '1y' as const, label: '1 ano' },
  { value: 'max' as const, label: 'Período Máximo' },
];

export function PeriodSelector({ value, onChange, disabled }: PeriodSelectorProps) {
  return (
    <div className="period-selector" role="radiogroup" aria-label="Selecionar período do gráfico">
      {periodOptions.map((option) => (
        <label key={option.value} className={`period-option ${value === option.value ? 'active' : ''}`}>
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
