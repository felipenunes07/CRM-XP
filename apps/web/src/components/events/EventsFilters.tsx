import { Search, Calendar, ChevronDown, X } from "lucide-react";

interface EventsFiltersProps {
  filters: {
    eventType?: string;
    severity?: string;
    resolved?: string;
    dateFrom?: string;
    dateTo?: string;
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
    filters.dateFrom ||
    filters.dateTo ||
    filters.search ||
    filters.isGroup !== undefined,
  );

  return (
    <div className="wa-events-filters">
      <div className="wa-filter-search">
        <Search size={18} />
        <input
          type="text"
          placeholder="Pesquisar em eventos ou clientes..."
          value={filters.search || ""}
          onChange={(event) => updateFilters({ search: event.target.value || undefined })}
        />
      </div>

      <div className="wa-filter-group">
        <label className="wa-filter-select">
          <select
            value={filters.eventType || ""}
            onChange={(event) => updateFilters({ eventType: event.target.value || undefined })}
          >
            <option value="">Tipo: Todos</option>
            <option value="RISK">Risco / Alerta</option>
            <option value="CHURN_RISK">Risco de churn</option>
            <option value="SALES_OPPORTUNITY">Oportunidade comercial</option>
            <option value="QUESTION">Duvida</option>
            <option value="COMPLAINT">Reclamacao</option>
            <option value="NEGATIVE_FEEDBACK">Feedback negativo</option>
            <option value="PRAISE">Elogio</option>
            <option value="POSITIVE_FEEDBACK">Feedback positivo</option>
            <option value="ESCALATION">Escalacao</option>
          </select>
          <ChevronDown size={16} />
        </label>

        <label className="wa-filter-select">
          <select
            value={filters.isGroup !== undefined ? String(filters.isGroup) : ""}
            onChange={(event) => updateFilters({
              isGroup: event.target.value === "" ? undefined : event.target.value === "true",
            })}
          >
            <option value="">Origem: Todas</option>
            <option value="false">Privado</option>
            <option value="true">Grupos</option>
          </select>
          <ChevronDown size={16} />
        </label>

        <label className="wa-filter-select">
          <select
            value={filters.resolved || ""}
            onChange={(event) => updateFilters({ resolved: event.target.value || undefined })}
          >
            <option value="">Status: Todos</option>
            <option value="false">Pendente</option>
            <option value="true">Resolvido</option>
          </select>
          <ChevronDown size={16} />
        </label>

        <div className="wa-filter-date">
          <Calendar size={16} />
          <input
            type="date"
            value={filters.dateFrom || ""}
            onChange={(event) => updateFilters({ dateFrom: event.target.value || undefined })}
          />
          <span>ate</span>
          <input
            type="date"
            value={filters.dateTo || ""}
            onChange={(event) => updateFilters({ dateTo: event.target.value || undefined })}
          />
        </div>

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
