import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { BellRing, Plus, Trash2, X } from "lucide-react";
import { hasIdeaLaneOverride, formatIdeaStatus, formatIdeaVoteOption, getIdeaInboxDeadline, getIdeaLaneId, getIdeaLaneTitle, isIdeaInInboxWindow, ideaVoteOptions, truncateIdeaCopy, } from "./ideaBoardPage.helpers";
import { formatDateTime, formatNumber } from "../lib/format";
function voteTone(option) {
    if (option === "LIKE")
        return "success";
    if (option === "NO")
        return "danger";
    return "warning";
}
function voteCountForOption(idea, option) {
    if (option === "LIKE")
        return idea.voteSummary.likeCount;
    if (option === "MAYBE")
        return idea.voteSummary.maybeCount;
    return idea.voteSummary.noCount;
}
export function IdeaBoardPageView({ ideas, lanes, timeline, activeLaneId, selectedIdea, isCreateModalOpen, createDraft, voteDraft, createError, voteError, deleteError, moveError, notifyError, toastMessage, isIdeasLoading, isIdeaLoading, isCreating, isVoting, isDeleting, isMoving, isNotifying, onActiveLaneChange, onCreateDraftChange, onVoteDraftChange, onOpenCreateModal, onCloseCreateModal, onCreateIdea, onDeleteIdea, onMoveIdea, onNotifyWhatsapp, onSubmitVote, onSelectIdea, onCloseIdea, onDismissToast, }) {
    const [draggedIdeaId, setDraggedIdeaId] = useState(null);
    const [dropLaneId, setDropLaneId] = useState(null);
    const canvasLanes = useMemo(() => lanes.filter((lane) => lane.id !== "ALL"), [lanes]);
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
    const activeLane = useMemo(() => lanes.find((lane) => lane.id === activeLaneId) ?? lanes[0], [activeLaneId, lanes]);
    const selectedLaneId = selectedIdea ? getIdeaLaneId(selectedIdea) : null;
    const selectedLaneTitle = selectedLaneId ? getIdeaLaneTitle(selectedLaneId) : null;
    const totalVotes = ideas.reduce((total, idea) => total + idea.voteSummary.totalVotes, 0);
    const totalComments = ideas.reduce((total, idea) => total + idea.feedbackCount, 0);
    const maxTimelineValue = Math.max(...timeline.map((point) => point.totalCount), 1);
    const freshIdeasCount = canvasLanes.find((lane) => lane.id === "INBOX")?.items.length ?? 0;
    function handleCardDragStart(event, ideaId) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", ideaId);
        setDraggedIdeaId(ideaId);
    }
    function handleCardDragEnd() {
        setDraggedIdeaId(null);
        setDropLaneId(null);
    }
    function handleColumnDragOver(event, laneId) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (dropLaneId !== laneId) {
            setDropLaneId(laneId);
        }
    }
    function handleColumnDrop(event, laneId) {
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
        const currentLaneId = getIdeaLaneId(draggedIdea);
        if (currentLaneId === laneId) {
            return;
        }
        onMoveIdea(draggedId, laneId);
    }
    return (_jsxs("div", { className: "page-stack idea-canvas-page", children: [_jsxs("section", { className: "panel idea-canvas-dashboard", children: [_jsxs("div", { className: "idea-canvas-dashboard-top", children: [_jsxs("div", { className: "idea-canvas-heading", children: [_jsx("p", { className: "eyebrow", children: "Ideias / Votacao" }), _jsx("h2", { className: "premium-header-title", children: "Mural em canvas para acompanhar o consenso do time" }), _jsx("p", { className: "panel-subcopy", children: "O mural mostra so a leitura agregada. O voto acontece no pop-up e fecha depois de salvar." })] }), _jsxs("div", { className: "idea-canvas-dashboard-actions", children: [_jsxs("div", { className: "idea-canvas-metrics", children: [_jsxs("span", { className: "tag subtle", children: [formatNumber(ideas.length), " ideias"] }), _jsxs("span", { className: "tag subtle", children: [formatNumber(totalVotes), " votos"] }), _jsxs("span", { className: "tag subtle", children: [formatNumber(totalComments), " comentarios"] })] }), _jsxs("button", { className: "primary-button", type: "button", onClick: onOpenCreateModal, children: [_jsx(Plus, { size: 16 }), "Nova ideia"] })] })] }), _jsxs("div", { className: "idea-canvas-dashboard-bottom", children: [_jsxs("div", { className: "idea-canvas-timeline", children: [_jsxs("div", { className: "idea-canvas-section-title", children: [_jsx("span", { children: "Volume de ideias ao longo do tempo" }), _jsx("small", { children: "Total acumulado por dia" })] }), _jsx("div", { className: "idea-canvas-timeline-bars", children: timeline.map((point) => (_jsxs("div", { className: "idea-canvas-timeline-point", children: [_jsx("div", { className: "idea-canvas-timeline-rail", children: _jsx("span", { className: "idea-canvas-timeline-fill", style: { height: `${Math.max(12, (point.totalCount / maxTimelineValue) * 100)}%` } }) }), _jsx("strong", { children: formatNumber(point.totalCount) }), _jsx("small", { children: point.label })] }, point.key))) })] }), _jsxs("div", { className: "idea-canvas-filters", children: [_jsxs("div", { className: "idea-canvas-section-title", children: [_jsx("span", { children: "Leituras do mural" }), _jsx("small", { children: activeLane?.description })] }), _jsx("div", { className: "idea-canvas-filter-list", children: lanes.map((lane) => (_jsxs("button", { type: "button", className: `idea-canvas-filter ${activeLaneId === lane.id ? "active" : ""}`, onClick: () => onActiveLaneChange(lane.id), children: [_jsx("strong", { children: lane.title }), _jsx("span", { children: formatNumber(lane.items.length) })] }, lane.id))) })] })] })] }), _jsxs("section", { className: "panel idea-canvas-stage", children: [_jsxs("div", { className: "idea-canvas-stage-top", children: [_jsxs("div", { className: "idea-canvas-stage-copy", children: [_jsx("p", { className: "eyebrow", children: "Quadro" }), _jsx("h3", { children: "Board em colunas no modelo Trello" }), _jsx("p", { className: "panel-subcopy", children: "Toda ideia nova fica 24h em \"Novas na mesa\" e depois vai automaticamente para a coluna com mais votos." })] }), _jsxs("div", { className: "idea-canvas-stage-actions", children: [_jsx("span", { className: "tag subtle", children: "4 colunas" }), _jsx("span", { className: "tag subtle", children: "Novas na mesa por 24h" }), _jsxs("span", { className: "tag subtle", children: [formatNumber(freshIdeasCount), " novas agora"] })] })] }), isIdeasLoading ? _jsx("div", { className: "page-loading", children: "Carregando mural..." }) : null, !isIdeasLoading && !ideas.length ? (_jsx("div", { className: "empty-state", children: "Nenhuma ideia no mural ainda. Publique a primeira para abrir a rodada." })) : null, !isIdeasLoading && ideas.length ? (_jsxs("div", { className: "idea-canvas-scroll", children: [moveError ? _jsx("div", { className: "inline-error idea-board-error", children: moveError }) : null, _jsx("div", { className: "idea-board-columns", children: boardLanes.map((lane) => {
                                    const isActiveColumn = activeLaneId === "ALL" || activeLaneId === lane.id;
                                    const isDimmed = activeLaneId !== "ALL" && activeLaneId !== lane.id;
                                    const isDropTarget = dropLaneId === lane.id;
                                    return (_jsxs("section", { className: `idea-board-column ${lane.accentClassName} ${isActiveColumn ? "active" : ""} ${isDimmed ? "dimmed" : ""} ${isDropTarget ? "drop-target" : ""}`, onDragOver: (event) => handleColumnDragOver(event, lane.id), onDragEnter: (event) => handleColumnDragOver(event, lane.id), onDragLeave: () => {
                                            if (dropLaneId === lane.id) {
                                                setDropLaneId(null);
                                            }
                                        }, onDrop: (event) => handleColumnDrop(event, lane.id), children: [_jsx("div", { className: "idea-board-column-head", children: _jsxs("div", { className: "idea-board-column-copy", children: [_jsxs("div", { className: "idea-canvas-zone-label", children: [_jsx("span", { className: "tag", children: lane.title }), _jsxs("strong", { children: [formatNumber(lane.items.length), " cards"] })] }), _jsx("small", { children: lane.description })] }) }), _jsx("div", { className: "idea-board-column-list", children: lane.items.length ? (lane.items.map((idea) => {
                                                    const isFreshIdea = isIdeaInInboxWindow(idea);
                                                    const inboxDeadline = isFreshIdea ? getIdeaInboxDeadline(idea) : null;
                                                    const isDragging = draggedIdeaId === idea.id;
                                                    const isManuallyPlaced = hasIdeaLaneOverride(idea);
                                                    return (_jsxs("button", { type: "button", className: `idea-board-card ${isDragging ? "dragging" : ""}`, onClick: () => onSelectIdea(idea.id), draggable: !isMoving, onDragStart: (event) => handleCardDragStart(event, idea.id), onDragEnd: handleCardDragEnd, children: [_jsxs("div", { className: "idea-canvas-note-top", children: [_jsx("span", { className: "tag", children: idea.authorDisplayName }), _jsx("span", { className: "tag subtle", children: isFreshIdea ? "Nova ideia" : lane.title })] }), _jsxs("div", { className: "idea-canvas-note-copy", children: [_jsx("strong", { children: idea.title }), _jsx("p", { children: truncateIdeaCopy(idea.description, 135) })] }), inboxDeadline ? (_jsxs("div", { className: "idea-board-card-hint", children: ["Fica em novas ideias ate ", formatDateTime(inboxDeadline)] })) : null, isManuallyPlaced ? (_jsx("div", { className: "idea-board-card-hint subtle", children: "Coluna ajustada manualmente por arraste." })) : null, _jsx("div", { className: "idea-canvas-note-votes", children: ideaVoteOptions.map((item) => (_jsxs("div", { className: "idea-canvas-vote-pill", children: [_jsx("span", { className: `idea-canvas-vote-dot ${voteTone(item.option)}` }), _jsx("small", { children: formatNumber(voteCountForOption(idea, item.option)) })] }, item.option))) }), _jsxs("div", { className: "idea-canvas-note-footer", children: [_jsxs("small", { children: [formatNumber(idea.feedbackCount), " comentarios"] }), _jsx("small", { children: formatDateTime(idea.updatedAt) })] })] }, idea.id));
                                                })) : (_jsx("div", { className: "idea-board-column-empty", children: "Nenhum card nesta coluna por enquanto." })) })] }, lane.id));
                                }) })] })) : null] }), isCreateModalOpen ? (_jsx("div", { className: "idea-modal-backdrop", onClick: onCloseCreateModal, children: _jsxs("section", { className: "idea-modal", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "idea-modal-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Nova ideia" }), _jsx("h3", { children: "Adicionar ao mural" })] }), _jsx("button", { type: "button", className: "ghost-button icon-only", onClick: onCloseCreateModal, children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "idea-modal-body", children: [_jsxs("label", { children: ["Titulo", _jsx("input", { value: createDraft.title, onChange: (event) => onCreateDraftChange({ ...createDraft, title: event.target.value }), placeholder: "Ex: Melhorar aprovacao de campanhas" })] }), _jsxs("label", { children: ["Descricao", _jsx("textarea", { rows: 5, value: createDraft.description, onChange: (event) => onCreateDraftChange({ ...createDraft, description: event.target.value }), placeholder: "Explique a dor e o que essa ideia muda." })] }), _jsxs("label", { className: "idea-checkbox", children: [_jsx("input", { type: "checkbox", checked: createDraft.isAnonymous, onChange: (event) => onCreateDraftChange({
                                                ...createDraft,
                                                isAnonymous: event.target.checked,
                                                authorDisplayName: event.target.checked ? "" : createDraft.authorDisplayName,
                                            }) }), _jsx("span", { children: "Publicar de forma anonima" })] }), !createDraft.isAnonymous ? (_jsxs("label", { children: ["Nome para exibir", _jsx("input", { value: createDraft.authorDisplayName, onChange: (event) => onCreateDraftChange({ ...createDraft, authorDisplayName: event.target.value }), placeholder: "Ex: Time Comercial" })] })) : (_jsx("div", { className: "idea-modal-note", children: "A autoria publica fica como Anonimo no mural." })), createError ? _jsx("div", { className: "inline-error", children: createError }) : null] }), _jsxs("div", { className: "idea-modal-footer", children: [_jsx("button", { className: "ghost-button", type: "button", onClick: onCloseCreateModal, children: "Cancelar" }), _jsx("button", { className: "primary-button", type: "button", onClick: onCreateIdea, disabled: isCreating, children: isCreating ? "Publicando..." : "Salvar ideia" })] })] }) })) : null, selectedIdea || isIdeaLoading ? (_jsx("div", { className: "idea-modal-backdrop", onClick: onCloseIdea, children: _jsxs("section", { className: "idea-modal idea-vote-modal", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "idea-modal-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Votacao anonima" }), _jsx("h3", { children: selectedIdea?.title ?? "Abrindo ideia..." })] }), _jsxs("div", { className: "idea-modal-header-actions", children: [selectedIdea ? _jsx("span", { className: "tag", children: formatIdeaStatus(selectedIdea.status) }) : null, _jsx("button", { type: "button", className: "ghost-button icon-only", onClick: onCloseIdea, children: _jsx(X, { size: 16 }) })] })] }), isIdeaLoading ? _jsx("div", { className: "page-loading", children: "Carregando ideia..." }) : null, selectedIdea ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "idea-modal-body", children: [_jsxs("div", { className: "idea-modal-meta", children: [_jsx("span", { className: "tag", children: selectedIdea.authorDisplayName }), selectedLaneTitle ? _jsx("span", { className: "tag subtle", children: selectedLaneTitle }) : null, _jsxs("span", { className: "tag subtle", children: [formatNumber(selectedIdea.feedbackCount), " comentarios"] })] }), _jsx("p", { className: "idea-modal-description", children: selectedIdea.description }), _jsx("div", { className: "idea-modal-summary", children: ideaVoteOptions.map((item) => (_jsxs("div", { className: `idea-modal-summary-card ${voteTone(item.option)}`, children: [_jsxs("div", { className: "idea-canvas-vote-pill", children: [_jsx("span", { className: `idea-canvas-vote-dot ${voteTone(item.option)}` }), _jsx("strong", { children: formatNumber(voteCountForOption(selectedIdea, item.option)) })] }), _jsx("span", { children: item.label })] }, item.option))) }), _jsxs("div", { className: "idea-modal-vote", children: [_jsxs("div", { className: "idea-canvas-section-title", children: [_jsx("span", { children: "Registrar voto" }), _jsx("small", { children: "Nada no mural mostra qual opcao voce escolheu." })] }), _jsx("div", { className: "idea-modal-vote-options", children: ideaVoteOptions.map((item) => (_jsxs("button", { type: "button", className: `idea-modal-vote-option ${voteDraft.option === item.option ? "active" : ""}`, onClick: () => onVoteDraftChange({ ...voteDraft, option: item.option }), children: [_jsx("strong", { children: item.label }), _jsx("span", { children: item.description })] }, item.option))) }), _jsxs("label", { children: ["Comentario anonimo", _jsx("textarea", { rows: 4, value: voteDraft.comment, onChange: (event) => onVoteDraftChange({ ...voteDraft, comment: event.target.value }), placeholder: "Se quiser, complemente seu voto com contexto." })] }), voteError ? _jsx("div", { className: "inline-error", children: voteError }) : null, notifyError ? _jsx("div", { className: "inline-error", children: notifyError }) : null, deleteError ? _jsx("div", { className: "inline-error", children: deleteError }) : null] }), _jsxs("div", { className: "idea-modal-feedback", children: [_jsxs("div", { className: "idea-canvas-section-title", children: [_jsx("span", { children: "Comentarios anonimos" }), _jsx("small", { children: "Leitura do time em formato aberto." })] }), selectedIdea.feedbacks.length ? (_jsx("div", { className: "idea-modal-feedback-list", children: selectedIdea.feedbacks.map((feedback) => (_jsxs("article", { className: "idea-modal-feedback-item", children: [_jsxs("div", { className: "idea-modal-feedback-top", children: [_jsx("span", { className: "tag subtle", children: "Anonimo" }), _jsx("span", { className: "tag", children: formatIdeaVoteOption(feedback.option) })] }), _jsx("p", { children: feedback.comment }), _jsx("small", { children: formatDateTime(feedback.updatedAt) })] }, feedback.id))) })) : (_jsx("div", { className: "empty-state", children: "Ainda nao tem comentarios nessa ideia." }))] })] }), _jsxs("div", { className: "idea-modal-footer", children: [_jsxs("div", { className: "idea-modal-footer-left", children: [_jsxs("button", { className: "success-button", type: "button", onClick: onNotifyWhatsapp, disabled: isNotifying, children: [_jsx(BellRing, { size: 16 }), isNotifying ? "Avisando..." : "Avisar time no WhatsApp"] }), selectedIdea.canDelete ? (_jsxs("button", { className: "ghost-button danger", type: "button", onClick: onDeleteIdea, disabled: isDeleting, children: [_jsx(Trash2, { size: 16 }), isDeleting ? "Excluindo..." : "Excluir"] })) : null] }), _jsx("button", { className: "primary-button", type: "button", onClick: onSubmitVote, disabled: isVoting || !voteDraft.option, children: isVoting ? "Salvando..." : "Salvar voto anonimo" })] })] })) : null] }) })) : null, toastMessage ? (_jsxs("div", { className: "idea-canvas-toast", children: [_jsx("span", { children: toastMessage }), _jsx("button", { type: "button", className: "ghost-button icon-only", onClick: onDismissToast, children: _jsx(X, { size: 14 }) })] })) : null] }));
}
