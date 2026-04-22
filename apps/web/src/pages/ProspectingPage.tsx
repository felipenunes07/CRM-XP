import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ProspectContactChannel,
  ProspectContactType,
  ProspectKeywordPreset,
  ProspectLead,
  ProspectSearchQuery,
} from "@olist-crm/shared";
import {
  Building2,
  ExternalLink,
  Globe2,
  Layers3,
  Map,
  MapPinned,
  Phone,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Target,
  UserCheck,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useUiLanguage } from "../i18n";
import { api } from "../lib/api";
import { formatDate, formatNumber } from "../lib/format";

const BRAZIL_STATES = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;
const DEFAULT_PRESET_KEYWORDS = new Set(["assistencia tecnica", "distribuidora de telas", "troca de tela"]);
const MAP_MARKER_POSITIONS = [
  { top: "17%", left: "18%" },
  { top: "24%", left: "48%" },
  { top: "31%", left: "72%" },
  { top: "44%", left: "34%" },
  { top: "52%", left: "62%" },
  { top: "61%", left: "22%" },
  { top: "68%", left: "78%" },
  { top: "76%", left: "46%" },
] as const;

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

function leadStatusLabel(status: ProspectLead["status"], tx: (pt: string, zh: string) => string) {
  if (status === "NEW") return tx("Novo", "新线索");
  if (status === "CLAIMED") return tx("Assumido", "已领取");
  if (status === "CONTACTED") return tx("Contatado", "已联系");
  return tx("Descartado", "已丢弃");
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

function buildMapQuery(lead: ProspectLead | null, filters: ProspectSearchQuery | null) {
  if (lead?.address?.trim()) {
    return lead.address.trim();
  }

  if (lead?.city?.trim()) {
    return `${lead.city.trim()}, ${lead.state}`;
  }

  if (filters?.city?.trim()) {
    return `${filters.city.trim()}, ${filters.state}`;
  }

  if (filters?.keyword?.trim()) {
    return `${filters.keyword.trim()}, ${filters.state}`;
  }

  return "Sao Paulo, SP";
}

function leadMarkerTone(status: ProspectLead["status"]) {
  if (status === "CONTACTED") return "contacted";
  if (status === "CLAIMED") return "claimed";
  if (status === "DISCARDED") return "discarded";
  return "new";
}

export function ProspectingPage() {
  const { token, user } = useAuth();
  const { tx } = useUiLanguage();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ProspectingTab>("buscar");
  const [filters, setFilters] = useState<ProspectSearchQuery>(defaultFilters);
  const [submittedFilters, setSubmittedFilters] = useState<ProspectSearchQuery | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
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
  const apiEnabled = Boolean(configQuery.data?.apiEnabled);
  const searchResponse = searchMutation.data;
  const searchErrorMessage = searchMutation.error instanceof Error ? searchMutation.error.message : null;
  const results = searchResponse?.items ?? [];
  const isCacheOnlyMode = !apiEnabled;
  const canSearch = Boolean(filters.keyword?.trim() && filters.state?.trim());
  const { base: basePresets, saved: savedPresets } = useMemo(() => splitPresets(configQuery.data?.presets), [configQuery.data?.presets]);
  const selectedLead = useMemo(
    () => results.find((lead) => lead.id === selectedLeadId) ?? results[0] ?? null,
    [results, selectedLeadId],
  );
  const mapQuery = useMemo(
    () => buildMapQuery(selectedLead, submittedFilters ?? filters),
    [selectedLead, submittedFilters, filters],
  );
  const mapEmbedSrc = useMemo(
    () => `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=${selectedLead?.address ? 15 : 11}&output=embed`,
    [mapQuery, selectedLead],
  );
  const visibleMapLeads = useMemo(() => results.slice(0, MAP_MARKER_POSITIONS.length), [results]);
  const emptySearchNeedsSetup = Boolean(submittedFilters && isCacheOnlyMode && !results.length);
  const emptySearchWithoutSetupMessage = tx(
    "Sem GOOGLE_MAPS_API_KEY e sem cache salvo para esta consulta. Nenhum lead novo pode aparecer neste ambiente ate a API ser configurada.",
    "当前环境没有 GOOGLE_MAPS_API_KEY，且这次查询没有本地缓存。在配置 API 之前，这里不会出现新的线索。",
  );

  const searchStats = useMemo(() => {
    const availableCount = results.filter((lead) => !lead.assignedTo).length;
    const withPhoneCount = results.filter((lead) => Boolean(lead.phone)).length;
    const withSiteCount = results.filter((lead) => Boolean(lead.websiteUrl)).length;

    return [
      {
        label: tx("Leads na rota", "当前线索"),
        value: formatNumber(results.length),
        helper: submittedFilters ? `${submittedFilters.state}${submittedFilters.city ? ` - ${submittedFilters.city}` : ""}` : tx("Sem busca rodada", "尚未执行搜索"),
      },
      {
        label: tx("Livres para assumir", "可领取"),
        value: formatNumber(availableCount),
        helper: tx("Priorize os que estao sem responsavel", "优先处理没有负责人的线索"),
      },
      {
        label: tx("Com telefone", "有电话"),
        value: formatNumber(withPhoneCount),
        helper: tx("Contato mais rapido para a equipe", "适合团队快速联系"),
      },
      {
        label: tx("Com site", "有网站"),
        value: formatNumber(withSiteCount),
        helper: tx("Ajuda na qualificacao inicial", "有助于初步筛选"),
      },
    ];
  }, [results, submittedFilters, tx]);

  const monthlyStats = useMemo(() => {
    if (!quota) {
      return [];
    }

    return [
      {
        title: tx("Buscas no mes", "本月搜索"),
        value: `${formatNumber(quota.textSearch.monthlyUsed)} / ${formatNumber(quota.textSearch.monthlyLimit)}`,
        progress: quotaProgress(quota.textSearch.monthlyUsed, quota.textSearch.monthlyLimit),
        tone: quotaTone(quota.textSearch.monthlyUsed, quota.textSearch.monthlyLimit),
      },
      {
        title: tx("Detalhes no mes", "本月详情查询"),
        value: `${formatNumber(quota.placeDetails.monthlyUsed)} / ${formatNumber(quota.placeDetails.monthlyLimit)}`,
        progress: quotaProgress(quota.placeDetails.monthlyUsed, quota.placeDetails.monthlyLimit),
        tone: quotaTone(quota.placeDetails.monthlyUsed, quota.placeDetails.monthlyLimit),
      },
    ];
  }, [quota, tx]);

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
    setSelectedLeadId(null);
    await rerunSearch(nextFilters);
  };

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{tx("Prospeccao", "获客开发")}</p>
            <h2 className="premium-header-title">{tx("Prospeccao Leads", "线索开发")}</h2>
            <p className="panel-subcopy">
              {tx("A tela agora ficou com cara de central operacional: busca, mapa, fila lateral e acao rapida em um fluxo mais visual.", "这块页面现在是一个运营中枢：搜索、地图、侧边队列和快捷动作都整合在一个更直观的流程里。")}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={activeTab === "buscar" ? "primary-button" : "ghost-button"}
            onClick={() => setActiveTab("buscar")}
          >
            {tx("Buscar Leads", "搜索线索")}
          </button>
          <button
            type="button"
            className={activeTab === "painel" ? "primary-button" : "ghost-button"}
            onClick={() => setActiveTab("painel")}
          >
            {tx("Painel Operacional", "运营面板")}
          </button>
        </div>
      </section>

      {activeTab === "buscar" ? (
        <>
          {!apiEnabled ? (
            <section className="panel">
              <div className="queue-card compact">
                <div className="queue-card-meta">
                  <span>
                    <ShieldAlert size={14} />
                    {tx("Google Places ainda nao esta habilitado neste ambiente. Reinicie a API depois de configurar o `.env` para liberar a busca real.", "当前环境尚未启用 Google Places。配置好 `.env` 后请重启 API，才能开启真实搜索。")}
                  </span>
                </div>
              </div>
            </section>
          ) : null}

          <section className="panel prospecting-command-panel">
            <div className="prospecting-command-layout">
              <div className="prospecting-command-copy">
                <div className="panel-header" style={{ marginBottom: 0 }}>
                  <div>
                    <p className="eyebrow">{tx("Central de prospeccao", "获客指挥台")}</p>
                    <h3>{tx("Mapa, fila e acao rapida na mesma tela", "地图、队列和快捷动作同屏协作")}</h3>
                    <p className="panel-subcopy">
                      {tx("Monte a busca, visualize a regiao no mapa e clique no lead para ver detalhes sem sair da operacao.", "设置搜索条件，在地图上查看区域分布，并点击线索查看详情，无需离开当前操作页面。")}
                    </p>
                  </div>
                </div>

                <form
                  className="prospecting-search-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSearch();
                  }}
                >
                  <label className="full-span">
                    {tx("Palavra-chave", "关键词")}
                    <input
                      value={filters.keyword ?? ""}
                      onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
                      placeholder={tx("Ex.: distribuicao de telas", "例：屏幕分销")}
                    />
                  </label>

                  <label>
                    {tx("Estado", "州")}
                    <select value={filters.state ?? "SP"} onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value }))}>
                      {BRAZIL_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    {tx("Cidade opcional", "可选城市")}
                    <input
                      value={filters.city ?? ""}
                      onChange={(event) => setFilters((current) => ({ ...current, city: event.target.value }))}
                      placeholder={tx("Ex.: Campinas", "例：Campinas")}
                    />
                  </label>

                  <div className="prospecting-inline-actions">
                    <button type="submit" className="primary-button" disabled={!canSearch || searchMutation.isPending}>
                      <Search size={16} />
                      {searchMutation.isPending ? tx("Buscando...", "搜索中...") : tx("Buscar no mapa", "在地图中搜索")}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => savePresetMutation.mutate(filters.keyword ?? "")}
                      disabled={!filters.keyword?.trim() || savePresetMutation.isPending}
                    >
                      <Save size={16} />
                      {tx("Salvar busca", "保存搜索")}
                    </button>
                  </div>
                </form>

                <div className="prospecting-chip-group">
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
                  <div className="prospecting-saved-block">
                    <p className="eyebrow">{tx("Buscas salvas", "已保存搜索")}</p>
                    <div className="prospecting-chip-group">
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
                  </div>
                ) : null}
              </div>

              <aside className="prospecting-command-sidebar">
                <div className="prospecting-sidebar-card">
                  <div className="prospecting-sidebar-card-top">
                    <span className="prospecting-sidebar-icon">
                      <Layers3 size={18} />
                    </span>
                    <div>
                      <strong>{tx("Resumo da operacao", "运营摘要")}</strong>
                      <p>{searchResponse?.notice ?? tx("A busca aparece aqui com resumo operacional assim que voce rodar a consulta.", "执行搜索后，这里会显示本次检索的运营摘要。")}</p>
                    </div>
                  </div>

                  <div className={`prospecting-mode-badge${isCacheOnlyMode ? " warning" : ""}`}>
                    {isCacheOnlyMode
                      ? tx("Modo atual: cache local", "当前模式：本地缓存")
                      : tx("Modo atual: busca Google ativa", "当前模式：Google 搜索已启用")}
                  </div>

                  <div className="prospecting-stat-grid">
                    {searchStats.map((item) => (
                      <div key={item.label} className="prospecting-stat-tile">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                        <small>{item.helper}</small>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="prospecting-sidebar-card">
                  <div className="prospecting-sidebar-card-top">
                    <span className="prospecting-sidebar-icon accent-soft">
                      <Sparkles size={18} />
                    </span>
                    <div>
                      <strong>{tx("Meta do dia", "今日目标")}</strong>
                      <p>
                        {summaryQuery.data
                          ? tx(`${summaryQuery.data.uniqueContactsToday} contatos feitos. Faltam ${summaryQuery.data.remainingToGoal} para bater a meta.`, `今天已完成 ${summaryQuery.data.uniqueContactsToday} 次联系。距离目标还差 ${summaryQuery.data.remainingToGoal}。`)
                          : tx("Carregando leitura operacional do dia.", "正在加载今日运营读数。")}
                      </p>
                    </div>
                  </div>

                  <div className="prospecting-compact-kpis">
                    <div>
                      <span>{tx("Busca hoje", "今日搜索")}</span>
                      <strong>{quota ? `${formatNumber(quota.textSearch.dailyUsed)}/${formatNumber(quota.textSearch.dailyLimit)}` : "--"}</strong>
                    </div>
                    <div>
                      <span>{tx("Detalhes hoje", "今日详情查询")}</span>
                      <strong>{quota ? `${formatNumber(quota.placeDetails.dailyUsed)}/${formatNumber(quota.placeDetails.dailyLimit)}` : "--"}</strong>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{tx("Mapa de leads", "线索地图")}</p>
                <h3>{tx("Vista operacional da prospeccao", "获客运营视图")}</h3>
                <p className="panel-subcopy">
                  {selectedLead
                    ? tx(`Foco atual em ${selectedLead.displayName}. Clique nos pinos ou na fila lateral para trocar o destaque.`, `当前焦点：${selectedLead.displayName}。点击地图标记或侧边队列可切换重点线索。`)
                    : tx("Faca uma busca para carregar os leads e preencher o mapa com a fila priorizada.", "请先执行搜索，以加载线索并用优先队列填充地图。")}
                </p>
              </div>
            </div>

            {searchMutation.isPending ? <div className="page-loading">{tx("Buscando leads...", "正在搜索线索...")}</div> : null}
            {searchErrorMessage ? <div className="page-error">{searchErrorMessage}</div> : null}

            {!submittedFilters && !searchMutation.isPending ? (
              <div className="empty-state">{tx("Escolha a palavra-chave, estado e clique em Buscar.", "请选择关键词和州，然后点击搜索。")}</div>
            ) : null}

            {submittedFilters && !searchMutation.isPending && !searchErrorMessage && !results.length ? (
              <div className="empty-state">
                {apiEnabled
                  ? tx("Nenhum lead apareceu com essa combinacao.", "这个组合条件下没有找到线索。")
                  : emptySearchWithoutSetupMessage}
              </div>
            ) : null}

            {!searchMutation.isPending && !searchErrorMessage ? (
              <div className="prospecting-operations-grid">
                <div className="prospecting-map-card">
                  <div className="prospecting-map-toolbar">
                    <div>
                      <p className="eyebrow">{tx("Radar comercial", "销售雷达")}</p>
                      <strong>{submittedFilters?.keyword || filters.keyword || tx("Mapa regional", "区域地图")}</strong>
                    </div>
                    <div className="prospecting-map-badges">
                      <span>{submittedFilters?.state || filters.state}</span>
                      <span>{submittedFilters?.city || tx("Sem filtro de cidade", "未筛选城市")}</span>
                    </div>
                  </div>

                  <div className="prospecting-map-frame">
                    <iframe title={tx("Mapa da prospeccao", "获客地图")} src={mapEmbedSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                    <div className="prospecting-map-grid" />
                    <div className="prospecting-map-overlay" />
                    {visibleMapLeads.map((lead, index) => {
                      const position = MAP_MARKER_POSITIONS[index];
                      const isActive = lead.id === selectedLead?.id;

                      return (
                        <button
                          key={lead.id}
                          type="button"
                          className={`prospecting-map-pin tone-${leadMarkerTone(lead.status)}${isActive ? " active" : ""}`}
                          style={position}
                          onClick={() => setSelectedLeadId(lead.id)}
                          aria-label={tx(`Selecionar ${lead.displayName}`, `选择 ${lead.displayName}`)}
                        >
                          <MapPinned size={16} />
                          <span>{index + 1}</span>
                        </button>
                      );
                    })}

                    <div className="prospecting-map-focus-card">
                      <span className="prospecting-map-focus-kicker">{tx("Lead em foco", "当前焦点线索")}</span>
                      <strong>{selectedLead?.displayName ?? tx("Aguardando selecao", "等待选择")}</strong>
                      <small>{selectedLead?.address || mapQuery}</small>
                    </div>
                  </div>

                  <div className="prospecting-map-footer">
                    <div className="prospecting-map-legend">
                      <span><Map size={14} /> {tx("Novo", "新线索")}</span>
                      <span><Star size={14} /> {tx("Assumido", "已领取")}</span>
                      <span><UserCheck size={14} /> {tx("Contatado", "已联系")}</span>
                    </div>
                    {selectedLead?.mapsUrl ? (
                      <a className="ghost-button small" href={selectedLead.mapsUrl} target="_blank" rel="noreferrer">
                        <MapPinned size={14} />
                        {tx("Abrir local completo", "打开完整位置")}
                      </a>
                    ) : null}
                  </div>
                </div>

                <aside className="prospecting-focus-panel">
                  <div className="prospecting-focus-card">
                    <p className="eyebrow">{tx("Lead selecionado", "已选线索")}</p>
                    <div className="prospecting-focus-header">
                      <div>
                        <h4>{selectedLead?.displayName ?? tx("Nenhum lead selecionado", "未选择线索")}</h4>
                        <p>{selectedLead?.primaryCategory || tx("Categoria principal nao informada", "未提供主营类别")}</p>
                      </div>
                      {selectedLead ? (
                        <span className={`status-badge status-${selectedLead.status.toLowerCase()}`}>
                          {leadStatusLabel(selectedLead.status, tx)}
                        </span>
                      ) : null}
                    </div>

                    {selectedLead ? (
                      <>
                        <div className="prospecting-focus-metrics">
                          <div>
                            <span>{tx("Score", "评分")}</span>
                            <strong>{selectedLead.score.toFixed(0)}</strong>
                          </div>
                          <div>
                            <span>{tx("Avaliacoes", "评价数")}</span>
                            <strong>{selectedLead.reviewCount ? formatNumber(selectedLead.reviewCount) : "--"}</strong>
                          </div>
                          <div>
                            <span>{tx("Responsavel", "负责人")}</span>
                            <strong>{selectedLead.assignedTo?.name || tx("Livre", "空闲")}</strong>
                          </div>
                        </div>

                        <div className="prospecting-focus-details">
                          <span><Building2 size={14} /> {selectedLead.city || tx("Cidade livre", "城市未填写")}, {selectedLead.state}</span>
                          <span><Phone size={14} /> {selectedLead.phone || tx("Telefone ao assumir o lead", "领取后查看电话")}</span>
                          <span><Globe2 size={14} /> {selectedLead.websiteUrl ? tx("Tem site para validar", "有网站可验证") : tx("Sem site carregado", "未加载网站")}</span>
                        </div>

                        <p className="prospecting-focus-address">{selectedLead.address || tx("Endereco ainda nao carregado nessa etapa.", "当前阶段尚未加载地址。")}</p>

                        <div className="prospecting-focus-actions">
                          {selectedLead.mapsUrl ? (
                            <a className="ghost-button small" href={selectedLead.mapsUrl} target="_blank" rel="noreferrer">
                              <MapPinned size={14} />
                              {tx("Maps", "地图")}
                            </a>
                          ) : null}
                          {selectedLead.websiteUrl ? (
                            <a className="ghost-button small" href={selectedLead.websiteUrl} target="_blank" rel="noreferrer">
                              <ExternalLink size={14} />
                              {tx("Site", "网站")}
                            </a>
                          ) : null}
                          {selectedLead.whatsappUrl ? (
                            <a className="ghost-button small" href={selectedLead.whatsappUrl} target="_blank" rel="noreferrer">
                              <Phone size={14} />
                              WhatsApp
                            </a>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="prospecting-focus-empty">
                        {emptySearchNeedsSetup ? (
                          <div className="prospecting-setup-callout">
                            <strong>{tx("Busca real indisponivel", "真实搜索不可用")}</strong>
                            <p>{emptySearchWithoutSetupMessage}</p>
                          </div>
                        ) : null}
                        <span><MapPinned size={16} /> {tx("O mapa ja fica ativo com a regiao da busca.", "地图会根据当前搜索区域自动激活。")}</span>
                        <span><Search size={16} /> {tx("Rode uma busca para preencher a fila lateral com leads reais.", "执行一次搜索后，侧边队列会显示真实线索。")}</span>
                      </div>
                    )}
                  </div>

                  <div className="prospecting-lead-rail">
                    <div className="prospecting-lead-rail-header">
                      <div>
                        <p className="eyebrow">{tx("Fila lateral", "侧边队列")}</p>
                        <h4>{tx("Leads mais quentes", "最热线索")}</h4>
                      </div>
                      <span>{tx(`${formatNumber(results.length)} itens`, `${formatNumber(results.length)} 条`)}</span>
                    </div>

                    <div className="prospecting-lead-rail-list">
                      {results.length ? (
                        results.slice(0, 6).map((lead, index) => (
                          <button
                            key={lead.id}
                            type="button"
                            className={`prospecting-lead-rail-item${lead.id === selectedLead?.id ? " active" : ""}`}
                            onClick={() => setSelectedLeadId(lead.id)}
                          >
                            <span className={`prospecting-lead-rail-index tone-${leadMarkerTone(lead.status)}`}>{index + 1}</span>
                            <div>
                              <strong>{lead.displayName}</strong>
                              <small>{lead.city || tx("Cidade livre", "城市未填写")}, {lead.state}</small>
                            </div>
                            <span className="score-pill">{tx(`Score ${lead.score.toFixed(0)}`, `评分 ${lead.score.toFixed(0)}`)}</span>
                          </button>
                        ))
                      ) : (
                        <div className="prospecting-lead-rail-empty">
                          {emptySearchNeedsSetup ? (
                            <div className="prospecting-setup-callout">
                              <strong>{tx("Google Places nao configurado", "Google Places 未配置")}</strong>
                              <p>{emptySearchWithoutSetupMessage}</p>
                            </div>
                          ) : null}
                          <strong>{tx("Fila aguardando busca", "队列等待搜索")}</strong>
                          <p>{tx("Defina palavra-chave, estado e opcionalmente cidade para preencher o painel com leads da regiao.", "请设置关键词、州以及可选城市，以便用该地区线索填充面板。")}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </aside>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{tx("Carteira priorizada", "优先线索池")}</p>
                <h3>{tx("Leads priorizados para prospeccao", "优先线索列表")}</h3>
                <p className="panel-subcopy">{searchResponse?.notice ?? tx("Faca uma busca para carregar os leads.", "先执行一次搜索以加载线索。")}</p>
              </div>
            </div>

            <div className="queue-list">
              {results.map((lead) => {
                const isMine = lead.assignedTo?.id === user?.id;
                const isSelected = lead.id === selectedLead?.id;

                return (
                  <article
                    key={lead.id}
                    className={`queue-card prospecting-lead-card${isSelected ? " is-selected" : ""}`}
                    onMouseEnter={() => setSelectedLeadId(lead.id)}
                  >
                    <div className="queue-card-top">
                      <div className="queue-card-heading">
                        <div className="agenda-title">
                          <h3>{lead.displayName}</h3>
                          <span className="score-pill">{tx(`Score ${lead.score.toFixed(0)}`, `评分 ${lead.score.toFixed(0)}`)}</span>
                          <span className={`status-badge status-${lead.status.toLowerCase()}`}>{leadStatusLabel(lead.status, tx)}</span>
                        </div>
                        <p className="queue-card-note">
                          {lead.primaryCategory || tx("Categoria principal nao informada", "未提供主营类别")} - {lead.city || tx("Cidade livre", "城市未填写")}, {lead.state}
                        </p>
                        <p className="queue-card-note">{lead.address || tx("Endereco ainda nao carregado nessa etapa.", "当前阶段尚未加载地址。")}</p>
                      </div>

                      <div className="queue-card-score">
                        <strong>{lead.assignedTo ? lead.assignedTo.name : tx("Livre", "空闲")}</strong>
                        <small>{lead.assignedTo ? tx("Responsavel atual", "当前负责人") : tx("Disponivel", "可领取")}</small>
                      </div>
                    </div>

                    <div className="queue-card-meta">
                      <span>
                        <Building2 size={14} />
                        {lead.primaryCategory || tx("Sem categoria", "无类别")}
                      </span>
                      <span>
                        <Target size={14} />
                        {lead.reviewCount ? tx(`${formatNumber(lead.reviewCount)} avaliacoes`, `${formatNumber(lead.reviewCount)} 条评价`) : tx("Avaliacoes sob demanda", "按需加载评价")}
                      </span>
                      <span>
                        <Phone size={14} />
                        {lead.phone || tx("Telefone ao assumir o lead", "领取后查看电话")}
                      </span>
                      <span>
                        <UserCheck size={14} />
                        {lead.firstContactAt ? tx(`Primeiro contato em ${formatDate(lead.firstContactAt)}`, `首次联系于 ${formatDate(lead.firstContactAt)}`) : tx("Ainda nao trabalhado", "尚未跟进")}
                      </span>
                    </div>

                    <div className="queue-card-actions">
                      <button type="button" className="ghost-button small" onClick={() => setSelectedLeadId(lead.id)}>
                        <MapPinned size={14} />
                        {tx("Ver no mapa", "在地图查看")}
                      </button>

                      {lead.mapsUrl ? (
                        <a className="ghost-button small" href={lead.mapsUrl} target="_blank" rel="noreferrer">
                          <MapPinned size={14} />
                          {tx("Abrir no Maps", "打开地图")}
                        </a>
                      ) : null}

                      {lead.websiteUrl ? (
                        <a className="ghost-button small" href={lead.websiteUrl} target="_blank" rel="noreferrer">
                          <ExternalLink size={14} />
                          {tx("Site", "网站")}
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
                          {tx("Assumir lead", "领取线索")}
                        </button>
                      ) : null}

                      {isMine ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => setActiveContactLeadId((current) => (current === lead.id ? null : lead.id))}
                        >
                          {tx("Registrar contato", "登记联系")}
                        </button>
                      ) : null}

                      {isMine && !lead.firstContactAt ? (
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => releaseMutation.mutate(lead.id)}
                          disabled={releaseMutation.isPending}
                        >
                          {tx("Liberar lead", "释放线索")}
                        </button>
                      ) : null}

                      {(isMine || !lead.assignedTo) ? (
                        <button
                          type="button"
                          className="ghost-button danger"
                          onClick={() => discardMutation.mutate(lead.id)}
                          disabled={discardMutation.isPending}
                        >
                          {tx("Descartar", "丢弃")}
                        </button>
                      ) : null}
                    </div>

                    {activeContactLeadId === lead.id && isMine ? (
                      <div style={{ borderTop: "1px solid var(--line)", paddingTop: "1rem", display: "grid", gap: "0.85rem" }}>
                        <div className="filters-grid filters-grid-four">
                          <label>
                            {tx("Canal", "渠道")}
                            <select
                              value={contactForm.channel}
                              onChange={(event) =>
                                setContactForm((current) => ({ ...current, channel: event.target.value as ProspectContactChannel }))
                              }
                            >
                              <option value="WHATSAPP">WhatsApp</option>
                              <option value="PHONE">{tx("Ligacao", "电话")}</option>
                              <option value="SITE">Site</option>
                              <option value="OTHER">{tx("Outro", "其他")}</option>
                            </select>
                          </label>

                          <label>
                            {tx("Tipo", "类型")}
                            <select
                              value={contactForm.contactType}
                              onChange={(event) =>
                                setContactForm((current) => ({ ...current, contactType: event.target.value as ProspectContactType }))
                              }
                            >
                              <option value="FIRST_CONTACT">{tx("Primeiro contato", "首次联系")}</option>
                              <option value="FOLLOW_UP">Follow-up</option>
                              <option value="NO_RESPONSE">{tx("Sem resposta", "未回复")}</option>
                              <option value="INTERESTED">{tx("Interessado", "有兴趣")}</option>
                              <option value="DISQUALIFIED">{tx("Desqualificado", "不合格")}</option>
                            </select>
                          </label>

                          <label className="full-span">
                            {tx("Observacao", "备注")}
                            <textarea
                              rows={3}
                              value={contactForm.notes}
                              onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))}
                              placeholder={tx("Ex.: pediu retorno depois do almoco.", "例：要求午饭后回电。")}
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
                            {tx("Salvar tentativa", "保存记录")}
                          </button>
                          <button type="button" className="ghost-button" onClick={() => setActiveContactLeadId(null)}>
                            {tx("Cancelar", "取消")}
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
              <p className="eyebrow">{tx("Painel operacional", "运营面板")}</p>
              <h3>{tx("Meta, uso e protecao da franquia", "目标、使用情况与配额保护")}</h3>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-card-badge">{tx("Meta do dia", "今日目标")}</span>
              <strong>{summaryQuery.data ? `${summaryQuery.data.uniqueContactsToday}/${summaryQuery.data.dailyTarget}` : "--"}</strong>
              <span>{summaryQuery.data ? tx(`${summaryQuery.data.remainingToGoal} para bater a meta`, `距离目标还差 ${summaryQuery.data.remainingToGoal}`) : tx("Carregando...", "加载中...")}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card-badge">{tx("Leads assumidos", "已领取线索")}</span>
              <strong>{summaryQuery.data ? formatNumber(summaryQuery.data.claimedLeadCount) : "--"}</strong>
              <span>{tx(`${user?.name ?? "Vendedora"} em operacao hoje`, `${user?.name ?? "销售"} 今日在岗`)}</span>
            </div>
            <div className={`stat-card ${quota ? quotaTone(quota.textSearch.dailyUsed, quota.textSearch.dailyLimit) : ""}`}>
              <span className="stat-card-badge">{tx("Busca hoje", "今日搜索")}</span>
              <strong>{quota ? `${formatNumber(quota.textSearch.dailyUsed)}/${formatNumber(quota.textSearch.dailyLimit)}` : "--"}</strong>
              <span>{tx("Trava diaria para nao estourar a faixa gratis", "每日限额，避免超出免费区间")}</span>
            </div>
            <div className={`stat-card ${quota ? quotaTone(quota.placeDetails.dailyUsed, quota.placeDetails.dailyLimit) : ""}`}>
              <span className="stat-card-badge">{tx("Detalhes hoje", "今日详情查询")}</span>
              <strong>{quota ? `${formatNumber(quota.placeDetails.dailyUsed)}/${formatNumber(quota.placeDetails.dailyLimit)}` : "--"}</strong>
              <span>{tx("Telefone e site aparecem sob demanda", "电话和网站按需加载")}</span>
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
