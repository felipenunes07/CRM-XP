import { ChangeEvent, useEffect, useMemo, useState } from "react";
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
import { CheckCircle2, Clock3, LoaderCircle, RefreshCw, Send, ShieldAlert, UploadCloud, XCircle } from "lucide-react";
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

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Nao foi possivel ler o arquivo selecionado."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo selecionado."));
    reader.readAsDataURL(file);
  });
}

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

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  const importFileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error("Escolha um arquivo antes de importar.");
      }

      const fileBase64 = await readFileAsBase64(selectedFile);
      return api.importWhatsappGroups(token!, {
        fileName: selectedFile.name,
        fileBase64,
      });
    },
    onSuccess: async () => {
      setSelectedFile(null);
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
    if (!selectedCampaignId && campaignsQuery.data?.[0]) {
      setSelectedCampaignId(campaignsQuery.data[0].id);
    }
  }, [campaignsQuery.data, selectedCampaignId]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    const template = templatesQuery.data?.find((item) => item.id === selectedTemplateId);
    if (!template) return;

    setMessageText(template.content);
    setCampaignName((current) => current || `${template.title} ${new Date().toLocaleDateString("pt-BR")}`);
  }, [selectedTemplateId, templatesQuery.data]);

  useEffect(() => {
    if (!canImport || !mappingSummaryQuery.data || attemptedAutoImport || importDefaultMutation.isPending) {
      return;
    }

    if (mappingSummaryQuery.data.totalGroups === 0) {
      setAttemptedAutoImport(true);
      importDefaultMutation.mutate();
    }
  }, [attemptedAutoImport, canImport, importDefaultMutation, mappingSummaryQuery.data]);

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
  const importSummary = importDefaultMutation.data ?? importFileMutation.data;
  const importError = (importDefaultMutation.error ?? importFileMutation.error) as Error | null;
  const isImporting = importDefaultMutation.isPending || importFileMutation.isPending;
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

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

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

  return (
    <div className="page-stack">
      <section className="panel whatsapp-workspace-header">
        <div className="whatsapp-workspace-copy">
          <p className="eyebrow">Disparador WhatsApp</p>
          <h2>Disparador</h2>
          <p className="panel-subcopy">Monte a mensagem, confira a base e acompanhe a fila sem sair desta tela.</p>

          <div className="whatsapp-flow-strip">
            <div className={`whatsapp-flow-step ${hasMessage ? "is-done" : "is-active"}`}>
              <span>1</span>
              <div>
                <strong>Monte a mensagem</strong>
                <small>Defina campanha, template e texto final.</small>
              </div>
            </div>
            <div className={`whatsapp-flow-step ${mappingSummaryQuery.data?.totalGroups ? "is-done" : ""}`}>
              <span>2</span>
              <div>
                <strong>Confira a base</strong>
                <small>Atualize a planilha e veja pendencias antes do envio.</small>
              </div>
            </div>
            <div className={`whatsapp-flow-step ${isReadyToDispatch ? "is-done" : ""}`}>
              <span>3</span>
              <div>
                <strong>Dispare com seguranca</strong>
                <small>Selecione os grupos e acompanhe a fila em tempo real.</small>
              </div>
            </div>
          </div>
        </div>

        <div className="whatsapp-inline-stats">
          <div className="whatsapp-inline-stat is-highlight">
            <span>Selecionados</span>
            <strong>{formatNumber(selectedGroupCount)}</strong>
          </div>
          <div className="whatsapp-inline-stat">
            <span>Base</span>
            <strong>{mappingSummaryQuery.data ? formatNumber(mappingSummaryQuery.data.totalGroups) : "--"}</strong>
          </div>
          <div className="whatsapp-inline-stat">
            <span>Pendentes</span>
            <strong>{mappingSummaryQuery.data ? formatNumber(mappingSummaryQuery.data.pendingReviewGroups) : "--"}</strong>
          </div>
          <div className="whatsapp-inline-stat">
            <span>Ultima atualizacao</span>
            <strong>{formatDateTime(mappingSummaryQuery.data?.lastImportedAt ?? null)}</strong>
          </div>
        </div>
      </section>

      <section className="grid-two whatsapp-simple-grid whatsapp-setup-grid">
        <article className="panel whatsapp-compose-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Passo 1</p>
              <h3>Mensagem e disparo</h3>
              <p className="panel-subcopy">Preencha da esquerda para a direita: campanha, ritmo e mensagem final.</p>
            </div>
            <div className={`whatsapp-panel-pill ${isReadyToDispatch ? "is-ready" : ""}`}>
              <strong>{isReadyToDispatch ? "Pronto para disparar" : "Em preparacao"}</strong>
              <span>{composeHelperText}</span>
            </div>
          </div>

          <div className="whatsapp-compose-summary">
            <div>
              <span>Template</span>
              <strong>{selectedTemplate?.title ?? "Mensagem livre"}</strong>
            </div>
            <div>
              <span>Publico salvo</span>
              <strong>{selectedSavedSegment?.name ?? "Todos os grupos"}</strong>
            </div>
            <div>
              <span>Selecionados</span>
              <strong>{formatNumber(selectedGroupCount)} grupos</strong>
            </div>
            <div>
              <span>Anti-spam</span>
              <strong>{overrideRecentBlock ? "Bloqueio ignorado" : "Bloqueio de 7 dias ativo"}</strong>
            </div>
          </div>

          <div className="filters-grid whatsapp-compose-top-grid">
            <label>
              Nome da campanha
              <input
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                placeholder="Ex: Reativacao clientes inativos"
              />
            </label>

            <label>
              Template de mensagem
              <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                <option value="">Mensagem livre</option>
                {(templatesQuery.data ?? []).map((template: MessageTemplate) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="whatsapp-delay-grid">
            <label className="whatsapp-delay-field">
              <span>Delay minimo</span>
              <input
                type="number"
                min={1}
                value={minDelaySeconds}
                onChange={(event) => setMinDelaySeconds(Number(event.target.value) || 1)}
              />
              <small>Menor intervalo entre um envio e outro.</small>
            </label>

            <label className="whatsapp-delay-field">
              <span>Delay maximo</span>
              <input
                type="number"
                min={1}
                value={maxDelaySeconds}
                onChange={(event) => setMaxDelaySeconds(Number(event.target.value) || 1)}
              />
              <small>Ajuda a distribuir a fila com variacao natural.</small>
            </label>
          </div>

          <div className="whatsapp-compose-editor-grid">
            <label className="whatsapp-message-field">
              <span>Mensagem final</span>
              <textarea
                rows={12}
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder="Digite a mensagem que sera enviada..."
              />
            </label>

            <div className="whatsapp-preview-panel">
              <div className="whatsapp-preview-header">
                <strong>Previa do envio</strong>
                <span>Assim o texto aparece antes do disparo.</span>
              </div>
              <div className="message-preview whatsapp-message-preview whatsapp-message-preview-panel">
                {messageText || "A mensagem final vai aparecer aqui assim que voce escrever ou escolher um template."}
              </div>
            </div>
          </div>

          {!templatesQuery.data?.length ? (
            <div className="empty-state">Nenhum template salvo ainda. A mensagem livre abaixo sera usada normalmente.</div>
          ) : null}

          <div className="whatsapp-compose-footer">
            <label className="whatsapp-checkbox-row">
              <input
                type="checkbox"
                checked={overrideRecentBlock}
                onChange={(event) => setOverrideRecentBlock(event.target.checked)}
              />
              <span>Ignorar o bloqueio de 7 dias para contatos recentes</span>
            </label>

            <div className="whatsapp-compose-actions">
              <p className="panel-subcopy">{composeHelperText}</p>
              <button
                className="primary-button"
                type="button"
                onClick={() => createCampaignMutation.mutate()}
                disabled={createCampaignMutation.isPending || !isReadyToDispatch}
              >
                {createCampaignMutation.isPending ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
                {dispatchButtonLabel}
              </button>
            </div>
          </div>

          {createCampaignMutation.isError ? (
            <div className="page-error">{(createCampaignMutation.error as Error).message}</div>
          ) : null}
        </article>

        <article className="panel whatsapp-source-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Passo 2</p>
              <h3>Base de grupos</h3>
              <p className="panel-subcopy">A planilha padrao do desktop alimenta a tela. Atualize so quando quiser recarregar.</p>
            </div>
          </div>

          <div className="whatsapp-base-overview">
            <div>
              <span>Base total</span>
              <strong>{mappingSummaryQuery.data ? formatNumber(mappingSummaryQuery.data.totalGroups) : "--"}</strong>
            </div>
            <div>
              <span>Nunca compraram</span>
              <strong>
                {mappingSummaryQuery.data
                  ? formatNumber(mappingSummaryQuery.data.classificationCounts.NO_ORDER_EXCEL)
                  : "--"}
              </strong>
            </div>
            <div>
              <span>Ultima atualizacao</span>
              <strong>{formatDateTime(mappingSummaryQuery.data?.lastImportedAt ?? null)}</strong>
            </div>
          </div>

          <div className="whatsapp-source-actions">
            {canImport ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => importDefaultMutation.mutate()}
                disabled={isImporting}
              >
                {isImporting ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
                {isImporting ? "Atualizando..." : "Usar planilha padrao"}
              </button>
            ) : null}

            {canImport ? (
              <label className="whatsapp-file-input">
                <UploadCloud size={16} />
                <span>{selectedFile ? selectedFile.name : "Escolher outro arquivo"}</span>
                <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
              </label>
            ) : null}

            {canImport && selectedFile ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => importFileMutation.mutate()}
                disabled={isImporting}
              >
                Importar arquivo escolhido
              </button>
            ) : null}
          </div>

          {importSummary ? (
            <div className="whatsapp-summary-grid">
              <div>
                <span>Linhas validas</span>
                <strong>{formatNumber(importSummary.importedCount)}</strong>
              </div>
              <div>
                <span>Inseridos</span>
                <strong>{formatNumber(importSummary.insertedCount)}</strong>
              </div>
              <div>
                <span>Atualizados</span>
                <strong>{formatNumber(importSummary.updatedCount)}</strong>
              </div>
              <div>
                <span>Auto mapeados</span>
                <strong>{formatNumber(importSummary.autoMappedCount)}</strong>
              </div>
            </div>
          ) : null}

          {importError ? <div className="page-error">{importError.message}</div> : null}

          {mappingSummaryQuery.data?.pendingReviewGroups ? (
            <div className="whatsapp-inline-note">
              <strong>{formatNumber(mappingSummaryQuery.data.pendingReviewGroups)} pendentes.</strong>
              <span>Continuam na tabela, mas nao entram em publico salvo ate fechar o mapeamento.</span>
            </div>
          ) : null}

          {liveCampaign && liveCampaignIsRunning ? (
            <div className="whatsapp-live-card whatsapp-live-queue-card">
              <div className="whatsapp-live-card-header">
                <strong>Fila do disparo agora</strong>
                <span className={`status-badge status-${campaignStatusTone(liveCampaign.status)}`}>
                  {liveCampaign.status}
                </span>
              </div>

              <div className="whatsapp-live-card-grid">
                <div>
                  <span>Campanha</span>
                  <strong>{liveCampaign.name}</strong>
                </div>
                <div>
                  <span>Proximo envio</span>
                  <strong>{formatDateTime(liveCampaign.progress.nextScheduledAt)}</strong>
                </div>
                <div>
                  <span>Enviados</span>
                  <strong>{formatNumber(liveCampaign.progress.sentCount)}</strong>
                </div>
                <div>
                  <span>Pendentes</span>
                  <strong>{formatNumber(liveCampaign.progress.pendingCount)}</strong>
                </div>
              </div>

              <div className="whatsapp-countdown-card">
                <span>Proximo disparo em</span>
                <strong>
                  {liveCampaign.progress.nextScheduledAt
                    ? nextDispatchCountdown ?? formatDateTime(liveCampaign.progress.nextScheduledAt)
                    : liveCampaign.status === "IN_PROGRESS"
                      ? "Enviando agora"
                      : "Fila concluida"}
                </strong>
                <small>
                  {liveCampaign.progress.nextScheduledAt
                    ? `Horario previsto: ${formatDateTime(liveCampaign.progress.nextScheduledAt)}`
                    : "Nao ha mais contatos aguardando na fila."}
                </small>
              </div>

              <div className="whatsapp-live-recipient-list">
                {liveRecipients.map((recipient) => (
                  <article key={recipient.id} className={`whatsapp-live-recipient tone-${recipientTone(recipient.status)}`}>
                    <div>
                      <strong>{recipient.sourceName}</strong>
                      <p>
                        {recipient.status === "PENDING" && recipient.scheduledFor
                          ? `${recipientLiveLabel(recipient)}${formatCountdown(recipient.scheduledFor, nowMs) ? ` - faltam ${formatCountdown(recipient.scheduledFor, nowMs)}` : ""}`
                          : recipientLiveLabel(recipient)}
                      </p>
                    </div>
                    <span className={`status-badge status-${recipientTone(recipient.status)}`}>{recipient.status}</span>
                  </article>
                ))}
              </div>

              <p className="panel-subcopy">
                Delay ativo: {liveCampaign.minDelaySeconds}s a {liveCampaign.maxDelaySeconds}s entre envios.
              </p>

              {liveCampaignFirstFailure ? (
                <div className="empty-state">
                  Ultima falha: {liveCampaignFirstFailure.sourceName} - {liveCampaignFirstFailure.lastError || "falha no envio"}.
                </div>
              ) : null}
            </div>
          ) : liveCampaign ? (
            <div className="whatsapp-live-card whatsapp-live-card-compact">
              <div className="whatsapp-live-card-header">
                <strong>Ultimo disparo</strong>
                <span className={`status-badge status-${campaignStatusTone(liveCampaign.status)}`}>
                  {liveCampaign.status}
                </span>
              </div>
              <div className="whatsapp-live-card-grid whatsapp-live-card-grid-compact">
                <div>
                  <span>Campanha</span>
                  <strong>{liveCampaign.name}</strong>
                </div>
                <div>
                  <span>Enviados</span>
                  <strong>{formatNumber(liveCampaign.progress.sentCount)}</strong>
                </div>
                <div>
                  <span>Falhas</span>
                  <strong>{formatNumber(liveCampaign.progress.failedCount)}</strong>
                </div>
                <div>
                  <span>Finalizado</span>
                  <strong>{formatDateTime(liveCampaign.finishedAt || liveCampaign.createdAt)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              A fila aparece aqui assim que um disparo entrar em andamento.
            </div>
          )}
        </article>
      </section>

      <section className="panel table-panel">
        <div className="panel-header whatsapp-selection-summary">
          <div>
            <p className="eyebrow">Selecao</p>
            <h3>Grupos para disparo</h3>
            <p className="panel-subcopy">Filtre e marque os grupos que vao receber.</p>
          </div>
          <div className="whatsapp-inline-stats whatsapp-inline-stats-compact">
            <div className="whatsapp-inline-stat">
              <span>Mostrados</span>
              <strong>{formatNumber(filteredGroups.length)}</strong>
            </div>
            <div className="whatsapp-inline-stat is-highlight">
              <span>Selecionados</span>
              <strong>{formatNumber(selectedGroupCount)}</strong>
            </div>
          </div>
        </div>

        <div className="filters-grid filters-grid-four whatsapp-selection-toolbar">
          <label>
            Publico salvo
            <select value={savedSegmentId} onChange={(event) => setSavedSegmentId(event.target.value)}>
              <option value="">Todos os grupos</option>
              {(savedSegmentsQuery.data ?? []).map((segment: SavedSegment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Buscar
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome do grupo, cliente ou codigo"
            />
          </label>

          <div className="whatsapp-filter-segment">
            <span>Bloqueio</span>
            <div className="whatsapp-segmented-control">
              <button
                type="button"
                className={recentBlockFilter === "AVAILABLE_ONLY" ? "active" : ""}
                onClick={() => setRecentBlockFilter("AVAILABLE_ONLY")}
              >
                Disponiveis
              </button>
              <button
                type="button"
                className={recentBlockFilter === "ALL" ? "active" : ""}
                onClick={() => setRecentBlockFilter("ALL")}
              >
                Todos
              </button>
              <button
                type="button"
                className={recentBlockFilter === "BLOCKED_ONLY" ? "active" : ""}
                onClick={() => setRecentBlockFilter("BLOCKED_ONLY")}
              >
                Bloqueados
              </button>
            </div>
          </div>
        </div>

        {hiddenBlockedCount ? (
          <div className="whatsapp-selection-hint">
            {formatNumber(hiddenBlockedCount)} grupos bloqueados estao ocultos no filtro `Disponiveis`.
          </div>
        ) : null}

        <div className="whatsapp-quick-filter-row">
          {quickFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`chart-switch-button ${quickFilter === filter.value ? "active" : ""}`}
              onClick={() => setQuickFilter(filter.value)}
            >
              <strong>
                {filter.label}
              </strong>
              <small>{quickFilterCount(filter.value, mappingSummaryQuery.data)}</small>
            </button>
          ))}
        </div>

        <div className="inline-actions whatsapp-selection-actions">
          <button className="ghost-button" type="button" onClick={toggleVisibleSelection} disabled={!filteredGroups.length}>
            {allVisibleSelected ? "Desmarcar visiveis" : "Selecionar visiveis"}
          </button>
          <button className="ghost-button" type="button" onClick={() => setSelectedGroupIds([])} disabled={!selectedGroupCount}>
            Limpar selecao
          </button>
        </div>

        {groupsQuery.isLoading ? <div className="page-loading">Carregando grupos...</div> : null}
        {groupsQuery.isError ? <div className="page-error">Nao foi possivel carregar os grupos.</div> : null}

        {groupsQuery.data?.items.length ? (
          <div className="table-scroll">
            <table className="data-table whatsapp-groups-table">
              <thead>
                <tr>
                  <th>Enviar</th>
                  <th>Grupo do Excel</th>
                  <th>Cliente mapeado</th>
                  <th>Tipo</th>
                  <th>Ultimo contato</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {groupsQuery.data.items.map((group: WhatsappGroup) => (
                  <tr key={group.id} className={selectedGroupIds.includes(group.id) ? "is-selected" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(group.id)}
                        onChange={() => toggleGroupSelection(group.id)}
                      />
                    </td>
                    <td>
                      <div className="table-link">
                        <strong>{group.sourceName}</strong>
                        <span>{group.jid}</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-link">
                        <strong>{group.customerDisplayName || "Sem cliente mapeado"}</strong>
                        <span>{group.customerCode || "Grupo sem codigo no CRM"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-link">
                        <strong>{classificationLabel(group.classification)}</strong>
                        <span>{mappingStatusLabel(group.mappingStatus)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-link">
                        <strong>{formatDateTime(group.lastContactAt)}</strong>
                        <span className="table-truncate">
                          {truncateText(
                            group.lastMessagePreview || (group.isRecentlyBlocked ? "Contato recente." : "Sem historico de envio."),
                          )}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="whatsapp-table-status">
                        {group.isRecentlyBlocked ? (
                          <div className="table-link whatsapp-status-stack">
                            <span className="status-badge status-warning">Bloqueado</span>
                            <span>ate {formatDateTime(group.recentBlockUntil)}</span>
                          </div>
                        ) : (
                          <span className="status-badge status-success">Disponivel</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-panel">
            <div className="empty-state">
              {savedSegmentId
                ? "Esse publico salvo ainda nao tem grupos mapeados na base importada."
                : "Nenhum grupo encontrado com o filtro atual."}
            </div>
          </div>
        )}
      </section>

      <section className="grid-two whatsapp-campaign-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Historico</p>
              <h3>Fila e historico</h3>
            </div>
          </div>

          <div className="whatsapp-campaign-list">
            {(campaignsQuery.data ?? []).map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                className={`queue-card whatsapp-campaign-card ${selectedCampaignId === campaign.id ? "is-selected" : ""}`}
                onClick={() => setSelectedCampaignId(campaign.id)}
              >
                <div className="queue-card-top">
                  <div className="queue-card-heading">
                    <strong>{campaign.name}</strong>
                    <p className="muted-copy">
                      {campaign.templateTitle || "Mensagem livre"} - {formatDateTime(campaign.createdAt)}
                    </p>
                  </div>
                  <span className={`status-badge status-${campaignStatusTone(campaign.status)}`}>{campaign.status}</span>
                </div>
                <div className="queue-card-meta">
                  <span>{formatNumber(campaign.progress.sentCount)} enviados</span>
                  <span>{formatNumber(campaign.progress.failedCount)} falhas</span>
                  <span>{formatNumber(campaign.progress.blockedRecentCount)} bloqueados</span>
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Tempo real</p>
              <h3>Progresso da campanha</h3>
            </div>
            {selectedCampaignQuery.data && ["QUEUED", "IN_PROGRESS"].includes(selectedCampaignQuery.data.status) ? (
              <button
                className="ghost-button danger"
                type="button"
                onClick={() => cancelCampaignMutation.mutate(selectedCampaignQuery.data!.id)}
                disabled={cancelCampaignMutation.isPending}
              >
                Cancelar campanha
              </button>
            ) : null}
          </div>

          {selectedCampaignQuery.isLoading ? <div className="page-loading">Carregando campanha...</div> : null}
          {selectedCampaignQuery.isError ? <div className="page-error">Nao foi possivel carregar a campanha.</div> : null}

          {selectedCampaignQuery.data ? (
            <>
              <div className="whatsapp-progress-header">
                <div>
                  <strong>{selectedCampaignQuery.data.name}</strong>
                  <p className="muted-copy">
                    Criada por {selectedCampaignQuery.data.createdByName} -{" "}
                    {formatDateTime(selectedCampaignQuery.data.createdAt)}
                  </p>
                </div>
                <span className={`status-badge status-${campaignStatusTone(selectedCampaignQuery.data.status)}`}>
                  {selectedCampaignQuery.data.status}
                </span>
              </div>

              <div className="whatsapp-progress-bar">
                <div
                  className="whatsapp-progress-bar-fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, selectedCampaignQuery.data.progress.completionRatio * 100))}%`,
                  }}
                />
              </div>

              <div className="whatsapp-summary-grid">
                <div><span>Conclusao</span><strong>{formatPercent(selectedCampaignQuery.data.progress.completionRatio)}</strong></div>
                <div><span>Enviados</span><strong>{formatNumber(selectedCampaignQuery.data.progress.sentCount)}</strong></div>
                <div><span>Falhas</span><strong>{formatNumber(selectedCampaignQuery.data.progress.failedCount)}</strong></div>
                <div><span>Bloqueados</span><strong>{formatNumber(selectedCampaignQuery.data.progress.blockedRecentCount)}</strong></div>
                <div><span>Proximo envio</span><strong>{formatDateTime(selectedCampaignQuery.data.progress.nextScheduledAt)}</strong></div>
                <div><span>Previsao final</span><strong>{formatDateTime(selectedCampaignQuery.data.progress.estimatedFinishAt)}</strong></div>
              </div>

              <div className="whatsapp-recipient-list">
                {selectedCampaignQuery.data.recipients.map((recipient) => (
                  <article key={recipient.id} className={`queue-card compact whatsapp-recipient-card tone-${recipientTone(recipient.status)}`}>
                    <div className="queue-card-top">
                      <div className="queue-card-heading">
                        <strong>{recipient.sourceName}</strong>
                        <p className="muted-copy">{recipient.customerDisplayName || recipient.customerCode || recipient.jid}</p>
                      </div>
                      <span className={`status-badge status-${recipientTone(recipient.status)}`}>{recipient.status}</span>
                    </div>
                    <div className="queue-card-meta">
                      {recipient.status === "SENT" ? <span><CheckCircle2 size={14} /> Enviado {formatDateTime(recipient.sentAt)}</span> : null}
                      {recipient.status === "FAILED" ? <span><XCircle size={14} /> {recipient.lastError || "Falha no envio"}</span> : null}
                      {recipient.status === "PENDING" ? <span><Clock3 size={14} /> Agendado para {formatDateTime(recipient.scheduledFor)}</span> : null}
                      {recipient.status === "BLOCKED_RECENT" ? <span><ShieldAlert size={14} /> Bloqueado por contato recente</span> : null}
                      {recipient.status === "SENDING" ? <span><LoaderCircle size={14} className="spin" /> Enviando agora</span> : null}
                      {recipient.status === "SKIPPED" ? <span>Pulado</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">Selecione uma campanha para acompanhar o progresso em tempo real.</div>
          )}
        </article>
      </section>
    </div>
  );
}
