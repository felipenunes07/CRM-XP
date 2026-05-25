import { useEffect, useMemo, useState, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MessageTemplate,
  SavedSegment,
  WhatsappCampaignDetail,
  WhatsappCampaignRecipient,
  WhatsappGroup,
  WhatsappGroupClassification,
  WhatsappGroupMappingStatus,
} from "@olist-crm/shared";
import { CheckCircle2, Clock3, LoaderCircle, Send, ShieldAlert, XCircle, Plus, ArrowRight, Filter, Check, Trash2, HelpCircle, Info, Users, Smartphone, PlusCircle, Sparkles, ChevronRight, ChevronLeft, Award, Search } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDateTime, formatNumber, formatPercent } from "../lib/format";

type QuickFilter = "ALL" | "WITH_ORDER" | "NO_ORDER_EXCEL" | "OTHER" | "PENDING_REVIEW";
type RecentBlockFilter = "AVAILABLE_ONLY" | "ALL" | "BLOCKED_ONLY";

const quickFilters: Array<{ value: QuickFilter; label: string; description: string }> = [
  { value: "ALL", label: "Todos", description: "Toda a base importada." },
  { value: "WITH_ORDER", label: "Com pedido", description: "Grupos CL e KH." },
  { value: "NO_ORDER_EXCEL", label: "Nunca comprou", description: "Grupos do Excel marcados como Cliente." },
  { value: "OTHER", label: "Outros", description: "LJ, internos e demais grupos." },
  { value: "PENDING_REVIEW", label: "Pendentes", description: "Sem mapeamento fechado." },
];



function buildGroupsQueryParams(input: {
  quickFilter: QuickFilter;
  search: string;
  savedSegmentId: string;
  onlyRecentlyBlocked: boolean;
}) {
  const params: Record<string, string | boolean | undefined> = {
    search: input.search || undefined,
    savedSegmentId: input.savedSegmentId || undefined,
    onlyRecentlyBlocked: input.onlyRecentlyBlocked || undefined,
  };

  if (input.quickFilter === "WITH_ORDER" || input.quickFilter === "NO_ORDER_EXCEL" || input.quickFilter === "OTHER") {
    params.classification = input.quickFilter;
  }

  if (input.quickFilter === "PENDING_REVIEW") {
    params.mappingStatus = "PENDING_REVIEW";
  }

  return params;
}

function classificationLabel(value: WhatsappGroupClassification) {
  if (value === "WITH_ORDER") return "Cliente com pedido";
  if (value === "NO_ORDER_EXCEL") return "Nunca comprou";
  return "Outro grupo";
}

function mappingStatusLabel(value: WhatsappGroupMappingStatus) {
  if (value === "AUTO_MAPPED") return "Mapeado auto";
  if (value === "MANUAL_MAPPED") return "Mapeado manual";
  if (value === "CONFIRMED_UNMATCHED") return "Sem cliente";
  if (value === "IGNORED") return "Ignorado";
  return "Pendente";
}

function campaignStatusTone(status: WhatsappCampaignDetail["status"]) {
  if (status === "COMPLETED") return "success";
  if (status === "CANCELLED") return "danger";
  return "warning";
}

function recipientTone(status: WhatsappCampaignRecipient["status"]) {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  if (status === "BLOCKED_RECENT" || status === "SKIPPED") return "warning";
  return "neutral";
}

function renderRecipientIdentifier(recipient: WhatsappCampaignRecipient) {
  const displayName = recipient.customerDisplayName || recipient.customerCode;
  const isGroup = recipient.jid.endsWith("@g.us") || recipient.jid.includes("-");
  const jidNum = recipient.jid.split("@")[0] || recipient.jid;
  const formattedJid = isGroup
    ? `👥 Grupo: ${jidNum}`
    : `📞 +${jidNum.slice(0, 2)} (${jidNum.slice(2, 4)}) ${jidNum.slice(4, 9)}-${jidNum.slice(9)}`;

  return (
    <div className="wp-recipient-info-col">
      <strong className="wp-recipient-row-name" style={{ color: "#0f172a", fontSize: "0.92rem", fontWeight: 700 }}>
        {displayName || recipient.sourceName || (isGroup ? "Grupo de WhatsApp" : "Cliente WhatsApp")}
      </strong>
      <span className="wp-recipient-row-jid" style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
        {formattedJid}
      </span>
    </div>
  );
}

function recipientLiveLabel(recipient: WhatsappCampaignRecipient) {
  if (recipient.status === "SENT") {
    return `Enviado ${formatDateTime(recipient.sentAt)}`;
  }

  if (recipient.status === "FAILED") {
    return recipient.lastError || "Falha no envio";
  }

  if (recipient.status === "SENDING") {
    return "Enviando agora";
  }

  if (recipient.status === "PENDING") {
    return `Agendado para ${formatDateTime(recipient.scheduledFor)}`;
  }

  if (recipient.status === "BLOCKED_RECENT") {
    return "Bloqueado por contato recente";
  }

  return "Pulado";
}

function formatCountdown(targetAt: string | null, nowMs: number) {
  if (!targetAt) {
    return null;
  }

  const targetMs = new Date(targetAt).getTime();
  if (!Number.isFinite(targetMs)) {
    return null;
  }

  const diffMs = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.ceil(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function truncateText(value: string | null | undefined, maxLength = 96) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function quickFilterCount(
  filter: QuickFilter,
  summary:
    | {
        totalGroups: number;
        pendingReviewGroups: number;
        classificationCounts: Record<WhatsappGroupClassification, number>;
      }
    | undefined,
) {
  if (!summary) return "--";
  if (filter === "ALL") return formatNumber(summary.totalGroups);
  if (filter === "PENDING_REVIEW") return formatNumber(summary.pendingReviewGroups);
  return formatNumber(summary.classificationCounts[filter]);
}

export function DisparadorPage() {
  const auth = useAuth() as {
    token: string | null;
    user: { role: "ADMIN" | "MANAGER" | "SELLER"; name: string } | null;
  };
  const { token, user } = auth;
  const canImport = ["ADMIN", "MANAGER"].includes(user?.role ?? "");
  const queryClient = useQueryClient();


  const [quickFilter, setQuickFilter] = useState<QuickFilter>("ALL");
  const [search, setSearch] = useState("");
  const [savedSegmentId, setSavedSegmentId] = useState("");
  const [recentBlockFilter, setRecentBlockFilter] = useState<RecentBlockFilter>("AVAILABLE_ONLY");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [overrideRecentBlock, setOverrideRecentBlock] = useState(false);
  const [minDelaySeconds, setMinDelaySeconds] = useState(183);
  const [maxDelaySeconds, setMaxDelaySeconds] = useState(304);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [attemptedAutoImport, setAttemptedAutoImport] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Step-by-step states
  const [activeTab, setActiveTab] = useState<"NEW_CAMPAIGN" | "HISTORY">("NEW_CAMPAIGN");
  const [currentStep, setCurrentStep] = useState(3); // Start at step 3 to align with user's tab "Destinatários" or step 1
  const [abTestActive, setAbTestActive] = useState(false);
  const [abMessageText, setAbMessageText] = useState("");
  const [selectedAbTemplateId, setSelectedAbTemplateId] = useState("");
  
  const whatsappInstancesQuery = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: () => api.whatsappInstances(token!),
    enabled: Boolean(token),
  });

  interface SenderItem {
    id: string;
    name: string;
    role: string;
    phone: string;
    avatarUrl: string;
    status?: string;
  }

  // Real Senders derived from the backend whatsappInstancesQuery
  const senders: SenderItem[] = useMemo(() => {
    const list = whatsappInstancesQuery.data ?? [];
    if (list.length === 0) {
      return [
        { id: "default", name: "Carregando...", role: "WhatsApp", phone: "", avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80", status: "DISCONNECTED" }
      ];
    }
    return list.map(instance => ({
      id: instance.id,
      name: instance.displayLabel || instance.instanceName || "Canal WhatsApp",
      role: instance.assignedUserName || "Conexão",
      phone: instance.phoneNumber || "Sem número",
      avatarUrl: instance.profilePictureUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
      status: instance.status
    }));
  }, [whatsappInstancesQuery.data]);

  const [selectedSenderIds, setSelectedSenderIds] = useState<string[]>([]);

  // Auto-select all active senders when loaded
  useEffect(() => {
    if (whatsappInstancesQuery.data && whatsappInstancesQuery.data.length > 0) {
      const activeIds = whatsappInstancesQuery.data
        .filter(inst => inst.status === "ACTIVE")
        .map(inst => inst.id);
      const firstId = whatsappInstancesQuery.data[0]?.id;
      if (firstId) {
        setSelectedSenderIds(activeIds.length ? activeIds : [firstId]);
      }
    }
  }, [whatsappInstancesQuery.data]);
  const [recipientSenderMapping, setRecipientSenderMapping] = useState<Record<string, string>>({}); // groupId -> senderId

  // Tooltip tracking
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const groupQueryParams = useMemo(
    () =>
      buildGroupsQueryParams({
        quickFilter,
        search,
        savedSegmentId,
        onlyRecentlyBlocked: recentBlockFilter === "BLOCKED_ONLY",
      }),
    [quickFilter, recentBlockFilter, savedSegmentId, search],
  );

  async function invalidateWhatsappQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["whatsapp-group-mapping-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["whatsapp-groups"] }),
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
    ]);
  }

  const templatesQuery = useQuery({
    queryKey: ["message-templates"],
    queryFn: () => api.messageTemplates(token!),
    enabled: Boolean(token),
  });

  const savedSegmentsQuery = useQuery({
    queryKey: ["saved-segments"],
    queryFn: () => api.savedSegments(token!),
    enabled: Boolean(token),
  });




  const mappingSummaryQuery = useQuery({
    queryKey: ["whatsapp-group-mapping-summary"],
    queryFn: () => api.whatsappGroupMappingSummary(token!),
    enabled: Boolean(token),
  });

  const groupsQuery = useQuery({
    queryKey: ["whatsapp-groups", groupQueryParams],
    queryFn: () => api.whatsappGroups(token!, groupQueryParams),
    enabled: Boolean(token),
  });

  const campaignsQuery = useQuery({
    queryKey: ["whatsapp-campaigns"],
    queryFn: () => api.whatsappCampaigns(token!, 20),
    enabled: Boolean(token),
    refetchInterval: (query) =>
      query.state.data?.some((campaign) => ["QUEUED", "IN_PROGRESS"].includes(campaign.status)) ? 5000 : false,
  });

  const selectedCampaignQuery = useQuery({
    queryKey: ["whatsapp-campaign", selectedCampaignId],
    queryFn: () => api.whatsappCampaign(token!, selectedCampaignId!, { limit: 80, offset: 0 }),
    enabled: Boolean(token && selectedCampaignId),
    refetchInterval: (query) =>
      query.state.data && ["QUEUED", "IN_PROGRESS"].includes(query.state.data.status) ? 3000 : false,
  });

  const importDefaultMutation = useMutation({
    mutationFn: () => api.importWhatsappGroupsDefault(token!),
    onSuccess: async () => {
      await invalidateWhatsappQueries();
    },
  });



  const createCampaignMutation = useMutation({
    mutationFn: () =>
      api.createWhatsappCampaign(token!, {
        name: campaignName.trim() || `Disparo ${new Date().toLocaleDateString("pt-BR")}`,
        templateId: selectedTemplateId || null,
        savedSegmentId: savedSegmentId || null,
        messageText,
        filtersSnapshot: {
          quickFilter,
          search,
          savedSegmentId: savedSegmentId || null,
          recentBlockFilter,
          selectedCount: selectedGroupIds.length,
        },
        groupIds: selectedGroupIds,
        overrideRecentBlock,
        minDelaySeconds,
        maxDelaySeconds,
      }),
    onSuccess: async (campaign) => {
      setSelectedCampaignId(campaign?.id ?? null);
      setSelectedGroupIds([]);
      await invalidateWhatsappQueries();
      setActiveTab("HISTORY");
    },
  });

  const activeCampaignId = useMemo(() => {
    if (createCampaignMutation.data?.id) {
      return createCampaignMutation.data.id;
    }

    const activeCampaign = campaignsQuery.data?.find((campaign) => ["QUEUED", "IN_PROGRESS"].includes(campaign.status));
    return activeCampaign?.id ?? selectedCampaignId ?? null;
  }, [campaignsQuery.data, createCampaignMutation.data?.id, selectedCampaignId]);

  const activeCampaignQuery = useQuery({
    queryKey: ["whatsapp-campaign-live", activeCampaignId],
    queryFn: () => api.whatsappCampaign(token!, activeCampaignId!, { limit: 20, offset: 0 }),
    enabled: Boolean(token && activeCampaignId),
    refetchInterval: (query) =>
      query.state.data && ["QUEUED", "IN_PROGRESS"].includes(query.state.data.status) ? 1500 : false,
  });

  const cancelCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => api.cancelWhatsappCampaign(token!, campaignId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-campaign", selectedCampaignId] }),
      ]);
    },
  });

  useEffect(() => {
    if (!selectedTemplateId) return;
    const template = templatesQuery.data?.find((item) => item.id === selectedTemplateId);
    if (!template) return;

    setMessageText(template.content);
    setCampaignName((current) => current || `${template.title} ${new Date().toLocaleDateString("pt-BR")}`);
  }, [selectedTemplateId, templatesQuery.data]);

  useEffect(() => {
    if (!canImport || attemptedAutoImport || importDefaultMutation.isPending) {
      return;
    }

    setAttemptedAutoImport(true);
    importDefaultMutation.mutate();
  }, [attemptedAutoImport, canImport, importDefaultMutation]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const loadedGroups = groupsQuery.data?.items ?? [];
  const filteredGroups = useMemo(() => {
    if (recentBlockFilter !== "AVAILABLE_ONLY") {
      return loadedGroups;
    }

    return loadedGroups.filter((group) => !group.isRecentlyBlocked);
  }, [loadedGroups, recentBlockFilter]);
  const selectedGroupCount = selectedGroupIds.length;
  const allVisibleSelected =
    filteredGroups.length > 0 && filteredGroups.every((group) => selectedGroupIds.includes(group.id));

  const selectedSavedSegment = savedSegmentsQuery.data?.find((segment) => segment.id === savedSegmentId) ?? null;
  const selectedTemplate = templatesQuery.data?.find((template) => template.id === selectedTemplateId) ?? null;
  const importSummary = importDefaultMutation.data;
  const importError = importDefaultMutation.error as Error | null;
  const isImporting = importDefaultMutation.isPending;
  const liveCampaign = activeCampaignQuery.data ?? selectedCampaignQuery.data ?? createCampaignMutation.data ?? null;
  const liveCampaignFirstFailure = liveCampaign?.recipients.find((recipient) => recipient.status === "FAILED") ?? null;
  const liveCampaignIsRunning = liveCampaign ? ["QUEUED", "IN_PROGRESS"].includes(liveCampaign.status) : false;
  const nextDispatchCountdown = liveCampaign ? formatCountdown(liveCampaign.progress.nextScheduledAt, nowMs) : null;
  const hiddenBlockedCount = useMemo(() => {
    if (recentBlockFilter !== "AVAILABLE_ONLY") {
      return 0;
    }

    return loadedGroups.filter((group) => group.isRecentlyBlocked).length;
  }, [loadedGroups, recentBlockFilter]);
  const liveRecipients = useMemo(() => {
    if (!liveCampaign?.recipients.length) {
      return [];
    }

    const statusOrder: Record<WhatsappCampaignRecipient["status"], number> = {
      SENDING: 0,
      PENDING: 1,
      FAILED: 2,
      BLOCKED_RECENT: 3,
      SENT: 4,
      SKIPPED: 5,
    };

    return [...liveCampaign.recipients]
      .sort((left, right) => {
        const orderDiff = statusOrder[left.status] - statusOrder[right.status];
        if (orderDiff !== 0) {
          return orderDiff;
        }

        const leftTime = left.scheduledFor ? new Date(left.scheduledFor).getTime() : 0;
        const rightTime = right.scheduledFor ? new Date(right.scheduledFor).getTime() : 0;
        return leftTime - rightTime;
      })
      .slice(0, 8);
  }, [liveCampaign]);
  const hasMessage = Boolean(messageText.trim());
  const isReadyToDispatch = hasMessage && selectedGroupCount > 0;
  const dispatchButtonLabel = createCampaignMutation.isPending
    ? "Criando campanha..."
    : selectedGroupCount > 0
      ? `Disparar para ${formatNumber(selectedGroupCount)} grupos`
      : "Selecione grupos para disparar";
  const composeHelperText = !hasMessage
    ? "Escreva ou escolha a mensagem final para liberar o disparo."
    : selectedGroupCount === 0
      ? "Selecione os grupos abaixo para habilitar o disparo."
      : `Delay configurado entre ${minDelaySeconds}s e ${maxDelaySeconds}s por envio.`;



  function toggleGroupSelection(groupId: string) {
    setSelectedGroupIds((current) =>
      current.includes(groupId) ? current.filter((item) => item !== groupId) : [...current, groupId],
    );
  }

  function toggleVisibleSelection() {
    const visibleIds = filteredGroups.map((group) => group.id);
    setSelectedGroupIds((current) => {
      if (allVisibleSelected) {
        return current.filter((groupId) => !visibleIds.includes(groupId));
      }

      return [...new Set([...current, ...visibleIds])];
    });
  }


  function changeGroupSender(groupId: string, senderId: string) {
    setRecipientSenderMapping(current => ({
      ...current,
      [groupId]: senderId
    }));
  }

  function toggleSenderSelection(id: string) {
    setSelectedSenderIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    );
  }


  return (
    <div className="page-stack">
      {/* ── TOP NAV SEGMENTED CONTROL TABS ── */}
      <div className="z-tabs" style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          className={`z-tab ${activeTab === "NEW_CAMPAIGN" ? "active" : ""}`}
          onClick={() => setActiveTab("NEW_CAMPAIGN")}
        >
          <Plus size={16} />
          Nova Campanha
        </button>
        <button
          type="button"
          className={`z-tab ${activeTab === "HISTORY" ? "active" : ""}`}
          onClick={() => setActiveTab("HISTORY")}
        >
          <Clock3 size={16} />
          Histórico de Campanhas
        </button>
      </div>

      {/* ── TAB 1: NEW CAMPAIGN STEPPER WIZARD ── */}
      {activeTab === "NEW_CAMPAIGN" && (
        <>
          {/* ── STEPPER COMPONENT ── */}
          <div className="wp-stepper">
            <button
              type="button"
              className={`wp-step ${currentStep === 1 ? "active" : ""} ${currentStep > 1 ? "completed" : ""}`}
              onClick={() => setCurrentStep(1)}
            >
              <span className="wp-step-num">{currentStep > 1 ? <Check size={14} /> : "1"}</span>
              <span>Criação</span>
            </button>
            <span className="wp-step-arrow"><ChevronRight size={14} /></span>

            <button
              type="button"
              className={`wp-step ${currentStep === 2 ? "active" : ""} ${currentStep > 2 ? "completed" : ""}`}
              onClick={() => setCurrentStep(2)}
            >
              <span className="wp-step-num">{currentStep > 2 ? <Check size={14} /> : "2"}</span>
              <span>Remetentes</span>
            </button>
            <span className="wp-step-arrow"><ChevronRight size={14} /></span>

            <button
              type="button"
              className={`wp-step ${currentStep === 3 ? "active" : ""} ${currentStep > 3 ? "completed" : ""}`}
              onClick={() => setCurrentStep(3)}
            >
              <span className="wp-step-num">{currentStep > 3 ? <Check size={14} /> : "3"}</span>
              <span>Destinatários</span>
            </button>
            <span className="wp-step-arrow"><ChevronRight size={14} /></span>

            <button
              type="button"
              className={`wp-step ${currentStep === 4 ? "active" : ""} ${currentStep > 4 ? "completed" : ""}`}
              onClick={() => setCurrentStep(4)}
            >
              <span className="wp-step-num">{currentStep > 4 ? <Check size={14} /> : "4"}</span>
              <span>Mensagem</span>
            </button>
            <span className="wp-step-arrow"><ChevronRight size={14} /></span>

            <button
              type="button"
              className={`wp-step ${currentStep === 5 ? "active" : ""} ${currentStep > 5 ? "completed" : ""}`}
              onClick={() => setCurrentStep(5)}
            >
              <span className="wp-step-num">5</span>
              <span>Revisão</span>
            </button>

            <div className="wp-stepper-progress" style={{ width: `${((currentStep - 1) / 4) * 100}%` }} />
          </div>

          {/* ── WIZARD WORKSPACE ── */}
          <div className={`wp-wizard-layout ${currentStep === 1 ? "full-width" : ""}`}>
            
            {/* LEFT COLUMN: ACTIVE STEP */}
            <div className="wp-wizard-main">
              
              {/* STEP 1: CRIAÇÃO */}
              {currentStep === 1 && (
                <div className="wp-card-step">
                  {/* Circular step indicator */}
                  <div className="wp-card-step-badge">01</div>
                  
                  {/* Step tab header */}
                  <div className="wp-card-step-header">
                    <h3 className="wp-card-step-title">Criação</h3>
                  </div>

                  {/* Input Label with Icon */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "0.5rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.95rem", fontWeight: 700, color: "#18181b" }}>
                      <PlusCircle size={18} style={{ color: "#10b981" }} />
                      Digite o título da sua campanha
                    </label>
                    
                    {/* Input Container */}
                    <div className="wp-card-input-container">
                      <input
                        value={campaignName}
                        onChange={(event) => setCampaignName(event.target.value)}
                        placeholder="Digite o nome da campanha..."
                        className="wp-card-input"
                      />
                    </div>
                  </div>

                  {/* Advanced Anti-Spam settings inside a beautifully integrated sub-card */}
                  {canImport && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", background: "#f8fafc", padding: "1.25rem", borderRadius: "12px", border: "1px solid #e2e8f0", marginTop: "0.5rem" }}>
                      <h4 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Configurações Anti-Spam (Recomendado)
                      </h4>
                      
                      <div className="whatsapp-delay-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                        <div className="whatsapp-delay-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>Delay mínimo (segundos)</span>
                          <input
                            type="number"
                            min={1}
                            value={minDelaySeconds}
                            onChange={(event) => setMinDelaySeconds(Number(event.target.value) || 1)}
                            className="wp-card-input"
                            style={{ padding: "0.5rem 0.75rem", fontSize: "0.9rem" }}
                          />
                        </div>

                        <div className="whatsapp-delay-field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#475569" }}>Delay máximo (segundos)</span>
                          <input
                            type="number"
                            min={1}
                            value={maxDelaySeconds}
                            onChange={(event) => setMaxDelaySeconds(Number(event.target.value) || 1)}
                            className="wp-card-input"
                            style={{ padding: "0.5rem 0.75rem", fontSize: "0.9rem" }}
                          />
                        </div>
                      </div>
                      
                      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.75rem", marginTop: "0.25rem" }}>
                        <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={overrideRecentBlock}
                            onChange={(event) => setOverrideRecentBlock(event.target.checked)}
                            style={{ marginTop: "3px" }}
                          />
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>
                              Ignorar o bloqueio de proteção anti-spam de 7 dias
                            </span>
                            <span style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
                              Use com moderação. Forçar disparos recentes aumenta riscos de block.
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Navigation row inside the card */}
                  <div className="wp-card-nav-row">
                    <button
                      type="button"
                      className="wp-card-btn-back"
                      onClick={() => setActiveTab("HISTORY")}
                    >
                      ‹ Voltar ao Histórico
                    </button>
                    
                    <button
                      type="button"
                      className="wp-card-btn-next"
                      onClick={() => setCurrentStep(2)}
                      disabled={!campaignName.trim()}
                      style={{ opacity: campaignName.trim() ? 1 : 0.6 }}
                    >
                      Continuar
                    </button>
                  </div>

                  {/* Step Footer */}
                  <div className="wp-card-step-footer">
                    <h4 className="wp-card-step-footer-title">Crie sua campanha</h4>
                    <p className="wp-card-step-footer-subtitle">Defina seu público, conteúdo e objetivos.</p>
                  </div>
                </div>
              )}

              {/* STEP 2: REMETENTES */}
              {currentStep === 2 && (
                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <h3>Selecionar Remetentes</h3>
                      <p className="panel-subcopy">Marque as conexões de WhatsApp reais que serão usadas para realizar os disparos desta campanha.</p>
                    </div>
                  </div>

                  {whatsappInstancesQuery.isLoading ? (
                    <div className="page-loading">Buscando conexões de WhatsApp ativas...</div>
                  ) : senders.length === 0 || (senders.length === 1 && senders[0]?.id === "default") ? (
                    <div className="empty-panel" style={{ padding: "3rem 1rem" }}>
                      <div className="empty-state">
                        Nenhuma linha de WhatsApp conectada encontrada no seu painel. Conecte uma linha na tela de Configuração de Usuários/WhatsApp para disparar!
                      </div>
                    </div>
                  ) : (
                    <div className="wp-senders-grid" style={{ marginTop: "1.5rem" }}>
                      {senders.map((sender) => (
                        <div
                          key={sender.id}
                          className={`wp-sender-card ${selectedSenderIds.includes(sender.id) ? "selected" : ""}`}
                          onClick={() => {
                            if (sender.status !== "ACTIVE") return; // Only allow selecting active lines
                            toggleSenderSelection(sender.id);
                          }}
                          style={{ opacity: sender.status === "ACTIVE" ? 1 : 0.6, cursor: sender.status === "ACTIVE" ? "pointer" : "not-allowed" }}
                        >
                          <img src={sender.avatarUrl} alt={sender.name} className="wp-sender-avatar" />
                          <div className="wp-sender-info">
                            <h4 className="wp-sender-name">{sender.name}</h4>
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px" }}>
                              <span className="wp-sender-role">{sender.role}</span>
                              <span className={`status-badge ${sender.status === "ACTIVE" ? "status-success" : "status-danger"}`} style={{ fontSize: "0.65rem", padding: "1px 6px" }}>
                                {sender.status === "ACTIVE" ? "Ativo" : sender.status === "PAUSED" ? "Pausado" : "Inativo"}
                              </span>
                            </div>
                            <p className="wp-profile-phone" style={{ margin: "4px 0 0 0" }}>{sender.phone}</p>
                          </div>
                          {selectedSenderIds.includes(sender.id) && (
                            <span className="wp-sender-checked">
                              <Check size={12} />
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )}

              {/* STEP 3: DESTINATÁRIOS */}
              {currentStep === 3 && (
                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Users size={18} style={{ color: "#10b981" }} />
                        Selecionar destinatários
                      </h3>
                      <p className="panel-subcopy">Mapeie as interações Remetente {"->"} Destinatário e acompanhe o nível de risco de bloqueio.</p>
                    </div>
                  </div>

                  {/* Toolbar */}
                  <div className="wp-recipients-toolbar" style={{ margin: "1rem 0" }}>
                    <div className="wp-search-wrapper">
                      <Search size={16} />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Pesquisar..."
                        className="wp-search-input"
                      />
                    </div>

                    <div className="wp-dropdown-container" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>Públicos Criados:</span>
                      <select
                        value={savedSegmentId}
                        onChange={(event) => setSavedSegmentId(event.target.value)}
                        className="wp-btn-action"
                        style={{ border: "1px solid var(--line)", background: "#fff", fontWeight: 600 }}
                      >
                        <option value="">Todos os destinatários</option>
                        {(savedSegmentsQuery.data ?? []).map((segment) => (
                          <option key={segment.id} value={segment.id}>
                            👥 {segment.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      className={`wp-btn-action ${recentBlockFilter === "AVAILABLE_ONLY" ? "primary" : ""}`}
                      onClick={() => setRecentBlockFilter("AVAILABLE_ONLY")}
                    >
                      Disponíveis
                    </button>

                    <button
                      type="button"
                      className={`wp-btn-action ${recentBlockFilter === "ALL" ? "primary" : ""}`}
                      onClick={() => setRecentBlockFilter("ALL")}
                    >
                      Todos
                    </button>

                    <button
                      type="button"
                      className="wp-btn-action"
                      onClick={() => setSelectedGroupIds([])}
                      disabled={selectedGroupCount === 0}
                    >
                      Limpar
                    </button>
                  </div>

                  {/* Groups table with custom styling */}
                  {groupsQuery.isLoading ? <div className="page-loading">Carregando grupos destinatários...</div> : null}

                  {groupsQuery.data?.items.length ? (
                    <div className="table-scroll" style={{ overflowX: "visible" }}>
                      <table className="wp-mapped-table">
                        <thead>
                          <tr>
                            <th style={{ width: "40px" }}>
                              <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={toggleVisibleSelection}
                              />
                            </th>
                            <th>Remetentes</th>
                            <th style={{ width: "30px", textAlign: "center" }}></th>
                            <th>Destinatários</th>
                            <th>Status (Spam Protection)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredGroups.map((group) => {
                            let riskClass: "low" | "attention" | "critical" = "low";
                            let riskLabel = "Baixo risco";
                            let riskTooltip = "Recomendada: essa interação não oferece riscos de bloqueio.";

                            if (group.isRecentlyBlocked) {
                              riskClass = "critical";
                              riskLabel = "Crítico";
                              riskTooltip = "Alerta: número foi bloqueado ou marcado recentemente. Risco altíssimo de bloqueio total!";
                            } else if (group.lastContactAt) {
                              const diffDays = (nowMs - new Date(group.lastContactAt).getTime()) / (1000 * 60 * 60 * 24);
                              if (diffDays <= 7) {
                                riskClass = "attention";
                                riskLabel = "Atenção";
                                riskTooltip = "Cuidado: interação feita nos últimos 7 dias. Disparos frequentes podem incomodar o cliente.";
                              }
                            }

                            const mappedSenderId = recipientSenderMapping[group.id] || "1";
                            const activeSender = (senders.find(s => s.id === mappedSenderId) || senders[0])!;

                            return (
                              <tr
                                key={group.id}
                                className={`wp-mapped-tr ${selectedGroupIds.includes(group.id) ? "is-selected" : ""}`}
                              >
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={selectedGroupIds.includes(group.id)}
                                    onChange={() => toggleGroupSelection(group.id)}
                                  />
                                </td>
                                
                                <td>
                                  <div className="wp-user-profile">
                                    <img src={activeSender.avatarUrl} alt={activeSender.name} className="wp-avatar-sm" />
                                    <div className="wp-profile-details">
                                      <span className="wp-profile-name">{activeSender.name}</span>
                                      <span className="wp-sender-role" style={{ fontSize: "0.68rem", padding: "0px 4px", marginTop: "1px", alignSelf: "flex-start" }}>
                                        {activeSender.role}
                                      </span>
                                      <select
                                        value={activeSender.id}
                                        onChange={(e) => changeGroupSender(group.id, e.target.value)}
                                        className="ghost-button"
                                        style={{ padding: "2px 6px", fontSize: "0.75rem", border: "1px solid var(--line)", marginTop: "4px" }}
                                      >
                                        {senders.filter(s => selectedSenderIds.includes(s.id)).map(s => (
                                          <option key={s.id} value={s.id}>Mapear para {s.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </td>

                                <td>
                                  <span className="wp-arrow-indicator">
                                    <ArrowRight size={16} />
                                  </span>
                                </td>

                                <td>
                                  <div className="wp-user-profile">
                                    <div className="wp-avatar-sm" style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", display: "grid", placeItems: "center", fontWeight: "bold", fontSize: "0.85rem" }}>
                                      {String(group.customerDisplayName || group.sourceName || "G").charAt(0).toUpperCase()}
                                    </div>
                                    <div className="wp-profile-details">
                                      <span className="wp-profile-name">{group.customerDisplayName || group.sourceName}</span>
                                      <span className="wp-profile-sub">{classificationLabel(group.classification)} • <span className="wp-profile-phone">{group.jid.split("@")[0]}</span></span>
                                    </div>
                                  </div>
                                </td>

                                <td style={{ position: "relative" }}>
                                  <span
                                    className={`wp-risk-badge ${riskClass}`}
                                    style={{ cursor: "help" }}
                                    onMouseEnter={(e) => {
                                      setHoveredGroupId(group.id);
                                      setTooltipPosition({ x: e.clientX - 100, y: e.clientY - 65 });
                                    }}
                                    onMouseLeave={() => setHoveredGroupId(null)}
                                  >
                                    {riskLabel}
                                  </span>

                                  {hoveredGroupId === group.id && (
                                    <div
                                      className="wp-tooltip-box"
                                      style={{
                                        position: "fixed",
                                        left: `${tooltipPosition.x}px`,
                                        top: `${tooltipPosition.y}px`,
                                      }}
                                    >
                                      {riskTooltip}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-panel" style={{ padding: "3rem 1rem" }}>
                      <div className="empty-state">
                        Nenhum destinatário encontrado com os filtros atuais.
                      </div>
                    </div>
                  )}
                </article>
              )}

              {/* STEP 4: MENSAGEM */}
              {currentStep === 4 && (
                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <h3>Conteúdo do Envio</h3>
                      <p className="panel-subcopy">Escolha ou crie a mensagem e confira o visual no simulador do smartphone.</p>
                    </div>
                  </div>

                  <div className="whatsapp-compose-editor-grid" style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "1.5rem" }}>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      <label>
                        Template de mensagem
                        <select
                          value={selectedTemplateId}
                          onChange={(event) => setSelectedTemplateId(event.target.value)}
                          className="wp-search-input"
                          style={{ paddingLeft: "12px", background: "#fff" }}
                        >
                          <option value="">Mensagem livre</option>
                          {(templatesQuery.data ?? []).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.title}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="whatsapp-message-field">
                        <span>Texto da Mensagem (Versão A)</span>
                        <textarea
                          rows={8}
                          value={messageText}
                          onChange={(event) => setMessageText(event.target.value)}
                          placeholder="Digite a mensagem principal que será enviada aos clientes..."
                        />
                      </label>

                      {abTestActive ? (
                        <div className="wp-ab-split">
                          <div className="wp-ab-split-header">
                            <span style={{ fontWeight: 600, color: "#10b981", display: "flex", alignItems: "center", gap: "4px" }}>
                              <Sparkles size={14} />
                              Mensagem Alternativa (Versão B)
                            </span>
                            <button
                              type="button"
                              className="ghost-button danger"
                              style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                              onClick={() => setAbTestActive(false)}
                            >
                              Remover B
                            </button>
                          </div>
                          
                          <label className="whatsapp-message-field" style={{ marginTop: "0.5rem" }}>
                            <textarea
                              rows={6}
                              value={abMessageText}
                              onChange={(e) => setAbMessageText(e.target.value)}
                              placeholder="Digite a variação de texto para o teste A/B..."
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <div className="wp-preview-device">
                        <div className="wp-preview-screen">
                          <div className="wp-preview-top-bar">
                            <Smartphone size={14} />
                            <span>Previa do Envio</span>
                          </div>
                          <div className="wp-preview-chat-area">
                            <div className="wp-preview-bubble">
                              {messageText || "Escreva a mensagem na esquerda para visualizar a prévia aqui..."}
                              <div className="wp-preview-bubble-meta">Apenas agora</div>
                            </div>

                            {abTestActive && abMessageText && (
                              <div className="wp-preview-bubble ab-split">
                                {abMessageText}
                                <div className="wp-preview-bubble-meta">Split A/B</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="panel-subcopy" style={{ textAlign: "center", marginTop: "8px" }}>
                        Simulador em tempo real de como a mensagem aparecerá para o usuário final.
                      </p>
                    </div>
                  </div>
                </article>
              )}

              {/* STEP 5: REVISÃO & DISPARO */}
              {currentStep === 5 && (
                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <h3>Revisão da Campanha</h3>
                      <p className="panel-subcopy">Tudo pronto! Verifique se as informações estão corretas antes de lançar.</p>
                    </div>
                  </div>

                  <div className="whatsapp-compose-summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.25rem", marginTop: "1rem" }}>
                    <div style={{ background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }}>
                      <span style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Campanha</span>
                      <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{campaignName || "Disparo Geral"}</strong>
                    </div>
                    
                    <div style={{ background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }}>
                      <span style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Destinatários</span>
                      <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{formatNumber(selectedGroupCount)} grupos mapeados</strong>
                      {selectedSavedSegment && (
                        <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted)", marginTop: "2px" }}>Segmento: {selectedSavedSegment.name}</span>
                      )}
                    </div>

                    <div style={{ background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }}>
                      <span style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Mensagem Ativa</span>
                      <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{abTestActive ? "Teste A/B (2 variações)" : "Variação única"}</strong>
                    </div>

                    <div style={{ background: "var(--bg-soft)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--line)" }}>
                      <span style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>Anti-spam Cadence</span>
                      <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{minDelaySeconds}s a {maxDelaySeconds}s</strong>
                      <span style={{ display: "block", fontSize: "0.75rem", color: overrideRecentBlock ? "var(--danger)" : "var(--success)", fontWeight: 600, marginTop: "2px" }}>
                        {overrideRecentBlock ? "⚠ Proteção 7-dias inativa" : "✓ Proteção 7-dias ativa"}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: "1.5rem" }}>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", fontWeight: 700 }}>Canais de Disparo Selecionados (Remetentes Reais)</h4>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {senders.filter(s => selectedSenderIds.includes(s.id)).map(s => (
                        <div key={s.id} className="wp-review-sender-pill" style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--bg-soft)", padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--line)" }}>
                          <img src={s.avatarUrl} alt={s.name} className="wp-avatar-sm" style={{ width: "20px", height: "20px", borderRadius: "50%" }} />
                          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{s.name} ({s.phone})</span>
                          <span className="status-badge status-success" style={{ fontSize: "0.6rem", padding: "0 4px" }}>Ativo</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: "1.5rem" }}>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "0.9rem", fontWeight: 700 }}>Conteúdo das Mensagens</h4>
                    <div style={{ background: "#f8fafc", border: "1px solid var(--line)", borderRadius: "12px", padding: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.75rem", fontWeight: 600, color: "var(--accent)" }}>
                        <span>VERSÃO A (PRINCIPAL)</span>
                        <span>{messageText.length} caracteres</span>
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: "0.88rem", background: "#fff", border: "1px solid rgba(0,0,0,0.05)", padding: "10px 14px", borderRadius: "8px", color: "var(--text)" }}>
                        {messageText || "Nenhuma mensagem definida."}
                      </div>
                      
                      {abTestActive && (
                        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed var(--line)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.75rem", fontWeight: 600, color: "#10b981" }}>
                            <span>VERSÃO B (A/B SPLIT)</span>
                            <span>{abMessageText.length} caracteres</span>
                          </div>
                          <div style={{ whiteSpace: "pre-wrap", fontSize: "0.88rem", background: "#fff", border: "1px solid rgba(0,0,0,0.05)", padding: "10px 14px", borderRadius: "8px", color: "var(--text)" }}>
                            {abMessageText || "Nenhuma variação definida."}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: "1.5rem", background: "rgba(16, 185, 129, 0.03)", padding: "1.25rem 1.5rem", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.15)" }}>
                    <h4 style={{ margin: "0 0 8px 0", color: "#059669", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }}>
                      <ShieldAlert size={16} />
                      Verificações de Segurança do Disparador
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: "20px", display: "grid", gap: "4px", fontSize: "0.82rem", color: "var(--muted)" }}>
                      <li>Cadência de delay configurada de forma natural para imitar o comportamento de digitação de agentes.</li>
                      <li>Contatos sob alto risco de proteção bloqueados ou sinalizados para evitar bloqueios da conta da empresa.</li>
                      <li>{abTestActive ? "Distribuição A/B ativada! Mensagens divididas reduzem o risco de algoritmos do WhatsApp rastrearem padrões." : "Dica: Considere ativar o teste A/B no passo anterior para reduzir o risco de bloqueios por texto repetitivo."}</li>
                    </ul>
                  </div>

                  <div className="whatsapp-wizard-nav" style={{ justifyContent: "center", border: "none", marginTop: "1.5rem" }}>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => createCampaignMutation.mutate()}
                      disabled={createCampaignMutation.isPending || !isReadyToDispatch}
                      style={{ padding: "1rem 2.5rem", fontSize: "1rem" }}
                    >
                      {createCampaignMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <Send size={18} />}
                      {dispatchButtonLabel}
                    </button>
                  </div>
                </article>
              )}

              {/* NAVIGATION FOOTER FOR WIZARD */}
              <div className="wp-wizard-nav">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setCurrentStep(current => Math.max(1, current - 1))}
                  disabled={currentStep === 1}
                >
                  <ChevronLeft size={16} />
                  Voltar
                </button>

                <span>Etapa {currentStep} de 5</span>

                {currentStep < 5 ? (
                  <button
                    type="button"
                    className="wp-btn-action primary"
                    onClick={() => setCurrentStep(current => Math.min(5, current + 1))}
                  >
                    Avançar
                    <ChevronRight size={16} />
                  </button>
                ) : (
                  <span />
                )}
              </div>

            </div>

            {/* RIGHT COLUMN: FLOATING STICKY SUMMARY CARD (LOOKS EXACTLY LIKE SCREENSHOT) */}
            {currentStep > 1 && (
              <div className="wp-float-side">
                <div className="wp-float-card">
                  
                  <div className="wp-float-card-header">
                    <span className="status-badge status-success" style={{ alignSelf: "flex-start", marginBottom: "8px" }}>Ativa</span>
                    <h3 className="wp-float-card-title">{campaignName || "Campanha #01"}</h3>
                    <p className="wp-float-card-subtitle">{formatNumber(selectedGroupCount)} disparos selecionados</p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div className="cw-user-avatar" style={{ width: "24px", height: "24px", fontSize: "0.6rem" }}>
                      {(user?.name || "L").charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{user?.name || "Lucas Oliveira"}</span>
                  </div>

                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <span className="wp-sender-role" style={{ fontSize: "0.7rem" }}>Vendas</span>
                    <span className="wp-sender-role" style={{ fontSize: "0.7rem" }}>MKT</span>
                    <span className="wp-sender-role" style={{ fontSize: "0.7rem", background: "rgba(0, 0, 0, 0.04)" }}>+2</span>
                  </div>

                  <p className="panel-subcopy" style={{ margin: 0, fontSize: "0.75rem" }}>
                    Criada em {new Date().toLocaleDateString("pt-BR")}
                  </p>

                  <div style={{ borderTop: "1px solid var(--line)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="wp-btn-action"
                      style={{ width: "100%", justifyContent: "center", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.25)", background: "rgba(16, 185, 129, 0.01)" }}
                      onClick={() => setAbTestActive(true)}
                    >
                      <Sparkles size={14} />
                      Adicionar A/B
                    </button>
                  </div>

                </div>
              </div>
            )}

          </div>
        </>
      )}

      {/* ── TAB 2: UNIFIED ACCOMPANIMENT & HISTORY DASHBOARD ── */}
      {activeTab === "HISTORY" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Header Row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#18181b", margin: 0 }}>Histórico de Campanhas</h2>
              <p style={{ fontSize: "0.9rem", color: "#71717a", margin: "0.25rem 0 0 0" }}>
                Acompanhe o desempenho e o status dos seus disparos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveTab("NEW_CAMPAIGN");
                setCurrentStep(1);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "#18181b",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                padding: "0.625rem 1.25rem",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                transition: "all 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#27272a"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#18181b"}
            >
              <Plus size={16} />
              Nova Campanha
            </button>
          </div>

          {/* Table Area */}
          <div className="z-table-wrapper" style={{ border: "1px solid #e4e4e7", borderRadius: "12px", background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.02)" }}>
            <table className="z-table">
              <thead>
                <tr>
                  <th style={{ padding: "1rem 1.5rem" }}>CAMPANHA</th>
                  <th style={{ padding: "1rem 1.5rem" }}>STATUS</th>
                  <th style={{ padding: "1rem 1.5rem" }}>PROGRESSO GERAL</th>
                  <th style={{ padding: "1rem 1.5rem", textAlign: "right" }}>AÇÕES</th>
                </tr>
              </thead>
              <tbody>
                {campaignsQuery.data && campaignsQuery.data.length > 0 ? (
                  campaignsQuery.data.map((campaign) => {
                    const isExpanded = selectedCampaignId === campaign.id;
                    const completionRatio = campaign.progress.completionRatio;
                    const pct = Math.round(completionRatio * 100);
                    
                    // Style attributes for Status
                    let statusBg = "#f1f5f9";
                    let statusColor = "#475569";
                    let statusBorder = "rgba(0, 0, 0, 0.05)";
                    let statusText: string = campaign.status;

                    if (campaign.status === "COMPLETED") {
                      statusBg = "#f0fdf4";
                      statusColor = "#166534";
                      statusBorder = "#bbf7d0";
                      statusText = "CONCLUÍDO";
                    } else if (campaign.status === "CANCELLED") {
                      statusBg = "#fef2f2";
                      statusColor = "#991b1b";
                      statusBorder = "#fecaca";
                      statusText = "CANCELLED";
                    } else if (campaign.status === "IN_PROGRESS") {
                      statusBg = "#eff6ff";
                      statusColor = "#1e40af";
                      statusBorder = "#bfdbfe";
                      statusText = "EM PROGRESSO";
                    } else if (campaign.status === "QUEUED") {
                      statusBg = "#fffbeb";
                      statusColor = "#854d0e";
                      statusBorder = "#fef08a";
                      statusText = "NA FILA";
                    }

                    // Progress bar color
                    const progressBarColor = campaign.status === "CANCELLED" ? "#ef4444" : "#10b981";

                    return (
                      <Fragment key={campaign.id}>
                        <tr style={{ borderBottom: isExpanded ? "none" : "1px solid #e4e4e7" }}>
                          <td style={{ padding: "1.25rem 1.5rem" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#18181b" }}>
                                {campaign.name}
                              </span>
                              <span style={{ fontSize: "0.78rem", color: "#71717a" }}>
                                Criado em {formatDateTime(campaign.createdAt)}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: "1.25rem 1.5rem" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0.25rem 0.6rem",
                                borderRadius: "9999px",
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                backgroundColor: statusBg,
                                color: statusColor,
                                border: `1px solid ${statusBorder}`,
                                letterSpacing: "0.025em"
                              }}
                            >
                              {statusText}
                            </span>
                          </td>
                          <td style={{ padding: "1.25rem 1.5rem", width: "300px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div
                                  className="z-progress-bar-bg"
                                  style={{
                                    flex: 1,
                                    height: "6px",
                                    backgroundColor: "#f4f4f5",
                                    borderRadius: "9999px",
                                    overflow: "hidden"
                                  }}
                                >
                                  <div
                                    className="z-progress-bar-fill"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: progressBarColor,
                                      height: "100%",
                                      borderRadius: "9999px",
                                      transition: "width 0.3s ease"
                                    }}
                                  />
                                </div>
                                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#18181b" }}>
                                  {pct}%
                                </span>
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "#71717a" }}>
                                Enviados: <strong style={{ color: "#18181b", fontWeight: 600 }}>{formatNumber(campaign.progress.sentCount)}</strong>{" "}
                                Falhas: <strong style={{ color: "#ef4444", fontWeight: 600 }}>{formatNumber(campaign.progress.failedCount)}</strong>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "1.25rem 1.5rem", textAlign: "right" }}>
                            <button
                              type="button"
                              className="z-btn-detail"
                              onClick={() => {
                                if (isExpanded) {
                                  setSelectedCampaignId(null);
                                } else {
                                  setSelectedCampaignId(campaign.id);
                                }
                              }}
                              style={{
                                background: "#ffffff",
                                border: "1px solid #e4e4e7",
                                padding: "0.5rem 1rem",
                                borderRadius: "8px",
                                fontSize: "0.85rem",
                                fontWeight: 500,
                                color: "#18181b",
                                cursor: "pointer",
                                transition: "all 0.2s"
                              }}
                            >
                              {isExpanded ? "Ocultar Detalhes" : "Ver Detalhes"}
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={4} style={{ padding: "0 1.5rem 1.5rem 1.5rem", background: "#fafafa", borderBottom: "1px solid #e4e4e7" }}>
                              <div
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #e4e4e7",
                                  borderRadius: "12px",
                                  padding: "1.5rem",
                                  marginTop: "0.5rem",
                                  boxShadow: "0 4px 12px rgba(0,0,0,0.02)"
                                }}
                              >
                                {selectedCampaignQuery.isLoading ? (
                                  <div style={{ textAlign: "center", padding: "2rem", color: "#71717a" }}>
                                    <LoaderCircle size={24} className="spin" style={{ margin: "0 auto 8px" }} />
                                    Carregando informações da campanha...
                                  </div>
                                ) : selectedCampaignQuery.data ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                                    
                                    {/* Sub-Header Detail */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                      <div>
                                        <h4 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#18181b", margin: 0 }}>
                                          {selectedCampaignQuery.data.name}
                                        </h4>
                                        <p style={{ fontSize: "0.8rem", color: "#71717a", margin: "2px 0 0 0" }}>
                                          Criada por {selectedCampaignQuery.data.createdByName} às {formatDateTime(selectedCampaignQuery.data.createdAt)}
                                        </p>
                                      </div>
                                      {["QUEUED", "IN_PROGRESS"].includes(selectedCampaignQuery.data.status) && (
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                          <button
                                            className="ghost-button danger"
                                            type="button"
                                            onClick={() => cancelCampaignMutation.mutate(selectedCampaignQuery.data!.id)}
                                            disabled={cancelCampaignMutation.isPending}
                                            style={{ padding: "6px 12px", fontSize: "0.8rem", borderRadius: "6px" }}
                                          >
                                            Cancelar campanha
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {/* Stats grid in details */}
                                    <div className="wp-progress-stats-grid" style={{ marginTop: 0 }}>
                                      <div className="wp-stat-box">
                                        <span className="wp-stat-box-label">📊 Conclusão</span>
                                        <strong className="wp-stat-box-value">{formatPercent(selectedCampaignQuery.data.progress.completionRatio)}</strong>
                                      </div>
                                      <div className="wp-stat-box">
                                        <span className="wp-stat-box-label">🚀 Enviados</span>
                                        <strong className="wp-stat-box-value">{formatNumber(selectedCampaignQuery.data.progress.sentCount)}</strong>
                                      </div>
                                      <div className="wp-stat-box">
                                        <span className="wp-stat-box-label">⚠️ Falhas</span>
                                        <strong className="wp-stat-box-value">{formatNumber(selectedCampaignQuery.data.progress.failedCount)}</strong>
                                      </div>
                                      <div className="wp-stat-box">
                                        <span className="wp-stat-box-label">🛡️ Bloqueados</span>
                                        <strong className="wp-stat-box-value">{formatNumber(selectedCampaignQuery.data.progress.blockedRecentCount)}</strong>
                                      </div>
                                      <div className="wp-stat-box">
                                        <span className="wp-stat-box-label">⏱️ Próximo envio</span>
                                        <strong className="wp-stat-box-value" style={{ fontSize: "0.9rem", wordBreak: "break-all" }}>
                                          {formatDateTime(selectedCampaignQuery.data.progress.nextScheduledAt) || "Sem registro"}
                                        </strong>
                                      </div>
                                      <div className="wp-stat-box">
                                        <span className="wp-stat-box-label">🏁 Previsão final</span>
                                        <strong className="wp-stat-box-value" style={{ fontSize: "0.9rem", wordBreak: "break-all" }}>
                                          {formatDateTime(selectedCampaignQuery.data.progress.estimatedFinishAt) || "Sem registro"}
                                        </strong>
                                      </div>
                                    </div>

                                    {/* Message preview and dynamic list side by side */}
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                      {/* Column 1: Message Text Preview */}
                                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                        <h5 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                          Mensagem Enviada
                                        </h5>
                                        <div
                                          style={{
                                            background: "#f4f4f5",
                                            border: "1px solid #e4e4e7",
                                            borderRadius: "8px",
                                            padding: "1rem",
                                            fontSize: "0.85rem",
                                            color: "#18181b",
                                            whiteSpace: "pre-wrap",
                                            maxHeight: "350px",
                                            overflowY: "auto",
                                            lineHeight: "1.5"
                                          }}
                                        >
                                          {selectedCampaignQuery.data.messageText || "Sem conteúdo de mensagem."}
                                        </div>
                                      </div>

                                      {/* Column 2: Recipients status feed */}
                                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                        <h5 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                          Fluxo de Disparos ao Vivo
                                        </h5>
                                        <div className="whatsapp-recipient-list" style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "350px", overflowY: "auto", paddingRight: "4px" }}>
                                          {selectedCampaignQuery.data.recipients.map((recipient) => (
                                            <article key={recipient.id} className={`wp-recipient-row-card tone-${recipientTone(recipient.status)}`} style={{ padding: "0.6rem 0.85rem", margin: 0, borderRadius: "8px" }}>
                                              {renderRecipientIdentifier(recipient)}
                                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                                                <span className={`status-badge status-${recipientTone(recipient.status)}`} style={{ fontSize: "0.6rem", padding: "1px 4px" }}>
                                                  {recipient.status === "SENT" ? "✓ ENVIADO" : recipient.status === "FAILED" ? "✕ FALHA" : recipient.status === "PENDING" ? "⏱ AGENDADO" : recipient.status === "BLOCKED_RECENT" ? "🛡️ BLOQUEADO" : recipient.status}
                                                </span>
                                                <span style={{ fontSize: "0.65rem", color: "#71717a" }}>
                                                  {recipient.status === "SENT" && recipient.sentAt ? formatDateTime(recipient.sentAt) : recipient.status === "PENDING" && recipient.scheduledFor ? formatDateTime(recipient.scheduledFor) : ""}
                                                </span>
                                              </div>
                                            </article>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                    
                                  </div>
                                ) : (
                                  <div style={{ textAlign: "center", padding: "1.5rem", color: "#ef4444" }}>
                                    Erro ao carregar detalhes.
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} style={{ padding: "3rem", textAlign: "center", color: "#71717a" }}>
                      Nenhuma campanha encontrada. Comece criando uma nova campanha!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}





