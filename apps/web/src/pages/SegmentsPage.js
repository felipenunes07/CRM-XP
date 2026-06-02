import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CustomerTable } from "../components/CustomerTable";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
import { useUiLanguage } from "../i18n";
const initialDefinition = {
    status: ["INACTIVE"],
    minDaysInactive: 90,
    minTotalSpent: 0,
};
function sanitizeSegmentDefinition(definition) {
    const { frequencyDropRatio: _frequencyDropRatio, ...cleanDefinition } = definition;
    return cleanDefinition;
}
function summarizeSegment(segment) {
    const parts = [];
    if (segment.definition.status?.length) {
        const status = segment.definition.status[0];
        parts.push(status === "ACTIVE" ? "Ativos" : status === "ATTENTION" ? "Atencao" : "Inativos");
    }
    if (segment.definition.minDaysInactive !== undefined) {
        parts.push(`${segment.definition.minDaysInactive}+ dias`);
    }
    if (segment.definition.labels?.length) {
        parts.push(`Rotulo: ${segment.definition.labels[0]}`);
    }
    if (segment.definition.customerPrefix) {
        parts.push(`Categoria: ${segment.definition.customerPrefix}`);
    }
    if (segment.definition.state) {
        parts.push(`Estado: ${segment.definition.state}`);
    }
    if (segment.definition.minTotalOrders !== undefined) {
        parts.push(`${segment.definition.minTotalOrders}+ pedidos`);
    }
    return parts.length ? parts.join(" | ") : "Filtro dinamico salvo";
}
function SegmentTags({ segment }) {
    const summaryText = summarizeSegment(segment);
    const tags = summaryText === "Filtro dinamico salvo" ? [summaryText] : summaryText.split(" | ");
    return (_jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.3rem" }, children: tags.map((tag, idx) => {
            let bg = "rgba(107, 114, 128, 0.08)";
            let border = "rgba(107, 114, 128, 0.15)";
            let text = "var(--muted-color, #6b7280)";
            if (tag.includes("Ativos") || tag.includes("Atencao") || tag.includes("Inativos") || tag.includes("Ativa")) {
                bg = "rgba(37, 99, 235, 0.08)";
                border = "rgba(37, 99, 235, 0.15)";
                text = "#2563eb";
            }
            else if (tag.includes("dias")) {
                bg = "rgba(147, 51, 234, 0.08)";
                border = "rgba(147, 51, 234, 0.15)";
                text = "#9333ea";
            }
            else if (tag.includes("Rotulo")) {
                bg = "rgba(219, 39, 119, 0.08)";
                border = "rgba(219, 39, 119, 0.15)";
                text = "#db2777";
            }
            else if (tag.includes("Categoria")) {
                bg = "rgba(79, 70, 229, 0.08)";
                border = "rgba(79, 70, 229, 0.15)";
                text = "#4f46e5";
            }
            else if (tag.includes("Estado")) {
                bg = "rgba(13, 148, 136, 0.08)";
                border = "rgba(13, 148, 136, 0.15)";
                text = "#0d9488";
            }
            else if (tag.includes("pedidos")) {
                bg = "rgba(217, 119, 6, 0.08)";
                border = "rgba(217, 119, 6, 0.15)";
                text = "#d97706";
            }
            return (_jsx("span", { style: {
                    fontSize: "0.72rem", fontWeight: 600,
                    backgroundColor: bg, border: `1px solid ${border}`, color: text,
                    borderRadius: "6px", padding: "0.15rem 0.45rem", whiteSpace: "nowrap"
                }, children: tag }, idx));
        }) }));
}
function LabelMultiSelect({ label, options, selectedValues, onChange, placeholder, }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    useEffect(() => {
        function handleClickOutside(event) {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    const handleToggle = (value) => {
        if (selectedValues.includes(value)) {
            onChange(selectedValues.filter((v) => v !== value));
        }
        else {
            onChange([...selectedValues, value]);
        }
    };
    return (_jsxs("div", { className: "segment-filter-half", style: { position: "relative" }, ref: containerRef, children: [_jsx("span", { style: { display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--foreground)" }, children: label }), _jsxs("button", { type: "button", onClick: () => setIsOpen(!isOpen), style: {
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    width: "100%", padding: "0.75rem 1rem", borderRadius: "8px",
                    border: "1px solid var(--border-color)", background: "var(--background)",
                    color: "var(--foreground)", fontSize: "0.95rem", cursor: "pointer",
                    textAlign: "left", outline: "none", minHeight: "42px"
                }, children: [_jsx("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }, children: selectedValues.length === 0 ? placeholder : selectedValues.join(", ") }), _jsx("span", { style: { fontSize: "0.75rem", color: "var(--muted-color)" }, children: "\u25BC" })] }), isOpen && (_jsx("div", { className: "multiselect-dropdown", children: options.length === 0 ? (_jsx("div", { style: { padding: "0.5rem", fontSize: "0.875rem", color: "var(--muted-color)", textAlign: "center" }, children: "Nenhum r\u00F3tulo criado" })) : (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: "2px" }, children: options.map((opt) => {
                        const isChecked = selectedValues.includes(opt.name);
                        return (_jsxs("label", { className: `multiselect-option ${isChecked ? "is-checked" : ""}`, children: [_jsx("input", { type: "checkbox", checked: isChecked, onChange: () => handleToggle(opt.name) }), _jsx("span", { children: opt.name })] }, opt.id));
                    }) })) }))] }));
}
export function SegmentsPage() {
    const { token } = useAuth();
    const { tx } = useUiLanguage();
    const queryClient = useQueryClient();
    const [definition, setDefinition] = useState(() => sanitizeSegmentDefinition(initialDefinition));
    const [segmentName, setSegmentName] = useState("");
    const [activeSegmentId, setActiveSegmentId] = useState(null);
    const [segmentMessage, setSegmentMessage] = useState("");
    const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
    const [batchLabelName, setBatchLabelName] = useState("");
    const [batchMessage, setBatchMessage] = useState("");
    const [manualCodesText, setManualCodesText] = useState("");
    const [activeTab, setActiveTab] = useState("builder");
    const [librarySearch, setLibrarySearch] = useState("");
    // States for interactive manual client selection
    const [manualMode, setManualMode] = useState("search");
    const [clientSearchQuery, setClientSearchQuery] = useState("");
    const [clientSearchResults, setClientSearchResults] = useState([]);
    const [isSearchingClients, setIsSearchingClients] = useState(false);
    const [displayNamesMap, setDisplayNamesMap] = useState({});
    const bulkLabelMutation = useMutation({
        mutationFn: (input) => api.bulkAssignLabelToCustomers(token, input.customerIds, input.labelName),
        onSuccess: () => {
            setBatchMessage("Rótulo atribuído com sucesso para todos os selecionados!");
            setSelectedCustomerIds([]);
            setBatchLabelName("");
            void queryClient.invalidateQueries({ queryKey: ["customer-labels"] });
            if (previewMutation.data) {
                previewMutation.mutate(definition);
            }
        },
        onError: (err) => {
            setBatchMessage(`Erro ao atribuir rótulo: ${err.message}`);
        }
    });
    const labelsQuery = useQuery({
        queryKey: ["customer-labels"],
        queryFn: () => api.customerLabels(token),
        enabled: Boolean(token),
    });
    const savedSegmentsQuery = useQuery({
        queryKey: ["saved-segments"],
        queryFn: () => api.savedSegments(token),
        enabled: Boolean(token),
    });
    const previewMutation = useMutation({
        mutationFn: (input) => api.previewSegment(token, input),
    });
    const saveSegmentMutation = useMutation({
        mutationFn: (input) => activeSegmentId ? api.updateSavedSegment(token, activeSegmentId, input) : api.createSavedSegment(token, input),
        onSuccess: (savedSegment) => {
            setActiveSegmentId(savedSegment.id);
            setSegmentName(savedSegment.name);
            setSegmentMessage(activeSegmentId ? "Publico atualizado com sucesso." : "Publico salvo com sucesso.");
            void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
        },
    });
    const duplicateSegmentMutation = useMutation({
        mutationFn: (input) => api.createSavedSegment(token, input),
        onSuccess: (savedSegment) => {
            setActiveSegmentId(savedSegment.id);
            setSegmentName(savedSegment.name);
            setSegmentMessage("Publico duplicado com sucesso.");
            void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
        },
    });
    const deleteSegmentMutation = useMutation({
        mutationFn: (id) => api.deleteSavedSegment(token, id),
        onSuccess: () => {
            setActiveSegmentId(null);
            setSegmentName("");
            setSegmentMessage("Publico excluido.");
            void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
        },
    });
    // Debounced search for clients manual selection
    useEffect(() => {
        const trimmed = clientSearchQuery.trim();
        if (!trimmed) {
            setClientSearchResults([]);
            setIsSearchingClients(false);
            return;
        }
        setIsSearchingClients(true);
        const delayDebounceFn = setTimeout(() => {
            api.customers(token, { search: trimmed, limit: 10 })
                .then((res) => {
                setClientSearchResults(res);
            })
                .catch((err) => {
                console.error("Erro ao buscar clientes:", err);
                setClientSearchResults([]);
            })
                .finally(() => {
                setIsSearchingClients(false);
            });
        }, 300);
        return () => clearTimeout(delayDebounceFn);
    }, [clientSearchQuery, token]);
    // Resolve display names from preview data or search results
    useEffect(() => {
        const codes = definition.customerCodes;
        if (!codes || codes.length === 0)
            return;
        const newMap = { ...displayNamesMap };
        let changed = false;
        // 1. Resolve from current preview results
        if (previewMutation.data?.customers) {
            previewMutation.data.customers.forEach((cust) => {
                if (cust.customerCode && codes.includes(cust.customerCode) && !newMap[cust.customerCode]) {
                    newMap[cust.customerCode] = cust.displayName;
                    changed = true;
                }
            });
        }
        // 2. Resolve from current search results
        if (clientSearchResults.length > 0) {
            clientSearchResults.forEach((cust) => {
                if (cust.customerCode && codes.includes(cust.customerCode) && !newMap[cust.customerCode]) {
                    newMap[cust.customerCode] = cust.displayName;
                    changed = true;
                }
            });
        }
        if (changed) {
            setDisplayNamesMap(newMap);
        }
    }, [previewMutation.data, clientSearchResults, definition.customerCodes]);
    const handleAddManualCode = (cust) => {
        if (!cust.customerCode)
            return;
        const code = cust.customerCode.trim().toUpperCase();
        // Add to displayNamesMap
        setDisplayNamesMap(current => ({ ...current, [code]: cust.displayName }));
        setDefinition((current) => {
            const existing = current.customerCodes ?? [];
            if (existing.includes(code))
                return current;
            const updatedCodes = [...existing, code];
            // Update manualCodesText to match
            setManualCodesText(updatedCodes.join(", "));
            return {
                ...current,
                customerCodes: updatedCodes
            };
        });
        setClientSearchQuery("");
    };
    const handleRemoveManualCode = (codeToRemove) => {
        const code = codeToRemove.trim().toUpperCase();
        setDefinition((current) => {
            const existing = current.customerCodes ?? [];
            const updatedCodes = existing.filter(c => c.trim().toUpperCase() !== code);
            // Update manualCodesText to match
            setManualCodesText(updatedCodes.length ? updatedCodes.join(", ") : "");
            return {
                ...current,
                customerCodes: updatedCodes.length ? updatedCodes : undefined
            };
        });
    };
    // Load a saved segment into state and trigger its preview
    function openSavedSegment(segment) {
        const cleanDefinition = sanitizeSegmentDefinition(segment.definition);
        setDefinition(cleanDefinition);
        setSegmentName(segment.name);
        setManualCodesText(cleanDefinition.customerCodes ? cleanDefinition.customerCodes.join(", ") : "");
        setActiveSegmentId(segment.id);
        setSegmentMessage("");
        setSelectedCustomerIds([]);
        setBatchMessage("");
        previewMutation.mutate(cleanDefinition);
    }
    function handleSaveSegment() {
        const cleanedName = segmentName.trim();
        if (!cleanedName) {
            setSegmentMessage("Dê um nome ao publico antes de salvar.");
            return;
        }
        saveSegmentMutation.mutate({
            name: cleanedName,
            definition: sanitizeSegmentDefinition(definition),
        });
    }
    function handleSubmit(event) {
        event.preventDefault();
        const cleanDefinition = sanitizeSegmentDefinition(definition);
        setDefinition(cleanDefinition);
        previewMutation.mutate(cleanDefinition);
        setSegmentMessage("");
        setSelectedCustomerIds([]);
        setBatchMessage("");
    }
    function handleDuplicateSegment() {
        const baseName = segmentName.trim() || "Publico acionavel";
        duplicateSegmentMutation.mutate({
            name: `${baseName} copia`,
            definition: sanitizeSegmentDefinition(definition),
        });
    }
    function handleDeleteSegment() {
        if (!activeSegmentId)
            return;
        deleteSegmentMutation.mutate(activeSegmentId);
    }
    const filteredSegments = (savedSegmentsQuery.data ?? []).filter((segment) => segment.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
        summarizeSegment(segment).toLowerCase().includes(librarySearch.toLowerCase()));
    // Find the currently selected segment object for the library view
    const selectedLibrarySegment = activeTab === "library" && activeSegmentId
        ? (savedSegmentsQuery.data ?? []).find((s) => s.id === activeSegmentId)
        : null;
    return (_jsxs("div", { className: "page-stack", children: [_jsxs("div", { style: {
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    flexWrap: "wrap", gap: "1rem", marginBottom: "1rem",
                    borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem"
                }, children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", style: { margin: 0 }, children: "Segmentacao inteligente" }), _jsx("h2", { className: "premium-header-title", style: { margin: "0.25rem 0 0 0" }, children: "Monte um publico acionavel" })] }), _jsxs("div", { className: "customers-view-switcher", role: "tablist", style: { margin: 0, padding: "0.25rem" }, children: [_jsx("button", { type: "button", role: "tab", "aria-selected": activeTab === "builder", className: `chart-switch-button ${activeTab === "builder" ? "active" : ""}`, onClick: () => setActiveTab("builder"), style: { padding: "0.5rem 1.25rem", borderRadius: "14px" }, children: _jsx("strong", { children: "\u270F\uFE0F Criar P\u00FAblico" }) }), _jsx("button", { type: "button", role: "tab", "aria-selected": activeTab === "library", className: `chart-switch-button ${activeTab === "library" ? "active" : ""}`, onClick: () => { setActiveTab("library"); setLibrarySearch(""); }, style: { padding: "0.5rem 1.25rem", borderRadius: "14px" }, children: _jsxs("strong", { children: ["\uD83D\uDCDA Publicos Salvos (", savedSegmentsQuery.data?.length ?? 0, ")"] }) })] })] }), activeTab === "builder" ? (_jsxs(_Fragment, { children: [activeSegmentId && (_jsxs("div", { style: {
                            background: "rgba(37, 99, 235, 0.04)", border: "1px solid rgba(37, 99, 235, 0.15)",
                            borderRadius: "12px", padding: "1rem 1.25rem", marginBottom: "1.25rem",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            flexWrap: "wrap", gap: "1rem"
                        }, children: [_jsxs("span", { style: { fontSize: "0.95rem", color: "#2563eb", fontWeight: 600 }, children: ["\u270F\uFE0F Editando: ", _jsx("strong", { style: { color: "var(--foreground)" }, children: segmentName })] }), _jsx("button", { type: "button", className: "ghost-button", onClick: () => {
                                    setActiveSegmentId(null);
                                    setSegmentName("");
                                    setDefinition(sanitizeSegmentDefinition(initialDefinition));
                                    setManualCodesText("");
                                }, style: {
                                    padding: "0.4rem 0.85rem", fontSize: "0.85rem", height: "auto", minHeight: "auto",
                                    border: "1px solid rgba(37, 99, 235, 0.35)", color: "#2563eb", fontWeight: 600
                                }, children: "\u2795 Criar como Novo" })] })), _jsxs("section", { className: "grid-two", children: [_jsxs("form", { className: "panel", onSubmit: handleSubmit, children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Defina as Regras" }), _jsx("h3", { children: "Filtros do P\u00FAblico" })] }) }), _jsxs("div", { className: "filters-grid filters-grid-four segment-filters-grid", children: [_jsxs("label", { className: "full-span", children: ["Nome do publico", _jsx("input", { type: "text", value: segmentName, onChange: (event) => { setSegmentName(event.target.value); setSegmentMessage(""); }, placeholder: "Ex: Reativacao premium do mes" })] }), _jsxs("label", { className: "segment-filter-half", children: ["Status", _jsxs("select", { value: definition.status?.[0] ?? "", onChange: (event) => setDefinition((current) => ({ ...current, status: event.target.value ? [event.target.value] : undefined })), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "ACTIVE", children: "Ativos" }), _jsx("option", { value: "ATTENTION", children: "Atencao" }), _jsx("option", { value: "INACTIVE", children: "Inativos" })] })] }), _jsxs("div", { className: "segment-filter-half", children: [_jsx("label", { children: tx("Categoria do cliente", "Customer category") }), _jsx("div", { className: "customers-view-switcher", role: "tablist", children: [
                                                            { value: undefined, label: tx("Todas", "All") },
                                                            { value: "CL", label: "CL" },
                                                            { value: "KH", label: "KH" },
                                                            { value: "LJ", label: "LJ" }
                                                        ].map((option) => (_jsx("button", { type: "button", role: "tab", "aria-selected": definition.customerPrefix === option.value, className: `chart-switch-button ${definition.customerPrefix === option.value ? "active" : ""}`, onClick: () => setDefinition((current) => ({ ...current, customerPrefix: option.value })), children: _jsx("strong", { children: option.label }) }, option.label))) })] }), _jsxs("label", { className: "segment-filter-half", children: ["Minimo de dias inativo", _jsx("input", { type: "number", value: definition.minDaysInactive ?? "", onChange: (event) => setDefinition((current) => ({ ...current, minDaysInactive: event.target.value ? Number(event.target.value) : undefined })) })] }), _jsxs("label", { className: "segment-filter-half", children: ["Ticket minimo", _jsx("input", { type: "number", value: definition.minAvgTicket ?? "", onChange: (event) => setDefinition((current) => ({ ...current, minAvgTicket: event.target.value ? Number(event.target.value) : undefined })) })] }), _jsxs("label", { className: "segment-filter-half", children: ["Total gasto minimo", _jsx("input", { type: "number", value: definition.minTotalSpent ?? "", onChange: (event) => setDefinition((current) => ({ ...current, minTotalSpent: event.target.value ? Number(event.target.value) : undefined })) })] }), _jsxs("label", { className: "segment-filter-half", children: ["Estado (UF)", _jsxs("select", { value: definition.state ?? "", onChange: (event) => setDefinition((current) => ({ ...current, state: event.target.value || undefined })), children: [_jsx("option", { value: "", children: "Todos os estados" }), _jsx("option", { value: "AC", children: "Acre (AC)" }), _jsx("option", { value: "AL", children: "Alagoas (AL)" }), _jsx("option", { value: "AP", children: "Amap\u00E1 (AP)" }), _jsx("option", { value: "AM", children: "Amazonas (AM)" }), _jsx("option", { value: "BA", children: "Bahia (BA)" }), _jsx("option", { value: "CE", children: "Cear\u00E1 (CE)" }), _jsx("option", { value: "DF", children: "Distrito Federal (DF)" }), _jsx("option", { value: "ES", children: "Esp\u00EDrito Santo (ES)" }), _jsx("option", { value: "GO", children: "Goi\u00E1s (GO)" }), _jsx("option", { value: "MA", children: "Maranh\u00E3o (MA)" }), _jsx("option", { value: "MT", children: "Mato Grosso (MT)" }), _jsx("option", { value: "MS", children: "Mato Grosso do Sul (MS)" }), _jsx("option", { value: "MG", children: "Minas Gerais (MG)" }), _jsx("option", { value: "PA", children: "Par\u00E1 (PA)" }), _jsx("option", { value: "PB", children: "Para\u00EDba (PB)" }), _jsx("option", { value: "PR", children: "Paran\u00E1 (PR)" }), _jsx("option", { value: "PE", children: "Pernambuco (PE)" }), _jsx("option", { value: "PI", children: "Piau\u00ED (PI)" }), _jsx("option", { value: "RJ", children: "Rio de Janeiro (RJ)" }), _jsx("option", { value: "RN", children: "Rio Grande do Norte (RN)" }), _jsx("option", { value: "RS", children: "Rio Grande do Sul (RS)" }), _jsx("option", { value: "RO", children: "Rond\u00F4nia (RO)" }), _jsx("option", { value: "RR", children: "Roraima (RR)" }), _jsx("option", { value: "SC", children: "Santa Catarina (SC)" }), _jsx("option", { value: "SP", children: "S\u00E3o Paulo (SP)" }), _jsx("option", { value: "SE", children: "Sergipe (SE)" }), _jsx("option", { value: "TO", children: "Tocantins (TO)" })] })] }), _jsxs("label", { className: "segment-filter-half", children: ["Pedidos m\u00EDnimos", _jsx("input", { type: "number", min: 0, placeholder: "Ex: 5", value: definition.minTotalOrders ?? "", onChange: (event) => setDefinition((current) => ({ ...current, minTotalOrders: event.target.value ? Number(event.target.value) : undefined })) })] }), _jsxs("div", { className: "full-span manual-inclusion-wrapper", style: { display: "flex", flexDirection: "column", gap: "0.5rem" }, children: [_jsx("style", { children: `
                    .manual-inclusion-card {
                      background: var(--panel-background, #fff);
                      border: 1px solid var(--border-color, #e5e7eb);
                      border-radius: 12px;
                      padding: 1.25rem;
                      margin-bottom: 0.5rem;
                      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
                      display: flex;
                      flex-direction: column;
                      gap: 1rem;
                    }
                    .manual-inclusion-header {
                      display: flex;
                      justify-content: space-between;
                      align-items: center;
                      flex-wrap: wrap;
                      gap: 0.75rem;
                      border-bottom: 1px dashed var(--border-color, #e5e7eb);
                      padding-bottom: 0.75rem;
                    }
                    .manual-inclusion-title {
                      font-size: 0.875rem;
                      font-weight: 700;
                      color: var(--foreground, #1e293b);
                      margin: 0;
                    }
                    .manual-inclusion-subtitle {
                      font-size: 0.75rem;
                      color: var(--muted-color, #64748b);
                      margin-top: 0.25rem;
                      font-weight: 400;
                    }
                    .manual-tabs {
                      display: flex;
                      background: rgba(107, 114, 128, 0.06);
                      padding: 3px;
                      border-radius: 8px;
                      border: 1px solid rgba(107, 114, 128, 0.08);
                    }
                    .manual-tab-btn {
                      border: none;
                      background: transparent;
                      padding: 0.35rem 0.75rem;
                      font-size: 0.75rem;
                      font-weight: 600;
                      border-radius: 6px;
                      cursor: pointer;
                      color: var(--muted-color, #64748b);
                      transition: all 0.15s ease;
                    }
                    .manual-tab-btn.active {
                      background: var(--panel-background, #fff);
                      color: #2563eb;
                      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
                    }
                    .search-input-wrapper {
                      position: relative;
                      width: 100%;
                    }
                    .search-input-wrapper input {
                      width: 100%;
                      padding: 0.75rem 1rem 0.75rem 2.25rem;
                      border-radius: 8px;
                      border: 1px solid var(--border-color, #e5e7eb);
                      background: var(--background, #fff);
                      color: var(--foreground, #000);
                      font-size: 0.9rem;
                      outline: none;
                      transition: all 0.2s ease;
                    }
                    .search-input-wrapper input:focus {
                      border-color: #2563eb;
                      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
                    }
                    .search-icon-inside {
                      position: absolute;
                      left: 0.85rem;
                      top: 50%;
                      transform: translateY(-50%);
                      color: var(--muted-color, #9ca3af);
                      font-size: 0.95rem;
                      pointer-events: none;
                    }
                    .autocomplete-dropdown {
                      position: absolute;
                      top: 100%;
                      left: 0;
                      right: 0;
                      z-index: 1000;
                      background: #ffffff !important;
                      border: 1px solid #cbd5e1 !important;
                      border-radius: 10px;
                      margin-top: 0.35rem;
                      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
                      max-height: 250px;
                      overflow-y: auto;
                      padding: 4px;
                    }
                    .autocomplete-item {
                      display: flex;
                      align-items: center;
                      justify-content: space-between;
                      padding: 0.5rem 0.75rem;
                      border-radius: 6px;
                      cursor: pointer;
                      transition: all 0.15s ease;
                      gap: 12px;
                    }
                    .autocomplete-item:hover {
                      background: rgba(37, 99, 235, 0.08);
                    }
                    .autocomplete-client-info {
                      display: flex;
                      flex-direction: column;
                      min-width: 0;
                    }
                    .autocomplete-client-name {
                      font-size: 0.85rem;
                      font-weight: 600;
                      color: #0f172a !important;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      white-space: nowrap;
                    }
                    .autocomplete-client-code {
                      font-size: 0.7rem;
                      color: #64748b !important;
                      font-family: monospace;
                      margin-top: 1px;
                    }
                    .chips-container {
                      display: flex;
                      flex-wrap: wrap;
                      gap: 6px;
                      padding: 0.75rem;
                      border: 1px dashed var(--border-color, #e5e7eb);
                      border-radius: 8px;
                      min-height: 52px;
                      align-items: center;
                      background: rgba(107, 114, 128, 0.02);
                      margin-top: 0.25rem;
                    }
                    .client-chip {
                      display: flex;
                      align-items: center;
                      gap: 6px;
                      background: rgba(37, 99, 235, 0.05);
                      border: 1px solid rgba(37, 99, 235, 0.15);
                      color: #2563eb;
                      padding: 0.25rem 0.65rem;
                      border-radius: 20px;
                      font-size: 0.75rem;
                      font-weight: 600;
                      transition: all 0.2s ease;
                      animation: scaleIn 0.2s ease forwards;
                    }
                    .client-chip:hover {
                      background: rgba(37, 99, 235, 0.1);
                      transform: translateY(-1px);
                      box-shadow: 0 2px 4px rgba(37, 99, 235, 0.05);
                    }
                    .client-chip-remove {
                      background: transparent;
                      border: none;
                      color: rgba(220, 38, 38, 0.6);
                      cursor: pointer;
                      font-size: 0.85rem;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      padding: 0;
                      width: 14px;
                      height: 14px;
                      border-radius: 50%;
                      transition: all 0.15s ease;
                      font-weight: bold;
                    }
                    .client-chip-remove:hover {
                      background: rgba(220, 38, 38, 0.1);
                      color: #dc2626;
                    }
                    .status-badge-inline {
                      font-size: 0.65rem;
                      padding: 2px 6px;
                      border-radius: 4px;
                      font-weight: 700;
                    }
                    .status-badge-inline.ACTIVE {
                      background: rgba(16, 185, 129, 0.1);
                      color: #10b981;
                    }
                    .status-badge-inline.ATTENTION {
                      background: rgba(245, 158, 11, 0.1);
                      color: #f59e0b;
                    }
                    .status-badge-inline.INACTIVE {
                      background: rgba(107, 114, 128, 0.1);
                      color: #6b7280;
                    }
                  ` }), _jsxs("div", { className: "manual-inclusion-card", children: [_jsxs("div", { className: "manual-inclusion-header", children: [_jsxs("div", { children: [_jsx("h4", { className: "manual-inclusion-title", children: "\uD83D\uDC64 Incluir Clientes Manualmente (Opcional)" }), _jsx("p", { className: "manual-inclusion-subtitle", children: "Adicione clientes espec\u00EDficos ao p\u00FAblico alvo de forma direta." })] }), _jsxs("div", { className: "manual-tabs", children: [_jsx("button", { type: "button", className: `manual-tab-btn ${manualMode === "search" ? "active" : ""}`, onClick: () => setManualMode("search"), children: "\uD83D\uDD0D Buscar & Selecionar" }), _jsx("button", { type: "button", className: `manual-tab-btn ${manualMode === "paste" ? "active" : ""}`, onClick: () => setManualMode("paste"), children: "\uD83D\uDCCB Colar em Lote" })] })] }), manualMode === "search" ? (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.75rem", position: "relative" }, children: [_jsxs("div", { className: "search-input-wrapper", children: [_jsx("span", { className: "search-icon-inside", children: "\uD83D\uDD0D" }), _jsx("input", { type: "text", placeholder: "Digite o nome ou c\u00F3digo do cliente para buscar e adicionar...", value: clientSearchQuery, onChange: (e) => setClientSearchQuery(e.target.value) }), isSearchingClients && (_jsx("span", { style: { position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", fontSize: "0.8rem", color: "var(--muted-color)" }, children: "\u23F3 Buscando..." }))] }), clientSearchResults.length > 0 && (_jsx("div", { className: "autocomplete-dropdown", children: clientSearchResults.map((cust) => {
                                                                            const alreadyAdded = definition.customerCodes?.includes(cust.customerCode ?? "");
                                                                            return (_jsxs("div", { className: "autocomplete-item", onClick: () => {
                                                                                    if (!alreadyAdded)
                                                                                        handleAddManualCode(cust);
                                                                                }, style: { opacity: alreadyAdded ? 0.6 : 1, cursor: alreadyAdded ? "default" : "pointer" }, children: [_jsxs("div", { className: "autocomplete-client-info", children: [_jsx("span", { className: "autocomplete-client-name", children: cust.displayName }), _jsx("span", { className: "autocomplete-client-code", children: cust.customerCode || "Sem código" })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [_jsx("span", { className: `status-badge-inline ${cust.status}`, children: cust.status === "ACTIVE" ? "Ativo" : cust.status === "ATTENTION" ? "Atenção" : "Inativo" }), alreadyAdded ? (_jsx("span", { style: { color: "#10b981", fontSize: "0.85rem", fontWeight: 700 }, children: "\u2713" })) : (_jsx("span", { style: { color: "#2563eb", fontSize: "0.85rem", fontWeight: 700 }, children: "\uFF0B" }))] })] }, cust.id));
                                                                        }) })), clientSearchQuery.trim() && clientSearchResults.length === 0 && !isSearchingClients && (_jsx("div", { className: "autocomplete-dropdown", style: { padding: "1rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-color)" }, children: "Nenhum cliente correspondente encontrado." })), _jsxs("div", { children: [_jsxs("span", { style: { fontSize: "0.75rem", fontWeight: 700, color: "var(--foreground)", display: "block", marginBottom: "0.25rem" }, children: ["Clientes Selecionados (", definition.customerCodes?.length ?? 0, "):"] }), _jsx("div", { className: "chips-container", children: definition.customerCodes && definition.customerCodes.length > 0 ? (definition.customerCodes.map((code) => {
                                                                                    const displayName = displayNamesMap[code];
                                                                                    return (_jsxs("div", { className: "client-chip", children: [_jsx("span", { children: displayName ? `${displayName} (${code})` : code }), _jsx("button", { type: "button", className: "client-chip-remove", onClick: () => handleRemoveManualCode(code), children: "\u00D7" })] }, code));
                                                                                })) : (_jsx("span", { style: { fontSize: "0.8rem", color: "var(--muted-color)", fontStyle: "italic" }, children: "Nenhum cliente selecionado ainda. Busque e clique acima para incluir." })) })] })] })) : (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.5rem" }, children: [_jsx("span", { style: { fontSize: "0.75rem", color: "var(--muted-color)", display: "block", marginBottom: "0.25rem", fontWeight: 400 }, children: "Cole os c\u00F3digos separados por v\u00EDrgula, espa\u00E7o ou quebra de linha (ex: CL1200, KH9321)." }), _jsx("textarea", { placeholder: "Cole c\u00F3digos manuais de clientes...", style: { minHeight: "80px", resize: "vertical", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--background)", color: "var(--foreground)", outline: "none", fontSize: "0.9rem" }, value: manualCodesText, onChange: (event) => {
                                                                            const val = event.target.value;
                                                                            setManualCodesText(val);
                                                                            const codes = val.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
                                                                            setDefinition((current) => ({ ...current, customerCodes: codes.length ? codes : undefined }));
                                                                        } }), definition.customerCodes && definition.customerCodes.length > 0 && (_jsxs("div", { style: { marginTop: "0.5rem" }, children: [_jsxs("span", { style: { fontSize: "0.75rem", fontWeight: 700, color: "var(--foreground)", display: "block", marginBottom: "0.25rem" }, children: ["C\u00F3digos Identificados (", definition.customerCodes.length, "):"] }), _jsx("div", { className: "chips-container", style: { minHeight: "auto" }, children: definition.customerCodes.map((code) => (_jsxs("div", { className: "client-chip", style: { background: "rgba(107, 114, 128, 0.05)", border: "1px solid rgba(107, 114, 128, 0.15)", color: "var(--muted-color)" }, children: [_jsx("span", { children: displayNamesMap[code] ? `${displayNamesMap[code]} (${code})` : code }), _jsx("button", { type: "button", className: "client-chip-remove", onClick: () => handleRemoveManualCode(code), children: "\u00D7" })] }, code))) })] }))] }))] })] }), _jsx(LabelMultiSelect, { label: "Com rotulo", options: labelsQuery.data ?? [], selectedValues: definition.labels ?? [], onChange: (newValues) => setDefinition((current) => ({ ...current, labels: newValues.length ? newValues : undefined })), placeholder: "Todos" }), _jsx(LabelMultiSelect, { label: "Ocultar com rotulo", options: labelsQuery.data ?? [], selectedValues: definition.excludeLabels ?? [], onChange: (newValues) => setDefinition((current) => ({ ...current, excludeLabels: newValues.length ? newValues : undefined })), placeholder: "Nenhum" })] }), _jsxs("div", { className: "inline-actions segment-actions-bar", children: [_jsx("button", { className: "primary-button", type: "submit", children: "Pre-visualizar segmento" }), _jsx("button", { className: "ghost-button", type: "button", onClick: handleSaveSegment, disabled: saveSegmentMutation.isPending, children: saveSegmentMutation.isPending ? "Salvando..." : activeSegmentId ? "Atualizar publico" : "Salvar publico" }), _jsx("button", { className: "ghost-button", type: "button", onClick: handleDuplicateSegment, disabled: duplicateSegmentMutation.isPending, children: duplicateSegmentMutation.isPending ? "Duplicando..." : "Duplicar" }), activeSegmentId ? (_jsx("button", { className: "ghost-button danger", type: "button", onClick: handleDeleteSegment, disabled: deleteSegmentMutation.isPending, children: deleteSegmentMutation.isPending ? "Excluindo..." : "Excluir" })) : null, segmentMessage ? _jsx("span", { className: "save-ok", children: segmentMessage }) : null] })] }), _jsxs("article", { className: "panel segment-summary-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Resumo" }), _jsx("h3", { children: "Resultado esperado" }), _jsx("p", { className: "panel-subcopy", children: "A previa aparece aqui para voc\u00EA decidir se esse publico vale salvar e acionar." })] }) }), previewMutation.data ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "detail-grid segment-summary-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Clientes" }), _jsx("strong", { children: formatNumber(previewMutation.data.summary.totalCustomers) })] }), _jsxs("div", { children: [_jsx("span", { children: "Prioridade media" }), _jsx("strong", { children: Number(previewMutation.data.summary.averagePriorityScore ?? 0).toFixed(1) })] }), _jsxs("div", { children: [_jsx("span", { children: "Faturamento" }), _jsx("strong", { children: formatCurrency(previewMutation.data.summary.potentialRecoveredRevenue ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Media de pecas/pedido" }), _jsx("strong", { children: formatNumber(previewMutation.data.summary.potentialRecoveredPieces ?? 0) })] })] }), _jsxs("div", { className: "detail-grid segment-summary-grid", style: { marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }, children: [_jsx("div", { style: { gridColumn: '1 / -1' }, children: _jsx("span", { style: { fontSize: '0.875rem', fontWeight: 600, color: '#2563eb' }, children: "Potencial mensal se recuperarmos" }) }), _jsxs("div", { children: [_jsx("span", { children: "Faturamento/mes" }), _jsx("strong", { style: { color: '#2563eb' }, children: formatCurrency(previewMutation.data.summary.monthlyPotentialRevenue ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Pecas/mes" }), _jsx("strong", { style: { color: '#2563eb' }, children: formatNumber(previewMutation.data.summary.monthlyPotentialPieces ?? 0) })] })] }), _jsx("p", { className: "panel-subcopy segment-summary-note", children: "A primeira linha mostra dados historicos: media de pecas por pedido e soma dos tickets medios de cada cliente. A segunda linha projeta o potencial mensal caso consigamos recuperar esses clientes, baseado no historico de compras (frequencia e valor) de cada um." })] })) : (_jsx("div", { className: "empty-state", children: "Gere a previa para ver quantos clientes entram no publico, qual a prioridade media e o potencial estimado." }))] })] }), previewMutation.data && selectedCustomerIds.length > 0 ? (_jsxs("div", { className: "panel", style: {
                            background: "linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(29, 78, 216, 0.03) 100%)",
                            border: "1px solid rgba(37, 99, 235, 0.2)", borderRadius: "12px", padding: "1.5rem",
                            marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", alignItems: "center",
                            justifyContent: "space-between", gap: "1.5rem",
                            boxShadow: "0 4px 20px -2px rgba(37, 99, 235, 0.1)", transition: "all 0.3s ease"
                        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "1rem" }, children: [_jsx("div", { style: {
                                            width: "48px", height: "48px", borderRadius: "50%",
                                            backgroundColor: "rgba(37, 99, 235, 0.15)", display: "flex",
                                            alignItems: "center", justifyContent: "center", fontSize: "1.25rem",
                                            fontWeight: 700, color: "#2563eb", boxShadow: "0 0 12px rgba(37, 99, 235, 0.2)"
                                        }, children: selectedCustomerIds.length }), _jsxs("div", { children: [_jsx("h4", { style: { margin: 0, fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)" }, children: "Clientes selecionados para a\u00E7\u00E3o r\u00E1pida" }), _jsxs("p", { className: "panel-subcopy", style: { margin: 0, marginTop: "0.25rem" }, children: ["Crie um r\u00F3tulo personalizado abaixo para atribuir a todos estes ", selectedCustomerIds.length, " clientes de uma vez."] })] })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", flex: 1, justifyContent: "flex-end", minWidth: "300px" }, children: [_jsx("input", { type: "text", value: batchLabelName, onChange: (e) => { setBatchLabelName(e.target.value); setBatchMessage(""); }, placeholder: "Ex: Reativa\u00E7\u00E3o VIP, Lead Quente", style: { padding: "0.75rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.95rem", width: "250px", outline: "none", transition: "border-color 0.2s", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)" }, onKeyDown: (e) => { if (e.key === "Enter" && batchLabelName.trim())
                                            bulkLabelMutation.mutate({ customerIds: selectedCustomerIds, labelName: batchLabelName }); } }), _jsx("button", { type: "button", className: "primary-button", onClick: () => bulkLabelMutation.mutate({ customerIds: selectedCustomerIds, labelName: batchLabelName }), disabled: !batchLabelName.trim() || bulkLabelMutation.isPending, style: { padding: "0.75rem 1.5rem", fontSize: "0.95rem", fontWeight: 600, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)" }, children: bulkLabelMutation.isPending ? "Atribuindo..." : "Atribuir Rótulo" }), batchMessage && (_jsx("div", { style: { width: "100%", marginTop: "0.5rem", textAlign: "right", fontSize: "0.875rem", fontWeight: 500, color: batchMessage.includes("Erro") ? "#dc2626" : "#16a34a" }, children: batchMessage }))] })] })) : null, previewMutation.data ? (_jsx(CustomerTable, { customers: previewMutation.data.customers, selectable: true, selectedIds: selectedCustomerIds, onSelectedIdsChange: setSelectedCustomerIds })) : null] })) : (
            /* ═══════════ LIBRARY TAB ═══════════ */
            _jsxs(_Fragment, { children: [_jsx("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }, children: _jsx("input", { type: "text", placeholder: "\uD83D\uDD0D  Buscar p\u00FAblico...", value: librarySearch, onChange: (e) => setLibrarySearch(e.target.value), style: { padding: "0.6rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", fontSize: "0.9rem", width: "280px", maxWidth: "100%", background: "var(--background)", color: "var(--foreground)" } }) }), savedSegmentsQuery.isLoading ? _jsx("div", { className: "page-loading", children: "Carregando publicos..." }) : null, savedSegmentsQuery.isError ? _jsx("div", { className: "page-error", children: "Nao foi possivel carregar os publicos salvos." }) : null, !savedSegmentsQuery.isLoading && !savedSegmentsQuery.isError && (_jsxs(_Fragment, { children: [filteredSegments.length > 0 ? (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: "0.5rem" }, children: filteredSegments.map((segment) => {
                                    const isSelected = segment.id === activeSegmentId;
                                    return (_jsxs("button", { type: "button", onClick: () => openSavedSegment(segment), style: {
                                            display: "flex", alignItems: "center", justifyContent: "space-between",
                                            gap: "1rem", padding: "0.85rem 1.25rem",
                                            borderRadius: "12px", cursor: "pointer", textAlign: "left",
                                            border: isSelected ? "2px solid #2563eb" : "1px solid var(--border-color)",
                                            background: isSelected ? "rgba(37, 99, 235, 0.03)" : "var(--panel-background, #fff)",
                                            transition: "all 0.15s ease", width: "100%",
                                            boxShadow: isSelected ? "0 0 0 1px rgba(37, 99, 235, 0.1)" : "none"
                                        }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "1rem", flex: 1, minWidth: 0 }, children: [_jsx("strong", { style: { fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap" }, children: segment.name }), _jsx(SegmentTags, { segment: segment })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }, children: [_jsx("span", { className: "ghost-button", onClick: (e) => { e.stopPropagation(); openSavedSegment(segment); setActiveTab("builder"); }, style: { padding: "0.3rem 0.6rem", fontSize: "0.8rem", height: "auto", minHeight: "auto", cursor: "pointer" }, children: "\u270F\uFE0F" }), _jsx("span", { className: "ghost-button", onClick: (e) => {
                                                            e.stopPropagation();
                                                            duplicateSegmentMutation.mutate({ name: `${segment.name.trim()} copia`, definition: segment.definition });
                                                        }, style: { padding: "0.3rem 0.6rem", fontSize: "0.8rem", height: "auto", minHeight: "auto", cursor: "pointer" }, children: "\uD83D\uDCC2" }), _jsx("span", { className: "ghost-button danger", onClick: (e) => {
                                                            e.stopPropagation();
                                                            if (confirm(`Deseja realmente excluir o público "${segment.name}"?`)) {
                                                                deleteSegmentMutation.mutate(segment.id);
                                                            }
                                                        }, style: { padding: "0.3rem 0.6rem", fontSize: "0.8rem", height: "auto", minHeight: "auto", cursor: "pointer" }, children: "\uD83D\uDDD1\uFE0F" })] })] }, segment.id));
                                }) })) : (_jsx("div", { className: "empty-state", style: { padding: "3rem 1rem" }, children: librarySearch ? "Nenhum público corresponde à sua busca." : "Nenhum publico salvo ainda. Monte um filtro e salve para a equipe reaproveitar." })), selectedLibrarySegment && previewMutation.data && (_jsxs("div", { style: { marginTop: "1.5rem" }, children: [_jsxs("div", { className: "panel", style: { padding: "1.25rem", marginBottom: "1rem" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }, children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", style: { margin: 0 }, children: "Pr\u00E9via do p\u00FAblico" }), _jsx("h3", { style: { margin: "0.25rem 0 0 0" }, children: selectedLibrarySegment.name })] }), _jsx("button", { type: "button", className: "ghost-button", onClick: () => { setActiveTab("builder"); }, style: { padding: "0.4rem 0.85rem", fontSize: "0.85rem", height: "auto", minHeight: "auto", border: "1px solid rgba(37, 99, 235, 0.35)", color: "#2563eb", fontWeight: 600 }, children: "\u270F\uFE0F Editar filtros" })] }), _jsxs("div", { className: "detail-grid segment-summary-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Clientes" }), _jsx("strong", { children: formatNumber(previewMutation.data.summary.totalCustomers) })] }), _jsxs("div", { children: [_jsx("span", { children: "Prioridade media" }), _jsx("strong", { children: Number(previewMutation.data.summary.averagePriorityScore ?? 0).toFixed(1) })] }), _jsxs("div", { children: [_jsx("span", { children: "Faturamento" }), _jsx("strong", { children: formatCurrency(previewMutation.data.summary.potentialRecoveredRevenue ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Media de pecas/pedido" }), _jsx("strong", { children: formatNumber(previewMutation.data.summary.potentialRecoveredPieces ?? 0) })] })] }), _jsxs("div", { className: "detail-grid segment-summary-grid", style: { marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }, children: [_jsx("div", { style: { gridColumn: '1 / -1' }, children: _jsx("span", { style: { fontSize: '0.875rem', fontWeight: 600, color: '#2563eb' }, children: "Potencial mensal se recuperarmos" }) }), _jsxs("div", { children: [_jsx("span", { children: "Faturamento/mes" }), _jsx("strong", { style: { color: '#2563eb' }, children: formatCurrency(previewMutation.data.summary.monthlyPotentialRevenue ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Pecas/mes" }), _jsx("strong", { style: { color: '#2563eb' }, children: formatNumber(previewMutation.data.summary.monthlyPotentialPieces ?? 0) })] })] })] }), selectedCustomerIds.length > 0 && (_jsxs("div", { className: "panel", style: {
                                            background: "linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(29, 78, 216, 0.03) 100%)",
                                            border: "1px solid rgba(37, 99, 235, 0.2)", borderRadius: "12px", padding: "1rem 1.25rem",
                                            marginBottom: "1rem", display: "flex", flexWrap: "wrap", alignItems: "center",
                                            justifyContent: "space-between", gap: "1rem"
                                        }, children: [_jsxs("span", { style: { fontWeight: 600, color: "#2563eb" }, children: [selectedCustomerIds.length, " clientes selecionados"] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }, children: [_jsx("input", { type: "text", value: batchLabelName, onChange: (e) => { setBatchLabelName(e.target.value); setBatchMessage(""); }, placeholder: "Nome do r\u00F3tulo...", style: { padding: "0.5rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", fontSize: "0.9rem", width: "200px" }, onKeyDown: (e) => { if (e.key === "Enter" && batchLabelName.trim())
                                                            bulkLabelMutation.mutate({ customerIds: selectedCustomerIds, labelName: batchLabelName }); } }), _jsx("button", { type: "button", className: "primary-button", disabled: !batchLabelName.trim() || bulkLabelMutation.isPending, onClick: () => bulkLabelMutation.mutate({ customerIds: selectedCustomerIds, labelName: batchLabelName }), style: { padding: "0.5rem 1rem", fontSize: "0.9rem" }, children: bulkLabelMutation.isPending ? "Atribuindo..." : "Atribuir Rótulo" }), batchMessage && _jsx("span", { style: { fontSize: "0.85rem", color: batchMessage.includes("Erro") ? "#dc2626" : "#16a34a" }, children: batchMessage })] })] })), _jsx(CustomerTable, { customers: previewMutation.data.customers, selectable: true, selectedIds: selectedCustomerIds, onSelectedIdsChange: setSelectedCustomerIds })] })), activeSegmentId && previewMutation.isPending && (_jsx("div", { className: "page-loading", style: { marginTop: "2rem" }, children: "Carregando lista de clientes..." }))] }))] }))] }));
}
