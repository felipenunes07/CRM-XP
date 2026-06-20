import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";

export interface EventsFilterState {
  eventType?: string;
  severity?: string;
  resolved?: string;
  search?: string;
  isGroup?: boolean;
  page?: number;
  pageSize?: number;
}

export interface EventFilterShortcut {
  id: string;
  label: string;
  count: number;
  patch: Partial<EventsFilterState>;
  tone?: "danger" | "warning" | "success" | "info" | "neutral";
}

interface EventsFiltersProps {
  filters: EventsFilterState;
  shortcuts?: EventFilterShortcut[];
  onChange: (filters: EventsFilterState) => void;
}

function isSameShortcut(filters: EventsFilterState, shortcut: EventFilterShortcut) {
  const patchKeys = Object.keys(shortcut.patch) as Array<keyof EventsFilterState>;
  const scopedKeys: Array<keyof EventsFilterState> = ["eventType", "severity", "resolved", "search", "isGroup"];

  if (patchKeys.length === 0) {
    return scopedKeys.every((key) => filters[key] === undefined || filters[key] === "");
  }

  return scopedKeys.every((key) => {
    if (patchKeys.includes(key)) {
      return filters[key] === shortcut.patch[key];
    }
    return filters[key] === undefined || filters[key] === "";
  });
}

export function EventsFilters({ filters, shortcuts = [], onChange }: EventsFiltersProps) {
  const updateFilters = (patch: Partial<EventsFilterState>) => {
    onChange({ ...filters, ...patch, page: 1 });
  };

  const applyShortcut = (shortcut: EventFilterShortcut) => {
    onChange({
      page: 1,
      pageSize: filters.pageSize ?? 20,
      ...shortcut.patch,
    });
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
      {shortcuts.length > 0 && (
        <div className="wa-filter-shortcuts" aria-label="Atalhos de filtros">
          {shortcuts.map((shortcut) => {
            const isActive = isSameShortcut(filters, shortcut);
            const disabled = shortcut.count === 0 && shortcut.id !== "all";
            return (
              <button
                key={shortcut.id}
                type="button"
                className={`wa-filter-chip ${shortcut.tone ?? "neutral"} ${isActive ? "active" : ""}`}
                disabled={disabled}
                onClick={() => applyShortcut(shortcut)}
              >
                <span>{shortcut.label}</span>
                <strong>{shortcut.count}</strong>
              </button>
            );
          })}
        </div>
      )}

      <div className="wa-filter-main-row">
        <label className="wa-filter-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Buscar cliente, grupo ou texto"
            value={filters.search || ""}
            onChange={(event) => updateFilters({ search: event.target.value || undefined })}
          />
        </label>

        <details className="wa-filter-advanced" open={hasActiveFilters}>
          <summary>
            <SlidersHorizontal size={17} />
            Filtros avancados
          </summary>

          <div className="wa-filter-group">
            <label className="wa-filter-select">
              <select
                value={filters.eventType || ""}
                onChange={(event) => updateFilters({ eventType: event.target.value || undefined })}
                aria-label="Tipo de evento"
              >
                <option value="">Todos os sinais</option>
                <option value="COMPLAINT,NEGATIVE_FEEDBACK,CHURN_RISK,RISK,ESCALATION">Problemas e riscos</option>
                <option value="SALES_OPPORTUNITY,QUESTION">Vendas e duvidas</option>
                <option value="PRAISE,POSITIVE_FEEDBACK">Elogios e positivos</option>
                <option value="COMPLAINT">Reclamacoes</option>
                <option value="NEGATIVE_FEEDBACK">Feedback negativo</option>
                <option value="CHURN_RISK">Risco de churn</option>
                <option value="QUESTION">Duvidas</option>
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
                <option value="CRITICAL,HIGH">Criticos e altos</option>
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
          </div>
        </details>

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
