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
        parts.push(status === "ACTIVE" ? "Ativos" : status === "ATTENTION" ? "Atenção" : "Inativos");
    }
    if (segment.definition.minDaysInactive !== undefined) {
        parts.push(`${segment.definition.minDaysInactive}+ dias`);
    }
    if (segment.definition.labels?.length) {
        parts.push(`Rótulo: ${segment.definition.labels[0]}`);
    }
    if (segment.definition.customerPrefix) {
        parts.push(`Categoria: ${segment.definition.customerPrefix}`);
    }
    if (segment.definition.state) {
        parts.push(`Estado: ${segment.definition.state}`);
    }
    if (segment.definition.minTotalOrders !== undefined) {
        parts.push(`${segment.definition.minTotalOrders}+ ped.`);
    }
    return parts.length ? parts.join(" | ") : "Filtro dinâmico";
}
function SegmentTags({ segment }) {
    const summaryText = summarizeSegment(segment);
    const tags = summaryText === "Filtro dinâmico" ? [summaryText] : summaryText.split(" | ");
    return (_jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.25rem" }, children: tags.map((tag, idx) => {
            let bg = "rgba(107, 114, 128, 0.05)";
            let border = "rgba(107, 114, 128, 0.12)";
            let text = "var(--muted-color, #6b7280)";
            if (tag.includes("Ativos") || tag.includes("Atenção") || tag.includes("Inativos") || tag.includes("Ativa")) {
                bg = "rgba(37, 99, 235, 0.06)";
                border = "rgba(37, 99, 235, 0.12)";
                text = "#2563eb";
            }
            else if (tag.includes("dias")) {
                bg = "rgba(147, 51, 234, 0.06)";
                border = "rgba(147, 51, 234, 0.12)";
                text = "#9333ea";
            }
            else if (tag.includes("Rótulo")) {
                bg = "rgba(219, 39, 119, 0.06)";
                border = "rgba(219, 39, 119, 0.12)";
                text = "#db2777";
            }
            else if (tag.includes("Categoria")) {
                bg = "rgba(79, 70, 229, 0.06)";
                border = "rgba(79, 70, 229, 0.12)";
                text = "#4f46e5";
            }
            else if (tag.includes("Estado")) {
                bg = "rgba(13, 148, 136, 0.06)";
                border = "rgba(13, 148, 136, 0.12)";
                text = "#0d9488";
            }
            else if (tag.includes("ped.")) {
                bg = "rgba(217, 119, 6, 0.06)";
                border = "rgba(217, 119, 6, 0.12)";
                text = "#d97706";
            }
            return (_jsx("span", { style: {
                    fontSize: "0.68rem", fontWeight: 600,
                    backgroundColor: bg, border: `1px solid ${border}`, color: text,
                    borderRadius: "4px", padding: "0.1rem 0.35rem", whiteSpace: "nowrap"
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
                }, children: [_jsx("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }, children: selectedValues.length === 0 ? placeholder : selectedValues.join(", ") }), _jsx("span", { style: { fontSize: "0.75rem", color: "var(--muted-color)" }, children: "\u25BC" })] }), isOpen && (_jsx("div", { className: "multiselect-dropdown", style: {
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                    background: "var(--panel-background, #fff)", border: "1px solid var(--border-color)",
                    borderRadius: "8px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                    maxHeight: "200px", overflowY: "auto", padding: "0.5rem", marginTop: "0.25rem"
                }, children: options.length === 0 ? (_jsx("div", { style: { padding: "0.5rem", fontSize: "0.875rem", color: "var(--muted-color)", textAlign: "center" }, children: "Nenhum r\u00F3tulo criado" })) : (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: "2px" }, children: options.map((opt) => {
                        const isChecked = selectedValues.includes(opt.name);
                        return (_jsxs("label", { className: `multiselect-option ${isChecked ? "is-checked" : ""}`, style: {
                                display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.4rem 0.5rem",
                                borderRadius: "6px", cursor: "pointer", fontSize: "0.875rem", transition: "background 0.2s"
                            }, children: [_jsx("input", { type: "checkbox", checked: isChecked, onChange: () => handleToggle(opt.name) }), _jsx("span", { children: opt.name })] }, opt.id));
                    }) })) }))] }));
}
export function SegmentsPage() {
    const { token } = useAuth();
    const { tx } = useUiLanguage();
    const queryClient = useQueryClient();
    // State
    const [definition, setDefinition] = useState(() => sanitizeSegmentDefinition(initialDefinition));
    const [segmentName, setSegmentName] = useState("");
    const [activeSegmentId, setActiveSegmentId] = useState(null);
    const [isEditingFilters, setIsEditingFilters] = useState(true); // default to builder mode if no public selected
    const [segmentMessage, setSegmentMessage] = useState("");
    const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
    const [batchLabelName, setBatchLabelName] = useState("");
    const [batchMessage, setBatchMessage] = useState("");
    const [manualCodesText, setManualCodesText] = useState("");
    const [librarySearch, setLibrarySearch] = useState("");
    // Queries & Mutations
    const bulkLabelMutation = useMutation({
        mutationFn: (input) => api.bulkAssignLabelToCustomers(token, input.customerIds, input.labelName),
        onSuccess: () => {
            setBatchMessage("Rótulo atribuído com sucesso!");
            setSelectedCustomerIds([]);
            setBatchLabelName("");
            void queryClient.invalidateQueries({ queryKey: ["customer-labels"] });
            if (previewMutation.data) {
                previewMutation.mutate(definition);
            }
        },
        onError: (err) => {
            setBatchMessage(`Erro: ${err.message}`);
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
            setIsEditingFilters(false); // go to details view
            setSegmentMessage(activeSegmentId ? "Público atualizado com sucesso." : "Público salvo com sucesso.");
            void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
        },
    });
    const duplicateSegmentMutation = useMutation({
        mutationFn: (input) => api.createSavedSegment(token, input),
        onSuccess: (savedSegment) => {
            setActiveSegmentId(savedSegment.id);
            setSegmentName(savedSegment.name);
            setIsEditingFilters(false);
            setSegmentMessage("Público duplicado com sucesso.");
            void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
        },
    });
    const deleteSegmentMutation = useMutation({
        mutationFn: (id) => api.deleteSavedSegment(token, id),
        onSuccess: () => {
            setActiveSegmentId(null);
            setSegmentName("");
            setIsEditingFilters(true);
            setSegmentMessage("Público excluído.");
            void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
        },
    });
    // Action helpers
    function openSavedSegment(segment) {
        const cleanDefinition = sanitizeSegmentDefinition(segment.definition);
        setDefinition(cleanDefinition);
        setSegmentName(segment.name);
        setManualCodesText(cleanDefinition.customerCodes ? cleanDefinition.customerCodes.join(", ") : "");
        setActiveSegmentId(segment.id);
        setIsEditingFilters(false); // Show the metrics and table directly
        setSegmentMessage("");
        setSelectedCustomerIds([]);
        setBatchMessage("");
        previewMutation.mutate(cleanDefinition);
    }
    function handleCreateNew() {
        setActiveSegmentId(null);
        setSegmentName("");
        setDefinition(sanitizeSegmentDefinition(initialDefinition));
        setManualCodesText("");
        setIsEditingFilters(true);
        setSegmentMessage("");
        setSelectedCustomerIds([]);
        setBatchMessage("");
        previewMutation.reset();
    }
    function handleSaveSegment() {
        const cleanedName = segmentName.trim();
        if (!cleanedName) {
            setSegmentMessage("Dê um nome ao público antes de salvar.");
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
    function handleDuplicateSegment(segment) {
        const baseName = segment.name.trim() || "Público";
        duplicateSegmentMutation.mutate({
            name: `${baseName} cópia`,
            definition: segment.definition,
        });
    }
    function handleDeleteSegment(segment) {
        if (confirm(`Deseja realmente excluir o público "${segment.name}"?`)) {
            deleteSegmentMutation.mutate(segment.id);
        }
    }
    const filteredSegments = (savedSegmentsQuery.data ?? []).filter((segment) => segment.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
        summarizeSegment(segment).toLowerCase().includes(librarySearch.toLowerCase()));
    return (_jsxs("div", { className: "page-stack", style: { gap: "1.5rem" }, children: [_jsx("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: _jsxs("div", { children: [_jsx("p", { className: "eyebrow", style: { margin: 0 }, children: "Segmenta\u00E7\u00E3o Inteligente" }), _jsx("h2", { className: "premium-header-title", style: { margin: "0.25rem 0 0 0" }, children: "Monte um publico acionavel" })] }) }), _jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "330px 1fr",
                    gap: "1.5rem",
                    alignItems: "start"
                }, children: [_jsxs("aside", { className: "panel", style: {
                            padding: "1.25rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "1rem",
                            maxHeight: "calc(100vh - 180px)",
                            position: "sticky",
                            top: "1.5rem",
                            overflow: "hidden"
                        }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [_jsx("h3", { style: { margin: 0, fontSize: "1.1rem", fontWeight: 700 }, children: "P\u00FAblicos Salvos" }), _jsx("button", { type: "button", className: "primary-button", onClick: handleCreateNew, style: { padding: "0.35rem 0.75rem", fontSize: "0.8rem", minHeight: "auto", height: "auto" }, children: "+ Novo" })] }), _jsx("input", { type: "text", placeholder: "\uD83D\uDD0D Buscar p\u00FAblico...", value: librarySearch, onChange: (e) => setLibrarySearch(e.target.value), style: {
                                    padding: "0.5rem 0.75rem",
                                    borderRadius: "8px",
                                    border: "1px solid var(--border-color)",
                                    fontSize: "0.85rem",
                                    background: "var(--background)",
                                    color: "var(--foreground)",
                                    outline: "none"
                                } }), _jsxs("div", { style: {
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.5rem",
                                    overflowY: "auto",
                                    flex: 1,
                                    paddingRight: "4px"
                                }, className: "custom-thin-scrollbar", children: [savedSegmentsQuery.isLoading && _jsx("div", { style: { fontSize: "0.85rem", color: "var(--muted-color)", padding: "1rem 0" }, children: "Carregando p\u00FAblicos..." }), !savedSegmentsQuery.isLoading && filteredSegments.length === 0 && (_jsx("div", { style: {
                                            textAlign: "center",
                                            padding: "2rem 1rem",
                                            color: "var(--muted-color)",
                                            fontSize: "0.85rem",
                                            border: "1px dashed var(--border-color)",
                                            borderRadius: "8px"
                                        }, children: "Nenhum p\u00FAblico encontrado." })), !savedSegmentsQuery.isLoading && filteredSegments.map((segment) => {
                                        const isSelected = segment.id === activeSegmentId;
                                        return (_jsxs("div", { onClick: () => openSavedSegment(segment), style: {
                                                display: "flex",
                                                flexDirection: "column",
                                                padding: "0.85rem",
                                                borderRadius: "10px",
                                                cursor: "pointer",
                                                border: isSelected ? "2px solid #2563eb" : "1px solid var(--border-color)",
                                                background: isSelected ? "rgba(37, 99, 235, 0.03)" : "var(--panel-background, #fff)",
                                                transition: "all 0.15s ease",
                                                boxShadow: isSelected ? "0 4px 6px -1px rgba(37, 99, 235, 0.05)" : "none"
                                            }, className: "saved-audience-sidebar-item", children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }, children: [_jsx("span", { style: {
                                                                fontWeight: 700,
                                                                fontSize: "0.88rem",
                                                                color: isSelected ? "#2563eb" : "var(--foreground)",
                                                                overflow: "hidden",
                                                                textOverflow: "ellipsis",
                                                                whiteSpace: "nowrap"
                                                            }, children: segment.name }), _jsxs("div", { style: { display: "flex", gap: "0.25rem", flexShrink: 0 }, children: [_jsx("button", { title: "Duplicar", onClick: (e) => { e.stopPropagation(); handleDuplicateSegment(segment); }, style: { background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", padding: "0 2px" }, children: "\uD83D\uDCC2" }), _jsx("button", { title: "Excluir", onClick: (e) => { e.stopPropagation(); handleDeleteSegment(segment); }, style: { background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", padding: "0 2px" }, children: "\uD83D\uDDD1\uFE0F" })] })] }), _jsx(SegmentTags, { segment: segment })] }, segment.id));
                                    })] })] }), _jsx("main", { style: { minWidth: 0, display: "flex", flexDirection: "column", gap: "1.5rem" }, children: isEditingFilters ? (_jsxs("div", { className: "panel", style: { padding: "1.5rem" }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }, children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", style: { margin: 0 }, children: "Filtros & Crit\u00E9rios" }), _jsx("h3", { style: { margin: 0 }, children: activeSegmentId ? `Editando Filtros de: ${segmentName}` : "Criar Novo Público" })] }), activeSegmentId && (_jsx("button", { type: "button", className: "ghost-button", onClick: () => setIsEditingFilters(false), style: { padding: "0.4rem 0.85rem", fontSize: "0.85rem", height: "auto", minHeight: "auto" }, children: "\u2B05\uFE0F Cancelar / Voltar" }))] }), _jsxs("form", { onSubmit: handleSubmit, style: { display: "flex", flexDirection: "column", gap: "1.5rem" }, children: [_jsxs("div", { className: "filters-grid filters-grid-four segment-filters-grid", children: [_jsxs("label", { className: "full-span", children: ["Nome do p\u00FAblico", _jsx("input", { type: "text", value: segmentName, onChange: (event) => { setSegmentName(event.target.value); setSegmentMessage(""); }, placeholder: "Ex: Reativacao premium do mes", required: true })] }), _jsxs("label", { className: "segment-filter-half", children: ["Status", _jsxs("select", { value: definition.status?.[0] ?? "", onChange: (event) => setDefinition((current) => ({
                                                                ...current,
                                                                status: event.target.value ? [event.target.value] : undefined
                                                            })), children: [_jsx("option", { value: "", children: "Todos" }), _jsx("option", { value: "ACTIVE", children: "Ativos" }), _jsx("option", { value: "ATTENTION", children: "Aten\u00E7\u00E3o" }), _jsx("option", { value: "INACTIVE", children: "Inativos" })] })] }), _jsxs("div", { className: "segment-filter-half", children: [_jsx("label", { children: tx("Categoria do cliente", "Customer category") }), _jsx("div", { className: "customers-view-switcher", role: "tablist", children: [
                                                                { value: undefined, label: tx("Todas", "All") },
                                                                { value: "CL", label: "CL" },
                                                                { value: "KH", label: "KH" },
                                                                { value: "LJ", label: "LJ" }
                                                            ].map((option) => (_jsx("button", { type: "button", role: "tab", "aria-selected": definition.customerPrefix === option.value, className: `chart-switch-button ${definition.customerPrefix === option.value ? "active" : ""}`, onClick: () => setDefinition((current) => ({ ...current, customerPrefix: option.value })), children: _jsx("strong", { children: option.label }) }, option.label))) })] }), _jsxs("label", { className: "segment-filter-half", children: ["M\u00EDnimo de dias inativo", _jsx("input", { type: "number", value: definition.minDaysInactive ?? "", onChange: (event) => setDefinition((current) => ({
                                                                ...current,
                                                                minDaysInactive: event.target.value ? Number(event.target.value) : undefined
                                                            })) })] }), _jsxs("label", { className: "segment-filter-half", children: ["Ticket m\u00E9dio m\u00EDnimo (R$)", _jsx("input", { type: "number", value: definition.minAvgTicket ?? "", onChange: (event) => setDefinition((current) => ({
                                                                ...current,
                                                                minAvgTicket: event.target.value ? Number(event.target.value) : undefined
                                                            })) })] }), _jsxs("label", { className: "segment-filter-half", children: ["Total gasto m\u00EDnimo (R$)", _jsx("input", { type: "number", value: definition.minTotalSpent ?? "", onChange: (event) => setDefinition((current) => ({
                                                                ...current,
                                                                minTotalSpent: event.target.value ? Number(event.target.value) : undefined
                                                            })) })] }), _jsxs("label", { className: "segment-filter-half", children: ["Estado (UF)", _jsxs("select", { value: definition.state ?? "", onChange: (event) => setDefinition((current) => ({
                                                                ...current,
                                                                state: event.target.value || undefined
                                                            })), children: [_jsx("option", { value: "", children: "Todos os estados" }), _jsx("option", { value: "AC", children: "Acre (AC)" }), _jsx("option", { value: "AL", children: "Alagoas (AL)" }), _jsx("option", { value: "AP", children: "Amap\u00E1 (AP)" }), _jsx("option", { value: "AM", children: "Amazonas (AM)" }), _jsx("option", { value: "BA", children: "Bahia (BA)" }), _jsx("option", { value: "CE", children: "Cear\u00E1 (CE)" }), _jsx("option", { value: "DF", children: "Distrito Federal (DF)" }), _jsx("option", { value: "ES", children: "Esp\u00EDrito Santo (ES)" }), _jsx("option", { value: "GO", children: "Goi\u00E1s (GO)" }), _jsx("option", { value: "MA", children: "Maranh\u00E3o (MA)" }), _jsx("option", { value: "MT", children: "Mato Grosso (MT)" }), _jsx("option", { value: "MS", children: "Mato Grosso do Sul (MS)" }), _jsx("option", { value: "MG", children: "Minas Gerais (MG)" }), _jsx("option", { value: "PA", children: "Par\u00E1 (PA)" }), _jsx("option", { value: "PB", children: "Para\u00EDba (PB)" }), _jsx("option", { value: "PR", children: "Paran\u00E1 (PR)" }), _jsx("option", { value: "PE", children: "Pernambuco (PE)" }), _jsx("option", { value: "PI", children: "Piau\u00ED (PI)" }), _jsx("option", { value: "RJ", children: "Rio de Janeiro (RJ)" }), _jsx("option", { value: "RN", children: "Rio Grande do Norte (RN)" }), _jsx("option", { value: "RS", children: "Rio Grande do Sul (RS)" }), _jsx("option", { value: "RO", children: "Rond\u00F4nia (RO)" }), _jsx("option", { value: "RR", children: "Roraima (RR)" }), _jsx("option", { value: "SC", children: "Santa Catarina (SC)" }), _jsx("option", { value: "SP", children: "S\u00E3o Paulo (SP)" }), _jsx("option", { value: "SE", children: "Sergipe (SE)" }), _jsx("option", { value: "TO", children: "Tocantins (TO)" })] })] }), _jsxs("label", { className: "segment-filter-half", children: ["Pedidos m\u00EDnimos", _jsx("input", { type: "number", min: 0, placeholder: "Ex: 5", value: definition.minTotalOrders ?? "", onChange: (event) => setDefinition((current) => ({
                                                                ...current,
                                                                minTotalOrders: event.target.value ? Number(event.target.value) : undefined
                                                            })) })] }), _jsxs("label", { className: "full-span", children: ["Incluir clientes manualmente por c\u00F3digo (opcional)", _jsx("span", { style: { fontSize: "0.75rem", color: "var(--muted-color)", display: "block", marginBottom: "0.25rem", fontWeight: 400 }, children: "Cole os c\u00F3digos separados por v\u00EDrgula ou espa\u00E7o (ex: CL1200, KH9321)." }), _jsx("textarea", { placeholder: "Cole c\u00F3digos manuais de clientes...", style: { minHeight: "65px", resize: "vertical" }, value: manualCodesText, onChange: (event) => {
                                                                const val = event.target.value;
                                                                setManualCodesText(val);
                                                                const codes = val.split(/[\s,]+/).map((c) => c.trim()).filter(Boolean);
                                                                setDefinition((current) => ({ ...current, customerCodes: codes.length ? codes : undefined }));
                                                            } })] }), _jsx(LabelMultiSelect, { label: "Com r\u00F3tulo", options: labelsQuery.data ?? [], selectedValues: definition.labels ?? [], onChange: (newValues) => setDefinition((current) => ({ ...current, labels: newValues.length ? newValues : undefined })), placeholder: "Todos" }), _jsx(LabelMultiSelect, { label: "Ocultar com r\u00F3tulo", options: labelsQuery.data ?? [], selectedValues: definition.excludeLabels ?? [], onChange: (newValues) => setDefinition((current) => ({ ...current, excludeLabels: newValues.length ? newValues : undefined })), placeholder: "Nenhum" })] }), _jsxs("div", { style: {
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                borderTop: "1px solid var(--border-color)",
                                                paddingTop: "1rem",
                                                flexWrap: "wrap",
                                                gap: "1rem"
                                            }, children: [_jsxs("div", { style: { display: "flex", gap: "0.75rem" }, children: [_jsx("button", { className: "primary-button", type: "submit", style: { padding: "0.6rem 1.25rem" }, children: "Pre-visualizar segmento" }), _jsx("button", { className: "ghost-button", type: "button", onClick: handleSaveSegment, disabled: saveSegmentMutation.isPending, children: saveSegmentMutation.isPending ? "Salvando..." : activeSegmentId ? "Salvar Alterações" : "Salvar Público" })] }), segmentMessage && _jsx("span", { className: "save-ok", style: { fontWeight: 600 }, children: segmentMessage })] })] }), previewMutation.data ? (_jsxs("div", { style: { marginTop: "2rem", borderTop: "2px dashed var(--border-color)", paddingTop: "1.5rem" }, children: [_jsx("h4", { style: { marginBottom: "1rem" }, children: "Previa do Resultado Estimado" }), _jsxs("div", { className: "detail-grid segment-summary-grid", children: [_jsxs("div", { children: [_jsx("span", { children: "Clientes" }), _jsx("strong", { children: formatNumber(previewMutation.data.summary.totalCustomers) })] }), _jsxs("div", { children: [_jsx("span", { children: "Prioridade m\u00E9dia" }), _jsx("strong", { children: Number(previewMutation.data.summary.averagePriorityScore ?? 0).toFixed(1) })] }), _jsxs("div", { children: [_jsx("span", { children: "Faturamento" }), _jsx("strong", { children: formatCurrency(previewMutation.data.summary.potentialRecoveredRevenue ?? 0) })] }), _jsxs("div", { children: [_jsx("span", { children: "Recupera\u00E7\u00E3o estimada" }), _jsxs("strong", { children: [formatNumber(previewMutation.data.summary.potentialRecoveredPieces ?? 0), " pe\u00E7as"] })] })] }), _jsx("div", { style: { marginTop: "1rem" }, children: _jsx(CustomerTable, { customers: previewMutation.data.customers, selectable: false, selectedIds: [], onSelectedIdsChange: () => { } }) })] })) : (previewMutation.isPending && _jsx("div", { className: "page-loading", style: { marginTop: "2rem" }, children: "Gerando pr\u00E9via..." }))] })) : (
                        /* STATE B: Premium Dashboard Viewer Mode */
                        _jsx(_Fragment, { children: activeSegmentId && (_jsxs("div", { className: "panel", style: { padding: "1.5rem" }, children: [_jsxs("div", { style: {
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "flex-start",
                                            borderBottom: "1px solid var(--border-color)",
                                            paddingBottom: "1.25rem",
                                            marginBottom: "1.25rem",
                                            flexWrap: "wrap",
                                            gap: "1rem"
                                        }, children: [_jsxs("div", { children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }, children: [_jsx("h3", { style: { margin: 0, fontSize: "1.4rem", fontWeight: 800 }, children: segmentName }), _jsxs("span", { style: {
                                                                    fontSize: "0.72rem",
                                                                    background: "rgba(37, 99, 235, 0.08)",
                                                                    border: "1px solid rgba(37, 99, 235, 0.2)",
                                                                    color: "#2563eb",
                                                                    padding: "0.15rem 0.5rem",
                                                                    borderRadius: "999px",
                                                                    fontWeight: 700,
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    gap: "0.3rem"
                                                                }, children: [_jsx("span", { style: { width: "6px", height: "6px", backgroundColor: "#2563eb", borderRadius: "50%" } }), "Ativo"] })] }), _jsxs("div", { style: { marginTop: "0.5rem" }, children: [_jsx("span", { style: { fontSize: "0.85rem", color: "var(--muted-color)", marginRight: "0.5rem" }, children: "Crit\u00E9rios do Filtro:" }), _jsx(SegmentTags, { segment: (savedSegmentsQuery.data ?? []).find(s => s.id === activeSegmentId) })] })] }), _jsxs("div", { style: { display: "flex", gap: "0.5rem" }, children: [_jsx("button", { type: "button", className: "ghost-button", onClick: () => setIsEditingFilters(true), style: { padding: "0.5rem 1rem", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.25rem" }, children: "\u270F\uFE0F Editar Filtros" }), _jsx("button", { type: "button", className: "ghost-button", onClick: () => {
                                                            const item = (savedSegmentsQuery.data ?? []).find(s => s.id === activeSegmentId);
                                                            if (item)
                                                                handleDuplicateSegment(item);
                                                        }, style: { padding: "0.5rem 1rem", fontSize: "0.9rem" }, children: "\uD83D\uDCC2 Duplicar" }), _jsx("button", { type: "button", className: "ghost-button danger", onClick: () => {
                                                            const item = (savedSegmentsQuery.data ?? []).find(s => s.id === activeSegmentId);
                                                            if (item)
                                                                handleDeleteSegment(item);
                                                        }, style: { padding: "0.5rem 1rem", fontSize: "0.9rem" }, children: "\uD83D\uDDD1\uFE0F Excluir" })] })] }), previewMutation.data ? (_jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "1.5rem" }, children: [_jsxs("div", { className: "detail-grid segment-summary-grid", style: { gap: "1rem" }, children: [_jsxs("div", { style: { background: "rgba(37, 99, 235, 0.02)", padding: "1.25rem", borderRadius: "12px", border: "1px solid rgba(37, 99, 235, 0.05)" }, children: [_jsx("span", { style: { fontSize: "0.8rem", color: "var(--muted-color)" }, children: "Clientes Totais" }), _jsx("strong", { style: { fontSize: "1.8rem", color: "#2563eb", marginTop: "0.25rem", display: "block" }, children: formatNumber(previewMutation.data.summary.totalCustomers) })] }), _jsxs("div", { style: { background: "rgba(13, 148, 136, 0.02)", padding: "1.25rem", borderRadius: "12px", border: "1px solid rgba(13, 148, 136, 0.05)" }, children: [_jsx("span", { style: { fontSize: "0.8rem", color: "var(--muted-color)" }, children: "Prioridade M\u00E9dia" }), _jsx("strong", { style: { fontSize: "1.8rem", color: "#0d9488", marginTop: "0.25rem", display: "block" }, children: Number(previewMutation.data.summary.averagePriorityScore ?? 0).toFixed(1) })] }), _jsxs("div", { style: { background: "rgba(147, 51, 234, 0.02)", padding: "1.25rem", borderRadius: "12px", border: "1px solid rgba(147, 51, 234, 0.05)" }, children: [_jsx("span", { style: { fontSize: "0.8rem", color: "var(--muted-color)" }, children: "Faturamento Hist\u00F3rico" }), _jsx("strong", { style: { fontSize: "1.8rem", color: "#9333ea", marginTop: "0.25rem", display: "block" }, children: formatCurrency(previewMutation.data.summary.potentialRecoveredRevenue ?? 0) })] }), _jsxs("div", { style: { background: "rgba(217, 119, 6, 0.02)", padding: "1.25rem", borderRadius: "12px", border: "1px solid rgba(217, 119, 6, 0.05)" }, children: [_jsx("span", { style: { fontSize: "0.8rem", color: "var(--muted-color)" }, children: "Est. Pe\u00E7as Recuperadas" }), _jsx("strong", { style: { fontSize: "1.8rem", color: "#d97706", marginTop: "0.25rem", display: "block" }, children: formatNumber(previewMutation.data.summary.potentialRecoveredPieces ?? 0) })] })] }), _jsxs("div", { style: {
                                                    background: "var(--background)",
                                                    border: "1px solid var(--border-color)",
                                                    borderRadius: "10px",
                                                    padding: "1rem",
                                                    display: "flex",
                                                    justifyContent: "space-around",
                                                    flexWrap: "wrap",
                                                    gap: "1rem"
                                                }, children: [_jsxs("div", { style: { textAlign: "center" }, children: [_jsx("span", { style: { fontSize: "0.8rem", color: "var(--muted-color)" }, children: "Faturamento Estimado Mensal" }), _jsx("strong", { style: { display: "block", fontSize: "1.15rem", color: "#2563eb", marginTop: "0.15rem" }, children: formatCurrency(previewMutation.data.summary.monthlyPotentialRevenue ?? 0) })] }), _jsx("div", { style: { borderLeft: "1px solid var(--border-color)" } }), _jsxs("div", { style: { textAlign: "center" }, children: [_jsx("span", { style: { fontSize: "0.8rem", color: "var(--muted-color)" }, children: "Volume Estimado Mensal" }), _jsxs("strong", { style: { display: "block", fontSize: "1.15rem", color: "#2563eb", marginTop: "0.15rem" }, children: [formatNumber(previewMutation.data.summary.monthlyPotentialPieces ?? 0), " pe\u00E7as"] })] })] }), selectedCustomerIds.length > 0 && (_jsxs("div", { className: "panel", style: {
                                                    background: "linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(29, 78, 216, 0.03) 100%)",
                                                    border: "1px solid rgba(37, 99, 235, 0.2)", borderRadius: "12px", padding: "1.25rem",
                                                    display: "flex", flexWrap: "wrap", alignItems: "center",
                                                    justifyContent: "space-between", gap: "1.5rem",
                                                    boxShadow: "0 4px 20px -2px rgba(37, 99, 235, 0.1)"
                                                }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.75rem" }, children: [_jsx("div", { style: {
                                                                    width: "36px", height: "36px", borderRadius: "50%",
                                                                    backgroundColor: "rgba(37, 99, 235, 0.15)", display: "flex",
                                                                    alignItems: "center", justifyContent: "center", fontSize: "0.95rem",
                                                                    fontWeight: 700, color: "#2563eb"
                                                                }, children: selectedCustomerIds.length }), _jsxs("div", { children: [_jsx("h4", { style: { margin: 0, fontSize: "1rem", fontWeight: 600 }, children: "Clientes selecionados" }), _jsx("p", { className: "panel-subcopy", style: { margin: 0, fontSize: "0.78rem" }, children: "Atribua um r\u00F3tulo em lote." })] })] }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }, children: [_jsx("input", { type: "text", value: batchLabelName, onChange: (e) => { setBatchLabelName(e.target.value); setBatchMessage(""); }, placeholder: "Nome do r\u00F3tulo...", style: { padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--border-color)", fontSize: "0.85rem", width: "180px", background: "var(--background)", color: "var(--foreground)" }, onKeyDown: (e) => { if (e.key === "Enter" && batchLabelName.trim())
                                                                    bulkLabelMutation.mutate({ customerIds: selectedCustomerIds, labelName: batchLabelName }); } }), _jsx("button", { type: "button", className: "primary-button", disabled: !batchLabelName.trim() || bulkLabelMutation.isPending, onClick: () => bulkLabelMutation.mutate({ customerIds: selectedCustomerIds, labelName: batchLabelName }), style: { padding: "0.5rem 1rem", fontSize: "0.85rem", height: "auto", minHeight: "auto" }, children: bulkLabelMutation.isPending ? "Atribuindo..." : "Atribuir Rótulo" }), batchMessage && (_jsx("span", { style: { fontSize: "0.85rem", fontWeight: 600, color: batchMessage.includes("Erro") ? "#dc2626" : "#16a34a" }, children: batchMessage }))] })] })), _jsxs("div", { children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }, children: [_jsx("h4", { style: { margin: 0 }, children: "Membros do P\u00FAblico" }), _jsx("span", { style: { fontSize: "0.8rem", color: "var(--muted-color)" }, children: "Selecione itens na tabela para a\u00E7\u00F5es em lote" })] }), _jsx(CustomerTable, { customers: previewMutation.data.customers, selectable: true, selectedIds: selectedCustomerIds, onSelectedIdsChange: setSelectedCustomerIds })] })] })) : (previewMutation.isPending ? (_jsx("div", { className: "page-loading", style: { padding: "3rem 0" }, children: "Carregando lista de clientes..." })) : (_jsx("div", { style: { textAlign: "center", padding: "3rem 1rem", color: "var(--muted-color)" }, children: "Clique no p\u00FAblico na barra lateral para carregar seus dados." })))] })) })) })] })] }));
}
