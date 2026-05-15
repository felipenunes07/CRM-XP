import { Calendar, ChevronDown, Search, X } from "lucide-react";

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
  onChange: (filters: any) => void;
}

export function EventsFilters({ filters, onChange }: EventsFiltersProps) {
  const updateFilters = (next: Partial<EventsFiltersProps["filters"]>) => {
    onChange({ ...filters, ...next, page: 1 });
  };

  const clearFilters = () => {
    onChange({
      page: 1,
      pageSize: filters.pageSize ?? 20,
      isGroup: filters.isGroup ?? false,
    });
  };

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
            <option value="">Tipo: Todos acionaveis</option>
            <option value="RISK,ESCALATION">Risco / Escalacao</option>
            <option value="CHURN_RISK">Risco de Churn</option>
            <option value="SALES_OPPORTUNITY">Oportunidade Comercial</option>
            <option value="QUESTION">Duvida</option>
            <option value="COMPLAINT,NEGATIVE_FEEDBACK">Reclamacao / Negativo</option>
            <option value="PRAISE,POSITIVE_FEEDBACK">Elogio / Positivo</option>
            <option value="GREETING,NEUTRAL">Ruido filtrado</option>
          </select>
          <ChevronDown size={16} />
        </label>

        <label className="wa-filter-select">
          <select
            value={filters.severity || ""}
            onChange={(event) => updateFilters({ severity: event.target.value || undefined })}
          >
            <option value="">Severidade: Todas</option>
            <option value="CRITICAL,HIGH">Alta</option>
            <option value="MODERATE">Moderada</option>
            <option value="LOW">Baixa</option>
          </select>
          <ChevronDown size={16} />
        </label>

        <label className="wa-filter-select">
          <select
            value={filters.isGroup !== undefined ? String(filters.isGroup) : ""}
            onChange={(event) => updateFilters({ isGroup: event.target.value === "" ? undefined : event.target.value === "true" })}
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

        <button type="button" className="wa-clear-filters" onClick={clearFilters}>
          <X size={16} />
          Limpar
        </button>
      </div>
    </div>
  );
}
