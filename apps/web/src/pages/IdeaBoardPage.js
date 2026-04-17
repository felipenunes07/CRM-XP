import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { IdeaBoardPageView } from "./IdeaBoardPageView";
import { buildIdeaBoardLanes, buildIdeaCreatePayload, buildIdeaTimeline, buildIdeaVotePayload, emptyIdeaCreateDraft, emptyIdeaVoteDraft, } from "./ideaBoardPage.helpers";
export function IdeaBoardPage() {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const [selectedIdeaId, setSelectedIdeaId] = useState(null);
    const [activeLaneId, setActiveLaneId] = useState("ALL");
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createDraft, setCreateDraft] = useState(emptyIdeaCreateDraft);
    const [voteDraft, setVoteDraft] = useState(emptyIdeaVoteDraft);
    const [createError, setCreateError] = useState(null);
    const [voteError, setVoteError] = useState(null);
    const [deleteError, setDeleteError] = useState(null);
    const [notifyError, setNotifyError] = useState(null);
    const [toastMessage, setToastMessage] = useState(null);
    const ideasQuery = useQuery({
        queryKey: ["idea-board"],
        queryFn: () => api.listIdeas(token),
        enabled: Boolean(token),
    });
    const selectedIdeaQuery = useQuery({
        queryKey: ["idea-board", selectedIdeaId],
        queryFn: () => api.getIdea(token, selectedIdeaId),
        enabled: Boolean(token && selectedIdeaId),
    });
    useEffect(() => {
        if (activeLaneId !== "ALL" && !buildIdeaBoardLanes(ideasQuery.data ?? []).find((lane) => lane.id === activeLaneId)?.items.length) {
            setActiveLaneId("ALL");
        }
    }, [activeLaneId, ideasQuery.data]);
    useEffect(() => {
        setVoteDraft(emptyIdeaVoteDraft);
        setVoteError(null);
        setDeleteError(null);
        setNotifyError(null);
    }, [selectedIdeaId]);
    const lanes = useMemo(() => buildIdeaBoardLanes(ideasQuery.data ?? []), [ideasQuery.data]);
    const timeline = useMemo(() => buildIdeaTimeline(ideasQuery.data ?? []), [ideasQuery.data]);
    const createMutation = useMutation({
        mutationFn: (payload) => api.createIdea(token, payload),
        onSuccess: async (created) => {
            setCreateDraft(emptyIdeaCreateDraft);
            setCreateError(null);
            setIsCreateModalOpen(false);
            setActiveLaneId("ALL");
            setToastMessage("Ideia publicada no mural. Abra o card e use o botao verde para avisar o time no WhatsApp.");
            queryClient.setQueryData(["idea-board", created.id], created);
            queryClient.setQueryData(["idea-board"], (current) => {
                if (!current?.length) {
                    return [created];
                }
                return [created, ...current.filter((idea) => idea.id !== created.id)];
            });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["idea-board"] }),
                queryClient.invalidateQueries({ queryKey: ["idea-board", created.id] }),
            ]);
        },
    });
    const voteMutation = useMutation({
        mutationFn: (payload) => api.submitIdeaVote(token, selectedIdeaId, payload),
        onSuccess: async (detail) => {
            setVoteDraft(emptyIdeaVoteDraft);
            setVoteError(null);
            setDeleteError(null);
            setSelectedIdeaId(null);
            setToastMessage("Voto salvo anonimamente.");
            queryClient.setQueryData(["idea-board", detail.id], detail);
            queryClient.setQueryData(["idea-board"], (current) => {
                if (!current?.length) {
                    return [detail];
                }
                const nextIdeas = current.map((idea) => (idea.id === detail.id ? detail : idea));
                return nextIdeas.some((idea) => idea.id === detail.id) ? nextIdeas : [detail, ...current];
            });
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["idea-board"] }),
                queryClient.invalidateQueries({ queryKey: ["idea-board", detail.id] }),
            ]);
        },
    });
    const deleteMutation = useMutation({
        mutationFn: (ideaId) => api.deleteIdea(token, ideaId),
        onSuccess: async (_, ideaId) => {
            setDeleteError(null);
            setSelectedIdeaId(null);
            setToastMessage("Ideia removida do mural.");
            queryClient.setQueryData(["idea-board"], (current) => current?.filter((idea) => idea.id !== ideaId) ?? []);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["idea-board"] }),
                queryClient.invalidateQueries({ queryKey: ["idea-board", ideaId] }),
            ]);
        },
    });
    const notifyMutation = useMutation({
        mutationFn: (ideaId) => api.notifyIdeaWhatsapp(token, ideaId),
        onSuccess: () => {
            setNotifyError(null);
            setToastMessage("Aviso enviado para o grupo MIDIAS no WhatsApp.");
        },
    });
    function handleOpenCreateModal() {
        setCreateError(null);
        setIsCreateModalOpen(true);
    }
    function handleCloseCreateModal() {
        setCreateError(null);
        setCreateDraft(emptyIdeaCreateDraft);
        setIsCreateModalOpen(false);
    }
    function handleCreateIdea() {
        try {
            const payload = buildIdeaCreatePayload(createDraft);
            setCreateError(null);
            createMutation.mutate(payload);
        }
        catch (error) {
            setCreateError(error instanceof Error ? error.message : "Nao foi possivel publicar a ideia.");
        }
    }
    function handleSelectIdea(ideaId) {
        setSelectedIdeaId(ideaId);
    }
    function handleCloseIdea() {
        setSelectedIdeaId(null);
    }
    function handleSubmitVote() {
        try {
            if (!selectedIdeaId) {
                throw new Error("Selecione uma ideia antes de votar.");
            }
            const payload = buildIdeaVotePayload(voteDraft);
            setVoteError(null);
            voteMutation.mutate(payload);
        }
        catch (error) {
            setVoteError(error instanceof Error ? error.message : "Nao foi possivel salvar o voto.");
        }
    }
    function handleDeleteIdea() {
        if (!selectedIdeaQuery.data?.id) {
            setDeleteError("Abra uma ideia antes de excluir.");
            return;
        }
        const confirmed = typeof window === "undefined"
            ? true
            : window.confirm(`Excluir a ideia "${selectedIdeaQuery.data.title}"? Essa acao nao pode ser desfeita.`);
        if (!confirmed) {
            return;
        }
        setDeleteError(null);
        deleteMutation.mutate(selectedIdeaQuery.data.id);
    }
    function handleNotifyWhatsapp() {
        if (!selectedIdeaQuery.data?.id) {
            setNotifyError("Abra uma ideia antes de avisar o time.");
            return;
        }
        setNotifyError(null);
        notifyMutation.mutate(selectedIdeaQuery.data.id);
    }
    return (_jsx(IdeaBoardPageView, { ideas: ideasQuery.data ?? [], lanes: lanes, timeline: timeline, activeLaneId: activeLaneId, selectedIdea: selectedIdeaQuery.data ?? null, isCreateModalOpen: isCreateModalOpen, createDraft: createDraft, voteDraft: voteDraft, createError: createError ?? (createMutation.isError ? createMutation.error.message : null), voteError: voteError ?? (voteMutation.isError ? voteMutation.error.message : null), deleteError: deleteError ?? (deleteMutation.isError ? deleteMutation.error.message : null), notifyError: notifyError ?? (notifyMutation.isError ? notifyMutation.error.message : null), toastMessage: toastMessage, isIdeasLoading: ideasQuery.isLoading, isIdeaLoading: Boolean(selectedIdeaId) && selectedIdeaQuery.isLoading, isCreating: createMutation.isPending, isVoting: voteMutation.isPending, isDeleting: deleteMutation.isPending, isNotifying: notifyMutation.isPending, onActiveLaneChange: setActiveLaneId, onCreateDraftChange: setCreateDraft, onVoteDraftChange: setVoteDraft, onOpenCreateModal: handleOpenCreateModal, onCloseCreateModal: handleCloseCreateModal, onCreateIdea: handleCreateIdea, onDeleteIdea: handleDeleteIdea, onNotifyWhatsapp: handleNotifyWhatsapp, onSubmitVote: handleSubmitVote, onSelectIdea: handleSelectIdea, onCloseIdea: handleCloseIdea, onDismissToast: () => setToastMessage(null) }));
}
