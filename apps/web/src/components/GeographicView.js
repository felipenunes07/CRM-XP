import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useUiLanguage } from "../i18n";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
import { BRAZIL_STATE_LABEL_BY_UF, BRAZIL_STATE_SHAPES, BRAZIL_VIEW_BOX } from "./brazilMapData";
const EMPTY_GEOGRAPHIC_RESPONSE = {
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
function createEmptyStateStat(state) {
    return {
        state,
        customerCount: 0,
        orderCount: 0,
        cityCount: 0,
        totalPieces: 0,
        totalRevenue: 0,
        activeCustomerCount: 0,
        attentionCustomerCount: 0,
        inactiveCustomerCount: 0,
    };
}
function cityKey(city) {
    return `${city.state}::${city.city}`;
}
function normalizeText(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function bubbleRadius(totalPieces, maxPieces) {
    if (totalPieces <= 0 || maxPieces <= 0) {
        return 0;
    }
    return 7 + Math.sqrt(totalPieces / maxPieces) * 24;
}
function matchesCustomerSearch(item, normalizedSearch) {
    if (!normalizedSearch) {
        return true;
    }
    return normalizeText(`${item.displayName} ${item.customerCode} ${item.city} ${item.state}`).includes(normalizedSearch);
}
function matchesCitySearch(item, normalizedSearch) {
    if (!normalizedSearch) {
        return true;
    }
    return normalizeText(`${item.city} ${item.state}`).includes(normalizedSearch);
}
function toPercent(value, total) {
    if (total <= 0) {
        return 0;
    }
    return (value / total) * 100;
}
function formatPercent(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return "0.0%";
    }
    return `${value.toFixed(1)}%`;
}
function formatDaysSincePurchase(value, tx) {
    if (value === null || value === undefined) {
        return tx("Sem historico", "No history");
    }
    return `${formatNumber(value)} ${tx("dias", "days")}`;
}
function formatCustomerStatus(status, tx) {
    if (status === "ACTIVE") {
        return tx("Ativo", "Active");
    }
    if (status === "ATTENTION") {
        return tx("Atencao", "Attention");
    }
    return tx("Inativo", "Inactive");
}
function customerStatusEmoji(status) {
    if (status === "ACTIVE") {
        return "🟢";
    }
    if (status === "ATTENTION") {
        return "🟡";
    }
    return "🔴";
}
function getHealthColor(activeRate, attentionRate, inactiveRate, alpha = 1) {
    if (activeRate === 0 && attentionRate === 0 && inactiveRate === 0) {
        return `rgba(203, 213, 225, ${alpha})`;
    }
    const adjustedRate = activeRate + (attentionRate * 0.5);
    let healthScore = adjustedRate / 70;
    if (healthScore > 1)
        healthScore = 1;
    let r, g, b;
    if (healthScore < 0.5) {
        const t = healthScore * 2;
        r = 239 + (245 - 239) * t;
        g = 68 + (158 - 68) * t;
        b = 68 + (11 - 68) * t;
    }
    else {
        const t = (healthScore - 0.5) * 2;
        r = 245 + (16 - 245) * t;
        g = 158 + (185 - 158) * t;
        b = 11 + (129 - 11) * t;
    }
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}
export function GeographicView() {
    const { token } = useAuth();
    const { tx } = useUiLanguage();
    const [selectedState, setSelectedState] = useState("");
    const [selectedCityKey, setSelectedCityKey] = useState("");
    const [search, setSearch] = useState("");
    const [hoveredState, setHoveredState] = useState("");
    const [mapMode, setMapMode] = useState("volume");
    const [detailView, setDetailView] = useState("cities");
    const geographicQuery = useQuery({
        queryKey: ["geographic-sales-overview"],
        queryFn: () => api.getGeographicSalesStats(token),
        enabled: Boolean(token),
    });
    const geographicData = geographicQuery.data ?? EMPTY_GEOGRAPHIC_RESPONSE;
    const normalizedSearch = normalizeText(search.trim());
    const stateStatsByUf = useMemo(() => new Map(geographicData.stateStats.map((item) => [item.state, item])), [geographicData.stateStats]);
    const allStates = useMemo(() => BRAZIL_STATE_SHAPES.map((shape) => ({
        ...shape,
        label: BRAZIL_STATE_LABEL_BY_UF[shape.uf] ?? shape.name,
        stat: stateStatsByUf.get(shape.uf) ?? createEmptyStateStat(shape.uf),
    })), [stateStatsByUf]);
    const statePerformanceByUf = useMemo(() => {
        const rows = geographicData.stateStats.map((item) => {
            const activeRate = toPercent(item.activeCustomerCount, item.customerCount);
            const attentionRate = toPercent(item.attentionCustomerCount, item.customerCount);
            const inactiveRate = toPercent(item.inactiveCustomerCount, item.customerCount);
            return {
                ...item,
                activeRate,
                attentionRate,
                inactiveRate,
            };
        });
        const activeRanking = [...rows].sort((left, right) => right.activeRate - left.activeRate ||
            left.inactiveRate - right.inactiveRate ||
            right.customerCount - left.customerCount ||
            left.state.localeCompare(right.state));
        const inactiveRanking = [...rows].sort((left, right) => right.inactiveRate - left.inactiveRate ||
            left.activeRate - right.activeRate ||
            right.customerCount - left.customerCount ||
            left.state.localeCompare(right.state));
        const activeRankByState = new Map(activeRanking.map((item, index) => [item.state, index + 1]));
        const inactiveRankByState = new Map(inactiveRanking.map((item, index) => [item.state, index + 1]));
        const bestActiveState = activeRanking[0] ?? null;
        const worstActiveState = activeRanking[activeRanking.length - 1] ?? null;
        const highestAttentionState = [...rows].sort((left, right) => right.attentionRate - left.attentionRate ||
            right.customerCount - left.customerCount ||
            left.state.localeCompare(right.state))[0] ?? null;
        const worstInactiveState = inactiveRanking[0] ?? null;
        return {
            bestActiveState,
            worstActiveState,
            highestAttentionState,
            worstInactiveState,
            byState: new Map(rows.map((item) => [
                item.state,
                {
                    ...item,
                    activeRank: activeRankByState.get(item.state) ?? rows.length,
                    inactiveRank: inactiveRankByState.get(item.state) ?? rows.length,
                },
            ])),
        };
    }, [geographicData.stateStats]);
    const selectedCity = useMemo(() => geographicData.cityStats.find((item) => cityKey(item) === selectedCityKey) ?? null, [geographicData.cityStats, selectedCityKey]);
    const filteredCities = useMemo(() => geographicData.cityStats.filter((item) => {
        if (selectedState && item.state !== selectedState) {
            return false;
        }
        return matchesCitySearch(item, normalizedSearch);
    }).map(item => ({
        ...item,
        activeRate: toPercent(item.activeCustomerCount, item.customerCount),
        attentionRate: toPercent(item.attentionCustomerCount, item.customerCount),
        inactiveRate: toPercent(item.inactiveCustomerCount, item.customerCount),
    })), [geographicData.cityStats, normalizedSearch, selectedState]);
    const filteredCustomers = useMemo(() => geographicData.customerStats.filter((item) => {
        if (selectedState && item.state !== selectedState) {
            return false;
        }
        if (selectedCity && (item.state !== selectedCity.state || item.city !== selectedCity.city)) {
            return false;
        }
        return matchesCustomerSearch(item, normalizedSearch);
    }), [geographicData.customerStats, normalizedSearch, selectedCity, selectedState]);
    const tableRows = filteredCustomers;
    const cityFilterRows = useMemo(() => filteredCities.slice(0, 36), [filteredCities]);
    const topState = geographicData.stateStats[0] ?? null;
    const activeStateCode = hoveredState || selectedState || topState?.state || "";
    const activeStateStat = activeStateCode
        ? stateStatsByUf.get(activeStateCode) ?? createEmptyStateStat(activeStateCode)
        : null;
    const activeStateName = activeStateCode ? BRAZIL_STATE_LABEL_BY_UF[activeStateCode] ?? activeStateCode : "";
    const activeStateTopCity = activeStateCode ? geographicData.cityStats.find((item) => item.state === activeStateCode) ?? null : null;
    const activeStateTopCustomer = activeStateCode ? geographicData.customerStats.find((item) => item.state === activeStateCode) ?? null : null;
    const activeStatePerformance = activeStateCode ? statePerformanceByUf.byState.get(activeStateCode) ?? null : null;
    const hoveredStateShape = hoveredState ? allStates.find((item) => item.uf === hoveredState) ?? null : null;
    const hoveredTooltipClassName = hoveredStateShape
        ? [
            hoveredStateShape.centerX < 260 ? "align-right" : "",
            hoveredStateShape.centerY < 150 ? "align-bottom" : "",
        ]
            .filter(Boolean)
            .join(" ")
        : "";
    const maxStatePieces = Math.max(...geographicData.stateStats.map((item) => item.totalPieces), 1);
    const hasFilters = Boolean(selectedState || selectedCityKey || search.trim());
    function handleStateToggle(state) {
        setSelectedCityKey("");
        setSelectedState((current) => (current === state ? "" : state));
        setDetailView("cities");
    }
    function handleCitySelect(city) {
        setSelectedState(city.state);
        setSelectedCityKey(cityKey(city));
        setDetailView("customers");
    }
    function clearFilters() {
        setSelectedState("");
        setSelectedCityKey("");
        setSearch("");
        setDetailView("cities");
    }
    if (geographicQuery.isLoading) {
        return _jsx("div", { className: "page-loading", children: tx("Carregando mapa geografico...", "Loading geographic map...") });
    }
    if (geographicQuery.isError) {
        return _jsx("div", { className: "page-error", children: tx("Falha ao carregar os dados geograficos.", "Failed to load geographic data.") });
    }
    if (!geographicData.stateStats.length) {
        return (_jsx("section", { className: "panel empty-panel", children: _jsx("div", { className: "empty-state", children: tx("Nenhum dado geografico foi encontrado. Verifique a sincronizacao da planilha de estado e cidade.", "No geographic data was found. Check the state and city sheet sync.") }) }));
    }
    return (_jsxs("div", { className: "region-view", children: [_jsxs("section", { className: "region-summary-strip", children: [_jsxs("div", { className: "region-summary-card", children: [_jsx("span", { children: tx("Clientes mapeados", "Mapped customers") }), _jsx("strong", { children: formatNumber(geographicData.summary.totalCustomers) })] }), _jsxs("div", { className: "region-summary-card", children: [_jsx("span", { children: tx("Estados ativos", "Active states") }), _jsx("strong", { children: formatNumber(geographicData.summary.totalStates) })] }), _jsxs("div", { className: "region-summary-card", children: [_jsx("span", { children: tx("Cidades ativas", "Active cities") }), _jsx("strong", { children: formatNumber(geographicData.summary.totalCities) })] }), _jsxs("div", { className: "region-summary-card accent", children: [_jsx("span", { children: tx("Pecas vendidas", "Pieces sold") }), _jsx("strong", { children: formatNumber(geographicData.summary.totalPieces) })] })] }), _jsxs("div", { className: "region-dashboard-grid", children: [_jsxs("section", { className: "panel region-map-panel", children: [_jsxs("div", { className: "region-panel-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Mapa geografico", "Geographic map") }), _jsx("h3", { children: tx("Distribuicao real da carteira por UF", "Real portfolio distribution by state") }), _jsx("p", { className: "region-panel-copy", children: tx("Cada estado usa a malha real do Brasil e as bolhas indicam volume de pecas vendidas. Clique em uma UF para filtrar a grade de clientes.", "Each state uses Brazil's real outline and bubbles indicate pieces sold. Click a state to filter the customer grid.") })] }), _jsxs("div", { style: { display: "flex", gap: "8px", alignItems: "center" }, children: [_jsxs("div", { className: "view-toggle", style: { display: "flex", background: "var(--surface-sunken)", padding: "4px", borderRadius: "8px", gap: "4px" }, children: [_jsx("button", { type: "button", className: "ghost-button small", style: mapMode === "volume" ? { background: "var(--accent)", color: "white", borderColor: "transparent" } : { background: "transparent", color: "var(--text-muted)", borderColor: "transparent" }, onClick: () => setMapMode("volume"), children: tx("Por Volume", "By Volume") }), _jsx("button", { type: "button", className: "ghost-button small", style: mapMode === "health" ? { background: "var(--accent)", color: "white", borderColor: "transparent" } : { background: "transparent", color: "var(--text-muted)", borderColor: "transparent" }, onClick: () => setMapMode("health"), children: tx("Por Saúde", "By Health") })] }), hasFilters ? (_jsx("button", { type: "button", className: "ghost-button small", onClick: clearFilters, children: tx("Limpar filtro", "Clear filter") })) : null] })] }), _jsxs("div", { className: "region-map-stage", children: [_jsxs("svg", { viewBox: BRAZIL_VIEW_BOX, className: "region-map-svg", "aria-label": tx("Mapa geografico da carteira", "Geographic customer map"), onMouseLeave: () => setHoveredState(""), children: [_jsxs("defs", { children: [_jsxs("linearGradient", { id: "region-stage-sky", x1: "0", y1: "0", x2: "1", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: "#dbeafe" }), _jsx("stop", { offset: "100%", stopColor: "#eff6ff" })] }), _jsxs("linearGradient", { id: "region-stage-land", x1: "0", y1: "0", x2: "1", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: "#ffffff" }), _jsx("stop", { offset: "100%", stopColor: "#f8fafc" })] })] }), _jsx("rect", { x: "0", y: "0", width: "880", height: "720", fill: "url(#region-stage-sky)" }), _jsxs("g", { className: "region-map-gridlines", "aria-hidden": "true", children: [_jsx("path", { d: "M 80 120 H 800" }), _jsx("path", { d: "M 80 260 H 800" }), _jsx("path", { d: "M 80 400 H 800" }), _jsx("path", { d: "M 80 540 H 800" }), _jsx("path", { d: "M 160 60 V 660" }), _jsx("path", { d: "M 320 60 V 660" }), _jsx("path", { d: "M 480 60 V 660" }), _jsx("path", { d: "M 640 60 V 660" })] }), _jsx("text", { x: "446", y: "364", className: "region-map-wordmark", children: "BRASIL" }), _jsx("g", { className: "region-state-layer", children: allStates.map((state) => {
                                                    const isSelected = selectedState === state.uf;
                                                    const isHovered = hoveredState === state.uf;
                                                    const intensity = state.stat.totalPieces > 0 ? state.stat.totalPieces / maxStatePieces : 0;
                                                    let fill = "url(#region-stage-land)";
                                                    if (mapMode === "volume") {
                                                        fill = isSelected
                                                            ? "rgba(59, 130, 246, 0.28)"
                                                            : intensity > 0
                                                                ? `rgba(59, 130, 246, ${0.12 + intensity * 0.26})`
                                                                : "url(#region-stage-land)";
                                                    }
                                                    else {
                                                        const perf = statePerformanceByUf.byState.get(state.uf);
                                                        if (perf && state.stat.customerCount > 0) {
                                                            fill = getHealthColor(perf.activeRate, perf.attentionRate, perf.inactiveRate, isSelected || isHovered ? 0.7 : 0.4);
                                                        }
                                                        else if (isSelected) {
                                                            fill = "rgba(59, 130, 246, 0.15)";
                                                        }
                                                    }
                                                    return (_jsx("path", { d: state.path, fill: fill, className: `region-state-shape${isSelected ? " is-selected" : ""}${isHovered ? " is-hovered" : ""}`, onClick: () => handleStateToggle(state.uf), onMouseEnter: () => setHoveredState(state.uf), onFocus: () => setHoveredState(state.uf), onBlur: () => setHoveredState(""), role: "button", tabIndex: 0, "aria-label": `${state.label}: ${formatNumber(state.stat.totalPieces)} ${tx("pecas", "pieces")} - ${formatPercent(toPercent(state.stat.activeCustomerCount, state.stat.customerCount))} ${tx("ativos", "active")}`, onKeyDown: (event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                handleStateToggle(state.uf);
                                                            }
                                                        }, children: _jsx("title", { children: `${state.label} (${state.uf})` }) }, state.uf));
                                                }) }), _jsx("g", { className: "region-bubble-layer", children: allStates.map((state) => {
                                                    if (state.stat.totalPieces <= 0) {
                                                        return null;
                                                    }
                                                    const isSelected = selectedState === state.uf;
                                                    const isHovered = hoveredState === state.uf;
                                                    if (selectedState && !isSelected)
                                                        return null;
                                                    if (isSelected) {
                                                        const citiesInState = geographicData.cityStats.filter(c => c.state === state.uf);
                                                        const sortedCities = [...citiesInState].sort((a, b) => b.totalPieces - a.totalPieces);
                                                        const maxCityPieces = Math.max(...sortedCities.map(c => c.totalPieces), 1);
                                                        const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle
                                                        const maxSpiralRadius = 60; // Spread cities out
                                                        const spread = sortedCities.length > 1 ? maxSpiralRadius / Math.sqrt(sortedCities.length - 1) : 0;
                                                        return (_jsx("g", { children: sortedCities.map((city, i) => {
                                                                const r = Math.sqrt(i) * spread;
                                                                const theta = i * phi;
                                                                const cx = state.centerX + r * Math.cos(theta);
                                                                const cy = state.centerY + r * Math.sin(theta);
                                                                const isCitySelected = selectedCityKey === cityKey(city);
                                                                const cityRadius = 3 + Math.sqrt(city.totalPieces / maxCityPieces) * 11;
                                                                let fill = "rgba(59, 130, 246, 0.85)";
                                                                if (mapMode === "health") {
                                                                    const activeRate = toPercent(city.activeCustomerCount, city.customerCount);
                                                                    const attentionRate = toPercent(city.attentionCustomerCount, city.customerCount);
                                                                    const adjustedRate = activeRate + (attentionRate * 0.5);
                                                                    let score = adjustedRate / 70;
                                                                    if (score > 1)
                                                                        score = 1;
                                                                    let rCol, gCol, bCol;
                                                                    if (score < 0.5) {
                                                                        const t = score * 2;
                                                                        rCol = 239 + (245 - 239) * t;
                                                                        gCol = 68 + (158 - 68) * t;
                                                                        bCol = 68 + (11 - 68) * t;
                                                                    }
                                                                    else {
                                                                        const t = (score - 0.5) * 2;
                                                                        rCol = 245 + (16 - 245) * t;
                                                                        gCol = 158 + (185 - 158) * t;
                                                                        bCol = 11 + (129 - 11) * t;
                                                                    }
                                                                    fill = `rgba(${Math.round(rCol)}, ${Math.round(gCol)}, ${Math.round(bCol)}, ${isCitySelected ? 1 : 0.85})`;
                                                                }
                                                                return (_jsx("circle", { cx: cx, cy: cy, r: cityRadius + (isCitySelected ? 4 : 0), fill: fill, stroke: isCitySelected ? "#ffffff" : "rgba(255,255,255,0.4)", strokeWidth: isCitySelected ? 2.5 : 1, style: { cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" }, onClick: (e) => {
                                                                        e.stopPropagation();
                                                                        handleCitySelect(city);
                                                                    }, children: _jsx("title", { children: `${city.city}: ${formatNumber(city.totalPieces)} peças` }) }, cityKey(city)));
                                                            }) }, `${state.uf}-city-bubbles`));
                                                    }
                                                    const radius = bubbleRadius(state.stat.totalPieces, maxStatePieces);
                                                    const intensity = state.stat.totalPieces / maxStatePieces;
                                                    const labelY = state.centerY - radius - 16;
                                                    let haloFill = "transparent";
                                                    let coreFill = "transparent";
                                                    if (mapMode === "volume") {
                                                        haloFill = `rgba(59, 130, 246, ${isSelected ? 0.24 : 0.12 + intensity * 0.1})`;
                                                        coreFill = `rgba(37, 99, 235, ${0.44 + intensity * 0.36})`;
                                                    }
                                                    else {
                                                        const perf = statePerformanceByUf.byState.get(state.uf);
                                                        if (perf) {
                                                            haloFill = getHealthColor(perf.activeRate, perf.attentionRate, perf.inactiveRate, isSelected ? 0.4 : 0.2);
                                                            coreFill = getHealthColor(perf.activeRate, perf.attentionRate, perf.inactiveRate, 0.9);
                                                        }
                                                    }
                                                    return (_jsxs("g", { className: `region-bubble-group${isSelected ? " is-selected" : ""}${isHovered ? " is-hovered" : ""}`, onClick: () => handleStateToggle(state.uf), onMouseEnter: () => setHoveredState(state.uf), children: [_jsx("circle", { className: "region-bubble-halo", cx: state.centerX, cy: state.centerY, r: radius + (isSelected ? 7 : 5), fill: haloFill }), _jsx("circle", { className: "region-bubble-core", cx: state.centerX, cy: state.centerY, r: radius, fill: coreFill }), _jsx("circle", { className: "region-bubble-stroke", cx: state.centerX, cy: state.centerY, r: radius }), isSelected || isHovered ? (_jsxs("g", { className: "region-bubble-tag", children: [_jsx("rect", { x: state.centerX - 28, y: labelY - 18, width: "56", height: "24", rx: "12" }), _jsx("text", { x: state.centerX, y: labelY - 2, children: state.uf })] })) : null] }, `${state.uf}-bubble`));
                                                }) })] }), hoveredStateShape && activeStatePerformance ? (_jsxs("div", { className: `region-map-tooltip${hoveredTooltipClassName ? ` ${hoveredTooltipClassName}` : ""}`, style: {
                                            left: `${(hoveredStateShape.centerX / 880) * 100}%`,
                                            top: `${(hoveredStateShape.centerY / 720) * 100}%`,
                                        }, children: [_jsxs("div", { className: "region-map-tooltip-header", children: [_jsx("strong", { children: `${hoveredStateShape.uf} - ${hoveredStateShape.label}` }), _jsxs("small", { children: ["#", activeStatePerformance.activeRank, " ", tx("em ativos", "in active")] })] }), _jsxs("p", { children: [formatNumber(activeStatePerformance.customerCount), " ", tx("clientes", "customers"), " -", " ", formatNumber(activeStatePerformance.totalPieces), " ", tx("pecas", "pieces")] }), _jsxs("div", { className: "region-map-tooltip-metrics", children: [_jsxs("div", { className: "active", children: [_jsx("span", { children: tx("Ativos", "Active") }), _jsx("strong", { children: formatPercent(activeStatePerformance.activeRate) }), _jsx("small", { children: formatNumber(activeStatePerformance.activeCustomerCount) })] }), _jsxs("div", { className: "attention", children: [_jsx("span", { children: tx("Atencao", "Attention") }), _jsx("strong", { children: formatPercent(activeStatePerformance.attentionRate) }), _jsx("small", { children: formatNumber(activeStatePerformance.attentionCustomerCount) })] }), _jsxs("div", { className: "inactive", children: [_jsx("span", { children: tx("Inativos", "Inactive") }), _jsx("strong", { children: formatPercent(activeStatePerformance.inactiveRate) }), _jsx("small", { children: formatNumber(activeStatePerformance.inactiveCustomerCount) })] })] })] })) : null, _jsx("div", { className: "region-map-legend", children: mapMode === "volume" ? (_jsxs(_Fragment, { children: [_jsx("span", { children: tx("Volume", "Volume") }), _jsxs("div", { className: "region-map-legend-bubbles", "aria-hidden": "true", children: [_jsx("i", { style: { width: 10, height: 10 } }), _jsx("i", { style: { width: 20, height: 20 } }), _jsx("i", { style: { width: 30, height: 30 } })] }), _jsx("small", { children: tx("baixo -> alto", "low -> high") })] })) : (_jsxs(_Fragment, { children: [_jsx("span", { children: tx("Saúde da Carteira", "Portfolio Health") }), _jsxs("div", { className: "region-map-legend-health", "aria-hidden": "true", style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [_jsx("i", { style: { width: 12, height: 12, borderRadius: '50%', background: 'var(--semantic-negative)' } }), _jsx("i", { style: { width: 12, height: 12, borderRadius: '50%', background: 'var(--semantic-attention)' } }), _jsx("i", { style: { width: 12, height: 12, borderRadius: '50%', background: 'var(--semantic-positive)' } })] }), _jsx("small", { children: tx("inativo -> ativo", "inactive -> active") })] })) }), _jsxs("div", { className: "region-map-focus", children: [_jsx("span", { className: "region-map-focus-kicker", children: selectedState
                                                    ? tx("Estado filtrado", "Filtered state")
                                                    : hoveredState
                                                        ? tx("Destaque no mapa", "Map highlight")
                                                        : tx("Maior concentracao", "Highest concentration") }), _jsx("strong", { children: activeStateName || tx("Sem estado selecionado", "No state selected") }), activeStateStat ? (_jsxs(_Fragment, { children: [_jsxs("p", { children: [formatNumber(activeStateStat.customerCount), " ", tx("clientes", "customers"), " -", " ", formatNumber(activeStateStat.totalPieces), " ", tx("pecas", "pieces")] }), activeStatePerformance ? (_jsxs("div", { className: "region-map-focus-health", children: [_jsx("span", { className: "active", children: `${formatPercent(activeStatePerformance.activeRate)} ${tx("ativos", "active")}` }), _jsx("span", { className: "attention", children: `${formatPercent(activeStatePerformance.attentionRate)} ${tx("atencao", "attention")}` }), _jsx("span", { className: "inactive", children: `${formatPercent(activeStatePerformance.inactiveRate)} ${tx("inativos", "inactive")}` })] })) : null, activeStateTopCity ? (_jsxs("small", { children: [tx("Cidade lider", "Top city"), ": ", activeStateTopCity.city] })) : null, activeStateTopCustomer ? (_jsxs("small", { children: [tx("Cliente lider", "Top customer"), ": ", activeStateTopCustomer.displayName] })) : null] })) : null] })] }), _jsx("div", { className: "region-state-pill-row", children: geographicData.stateStats.slice(0, 6).map((state) => (_jsxs("button", { type: "button", className: `region-state-pill${selectedState === state.state ? " active" : ""}`, onClick: () => handleStateToggle(state.state), children: [_jsx("strong", { children: state.state }), _jsxs("span", { children: [BRAZIL_STATE_LABEL_BY_UF[state.state] ?? state.state, " - ", formatNumber(state.totalPieces), " ", tx("pecas", "pieces")] })] }, state.state))) }), _jsxs("div", { className: "region-health-strip", children: [statePerformanceByUf.bestActiveState ? (_jsxs("div", { className: "region-health-card active", children: [_jsx("span", { children: tx("Melhor taxa ativa", "Best active rate") }), _jsx("strong", { children: `${statePerformanceByUf.bestActiveState.state} - ${formatPercent(statePerformanceByUf.bestActiveState.activeRate)}` })] })) : null, statePerformanceByUf.worstActiveState ? (_jsxs("div", { className: "region-health-card muted", children: [_jsx("span", { children: tx("Menor taxa ativa", "Lowest active rate") }), _jsx("strong", { children: `${statePerformanceByUf.worstActiveState.state} - ${formatPercent(statePerformanceByUf.worstActiveState.activeRate)}` })] })) : null, statePerformanceByUf.highestAttentionState ? (_jsxs("div", { className: "region-health-card attention", children: [_jsx("span", { children: tx("Maior taxa de atencao", "Highest attention rate") }), _jsx("strong", { children: `${statePerformanceByUf.highestAttentionState.state} - ${formatPercent(statePerformanceByUf.highestAttentionState.attentionRate)}` })] })) : null, statePerformanceByUf.worstInactiveState ? (_jsxs("div", { className: "region-health-card inactive", children: [_jsx("span", { children: tx("Maior taxa inativa", "Highest inactive rate") }), _jsx("strong", { children: `${statePerformanceByUf.worstInactiveState.state} - ${formatPercent(statePerformanceByUf.worstInactiveState.inactiveRate)}` })] })) : null] })] }), _jsxs("section", { className: "panel region-side-panel", children: [_jsxs("div", { className: "region-panel-header side", style: { flexDirection: "column", alignItems: "stretch", gap: "16px" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: tx("Detalhamento", "Detail") }), _jsx("h3", { children: selectedCity
                                                            ? tx("Detalhamento da cidade", "City detail")
                                                            : selectedState
                                                                ? `${tx("Detalhamento de", "Detail of")} ${selectedState}`
                                                                : tx("Detalhamento por regiao", "Regional detail") })] }), _jsxs("div", { className: "view-toggle", style: { display: "flex", background: "var(--surface-sunken)", padding: "4px", borderRadius: "8px", gap: "4px" }, children: [_jsx("button", { type: "button", className: "ghost-button small", style: detailView === "cities" ? { background: "var(--accent)", color: "white", borderColor: "transparent" } : { background: "transparent", color: "var(--text-muted)", borderColor: "transparent" }, onClick: () => setDetailView("cities"), children: tx("Cidades", "Cities") }), _jsx("button", { type: "button", className: "ghost-button small", style: detailView === "customers" ? { background: "var(--accent)", color: "white", borderColor: "transparent" } : { background: "transparent", color: "var(--text-muted)", borderColor: "transparent" }, onClick: () => setDetailView("customers"), children: tx("Clientes", "Customers") })] })] }), _jsx("div", { className: "region-side-totals", style: { marginTop: 0 }, children: detailView === "cities" ? (_jsxs("span", { children: [formatNumber(filteredCities.length), " ", tx("cidades", "cities")] })) : (_jsxs("span", { children: [formatNumber(filteredCustomers.length), " ", tx("clientes", "customers")] })) })] }), _jsxs("label", { className: "region-search", children: [_jsx("span", { children: tx("Buscar cliente ou localidade", "Search customer or location") }), _jsx("input", { value: search, onChange: (event) => setSearch(event.target.value), placeholder: tx("Digite cliente, cidade ou UF", "Type customer, city or state") })] }), _jsxs("div", { className: "region-selection-bar", children: [_jsx("strong", { children: selectedCity
                                            ? `${selectedCity.city} / ${selectedCity.state}`
                                            : selectedState
                                                ? `${selectedState} - ${BRAZIL_STATE_LABEL_BY_UF[selectedState] ?? selectedState}`
                                                : tx("Brasil inteiro", "Whole Brazil") }), _jsx("span", { children: selectedCity
                                            ? `${formatNumber(selectedCity.customerCount)} ${tx("clientes", "customers")} - ${formatNumber(selectedCity.totalPieces)} ${tx("pecas", "pieces")}`
                                            : `${formatNumber(filteredCustomers.length)} ${tx("clientes exibidos", "customers shown")}` })] }), _jsx("div", { className: "region-table-shell", children: _jsxs("table", { className: "region-ranking-table", children: [detailView === "cities" ? (_jsxs(_Fragment, { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: tx("Cidade", "City") }), _jsx("th", { children: tx("Clientes", "Customers") }), _jsx("th", { children: tx("Receita", "Revenue") }), _jsx("th", { children: tx("Pecas", "Pieces") })] }) }), _jsx("tbody", { children: filteredCities.length ? (filteredCities.map((row) => (_jsxs("tr", { style: { cursor: "pointer" }, onClick: () => handleCitySelect(row), children: [_jsx("td", { children: _jsxs("div", { className: "region-table-meta", children: [_jsx("strong", { children: row.city }), _jsx("span", { children: row.state })] }) }), _jsx("td", { children: _jsxs("div", { className: "region-table-number align-left", children: [_jsx("strong", { children: formatNumber(row.customerCount) }), _jsxs("div", { style: {
                                                                                display: 'flex',
                                                                                height: '4px',
                                                                                width: '100%',
                                                                                maxWidth: '80px',
                                                                                background: 'var(--surface-sunken)',
                                                                                borderRadius: '2px',
                                                                                overflow: 'hidden',
                                                                                marginTop: '8px'
                                                                            }, children: [_jsx("div", { style: { width: `${row.activeRate}%`, background: 'var(--semantic-positive)' }, title: `Ativos: ${formatPercent(row.activeRate)}` }), _jsx("div", { style: { width: `${row.attentionRate}%`, background: 'var(--semantic-attention)' }, title: `Atenção: ${formatPercent(row.attentionRate)}` }), _jsx("div", { style: { width: `${row.inactiveRate}%`, background: 'var(--semantic-negative)' }, title: `Inativos: ${formatPercent(row.inactiveRate)}` })] })] }) }), _jsx("td", { children: _jsx("div", { className: "region-table-number", children: _jsx("strong", { children: formatCurrency(row.totalRevenue) }) }) }), _jsx("td", { children: _jsxs("div", { className: "region-table-number", children: [_jsx("strong", { children: formatNumber(row.totalPieces) }), _jsxs("span", { children: [formatNumber(row.orderCount), " ", tx("pedidos", "orders")] })] }) })] }, cityKey(row))))) : (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "region-table-empty", children: tx("Nenhuma cidade bateu com esse filtro.", "No city matched this filter.") }) })) })] })) : (_jsxs(_Fragment, { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: tx("Cliente", "Customer") }), _jsx("th", { children: tx("Dias sem compra", "Days since purchase") }), _jsx("th", { children: tx("Cidade", "City") }), _jsx("th", { children: tx("Pecas", "Pieces") })] }) }), _jsx("tbody", { children: tableRows.length ? (tableRows.map((row) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("div", { className: "region-table-meta", children: [_jsx("strong", { children: row.displayName }), _jsx("span", { children: `${row.customerCode || tx("Sem codigo", "No code")} - ${formatCustomerStatus(row.status, tx)}` })] }) }), _jsx("td", { children: _jsxs("div", { className: "region-table-number align-left", children: [_jsxs("strong", { className: "region-days-badge", children: [_jsx("span", { className: "region-days-emoji", "aria-hidden": "true", children: customerStatusEmoji(row.status) }), _jsx("span", { children: formatDaysSincePurchase(row.daysSinceLastPurchase, tx) })] }), _jsx("span", { children: tx("Ultima compra", "Last purchase") })] }) }), _jsx("td", { children: _jsxs("div", { className: "region-table-meta", children: [_jsx("strong", { children: row.city }), _jsx("span", { children: `${row.state} - ${formatCurrency(row.totalRevenue)}` })] }) }), _jsx("td", { children: _jsxs("div", { className: "region-table-number", children: [_jsx("strong", { children: formatNumber(row.totalPieces) }), _jsxs("span", { children: [formatNumber(row.orderCount), " ", tx("pedidos", "orders")] })] }) })] }, `${row.customerId}-${row.state}-${row.city}`)))) : (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "region-table-empty", children: tx("Nenhum cliente bateu com esse filtro.", "No customer matched this filter.") }) })) })] })), "            "] }) }), _jsxs("div", { className: "region-filter-grid", children: [_jsxs("div", { className: "region-filter-box", children: [_jsxs("div", { className: "region-filter-header", children: [_jsx("h4", { children: tx("Estado", "State") }), _jsx("span", { children: formatNumber(allStates.length) })] }), _jsxs("div", { className: "region-filter-list", children: [_jsxs("button", { type: "button", className: `region-filter-option${selectedState === "" ? " active" : ""}`, onClick: clearFilters, children: [_jsx("i", {}), _jsx("strong", { children: tx("Todos", "All") }), _jsx("span", { children: formatNumber(geographicData.summary.totalCustomers) })] }), allStates.map((state) => (_jsxs("button", { type: "button", className: `region-filter-option${selectedState === state.uf ? " active" : ""}${state.stat.totalPieces <= 0 ? " muted" : ""}`, onClick: () => handleStateToggle(state.uf), children: [_jsx("i", {}), _jsx("strong", { children: `${state.uf} - ${state.label}` }), _jsx("span", { children: formatNumber(state.stat.customerCount) })] }, state.uf)))] })] }), _jsxs("div", { className: "region-filter-box", children: [_jsxs("div", { className: "region-filter-header", children: [_jsx("h4", { children: tx("Cidade", "City") }), _jsx("span", { children: formatNumber(cityFilterRows.length) })] }), _jsxs("div", { className: "region-filter-list", children: [_jsxs("button", { type: "button", className: `region-filter-option${selectedCityKey === "" ? " active" : ""}`, onClick: () => setSelectedCityKey(""), children: [_jsx("i", {}), _jsx("strong", { children: tx("Todas", "All") }), _jsx("span", { children: formatNumber(filteredCustomers.length) })] }), cityFilterRows.map((city) => (_jsxs("button", { type: "button", className: `region-filter-option city${selectedCityKey === cityKey(city) ? " active" : ""}`, onClick: () => handleCitySelect(city), children: [_jsx("i", {}), _jsx("strong", { children: city.city }), _jsx("span", { children: `${city.state} - ${formatNumber(city.customerCount)}` })] }, cityKey(city))))] })] })] })] })] })] }));
}
