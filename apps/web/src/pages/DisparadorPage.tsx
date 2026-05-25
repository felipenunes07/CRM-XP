import { useEffect, useMemo, useState, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CarouselSlide,
  MessageTemplate,
  SavedSegment,
  WhatsappCampaignDetail,
  WhatsappCampaignMessageType,
  WhatsappCampaignRecipient,
  WhatsappGroup,
  WhatsappGroupClassification,
  WhatsappGroupMappingStatus,
  WhatsappInstanceProvider,
  WhatsappMappingSummary,
} from "@olist-crm/shared";
import { CheckCircle2, Clock3, LoaderCircle, Send, ShieldAlert, XCircle, Plus, ArrowRight, Filter, Check, Trash2, HelpCircle, Info, Users, Smartphone, PlusCircle, Sparkles, ChevronRight, ChevronLeft, Award, Search, ClipboardList, Bookmark, Save, X, CheckCheck, Smile, Paperclip } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatDateTime, formatNumber, formatPercent } from "../lib/format";

type QuickFilter = "ALL" | "WITH_ORDER" | "NO_ORDER_EXCEL" | "OTHER" | "BLOQUEADOS" | "ULTIMO_CONTATO" | "SELECTED" | "ATTENTION" | "INACTIVE";
type RecentBlockFilter = "AVAILABLE_ONLY" | "ALL" | "BLOCKED_ONLY";

const quickFilters: Array<{ value: QuickFilter; label: string; description: string }> = [
  { value: "ALL", label: "Todos", description: "Toda a base importada." },
  { value: "WITH_ORDER", label: "Clientes", description: "Clientes com pedido." },
  { value: "NO_ORDER_EXCEL", label: "Nunca comprou", description: "Nunca comprou." },
  { value: "ATTENTION", label: "Atenção", description: "Clientes que necessitam de atenção." },
  { value: "INACTIVE", label: "Inativos", description: "Clientes inativos." },
  { value: "OTHER", label: "Outros", description: "LJ, internos e demais grupos." },
  { value: "BLOQUEADOS", label: "Bloqueados", description: "Grupos sob bloqueio recente." },
  { value: "ULTIMO_CONTATO", label: "Último contato", description: "Histórico de envio recente." },
  { value: "SELECTED", label: "Selecionados", description: "Visualizar apenas contatos selecionados para envio." },
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

  if (input.quickFilter === "ATTENTION" || input.quickFilter === "INACTIVE") {
    params.customerStatus = input.quickFilter;
  }

  if (input.quickFilter === "BLOQUEADOS") {
    params.onlyRecentlyBlocked = true;
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
  summary: WhatsappMappingSummary | undefined,
  loadedItems: WhatsappGroup[],
  selectedCount?: number,
) {
  if (filter === "SELECTED") return formatNumber(selectedCount ?? 0);
  if (!summary) return "--";
  if (filter === "ATTENTION") {
    return formatNumber(summary.attentionCount ?? 0);
  }
  if (filter === "INACTIVE") {
    return formatNumber(summary.inactiveCount ?? 0);
  }
  if (filter === "ALL") return formatNumber(summary.totalGroups);
  if (filter === "WITH_ORDER") return formatNumber(summary.classificationCounts["WITH_ORDER"]);
  if (filter === "NO_ORDER_EXCEL") return formatNumber(summary.classificationCounts["NO_ORDER_EXCEL"]);
  if (filter === "OTHER") return formatNumber(summary.classificationCounts["OTHER"]);
  if (filter === "BLOQUEADOS") return formatNumber(summary.recentlyBlockedGroups);
  if (filter === "ULTIMO_CONTATO") {
    return formatNumber(loadedItems.filter(g => g.lastContactAt !== null).length);
  }
  return "--";
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
  const [currentPage, setCurrentPage] = useState(1);
  const [dispatchesFilter, setDispatchesFilter] = useState<"ALL" | "ZERO" | "SOME" | "FEW" | "MANY">("ALL");
  const [search, setSearch] = useState("");
  const [savedSegmentId, setSavedSegmentId] = useState("");
  const [recentBlockFilter, setRecentBlockFilter] = useState<RecentBlockFilter>("AVAILABLE_ONLY");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [pastedClsText, setPastedClsText] = useState("");
  const [newSegmentName, setNewSegmentName] = useState("");
  const [showClPasteArea, setShowClPasteArea] = useState(false);
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
    provider?: WhatsappInstanceProvider;
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
      status: instance.status,
      provider: instance.provider ?? "EVOLUTION",
    }));
  }, [whatsappInstancesQuery.data]);

  const [selectedSenderIds, setSelectedSenderIds] = useState<string[]>([]);

  // Carousel / UazAPI state
  const [campaignMessageType, setCampaignMessageType] = useState<WhatsappCampaignMessageType>("TEXT");
  const [carouselSlides, setCarouselSlides] = useState<CarouselSlide[]>([
    { text: "", image: "", buttons: [{ id: "btn1", text: "", type: "url" }] },
  ]);
  const [uploadingSlideIndex, setUploadingSlideIndex] = useState<number | null>(null);

  // Helper function to format file size
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  const selectedSenderProvider: WhatsappInstanceProvider = useMemo(() => {
    if (!selectedSenderIds.length) return "EVOLUTION";
    const sender = senders.find(s => s.id === selectedSenderIds[0]);
    return sender?.provider ?? "EVOLUTION";
  }, [selectedSenderIds, senders]);

  // Reset message type when provider changes
  useEffect(() => {
    if (selectedSenderProvider !== "UAZAPI") {
      setCampaignMessageType("TEXT");
    }
  }, [selectedSenderProvider]);

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

  const createSavedSegmentMutation = useMutation({
    mutationFn: (input: { name: string; definition: any }) => api.createSavedSegment(token!, input),
    onSuccess: (savedSegment) => {
      void queryClient.invalidateQueries({ queryKey: ["saved-segments"] });
      setSavedSegmentId(savedSegment.id);
      setShowClPasteArea(false);
      setPastedClsText("");
      setNewSegmentName("");
    },
    onError: (err: any) => {
      alert(`Erro ao criar grupo: ${err.message || err}`);
    }
  });



  const createCampaignMutation = useMutation({
    mutationFn: () =>
      api.createWhatsappCampaign(token!, {
        name: campaignName.trim() || `Disparo ${new Date().toLocaleDateString("pt-BR")}`,
        templateId: selectedTemplateId || null,
        savedSegmentId: savedSegmentId || null,
        whatsappInstanceId: selectedSenderIds[0] || null,
        messageText,
        messageType: campaignMessageType,
        carouselData: campaignMessageType === "CAROUSEL" ? carouselSlides : null,
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

  const sendTestMessageMutation = useMutation({
    mutationFn: () => {
      const payload = {
        messageText: messageText || "Mensagem de teste",
        messageType: campaignMessageType,
        carouselData: campaignMessageType === "CAROUSEL" ? carouselSlides : undefined,
        whatsappInstanceId: selectedSenderIds[0] || undefined
      };
      
      console.log("Sending test message with payload:", payload);
      return api.sendTestMessage(token!, payload);
    },
    onSuccess: (data) => {
      console.log("Test message sent successfully:", data);
      alert("✅ Mensagem de teste enviada com sucesso para +55 11 91127-9702!");
    },
    onError: (error: any) => {
      console.error("Error sending test message:", error);
      const errorMessage = error?.message || error?.toString() || "Erro desconhecido";
      alert(`❌ Erro ao enviar teste: ${errorMessage}\n\nVerifique se a instância WhatsApp está ativa e configurada corretamente.`);
    }
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
    let result = loadedGroups;

    if (quickFilter === "SELECTED") {
      result = result.filter((group) => selectedGroupIds.includes(group.id));
    } else if (quickFilter === "ULTIMO_CONTATO") {
      result = result.filter((group) => group.lastContactAt !== null);
    } else if (quickFilter === "ATTENTION") {
      result = result.filter((group) => group.customerStatus === "ATTENTION");
    } else if (quickFilter === "INACTIVE") {
      result = result.filter((group) => group.customerStatus === "INACTIVE");
    }

    if (dispatchesFilter === "ZERO") {
      result = result.filter((group) => (group.sentCampaignsCount ?? 0) === 0);
    } else if (dispatchesFilter === "SOME") {
      result = result.filter((group) => (group.sentCampaignsCount ?? 0) >= 1);
    } else if (dispatchesFilter === "FEW") {
      result = result.filter((group) => (group.sentCampaignsCount ?? 0) >= 1 && (group.sentCampaignsCount ?? 0) <= 2);
    } else if (dispatchesFilter === "MANY") {
      result = result.filter((group) => (group.sentCampaignsCount ?? 0) >= 3);
    }

    if (quickFilter !== "BLOQUEADOS" && quickFilter !== "SELECTED") {
      if (recentBlockFilter === "AVAILABLE_ONLY") {
        return result.filter((group) => !group.isRecentlyBlocked);
      } else if (recentBlockFilter === "BLOCKED_ONLY") {
        return result.filter((group) => group.isRecentlyBlocked);
      }
    }

    return result;
  }, [loadedGroups, quickFilter, recentBlockFilter, selectedGroupIds, dispatchesFilter]);
  const selectedGroupCount = selectedGroupIds.length;

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [quickFilter, recentBlockFilter, savedSegmentId, search, dispatchesFilter]);

  const itemsPerPage = 50;
  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);
  const paginatedGroups = useMemo(() => {
    return filteredGroups.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredGroups, currentPage]);

  const allVisibleSelected =
    paginatedGroups.length > 0 && paginatedGroups.every((group) => selectedGroupIds.includes(group.id));

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
    const visibleIds = paginatedGroups.map((group) => group.id);
    setSelectedGroupIds((current) => {
      if (allVisibleSelected) {
        return current.filter((groupId) => !visibleIds.includes(groupId));
      }

      return [...new Set([...current, ...visibleIds])];
    });
  }

  function handleApplyPastedCls() {
    const codes = pastedClsText
      .split(/[\s,;\n]+/)
      .map(c => c.trim().toUpperCase())
      .filter(c => c.startsWith("CL"));
    
    if (codes.length === 0) {
      alert("Nenhum código válido (iniciando com CL) foi inserido.");
      return;
    }

    const matchingGroups = loadedGroups.filter(g => g.customerCode && codes.includes(g.customerCode.trim().toUpperCase()));
    const matchingIds = matchingGroups.map(g => g.id);

    if (matchingIds.length > 0) {
      setSelectedGroupIds(current => [...new Set([...current, ...matchingIds])]);
      
      // Clear filters and redirect straight to SELECTED tab to show them
      setSearch("");
      setSavedSegmentId("");
      setQuickFilter("SELECTED");
      
      alert(`${matchingIds.length} grupos mapeados para os códigos CL foram selecionados e exibidos na aba 'Selecionados'!`);
    } else {
      alert("Nenhum grupo correspondente aos códigos CL inseridos foi encontrado no filtro atual. Dica: Use a opção 'Criar & Salvar Novo Público' para salvar e filtrar todos os códigos CL da sua base de dados.");
    }
  }

  function handleCreateSegmentFromPastedCls() {
    const codes = pastedClsText
      .split(/[\s,;\n]+/)
      .map(c => c.trim().toUpperCase())
      .filter(c => c.startsWith("CL"));
    
    if (codes.length === 0) {
      alert("Nenhum código válido (iniciando com CL) foi inserido.");
      return;
    }

    if (!newSegmentName.trim()) {
      alert("Por favor, digite um nome para o novo público salvo.");
      return;
    }

    createSavedSegmentMutation.mutate({
      name: newSegmentName.trim(),
      definition: {
        customerCodes: codes
      }
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
          <div className="wp-wizard-layout full-width">
            
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
                      
                      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "1rem", marginTop: "0.5rem" }}>
                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            alignItems: "flex-start",
                            background: overrideRecentBlock ? "rgba(239, 68, 68, 0.03)" : "transparent",
                            border: overrideRecentBlock ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid transparent",
                            padding: overrideRecentBlock ? "0.75rem 1rem" : "0.5rem 0",
                            borderRadius: "10px",
                            transition: "all 0.2s ease"
                          }}
                        >
                          <input
                            type="checkbox"
                            id="overrideRecentBlock"
                            checked={overrideRecentBlock}
                            onChange={(event) => setOverrideRecentBlock(event.target.checked)}
                            style={{
                              marginTop: "4px",
                              width: "16px",
                              height: "16px",
                              accentColor: "#ef4444",
                              cursor: "pointer"
                            }}
                          />
                          <label htmlFor="overrideRecentBlock" style={{ display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer", flex: 1 }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: overrideRecentBlock ? "#ef4444" : "#334155", transition: "color 0.2s" }}>
                              Ignorar o bloqueio de proteção anti-spam de 7 dias
                            </span>
                            <span style={{ fontSize: "0.75rem", color: overrideRecentBlock ? "#991b1b" : "#64748b", lineHeight: "1.4" }}>
                              Use com moderação. Forçar disparos recentes aumenta riscos de block.
                            </span>
                          </label>
                        </div>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--line)", paddingBottom: "1rem", marginBottom: "1rem" }}>
                    <div>
                      <h3 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                        <Users size={18} style={{ color: "#10b981" }} />
                        Grupos para disparo
                      </h3>
                      <p className="panel-subcopy" style={{ margin: "2px 0 0 0" }}>Filtre e marque os grupos que vão receber.</p>
                    </div>
                    
                    {/* Top-Right Counters */}
                    <div style={{ display: "flex", gap: "10px" }}>
                      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.5rem 1rem", textAlign: "center", minWidth: "90px" }}>
                        <span style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Mostrados</span>
                        <strong style={{ fontSize: "1.1rem", color: "#1e293b" }}>{formatNumber(filteredGroups.length)}</strong>
                      </div>
                      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "0.5rem 1rem", textAlign: "center", minWidth: "90px" }}>
                        <span style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#1e40af", textTransform: "uppercase" }}>Selecionados</span>
                        <strong style={{ fontSize: "1.1rem", color: "#1e40af" }}>{formatNumber(selectedGroupCount)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Filter Toolbar (Row 1 of inputs exactly like screenshot) */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "1.25rem", margin: "1.25rem 0" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>Público salvo</span>
                      <select
                        value={savedSegmentId}
                        onChange={(event) => {
                          setSavedSegmentId(event.target.value);
                          if (quickFilter === "SELECTED") {
                            setQuickFilter("ALL");
                          }
                        }}
                        className="wp-card-input"
                        style={{ padding: "0.625rem 0.75rem", fontSize: "0.9rem", background: "#fff" }}
                      >
                        <option value="">Todos os grupos</option>
                        {(savedSegmentsQuery.data ?? []).map((segment) => (
                          <option key={segment.id} value={segment.id}>
                            {segment.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>Buscar</span>
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Nome do grupo, cliente ou código"
                        className="wp-card-input"
                        style={{ padding: "0.625rem 0.75rem", fontSize: "0.9rem" }}
                      />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>Bloqueio</span>
                      <div className="z-tabs" style={{ margin: 0, borderBottom: "none", background: "#f1f5f9", padding: "0.25rem", borderRadius: "8px", display: "flex", gap: "4px" }}>
                        <button
                          type="button"
                          className={`z-tab ${recentBlockFilter === "AVAILABLE_ONLY" ? "active" : ""}`}
                          onClick={() => setRecentBlockFilter("AVAILABLE_ONLY")}
                          style={{ flex: 1, padding: "0.4rem", fontSize: "0.82rem", borderRadius: "6px", borderBottom: "none", justifyContent: "center", background: recentBlockFilter === "AVAILABLE_ONLY" ? "#fff" : "transparent" }}
                        >
                          Disponíveis
                        </button>
                        <button
                          type="button"
                          className={`z-tab ${recentBlockFilter === "ALL" ? "active" : ""}`}
                          onClick={() => setRecentBlockFilter("ALL")}
                          style={{ flex: 1, padding: "0.4rem", fontSize: "0.82rem", borderRadius: "6px", borderBottom: "none", justifyContent: "center", background: recentBlockFilter === "ALL" ? "#fff" : "transparent" }}
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          className={`z-tab ${recentBlockFilter === "BLOCKED_ONLY" ? "active" : ""}`}
                          onClick={() => setRecentBlockFilter("BLOCKED_ONLY")}
                          style={{ flex: 1, padding: "0.4rem", fontSize: "0.82rem", borderRadius: "6px", borderBottom: "none", justifyContent: "center", background: recentBlockFilter === "BLOCKED_ONLY" ? "#fff" : "transparent" }}
                        >
                          Bloqueados
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#334155" }}>Qtd. Disparos</span>
                      <select
                        value={dispatchesFilter}
                        onChange={(e) => setDispatchesFilter(e.target.value as any)}
                        className="wp-card-input"
                        style={{ padding: "0.625rem 0.75rem", fontSize: "0.9rem", background: "#fff", cursor: "pointer" }}
                      >
                        <option value="ALL">Qualquer quantidade</option>
                        <option value="ZERO">Sem disparos (Novo)</option>
                        <option value="SOME">Com disparos (1 ou mais)</option>
                        <option value="FEW">Poucos disparos (1 a 2)</option>
                        <option value="MANY">Muitos disparos (3 ou mais)</option>
                      </select>
                    </div>
                  </div>

                  {/* Tabs Row (Row 2 exactly like screenshot) */}
                  <div className="z-tabs" style={{ marginBottom: "1rem", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {quickFilters.map((filter) => {
                      const count = quickFilterCount(filter.value, mappingSummaryQuery.data, loadedGroups, selectedGroupIds.length);
                      const isActive = quickFilter === filter.value;
                      return (
                        <button
                          key={filter.value}
                          type="button"
                          className={`z-tab ${isActive ? "active" : ""}`}
                          onClick={() => setQuickFilter(filter.value)}
                          style={{
                            padding: "0.6rem 1rem",
                            fontSize: "0.85rem",
                            fontWeight: isActive ? 700 : 500,
                            borderRadius: "8px",
                            backgroundColor: isActive ? "#eff6ff" : "transparent",
                            borderBottom: isActive ? "2px solid #3b82f6" : "2px solid transparent",
                            color: isActive ? "#1e40af" : "#64748b"
                          }}
                        >
                          {filter.label}
                          <span style={{ fontSize: "0.72rem", background: isActive ? "#bfdbfe" : "#f1f5f9", padding: "2px 6px", borderRadius: "999px", marginLeft: "6px", color: isActive ? "#1e40af" : "#64748b" }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Actions Row */}
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", margin: "1.25rem 0", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={toggleVisibleSelection}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        border: "1px solid #e4e4e7",
                        borderRadius: "8px",
                        padding: "0.625rem 1.25rem",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        backgroundColor: "#ffffff",
                        color: "#3f3f46",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#f4f4f5";
                        e.currentTarget.style.borderColor = "#d4d4d8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#ffffff";
                        e.currentTarget.style.borderColor = "#e4e4e7";
                      }}
                    >
                      <CheckCircle2 size={16} style={{ color: "#10b981" }} />
                      Selecionar visíveis
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroupIds([]);
                        if (quickFilter === "SELECTED") {
                          setQuickFilter("ALL");
                        }
                      }}
                      disabled={selectedGroupCount === 0}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        border: "1px solid #e4e4e7",
                        borderRadius: "8px",
                        padding: "0.625rem 1.25rem",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        backgroundColor: "#ffffff",
                        color: selectedGroupCount === 0 ? "#a1a1aa" : "#ef4444",
                        cursor: selectedGroupCount === 0 ? "not-allowed" : "pointer",
                        opacity: selectedGroupCount === 0 ? 0.6 : 1,
                        transition: "all 0.2s ease",
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
                      }}
                      onMouseEnter={(e) => {
                        if (selectedGroupCount > 0) {
                          e.currentTarget.style.backgroundColor = "#fef2f2";
                          e.currentTarget.style.borderColor = "#fca5a5";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#ffffff";
                        e.currentTarget.style.borderColor = "#e4e4e7";
                      }}
                    >
                      <Trash2 size={16} />
                      Limpar seleção
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowClPasteArea(!showClPasteArea)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        border: "1px solid",
                        borderColor: showClPasteArea ? "#18181b" : "#e4e4e7",
                        borderRadius: "8px",
                        padding: "0.625rem 1.25rem",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        backgroundColor: showClPasteArea ? "#18181b" : "#ffffff",
                        color: showClPasteArea ? "#ffffff" : "#18181b",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
                      }}
                      onMouseEnter={(e) => {
                        if (!showClPasteArea) {
                          e.currentTarget.style.backgroundColor = "#f4f4f5";
                          e.currentTarget.style.borderColor = "#d4d4d8";
                        } else {
                          e.currentTarget.style.backgroundColor = "#27272a";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!showClPasteArea) {
                          e.currentTarget.style.backgroundColor = "#ffffff";
                          e.currentTarget.style.borderColor = "#e4e4e7";
                        } else {
                          e.currentTarget.style.backgroundColor = "#18181b";
                        }
                      }}
                    >
                      <ClipboardList size={16} style={{ color: showClPasteArea ? "#ffffff" : "#3b82f6" }} />
                      {showClPasteArea ? "✕ Fechar Importador CL" : "Importador de CLs"}
                    </button>
                  </div>

                  {/* CL Paste Panel */}
                  {showClPasteArea && (
                    <div style={{
                      background: "#ffffff",
                      border: "1px solid #e4e4e7",
                      borderRadius: "16px",
                      padding: "1.5rem",
                      margin: "1.25rem 0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "1.25rem",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.03)"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <ClipboardList size={20} style={{ color: "#3b82f6" }} />
                        <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#18181b" }}>
                          Importar Destinatários via Códigos CL
                        </h4>
                      </div>
                      
                      <p style={{ margin: 0, fontSize: "0.82rem", color: "#71717a", lineHeight: "1.5" }}>
                        Cole os códigos de clientes (ex: <code style={{ background: "#f4f4f5", padding: "2px 6px", borderRadius: "4px", color: "#0f766e" }}>CL1002, CL1003, CL1004</code>) abaixo. Você pode selecionar os grupos na tabela atual ou <strong>criar e salvar esse grupo de clientes</strong> no banco de dados.
                      </p>

                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>Nome do Público Salvo (Opcional - Necessário para Salvar)</span>
                        <input
                          value={newSegmentName}
                          onChange={(e) => setNewSegmentName(e.target.value)}
                          placeholder="Ex: Clientes VIP Região Sul, Campanha de Inverno..."
                          className="wp-card-input"
                          style={{ padding: "0.625rem 0.75rem", fontSize: "0.9rem" }}
                        />
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>Códigos dos Clientes</span>
                        <textarea
                          rows={4}
                          value={pastedClsText}
                          onChange={(e) => setPastedClsText(e.target.value)}
                          placeholder="CL1002, CL1003, CL1004..."
                          className="wp-card-input"
                          style={{ fontFamily: "monospace", fontSize: "0.85rem", background: "#fff", resize: "vertical" }}
                        />
                      </div>

                      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "0.25rem" }}>
                        <button
                          type="button"
                          onClick={handleApplyPastedCls}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            backgroundColor: "#3b82f6",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "8px",
                            padding: "0.625rem 1.25rem",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "background 0.2s"
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#2563eb"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#3b82f6"}
                        >
                          <CheckCircle2 size={16} />
                          Selecionar na Tabela
                        </button>

                        <button
                          type="button"
                          onClick={handleCreateSegmentFromPastedCls}
                          disabled={createSavedSegmentMutation.isPending || !newSegmentName.trim() || !pastedClsText.trim()}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            backgroundColor: "#10b981",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "8px",
                            padding: "0.625rem 1.25rem",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            cursor: (createSavedSegmentMutation.isPending || !newSegmentName.trim() || !pastedClsText.trim()) ? "not-allowed" : "pointer",
                            opacity: (createSavedSegmentMutation.isPending || !newSegmentName.trim() || !pastedClsText.trim()) ? 0.6 : 1,
                            transition: "background 0.2s"
                          }}
                          onMouseEnter={(e) => {
                            if (!createSavedSegmentMutation.isPending && newSegmentName.trim() && pastedClsText.trim()) {
                              e.currentTarget.style.backgroundColor = "#059669";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!createSavedSegmentMutation.isPending && newSegmentName.trim() && pastedClsText.trim()) {
                              e.currentTarget.style.backgroundColor = "#10b981";
                            }
                          }}
                        >
                          {createSavedSegmentMutation.isPending ? (
                            <>
                              <LoaderCircle size={16} className="animate-spin" />
                              Salvando público...
                            </>
                          ) : (
                            <>
                              <Save size={16} />
                              Criar & Salvar Novo Público
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Groups table with custom styling exactly like screenshot */}
                  {groupsQuery.isLoading ? <div className="page-loading">Carregando grupos destinatários...</div> : null}

                  {groupsQuery.data?.items.length ? (
                    <>
                      <div className="table-scroll" style={{ overflowX: "auto", border: "1px solid #e4e4e7", borderRadius: "12px", background: "#fff", marginTop: "1rem" }}>
                      <table className="z-table">
                        <thead>
                          <tr>
                            <th style={{ width: "50px", padding: "1rem 1.5rem" }}>
                              <input
                                type="checkbox"
                                checked={allVisibleSelected}
                                onChange={toggleVisibleSelection}
                              />
                            </th>
                            <th style={{ padding: "1rem 1.5rem" }}>REMETENTE (WHATSAPP CANAL)</th>
                            <th style={{ padding: "1rem 0.5rem", width: "40px", textAlign: "center" }}></th>
                            <th style={{ padding: "1rem 1.5rem" }}>DESTINATÁRIO (WHATSAPP & CRM)</th>
                            <th style={{ padding: "1rem 1.5rem" }}>TIPO & CLASSIFICAÇÃO</th>
                            <th style={{ padding: "1rem 1.5rem" }}>DISPAROS</th>
                            <th style={{ padding: "1rem 1.5rem" }}>STATUS (SPAM RISK)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedGroups.map((group) => {
                            const isSelected = selectedGroupIds.includes(group.id);

                            // Risk configuration
                            let riskClass = "low";
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

                            const mappedSenderId = recipientSenderMapping[group.id] || selectedSenderIds[0] || "default";
                            const activeSender = senders.find(s => s.id === mappedSenderId) || senders[0] || {
                              id: "default",
                              name: "Instância Padrão",
                              role: "WhatsApp",
                              avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
                              phone: ""
                            };

                            return (
                              <tr
                                key={group.id}
                                style={{
                                  borderBottom: "1px solid #e4e4e7",
                                  backgroundColor: isSelected ? "rgba(59, 130, 246, 0.01)" : "transparent"
                                }}
                              >
                                <td style={{ padding: "1.25rem 1.5rem" }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleGroupSelection(group.id)}
                                  />
                                </td>
                                <td style={{ padding: "1.25rem 1.5rem" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <img
                                      src={activeSender.avatarUrl}
                                      alt={activeSender.name}
                                      style={{ width: "36px", height: "36px", borderRadius: "50%", border: "1px solid rgba(0,0,0,0.06)", objectFit: "cover" }}
                                    />
                                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>
                                        {activeSender.name}
                                      </span>
                                      <span style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 500 }}>
                                        {activeSender.role} {activeSender.phone && `• ${activeSender.phone}`}
                                      </span>
                                      <select
                                        value={mappedSenderId}
                                        onChange={(e) => changeGroupSender(group.id, e.target.value)}
                                        className="ghost-button"
                                        style={{ padding: "2px 6px", fontSize: "0.75rem", border: "1px solid var(--line)", marginTop: "4px", background: "#fff", cursor: "pointer", borderRadius: "6px", width: "fit-content" }}
                                      >
                                        {senders.filter(s => selectedSenderIds.includes(s.id)).map(s => (
                                          <option key={s.id} value={s.id}>
                                            Mapear para {s.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: "1.25rem 0.5rem", textAlign: "center" }}>
                                  <ArrowRight size={16} style={{ color: "#10b981" }} />
                                </td>
                                <td style={{ padding: "1.25rem 1.5rem" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <div
                                      style={{
                                        width: "36px",
                                        height: "36px",
                                        borderRadius: "50%",
                                        background: "linear-gradient(135deg, #10b981, #059669)",
                                        color: "#fff",
                                        display: "grid",
                                        placeItems: "center",
                                        fontWeight: "bold",
                                        fontSize: "0.85rem"
                                      }}
                                    >
                                      {String(group.customerDisplayName || group.sourceName || "G").charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                      <strong style={{ fontSize: "0.9rem", color: "#18181b", fontWeight: 700 }}>
                                        {group.sourceName}
                                      </strong>
                                      <span style={{ fontSize: "0.75rem", color: "#71717a", fontFamily: "monospace" }}>
                                        {group.jid}
                                      </span>
                                      
                                      <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "2px" }}>
                                        <span style={{ fontSize: "0.78rem", color: "#475569", fontWeight: 600 }}>
                                          👤 {group.customerDisplayName || "Sem cliente mapeado"}
                                        </span>
                                        {group.customerCode && (
                                          <span style={{ fontSize: "0.72rem", background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", color: "#475569", fontWeight: 700 }}>
                                            {group.customerCode}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: "1.25rem 1.5rem" }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                                      <span className="status-badge" style={{ fontSize: "0.72rem", background: "#f1f5f9", color: "#334155", fontWeight: 600, padding: "1px 6px", borderRadius: "4px" }}>
                                        {classificationLabel(group.classification)}
                                      </span>
                                      <span className="status-badge" style={{ fontSize: "0.72rem", background: "#eff6ff", color: "#1e40af", fontWeight: 600, padding: "1px 6px", borderRadius: "4px" }}>
                                        {mappingStatusLabel(group.mappingStatus)}
                                      </span>
                                    </div>
                                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                      Último contato: <strong>{group.lastContactAt ? formatDateTime(group.lastContactAt) : "Sem registro"}</strong>
                                    </span>
                                  </div>
                                </td>
                                <td style={{ padding: "1.25rem 1.5rem" }}>
                                  <span style={{ fontSize: "0.82rem", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "4px 8px", borderRadius: "6px", color: "#166534", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                    🚀 {group.sentCampaignsCount ?? 0} {group.sentCampaignsCount === 1 ? 'disparo' : 'disparos'}
                                  </span>
                                </td>
                                <td style={{ padding: "1.25rem 1.5rem", position: "relative" }}>
                                  <span
                                    className={`wp-risk-badge ${riskClass}`}
                                    style={{ cursor: "help", display: "inline-block" }}
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
                                        zIndex: 1000
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

                    {/* Premium Client-Side Pagination Control Bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", background: "#f8fafc", padding: "0.75rem 1.25rem", borderRadius: "12px", border: "1px solid #e4e4e7" }}>
                      <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 500 }}>
                        Mostrando <strong>{filteredGroups.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-{Math.min(filteredGroups.length, currentPage * itemsPerPage)}</strong> de <strong>{formatNumber(filteredGroups.length)}</strong> destinatários
                      </span>
                      
                      {totalPages > 1 && (
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "0.4rem 0.8rem",
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              borderRadius: "6px",
                              border: "1px solid #e4e4e7",
                              backgroundColor: "#ffffff",
                              color: currentPage === 1 ? "#a1a1aa" : "#3f3f46",
                              cursor: currentPage === 1 ? "not-allowed" : "pointer",
                              transition: "all 0.2s"
                            }}
                          >
                            <ChevronLeft size={16} />
                            Anterior
                          </button>
                          
                          <span style={{ fontSize: "0.82rem", color: "#475569", fontWeight: 600, padding: "0 0.5rem" }}>
                            Página {currentPage} de {totalPages}
                          </span>
                          
                          <button
                            type="button"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "0.4rem 0.8rem",
                              fontSize: "0.82rem",
                              fontWeight: 600,
                              borderRadius: "6px",
                              border: "1px solid #e4e4e7",
                              backgroundColor: "#ffffff",
                              color: currentPage === totalPages ? "#a1a1aa" : "#3f3f46",
                              cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                              transition: "all 0.2s"
                            }}
                          >
                            Próximo
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
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

                      {selectedSenderProvider === "UAZAPI" ? (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)" }}>Tipo de envio:</span>
                          <button
                            type="button"
                            className={`ghost-button${campaignMessageType === "TEXT" ? " active" : ""}`}
                            style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, background: campaignMessageType === "TEXT" ? "var(--accent)" : "var(--bg-soft)", color: campaignMessageType === "TEXT" ? "#fff" : "var(--muted)", border: "1px solid var(--line)" }}
                            onClick={() => setCampaignMessageType("TEXT")}
                          >
                            Texto
                          </button>
                          <button
                            type="button"
                            className={`ghost-button${campaignMessageType === "CAROUSEL" ? " active" : ""}`}
                            style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, background: campaignMessageType === "CAROUSEL" ? "var(--accent)" : "var(--bg-soft)", color: campaignMessageType === "CAROUSEL" ? "#fff" : "var(--muted)", border: "1px solid var(--line)" }}
                            onClick={() => setCampaignMessageType("CAROUSEL")}
                          >
                            Carrossel
                          </button>
                        </div>
                      ) : (
                        <div style={{ 
                          padding: "0.75rem 1rem", 
                          background: "#fef3c7", 
                          border: "1px solid #fbbf24", 
                          borderRadius: "8px",
                          fontSize: "0.82rem",
                          color: "#92400e",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px"
                        }}>
                          <Info size={16} />
                          <div>
                            <strong>Carrossel indisponível:</strong> Selecione uma instância UazAPI no passo "Remetentes" para usar carrosséis com imagens e botões.
                          </div>
                        </div>
                      )}

                      <label className="whatsapp-message-field">
                        <span>Texto da Mensagem{campaignMessageType === "CAROUSEL" ? " (acompanha o carrossel)" : " (Versão A)"}</span>
                        <textarea
                          rows={campaignMessageType === "CAROUSEL" ? 4 : 8}
                          value={messageText}
                          onChange={(event) => setMessageText(event.target.value)}
                          placeholder="Digite a mensagem principal que será enviada aos clientes..."
                        />
                      </label>

                      {campaignMessageType === "CAROUSEL" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem", background: "var(--bg-soft)", borderRadius: "12px", border: "1px solid var(--line)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a" }}>Slides do Carrossel</span>
                            <button
                              type="button"
                              className="ghost-button"
                              style={{ padding: "4px 10px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px" }}
                              onClick={() => setCarouselSlides(prev => [...prev, { text: "", image: "", buttons: [{ id: `btn${Date.now()}`, text: "", type: "url" }] }])}
                            >
                              <PlusCircle size={14} /> Adicionar Slide
                            </button>
                          </div>
                          {carouselSlides.map((slide, slideIdx) => (
                            <div key={slideIdx} style={{ padding: "1rem", background: "#fff", borderRadius: "10px", border: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--accent)" }}>Slide {slideIdx + 1}</span>
                                {carouselSlides.length > 1 && (
                                  <button
                                    type="button"
                                    className="ghost-button danger"
                                    style={{ padding: "2px 8px", fontSize: "0.72rem" }}
                                    onClick={() => setCarouselSlides(prev => prev.filter((_, i) => i !== slideIdx))}
                                  >
                                    <Trash2 size={12} /> Remover
                                  </button>
                                )}
                              </div>
                              <label style={{ fontSize: "0.82rem" }}>
                                Texto do slide
                                <textarea
                                  rows={2}
                                  value={slide.text}
                                  onChange={(e) => {
                                    const updated = [...carouselSlides];
                                    updated[slideIdx] = { ...slide, text: e.target.value };
                                    setCarouselSlides(updated);
                                  }}
                                  placeholder="Texto que aparece neste slide..."
                                  style={{ marginTop: "4px" }}
                                />
                              </label>
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#0f172a" }}>Imagem</span>
                                  <span style={{ 
                                    fontSize: "0.7rem", 
                                    color: "#10b981", 
                                    background: "#f0fdf4", 
                                    padding: "2px 8px", 
                                    borderRadius: "6px",
                                    fontWeight: 600,
                                    border: "1px solid #bbf7d0"
                                  }}>
                                    📐 Ideal: 800x600px (4:3)
                                  </span>
                                </div>
                                
                                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                  <label style={{ flex: 1, cursor: "pointer" }}>
                                    <input
                                      type="file"
                                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                                      style={{ display: "none" }}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          // Validate file size (max 5MB)
                                          const maxSize = 5 * 1024 * 1024; // 5MB
                                          if (file.size > maxSize) {
                                            alert(`Arquivo muito grande! Tamanho máximo: 5MB. Seu arquivo: ${formatFileSize(file.size)}`);
                                            return;
                                          }

                                          // Validate file type
                                          const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                                          if (!validTypes.includes(file.type)) {
                                            alert('Tipo de arquivo inválido! Use: JPG, PNG, GIF ou WEBP');
                                            return;
                                          }

                                          setUploadingSlideIndex(slideIdx);
                                          const reader = new FileReader();
                                          reader.onload = (event) => {
                                            const updated = [...carouselSlides];
                                            updated[slideIdx] = { ...slide, image: event.target?.result as string };
                                            setCarouselSlides(updated);
                                            setUploadingSlideIndex(null);
                                          };
                                          reader.onerror = () => {
                                            alert('Erro ao carregar a imagem. Tente novamente.');
                                            setUploadingSlideIndex(null);
                                          };
                                          reader.readAsDataURL(file);
                                        }
                                      }}
                                    />
                                    <div style={{ 
                                      padding: "10px 14px", 
                                      background: uploadingSlideIndex === slideIdx ? "#f0fdf4" : "#f8fafc", 
                                      border: uploadingSlideIndex === slideIdx ? "2px solid #10b981" : "2px dashed #cbd5e1", 
                                      borderRadius: "8px", 
                                      textAlign: "center",
                                      fontSize: "0.8rem",
                                      fontWeight: 600,
                                      color: uploadingSlideIndex === slideIdx ? "#10b981" : "#475569",
                                      transition: "all 0.2s",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      gap: "6px"
                                    }}
                                    onMouseEnter={(e) => {
                                      if (uploadingSlideIndex !== slideIdx) {
                                        e.currentTarget.style.background = "#f1f5f9";
                                        e.currentTarget.style.borderColor = "#94a3b8";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (uploadingSlideIndex !== slideIdx) {
                                        e.currentTarget.style.background = "#f8fafc";
                                        e.currentTarget.style.borderColor = "#cbd5e1";
                                      }
                                    }}
                                    >
                                      {uploadingSlideIndex === slideIdx ? (
                                        <>
                                          <LoaderCircle size={14} className="spin" />
                                          Carregando...
                                        </>
                                      ) : (
                                        <>
                                          📁 Escolher do computador
                                        </>
                                      )}
                                    </div>
                                  </label>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                                  <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600 }}>OU</span>
                                  <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                                </div>

                                <input
                                  type="url"
                                  value={slide.image.startsWith('data:') ? '' : slide.image}
                                  onChange={(e) => {
                                    const updated = [...carouselSlides];
                                    updated[slideIdx] = { ...slide, image: e.target.value };
                                    setCarouselSlides(updated);
                                  }}
                                  placeholder="https://exemplo.com/imagem.jpg"
                                  style={{ fontSize: "0.82rem" }}
                                  disabled={uploadingSlideIndex === slideIdx}
                                />
                                
                                <div style={{ 
                                  fontSize: "0.7rem", 
                                  color: "#64748b", 
                                  background: "#f8fafc",
                                  padding: "8px 10px",
                                  borderRadius: "6px",
                                  border: "1px solid #e2e8f0",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "4px"
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <Info size={12} />
                                    <strong>Dimensões recomendadas:</strong>
                                  </div>
                                  <div style={{ paddingLeft: "16px" }}>
                                    • <strong>Ideal:</strong> 800x600px (proporção 4:3)<br/>
                                    • <strong>Mínimo:</strong> 400x300px<br/>
                                    • <strong>Máximo:</strong> 1920x1440px<br/>
                                    • <strong>Tamanho:</strong> até 5MB
                                  </div>
                                </div>
                                
                                {slide.image && !slide.image.startsWith('data:') && (
                                  <div style={{ fontSize: "0.7rem", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                                    <Info size={12} />
                                    URL externa
                                  </div>
                                )}
                                
                                {slide.image && slide.image.startsWith('data:') && (
                                  <div style={{ fontSize: "0.7rem", color: "#10b981", display: "flex", alignItems: "center", gap: "4px", fontWeight: 600 }}>
                                    <CheckCircle2 size={12} />
                                    Imagem carregada ({formatFileSize(slide.image.length * 0.75)})
                                  </div>
                                )}
                              </div>

                              {slide.image && (
                                <div style={{ position: "relative" }}>
                                  <img
                                    src={slide.image}
                                    alt={`Preview slide ${slideIdx + 1}`}
                                    style={{ 
                                      width: "100%",
                                      maxHeight: "200px", 
                                      objectFit: "cover", 
                                      borderRadius: "10px", 
                                      border: "3px solid #10b981",
                                      boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)"
                                    }}
                                    onError={(e) => { 
                                      (e.target as HTMLImageElement).style.display = "none";
                                      alert('Erro ao carregar a imagem. Verifique a URL ou tente fazer upload novamente.');
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...carouselSlides];
                                      updated[slideIdx] = { ...slide, image: "" };
                                      setCarouselSlides(updated);
                                    }}
                                    style={{
                                      position: "absolute",
                                      top: "10px",
                                      right: "10px",
                                      background: "rgba(239, 68, 68, 0.95)",
                                      color: "#fff",
                                      border: "none",
                                      borderRadius: "8px",
                                      padding: "6px 10px",
                                      fontSize: "0.75rem",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                                      transition: "all 0.2s"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = "rgba(220, 38, 38, 0.95)";
                                      e.currentTarget.style.transform = "scale(1.05)";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = "rgba(239, 68, 68, 0.95)";
                                      e.currentTarget.style.transform = "scale(1)";
                                    }}
                                  >
                                    <Trash2 size={12} /> Remover
                                  </button>
                                </div>
                              )}
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted)" }}>Botões</span>
                                {slide.buttons.map((btn, btnIdx) => (
                                  <div key={btn.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                    <input
                                      value={btn.text}
                                      onChange={(e) => {
                                        const updated = [...carouselSlides];
                                        const updatedBtns = [...slide.buttons];
                                        updatedBtns[btnIdx] = { ...btn, text: e.target.value };
                                        updated[slideIdx] = { ...slide, buttons: updatedBtns };
                                        setCarouselSlides(updated);
                                      }}
                                      placeholder="Texto do botão"
                                      style={{ flex: 1, fontSize: "0.82rem" }}
                                    />
                                    {slide.buttons.length > 1 && (
                                      <button
                                        type="button"
                                        className="ghost-button danger"
                                        style={{ padding: "2px 6px", fontSize: "0.7rem" }}
                                        onClick={() => {
                                          const updated = [...carouselSlides];
                                          updated[slideIdx] = { ...slide, buttons: slide.buttons.filter((_, i) => i !== btnIdx) };
                                          setCarouselSlides(updated);
                                        }}
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className="ghost-button"
                                  style={{ padding: "3px 8px", fontSize: "0.72rem", alignSelf: "flex-start" }}
                                  onClick={() => {
                                    const updated = [...carouselSlides];
                                    updated[slideIdx] = { ...slide, buttons: [...slide.buttons, { id: `btn${Date.now()}`, text: "", type: "url" }] };
                                    setCarouselSlides(updated);
                                  }}
                                >
                                  + Botão
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {abTestActive ? (
                        <div className="wp-ab-split" style={{
                          background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                          border: "2px solid #10b981",
                          borderRadius: "12px",
                          padding: "1rem"
                        }}>
                          <div className="wp-ab-split-header" style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "0.75rem"
                          }}>
                            <span style={{ fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: "6px", fontSize: "0.9rem" }}>
                              <Sparkles size={16} />
                              Mensagem Alternativa (Versão B)
                            </span>
                            <button
                              type="button"
                              className="ghost-button danger"
                              style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                              onClick={() => {
                                setAbTestActive(false);
                                setAbMessageText("");
                              }}
                            >
                              <X size={14} /> Desativar A/B
                            </button>
                          </div>
                          
                          <label className="whatsapp-message-field" style={{ marginTop: "0" }}>
                            <span style={{ fontSize: "0.82rem", color: "#059669" }}>Texto da Versão B</span>
                            <textarea
                              rows={6}
                              value={abMessageText}
                              onChange={(e) => setAbMessageText(e.target.value)}
                              placeholder="Digite a variação de texto para o teste A/B..."
                              style={{ borderColor: "#10b981" }}
                            />
                          </label>
                          
                          <div style={{
                            marginTop: "0.75rem",
                            padding: "0.75rem",
                            background: "rgba(16, 185, 129, 0.1)",
                            borderRadius: "8px",
                            fontSize: "0.75rem",
                            color: "#059669",
                            display: "flex",
                            alignItems: "start",
                            gap: "8px"
                          }}>
                            <Info size={14} style={{ flexShrink: 0, marginTop: "2px" }} />
                            <div>
                              <strong>Teste A/B ativo:</strong> Metade dos destinatários receberá a Versão A e a outra metade receberá a Versão B. Isso ajuda a reduzir o risco de bloqueios por mensagens repetitivas.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAbTestActive(true)}
                          style={{
                            width: "100%",
                            padding: "1rem",
                            background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                            border: "2px dashed #cbd5e1",
                            borderRadius: "12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            fontSize: "0.85rem",
                            fontWeight: 600,
                            color: "#475569",
                            cursor: "pointer",
                            transition: "all 0.2s"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)";
                            e.currentTarget.style.borderColor = "#10b981";
                            e.currentTarget.style.color = "#10b981";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)";
                            e.currentTarget.style.borderColor = "#cbd5e1";
                            e.currentTarget.style.color = "#475569";
                          }}
                        >
                          <Sparkles size={18} />
                          Ativar Teste A/B (Recomendado para evitar bloqueios)
                        </button>
                      )}
                    </div>

                    <div>
                      <div className="wp-preview-device" style={{
                        width: "280px",
                        background: "#1f1f1f",
                        borderRadius: "32px",
                        padding: "12px",
                        boxShadow: "0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)",
                        position: "sticky",
                        top: "20px"
                      }}>
                        <div className="wp-preview-screen" style={{
                          background: "#e5ddd5",
                          borderRadius: "20px",
                          overflow: "hidden",
                          height: "560px",
                          display: "flex",
                          flexDirection: "column"
                        }}>
                          <div className="wp-preview-top-bar" style={{
                            background: "#075e54",
                            color: "#fff",
                            padding: "12px 16px",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                          }}>
                            <div style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              background: "#25d366",
                              display: "grid",
                              placeItems: "center",
                              fontSize: "0.85rem",
                              fontWeight: "bold"
                            }}>
                              {(user?.name || "C").charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>Cliente</div>
                              <div style={{ fontSize: "0.7rem", opacity: 0.8 }}>online</div>
                            </div>
                            <Smartphone size={16} />
                          </div>
                          
                          <div className="wp-preview-chat-area" style={{
                            flex: 1,
                            padding: "16px",
                            overflowY: "auto",
                            backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h100v100H0z\" fill=\"%23e5ddd5\"/%3E%3Cpath d=\"M20 20l5 5-5 5m20-10l5 5-5 5\" stroke=\"%23d1c7b8\" stroke-width=\"0.5\" fill=\"none\" opacity=\"0.3\"/%3E%3C/svg%3E')",
                            backgroundSize: "100px 100px"
                          }}>
                            {campaignMessageType === "TEXT" ? (
                              <>
                                {messageText && (
                                  <div className="wp-preview-bubble" style={{
                                    background: "#d9fdd3",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    maxWidth: "85%",
                                    marginLeft: "auto",
                                    marginBottom: "8px",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                    position: "relative",
                                    fontSize: "0.85rem",
                                    lineHeight: "1.4",
                                    color: "#1a1a1a",
                                    wordWrap: "break-word"
                                  }}>
                                    {messageText}
                                    <div className="wp-preview-bubble-meta" style={{
                                      fontSize: "0.65rem",
                                      color: "#667781",
                                      textAlign: "right",
                                      marginTop: "4px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "flex-end",
                                      gap: "4px"
                                    }}>
                                      Agora <CheckCheck size={12} style={{ color: "#53bdeb" }} />
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                {messageText && (
                                  <div className="wp-preview-bubble" style={{
                                    background: "#d9fdd3",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    maxWidth: "85%",
                                    marginLeft: "auto",
                                    marginBottom: "8px",
                                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                    fontSize: "0.85rem",
                                    lineHeight: "1.4",
                                    color: "#1a1a1a"
                                  }}>
                                    {messageText}
                                    <div className="wp-preview-bubble-meta" style={{
                                      fontSize: "0.65rem",
                                      color: "#667781",
                                      textAlign: "right",
                                      marginTop: "4px"
                                    }}>
                                      Agora
                                    </div>
                                  </div>
                                )}
                                
                                {carouselSlides.some(s => s.image || s.text) && (
                                  <div style={{ 
                                    display: "flex", 
                                    gap: "8px", 
                                    overflowX: "auto", 
                                    padding: "4px 0",
                                    scrollbarWidth: "thin",
                                    scrollbarColor: "#bbb #e5ddd5"
                                  }}>
                                    {carouselSlides.map((slide, i) => (
                                      <div key={i} style={{ 
                                        minWidth: "180px", 
                                        maxWidth: "200px", 
                                        background: "#fff", 
                                        borderRadius: "12px", 
                                        overflow: "hidden", 
                                        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                                        flexShrink: 0,
                                        border: "1px solid #e0e0e0"
                                      }}>
                                        {slide.image && (
                                          <div style={{ 
                                            position: "relative", 
                                            width: "100%", 
                                            height: "120px",
                                            background: "#f0f0f0",
                                            overflow: "hidden"
                                          }}>
                                            <img 
                                              src={slide.image} 
                                              alt="" 
                                              style={{ 
                                                width: "100%", 
                                                height: "100%", 
                                                objectFit: "cover",
                                                objectPosition: "center"
                                              }} 
                                              onError={(e) => { 
                                                (e.target as HTMLImageElement).style.display = "none"; 
                                              }} 
                                            />
                                          </div>
                                        )}
                                        {slide.text && (
                                          <div style={{ 
                                            padding: "10px 12px", 
                                            fontSize: "0.75rem", 
                                            color: "#1a1a1a", 
                                            lineHeight: 1.4,
                                            minHeight: "60px",
                                            maxHeight: "80px",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis"
                                          }}>
                                            {slide.text.slice(0, 80)}{slide.text.length > 80 ? "..." : ""}
                                          </div>
                                        )}
                                        {slide.buttons.filter(b => b.text).map((btn, bi) => (
                                          <div key={bi} style={{ 
                                            padding: "8px 12px", 
                                            fontSize: "0.75rem", 
                                            color: "#0088cc", 
                                            textAlign: "center", 
                                            borderTop: "1px solid #e0e0e0", 
                                            fontWeight: 600,
                                            background: "#f8f9fa",
                                            cursor: "pointer",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis"
                                          }}>
                                            {btn.text}
                                          </div>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}

                            {abTestActive && abMessageText && (
                              <div className="wp-preview-bubble ab-split" style={{
                                background: "#dcf8c6",
                                padding: "8px 12px",
                                borderRadius: "8px",
                                maxWidth: "85%",
                                marginLeft: "auto",
                                marginTop: "8px",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                                fontSize: "0.85rem",
                                lineHeight: "1.4",
                                color: "#1a1a1a",
                                border: "2px dashed #10b981"
                              }}>
                                {abMessageText}
                                <div className="wp-preview-bubble-meta" style={{
                                  fontSize: "0.65rem",
                                  color: "#10b981",
                                  textAlign: "right",
                                  marginTop: "4px",
                                  fontWeight: 600
                                }}>
                                  Variação B
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div style={{
                            background: "#f0f0f0",
                            padding: "8px 12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            borderTop: "1px solid #d0d0d0"
                          }}>
                            <Smile size={20} style={{ color: "#8696a0" }} />
                            <div style={{
                              flex: 1,
                              background: "#fff",
                              borderRadius: "20px",
                              padding: "6px 12px",
                              fontSize: "0.8rem",
                              color: "#8696a0"
                            }}>
                              Mensagem
                            </div>
                            <Paperclip size={20} style={{ color: "#8696a0" }} />
                          </div>
                        </div>
                      </div>
                      <p className="panel-subcopy" style={{ textAlign: "center", marginTop: "12px", fontSize: "0.75rem", color: "#64748b" }}>
                        📱 Simulador em tempo real
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

                  {/* TEST MESSAGE SECTION */}
                  <div style={{ 
                    marginTop: "1.5rem", 
                    background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", 
                    padding: "1.5rem", 
                    borderRadius: "16px", 
                    border: "2px solid #3b82f6",
                    boxShadow: "0 4px 12px rgba(59, 130, 246, 0.15)"
                  }}>
                    <div style={{ display: "flex", alignItems: "start", gap: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: "0 0 8px 0", color: "#1e40af", fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
                          <Smartphone size={18} />
                          Enviar Mensagem de Teste
                        </h4>
                        <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "#1e40af", lineHeight: 1.5 }}>
                          Antes de disparar para todos os destinatários, envie uma mensagem de teste para verificar se está tudo correto.
                        </p>
                        <div style={{ 
                          background: "rgba(255, 255, 255, 0.7)", 
                          padding: "10px 14px", 
                          borderRadius: "8px",
                          fontSize: "0.82rem",
                          color: "#1e40af",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "12px"
                        }}>
                          <Info size={14} />
                          <div>
                            <strong>Número de teste:</strong> +55 11 91127-9702
                            {campaignMessageType === "CAROUSEL" && (
                              <div style={{ marginTop: "4px", fontSize: "0.75rem" }}>
                                ⚠️ O carrossel será enviado com todas as imagens e botões configurados
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => sendTestMessageMutation.mutate()}
                        disabled={sendTestMessageMutation.isPending || (!hasMessage && campaignMessageType !== "CAROUSEL")}
                        style={{
                          padding: "1rem 1.5rem",
                          background: sendTestMessageMutation.isPending || (!hasMessage && campaignMessageType !== "CAROUSEL") ? "#94a3b8" : "#3b82f6",
                          color: "#fff",
                          border: "none",
                          borderRadius: "12px",
                          fontSize: "0.9rem",
                          fontWeight: 700,
                          cursor: sendTestMessageMutation.isPending || (!hasMessage && campaignMessageType !== "CAROUSEL") ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
                          transition: "all 0.2s",
                          whiteSpace: "nowrap"
                        }}
                        onMouseEnter={(e) => {
                          if (!sendTestMessageMutation.isPending && (hasMessage || campaignMessageType === "CAROUSEL")) {
                            e.currentTarget.style.background = "#2563eb";
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 6px 16px rgba(59, 130, 246, 0.4)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!sendTestMessageMutation.isPending && (hasMessage || campaignMessageType === "CAROUSEL")) {
                            e.currentTarget.style.background = "#3b82f6";
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.3)";
                          }
                        }}
                      >
                        {sendTestMessageMutation.isPending ? (
                          <>
                            <LoaderCircle size={18} className="spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Send size={18} />
                            Enviar Teste
                          </>
                        )}
                      </button>
                    </div>
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





