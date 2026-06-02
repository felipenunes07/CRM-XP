import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SavedSegment, SegmentDefinition, CustomerListItem } from "@olist-crm/shared";
import { CustomerTable } from "../components/CustomerTable";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/format";
import { useUiLanguage } from "../i18n";

const initialDefinition: SegmentDefinition = {
  status: ["INACTIVE"],
  minDaysInactive: 90,
  minTotalSpent: 0,
};

function sanitizeSegmentDefinition(definition: SegmentDefinition): SegmentDefinition {
  const { frequencyDropRatio: _frequencyDropRatio, ...cleanDefinition } = definition;
  return cleanDefinition;
}

function summarizeSegment(segment: SavedSegment) {
  const parts: string[] = [];

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

function SegmentTags({ segment }: { segment: SavedSegment }) {
  const summaryText = summarizeSegment(segment);
  const tags = summaryText === "Filtro dinamico salvo" ? [summaryText] : summaryText.split(" | ");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
      {tags.map((tag, idx) => {
        let bg = "rgba(107, 114, 128, 0.08)";
        let border = "rgba(107, 114, 128, 0.15)";
        let text = "var(--muted-color, #6b7280)";

        if (tag.includes("Ativos") || tag.includes("Atencao") || tag.includes("Inativos") || tag.includes("Ativa")) {
          bg = "rgba(37, 99, 235, 0.08)"; border = "rgba(37, 99, 235, 0.15)"; text = "#2563eb";
        } else if (tag.includes("dias")) {
          bg = "rgba(147, 51, 234, 0.08)"; border = "rgba(147, 51, 234, 0.15)"; text = "#9333ea";
        } else if (tag.includes("Rotulo")) {
          bg = "rgba(219, 39, 119, 0.08)"; border = "rgba(219, 39, 119, 0.15)"; text = "#db2777";
        } else if (tag.includes("Categoria")) {
          bg = "rgba(79, 70, 229, 0.08)"; border = "rgba(79, 70, 229, 0.15)"; text = "#4f46e5";
        } else if (tag.includes("Estado")) {
          bg = "rgba(13, 148, 136, 0.08)"; border = "rgba(13, 148, 136, 0.15)"; text = "#0d9488";
        } else if (tag.includes("pedidos")) {
          bg = "rgba(217, 119, 6, 0.08)"; border = "rgba(217, 119, 6, 0.15)"; text = "#d97706";
        }

        return (
          <span key={idx} style={{
            fontSize: "0.72rem", fontWeight: 600,
            backgroundColor: bg, border: `1px solid ${border}`, color: text,
            borderRadius: "6px", padding: "0.15rem 0.45rem", whiteSpace: "nowrap"
          }}>
            {tag}
          </span>
        );
      })}
    </div>
  );
}

interface LabelOption { id: string; name: string; }

function LabelMultiSelect({
  label, options, selectedValues, onChange, placeholder,
}: {
  label: string; options: LabelOption[]; selectedValues: string[];
  onChange: (values: string[]) => void; placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  return (
    <div className="segment-filter-half" style={{ position: "relative" }} ref={containerRef}>
      <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--foreground)" }}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", padding: "0.75rem 1rem", borderRadius: "8px",
          border: "1px solid var(--border-color)", background: "var(--background)",
          color: "var(--foreground)", fontSize: "0.95rem", cursor: "pointer",
          textAlign: "left", outline: "none", minHeight: "42px"
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>
          {selectedValues.length === 0 ? placeholder : selectedValues.join(", ")}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--muted-color)" }}>▼</span>
      </button>
      {isOpen && (
        <div className="multiselect-dropdown">
          {options.length === 0 ? (
            <div style={{ padding: "0.5rem", fontSize: "0.875rem", color: "var(--muted-color)", textAlign: "center" }}>
              Nenhum rótulo criado
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {options.map((opt) => {
                const isChecked = selectedValues.includes(opt.name);
                return (
                  <label key={opt.id} className={`multiselect-option ${isChecked ? "is-checked" : ""}`}>
                    <input type="checkbox" checked={isChecked} onChange={() => handleToggle(opt.name)} />
                    <span>{opt.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SegmentsPage() {
  const { token } = useAuth();
  const { tx } = useUiLanguage();
  const queryClient = useQueryClient();
  const [definition, setDefinition] = useState<SegmentDefinition>(() => sanitizeSegmentDefinition(initialDefinition));
  const [segmentName, setSegmentName] = useState("");
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [segmentMessage, setSegmentMessage] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [batchLabelName, setBatchLabelName] = useState("");
  const [batchMessage, setBatchMessage] = useState("");
  const [manualCodesText, setManualCodesText] = useState("");
  const [activeTab, setActiveTab] = useState<"builder" | "library">("builder");
  const [librarySearch, setLibrarySearch] = useState("");

  // States for interactive manual client selection
  const [manualMode, setManualMode] = useState<"search" | "paste">("search");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<CustomerListItem[]>([]);
  const [isSearchingClients, setIsSearchingClients] = useState(false);
  const [displayNamesMap, setDisplayNamesMap] = useState<Record<string, string>>({});

  const bulkLabelMutation = useMutation({
    mutationFn: (input: { customerIds: string[]; labelName: string }) =>
      api.bulkAssignLabelToCustomers(token!, input.customerIds, input.labelName),
    onSuccess: () => {
      setBatchMessage("Rótulo atribuído com sucesso para todos os selecionados!");
      setSelectedCustomerIds([]);
      setBatchLabelName("");
      void queryClient.invalidateQueries({ queryKey: ["customer-labels"] });
      if (previewMutation.data) {
        previewMutation.mutate(definition);
      }
    },
    onError: (err: any) => {
      setBatchMessage(`Erro ao atribuir rótulo: ${err.message}`);
    }
  });

  const labelsQuery = useQuery({
    queryKey: ["customer-labels"],
    queryFn: () => api.customerLabels(token!),
    enabled: Boolean(token),
  });

  const savedSegmentsQuery = useQuery({
    queryKey: ["saved-segments"],
    queryFn: () => api.savedSegments(token!),
    enabled: Boolean(token),
  });

  const previewMutation = useMutation({
    mutationFn: (input: SegmentDefinition) => api.previewSegment(token!, input),
  });

  const saveSegmentMutation = useMutation({
    mutationFn: (input: { name: string; definition: SegmentDefinition }) =>
      activeSegmentId ? api.updateSavedSegment(token!, activeSegmentId, input) : api.createSavedSegment(token!, input),
    onSuccess: (savedSegment) => {
      setActiveSegmentId(savedSegment.id);
      setSegmentName(savedSegment.name);
      setSegmentMessage(activeSegmentId ? "Publico atualizado com sucesso." : "Publico salvo com sucesso.");
      void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
    },
  });

  const duplicateSegmentMutation = useMutation({
    mutationFn: (input: { name: string; definition: SegmentDefinition }) => api.createSavedSegment(token!, input),
    onSuccess: (savedSegment) => {
      setActiveSegmentId(savedSegment.id);
      setSegmentName(savedSegment.name);
      setSegmentMessage("Publico duplicado com sucesso.");
      void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
    },
  });

  const deleteSegmentMutation = useMutation({
    mutationFn: (id: string) => api.deleteSavedSegment(token!, id),
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
      api.customers(token!, { search: trimmed, limit: 10 })
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
    if (!codes || codes.length === 0) return;

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

  const handleAddManualCode = (cust: CustomerListItem) => {
    if (!cust.customerCode) return;
    const code = cust.customerCode.trim().toUpperCase();
    
    // Add to displayNamesMap
    setDisplayNamesMap(current => ({ ...current, [code]: cust.displayName }));

    setDefinition((current) => {
      const existing = current.customerCodes ?? [];
      if (existing.includes(code)) return current;
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

  const handleRemoveManualCode = (codeToRemove: string) => {
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
  function openSavedSegment(segment: SavedSegment) {
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

  function handleSubmit(event: FormEvent) {
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
    if (!activeSegmentId) return;
    deleteSegmentMutation.mutate(activeSegmentId);
  }

  const filteredSegments = (savedSegmentsQuery.data ?? []).filter((segment) =>
    segment.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
    summarizeSegment(segment).toLowerCase().includes(librarySearch.toLowerCase())
  );

  // Find the currently selected segment object for the library view
  const selectedLibrarySegment = activeTab === "library" && activeSegmentId
    ? (savedSegmentsQuery.data ?? []).find((s) => s.id === activeSegmentId)
    : null;

  return (
    <div className="page-stack">
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: "1rem", marginBottom: "1rem",
        borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem"
      }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Segmentacao inteligente</p>
          <h2 className="premium-header-title" style={{ margin: "0.25rem 0 0 0" }}>Monte um publico acionavel</h2>
        </div>
        <div className="customers-view-switcher" role="tablist" style={{ margin: 0, padding: "0.25rem" }}>
          <button
            type="button" role="tab" aria-selected={activeTab === "builder"}
            className={`chart-switch-button ${activeTab === "builder" ? "active" : ""}`}
            onClick={() => setActiveTab("builder")}
            style={{ padding: "0.5rem 1.25rem", borderRadius: "14px" }}
          >
            <strong>✏️ Criar Público</strong>
          </button>
          <button
            type="button" role="tab" aria-selected={activeTab === "library"}
            className={`chart-switch-button ${activeTab === "library" ? "active" : ""}`}
            onClick={() => { setActiveTab("library"); setLibrarySearch(""); }}
            style={{ padding: "0.5rem 1.25rem", borderRadius: "14px" }}
          >
            <strong>📚 Publicos Salvos ({savedSegmentsQuery.data?.length ?? 0})</strong>
          </button>
        </div>
      </div>

      {/* ═══════════ BUILDER TAB ═══════════ */}
      {activeTab === "builder" ? (
        <>
          {/* Active Editing Indicator */}
          {activeSegmentId && (
            <div style={{
              background: "rgba(37, 99, 235, 0.04)", border: "1px solid rgba(37, 99, 235, 0.15)",
              borderRadius: "12px", padding: "1rem 1.25rem", marginBottom: "1.25rem",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              flexWrap: "wrap", gap: "1rem"
            }}>
              <span style={{ fontSize: "0.95rem", color: "#2563eb", fontWeight: 600 }}>
                ✏️ Editando: <strong style={{ color: "var(--foreground)" }}>{segmentName}</strong>
              </span>
              <button type="button" className="ghost-button" onClick={() => {
                setActiveSegmentId(null); setSegmentName("");
                setDefinition(sanitizeSegmentDefinition(initialDefinition)); setManualCodesText("");
              }} style={{
                padding: "0.4rem 0.85rem", fontSize: "0.85rem", height: "auto", minHeight: "auto",
                border: "1px solid rgba(37, 99, 235, 0.35)", color: "#2563eb", fontWeight: 600
              }}>
                ➕ Criar como Novo
              </button>
            </div>
          )}

          <section className="grid-two">
            <form className="panel" onSubmit={handleSubmit}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Defina as Regras</p>
                  <h3>Filtros do Público</h3>
                </div>
              </div>

              <div className="filters-grid filters-grid-four segment-filters-grid">
                <label className="full-span">
                  Nome do publico
                  <input type="text" value={segmentName} onChange={(event) => { setSegmentName(event.target.value); setSegmentMessage(""); }} placeholder="Ex: Reativacao premium do mes" />
                </label>

                <label className="segment-filter-half">
                  Status
                  <select value={definition.status?.[0] ?? ""} onChange={(event) => setDefinition((current) => ({ ...current, status: event.target.value ? [event.target.value as "ACTIVE" | "ATTENTION" | "INACTIVE"] : undefined }))}>
                    <option value="">Todos</option>
                    <option value="ACTIVE">Ativos</option>
                    <option value="ATTENTION">Atencao</option>
                    <option value="INACTIVE">Inativos</option>
                  </select>
                </label>

                <div className="segment-filter-half">
                  <label>{tx("Categoria do cliente", "Customer category")}</label>
                  <div className="customers-view-switcher" role="tablist">
                    {[
                      { value: undefined, label: tx("Todas", "All") },
                      { value: "CL", label: "CL" },
                      { value: "KH", label: "KH" },
                      { value: "LJ", label: "LJ" }
                    ].map((option) => (
                      <button key={option.label} type="button" role="tab" aria-selected={definition.customerPrefix === option.value}
                        className={`chart-switch-button ${definition.customerPrefix === option.value ? "active" : ""}`}
                        onClick={() => setDefinition((current) => ({ ...current, customerPrefix: option.value }))}>
                        <strong>{option.label}</strong>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="segment-filter-half">
                  Minimo de dias inativo
                  <input type="number" value={definition.minDaysInactive ?? ""} onChange={(event) => setDefinition((current) => ({ ...current, minDaysInactive: event.target.value ? Number(event.target.value) : undefined }))} />
                </label>

                <label className="segment-filter-half">
                  Ticket minimo
                  <input type="number" value={definition.minAvgTicket ?? ""} onChange={(event) => setDefinition((current) => ({ ...current, minAvgTicket: event.target.value ? Number(event.target.value) : undefined }))} />
                </label>

                <label className="segment-filter-half">
                  Total gasto minimo
                  <input type="number" value={definition.minTotalSpent ?? ""} onChange={(event) => setDefinition((current) => ({ ...current, minTotalSpent: event.target.value ? Number(event.target.value) : undefined }))} />
                </label>

                <label className="segment-filter-half">
                  Estado (UF)
                  <select value={definition.state ?? ""} onChange={(event) => setDefinition((current) => ({ ...current, state: event.target.value || undefined }))}>
                    <option value="">Todos os estados</option>
                    <option value="AC">Acre (AC)</option><option value="AL">Alagoas (AL)</option><option value="AP">Amapá (AP)</option>
                    <option value="AM">Amazonas (AM)</option><option value="BA">Bahia (BA)</option><option value="CE">Ceará (CE)</option>
                    <option value="DF">Distrito Federal (DF)</option><option value="ES">Espírito Santo (ES)</option><option value="GO">Goiás (GO)</option>
                    <option value="MA">Maranhão (MA)</option><option value="MT">Mato Grosso (MT)</option><option value="MS">Mato Grosso do Sul (MS)</option>
                    <option value="MG">Minas Gerais (MG)</option><option value="PA">Pará (PA)</option><option value="PB">Paraíba (PB)</option>
                    <option value="PR">Paraná (PR)</option><option value="PE">Pernambuco (PE)</option><option value="PI">Piauí (PI)</option>
                    <option value="RJ">Rio de Janeiro (RJ)</option><option value="RN">Rio Grande do Norte (RN)</option><option value="RS">Rio Grande do Sul (RS)</option>
                    <option value="RO">Rondônia (RO)</option><option value="RR">Roraima (RR)</option><option value="SC">Santa Catarina (SC)</option>
                    <option value="SP">São Paulo (SP)</option><option value="SE">Sergipe (SE)</option><option value="TO">Tocantins (TO)</option>
                  </select>
                </label>

                <label className="segment-filter-half">
                  Pedidos mínimos
                  <input type="number" min={0} placeholder="Ex: 5" value={definition.minTotalOrders ?? ""} onChange={(event) => setDefinition((current) => ({ ...current, minTotalOrders: event.target.value ? Number(event.target.value) : undefined }))} />
                </label>

                <div className="full-span manual-inclusion-wrapper" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <style>{`
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
                  `}</style>

                  <div className="manual-inclusion-card">
                    <div className="manual-inclusion-header">
                      <div>
                        <h4 className="manual-inclusion-title">👤 Incluir Clientes Manualmente (Opcional)</h4>
                        <p className="manual-inclusion-subtitle">Adicione clientes específicos ao público alvo de forma direta.</p>
                      </div>
                      <div className="manual-tabs">
                        <button type="button" className={`manual-tab-btn ${manualMode === "search" ? "active" : ""}`} onClick={() => setManualMode("search")}>
                          🔍 Buscar & Selecionar
                        </button>
                        <button type="button" className={`manual-tab-btn ${manualMode === "paste" ? "active" : ""}`} onClick={() => setManualMode("paste")}>
                          📋 Colar em Lote
                        </button>
                      </div>
                    </div>

                    {manualMode === "search" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", position: "relative" }}>
                        <div className="search-input-wrapper">
                          <span className="search-icon-inside">🔍</span>
                          <input
                            type="text"
                            placeholder="Digite o nome ou código do cliente para buscar e adicionar..."
                            value={clientSearchQuery}
                            onChange={(e) => setClientSearchQuery(e.target.value)}
                          />
                          {isSearchingClients && (
                            <span style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", fontSize: "0.8rem", color: "var(--muted-color)" }}>
                              ⏳ Buscando...
                            </span>
                          )}
                        </div>

                        {clientSearchResults.length > 0 && (
                          <div className="autocomplete-dropdown">
                            {clientSearchResults.map((cust) => {
                              const alreadyAdded = definition.customerCodes?.includes(cust.customerCode ?? "");
                              return (
                                <div
                                  key={cust.id}
                                  className="autocomplete-item"
                                  onClick={() => {
                                    if (!alreadyAdded) handleAddManualCode(cust);
                                  }}
                                  style={{ opacity: alreadyAdded ? 0.6 : 1, cursor: alreadyAdded ? "default" : "pointer" }}
                                >
                                  <div className="autocomplete-client-info">
                                    <span className="autocomplete-client-name">{cust.displayName}</span>
                                    <span className="autocomplete-client-code">{cust.customerCode || "Sem código"}</span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span className={`status-badge-inline ${cust.status}`}>
                                      {cust.status === "ACTIVE" ? "Ativo" : cust.status === "ATTENTION" ? "Atenção" : "Inativo"}
                                    </span>
                                    {alreadyAdded ? (
                                      <span style={{ color: "#10b981", fontSize: "0.85rem", fontWeight: 700 }}>✓</span>
                                    ) : (
                                      <span style={{ color: "#2563eb", fontSize: "0.85rem", fontWeight: 700 }}>＋</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {clientSearchQuery.trim() && clientSearchResults.length === 0 && !isSearchingClients && (
                          <div className="autocomplete-dropdown" style={{ padding: "1rem", textAlign: "center", fontSize: "0.85rem", color: "var(--muted-color)" }}>
                            Nenhum cliente correspondente encontrado.
                          </div>
                        )}

                        <div>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--foreground)", display: "block", marginBottom: "0.25rem" }}>
                            Clientes Selecionados ({definition.customerCodes?.length ?? 0}):
                          </span>
                          <div className="chips-container">
                            {definition.customerCodes && definition.customerCodes.length > 0 ? (
                              definition.customerCodes.map((code) => {
                                const displayName = displayNamesMap[code];
                                return (
                                  <div key={code} className="client-chip">
                                    <span>{displayName ? `${displayName} (${code})` : code}</span>
                                    <button type="button" className="client-chip-remove" onClick={() => handleRemoveManualCode(code)}>×</button>
                                  </div>
                                );
                              })
                            ) : (
                              <span style={{ fontSize: "0.8rem", color: "var(--muted-color)", fontStyle: "italic" }}>
                                Nenhum cliente selecionado ainda. Busque e clique acima para incluir.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--muted-color)", display: "block", marginBottom: "0.25rem", fontWeight: 400 }}>
                          Cole os códigos separados por vírgula, espaço ou quebra de linha (ex: CL1200, KH9321).
                        </span>
                        <textarea
                          placeholder="Cole códigos manuais de clientes..."
                          style={{ minHeight: "80px", resize: "vertical", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--background)", color: "var(--foreground)", outline: "none", fontSize: "0.9rem" }}
                          value={manualCodesText}
                          onChange={(event) => {
                            const val = event.target.value;
                            setManualCodesText(val);
                            const codes = val.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
                            setDefinition((current) => ({ ...current, customerCodes: codes.length ? codes : undefined }));
                          }}
                        />
                        {definition.customerCodes && definition.customerCodes.length > 0 && (
                          <div style={{ marginTop: "0.5rem" }}>
                            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--foreground)", display: "block", marginBottom: "0.25rem" }}>
                              Códigos Identificados ({definition.customerCodes.length}):
                            </span>
                            <div className="chips-container" style={{ minHeight: "auto" }}>
                              {definition.customerCodes.map((code) => (
                                <div key={code} className="client-chip" style={{ background: "rgba(107, 114, 128, 0.05)", border: "1px solid rgba(107, 114, 128, 0.15)", color: "var(--muted-color)" }}>
                                  <span>{displayNamesMap[code] ? `${displayNamesMap[code]} (${code})` : code}</span>
                                  <button type="button" className="client-chip-remove" onClick={() => handleRemoveManualCode(code)}>×</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <LabelMultiSelect label="Com rotulo" options={labelsQuery.data ?? []} selectedValues={definition.labels ?? []}
                  onChange={(newValues) => setDefinition((current) => ({ ...current, labels: newValues.length ? newValues : undefined }))} placeholder="Todos" />

                <LabelMultiSelect label="Ocultar com rotulo" options={labelsQuery.data ?? []} selectedValues={definition.excludeLabels ?? []}
                  onChange={(newValues) => setDefinition((current) => ({ ...current, excludeLabels: newValues.length ? newValues : undefined }))} placeholder="Nenhum" />
              </div>

              <div className="inline-actions segment-actions-bar">
                <button className="primary-button" type="submit">Pre-visualizar segmento</button>
                <button className="ghost-button" type="button" onClick={handleSaveSegment} disabled={saveSegmentMutation.isPending}>
                  {saveSegmentMutation.isPending ? "Salvando..." : activeSegmentId ? "Atualizar publico" : "Salvar publico"}
                </button>
                <button className="ghost-button" type="button" onClick={handleDuplicateSegment} disabled={duplicateSegmentMutation.isPending}>
                  {duplicateSegmentMutation.isPending ? "Duplicando..." : "Duplicar"}
                </button>
                {activeSegmentId ? (
                  <button className="ghost-button danger" type="button" onClick={handleDeleteSegment} disabled={deleteSegmentMutation.isPending}>
                    {deleteSegmentMutation.isPending ? "Excluindo..." : "Excluir"}
                  </button>
                ) : null}
                {segmentMessage ? <span className="save-ok">{segmentMessage}</span> : null}
              </div>
            </form>

            <article className="panel segment-summary-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Resumo</p>
                  <h3>Resultado esperado</h3>
                  <p className="panel-subcopy">A previa aparece aqui para você decidir se esse publico vale salvar e acionar.</p>
                </div>
              </div>

              {previewMutation.data ? (
                <>
                  <div className="detail-grid segment-summary-grid">
                    <div><span>Clientes</span><strong>{formatNumber(previewMutation.data.summary.totalCustomers)}</strong></div>
                    <div><span>Prioridade media</span><strong>{Number(previewMutation.data.summary.averagePriorityScore ?? 0).toFixed(1)}</strong></div>
                    <div><span>Faturamento</span><strong>{formatCurrency(previewMutation.data.summary.potentialRecoveredRevenue ?? 0)}</strong></div>
                    <div><span>Media de pecas/pedido</span><strong>{formatNumber(previewMutation.data.summary.potentialRecoveredPieces ?? 0)}</strong></div>
                  </div>
                  <div className="detail-grid segment-summary-grid" style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#2563eb' }}>Potencial mensal se recuperarmos</span>
                    </div>
                    <div><span>Faturamento/mes</span><strong style={{ color: '#2563eb' }}>{formatCurrency(previewMutation.data.summary.monthlyPotentialRevenue ?? 0)}</strong></div>
                    <div><span>Pecas/mes</span><strong style={{ color: '#2563eb' }}>{formatNumber(previewMutation.data.summary.monthlyPotentialPieces ?? 0)}</strong></div>
                  </div>
                  <p className="panel-subcopy segment-summary-note">
                    A primeira linha mostra dados historicos: media de pecas por pedido e soma dos tickets medios de cada cliente.
                    A segunda linha projeta o potencial mensal caso consigamos recuperar esses clientes, baseado no historico de 
                    compras (frequencia e valor) de cada um.
                  </p>
                </>
              ) : (
                <div className="empty-state">
                  Gere a previa para ver quantos clientes entram no publico, qual a prioridade media e o potencial estimado.
                </div>
              )}
            </article>
          </section>

          {/* Floating Bulk Actions Banner */}
          {previewMutation.data && selectedCustomerIds.length > 0 ? (
            <div className="panel" style={{
              background: "linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(29, 78, 216, 0.03) 100%)",
              border: "1px solid rgba(37, 99, 235, 0.2)", borderRadius: "12px", padding: "1.5rem",
              marginBottom: "1.5rem", display: "flex", flexWrap: "wrap", alignItems: "center",
              justifyContent: "space-between", gap: "1.5rem",
              boxShadow: "0 4px 20px -2px rgba(37, 99, 235, 0.1)", transition: "all 0.3s ease"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{
                  width: "48px", height: "48px", borderRadius: "50%",
                  backgroundColor: "rgba(37, 99, 235, 0.15)", display: "flex",
                  alignItems: "center", justifyContent: "center", fontSize: "1.25rem",
                  fontWeight: 700, color: "#2563eb", boxShadow: "0 0 12px rgba(37, 99, 235, 0.2)"
                }}>
                  {selectedCustomerIds.length}
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)" }}>
                    Clientes selecionados para ação rápida
                  </h4>
                  <p className="panel-subcopy" style={{ margin: 0, marginTop: "0.25rem" }}>
                    Crie um rótulo personalizado abaixo para atribuir a todos estes {selectedCustomerIds.length} clientes de uma vez.
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", flex: 1, justifyContent: "flex-end", minWidth: "300px" }}>
                <input type="text" value={batchLabelName} onChange={(e) => { setBatchLabelName(e.target.value); setBatchMessage(""); }}
                  placeholder="Ex: Reativação VIP, Lead Quente"
                  style={{ padding: "0.75rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--background)", color: "var(--foreground)", fontSize: "0.95rem", width: "250px", outline: "none", transition: "border-color 0.2s", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)" }}
                  onKeyDown={(e) => { if (e.key === "Enter" && batchLabelName.trim()) bulkLabelMutation.mutate({ customerIds: selectedCustomerIds, labelName: batchLabelName }); }}
                />
                <button type="button" className="primary-button"
                  onClick={() => bulkLabelMutation.mutate({ customerIds: selectedCustomerIds, labelName: batchLabelName })}
                  disabled={!batchLabelName.trim() || bulkLabelMutation.isPending}
                  style={{ padding: "0.75rem 1.5rem", fontSize: "0.95rem", fontWeight: 600, boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)" }}>
                  {bulkLabelMutation.isPending ? "Atribuindo..." : "Atribuir Rótulo"}
                </button>
                {batchMessage && (
                  <div style={{ width: "100%", marginTop: "0.5rem", textAlign: "right", fontSize: "0.875rem", fontWeight: 500, color: batchMessage.includes("Erro") ? "#dc2626" : "#16a34a" }}>
                    {batchMessage}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {previewMutation.data ? (
            <CustomerTable customers={previewMutation.data.customers} selectable={true} selectedIds={selectedCustomerIds} onSelectedIdsChange={setSelectedCustomerIds} />
          ) : null}
        </>
      ) : (

        /* ═══════════ LIBRARY TAB ═══════════ */
        <>
          {/* Search bar */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
            <input type="text" placeholder="🔍  Buscar público..." value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)}
              style={{ padding: "0.6rem 1rem", borderRadius: "8px", border: "1px solid var(--border-color)", fontSize: "0.9rem", width: "280px", maxWidth: "100%", background: "var(--background)", color: "var(--foreground)" }} />
          </div>

          {savedSegmentsQuery.isLoading ? <div className="page-loading">Carregando publicos...</div> : null}
          {savedSegmentsQuery.isError ? <div className="page-error">Nao foi possivel carregar os publicos salvos.</div> : null}

          {!savedSegmentsQuery.isLoading && !savedSegmentsQuery.isError && (
            <>
              {filteredSegments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {filteredSegments.map((segment) => {
                    const isSelected = segment.id === activeSegmentId;
                    return (
                      <button
                        key={segment.id}
                        type="button"
                        onClick={() => openSavedSegment(segment)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          gap: "1rem", padding: "0.85rem 1.25rem",
                          borderRadius: "12px", cursor: "pointer", textAlign: "left",
                          border: isSelected ? "2px solid #2563eb" : "1px solid var(--border-color)",
                          background: isSelected ? "rgba(37, 99, 235, 0.03)" : "var(--panel-background, #fff)",
                          transition: "all 0.15s ease", width: "100%",
                          boxShadow: isSelected ? "0 0 0 1px rgba(37, 99, 235, 0.1)" : "none"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap" }}>
                            {segment.name}
                          </strong>
                          <SegmentTags segment={segment} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                          <span
                            className="ghost-button"
                            onClick={(e) => { e.stopPropagation(); openSavedSegment(segment); setActiveTab("builder"); }}
                            style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem", height: "auto", minHeight: "auto", cursor: "pointer" }}
                          >✏️</span>
                          <span
                            className="ghost-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateSegmentMutation.mutate({ name: `${segment.name.trim()} copia`, definition: segment.definition });
                            }}
                            style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem", height: "auto", minHeight: "auto", cursor: "pointer" }}
                          >📂</span>
                          <span
                            className="ghost-button danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Deseja realmente excluir o público "${segment.name}"?`)) {
                                deleteSegmentMutation.mutate(segment.id);
                              }
                            }}
                            style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem", height: "auto", minHeight: "auto", cursor: "pointer" }}
                          >🗑️</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: "3rem 1rem" }}>
                  {librarySearch ? "Nenhum público corresponde à sua busca." : "Nenhum publico salvo ainda. Monte um filtro e salve para a equipe reaproveitar."}
                </div>
              )}

              {/* ── Selected Segment Preview (appears below the list) ── */}
              {selectedLibrarySegment && previewMutation.data && (
                <div style={{ marginTop: "1.5rem" }}>
                  {/* Summary banner */}
                  <div className="panel" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
                      <div>
                        <p className="eyebrow" style={{ margin: 0 }}>Prévia do público</p>
                        <h3 style={{ margin: "0.25rem 0 0 0" }}>{selectedLibrarySegment.name}</h3>
                      </div>
                      <button type="button" className="ghost-button" onClick={() => { setActiveTab("builder"); }}
                        style={{ padding: "0.4rem 0.85rem", fontSize: "0.85rem", height: "auto", minHeight: "auto", border: "1px solid rgba(37, 99, 235, 0.35)", color: "#2563eb", fontWeight: 600 }}>
                        ✏️ Editar filtros
                      </button>
                    </div>
                    <div className="detail-grid segment-summary-grid">
                      <div><span>Clientes</span><strong>{formatNumber(previewMutation.data.summary.totalCustomers)}</strong></div>
                      <div><span>Prioridade media</span><strong>{Number(previewMutation.data.summary.averagePriorityScore ?? 0).toFixed(1)}</strong></div>
                      <div><span>Faturamento</span><strong>{formatCurrency(previewMutation.data.summary.potentialRecoveredRevenue ?? 0)}</strong></div>
                      <div><span>Media de pecas/pedido</span><strong>{formatNumber(previewMutation.data.summary.potentialRecoveredPieces ?? 0)}</strong></div>
                    </div>
                    <div className="detail-grid segment-summary-grid" style={{ marginTop: '1rem', borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#2563eb' }}>Potencial mensal se recuperarmos</span>
                      </div>
                      <div><span>Faturamento/mes</span><strong style={{ color: '#2563eb' }}>{formatCurrency(previewMutation.data.summary.monthlyPotentialRevenue ?? 0)}</strong></div>
                      <div><span>Pecas/mes</span><strong style={{ color: '#2563eb' }}>{formatNumber(previewMutation.data.summary.monthlyPotentialPieces ?? 0)}</strong></div>
                    </div>
                  </div>

                  {/* Bulk label bar (same as builder) */}
                  {selectedCustomerIds.length > 0 && (
                    <div className="panel" style={{
                      background: "linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(29, 78, 216, 0.03) 100%)",
                      border: "1px solid rgba(37, 99, 235, 0.2)", borderRadius: "12px", padding: "1rem 1.25rem",
                      marginBottom: "1rem", display: "flex", flexWrap: "wrap", alignItems: "center",
                      justifyContent: "space-between", gap: "1rem"
                    }}>
                      <span style={{ fontWeight: 600, color: "#2563eb" }}>
                        {selectedCustomerIds.length} clientes selecionados
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                        <input type="text" value={batchLabelName} onChange={(e) => { setBatchLabelName(e.target.value); setBatchMessage(""); }}
                          placeholder="Nome do rótulo..." style={{ padding: "0.5rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", fontSize: "0.9rem", width: "200px" }}
                          onKeyDown={(e) => { if (e.key === "Enter" && batchLabelName.trim()) bulkLabelMutation.mutate({ customerIds: selectedCustomerIds, labelName: batchLabelName }); }}
                        />
                        <button type="button" className="primary-button" disabled={!batchLabelName.trim() || bulkLabelMutation.isPending}
                          onClick={() => bulkLabelMutation.mutate({ customerIds: selectedCustomerIds, labelName: batchLabelName })}
                          style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
                          {bulkLabelMutation.isPending ? "Atribuindo..." : "Atribuir Rótulo"}
                        </button>
                        {batchMessage && <span style={{ fontSize: "0.85rem", color: batchMessage.includes("Erro") ? "#dc2626" : "#16a34a" }}>{batchMessage}</span>}
                      </div>
                    </div>
                  )}

                  {/* Customer table */}
                  <CustomerTable customers={previewMutation.data.customers} selectable={true} selectedIds={selectedCustomerIds} onSelectedIdsChange={setSelectedCustomerIds} />
                </div>
              )}

              {/* Loading state for preview */}
              {activeSegmentId && previewMutation.isPending && (
                <div className="page-loading" style={{ marginTop: "2rem" }}>Carregando lista de clientes...</div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
