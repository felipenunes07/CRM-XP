import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DealActivityType,
  DealDetail,
  DealListItem,
  DealPriority,
  PipelineStage,
} from "@olist-crm/shared";
import {
  ArrowRightLeft,
  CirclePlus,
  GripVertical,
  MessageSquareText,
  Phone,
  Plus,
  Trophy,
  X,
  XCircle,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { formatCurrency, formatDateTime } from "../lib/format";

const PRIORITY_LABELS: Record<DealPriority, string> = { LOW: "Baixa", MEDIUM: "Media", HIGH: "Alta" };
const PRIORITY_TONES: Record<DealPriority, string> = { LOW: "neutral", MEDIUM: "warning", HIGH: "danger" };

function daysSince(dateStr: string) {
  return Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)));
}

function activityIcon(type: DealActivityType) {
  if (type === "WHATSAPP_SENT" || type === "WHATSAPP_RECEIVED") return "💬";
  if (type === "CALL") return "📞";
  if (type === "MEETING") return "🤝";
  if (type === "STAGE_CHANGE") return "➡️";
  if (type === "TASK") return "✅";
  if (type === "CREATED") return "🆕";
  return "📝";
}

export function PipelinePage() {
  const auth = useAuth() as { token: string | null; user: { role: "ADMIN" | "MANAGER" | "SELLER"; name: string } | null };
  const { token } = auth;
  const queryClient = useQueryClient();

  const [showNewDealModal, setShowNewDealModal] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["pipeline-summary", showClosed],
    queryFn: () => api.pipelineSummary(token!, showClosed),
    enabled: Boolean(token),
  });

  const dealDetailQuery = useQuery({
    queryKey: ["pipeline-deal", selectedDealId],
    queryFn: () => api.getDeal(token!, selectedDealId!),
    enabled: Boolean(token && selectedDealId),
  });

  const moveStageMutation = useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) =>
      api.moveDealStage(token!, dealId, stageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline-deal"] });
    },
  });

  const stages = summaryQuery.data?.stages ?? [];
  const allDeals = summaryQuery.data?.deals ?? [];

  const filteredDeals = useMemo(() => {
    if (!searchFilter.trim()) return allDeals;
    const q = searchFilter.toLowerCase();
    return allDeals.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.customerDisplayName ?? "").toLowerCase().includes(q) ||
        (d.customerCode ?? "").toLowerCase().includes(q) ||
        (d.assignedToName ?? "").toLowerCase().includes(q),
    );
  }, [allDeals, searchFilter]);

  const visibleStages = useMemo(() => {
    if (showClosed) return stages;
    return stages.filter((s) => !s.isWon && !s.isLost);
  }, [stages, showClosed]);

  function dealsByStage(stageId: string) {
    return filteredDeals.filter((d) => d.stageId === stageId);
  }

  function handleDragStart(event: React.DragEvent, dealId: string) {
    event.dataTransfer.setData("text/plain", dealId);
    event.dataTransfer.effectAllowed = "move";
    setDraggingDealId(dealId);
  }

  function handleDragOver(event: React.DragEvent, stageId: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverStageId(stageId);
  }

  function handleDragLeave() {
    setDragOverStageId(null);
  }

  function handleDrop(event: React.DragEvent, stageId: string) {
    event.preventDefault();
    setDragOverStageId(null);
    setDraggingDealId(null);

    const dealId = event.dataTransfer.getData("text/plain");
    if (!dealId) return;

    const deal = allDeals.find((d) => d.id === dealId);
    if (!deal || deal.stageId === stageId) return;

    moveStageMutation.mutate({ dealId, stageId });
  }

  return (
    <div className="page-stack">
      <section className="panel pipeline-header">
        <div className="pipeline-header-copy">
          <p className="eyebrow">Pipeline de Vendas</p>
          <h2 className="premium-header-title">Kanban</h2>
          <p className="panel-subcopy">Arraste os deals entre os estagios para atualizar o status.</p>
        </div>

        <div className="pipeline-header-actions">
          <div className="pipeline-kpis">
            <div>
              <span>Deals ativos</span>
              <strong>{summaryQuery.data?.totalDeals ?? 0}</strong>
            </div>
            <div>
              <span>Valor total</span>
              <strong>{formatCurrency(summaryQuery.data?.totalValue ?? 0)}</strong>
            </div>
            <div>
              <span>Ganhos</span>
              <strong>{summaryQuery.data?.wonDeals ?? 0}</strong>
            </div>
          </div>

          <div className="pipeline-toolbar">
            <input
              className="pipeline-search"
              placeholder="Buscar deal, cliente..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
            <label className="pipeline-toggle">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(e) => setShowClosed(e.target.checked)}
              />
              <span>Mostrar encerrados</span>
            </label>
            <button
              className="primary-button"
              type="button"
              onClick={() => setShowNewDealModal(true)}
            >
              <Plus size={16} />
              Novo Deal
            </button>
          </div>
        </div>
      </section>

      <section className="pipeline-board">
        {visibleStages.map((stage) => {
          const stageDeals = dealsByStage(stage.id);
          const isDragOver = dragOverStageId === stage.id;

          return (
            <div
              key={stage.id}
              className={`pipeline-column ${isDragOver ? "pipeline-column-dragover" : ""}`}
              style={{ backgroundColor: `${stage.color}15`, borderColor: `${stage.color}22` }}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              <div className="pipeline-column-header">
                <div className="pipeline-column-title">
                  <span className="pipeline-column-dot" style={{ background: stage.color }} />
                  <strong>{stage.name}</strong>
                  <span className="pipeline-column-count" style={{ color: stage.color, backgroundColor: `${stage.color}22` }}>{stageDeals.length}</span>
                </div>
              </div>

              <div className="pipeline-column-cards">
                {stageDeals.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    stageColor={stage.color}
                    isDragging={draggingDealId === deal.id}
                    onDragStart={(e) => handleDragStart(e, deal.id)}
                    onDragEnd={() => setDraggingDealId(null)}
                    onClick={() => setSelectedDealId(deal.id)}
                  />
                ))}

                {stageDeals.length === 0 && (
                  <div className="pipeline-empty-col" style={{ borderColor: `${stage.color}33`, color: stage.color }}>Nenhum deal neste estagio</div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {showNewDealModal && (
        <NewDealModal
          stages={stages}
          onClose={() => setShowNewDealModal(false)}
        />
      )}

      {selectedDealId && dealDetailQuery.data && (
        <DealDetailModal
          deal={dealDetailQuery.data}
          stages={stages}
          onClose={() => setSelectedDealId(null)}
        />
      )}
    </div>
  );
}

// ── Deal Card ─────────────────────────────────────────────────────

function DealCard({
  deal,
  stageColor,
  isDragging,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  deal: DealListItem;
  stageColor: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const inactiveDays = daysSince(deal.lastActivityAt);
  const initials = deal.title.substring(0, 2).toUpperCase().replace(/[^a-zA-Z0-9]/g, '');

  return (
    <article
      className={`pipeline-card ${isDragging ? "pipeline-card-dragging" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <div className="pipeline-card-avatar" style={{ backgroundColor: `${stageColor}22`, color: stageColor }}>
        {initials || "U"}
      </div>
      <div className="pipeline-card-body">
        <strong className="pipeline-card-title">{deal.title}</strong>
        {deal.customerDisplayName && (
          <span className="pipeline-card-customer">{deal.customerDisplayName}</span>
        )}
        <div className="pipeline-card-meta">
          <span className={`status-badge status-${PRIORITY_TONES[deal.priority]}`}>
            {PRIORITY_LABELS[deal.priority]}
          </span>
          {inactiveDays > 7 && (
            <span className="status-badge status-danger">{inactiveDays}d inativo</span>
          )}
        </div>
      </div>
    </article>
  );
}

// ── New Deal Modal ────────────────────────────────────────────────

function NewDealModal({
  stages,
  onClose,
}: {
  stages: PipelineStage[];
  onClose: () => void;
}) {
  const auth = useAuth() as { token: string | null };
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [stageId, setStageId] = useState(stages.find((s) => !s.isWon && !s.isLost)?.id ?? "");
  const [expectedValue, setExpectedValue] = useState(0);
  const [priority, setPriority] = useState<DealPriority>("MEDIUM");
  const [whatsappJid, setWhatsappJid] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      api.createDeal(auth.token!, {
        title,
        stageId,
        expectedValue,
        priority,
        whatsappJid: whatsappJid ? `${whatsappJid.replace(/\D/g, "")}@s.whatsapp.net` : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] });
      onClose();
    },
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container pipeline-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Novo Deal</h3>
          <button type="button" className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <label>
            Titulo *
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Pedido 500 pecas cliente X" />
          </label>

          <label>
            Estagio
            <select value={stageId} onChange={(e) => setStageId(e.target.value)}>
              {stages.filter((s) => !s.isWon && !s.isLost).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label>
            WhatsApp do Cliente (Apenas números)
            <input value={whatsappJid} onChange={(e) => setWhatsappJid(e.target.value)} placeholder="Ex: 5511999999999" />
          </label>

          <label>
            Valor esperado (R$)
            <input type="number" min={0} value={expectedValue} onChange={(e) => setExpectedValue(Number(e.target.value) || 0)} />
          </label>

          <label>
            Prioridade
            <select value={priority} onChange={(e) => setPriority(e.target.value as DealPriority)}>
              <option value="LOW">Baixa</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
            </select>
          </label>

          {createMutation.isError && (
            <div className="page-error">{(createMutation.error as Error).message}</div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="primary-button"
            disabled={!title.trim() || !stageId || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            <CirclePlus size={16} />
            {createMutation.isPending ? "Criando..." : "Criar Deal"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Deal Detail Modal ─────────────────────────────────────────────

function DealDetailModal({
  deal,
  stages,
  onClose,
}: {
  deal: DealDetail;
  stages: PipelineStage[];
  onClose: () => void;
}) {
  const auth = useAuth() as { token: string | null };
  const queryClient = useQueryClient();
  const [activityContent, setActivityContent] = useState("");
  const [activityType, setActivityType] = useState<DealActivityType>("NOTE");

  const currentStage = stages.find((s) => s.id === deal.stageId);

  const addActivityMutation = useMutation({
    mutationFn: () =>
      api.addDealActivity(auth.token!, deal.id, {
        activityType: activityType,
        content: activityContent,
      }),
    onSuccess: () => {
      setActivityContent("");
      void queryClient.invalidateQueries({ queryKey: ["pipeline-deal", deal.id] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] });
    },
  });

  const moveStageMutation = useMutation({
    mutationFn: (stageId: string) => api.moveDealStage(auth.token!, deal.id, stageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pipeline-deal", deal.id] });
      void queryClient.invalidateQueries({ queryKey: ["pipeline-summary"] });
    },
  });

  const wonStage = stages.find((s) => s.isWon);
  const lostStage = stages.find((s) => s.isLost);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container pipeline-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{deal.title}</h3>
            {currentStage && (
              <span className="status-badge" style={{ background: currentStage.color, color: "#fff" }}>
                {currentStage.name}
              </span>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body pipeline-detail-body">
          <div className="pipeline-detail-info">
            <div className="pipeline-detail-grid">
              <div>
                <span>Cliente</span>
                <strong>{deal.customerDisplayName || "Sem cliente vinculado"}</strong>
              </div>
              <div>
                <span>Valor esperado</span>
                <strong>{formatCurrency(deal.expectedValue)}</strong>
              </div>
              <div>
                <span>Responsavel</span>
                <strong>{deal.assignedToName || "Nao atribuido"}</strong>
              </div>
              <div>
                <span>WhatsApp</span>
                <strong>{deal.whatsappJid ? deal.whatsappJid.replace("@s.whatsapp.net", "") : "Não cadastrado"}</strong>
              </div>
              <div>
                <span>Criado em</span>
                <strong>{formatDateTime(deal.createdAt)}</strong>
              </div>
            </div>

            <div className="pipeline-detail-actions">
              {wonStage && !currentStage?.isWon && !currentStage?.isLost && (
                <button
                  type="button"
                  className="primary-button pipeline-btn-won"
                  onClick={() => moveStageMutation.mutate(wonStage.id)}
                  disabled={moveStageMutation.isPending}
                >
                  <Trophy size={16} />
                  Marcar como ganho
                </button>
              )}
              {lostStage && !currentStage?.isLost && !currentStage?.isWon && (
                <button
                  type="button"
                  className="secondary-button pipeline-btn-lost"
                  onClick={() => moveStageMutation.mutate(lostStage.id)}
                  disabled={moveStageMutation.isPending}
                >
                  <XCircle size={16} />
                  Marcar como perdido
                </button>
              )}

              {!currentStage?.isWon && !currentStage?.isLost && (
                <div className="pipeline-move-selector">
                  <ArrowRightLeft size={14} />
                  <select
                    value={deal.stageId}
                    onChange={(e) => moveStageMutation.mutate(e.target.value)}
                    disabled={moveStageMutation.isPending}
                  >
                    {stages.filter((s) => !s.isWon && !s.isLost).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="pipeline-detail-timeline">
            <h4>Atividades</h4>

            <div className="pipeline-add-activity">
              <div className="pipeline-activity-input-row">
                <select value={activityType} onChange={(e) => setActivityType(e.target.value as DealActivityType)}>
                  <option value="NOTE">📝 Nota</option>
                  <option value="CALL">📞 Ligacao</option>
                  <option value="MEETING">🤝 Reuniao</option>
                  <option value="WHATSAPP_SENT">💬 WhatsApp</option>
                  <option value="TASK">✅ Tarefa</option>
                </select>
                <input
                  value={activityContent}
                  onChange={(e) => setActivityContent(e.target.value)}
                  placeholder="Descreva a atividade..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && activityContent.trim()) {
                      addActivityMutation.mutate();
                    }
                  }}
                />
                <button
                  type="button"
                  className="primary-button"
                  disabled={!activityContent.trim() || addActivityMutation.isPending}
                  onClick={() => addActivityMutation.mutate()}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="pipeline-activity-list">
              {deal.activities.map((activity) => (
                <div key={activity.id} className="pipeline-activity-item">
                  <span className="pipeline-activity-icon">{activityIcon(activity.activityType)}</span>
                  <div className="pipeline-activity-content">
                    <p>{activity.content}</p>
                    <small>
                      {activity.actorName && <strong>{activity.actorName}</strong>}
                      {" · "}
                      {formatDateTime(activity.createdAt)}
                    </small>
                  </div>
                </div>
              ))}

              {deal.activities.length === 0 && (
                <div className="empty-state">Nenhuma atividade registrada ainda.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
