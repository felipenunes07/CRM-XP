import { ChevronDown, Search, X } from "lucide-react";

interface EventsFiltersProps {
  filters: {
    eventType?: string;
    severity?: string;
    resolved?: string;
    search?: string;
    isGroup?: boolean;
    page?: number;
    pageSize?: number;
  };
  onChange: (filters: EventsFiltersProps["filters"]) => void;
}

export function EventsFilters({ filters, onChange }: EventsFiltersProps) {
  const updateFilters = (patch: Partial<EventsFiltersProps["filters"]>) => {
    onChange({ ...filters, ...patch, page: 1 });
  };

  const clearFilters = () => {
    onChange({ page: 1, pageSize: filters.pageSize ?? 20 });
  };

  const hasActiveFilters = Boolean(
    filters.eventType ||
    filters.severity ||
    filters.resolved ||
    filters.search ||
    filters.isGroup !== undefined,
  );

  return (
    <div className="wa-events-filters" aria-label="Filtros de eventos">
      <label className="wa-filter-search">
        <Search size={18} />
        <input
          type="search"
          placeholder="Buscar cliente, grupo ou texto"
          value={filters.search || ""}
          onChange={(event) => updateFilters({ search: event.target.value || undefined })}
        />
      </label>

      <div className="wa-filter-group">
        <label className="wa-filter-select">
          <select
            value={filters.eventType || ""}
            onChange={(event) => updateFilters({ eventType: event.target.value || undefined })}
            aria-label="Tipo de evento"
          >
            <option value="">Todos os sinais</option>
            <option value="COMPLAINT">Reclamacoes</option>
            <option value="NEGATIVE_FEEDBACK">Feedback negativo</option>
            <option value="CHURN_RISK">Risco de churn</option>
            <option value="SALES_OPPORTUNITY">Oportunidades</option>
            <option value="QUESTION">Duvidas</option>
            <option value="PRAISE">Elogios</option>
            <option value="POSITIVE_FEEDBACK">Feedback positivo</option>
            <option value="RISK">Risco / alerta</option>
            <option value="ESCALATION">Escalacao</option>
          </select>
          <ChevronDown size={16} />
        </label>

        <label className="wa-filter-select">
          <select
            value={filters.severity || ""}
            onChange={(event) => updateFilters({ severity: event.target.value || undefined })}
            aria-label="Gravidade"
          >
            <option value="">Todas gravidades</option>
            <option value="CRITICAL">Critico</option>
            <option value="HIGH">Alto</option>
            <option value="MODERATE">Moderado</option>
            <option value="LOW">Baixo</option>
          </select>
          <ChevronDown size={16} />
        </label>

        <label className="wa-filter-select">
          <select
            value={filters.isGroup !== undefined ? String(filters.isGroup) : ""}
            onChange={(event) => updateFilters({
              isGroup: event.target.value === "" ? undefined : event.target.value === "true",
            })}
            aria-label="Origem"
          >
            <option value="">Grupos e privados</option>
            <option value="true">Somente grupos</option>
            <option value="false">Somente privados</option>
          </select>
          <ChevronDown size={16} />
        </label>

        <label className="wa-filter-select">
          <select
            value={filters.resolved || ""}
            onChange={(event) => updateFilters({ resolved: event.target.value || undefined })}
            aria-label="Status"
          >
            <option value="">Todos status</option>
            <option value="false">Pendentes</option>
            <option value="true">Resolvidos</option>
          </select>
          <ChevronDown size={16} />
        </label>

        {hasActiveFilters && (
          <button type="button" className="wa-clear-filters" onClick={clearFilters}>
            <X size={16} />
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}
