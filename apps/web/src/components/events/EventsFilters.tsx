import { EventType, EventSeverity } from "@olist-crm/shared";
import { Search, Filter, Calendar, ChevronDown, X } from "lucide-react";

interface EventsFiltersProps {
  filters: {
    eventType?: string;
    severity?: string;
    resolved?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    isGroup?: boolean;
  };
  onChange: (filters: any) => void;
}

export function EventsFilters({ filters, onChange }: EventsFiltersProps) {
  const handleTypeChange = (type: string) => {
    const current = filters.eventType ? filters.eventType.split(",") : [];
    const next = current.includes(type) 
      ? current.filter(t => t !== type) 
      : [...current, type];
    onChange({ ...filters, eventType: next.join(",") || undefined });
  };

  const clearFilters = () => {
    onChange({ search: filters.search });
  };

  return (
    <div className="wa-events-filters">
      <div className="wa-filter-search">
        <Search size={18} />
        <input 
          type="text" 
          placeholder="Pesquisar em eventos ou clientes..."
          value={filters.search || ""}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>
      
      <div className="wa-filter-group">
        <label className="wa-filter-select">
          <select 
            value={filters.eventType || ""} 
            onChange={(e) => onChange({ ...filters, eventType: e.target.value || undefined })}
          >
            <option value="">Tipo: Todos</option>
            <option value="RISK">Risco / Alerta</option>
            <option value="CHURN_RISK">Risco de Churn</option>
            <option value="SALES_OPPORTUNITY">Oportunidade Comercial</option>
            <option value="COMPLAINT">Reclamação</option>
            <option value="NEGATIVE_FEEDBACK">Feedback Negativo</option>
            <option value="PRAISE">Elogio</option>
            <option value="POSITIVE_FEEDBACK">Feedback Positivo</option>
            <option value="ESCALATION">Escalação</option>
          </select>
          <ChevronDown size={16} />
        </label>

        <label className="wa-filter-select">
          <select 
            value={filters.isGroup !== undefined ? String(filters.isGroup) : ""} 
            onChange={(e) => onChange({ ...filters, isGroup: e.target.value === "" ? undefined : e.target.value === "true" })}
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
            onChange={(e) => onChange({ ...filters, resolved: e.target.value || undefined })}
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
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined })}
          />
          <span>até</span>
          <input 
            type="date" 
            value={filters.dateTo || ""} 
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined })}
          />
        </div>

        {Object.keys(filters).length > 0 && (
          <button type="button" className="wa-clear-filters" onClick={clearFilters}>
            <X size={16} />
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}
