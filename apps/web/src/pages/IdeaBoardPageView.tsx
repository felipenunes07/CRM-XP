import { useMemo, useState, type DragEvent as ReactDragEvent } from "react";
import type { IdeaBoardColumnId, IdeaBoardDetail, IdeaBoardItem, IdeaVoteOption } from "@olist-crm/shared";
import { BellRing, Plus, Trash2, X } from "lucide-react";
import {
  hasIdeaLaneOverride,
  type IdeaBoardLane,
  type IdeaBoardLaneId,
  type IdeaCreateDraft,
  type IdeaTimelinePoint,
  type IdeaVoteDraft,
  formatIdeaStatus,
  formatIdeaVoteOption,
  getIdeaInboxDeadline,
  getIdeaLaneId,
  getIdeaLaneTitle,
  isIdeaInInboxWindow,
  ideaVoteOptions,
  truncateIdeaCopy,
} from "./ideaBoardPage.helpers";
import { formatDateTime, formatNumber } from "../lib/format";

interface IdeaBoardPageViewProps {
  ideas: IdeaBoardItem[];
  lanes: IdeaBoardLane[];
  timeline: IdeaTimelinePoint[];
  activeLaneId: IdeaBoardLaneId;
  selectedIdea: IdeaBoardDetail | null;
  isCreateModalOpen: boolean;
  createDraft: IdeaCreateDraft;
  voteDraft: IdeaVoteDraft;
  createError: string | null;
  voteError: string | null;
  deleteError: string | null;
  moveError: string | null;
  notifyError: string | null;
  toastMessage: string | null;
  isIdeasLoading: boolean;
  isIdeaLoading: boolean;
  isCreating: boolean;
  isVoting: boolean;
  isDeleting: boolean;
  isMoving: boolean;
  isNotifying: boolean;
  onActiveLaneChange: (laneId: IdeaBoardLaneId) => void;
  onCreateDraftChange: (draft: IdeaCreateDraft) => void;
  onVoteDraftChange: (draft: IdeaVoteDraft) => void;
  onOpenCreateModal: () => void;
  onCloseCreateModal: () => void;
  onCreateIdea: () => void;
  onDeleteIdea: () => void;
  onMoveIdea: (ideaId: string, laneId: IdeaBoardColumnId) => void;
  onNotifyWhatsapp: () => void;
  onSubmitVote: () => void;
  onSelectIdea: (ideaId: string) => void;
  onCloseIdea: () => void;
  onDismissToast: () => void;
}

function voteTone(option: IdeaVoteOption) {
  if (option === "LIKE") return "success";
  if (option === "NO") return "danger";
  return "warning";
}

function voteCountForOption(idea: IdeaBoardItem | IdeaBoardDetail, option: IdeaVoteOption) {
  if (option === "LIKE") return idea.voteSummary.likeCount;
  if (option === "MAYBE") return idea.voteSummary.maybeCount;
  return idea.voteSummary.noCount;
}

export function IdeaBoardPageView({
  ideas,
  lanes,
  timeline,
  activeLaneId,
  selectedIdea,
  isCreateModalOpen,
  createDraft,
  voteDraft,
  createError,
  voteError,
  deleteError,
  moveError,
  notifyError,
  toastMessage,
  isIdeasLoading,
  isIdeaLoading,
  isCreating,
  isVoting,
  isDeleting,
  isMoving,
  isNotifying,
  onActiveLaneChange,
  onCreateDraftChange,
  onVoteDraftChange,
  onOpenCreateModal,
  onCloseCreateModal,
  onCreateIdea,
  onDeleteIdea,
  onMoveIdea,
  onNotifyWhatsapp,
  onSubmitVote,
  onSelectIdea,
  onCloseIdea,
  onDismissToast,
}: IdeaBoardPageViewProps) {
  const [draggedIdeaId, setDraggedIdeaId] = useState<string | null>(null);
  const [dropLaneId, setDropLaneId] = useState<IdeaBoardColumnId | null>(null);
  const canvasLanes = useMemo(
    () => lanes.filter((lane): lane is IdeaBoardLane & { id: Exclude<IdeaBoardLaneId, "ALL"> } => lane.id !== "ALL"),
    [lanes],
  );
  const boardLanes = useMemo(() => {
    if (activeLaneId === "ALL") {
      return canvasLanes;
    }

    const activeCanvasLane = canvasLanes.find((lane) => lane.id === activeLaneId);
    if (!activeCanvasLane) {
      return canvasLanes;
    }

    return [activeCanvasLane, ...canvasLanes.filter((lane) => lane.id !== activeLaneId)];
  }, [activeLaneId, canvasLanes]);

  const activeLane = useMemo(
    () => lanes.find((lane) => lane.id === activeLaneId) ?? lanes[0],
    [activeLaneId, lanes],
  );

  const selectedLaneId = selectedIdea ? getIdeaLaneId(selectedIdea) : null;
  const selectedLaneTitle = selectedLaneId ? getIdeaLaneTitle(selectedLaneId) : null;

  const totalVotes = ideas.reduce((total, idea) => total + idea.voteSummary.totalVotes, 0);
  const totalComments = ideas.reduce((total, idea) => total + idea.feedbackCount, 0);
  const maxTimelineValue = Math.max(...timeline.map((point) => point.totalCount), 1);
  const freshIdeasCount = canvasLanes.find((lane) => lane.id === "INBOX")?.items.length ?? 0;

  function handleCardDragStart(event: ReactDragEvent<HTMLButtonElement>, ideaId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ideaId);
    setDraggedIdeaId(ideaId);
  }

  function handleCardDragEnd() {
    setDraggedIdeaId(null);
    setDropLaneId(null);
  }

  function handleColumnDragOver(event: ReactDragEvent<HTMLElement>, laneId: IdeaBoardColumnId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropLaneId !== laneId) {
      setDropLaneId(laneId);
    }
  }

  function handleColumnDrop(event: ReactDragEvent<HTMLElement>, laneId: IdeaBoardColumnId) {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("text/plain") || draggedIdeaId;
    setDropLaneId(null);
    setDraggedIdeaId(null);

    if (!draggedId) {
      return;
    }

    const draggedIdea = ideas.find((idea) => idea.id === draggedId);
    if (!draggedIdea) {
      return;
    }

    const currentLaneId = getIdeaLaneId(draggedIdea) as IdeaBoardColumnId;
    if (currentLaneId === laneId) {
      return;
    }

    onMoveIdea(draggedId, laneId);
  }

  return (
    <div className="page-stack idea-canvas-page">
      <section className="panel idea-canvas-dashboard">
        <div className="idea-canvas-dashboard-top">
          <div className="idea-canvas-heading">
            <p className="eyebrow">Ideias / Votacao</p>
            <h2 className="premium-header-title">Mural em canvas para acompanhar o consenso do time</h2>
            <p className="panel-subcopy">
              O mural mostra so a leitura agregada. O voto acontece no pop-up e fecha depois de salvar.
            </p>
          </div>

          <div className="idea-canvas-dashboard-actions">
            <div className="idea-canvas-metrics">
              <span className="tag subtle">{formatNumber(ideas.length)} ideias</span>
              <span className="tag subtle">{formatNumber(totalVotes)} votos</span>
              <span className="tag subtle">{formatNumber(totalComments)} comentarios</span>
            </div>

            <button className="primary-button" type="button" onClick={onOpenCreateModal}>
              <Plus size={16} />
              Nova ideia
            </button>
          </div>
        </div>

        <div className="idea-canvas-dashboard-bottom">
          <div className="idea-canvas-timeline">
            <div className="idea-canvas-section-title">
              <span>Volume de ideias ao longo do tempo</span>
              <small>Total acumulado por dia</small>
            </div>

            <div className="idea-canvas-timeline-bars">
              {timeline.map((point) => (
                <div key={point.key} className="idea-canvas-timeline-point">
                  <div className="idea-canvas-timeline-rail">
                    <span
                      className="idea-canvas-timeline-fill"
                      style={{ height: `${Math.max(12, (point.totalCount / maxTimelineValue) * 100)}%` }}
                    />
                  </div>
                  <strong>{formatNumber(point.totalCount)}</strong>
                  <small>{point.label}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="idea-canvas-filters">
            <div className="idea-canvas-section-title">
              <span>Leituras do mural</span>
              <small>{activeLane?.description}</small>
            </div>

            <div className="idea-canvas-filter-list">
              {lanes.map((lane) => (
                <button
                  key={lane.id}
                  type="button"
                  className={`idea-canvas-filter ${activeLaneId === lane.id ? "active" : ""}`}
                  onClick={() => onActiveLaneChange(lane.id)}
                >
                  <strong>{lane.title}</strong>
                  <span>{formatNumber(lane.items.length)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel idea-canvas-stage">
        <div className="idea-canvas-stage-top">
          <div className="idea-canvas-stage-copy">
            <p className="eyebrow">Quadro</p>
            <h3>Board em colunas no modelo Trello</h3>
            <p className="panel-subcopy">
              Toda ideia nova fica 24h em &quot;Novas na mesa&quot; e depois vai automaticamente para a coluna com mais votos.
            </p>
          </div>

          <div className="idea-canvas-stage-actions">
            <span className="tag subtle">4 colunas</span>
            <span className="tag subtle">Novas na mesa por 24h</span>
            <span className="tag subtle">{formatNumber(freshIdeasCount)} novas agora</span>
          </div>
        </div>

        {isIdeasLoading ? <div className="page-loading">Carregando mural...</div> : null}

        {!isIdeasLoading && !ideas.length ? (
          <div className="empty-state">Nenhuma ideia no mural ainda. Publique a primeira para abrir a rodada.</div>
        ) : null}

        {!isIdeasLoading && ideas.length ? (
          <div className="idea-canvas-scroll">
            {moveError ? <div className="inline-error idea-board-error">{moveError}</div> : null}
            <div className="idea-board-columns">
              {boardLanes.map((lane) => {
                const isActiveColumn = activeLaneId === "ALL" || activeLaneId === lane.id;
                const isDimmed = activeLaneId !== "ALL" && activeLaneId !== lane.id;
                const isDropTarget = dropLaneId === lane.id;

                return (
                  <section
                    key={lane.id}
                    className={`idea-board-column ${lane.accentClassName} ${isActiveColumn ? "active" : ""} ${isDimmed ? "dimmed" : ""} ${isDropTarget ? "drop-target" : ""}`}
                    onDragOver={(event) => handleColumnDragOver(event, lane.id)}
                    onDragEnter={(event) => handleColumnDragOver(event, lane.id)}
                    onDragLeave={() => {
                      if (dropLaneId === lane.id) {
                        setDropLaneId(null);
                      }
                    }}
                    onDrop={(event) => handleColumnDrop(event, lane.id)}
                  >
                    <div className="idea-board-column-head">
                      <div className="idea-board-column-copy">
                        <div className="idea-canvas-zone-label">
                          <span className="tag">{lane.title}</span>
                          <strong>{formatNumber(lane.items.length)} cards</strong>
                        </div>
                        <small>{lane.description}</small>
                      </div>
                    </div>

                    <div className="idea-board-column-list">
                      {lane.items.length ? (
                        lane.items.map((idea) => {
                          const isFreshIdea = isIdeaInInboxWindow(idea);
                          const inboxDeadline = isFreshIdea ? getIdeaInboxDeadline(idea) : null;
                          const isDragging = draggedIdeaId === idea.id;
                          const isManuallyPlaced = hasIdeaLaneOverride(idea);

                          return (
                            <button
                              key={idea.id}
                              type="button"
                              className={`idea-board-card ${isDragging ? "dragging" : ""}`}
                              onClick={() => onSelectIdea(idea.id)}
                              draggable={!isMoving}
                              onDragStart={(event) => handleCardDragStart(event, idea.id)}
                              onDragEnd={handleCardDragEnd}
                            >
                              <div className="idea-canvas-note-top">
                                <span className="tag">{idea.authorDisplayName}</span>
                                <span className="tag subtle">{isFreshIdea ? "Nova ideia" : lane.title}</span>
                              </div>

                              <div className="idea-canvas-note-copy">
                                <strong>{idea.title}</strong>
                                <p>{truncateIdeaCopy(idea.description, 135)}</p>
                              </div>
                              {isManuallyPlaced ? (
                                <div className="idea-board-card-hint subtle">Coluna ajustada manualmente por arraste.</div>
                              ) : null}

                              <div className="idea-canvas-note-votes">
                                {ideaVoteOptions.map((item) => (
                                  <div key={item.option} className="idea-canvas-vote-pill">
                                    <span className={`idea-canvas-vote-dot ${voteTone(item.option)}`} />
                                    <small>{formatNumber(voteCountForOption(idea, item.option))}</small>
                                  </div>
                                ))}
                              </div>

                              <div className="idea-canvas-note-footer">
                                <small>{formatNumber(idea.feedbackCount)} comentarios</small>
                                <small>{formatDateTime(idea.updatedAt)}</small>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="idea-board-column-empty">Nenhum card nesta coluna por enquanto.</div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {isCreateModalOpen ? (
        <div className="idea-modal-backdrop" onClick={onCloseCreateModal}>
          <section className="idea-modal" onClick={(event) => event.stopPropagation()}>
            <div className="idea-modal-header">
              <div>
                <p className="eyebrow">Nova ideia</p>
                <h3>Adicionar ao mural</h3>
              </div>

              <button type="button" className="ghost-button icon-only" onClick={onCloseCreateModal}>
                <X size={16} />
              </button>
            </div>

            <div className="idea-modal-body">
              <label>
                Titulo
                <input
                  value={createDraft.title}
                  onChange={(event) => onCreateDraftChange({ ...createDraft, title: event.target.value })}
                  placeholder="Ex: Melhorar aprovacao de campanhas"
                />
              </label>

              <label>
                Descricao
                <textarea
                  rows={5}
                  value={createDraft.description}
                  onChange={(event) => onCreateDraftChange({ ...createDraft, description: event.target.value })}
                  placeholder="Explique a dor e o que essa ideia muda."
                />
              </label>

              <label className="idea-checkbox">
                <input
                  type="checkbox"
                  checked={createDraft.isAnonymous}
                  onChange={(event) =>
                    onCreateDraftChange({
                      ...createDraft,
                      isAnonymous: event.target.checked,
                      authorDisplayName: event.target.checked ? "" : createDraft.authorDisplayName,
                    })
                  }
                />
                <span>Publicar de forma anonima</span>
              </label>

              {!createDraft.isAnonymous ? (
                <label>
                  Nome para exibir
                  <input
                    value={createDraft.authorDisplayName}
                    onChange={(event) => onCreateDraftChange({ ...createDraft, authorDisplayName: event.target.value })}
                    placeholder="Ex: Time Comercial"
                  />
                </label>
              ) : (
                <div className="idea-modal-note">A autoria publica fica como Anonimo no mural.</div>
              )}

              {createError ? <div className="inline-error">{createError}</div> : null}
            </div>

            <div className="idea-modal-footer">
              <button className="ghost-button" type="button" onClick={onCloseCreateModal}>
                Cancelar
              </button>
              <button className="primary-button" type="button" onClick={onCreateIdea} disabled={isCreating}>
                {isCreating ? "Publicando..." : "Salvar ideia"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedIdea || isIdeaLoading ? (
        <div className="idea-modal-backdrop" onClick={onCloseIdea}>
          <section className="idea-modal idea-vote-modal" onClick={(event) => event.stopPropagation()}>
            <div className="idea-modal-header">
              <div>
                <p className="eyebrow">Votacao anonima</p>
                <h3>{selectedIdea?.title ?? "Abrindo ideia..."}</h3>
              </div>

              <div className="idea-modal-header-actions">
                {selectedIdea ? <span className="tag">{formatIdeaStatus(selectedIdea.status)}</span> : null}
                <button type="button" className="ghost-button icon-only" onClick={onCloseIdea}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {isIdeaLoading ? <div className="page-loading">Carregando ideia...</div> : null}

            {selectedIdea ? (
              <>
                <div className="idea-modal-body">
                  <div className="idea-modal-meta">
                    <span className="tag">{selectedIdea.authorDisplayName}</span>
                    {selectedLaneTitle ? <span className="tag subtle">{selectedLaneTitle}</span> : null}
                    <span className="tag subtle">{formatNumber(selectedIdea.feedbackCount)} comentarios</span>
                  </div>

                  <p className="idea-modal-description">{selectedIdea.description}</p>

                  <div className="idea-modal-summary">
                    {ideaVoteOptions.map((item) => (
                      <div key={item.option} className={`idea-modal-summary-card ${voteTone(item.option)}`}>
                        <div className="idea-canvas-vote-pill">
                          <span className={`idea-canvas-vote-dot ${voteTone(item.option)}`} />
                          <strong>{formatNumber(voteCountForOption(selectedIdea, item.option))}</strong>
                        </div>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="idea-modal-vote">
                    <div className="idea-canvas-section-title">
                      <span>Registrar voto</span>
                      <small>Nada no mural mostra qual opcao voce escolheu.</small>
                    </div>

                    <div className="idea-modal-vote-options">
                      {ideaVoteOptions.map((item) => (
                        <button
                          key={item.option}
                          type="button"
                          className={`idea-modal-vote-option ${voteDraft.option === item.option ? "active" : ""}`}
                          onClick={() => onVoteDraftChange({ ...voteDraft, option: item.option })}
                        >
                          <strong>{item.label}</strong>
                          <span>{item.description}</span>
                        </button>
                      ))}
                    </div>

                    <label>
                      Comentario anonimo
                      <textarea
                        rows={4}
                        value={voteDraft.comment}
                        onChange={(event) => onVoteDraftChange({ ...voteDraft, comment: event.target.value })}
                        placeholder="Se quiser, complemente seu voto com contexto."
                      />
                    </label>

                    {voteError ? <div className="inline-error">{voteError}</div> : null}
                    {notifyError ? <div className="inline-error">{notifyError}</div> : null}
                    {deleteError ? <div className="inline-error">{deleteError}</div> : null}
                  </div>

                  <div className="idea-modal-feedback">
                    <div className="idea-canvas-section-title">
                      <span>Comentarios anonimos</span>
                      <small>Leitura do time em formato aberto.</small>
                    </div>

                    {selectedIdea.feedbacks.length ? (
                      <div className="idea-modal-feedback-list">
                        {selectedIdea.feedbacks.map((feedback) => (
                          <article key={feedback.id} className="idea-modal-feedback-item">
                            <div className="idea-modal-feedback-top">
                              <span className="tag subtle">Anonimo</span>
                              <span className="tag">{formatIdeaVoteOption(feedback.option)}</span>
                            </div>
                            <p>{feedback.comment}</p>
                            <small>{formatDateTime(feedback.updatedAt)}</small>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">Ainda nao tem comentarios nessa ideia.</div>
                    )}
                  </div>
                </div>

                <div className="idea-modal-footer">
                  <div className="idea-modal-footer-left">
                    <button
                      className="success-button"
                      type="button"
                      onClick={onNotifyWhatsapp}
                      disabled={isNotifying}
                    >
                      <BellRing size={16} />
                      {isNotifying ? "Avisando..." : "Avisar time no WhatsApp"}
                    </button>

                    {selectedIdea.canDelete ? (
                      <button className="ghost-button danger" type="button" onClick={onDeleteIdea} disabled={isDeleting}>
                        <Trash2 size={16} />
                        {isDeleting ? "Excluindo..." : "Excluir"}
                      </button>
                    ) : null}
                  </div>

                  <button
                    className="primary-button"
                    type="button"
                    onClick={onSubmitVote}
                    disabled={isVoting || !voteDraft.option}
                  >
                    {isVoting ? "Salvando..." : "Salvar voto anonimo"}
                  </button>
                </div>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="idea-canvas-toast">
          <span>{toastMessage}</span>
          <button type="button" className="ghost-button icon-only" onClick={onDismissToast}>
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
