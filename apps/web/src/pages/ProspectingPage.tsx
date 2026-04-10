import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ProspectContactChannel,
  ProspectContactType,
  ProspectKeywordPreset,
  ProspectLead,
  ProspectSearchQuery,
} from "@olist-crm/shared";
import { Building2, ExternalLink, MapPinned, Phone, Save, Search, ShieldAlert, Target, UserCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDate, formatNumber } from "../lib/format";

const BRAZIL_STATES = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;
const DEFAULT_PRESET_KEYWORDS = new Set(["assistencia tecnica", "distribuidora de telas", "troca de tela"]);

const defaultFilters: ProspectSearchQuery = {
  keyword: "",
  state: "SP",
  city: "",
  onlyNew: true,
  onlyUnassigned: false,
  hasPhone: false,
  myLeads: false,
  includeWorked: false,
  limit: 10,
};

type ProspectingTab = "buscar" | "painel";

function leadStatusLabel(status: ProspectLead["status"]) {
  if (status === "NEW") return "Novo";
  if (status === "CLAIMED") return "Assumido";
  if (status === "CONTACTED") return "Contatado";
  return "Descartado";
}

function quotaProgress(used: number, limit: number) {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function quotaTone(used: number, limit: number) {
  const percentage = quotaProgress(used, limit);
  if (percentage >= 85) return "tone-danger";
  if (percentage >= 70) return "tone-warning";
  return "";
}

function splitPresets(presets: ProspectKeywordPreset[] | undefined) {
  const base: ProspectKeywordPreset[] = [];
  const saved: ProspectKeywordPreset[] = [];

  for (const preset of presets ?? []) {
    if (DEFAULT_PRESET_KEYWORDS.has(preset.keyword)) {
      base.push(preset);
    } else {
      saved.push(preset);
    }
  }

  base.sort((left, right) => left.sortOrder - right.sortOrder);
  saved.sort((left, right) => left.sortOrder - right.sortOrder);

  return { base, saved };
}

export function ProspectingPage() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ProspectingTab>("buscar");
  const [filters, setFilters] = useState<ProspectSearchQuery>(defaultFilters);
  const [submittedFilters, setSubmittedFilters] = useState<ProspectSearchQuery | null>(null);
  const [activeContactLeadId, setActiveContactLeadId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<{
    channel: ProspectContactChannel;
    contactType: ProspectContactType;
    notes: string;
  }>({
    channel: "WHATSAPP",
    contactType: "FIRST_CONTACT",
    notes: "",
  });

  const configQuery = useQuery({
    queryKey: ["prospecting-config"],
    queryFn: () => api.prospectingConfig(token!),
    enabled: Boolean(token),
  });

  const summaryQuery = useQuery({
    queryKey: ["prospecting-summary"],
    queryFn: () => api.prospectingSummary(token!),
    enabled: Boolean(token),
  });

  const searchMutation = useMutation({
    mutationFn: (query: ProspectSearchQuery) => api.prospectingSearch(token!, query),
  });

  const rerunSearch = async (nextFilters?: ProspectSearchQuery | null) => {
    const filtersToUse = nextFilters ?? submittedFilters;
    if (!filtersToUse) {
      return;
    }

    try {
      await searchMutation.mutateAsync(filtersToUse);
    } catch {
      // O erro fica exposto pela mutation e renderizado na tela.
    }
  };

  const invalidateProspecting = async (nextFilters?: ProspectSearchQuery | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["prospecting-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["prospecting-config"] }),
    ]);

    await rerunSearch(nextFilters);
  };

  const savePresetMutation = useMutation({
    mutationFn: (keyword: string) => api.createProspectPreset(token!, keyword),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prospecting-config"] });
    },
  });

  const claimMutation = useMutation({
    mutationFn: (leadId: string) => api.claimProspectLead(token!, leadId),
    onSuccess: async () => {
      await invalidateProspecting();
    },
  });

  const releaseMutation = useMutation({
    mutationFn: (leadId: string) => api.releaseProspectLead(token!, leadId),
    onSuccess: async () => {
      setActiveContactLeadId(null);
      await invalidateProspecting();
    },
  });

  const discardMutation = useMutation({
    mutationFn: (leadId: string) => api.discardProspectLead(token!, leadId),
    onSuccess: async () => {
      setActiveContactLeadId(null);
      await invalidateProspecting();
    },
  });

  const contactMutation = useMutation({
    mutationFn: (leadId: string) => api.createProspectContactAttempt(token!, leadId, contactForm),
    onSuccess: async () => {
      setActiveContactLeadId(null);
      setContactForm({
        channel: "WHATSAPP",
        contactType: "FIRST_CONTACT",
        notes: "",
      });
      await invalidateProspecting();
    },
  });

  const quota = summaryQuery.data?.quota ?? configQuery.data?.quota;
  const searchResponse = searchMutation.data;
  const searchErrorMessage = searchMutation.error instanceof Error ? searchMutation.error.message : null;
  const results = searchResponse?.items ?? [];
  const canSearch = Boolean(filters.keyword?.trim() && filters.state?.trim());
  const { base: basePresets, saved: savedPresets } = useMemo(() => splitPresets(configQuery.data?.presets), [configQuery.data?.presets]);

  const monthlyStats = useMemo(() => {
    if (!quota) {
      return [];
    }

    return [
      {
        title: "Buscas no mes",
        value: `${formatNumber(quota.textSearch.monthlyUsed)} / ${formatNumber(quota.textSearch.monthlyLimit)}`,
        progress: quotaProgress(quota.textSearch.monthlyUsed, quota.textSearch.monthlyLimit),
        tone: quotaTone(quota.textSearch.monthlyUsed, quota.textSearch.monthlyLimit),
      },
      {
        title: "Detalhes no mes",
        value: `${formatNumber(quota.placeDetails.monthlyUsed)} / ${formatNumber(quota.placeDetails.monthlyLimit)}`,
        progress: quotaProgress(quota.placeDetails.monthlyUsed, quota.placeDetails.monthlyLimit),
        tone: quotaTone(quota.placeDetails.monthlyUsed, quota.placeDetails.monthlyLimit),
      },
    ];
  }, [quota]);

  const handleSearch = async () => {
    if (!canSearch) {
      return;
    }

    const nextFilters: ProspectSearchQuery = {
      keyword: filters.keyword?.trim(),
      state: filters.state?.trim(),
      city: filters.city?.trim() || "",
      onlyNew: true,
      onlyUnassigned: false,
      hasPhone: false,
      myLeads: false,
      includeWorked: false,
      limit: 10,
    };

    setSubmittedFilters(nextFilters);
    await rerunSearch(nextFilters);
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Prospeccao</p>
            <h2>Leads do Google Places</h2>
            <p className="panel-subcopy">
              Busca direta por palavra-chave, estado e cidade opcional. A tela principal ficou mais limpa, e o painel operacional foi para a aba ao lado.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={activeTab === "buscar" ? "primary-button" : "ghost-button"}
            onClick={() => setActiveTab("buscar")}
          >
            Buscar Leads
          </button>
          <button
            type="button"
            className={activeTab === "painel" ? "primary-button" : "ghost-button"}
            onClick={() => setActiveTab("painel")}
          >
            Painel Operacional
          </button>
        </div>
      </section>

      {activeTab === "buscar" ? (
        <>
          {!configQuery.data?.apiEnabled ? (
            <section className="panel">
              <div className="queue-card compact">
                <div className="queue-card-meta">
                  <span>
                    <ShieldAlert size={14} />
                    Google Places ainda nao esta habilitado neste ambiente. Reinicie a API depois de configurar o `.env` para liberar a busca real.
                  </span>
                </div>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Sugestoes</p>
                <h3>Palavras prontas</h3>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", marginBottom: savedPresets.length ? "1rem" : 0 }}>
              {basePresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="ghost-button small"
                  onClick={() => setFilters((current) => ({ ...current, keyword: preset.keyword }))}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {savedPresets.length ? (
              <>
                <p className="eyebrow" style={{ marginTop: 0 }}>Buscas salvas</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
                  {savedPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="ghost-button small"
                      onClick={() => setFilters((current) => ({ ...current, keyword: preset.keyword }))}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Busca</p>
                <h3>Pesquisar leads</h3>
                <p className="panel-subcopy">Somente novos continua padrao por baixo, sem ficar aparecendo como filtro.</p>
              </div>
            </div>

            <form
              className="filters-grid filters-grid-four"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSearch();
              }}
            >
              <label>
                Palavra-chave
                <input
                  value={filters.keyword ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
                  placeholder="Ex.: distribuicao de telas"
                />
              </label>

              <label>
                Estado
                <select value={filters.state ?? "SP"} onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value }))}>
                  {BRAZIL_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Cidade opcional
                <input
                  value={filters.city ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))}
                  placeholder="Ex.: Campinas"
                />
              </label>

              <div style={{ display: "flex", alignItems: "end", gap: "0.65rem", flexWrap: "wrap" }}>
                <button type="submit" className="primary-button" disabled={!canSearch || searchMutation.isPending}>
                  <Search size={16} />
                  {searchMutation.isPending ? "Buscando..." : "Buscar"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => savePresetMutation.mutate(filters.keyword ?? "")}
                  disabled={!filters.keyword?.trim() || savePresetMutation.isPending}
                >
                  <Save size={16} />
                  Salvar palavra-chave
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Resultados</p>
                <h3>Leads priorizados para prospeccao</h3>
                <p className="panel-subcopy">{searchResponse?.notice ?? "Faca uma busca para carregar os leads."}</p>
              </div>
            </div>

            {searchMutation.isPending ? <div className="page-loading">Buscando leads...</div> : null}
            {searchErrorMessage ? <div className="page-error">{searchErrorMessage}</div> : null}

            {!submittedFilters && !searchMutation.isPending ? (
              <div className="empty-state">Escolha a palavra-chave, estado e clique em Buscar.</div>
            ) : null}

            {submittedFilters && !searchMutation.isPending && !searchErrorMessage && !results.length ? (
              <div className="empty-state">
                {configQuery.data?.apiEnabled
                  ? "Nenhum lead apareceu com essa combinacao."
                  : "Sem Google configurado nesse ambiente, a busca so consegue mostrar leads ja salvos localmente."}
              </div>
            ) : null}

            <div className="queue-list">
              {results.map((lead) => {
                const isMine = lead.assignedTo?.id === user?.id;

                return (
                  <article key={lead.id} className="queue-card">
                    <div className="queue-card-top">
                      <div className="queue-card-heading">
                        <div className="agenda-title">
                          <h3>{lead.displayName}</h3>
                          <span className="score-pill">Score {lead.score.toFixed(0)}</span>
                          <span className={`status-badge status-${lead.status.toLowerCase()}`}>{leadStatusLabel(lead.status)}</span>
                        </div>
                        <p className="queue-card-note">
                          {lead.primaryCategory || "Categoria principal nao informada"} • {lead.city || "Cidade livre"}, {lead.state}
                        </p>
                        <p className="queue-card-note">{lead.address || "Endereco ainda nao carregado nessa etapa."}</p>
                      </div>

                      <div className="queue-card-score">
                        <strong>{lead.assignedTo ? lead.assignedTo.name : "Livre"}</strong>
                        <small>{lead.assignedTo ? "Responsavel atual" : "Disponivel"}</small>
                      </div>
                    </div>

                    <div className="queue-card-meta">
                      <span>
                        <Building2 size={14} />
                        {lead.primaryCategory || "Sem categoria"}
                      </span>
                      <span>
                        <Target size={14} />
                        {lead.reviewCount ? `${formatNumber(lead.reviewCount)} avaliacoes` : "Avaliacoes sob demanda"}
                      </span>
                      <span>
                        <Phone size={14} />
                        {lead.phone || "Telefone ao assumir o lead"}
                      </span>
                      <span>
                        <UserCheck size={14} />
                        {lead.firstContactAt ? `Primeiro contato em ${formatDate(lead.firstContactAt)}` : "Ainda nao trabalhado"}
                      </span>
                    </div>

                    <div className="queue-card-actions">
                      {lead.mapsUrl ? (
                        <a className="ghost-button small" href={lead.mapsUrl} target="_blank" rel="noreferrer">
                          <MapPinned size={14} />
                          Abrir no Maps
                        </a>
                      ) : null}

                      {lead.websiteUrl ? (
                        <a className="ghost-button small" href={lead.websiteUrl} target="_blank" rel="noreferrer">
                          <ExternalLink size={14} />
                          Site
                        </a>
                      ) : null}

                      {lead.whatsappUrl ? (
                        <a className="ghost-button small" href={lead.whatsappUrl} target="_blank" rel="noreferrer">
                          <Phone size={14} />
                          WhatsApp
                        </a>
                      ) : null}

                      {!lead.assignedTo ? (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => claimMutation.mutate(lead.id)}
                          disabled={claimMutation.isPending}
                        >
                          Assumir lead
                        </button>
                      ) : null}

                      {isMine ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setActiveContactLeadId((current) => (current === lead.id ? null : lead.id))}
                        >
                          Registrar contato
                        </button>
                      ) : null}

                      {isMine && !lead.firstContactAt ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => releaseMutation.mutate(lead.id)}
                          disabled={releaseMutation.isPending}
                        >
                          Liberar lead
                        </button>
                      ) : null}

                      {(isMine || !lead.assignedTo) ? (
                        <button
                          type="button"
                          className="ghost-button danger"
                          onClick={() => discardMutation.mutate(lead.id)}
                          disabled={discardMutation.isPending}
                        >
                          Descartar
                        </button>
                      ) : null}
                    </div>

                    {activeContactLeadId === lead.id && isMine ? (
                      <div style={{ borderTop: "1px solid var(--line)", paddingTop: "1rem", display: "grid", gap: "0.85rem" }}>
                        <div className="filters-grid filters-grid-four">
                          <label>
                            Canal
                            <select
                              value={contactForm.channel}
                              onChange={(event) =>
                                setContactForm((current) => ({ ...current, channel: event.target.value as ProspectContactChannel }))
                              }
                            >
                              <option value="WHATSAPP">WhatsApp</option>
                              <option value="PHONE">Ligacao</option>
                              <option value="SITE">Site</option>
                              <option value="OTHER">Outro</option>
                            </select>
                          </label>

                          <label>
                            Tipo
                            <select
                              value={contactForm.contactType}
                              onChange={(event) =>
                                setContactForm((current) => ({ ...current, contactType: event.target.value as ProspectContactType }))
                              }
                            >
                              <option value="FIRST_CONTACT">Primeiro contato</option>
                              <option value="FOLLOW_UP">Follow-up</option>
                              <option value="NO_RESPONSE">Sem resposta</option>
                              <option value="INTERESTED">Interessado</option>
                              <option value="DISQUALIFIED">Desqualificado</option>
                            </select>
                          </label>

                          <label className="full-span">
                            Observacao
                            <textarea
                              rows={3}
                              value={contactForm.notes}
                              onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))}
                              placeholder="Ex.: pediu retorno depois do almoco."
                            />
                          </label>
                        </div>

                        <div className="inline-actions">
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => contactMutation.mutate(lead.id)}
                            disabled={contactMutation.isPending}
                          >
                            Salvar tentativa
                          </button>
                          <button type="button" className="ghost-button" onClick={() => setActiveContactLeadId(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Painel operacional</p>
              <h3>Meta, uso e protecao da franquia</h3>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-card-badge">Meta do dia</span>
              <strong>{summaryQuery.data ? `${summaryQuery.data.uniqueContactsToday}/${summaryQuery.data.dailyTarget}` : "--"}</strong>
              <span>{summaryQuery.data ? `${summaryQuery.data.remainingToGoal} para bater a meta` : "Carregando..."}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card-badge">Leads assumidos</span>
              <strong>{summaryQuery.data ? formatNumber(summaryQuery.data.claimedLeadCount) : "--"}</strong>
              <span>{user?.name ?? "Vendedora"} em operacao hoje</span>
            </div>
            <div className={`stat-card ${quota ? quotaTone(quota.textSearch.dailyUsed, quota.textSearch.dailyLimit) : ""}`}>
              <span className="stat-card-badge">Busca hoje</span>
              <strong>{quota ? `${formatNumber(quota.textSearch.dailyUsed)}/${formatNumber(quota.textSearch.dailyLimit)}` : "--"}</strong>
              <span>Trava diaria para nao estourar a faixa gratis</span>
            </div>
            <div className={`stat-card ${quota ? quotaTone(quota.placeDetails.dailyUsed, quota.placeDetails.dailyLimit) : ""}`}>
              <span className="stat-card-badge">Detalhes hoje</span>
              <strong>{quota ? `${formatNumber(quota.placeDetails.dailyUsed)}/${formatNumber(quota.placeDetails.dailyLimit)}` : "--"}</strong>
              <span>Telefone e site aparecem sob demanda</span>
            </div>
          </div>

          <div className="stats-grid" style={{ marginTop: "0.85rem" }}>
            {monthlyStats.map((item) => (
              <div key={item.title} className={`stat-card ${item.tone}`}>
                <strong>{item.value}</strong>
                <span>{item.title}</span>
                <div style={{ marginTop: "0.75rem", height: "8px", borderRadius: "999px", background: "rgba(41, 86, 215, 0.08)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${item.progress}%`,
                      height: "100%",
                      borderRadius: "999px",
                      background: item.progress >= 85 ? "var(--danger)" : item.progress >= 70 ? "var(--warning)" : "var(--accent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {configQuery.data?.guardrails.length ? (
            <div className="stack-list" style={{ marginTop: "1rem" }}>
              {configQuery.data.guardrails.map((item) => (
                <div key={item} className="queue-card compact">
                  <div className="queue-card-meta">
                    <span>{item}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
