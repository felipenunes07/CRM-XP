import type {
  GeographicCityStat,
  GeographicCustomerStat,
  GeographicSalesResponse,
  GeographicStateStat,
} from "@olist-crm/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useUiLanguage } from "../i18n";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
import { BRAZIL_STATE_LABEL_BY_UF, BRAZIL_STATE_SHAPES, BRAZIL_VIEW_BOX } from "./brazilMapData";

const EMPTY_GEOGRAPHIC_RESPONSE: GeographicSalesResponse = {
  summary: {
    totalStates: 0,
    totalCities: 0,
    totalCustomers: 0,
    totalOrders: 0,
    totalPieces: 0,
    totalRevenue: 0,
  },
  stateStats: [],
  cityStats: [],
  customerStats: [],
};

function createEmptyStateStat(state: string): GeographicStateStat {
  return {
    state,
    customerCount: 0,
    orderCount: 0,
    cityCount: 0,
    totalPieces: 0,
    totalRevenue: 0,
  };
}

function cityKey(city: GeographicCityStat) {
  return `${city.state}::${city.city}`;
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function bubbleRadius(totalPieces: number, maxPieces: number) {
  if (totalPieces <= 0 || maxPieces <= 0) {
    return 0;
  }

  return 7 + Math.sqrt(totalPieces / maxPieces) * 24;
}

function matchesCustomerSearch(item: GeographicCustomerStat, normalizedSearch: string) {
  if (!normalizedSearch) {
    return true;
  }

  return normalizeText(`${item.displayName} ${item.customerCode} ${item.city} ${item.state}`).includes(normalizedSearch);
}

function matchesCitySearch(item: GeographicCityStat, normalizedSearch: string) {
  if (!normalizedSearch) {
    return true;
  }

  return normalizeText(`${item.city} ${item.state}`).includes(normalizedSearch);
}

export function GeographicView() {
  const { token } = useAuth();
  const { tx } = useUiLanguage();
  const [selectedState, setSelectedState] = useState("");
  const [selectedCityKey, setSelectedCityKey] = useState("");
  const [search, setSearch] = useState("");
  const [hoveredState, setHoveredState] = useState("");

  const geographicQuery = useQuery({
    queryKey: ["geographic-sales-overview"],
    queryFn: () => api.getGeographicSalesStats(token!),
    enabled: Boolean(token),
  });

  const geographicData = geographicQuery.data ?? EMPTY_GEOGRAPHIC_RESPONSE;
  const normalizedSearch = normalizeText(search.trim());

  const stateStatsByUf = useMemo(
    () => new Map(geographicData.stateStats.map((item) => [item.state, item])),
    [geographicData.stateStats],
  );

  const allStates = useMemo(
    () =>
      BRAZIL_STATE_SHAPES.map((shape) => ({
        ...shape,
        label: BRAZIL_STATE_LABEL_BY_UF[shape.uf] ?? shape.name,
        stat: stateStatsByUf.get(shape.uf) ?? createEmptyStateStat(shape.uf),
      })),
    [stateStatsByUf],
  );

  const selectedCity = useMemo(
    () => geographicData.cityStats.find((item) => cityKey(item) === selectedCityKey) ?? null,
    [geographicData.cityStats, selectedCityKey],
  );

  const filteredCities = useMemo(
    () =>
      geographicData.cityStats.filter((item) => {
        if (selectedState && item.state !== selectedState) {
          return false;
        }

        return matchesCitySearch(item, normalizedSearch);
      }),
    [geographicData.cityStats, normalizedSearch, selectedState],
  );

  const filteredCustomers = useMemo(
    () =>
      geographicData.customerStats.filter((item) => {
        if (selectedState && item.state !== selectedState) {
          return false;
        }

        if (selectedCity && (item.state !== selectedCity.state || item.city !== selectedCity.city)) {
          return false;
        }

        return matchesCustomerSearch(item, normalizedSearch);
      }),
    [geographicData.customerStats, normalizedSearch, selectedCity, selectedState],
  );

  const tableRows = useMemo(() => filteredCustomers.slice(0, 28), [filteredCustomers]);
  const cityFilterRows = useMemo(() => filteredCities.slice(0, 36), [filteredCities]);
  const topState = geographicData.stateStats[0] ?? null;
  const activeStateCode = hoveredState || selectedState || topState?.state || "";
  const activeStateStat = activeStateCode
    ? stateStatsByUf.get(activeStateCode) ?? createEmptyStateStat(activeStateCode)
    : null;
  const activeStateName = activeStateCode ? BRAZIL_STATE_LABEL_BY_UF[activeStateCode] ?? activeStateCode : "";
  const activeStateTopCity =
    activeStateCode ? geographicData.cityStats.find((item) => item.state === activeStateCode) ?? null : null;
  const activeStateTopCustomer =
    activeStateCode ? geographicData.customerStats.find((item) => item.state === activeStateCode) ?? null : null;
  const maxStatePieces = Math.max(...geographicData.stateStats.map((item) => item.totalPieces), 1);
  const hasFilters = Boolean(selectedState || selectedCityKey || search.trim());

  function handleStateToggle(state: string) {
    setSelectedCityKey("");
    setSelectedState((current) => (current === state ? "" : state));
  }

  function handleCitySelect(city: GeographicCityStat) {
    setSelectedState(city.state);
    setSelectedCityKey(cityKey(city));
  }

  function clearFilters() {
    setSelectedState("");
    setSelectedCityKey("");
    setSearch("");
  }

  if (geographicQuery.isLoading) {
    return <div className="page-loading">{tx("Carregando mapa geografico...", "Loading geographic map...")}</div>;
  }

  if (geographicQuery.isError) {
    return <div className="page-error">{tx("Falha ao carregar os dados geograficos.", "Failed to load geographic data.")}</div>;
  }

  if (!geographicData.stateStats.length) {
    return (
      <section className="panel empty-panel">
        <div className="empty-state">
          {tx(
            "Nenhum dado geografico foi encontrado. Verifique a sincronizacao da planilha de estado e cidade.",
            "No geographic data was found. Check the state and city sheet sync.",
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="region-view">
      <section className="region-summary-strip">
        <div className="region-summary-card">
          <span>{tx("Clientes mapeados", "Mapped customers")}</span>
          <strong>{formatNumber(geographicData.summary.totalCustomers)}</strong>
        </div>
        <div className="region-summary-card">
          <span>{tx("Estados ativos", "Active states")}</span>
          <strong>{formatNumber(geographicData.summary.totalStates)}</strong>
        </div>
        <div className="region-summary-card">
          <span>{tx("Cidades ativas", "Active cities")}</span>
          <strong>{formatNumber(geographicData.summary.totalCities)}</strong>
        </div>
        <div className="region-summary-card accent">
          <span>{tx("Pecas vendidas", "Pieces sold")}</span>
          <strong>{formatNumber(geographicData.summary.totalPieces)}</strong>
        </div>
      </section>

      <div className="region-dashboard-grid">
        <section className="panel region-map-panel">
          <div className="region-panel-header">
            <div>
              <p className="eyebrow">{tx("Mapa geografico", "Geographic map")}</p>
              <h3>{tx("Distribuicao real da carteira por UF", "Real portfolio distribution by state")}</h3>
              <p className="region-panel-copy">
                {tx(
                  "Cada estado usa a malha real do Brasil e as bolhas indicam volume de pecas vendidas. Clique em uma UF para filtrar a grade de clientes.",
                  "Each state uses Brazil's real outline and bubbles indicate pieces sold. Click a state to filter the customer grid.",
                )}
              </p>
            </div>
            {hasFilters ? (
              <button type="button" className="ghost-button small" onClick={clearFilters}>
                {tx("Limpar filtro", "Clear filter")}
              </button>
            ) : null}
          </div>

          <div className="region-map-stage">
            <svg
              viewBox={BRAZIL_VIEW_BOX}
              className="region-map-svg"
              aria-label={tx("Mapa geografico da carteira", "Geographic customer map")}
              onMouseLeave={() => setHoveredState("")}
            >
              <defs>
                <linearGradient id="region-stage-sky" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#dbeafe" />
                  <stop offset="100%" stopColor="#eff6ff" />
                </linearGradient>
                <linearGradient id="region-stage-land" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#f8fafc" />
                </linearGradient>
              </defs>

              <rect x="0" y="0" width="880" height="720" fill="url(#region-stage-sky)" />

              <g className="region-map-gridlines" aria-hidden="true">
                <path d="M 80 120 H 800" />
                <path d="M 80 260 H 800" />
                <path d="M 80 400 H 800" />
                <path d="M 80 540 H 800" />
                <path d="M 160 60 V 660" />
                <path d="M 320 60 V 660" />
                <path d="M 480 60 V 660" />
                <path d="M 640 60 V 660" />
              </g>

              <text x="446" y="364" className="region-map-wordmark">
                BRASIL
              </text>

              <g className="region-state-layer">
                {allStates.map((state) => {
                  const isSelected = selectedState === state.uf;
                  const isHovered = hoveredState === state.uf;
                  const intensity = state.stat.totalPieces > 0 ? state.stat.totalPieces / maxStatePieces : 0;
                  const fill = isSelected
                    ? "rgba(59, 130, 246, 0.28)"
                    : intensity > 0
                      ? `rgba(59, 130, 246, ${0.12 + intensity * 0.26})`
                      : "url(#region-stage-land)";

                  return (
                    <path
                      key={state.uf}
                      d={state.path}
                      fill={fill}
                      className={`region-state-shape${isSelected ? " is-selected" : ""}${isHovered ? " is-hovered" : ""}`}
                      onClick={() => handleStateToggle(state.uf)}
                      onMouseEnter={() => setHoveredState(state.uf)}
                      onFocus={() => setHoveredState(state.uf)}
                      onBlur={() => setHoveredState("")}
                      role="button"
                      tabIndex={0}
                      aria-label={`${state.label}: ${formatNumber(state.stat.totalPieces)} ${tx("pecas", "pieces")}`}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleStateToggle(state.uf);
                        }
                      }}
                    >
                      <title>{`${state.label} (${state.uf})`}</title>
                    </path>
                  );
                })}
              </g>

              <g className="region-bubble-layer">
                {allStates.map((state) => {
                  if (state.stat.totalPieces <= 0) {
                    return null;
                  }

                  const isSelected = selectedState === state.uf;
                  const isHovered = hoveredState === state.uf;
                  const radius = bubbleRadius(state.stat.totalPieces, maxStatePieces);
                  const intensity = state.stat.totalPieces / maxStatePieces;
                  const labelY = state.centerY - radius - 16;

                  return (
                    <g
                      key={`${state.uf}-bubble`}
                      className={`region-bubble-group${isSelected ? " is-selected" : ""}${isHovered ? " is-hovered" : ""}`}
                      onClick={() => handleStateToggle(state.uf)}
                      onMouseEnter={() => setHoveredState(state.uf)}
                    >
                      <circle
                        className="region-bubble-halo"
                        cx={state.centerX}
                        cy={state.centerY}
                        r={radius + (isSelected ? 7 : 5)}
                        fill={`rgba(59, 130, 246, ${isSelected ? 0.24 : 0.12 + intensity * 0.1})`}
                      />
                      <circle
                        className="region-bubble-core"
                        cx={state.centerX}
                        cy={state.centerY}
                        r={radius}
                        fill={`rgba(37, 99, 235, ${0.44 + intensity * 0.36})`}
                      />
                      <circle className="region-bubble-stroke" cx={state.centerX} cy={state.centerY} r={radius} />
                      {isSelected || isHovered ? (
                        <g className="region-bubble-tag">
                          <rect x={state.centerX - 28} y={labelY - 18} width="56" height="24" rx="12" />
                          <text x={state.centerX} y={labelY - 2}>
                            {state.uf}
                          </text>
                        </g>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            </svg>

            <div className="region-map-legend">
              <span>{tx("Volume", "Volume")}</span>
              <div className="region-map-legend-bubbles" aria-hidden="true">
                <i style={{ width: 10, height: 10 }} />
                <i style={{ width: 20, height: 20 }} />
                <i style={{ width: 30, height: 30 }} />
              </div>
              <small>{tx("baixo -> alto", "low -> high")}</small>
            </div>

            <div className="region-map-focus">
              <span className="region-map-focus-kicker">
                {selectedState
                  ? tx("Estado filtrado", "Filtered state")
                  : hoveredState
                    ? tx("Destaque no mapa", "Map highlight")
                    : tx("Maior concentracao", "Highest concentration")}
              </span>
              <strong>{activeStateName || tx("Sem estado selecionado", "No state selected")}</strong>
              {activeStateStat ? (
                <>
                  <p>
                    {formatNumber(activeStateStat.customerCount)} {tx("clientes", "customers")} -{" "}
                    {formatNumber(activeStateStat.totalPieces)} {tx("pecas", "pieces")}
                  </p>
                  <span>{formatCurrency(activeStateStat.totalRevenue)}</span>
                  {activeStateTopCity ? (
                    <small>
                      {tx("Cidade lider", "Top city")}: {activeStateTopCity.city}
                    </small>
                  ) : null}
                  {activeStateTopCustomer ? (
                    <small>
                      {tx("Cliente lider", "Top customer")}: {activeStateTopCustomer.displayName}
                    </small>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div className="region-state-pill-row">
            {geographicData.stateStats.slice(0, 6).map((state) => (
              <button
                key={state.state}
                type="button"
                className={`region-state-pill${selectedState === state.state ? " active" : ""}`}
                onClick={() => handleStateToggle(state.state)}
              >
                <strong>{state.state}</strong>
                <span>
                  {BRAZIL_STATE_LABEL_BY_UF[state.state] ?? state.state} - {formatNumber(state.totalPieces)}{" "}
                  {tx("pecas", "pieces")}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel region-side-panel">
          <div className="region-panel-header side">
            <div>
              <p className="eyebrow">{tx("Detalhamento", "Detail")}</p>
              <h3>
                {selectedCity
                  ? tx("Clientes da cidade selecionada", "Customers in selected city")
                  : selectedState
                    ? `${tx("Clientes em", "Customers in")} ${selectedState}`
                    : tx("Clientes da carteira por regiao", "Portfolio customers by region")}
              </h3>
            </div>
            <div className="region-side-totals">
              <span>{formatNumber(filteredCustomers.length)} {tx("clientes", "customers")}</span>
            </div>
          </div>

          <label className="region-search">
            <span>{tx("Buscar cliente ou localidade", "Search customer or location")}</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tx("Digite cliente, cidade ou UF", "Type customer, city or state")}
            />
          </label>

          <div className="region-selection-bar">
            <strong>
              {selectedCity
                ? `${selectedCity.city} / ${selectedCity.state}`
                : selectedState
                  ? `${selectedState} - ${BRAZIL_STATE_LABEL_BY_UF[selectedState] ?? selectedState}`
                  : tx("Brasil inteiro", "Whole Brazil")}
            </strong>
            <span>
              {selectedCity
                ? `${formatNumber(selectedCity.customerCount)} ${tx("clientes", "customers")} - ${formatNumber(selectedCity.totalPieces)} ${tx("pecas", "pieces")}`
                : `${formatNumber(filteredCustomers.length)} ${tx("clientes exibidos", "customers shown")}`}
            </span>
          </div>

          <div className="region-table-shell">
            <table className="region-ranking-table">
              <thead>
                <tr>
                  <th>UF</th>
                  <th>{tx("Cidade", "City")}</th>
                  <th>{tx("Cliente", "Customer")}</th>
                  <th>{tx("Pecas", "Pieces")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length ? (
                  tableRows.map((row) => (
                    <tr key={`${row.customerId}-${row.state}-${row.city}`}>
                      <td>{row.state}</td>
                      <td>
                        <div className="region-table-meta">
                          <strong>{row.city}</strong>
                          <span>{formatCurrency(row.totalRevenue)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="region-table-meta">
                          <strong>{row.displayName}</strong>
                          <span>{row.customerCode || tx("Sem codigo", "No code")}</span>
                        </div>
                      </td>
                      <td>
                        <div className="region-table-number">
                          <strong>{formatNumber(row.totalPieces)}</strong>
                          <span>{formatNumber(row.orderCount)} {tx("pedidos", "orders")}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="region-table-empty">
                      {tx("Nenhum cliente bateu com esse filtro.", "No customer matched this filter.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="region-filter-grid">
            <div className="region-filter-box">
              <div className="region-filter-header">
                <h4>{tx("Estado", "State")}</h4>
                <span>{formatNumber(allStates.length)}</span>
              </div>
              <div className="region-filter-list">
                <button type="button" className={`region-filter-option${selectedState === "" ? " active" : ""}`} onClick={clearFilters}>
                  <i />
                  <strong>{tx("Todos", "All")}</strong>
                  <span>{formatNumber(geographicData.summary.totalCustomers)}</span>
                </button>
                {allStates.map((state) => (
                  <button
                    key={state.uf}
                    type="button"
                    className={`region-filter-option${selectedState === state.uf ? " active" : ""}${state.stat.totalPieces <= 0 ? " muted" : ""}`}
                    onClick={() => handleStateToggle(state.uf)}
                  >
                    <i />
                    <strong>{`${state.uf} - ${state.label}`}</strong>
                    <span>{formatNumber(state.stat.customerCount)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="region-filter-box">
              <div className="region-filter-header">
                <h4>{tx("Cidade", "City")}</h4>
                <span>{formatNumber(cityFilterRows.length)}</span>
              </div>
              <div className="region-filter-list">
                <button
                  type="button"
                  className={`region-filter-option${selectedCityKey === "" ? " active" : ""}`}
                  onClick={() => setSelectedCityKey("")}
                >
                  <i />
                  <strong>{tx("Todas", "All")}</strong>
                  <span>{formatNumber(filteredCustomers.length)}</span>
                </button>
                {cityFilterRows.map((city) => (
                  <button
                    key={cityKey(city)}
                    type="button"
                    className={`region-filter-option city${selectedCityKey === cityKey(city) ? " active" : ""}`}
                    onClick={() => handleCitySelect(city)}
                  >
                    <i />
                    <strong>{city.city}</strong>
                    <span>{`${city.state} - ${formatNumber(city.customerCount)}`}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
